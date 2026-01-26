/**
 * LLM API Orchestrator Service
 *
 * Handles LLM API calls, provider configuration, and response processing.
 * Extracted from MessageLifecycleCoordinator to separate LLM API concerns.
 *
 * Responsibilities:
 * - Build provider configurations
 * - Execute LLM API calls
 * - Handle API responses and errors
 * - Coordinate with token counting service
 *
 * @module services/llm-api-orchestrator
 */

'use strict';

// ==========================================
// Dependencies (injected via init)
// ==========================================

let _LLMProviderRoutingService = null;
let _TokenCountingService = null;
let _Config = null;
let _Settings = null;
let _WaveTelemetry = null;

// Track if we've already shown fallback notification this session
let _hasShownFallbackNotification = false;

// ==========================================
// Initialization
// ==========================================

/**
 * Initialize LLMApiOrchestrator with dependencies
 * @param {Object} dependencies - Required dependencies
 */
function init(dependencies) {
    _LLMProviderRoutingService = dependencies.LLMProviderRoutingService;
    _TokenCountingService = dependencies.TokenCountingService;
    _Config = dependencies.Config;
    _Settings = dependencies.Settings;
    _WaveTelemetry = dependencies.WaveTelemetry;

    console.log('[LLMApiOrchestrator] Initialized with dependencies');
}

// ==========================================
// Provider Configuration
// ==========================================

/**
 * Build provider configuration for LLM call
 * @param {string} provider - Provider name
 * @param {Object} settings - Application settings
 * @param {Object} config - Provider config
 * @returns {Object} Provider configuration
 */
function buildProviderConfig(provider, settings, config) {
    return _LLMProviderRoutingService?.buildProviderConfig?.(provider, settings, config) || {
        provider: provider,
        model: settings.llm?.model || 'default',
        baseUrl: settings[provider]?.baseUrl || ''
    };
}

/**
 * Get API key from settings or config
 * @param {string} provider - Provider name
 * @param {string} apiKey - Override API key
 * @param {Object} settings - Application settings
 * @param {Object} config - Provider config
 * @returns {string|null} API key or null if not found
 */
function getApiKey(provider, apiKey, settings, config) {
    const key = apiKey || settings.openrouter?.apiKey || config.apiKey;
    const isValidKey = key && key !== '' && key !== 'your-api-key-here';
    return isValidKey ? key : null;
}

/**
 * Check if provider is local (Ollama or LM Studio)
 * @param {string} provider - Provider name
 * @returns {boolean} True if local provider
 */
function isLocalProvider(provider) {
    return provider === 'ollama' || provider === 'lmstudio';
}

// ==========================================
// Token Management
// ==========================================

/**
 * Calculate token usage for request
 * @param {Object} params - Token calculation parameters
 * @returns {Object} Token info with warnings and recommendations
 */
function calculateTokenUsage(params) {
    if (!_TokenCountingService) {
        return {
            total: 0,
            contextWindow: 4000,
            usagePercent: 0,
            warnings: []
        };
    }

    return _TokenCountingService.calculateTokenUsage(params);
}

/**
 * Truncate request to fit target token count
 * @param {Object} params - Request parameters
 * @param {number} targetTokens - Target token count
 * @returns {Object} Truncated parameters
 */
function truncateToTarget(params, targetTokens) {
    if (!_TokenCountingService) {
        return params;
    }

    return _TokenCountingService.truncateToTarget(params, targetTokens);
}

/**
 * Get recommended action based on token usage
 * @param {Object} tokenInfo - Token information
 * @returns {Object} Recommended action with message
 */
function getRecommendedTokenAction(tokenInfo) {
    if (!_TokenCountingService) {
        return { action: 'proceed', message: 'No token counting service available' };
    }

    return _TokenCountingService.getRecommendedAction(tokenInfo);
}

// ==========================================
// LLM API Calls
// ==========================================

/**
 * Execute LLM API call
 * @param {Object} providerConfig - Provider configuration
 * @param {string} apiKey - API key
 * @param {Array} messages - Message array
 * @param {Array} tools - Optional tools array
 * @param {Function} onProgress - Progress callback
 * @param {AbortSignal} signal - Abort signal for timeout
 * @returns {Promise<Object>} LLM response
 */
async function callLLM(providerConfig, apiKey, messages, tools, onProgress, signal) {
    if (!_LLMProviderRoutingService?.callLLM) {
        throw new Error('LLMProviderRoutingService not loaded. Ensure provider modules are included before chat initialization.');
    }

    const llmCallStart = Date.now();
    const response = await _LLMProviderRoutingService.callLLM(
        providerConfig,
        apiKey,
        messages,
        tools,
        onProgress,
        signal
    );
    const llmCallDuration = Date.now() - llmCallStart;

    // Record telemetry
    const provider = providerConfig.provider || 'unknown';
    const telemetryMetric = isLocalProvider(provider) ? 'local_llm_call' : 'cloud_llm_call';
    _WaveTelemetry?.record(telemetryMetric, llmCallDuration);

    console.log(`[LLMApiOrchestrator] LLM call completed in ${llmCallDuration}ms`);

    return response;
}

// ==========================================
// Fallback Handling
// ==========================================

/**
 * Check if fallback response should be used
 * @param {string} provider - Provider name
 * @param {string} apiKey - API key
 * @returns {boolean} True if fallback should be used
 */
function shouldUseFallback(provider, apiKey) {
    if (isLocalProvider(provider)) {
        return false;
    }

    const isValidKey = apiKey && apiKey !== '' && apiKey !== 'your-api-key-here';
    return !isValidKey;
}

/**
 * Show fallback notification if not already shown
 * @param {Function} showToast - Toast notification function
 */
function showFallbackNotification(showToast) {
    if (!_hasShownFallbackNotification && showToast) {
        showToast('Using offline response mode - add an API key for AI responses', 4000);
        _hasShownFallbackNotification = true;
    }
}

/**
 * Reset fallback notification flag
 * Allows showing notification again
 */
function resetFallbackNotification() {
    _hasShownFallbackNotification = false;
}

// ==========================================
// Public API
// ==========================================

const LLMApiOrchestrator = {
    init,
    buildProviderConfig,
    getApiKey,
    isLocalProvider,
    calculateTokenUsage,
    truncateToTarget,
    getRecommendedTokenAction,
    callLLM,
    shouldUseFallback,
    showFallbackNotification,
    resetFallbackNotification
};

// ES Module export
export { LLMApiOrchestrator };

console.log('[LLMApiOrchestrator] Service loaded');
