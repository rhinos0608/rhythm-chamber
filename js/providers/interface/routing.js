/**
 * Provider Call Routing
 *
 * Routes LLM calls to appropriate provider with retry logic and rate limit handling.
 * Part of the refactored ProviderInterface module.
 *
 * @module providers/interface/routing
 */

import { withTimeout, TimeoutError } from '../../utils/timeout-wrapper.js';
import { ProviderHealthAuthority } from '../../services/provider-health-authority.js';
import { ModuleRegistry } from '../../module-registry.js';

import { PROVIDER_TIMEOUTS, RETRY_CONFIG } from './config.js';
import { isRetryableError, calculateRetryDelay, delay, extractRetryAfter } from './retry.js';
import { normalizeProviderError } from './errors.js';

// Import provider modules directly
import { OpenRouterProvider } from '../openrouter.js';
import { LMStudioProvider } from '../lmstudio.js';
import { GeminiProvider } from '../gemini.js';
import { OpenAICompatibleProvider } from '../openai-compatible.js';

/**
 * Get the provider module if loaded
 * @param {string} provider - Provider name
 * @returns {object|null} Provider module or null if not available
 */
function getProviderModule(provider) {
    switch (provider) {
        case 'ollama':
            return ModuleRegistry.getModuleSync('OllamaProvider') || null;
        case 'lmstudio':
            return LMStudioProvider || null;
        case 'gemini':
            return GeminiProvider || null;
        case 'openai-compatible':
            return OpenAICompatibleProvider || null;
        case 'openrouter':
        default:
            return OpenRouterProvider || null;
    }
}

/**
 * Route LLM calls to appropriate provider with retry logic and rate limit handling
 * @param {object} config - Provider config from buildProviderConfig
 * @param {string} apiKey - API key (for OpenRouter)
 * @param {Array} messages - Chat messages
 * @param {Array} tools - Function calling tools (optional)
 * @param {function} onProgress - Progress callback for streaming (optional)
 * @returns {Promise<object>} Response in OpenAI-compatible format
 */
export async function callProvider(config, apiKey, messages, tools, onProgress = null) {
    // Validate provider module is loaded
    const providerModule = getProviderModule(config.provider);
    if (!providerModule) {
        throw new Error(`Provider module '${config.provider}' not loaded`);
    }

    // MEDIUM FIX #16: Use endpoint-specific circuit breaker key
    // Previously circuit breaker was per-provider, which meant if one endpoint
    // (e.g., chat completions) was failing but others (e.g., models list) worked,
    // all requests would be blocked. Now we use endpoint-specific keys.
    // For chat completions, we use 'chat_completions:provider' format
    const circuitKey = `chat_completions:${config.provider}`;

    // HNW Network: Check circuit breaker before attempting call
    const circuitCheck = ProviderHealthAuthority.canExecute(circuitKey);
    if (!circuitCheck.allowed) {
        const error = new Error(circuitCheck.reason);
        error.type = 'circuit_open';
        error.provider = config.provider;
        error.endpoint = 'chat_completions';
        error.recoverable = true;
        error.cooldownRemaining = circuitCheck.cooldownRemaining;
        const timeMessage = circuitCheck.cooldownRemaining
            ? `Try again in ${Math.ceil(circuitCheck.cooldownRemaining / 1000)}s.`
            : 'Try a different provider.';
        error.suggestion = `${config.provider} chat completions is temporarily unavailable. ${timeMessage}`;
        throw error;
    }

    // Get appropriate timeout for provider type
    const timeoutMs =
        config.timeout || (config.isLocal ? PROVIDER_TIMEOUTS.local : PROVIDER_TIMEOUTS.cloud);

    // Execute with retry logic and exponential backoff
    let lastError;
    for (let attempt = 0; attempt <= RETRY_CONFIG.MAX_RETRIES; attempt++) {
        const startTime = Date.now();

        try {
            // Check circuit breaker before each attempt (using endpoint-specific key)
            const retryCheck = ProviderHealthAuthority.canExecute(circuitKey);
            if (!retryCheck.allowed) {
                throw new Error(retryCheck.reason);
            }

            const response = await withTimeout(
                async () => {
                    switch (config.provider) {
                        case 'ollama':
                            return await providerModule.call(config, messages, tools, onProgress);

                        case 'lmstudio':
                            return await providerModule.call(config, messages, tools, onProgress);

                        case 'gemini':
                            return await providerModule.call(
                                apiKey,
                                config,
                                messages,
                                tools,
                                onProgress
                            );

                        case 'openai-compatible':
                            return await providerModule.call(
                                apiKey,
                                config,
                                messages,
                                tools,
                                onProgress
                            );

                        case 'openrouter':
                        default:
                            return await providerModule.call(
                                apiKey,
                                config,
                                messages,
                                tools,
                                onProgress
                            );
                    }
                },
                timeoutMs,
                { operation: `${config.provider} LLM call` }
            );

            // Record success with duration (using endpoint-specific circuit key)
            const durationMs = Date.now() - startTime;
            ProviderHealthAuthority.recordSuccess(circuitKey, durationMs);

            // CRITICAL FIX #2: Validate full response structure
            // Prevents crashes when API returns empty or malformed responses
            if (!response || typeof response !== 'object') {
                throw new Error(`${config.provider} returned no response`);
            }
            if (!response.choices || !Array.isArray(response.choices)) {
                throw new Error(
                    `${config.provider} returned malformed response (missing choices array)`
                );
            }
            // Validate choices array is not empty
            if (response.choices.length === 0) {
                throw new Error(`${config.provider} returned empty choices array`);
            }
            // Validate first choice has message structure
            if (!response.choices[0]?.message) {
                throw new Error(
                    `${config.provider} returned malformed response (missing message in first choice)`
                );
            }
            // Validate message has content or tool_calls (at least one should be present)
            const message = response.choices[0].message;
            if (!message.content && !message.tool_calls) {
                // Empty response is valid for some models, but log it
                console.warn(
                    `[ProviderInterface] ${config.provider} returned response with no content or tool_calls`
                );
            }

            return response;
        } catch (error) {
            lastError = error;

            // Check if this is a rate limit error with Retry-After header
            if (error.message.includes('429') || error.message.includes('rate limit')) {
                const retryAfterMs = extractRetryAfter(error);
                if (retryAfterMs > 0) {
                    console.warn(
                        `[ProviderInterface] Rate limited by ${config.provider}, waiting ${retryAfterMs}ms`
                    );
                    await delay(retryAfterMs);
                    continue; // Retry immediately after waiting
                }
            }

            // Check if error is retryable and we have more attempts
            if (attempt < RETRY_CONFIG.MAX_RETRIES && isRetryableError(error)) {
                const retryDelay = calculateRetryDelay(attempt);
                console.warn(
                    `[ProviderInterface] Retryable error for ${config.provider} (attempt ${attempt + 1}/${RETRY_CONFIG.MAX_RETRIES + 1}): ${error.message}`
                );
                console.log(`[ProviderInterface] Waiting ${retryDelay}ms before retry...`);
                await delay(retryDelay);
                continue;
            }

            // Record failure for circuit breaker (using endpoint-specific circuit key)
            ProviderHealthAuthority.recordFailure(circuitKey, error.message);

            // Handle timeout with HNW-compliant recovery suggestion
            if (error instanceof TimeoutError) {
                const normalizedError = normalizeProviderError(error, config.provider);
                normalizedError.suggestion = config.isLocal
                    ? 'Your local LLM is taking too long. Try a smaller model or check system resources.'
                    : 'The API request timed out. Try again or switch to a different model.';
                throw normalizedError;
            }

            throw error;
        }
    }

    // If we exhausted all retries, throw the last error
    console.error(
        `[ProviderInterface] All ${RETRY_CONFIG.MAX_RETRIES + 1} attempts failed for ${config.provider}`
    );
    throw lastError;
}

export { getProviderModule };
