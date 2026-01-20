/**
 * Token Counting Service
 * 
 * Handles token counting, context window management, and truncation strategies.
 * Extracted from chat.js to separate token concerns from chat orchestration.
 * 
 * @module services/token-counting-service
 */

'use strict';

// ==========================================
// Dependencies (injected via init)
// ==========================================

let _TokenCounter = null;

// ==========================================
// State Management
// ==========================================

let _contextWindow = null;

// ==========================================
// Core Functions
// ==========================================

/**
 * Initialize TokenCountingService with dependencies
 * @param {Object} dependencies - Required dependencies
 */
function init(dependencies) {
    _TokenCounter = dependencies.TokenCounter;
    _contextWindow = dependencies.contextWindow || null;

    console.log('[TokenCountingService] Initialized with dependencies');
}

/**
 * Set context window (can be called after init to override)
 * @param {number} contextWindow - Context window size in tokens
 */
function setContextWindow(contextWindow) {
    _contextWindow = contextWindow;
}

/**
 * Get context window size
 * @returns {number} Context window in tokens
 */
function getContextWindow() {
    if (_contextWindow) {
        return _contextWindow;
    }
    if (_TokenCounter && _TokenCounter.getContextWindow) {
        return _TokenCounter.getContextWindow();
    }
    return 4096; // Default fallback
}

/**
 * Count tokens in a string
 * @param {string} text - Text to count tokens for
 * @returns {number} Token count
 */
function countTokens(text) {
    if (!_TokenCounter || !_TokenCounter.countTokens) {
        return Math.ceil((text || '').length / 4);
    }
    return _TokenCounter.countTokens(text);
}

/**
 * Calculate token usage for a request
 * 
 * @param {Object} params - Request parameters
 * @param {string} params.systemPrompt - System prompt
 * @param {Array} params.messages - Chat messages
 * @param {string} params.ragContext - RAG context (optional)
 * @param {Array} params.tools - Tool schemas (optional)
 * @param {string} params.model - Model name (optional)
 * @returns {Object} Token information with warnings
 */
function calculateTokenUsage(params) {
    if (!_TokenCounter || !_TokenCounter.calculateRequestTokens) {
        return {
            systemPromptTokens: 0,
            messageTokens: 0,
            ragContextTokens: 0,
            toolTokens: 0,
            total: 0,
            contextWindow: getContextWindow(),
            usagePercent: 0,
            warnings: []
        };
    }

    return _TokenCounter.calculateRequestTokens(params);
}

/**
 * Get recommended action based on token usage
 * 
 * @param {Object} tokenInfo - Token information from calculateTokenUsage
 * @returns {Object} Recommended action with action type and message
 */
function getRecommendedAction(tokenInfo) {
    if (!_TokenCounter || !_TokenCounter.getRecommendedAction) {
        return { action: 'proceed', message: 'No token counter available' };
    }

    return _TokenCounter.getRecommendedAction(tokenInfo);
}

/**
 * Truncate request to target token count
 * 
 * @param {Object} params - Parameters to truncate
 * @param {number} targetTokens - Target token count
 * @returns {Object} Truncated parameters
 */
function truncateToTarget(params, targetTokens) {
    if (!_TokenCounter || !_TokenCounter.truncateToTarget) {
        return params; // No truncation possible
    }

    return _TokenCounter.truncateToTarget(params, targetTokens);
}

/**
 * Process token usage and apply strategies if needed
 * 
 * @param {Object} params - Request parameters
 * @param {function} onProgress - Progress callback (optional)
 * @returns {Object} Processed result with token info and potentially modified params
 */
function processTokenUsage(params, onProgress = null) {
    const tokenInfo = calculateTokenUsage(params);

    // Log token info
    console.log('[TokenCountingService] Token count:', tokenInfo);

    // Check for warnings and apply strategies
    if (tokenInfo.warnings.length > 0) {
        const recommended = getRecommendedAction(tokenInfo);

        // Log warnings
        tokenInfo.warnings.forEach(warning => {
            console.warn(`[TokenCountingService] Token warning [${warning.level}]: ${warning.message}`);
        });

        // Apply truncation strategy if needed
        if (recommended.action === 'truncate') {
            console.log('[TokenCountingService] Applying truncation strategy...');

            // Truncate the request parameters
            const targetTokens = Math.floor(tokenInfo.contextWindow * 0.9); // Target 90% of context window
            const truncatedParams = truncateToTarget(params, targetTokens);

            // Notify UI about truncation
            if (onProgress) {
                onProgress({
                    type: 'token_warning',
                    message: 'Context too large - conversation truncated',
                    tokenInfo: tokenInfo,
                    truncated: true
                });
            }

            return {
                tokenInfo,
                params: truncatedParams,
                truncated: true
            };
        } else if (recommended.action === 'warn_user') {
            // Just warn the user but proceed
            if (onProgress) {
                onProgress({
                    type: 'token_warning',
                    message: recommended.message,
                    tokenInfo: tokenInfo,
                    truncated: false
                });
            }
        }
    }

    // Always pass token info to UI for monitoring
    if (onProgress) {
        onProgress({
            type: 'token_update',
            tokenInfo: tokenInfo
        });
    }

    return {
        tokenInfo,
        params: params,
        truncated: false
    };
}

/**
 * Reset the token display UI (for new chat sessions)
 */
function resetDisplay() {
    if (_TokenCounter && _TokenCounter.resetDisplay) {
        _TokenCounter.resetDisplay();
    } else {
        // Fallback: manually reset UI elements
        const tokenCount = document.getElementById('token-count');
        const tokenLimit = document.getElementById('token-limit');
        const tokenPercent = document.getElementById('token-percent');
        const tokenBarFill = document.getElementById('token-bar-fill');
        const tokenWarnings = document.getElementById('token-warnings');
        const tokenCounter = document.getElementById('token-counter');

        if (tokenCount) tokenCount.textContent = '0';
        if (tokenLimit) tokenLimit.textContent = getContextWindow().toLocaleString();
        if (tokenPercent) tokenPercent.textContent = '(0%)';
        if (tokenBarFill) tokenBarFill.style.width = '0%';
        if (tokenWarnings) tokenWarnings.innerHTML = '';

        console.log('[TokenCountingService] Display reset');
    }
}

// ==========================================
// Public API
// ==========================================

const TokenCountingService = {
    // Lifecycle
    init,
    setContextWindow,

    // Core operations
    getContextWindow,
    countTokens,
    calculateTokenUsage,
    getRecommendedAction,
    truncateToTarget,
    processTokenUsage,

    // UI operations
    resetDisplay
};

// ES Module export
export { TokenCountingService };

console.log('[TokenCountingService] Service loaded');
