/**
 * LLM Provider Routing Service
 * 
 * Handles LLM provider configuration and routing for different providers.
 * Extracted from chat.js to separate provider concerns from chat orchestration.
 * 
 * @module services/llm-provider-routing-service
 */

'use strict';

// ==========================================
// Dependencies (injected via init)
// ==========================================

let _ProviderInterface = null;
let _Settings = null;
let _Config = null;

// ==========================================
// Core Functions
// ==========================================

/**
 * Initialize LLMProviderRoutingService with dependencies
 * @param {Object} dependencies - Required dependencies
 */
function init(dependencies) {
    _ProviderInterface = dependencies.ProviderInterface;
    _Settings = dependencies.Settings;
    _Config = dependencies.Config;

    console.log('[LLMProviderRoutingService] Initialized with dependencies');
}

/**
 * Build provider-specific configuration
 * Delegates to ProviderInterface module
 * @param {string} provider - Provider name (openrouter, ollama, lmstudio)
 * @param {object} settings - User settings
 * @param {object} baseConfig - Base config from config.js
 * @returns {object} Provider-specific config
 */
function buildProviderConfig(provider, settings, baseConfig) {
    // CRITICAL: Validate provider name at function entry
    // Prevents silent acceptance of invalid provider names which could
    // lead to unexpected behavior or security issues
    const VALID_PROVIDERS = ['openrouter', 'ollama', 'lmstudio', 'gemini', 'openai-compatible'];
    if (!provider || typeof provider !== 'string') {
        throw new TypeError(`Invalid provider: must be a non-empty string. Got: ${typeof provider}`);
    }
    const normalizedProvider = provider.toLowerCase().trim();
    if (!VALID_PROVIDERS.includes(normalizedProvider)) {
        throw new RangeError(
            `Invalid provider name: "${provider}". Valid providers are: ${VALID_PROVIDERS.join(', ')}`
        );
    }

    // Delegate to provider interface if available
    if (_ProviderInterface?.buildProviderConfig) {
        return _ProviderInterface.buildProviderConfig(normalizedProvider, settings, baseConfig);
    }

    // Fallback for backward compatibility
    // All settings are stored under settings.llm.* for consistency
    const llmSettings = settings?.llm || {};

    switch (normalizedProvider) {
        case 'ollama':
            return {
                provider: 'ollama',
                endpoint: llmSettings.ollamaEndpoint || 'http://localhost:11434',
                model: llmSettings.ollamaModel || 'llama3.2',
                temperature: llmSettings.temperature ?? 0.7,
                topP: 0.9,
                maxTokens: llmSettings.maxTokens || 2000
            };

        case 'lmstudio':
            return {
                provider: 'lmstudio',
                endpoint: llmSettings.lmstudioEndpoint || 'http://localhost:1234/v1',
                model: llmSettings.lmstudioModel || 'local-model',
                temperature: llmSettings.temperature ?? 0.7,
                topP: 0.9,
                maxTokens: llmSettings.maxTokens || 2000
            };

        case 'openrouter':
        default:
            return {
                provider: 'openrouter',
                ...baseConfig,
                model: llmSettings.openrouterModel || baseConfig?.model || 'xiaomi/mimo-v2-flash:free',
                temperature: llmSettings.temperature ?? 0.7,
                topP: 0.9,
                maxTokens: llmSettings.maxTokens || 4500,
                frequencyPenalty: 0,
                presencePenalty: 0
            };
    }

}

/**
 * Call the LLM provider
 * Delegates to ProviderInterface for unified provider routing
 * 
 * @param {object} config - Provider config from buildProviderConfig
 * @param {string} apiKey - API key (for OpenRouter)
 * @param {Array} messages - Chat messages
 * @param {Array} tools - Function calling tools (optional)
 * @param {function} onProgress - Progress callback for streaming (optional)
 * @returns {Promise<object>} Response in OpenAI-compatible format
 */
async function callLLM(config, apiKey, messages, tools, onProgress = null) {
    if (!_ProviderInterface?.callProvider) {
        throw new Error('ProviderInterface not loaded. Ensure provider modules are included before chat.js.');
    }

    return _ProviderInterface.callProvider(config, apiKey, messages, tools, onProgress);
}

// ==========================================
// Public API
// ==========================================

const LLMProviderRoutingService = {
    // Lifecycle
    init,

    // Core operations
    buildProviderConfig,
    callLLM
};

// ES Module export
export { LLMProviderRoutingService };

console.log('[LLMProviderRoutingService] Service loaded');
