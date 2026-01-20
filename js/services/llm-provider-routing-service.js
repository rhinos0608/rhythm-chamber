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
    // Delegate to provider interface if available
    if (_ProviderInterface?.buildProviderConfig) {
        return _ProviderInterface.buildProviderConfig(provider, settings, baseConfig);
    }

    // Fallback for backward compatibility
    switch (provider) {
        case 'ollama':
            return {
                provider: 'ollama',
                endpoint: settings.llm?.ollamaEndpoint || 'http://localhost:11434',
                model: settings.ollama?.model || 'llama3.2',
                temperature: settings.ollama?.temperature ?? settings.openrouter?.temperature ?? 0.7,
                topP: settings.ollama?.topP ?? 0.9,
                maxTokens: settings.ollama?.maxTokens || 2000
            };

        case 'lmstudio':
            return {
                provider: 'lmstudio',
                endpoint: settings.llm?.lmstudioEndpoint || 'http://localhost:1234/v1',
                model: settings.lmstudio?.model || 'local-model',
                temperature: settings.lmstudio?.temperature ?? settings.openrouter?.temperature ?? 0.7,
                topP: settings.lmstudio?.topP ?? 0.9,
                maxTokens: settings.lmstudio?.maxTokens || 2000
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
                presencePenalty: settings.openrouter?.presencePenalty ?? 0
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
