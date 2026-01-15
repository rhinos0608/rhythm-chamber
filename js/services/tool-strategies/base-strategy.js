/**
 * Base Tool Strategy Interface
 * Implements Strategy pattern for function calling capability levels
 * 
 * HNW Architecture:
 * - Hierarchy: Strategies are selected based on capability level
 * - Network: Strategies communicate through shared context object
 * - Wave: Each strategy handles one execution cycle
 * 
 * @module tool-strategies/base-strategy
 */

export class BaseToolStrategy {
    /**
     * @param {Object} dependencies - Shared dependencies
     * @param {Object} dependencies.CircuitBreaker - Circuit breaker for rate limiting
     * @param {Object} dependencies.Functions - Function registry
     * @param {Object} dependencies.SessionManager - Session management
     * @param {Object} dependencies.FunctionCallingFallback - Fallback utilities
     * @param {number} dependencies.timeoutMs - Execution timeout in ms
     */
    constructor(dependencies = {}) {
        this.CircuitBreaker = dependencies.CircuitBreaker;
        this.Functions = dependencies.Functions;
        this.SessionManager = dependencies.SessionManager;
        this.FunctionCallingFallback = dependencies.FunctionCallingFallback;
        this.TIMEOUT_MS = dependencies.timeoutMs || 30000;
    }

    /** 
     * Capability level this strategy handles
     * @returns {number} Level 1-4
     */
    get level() {
        throw new Error('Must implement level getter');
    }

    /**
     * Check if this strategy can handle the given response
     * Returns a confidence object for strategy voting
     * 
     * @param {Object} responseMessage - LLM response message
     * @param {number} capabilityLevel - Detected capability level
     * @returns {{ confidence: number, reason: string }} Confidence 0-1 with reason
     */
    canHandle(responseMessage, capabilityLevel) {
        throw new Error('Must implement canHandle');
    }

    /**
     * Helper to create confidence result
     * @param {number} confidence - 0-1 confidence score
     * @param {string} reason - Human-readable reason
     * @returns {{ confidence: number, reason: string }}
     */
    confidence(confidence, reason) {
        return { confidence: Math.max(0, Math.min(1, confidence)), reason };
    }

    /**
     * Execute the strategy
     * @param {Object} context - Execution context
     * @param {Object} context.responseMessage - LLM response
     * @param {Object} context.providerConfig - Provider configuration
     * @param {string} context.key - API key
     * @param {Function} context.onProgress - Progress callback
     * @param {number} context.capabilityLevel - Capability level
     * @param {Array} context.tools - Available tools
     * @param {Array} context.messages - Message history
     * @param {string} context.userMessage - Original user message
     * @param {Array} context.streamsData - User's streaming data
     * @param {Function} context.buildSystemPrompt - System prompt builder
     * @param {Function} context.callLLM - LLM call function
     * @returns {Promise<{responseMessage?: Object, earlyReturn?: Object}>}
     */
    async execute(context) {
        throw new Error('Must implement execute');
    }

    /**
     * Check circuit breaker before execution
     * @param {Function} onProgress - Progress callback
     * @returns {{blocked: boolean, reason?: string, errorReturn?: Object}}
     */
    checkCircuitBreaker(onProgress) {
        if (this.CircuitBreaker?.check) {
            const check = this.CircuitBreaker.check();
            if (!check.allowed) {
                if (onProgress) {
                    onProgress({ type: 'circuit_breaker_trip', reason: check.reason });
                }
                return {
                    blocked: true,
                    reason: check.reason,
                    errorReturn: {
                        status: 'error',
                        content: this.CircuitBreaker.getErrorMessage(check.reason),
                        role: 'assistant',
                        isCircuitBreakerError: true
                    }
                };
            }
            this.CircuitBreaker.recordCall();
        }
        return { blocked: false };
    }

    /**
     * Execute a function with timeout protection
     * @param {string} functionName - Name of function to execute
     * @param {Object} args - Function arguments
     * @param {Array} streamsData - User's streaming data
     * @returns {Promise<Object>} Function result
     */
    async executeWithTimeout(functionName, args, streamsData) {
        // HNW Guard: Verify Functions dependency is initialized before execution
        if (!this.Functions || typeof this.Functions.execute !== 'function') {
            throw new Error('Functions dependency not initialized - cannot execute tool calls');
        }

        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), this.TIMEOUT_MS);

        try {
            const result = await this.Functions.execute(functionName, args, streamsData, {
                signal: abortController.signal
            });
            clearTimeout(timeoutId);
            return result;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error(`Function ${functionName} timed out after ${this.TIMEOUT_MS}ms`);
            }
            throw error;
        }
    }

    /**
     * Add message to session history
     * @param {Object} message - Message to add
     */
    addToHistory(message) {
        if (this.SessionManager?.addMessageToHistory) {
            this.SessionManager.addMessageToHistory(message);
        }
    }

    /**
     * Get current session history
     * @returns {Array}
     */
    getHistory() {
        return this.SessionManager?.getHistory?.() || [];
    }
}

// Export for ES module usage
export default BaseToolStrategy;
