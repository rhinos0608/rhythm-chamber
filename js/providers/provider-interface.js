/**
 * LLM Provider Interface
 * 
 * Unified abstraction layer for all LLM providers (OpenRouter, Ollama, LM Studio).
 * Handles configuration building and request routing.
 * 
 * BRING YOUR OWN AI: Users choose their AI infrastructure - local or cloud.
 * Local AI (Ollama/LM Studio) provides maximum privacy with zero data transmission.
 * 
 * @module providers/provider-interface
 */

import { ModuleRegistry } from '../module-registry.js';
import { withTimeout, TimeoutError } from '../utils/timeout-wrapper.js';
import { ProviderHealthAuthority } from '../services/provider-health-authority.js';
import { ConfigLoader } from '../services/config-loader.js';
import { Settings } from '../settings.js';

// Import provider modules directly
import { OpenRouterProvider } from './openrouter.js';
import { LMStudioProvider } from './lmstudio.js';
import { GeminiProvider } from './gemini.js';

// ==========================================
// Timeout Constants
// ==========================================

const PROVIDER_TIMEOUTS = {
    cloud: 60000,    // 60s for cloud APIs (OpenRouter)
    local: 90000     // 90s for local LLMs (Ollama, LM Studio)
};

// ==========================================
// Retry Configuration
// ==========================================

const RETRY_CONFIG = {
    MAX_RETRIES: 3,           // Maximum number of retry attempts
    BASE_DELAY_MS: 1000,      // Base delay for exponential backoff (1s)
    MAX_DELAY_MS: 10000,      // Maximum delay between retries (10s)
    JITTER_MS: 100            // Random jitter to avoid thundering herd
};

/**
 * Check if an error is retryable
 * @param {Error} error - The error to check
 * @returns {boolean} Whether the error is retryable
 */
function isRetryableError(error) {
    if (!error) return false;

    const msg = (error.message || '').toLowerCase();
    const name = error.name || '';

    // Network errors
    if (name === 'AbortError' || msg.includes('timeout') || msg.includes('fetch')) {
        return true;
    }

    // HTTP errors
    if (msg.includes('429') || msg.includes('rate limit')) {
        return true;
    }

    // Server errors (5xx)
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) {
        return true;
    }

    // Network errors
    if (msg.includes('network') || msg.includes('econnrefused') || msg.includes('etimedout')) {
        return true;
    }

    return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 * @param {number} attempt - Current attempt number (0-based)
 * @returns {number} Delay in milliseconds
 */
function calculateRetryDelay(attempt) {
    const exponentialDelay = Math.min(
        RETRY_CONFIG.BASE_DELAY_MS * Math.pow(2, attempt),
        RETRY_CONFIG.MAX_DELAY_MS
    );
    const jitter = Math.random() * RETRY_CONFIG.JITTER_MS;
    return exponentialDelay + jitter;
}

/**
 * Delay for a specified amount of time
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// Provider Configuration
// ==========================================

/**
 * Build provider-specific configuration
 * @param {string} provider - Provider name (openrouter, ollama, lmstudio)
 * @param {object} settings - User settings from Settings module
 * @param {object} baseConfig - Base config from config.js
 * @returns {object} Provider-specific config
 */
function buildProviderConfig(provider, settings, baseConfig) {
    switch (provider) {
        case 'ollama':
            return {
                provider: 'ollama',
                endpoint: settings.llm?.ollamaEndpoint || 'http://localhost:11434',
                model: settings.ollama?.model || 'llama3.2',
                temperature: settings.ollama?.temperature ?? settings.openrouter?.temperature ?? 0.7,
                topP: settings.ollama?.topP ?? 0.9,
                maxTokens: settings.ollama?.maxTokens || 2000,
                timeout: PROVIDER_TIMEOUTS.local,
                // Privacy flag for UI
                isLocal: true,
                privacyLevel: 'maximum'
            };

        case 'lmstudio':
            return {
                provider: 'lmstudio',
                endpoint: settings.llm?.lmstudioEndpoint || 'http://localhost:1234/v1',
                model: settings.lmstudio?.model || 'local-model',
                temperature: settings.lmstudio?.temperature ?? settings.openrouter?.temperature ?? 0.7,
                topP: settings.lmstudio?.topP ?? 0.9,
                maxTokens: settings.lmstudio?.maxTokens || 2000,
                timeout: PROVIDER_TIMEOUTS.local,
                // Privacy flag for UI
                isLocal: true,
                privacyLevel: 'maximum'
            };

        case 'gemini':
            return {
                provider: 'gemini',
                endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
                model: settings.gemini?.model || 'gemini-2.5-flash',
                temperature: settings.gemini?.temperature ?? settings.openrouter?.temperature ?? 0.7,
                topP: settings.gemini?.topP ?? 0.9,
                maxTokens: settings.gemini?.maxTokens || 8192,
                timeout: PROVIDER_TIMEOUTS.cloud,
                // Privacy flag for UI
                isLocal: false,
                privacyLevel: 'cloud'
            };

        case 'openrouter':
        default:
            return {
                provider: 'openrouter',
                ...baseConfig,
                ...(settings.openrouter || {}),
                model: settings.openrouter?.model || baseConfig.model,
                temperature: settings.openrouter?.temperature ?? 0.7,
                topP: settings.openrouter?.topP ?? 0.9,
                maxTokens: settings.openrouter?.maxTokens || 4500,
                frequencyPenalty: settings.openrouter?.frequencyPenalty ?? 0,
                presencePenalty: settings.openrouter?.presencePenalty ?? 0,
                timeout: PROVIDER_TIMEOUTS.cloud,
                // Privacy flag for UI
                isLocal: false,
                privacyLevel: 'cloud'
            };
    }
}

// ==========================================
// Unified LLM Call Routing
// ==========================================

/**
 * Route LLM calls to appropriate provider with retry logic and rate limit handling
 * @param {object} config - Provider config from buildProviderConfig
 * @param {string} apiKey - API key (for OpenRouter)
 * @param {Array} messages - Chat messages
 * @param {Array} tools - Function calling tools (optional)
 * @param {function} onProgress - Progress callback for streaming (optional)
 * @returns {Promise<object>} Response in OpenAI-compatible format
 */
async function callProvider(config, apiKey, messages, tools, onProgress = null) {
    // Validate provider module is loaded
    const providerModule = getProviderModule(config.provider);
    if (!providerModule) {
        throw new Error(`Provider module '${config.provider}' not loaded`);
    }

    // HNW Network: Check circuit breaker before attempting call
    const circuitCheck = ProviderHealthAuthority.canExecute(config.provider);
    if (!circuitCheck.allowed) {
        const error = new Error(circuitCheck.reason);
        error.type = 'circuit_open';
        error.provider = config.provider;
        error.recoverable = true;
        error.cooldownRemaining = circuitCheck.cooldownRemaining;
        const timeMessage = circuitCheck.cooldownRemaining
            ? `Try again in ${Math.ceil(circuitCheck.cooldownRemaining / 1000)}s.`
            : 'Try a different provider.';
        error.suggestion = `${config.provider} is temporarily unavailable. ${timeMessage}`;
        throw error;
    }

    // Get appropriate timeout for provider type
    const timeoutMs = config.timeout || (config.isLocal ? PROVIDER_TIMEOUTS.local : PROVIDER_TIMEOUTS.cloud);

    // Execute with retry logic and exponential backoff
    let lastError;
    for (let attempt = 0; attempt <= RETRY_CONFIG.MAX_RETRIES; attempt++) {
        const startTime = Date.now();

        try {
            // Check circuit breaker before each attempt
            const retryCheck = ProviderHealthAuthority.canExecute(config.provider);
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
                            return await providerModule.call(apiKey, config, messages, tools, onProgress);

                        case 'openrouter':
                        default:
                            return await providerModule.call(apiKey, config, messages, tools, onProgress);
                    }
                },
                timeoutMs,
                { operation: `${config.provider} LLM call` }
            );

            // Record success with duration
            const durationMs = Date.now() - startTime;
            ProviderHealthAuthority.recordSuccess(config.provider, durationMs);

            // Validate response format from all providers
            if (!response || typeof response !== 'object') {
                throw new Error(`${config.provider} returned no response`);
            }
            if (!response.choices || !Array.isArray(response.choices)) {
                throw new Error(`${config.provider} returned malformed response (missing choices array)`);
            }

            return response;

        } catch (error) {
            lastError = error;

            // Check if this is a rate limit error with Retry-After header
            if (error.message.includes('429') || error.message.includes('rate limit')) {
                const retryAfterMs = extractRetryAfter(error);
                if (retryAfterMs > 0) {
                    console.warn(`[ProviderInterface] Rate limited by ${config.provider}, waiting ${retryAfterMs}ms`);
                    await delay(retryAfterMs);
                    continue; // Retry immediately after waiting
                }
            }

            // Check if error is retryable and we have more attempts
            if (attempt < RETRY_CONFIG.MAX_RETRIES && isRetryableError(error)) {
                const retryDelay = calculateRetryDelay(attempt);
                console.warn(`[ProviderInterface] Retryable error for ${config.provider} (attempt ${attempt + 1}/${RETRY_CONFIG.MAX_RETRIES + 1}): ${error.message}`);
                console.log(`[ProviderInterface] Waiting ${retryDelay}ms before retry...`);
                await delay(retryDelay);
                continue;
            }

            // Record failure for circuit breaker
            ProviderHealthAuthority.recordFailure(config.provider, error.message);

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
    console.error(`[ProviderInterface] All ${RETRY_CONFIG.MAX_RETRIES + 1} attempts failed for ${config.provider}`);
    throw lastError;
}

/**
 * Extract Retry-After value from error if present
 * @param {Error} error - The error object
 * @returns {number} Milliseconds to wait, or 0 if no Retry-After
 */
function extractRetryAfter(error) {
    // Check if error has a response with Retry-After header
    if (error.response && error.response.headers) {
        const retryAfter = error.response.headers.get('Retry-After');
        if (retryAfter) {
            // Retry-After can be seconds (number) or HTTP-date
            const seconds = parseInt(retryAfter, 10);
            if (!isNaN(seconds)) {
                return seconds * 1000;
            }
            // Could parse HTTP-date here if needed
            return 60000; // Default to 1 minute if date parsing fails
        }
    }

    // Check for rate limit in message and use default delay
    if (error.message && (error.message.includes('429') || error.message.includes('rate limit'))) {
        return 60000; // Default to 1 minute for rate limits
    }

    return 0;
}

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
        case 'openrouter':
        default:
            return OpenRouterProvider || null;
    }
}

/**
 * Check if a provider is available
 * @param {string} provider - Provider name
 * @returns {Promise<boolean>} True if provider is available
 */
async function isProviderAvailable(provider) {
    switch (provider) {
        case 'ollama': {
            const Ollama = ModuleRegistry.getModuleSync('Ollama');
            return Ollama?.isAvailable?.() ?? false;
        }

        case 'lmstudio':
            // LM Studio has no built-in detection, so check endpoint
            try {
                const endpoint = Settings?.get?.()?.llm?.lmstudioEndpoint || 'http://localhost:1234/v1';
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                const response = await fetch(`${endpoint}/models`, {
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                return response.ok;
            } catch {
                return false;
            }

        case 'gemini':
            // Gemini is available if we have an API key
            const geminiApiKey = Settings?.get?.()?.gemini?.apiKey;
            return !!geminiApiKey && geminiApiKey !== 'your-api-key-here';

        case 'openrouter':
        default:
            // OpenRouter is always "available" if we have an API key
            const apiKey = Settings?.get?.()?.openrouter?.apiKey ||
                ConfigLoader.get('openrouter.apiKey');
            return !!apiKey;
    }
}

/**
 * Get available providers
 * @returns {Promise<Array<{name: string, available: boolean}>>}
 */
async function getAvailableProviders() {
    const providers = ['openrouter', 'ollama', 'lmstudio', 'gemini'];
    const results = await Promise.all(
        providers.map(async (name) => ({
            name,
            available: await isProviderAvailable(name)
        }))
    );
    return results;
}

// ==========================================
// Error Normalization
// ==========================================

/**
 * Normalize provider errors to consistent format
 * @param {Error} error - Original error
 * @param {string} provider - Provider name
 * @returns {Error} Normalized error
 */
function normalizeProviderError(error, provider) {
    const normalized = new Error(error.message);
    normalized.provider = provider;
    normalized.originalError = error;

    // Categorize error type
    if (error.name === 'AbortError' || error.message.includes('timed out')) {
        normalized.type = 'timeout';
        normalized.recoverable = true;
        normalized.suggestion = 'Try again or switch to a different model';
    } else if (error.message.includes('401') || error.message.includes('403')) {
        normalized.type = 'auth';
        normalized.recoverable = true;
        normalized.suggestion = 'Check your API key in Settings';
    } else if (error.message.includes('429')) {
        normalized.type = 'rate_limit';
        normalized.recoverable = true;
        normalized.suggestion = 'Wait a moment and try again';
    } else if (error.message.includes('not running') || error.message.includes('ECONNREFUSED')) {
        normalized.type = 'connection';
        normalized.recoverable = true;
        normalized.suggestion = `Start ${provider} server and try again`;
    } else {
        normalized.type = 'unknown';
        normalized.recoverable = false;
    }

    return normalized;
}

/**
 * Safely parse JSON from a response with proper error handling
 * Distinguishes between network errors and JSON parse errors
 * @param {Response} response - Fetch response object
 * @param {object} fallback - Fallback value if parsing fails
 * @returns {Promise<object>} Parsed JSON or fallback
 */
async function safeJSONParse(response, fallback = null) {
    // First check content-type header
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('application/json')) {
        console.warn(`[ProviderInterface] Expected JSON but got ${contentType}`);
        return fallback;
    }

    // Clone the response so we can fall back to text() if JSON parsing fails
    // This is necessary because response.json() consumes the body
    try {
        return await response.clone().json();
    } catch (error) {
        if (error instanceof SyntaxError) {
            console.error('[ProviderInterface] JSON parse error - response may be malformed:', error.message);
            // Try to get text for debugging (using the original response since clone was consumed)
            try {
                const text = await response.text();
                console.debug('[ProviderInterface] Response preview:', text.substring(0, 200));
            } catch (e) {
                // Response body already consumed by failed json() attempt, ignore
            }
        }
        return fallback;
    }
}

// ==========================================
// Provider Health Check System
// HNW Network: Coordination between UI and provider layer
// ==========================================

/**
 * Health check timeout in milliseconds
 */
const HEALTH_CHECK_TIMEOUT = 5000;

/**
 * Check OpenRouter health and API key validity
 * @returns {Promise<ProviderHealthStatus>}
 */
async function checkOpenRouterHealth() {
    const start = Date.now();
    const apiKey = Settings?.get?.()?.openrouter?.apiKey || ConfigLoader.get('openrouter.apiKey');

    if (!apiKey || apiKey === 'your-api-key-here') {
        return {
            available: false,
            status: 'no_key',
            reason: 'No API key configured',
            models: [],
            latencyMs: 0
        };
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const latencyMs = Date.now() - start;

        if (response.status === 401 || response.status === 403) {
            return {
                available: false,
                status: 'invalid_key',
                reason: 'API key is invalid or expired',
                models: [],
                latencyMs
            };
        }

        if (!response.ok) {
            return {
                available: false,
                status: 'error',
                reason: `API error: ${response.status}`,
                models: [],
                latencyMs
            };
        }

        const data = await safeJSONParse(response, { data: [] });
        const models = data.data?.map(m => m.id) || [];

        return {
            available: true,
            status: 'ready',
            models: models.slice(0, 20), // Limit to first 20 for display
            totalModels: models.length,
            hasKey: true,
            latencyMs
        };
    } catch (error) {
        const latencyMs = Date.now() - start;
        if (error.name === 'AbortError') {
            return {
                available: false,
                status: 'timeout',
                reason: 'Connection timeout - check your internet',
                models: [],
                latencyMs
            };
        }
        // Distinguish JSON parse errors from other errors
        if (error instanceof SyntaxError) {
            return {
                available: false,
                status: 'parse_error',
                reason: 'Invalid response format from API',
                models: [],
                latencyMs
            };
        }
        return {
            available: false,
            status: 'error',
            reason: error.message,
            models: [],
            latencyMs
        };
    }
}

/**
 * Check Ollama health and available models
 * @returns {Promise<ProviderHealthStatus>}
 */
async function checkOllamaHealth() {
    const start = Date.now();
    const endpoint = Settings?.get?.()?.llm?.ollamaEndpoint || 'http://localhost:11434';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

        const response = await fetch(`${endpoint}/api/tags`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const latencyMs = Date.now() - start;

        if (!response.ok) {
            return {
                available: false,
                status: 'not_running',
                reason: `Ollama responded with error: ${response.status}`,
                models: [],
                latencyMs
            };
        }

        const data = await safeJSONParse(response, { models: [] });
        const models = data.models?.map(m => m.name) || [];

        if (models.length === 0) {
            return {
                available: true,
                status: 'running_no_models',
                reason: 'No models installed. Run: ollama pull llama3.2',
                models: [],
                latencyMs
            };
        }

        return {
            available: true,
            status: 'ready',
            models,
            latencyMs
        };
    } catch (error) {
        const latencyMs = Date.now() - start;
        if (error.name === 'AbortError') {
            return {
                available: false,
                status: 'not_running',
                reason: 'Connection timeout - is Ollama running? Try: ollama serve',
                models: [],
                latencyMs
            };
        }
        // Distinguish JSON parse errors from network errors
        if (error instanceof SyntaxError) {
            return {
                available: false,
                status: 'parse_error',
                reason: 'Invalid response from Ollama',
                models: [],
                latencyMs
            };
        }
        // CORS or network error usually means Ollama isn't running
        return {
            available: false,
            status: 'not_running',
            reason: 'Cannot connect to Ollama. Start it with: ollama serve',
            models: [],
            latencyMs
        };
    }
}

/**
 * Check LM Studio health and loaded models
 * @returns {Promise<ProviderHealthStatus>}
 */
async function checkLMStudioHealth() {
    const start = Date.now();
    const endpoint = Settings?.get?.()?.llm?.lmstudioEndpoint || 'http://localhost:1234/v1';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

        const response = await fetch(`${endpoint}/models`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const latencyMs = Date.now() - start;

        if (!response.ok) {
            return {
                available: false,
                status: 'not_running',
                reason: `LM Studio responded with error: ${response.status}`,
                models: [],
                latencyMs
            };
        }

        const data = await safeJSONParse(response, { data: [] });
        const models = data.data?.map(m => m.id) || [];

        if (models.length === 0) {
            return {
                available: true,
                status: 'running_no_models',
                reason: 'No models loaded. Load a model in LM Studio.',
                models: [],
                latencyMs
            };
        }

        return {
            available: true,
            status: 'ready',
            models,
            latencyMs
        };
    } catch (error) {
        const latencyMs = Date.now() - start;
        if (error.name === 'AbortError') {
            return {
                available: false,
                status: 'not_running',
                reason: 'Connection timeout - is LM Studio running with server enabled?',
                models: [],
                latencyMs
            };
        }
        // Distinguish JSON parse errors from network errors
        if (error instanceof SyntaxError) {
            return {
                available: false,
                status: 'parse_error',
                reason: 'Invalid response from LM Studio',
                models: [],
                latencyMs
            };
        }
        return {
            available: false,
            status: 'not_running',
            reason: 'Cannot connect to LM Studio. Enable the local server in LM Studio settings.',
            models: [],
            latencyMs
        };
    }
}

/**
 * Check Gemini health and API key validity
 * @returns {Promise<ProviderHealthStatus>}
 */
async function checkGeminiHealth() {
    const start = Date.now();
    const apiKey = Settings?.get?.()?.gemini?.apiKey;

    if (!apiKey || apiKey === 'your-api-key-here') {
        return {
            available: false,
            status: 'no_key',
            reason: 'No API key configured',
            models: [],
            latencyMs: 0
        };
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

        // Use Authorization header instead of query parameter to avoid exposing the key
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const latencyMs = Date.now() - start;

        if (response.status === 401 || response.status === 403) {
            return {
                available: false,
                status: 'invalid_key',
                reason: 'API key is invalid or expired',
                models: [],
                latencyMs
            };
        }

        if (!response.ok) {
            return {
                available: false,
                status: 'error',
                reason: `API error: ${response.status}`,
                models: [],
                latencyMs
            };
        }

        const data = await safeJSONParse(response, { data: [] });
        const models = data.data?.map(m => m.id) || [];

        return {
            available: true,
            status: 'ready',
            models: models.slice(0, 20),
            totalModels: models.length,
            hasKey: true,
            latencyMs
        };
    } catch (error) {
        const latencyMs = Date.now() - start;
        if (error.name === 'AbortError') {
            return {
                available: false,
                status: 'timeout',
                reason: 'Connection timeout - check your internet',
                models: [],
                latencyMs
            };
        }
        // Distinguish JSON parse errors from other errors
        if (error instanceof SyntaxError) {
            return {
                available: false,
                status: 'parse_error',
                reason: 'Invalid response format from Gemini API',
                models: [],
                latencyMs
            };
        }
        return {
            available: false,
            status: 'error',
            reason: error.message,
            models: [],
            latencyMs
        };
    }
}

/**
 * Comprehensive health check for all providers
 * Returns detailed status including model availability
 *
 * @returns {Promise<{
 *   openrouter: ProviderHealthStatus,
 *   ollama: ProviderHealthStatus,
 *   lmstudio: ProviderHealthStatus,
 *   gemini: ProviderHealthStatus
 * }>}
 */
async function checkHealth() {
    const [openrouter, ollama, lmstudio, gemini] = await Promise.all([
        checkOpenRouterHealth(),
        checkOllamaHealth(),
        checkLMStudioHealth(),
        checkGeminiHealth()
    ]);

    return { openrouter, ollama, lmstudio, gemini };
}

// ==========================================
// Public API
// ==========================================

// ES Module export
export const ProviderInterface = {
    // Configuration
    buildProviderConfig,

    // Routing
    callProvider,

    // Discovery
    isProviderAvailable,
    getAvailableProviders,
    getProviderModule,

    // Health Checks (NEW)
    checkHealth,
    checkOpenRouterHealth,
    checkOllamaHealth,
    checkLMStudioHealth,
    checkGeminiHealth,

    // Error handling
    normalizeProviderError,

    // Constants
    TIMEOUTS: PROVIDER_TIMEOUTS
};


console.log('[ProviderInterface] LLM provider abstraction layer loaded with health checks');
