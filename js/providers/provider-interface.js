/**
 * LLM Provider Interface
 * 
 * Unified abstraction layer for all LLM providers (OpenRouter, Ollama, LM Studio).
 * Handles configuration building and request routing.
 * 
 * @module providers/provider-interface
 */

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
                timeout: PROVIDER_TIMEOUTS.local
            };

        case 'lmstudio':
            return {
                provider: 'lmstudio',
                endpoint: settings.llm?.lmstudioEndpoint || 'http://localhost:1234/v1',
                model: settings.lmstudio?.model || 'local-model',
                temperature: settings.lmstudio?.temperature ?? settings.openrouter?.temperature ?? 0.7,
                topP: settings.lmstudio?.topP ?? 0.9,
                maxTokens: settings.lmstudio?.maxTokens || 2000,
                timeout: PROVIDER_TIMEOUTS.local
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
                timeout: PROVIDER_TIMEOUTS.cloud
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

    // Route to appropriate provider
    let response;
    switch (config.provider) {
        case 'ollama':
            response = await providerModule.call(config, messages, tools, onProgress);
            break;

        case 'lmstudio':
            response = await providerModule.call(config, messages, tools, onProgress);
            break;

        case 'openrouter':
        default:
            response = await providerModule.call(apiKey, config, messages, tools, onProgress);
            break;
    }

    // Validate response format from all providers
    if (!response || typeof response !== 'object') {
        throw new Error(`${config.provider} returned no response`);
    }
    if (!response.choices || !Array.isArray(response.choices)) {
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
            return window.OllamaProvider || null;
        case 'lmstudio':
            return window.LMStudioProvider || null;
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
        case 'ollama':
            return window.Ollama?.isAvailable?.() ?? false;

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

        case 'openrouter':
        default:
            // OpenRouter is always "available" if we have an API key
            const apiKey = window.Settings?.get?.()?.openrouter?.apiKey ||
                window.CONFIG?.apiKey;
            return !!apiKey;
    }
}

/**
 * Get available providers
 * @returns {Promise<Array<{name: string, available: boolean}>>}
 */
async function getAvailableProviders() {
    const providers = ['openrouter', 'ollama', 'lmstudio'];
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
// Public API
// ==========================================

window.ProviderInterface = {
    // Configuration
    buildProviderConfig,

    // Routing
    callProvider,

    // Discovery
    isProviderAvailable,
    getAvailableProviders,
    getProviderModule,

    // Error handling
    normalizeProviderError,

    // Constants
    TIMEOUTS: PROVIDER_TIMEOUTS
};

console.log('[ProviderInterface] LLM provider abstraction layer loaded');
