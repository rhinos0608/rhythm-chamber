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
import { ProviderCircuitBreaker } from '../services/provider-circuit-breaker.js';

// ==========================================
// Timeout Constants
// ==========================================

const PROVIDER_TIMEOUTS = {
    cloud: 60000,    // 60s for cloud APIs (OpenRouter)
    local: 90000     // 90s for local LLMs (Ollama, LM Studio)
};

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
 * Route LLM calls to appropriate provider
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
    const circuitCheck = ProviderCircuitBreaker.canExecute(config.provider);
    if (!circuitCheck.allowed) {
        const error = new Error(circuitCheck.reason);
        error.type = 'circuit_open';
        error.provider = config.provider;
        error.recoverable = true;
        error.cooldownRemaining = circuitCheck.cooldownRemaining;
        error.suggestion = `${config.provider} is temporarily unavailable. ${circuitCheck.cooldownRemaining
                ? `Try again in ${Math.ceil(circuitCheck.cooldownRemaining / 1000)}s.`
                : 'Try a different provider.'
            }`;
        throw error;
    }

    // Get appropriate timeout for provider type
    const timeoutMs = config.timeout || (config.isLocal ? PROVIDER_TIMEOUTS.local : PROVIDER_TIMEOUTS.cloud);
    const startTime = Date.now();

    // Route to appropriate provider with timeout protection
    let response;
    try {
        response = await withTimeout(
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
        ProviderCircuitBreaker.recordSuccess(config.provider, durationMs);

    } catch (error) {
        // Record failure for circuit breaker
        ProviderCircuitBreaker.recordFailure(config.provider, error.message);

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

    // Validate response format from all providers
    if (!response || typeof response !== 'object') {
        ProviderCircuitBreaker.recordFailure(config.provider, 'No response');
        throw new Error(`${config.provider} returned no response`);
    }
    if (!response.choices || !Array.isArray(response.choices)) {
        ProviderCircuitBreaker.recordFailure(config.provider, 'Malformed response');
        console.warn('[ProviderInterface] Response missing choices array, will use fallback:', config.provider);
        throw new Error(`${config.provider} returned malformed response (missing choices array)`);
    }

    return response;
}

/**
 * Get the provider module if loaded
 * @param {string} provider - Provider name
 * @returns {object|null} Provider module or null
 */
function getProviderModule(provider) {
    switch (provider) {
        case 'ollama':
            return ModuleRegistry.getModuleSync('OllamaProvider') || null;
        case 'lmstudio':
            return window.LMStudioProvider || null;
        case 'gemini':
            return window.GeminiProvider || null;
        case 'openrouter':
        default:
            return window.OpenRouterProvider || null;
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
                const endpoint = window.Settings?.get?.()?.llm?.lmstudioEndpoint || 'http://localhost:1234/v1';
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
            const geminiApiKey = window.Settings?.get?.()?.gemini?.apiKey;
            return !!geminiApiKey && geminiApiKey !== 'your-api-key-here';

        case 'openrouter':
        default:
            // OpenRouter is always "available" if we have an API key
            const apiKey = window.Settings?.get?.()?.openrouter?.apiKey ||
                window.Config?.apiKey;
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
    const apiKey = window.Settings?.get?.()?.openrouter?.apiKey || window.Config?.apiKey;

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

        const data = await response.json();
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
    const endpoint = window.Settings?.get?.()?.llm?.ollamaEndpoint || 'http://localhost:11434';

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

        const data = await response.json();
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
    const endpoint = window.Settings?.get?.()?.llm?.lmstudioEndpoint || 'http://localhost:1234/v1';

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

        const data = await response.json();
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
    const apiKey = window.Settings?.get?.()?.gemini?.apiKey;

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

        const data = await response.json();
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

// Keep window global for backwards compatibility
if (typeof window !== 'undefined') {
    window.ProviderInterface = ProviderInterface;
}

console.log('[ProviderInterface] LLM provider abstraction layer loaded with health checks');
