/**
 * Message Error Handler Service
 *
 * Handles error formatting, user-friendly error messages, and LLM response validation.
 * Extracted from MessageLifecycleCoordinator to separate error handling concerns.
 *
 * Responsibilities:
 * - Build user-friendly error messages with provider-specific hints
 * - Validate LLM response structures
 * - Format error responses for display
 *
 * @module services/message-error-handler
 */

'use strict';

// ==========================================
// Constants
// ==========================================

const PROVIDER_HINTS = {
    ollama: 'Ensure Ollama is running (`ollama serve`)',
    lmstudio: 'Check LM Studio server is enabled',
    gemini: 'Verify your Gemini API key in Settings',
    openrouter: 'Check your OpenRouter API key in Settings',
    anthropic: 'Verify your Anthropic API key in Settings',
    openai: 'Verify your OpenAI API key in Settings'
};

// ==========================================
// Error Message Functions
// ==========================================

/**
 * Build user-friendly error message with provider-specific hints
 * @param {Error} error - The error that occurred
 * @param {string} provider - The provider that was being used
 * @returns {string} Formatted error message for display
 */
function buildUserErrorMessage(error, provider) {
    const hint = PROVIDER_HINTS[provider] || 'Check your provider settings';

    return `**Connection Error**\n\n${error.message}\n\n💡 **Tip:** ${hint}\n\nClick "Try Again" after fixing the issue.`;
}

/**
 * Extract early return assistant message from tool call result
 * @param {Object} earlyReturn - Early return object from tool handling
 * @returns {string|null} Extracted message content or null
 */
function getEarlyReturnAssistantMessage(earlyReturn) {
    if (!earlyReturn || typeof earlyReturn !== 'object') return null;

    if (typeof earlyReturn.content === 'string' && earlyReturn.content.trim().length > 0) {
        return earlyReturn.content;
    }

    const nestedMessage = earlyReturn.message || earlyReturn.responseMessage;
    if (nestedMessage && typeof nestedMessage.content === 'string' && nestedMessage.content.trim().length > 0) {
        return nestedMessage.content;
    }

    if (typeof earlyReturn.error === 'string' && earlyReturn.error.trim().length > 0) {
        return earlyReturn.error;
    }

    return null;
}

// ==========================================
// LLM Response Validation
// ==========================================

/**
 * Validate LLM response structure
 * EDGE CASE FIX: Comprehensive validation to catch malformed responses
 * @param {object} response - The response from LLM provider
 * @param {string} provider - Provider name for error messages
 * @returns {{ valid: boolean, error?: string }} Validation result
 */
function validateLLMResponse(response, provider) {
    // Check response exists
    if (!response || typeof response !== 'object') {
        return { valid: false, error: `No response received from ${provider}` };
    }

    // Check choices array exists and has items
    if (!response.choices || !Array.isArray(response.choices)) {
        return { valid: false, error: `${provider} returned response without choices array` };
    }

    if (response.choices.length === 0) {
        return { valid: false, error: `${provider} returned empty choices array` };
    }

    const firstChoice = response.choices[0];

    // Check first choice has message property
    if (!firstChoice.message || typeof firstChoice.message !== 'object') {
        return { valid: false, error: `${provider} returned choice without message object` };
    }

    // Check message has role (required field)
    if (!firstChoice.message.role) {
        return { valid: false, error: `${provider} returned message without role` };
    }

    // Check for common malformed structures
    // Valid content types: undefined, null, string, Array (multimodal), Object (structured output)
    // Invalid types: number, boolean, function, symbol, bigint
    const content = firstChoice.message.content;
    if (content !== undefined && content !== null) {
        const type = typeof content;
        if (type !== 'string' && type !== 'object') {
            return { valid: false, error: `${provider} returned message with invalid content type: ${type}` };
        }
    }

    // Validate tool_calls structure if present
    if (firstChoice.message.tool_calls) {
        if (!Array.isArray(firstChoice.message.tool_calls)) {
            return { valid: false, error: `${provider} returned non-array tool_calls` };
        }
        // Each tool call should have function.name at minimum
        for (let i = 0; i < firstChoice.message.tool_calls.length; i++) {
            const tc = firstChoice.message.tool_calls[i];
            if (!tc.function || typeof tc.function !== 'object') {
                return { valid: false, error: `${provider} returned tool_call without function object at index ${i}` };
            }
            if (!tc.function.name) {
                return { valid: false, error: `${provider} returned tool_call without function.name at index ${i}` };
            }
        }
    }

    return { valid: true };
}

// ==========================================
// Error Response Builders
// ==========================================

/**
 * Build error response object for chat
 * @param {string} errorMessage - The error message
 * @param {Error} originalError - The original error object
 * @returns {Object} Formatted error response
 */
function buildErrorResponse(errorMessage, originalError) {
    return {
        content: errorMessage,
        status: 'error',
        error: originalError?.message || errorMessage,
        role: 'assistant'
    };
}

/**
 * Build error messages array for atomic commit
 * @param {string} userMessage - The user message content
 * @param {string} errorMessage - The error message
 * @returns {Array} Array of message objects for atomic commit
 */
function buildErrorMessagesArray(userMessage, errorMessage) {
    return [
        { role: 'user', content: userMessage },
        {
            role: 'assistant',
            content: errorMessage,
            error: true,
            excludeFromContext: true
        }
    ];
}

// ==========================================
// Provider Hints Management
// ==========================================

/**
 * Get hint for a specific provider
 * @param {string} provider - Provider name
 * @returns {string} Provider hint or default
 */
function getProviderHint(provider) {
    return PROVIDER_HINTS[provider] || 'Check your provider settings';
}

/**
 * Add a custom provider hint
 * @param {string} provider - Provider name
 * @param {string} hint - Hint message
 */
function addProviderHint(provider, hint) {
    PROVIDER_HINTS[provider] = hint;
}

// ==========================================
// Public API
// ==========================================

const MessageErrorHandler = {
    buildUserErrorMessage,
    getEarlyReturnAssistantMessage,
    validateLLMResponse,
    buildErrorResponse,
    buildErrorMessagesArray,
    getProviderHint,
    addProviderHint
};

// ES Module export
export { MessageErrorHandler };

console.log('[MessageErrorHandler] Service loaded');
