/**
 * Token Counter Utility
 * Estimates token usage for OpenAI-style API requests
 * Uses character-based estimation (1 token ≈ 4 characters)
 */

const TokenCounter = {
    // Default context window (can be overridden by user settings)
    // Users can configure this in the settings tab
    DEFAULT_CONTEXT_WINDOW: 4096,

    // Get context window - uses configurable value from settings
    getContextWindow: function () {
        // Check if user has configured a custom context window
        if (window.Settings && window.Settings.getContextWindow) {
            return window.Settings.getContextWindow();
        }

        // Fallback to default
        return this.DEFAULT_CONTEXT_WINDOW;
    },

    // Count tokens in a string using character-based estimation
    countTokens: function (text) {
        if (!text || text.length === 0) return 0;

        // Character-based estimation: 1 token ≈ 4 characters
        // This is conservative and works well for most cases
        return Math.ceil(text.length / 4);
    },

    // Calculate total tokens for a request
    calculateRequestTokens: function (request) {
        const contextWindow = this.getContextWindow();

        let systemPromptTokens = 0;
        let messageTokens = 0;
        let ragContextTokens = 0;
        let toolTokens = 0;

        // Count system prompt
        if (request.systemPrompt) {
            systemPromptTokens = this.countTokens(request.systemPrompt);
        }

        // Count messages
        if (request.messages && Array.isArray(request.messages)) {
            request.messages.forEach(msg => {
                // Count role + content
                const messageText = `${msg.role}: ${msg.content || ''}`;
                messageTokens += this.countTokens(messageText);

                // Count tool calls if present
                if (msg.tool_calls) {
                    msg.tool_calls.forEach(toolCall => {
                        const toolText = JSON.stringify(toolCall);
                        toolTokens += this.countTokens(toolText);
                    });
                }
            });
        }

        // Count RAG context
        if (request.ragContext) {
            ragContextTokens = this.countTokens(request.ragContext);
        }

        // Count tools/functions
        if (request.tools && Array.isArray(request.tools)) {
            request.tools.forEach(tool => {
                const toolText = JSON.stringify(tool);
                toolTokens += this.countTokens(toolText);
            });
        }

        // Calculate total
        const total = systemPromptTokens + messageTokens + ragContextTokens + toolTokens;
        const usagePercent = (total / contextWindow) * 100;

        // Generate warnings
        const warnings = [];

        if (usagePercent > 85) {
            warnings.push({
                level: 'critical',
                message: `Context usage critical (${usagePercent.toFixed(1)}%). Request may fail.`
            });
        } else if (usagePercent > 70) {
            warnings.push({
                level: 'high',
                message: `Context usage high (${usagePercent.toFixed(1)}%). Consider truncating.`
            });
        } else if (usagePercent > 50) {
            warnings.push({
                level: 'medium',
                message: `Context usage moderate (${usagePercent.toFixed(1)}%).`
            });
        }

        return {
            systemPromptTokens,
            messageTokens,
            ragContextTokens,
            toolTokens,
            total,
            contextWindow,
            usagePercent,
            warnings
        };
    },

    // Get recommended action based on token usage
    getRecommendedAction: function (tokenInfo) {
        const usage = tokenInfo.usagePercent;

        if (usage > 85) {
            return {
                action: 'truncate',
                message: 'Context window nearly full. Truncating older messages recommended.'
            };
        } else if (usage > 70) {
            return {
                action: 'warn_user',
                message: 'Context window approaching limit. Consider starting a new conversation.'
            };
        } else if (usage > 50) {
            return {
                action: 'monitor',
                message: 'Context usage is moderate. Monitor for further increases.'
            };
        }

        return {
            action: 'none',
            message: 'Token usage is healthy.'
        };
    },

    // Truncate request to target token count
    truncateToTarget: function (request, targetTokens) {
        const currentTokens = this.calculateRequestTokens(request);

        if (currentTokens.total <= targetTokens) {
            return request; // No truncation needed
        }

        const result = {
            systemPrompt: request.systemPrompt,
            messages: [...(request.messages || [])],
            ragContext: request.ragContext,
            tools: request.tools,
            model: request.model
        };

        // Calculate how many tokens we need to remove
        let tokensToRemove = currentTokens.total - targetTokens;

        // Strategy: Remove oldest messages first, but keep system prompt
        // Also preserve the most recent message

        // Start by removing RAG context if present (lowest priority)
        if (result.ragContext && tokensToRemove > 0) {
            const ragTokens = this.countTokens(result.ragContext);
            if (ragTokens <= tokensToRemove) {
                result.ragContext = null;
                tokensToRemove -= ragTokens;
            } else {
                // Partial truncation of RAG context (rare, but possible)
                const charsToKeep = Math.max(0, (ragTokens - tokensToRemove) * 4);
                result.ragContext = result.ragContext.substring(0, charsToKeep);
                tokensToRemove = 0;
            }
        }

        // Remove oldest messages while preserving recent ones
        const minMessages = 2; // Always keep at least 2 recent messages
        while (tokensToRemove > 0 && result.messages.length > minMessages) {
            const removedMessage = result.messages.shift(); // Remove oldest
            const removedTokens = this.countTokens(`${removedMessage.role}: ${removedMessage.content || ''}`);
            tokensToRemove -= removedTokens;
        }

        // If still over limit, truncate the oldest remaining message
        if (tokensToRemove > 0 && result.messages.length > 0) {
            const oldestMessage = result.messages[0];
            const currentMessageTokens = this.countTokens(`${oldestMessage.role}: ${oldestMessage.content || ''}`);
            const targetMessageTokens = Math.max(0, currentMessageTokens - tokensToRemove);
            const charsToKeep = targetMessageTokens * 4;

            oldestMessage.content = oldestMessage.content.substring(0, charsToKeep);
        }

        return result;
    },

    // Reset the token display UI (for new chat sessions)
    resetDisplay: function () {
        const tokenCount = document.getElementById('token-count');
        const tokenLimit = document.getElementById('token-limit');
        const tokenPercent = document.getElementById('token-percent');
        const tokenBarFill = document.getElementById('token-bar-fill');
        const tokenWarnings = document.getElementById('token-warnings');
        const tokenCounter = document.getElementById('token-counter');

        if (tokenCount) tokenCount.textContent = '0';
        if (tokenLimit) tokenLimit.textContent = this.getContextWindow().toLocaleString();
        if (tokenPercent) tokenPercent.textContent = '(0%)';
        if (tokenBarFill) tokenBarFill.style.width = '0%';
        if (tokenWarnings) tokenWarnings.innerHTML = '';

        // Optionally hide the counter until first message
        // if (tokenCounter) tokenCounter.style.display = 'none';

        console.log('[TokenCounter] Display reset');
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.TokenCounter = TokenCounter;
    console.log('[TokenCounter] Token counting module loaded');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TokenCounter;
}