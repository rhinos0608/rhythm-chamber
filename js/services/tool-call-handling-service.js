/**
 * Tool Call Handling Service
 *
 * Handles LLM-requested tool calls with fallback support for models without native function calling.
 * Extracted from chat.js to separate tool call concerns from chat orchestration.
 *
 * @module services/tool-call-handling-service
 */

import { NativeToolStrategy } from './tool-strategies/native-strategy.js';
import { PromptInjectionStrategy } from './tool-strategies/prompt-injection-strategy.js';
import { IntentExtractionStrategy } from './tool-strategies/intent-extraction-strategy.js';
import { TimeoutBudget } from './timeout-budget-manager.js';

'use strict';

// ==========================================
// Dependencies (injected via init)
// ==========================================

let _CircuitBreaker = null;
let _Functions = null;
let _SessionManager = null;
let _FunctionCallingFallback = null;
let _buildSystemPrompt = null;
let _callLLM = null;
let _streamsData = null;
let _timeoutMs = 30000;

// ==========================================
// State Management
// ==========================================

let toolStrategies = null;

// ==========================================
// Core Functions
// ==========================================

/**
 * Initialize ToolCallHandlingService with dependencies
 * @param {Object} dependencies - Required dependencies
 */
function init(dependencies) {
    _CircuitBreaker = dependencies.CircuitBreaker;
    _Functions = dependencies.Functions;
    _SessionManager = dependencies.SessionManager;
    _FunctionCallingFallback = dependencies.FunctionCallingFallback;
    _buildSystemPrompt = dependencies.buildSystemPrompt;
    _callLLM = dependencies.callLLM;
    _streamsData = dependencies.streamsData;
    _timeoutMs = dependencies.timeoutMs || 30000;

    console.log('[ToolCallHandlingService] Initialized with dependencies');
}

/**
 * Set streams data (can be called after init to update)
 * @param {Array} streams - Streaming history data
 */
function setStreamsData(streams) {
    _streamsData = streams;
}

/**
 * Execute LLM-requested tool calls and return the follow-up response message.
 * If a tool fails, returns an early result for the caller to surface.
 * 
 * CIRCUIT BREAKER: Max 5 function calls per turn, 30s timeout per function.
 * 
 * @param {object} responseMessage - LLM response message
 * @param {object} providerConfig - Provider configuration
 * @param {string} key - API key
 * @param {function} onProgress - Progress callback
 * @returns {Promise<{responseMessage?: object, earlyReturn?: object}>}
 */
async function handleToolCalls(responseMessage, providerConfig, key, onProgress) {
    if (!responseMessage?.tool_calls || responseMessage.tool_calls.length === 0) {
        return { responseMessage };
    }

    // Note: CircuitBreaker.resetTurn() is now called at the start of sendMessage()
    // to ensure reset happens for all messages, not just those with tool calls

    console.log('[ToolCallHandlingService] LLM requested tool calls:', responseMessage.tool_calls.map(tc => tc.function.name));

    // Add assistant's tool call message to conversation
    if (_SessionManager?.addMessageToHistory) {
        _SessionManager.addMessageToHistory({
            role: 'assistant',
            content: responseMessage.content || null,
            tool_calls: responseMessage.tool_calls
        });
    }

    // Execute each function call and add results
    // HNW Fix: Add timeout to prevent indefinite hangs
    // CIRCUIT BREAKER: Enforces max 5 calls per turn
    for (const toolCall of responseMessage.tool_calls) {
        // Check circuit breaker before each call
        if (_CircuitBreaker?.check) {
            const breakerCheck = _CircuitBreaker.check();
            if (!breakerCheck.allowed) {
                console.warn(`[ToolCallHandlingService] Circuit breaker tripped: ${breakerCheck.reason}`);
                if (onProgress) onProgress({ type: 'circuit_breaker_trip', reason: breakerCheck.reason });
                return {
                    earlyReturn: {
                        status: 'error',
                        content: _CircuitBreaker.getErrorMessage(breakerCheck.reason),
                        role: 'assistant',
                        isCircuitBreakerError: true
                    }
                };
            }
            // Record this call
            _CircuitBreaker.recordCall();
        }

        const functionName = toolCall.function.name;
        const rawArgs = toolCall.function.arguments || '{}';
        let args;

        try {
            args = rawArgs ? JSON.parse(rawArgs) : {};
        } catch (parseError) {
            console.warn(`[ToolCallHandlingService] Invalid tool call arguments for ${functionName}:`, rawArgs);

            if (onProgress) onProgress({ type: 'tool_end', tool: functionName, error: true });

            return {
                earlyReturn: {
                    status: 'error',
                    content: buildToolCodeOnlyError(functionName, rawArgs),
                    role: 'assistant',
                    isFunctionError: true
                }
            };
        }

        console.log(`[ToolCallHandlingService] Executing function: ${functionName}`, args);

        // Notify UI: Tool start
        if (onProgress) onProgress({ type: 'tool_start', tool: functionName });

        // Allocate timeout budget for this function call (max 10s per call)
        // This ensures we don't exceed the 50s total budget for 5 calls
        const functionBudget = TimeoutBudget.allocate(`function_${functionName}`, 10000);

        // Execute the function with AbortController for true cancellation
        // This enables proper cleanup when timeout occurs, rather than just ignoring the result
        let result;
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
            abortController.abort();
        }, _timeoutMs);

        try {
            // Guard: Check if Functions is available
            if (!_Functions || typeof _Functions.execute !== 'function') {
                clearTimeout(timeoutId);
                throw new Error(`Functions service not available - cannot execute ${functionName}`);
            }

            result = await _Functions.execute(functionName, args, _streamsData, {
                signal: abortController.signal
            });
            clearTimeout(timeoutId);

            // Check if aborted while executing
            if (result?.aborted) {
                throw new Error(`Function ${functionName} timed out after ${_timeoutMs}ms`);
            }
        } catch (funcError) {
            clearTimeout(timeoutId);
            console.error(`[ToolCallHandlingService] Function execution failed:`, funcError);

            // Notify UI: Tool error (optional state update)
            if (onProgress) onProgress({ type: 'tool_end', tool: functionName, error: true }); // Reset UI state

            // Return error status to allow UI to show retry
            return {
                earlyReturn: {
                    status: 'error',
                    content: `Function call '${functionName}' failed: ${funcError.message}. Please try again or select a different model.`,
                    role: 'assistant',
                    isFunctionError: true
                }
            };
        } finally {
            // Release the function budget
            TimeoutBudget.release(functionBudget);
        }

        console.log(`[ToolCallHandlingService] Function result:`, result);

        // Note: isCodeLikeToolArguments check removed here. The JSON parse failure
        // check above (line ~765) already catches malformed tool arguments including code.
        // Checking rawArgs again after successful execution creates false positives.

        // Notify UI: Tool end
        if (onProgress) onProgress({ type: 'tool_end', tool: functionName, result });

        // Add tool result to conversation
        if (_SessionManager?.addMessageToHistory) {
            _SessionManager.addMessageToHistory({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(result)
            });
        }
    }

    // Get updated history for follow-up call
    const updatedHistory = _SessionManager?.getHistory?.() || [];

    // Build system prompt (guard against missing function)
    const systemPrompt = typeof _buildSystemPrompt === 'function' ? _buildSystemPrompt() : '';

    // Make follow-up call with function results
    const followUpMessages = [
        { role: 'system', content: systemPrompt },
        ...updatedHistory
    ];

    // Notify UI: Thinking again (processing tool results)
    if (onProgress) onProgress({ type: 'thinking' });

    // Guard: Check if callLLM is available
    if (typeof _callLLM !== 'function') {
        console.error('[ToolCallHandlingService] _callLLM not available for follow-up call');
        return {
            earlyReturn: {
                status: 'error',
                content: 'LLM service not available for processing tool results. Please try again.',
                role: 'assistant',
                isFunctionError: true
            }
        };
    }

    const response = await _callLLM(providerConfig, key, followUpMessages, undefined);
    return { responseMessage: response.choices?.[0]?.message };
}

/**
 * Heuristic check for when the model returns code instead of JSON args
 */
function isCodeLikeToolArguments(rawArgs = '') {
    const trimmed = String(rawArgs || '').trim();

    if (!trimmed) {
        return false;
    }

    // Look for code-like patterns (backticks, declarations, arrows, function calls)
    const codePattern = /```|function\s|\bconst\b|\blet\b|\bvar\b|=>|return\s|;|\n/;

    if (codePattern.test(trimmed)) {
        return true;
    }

    // Simple function call shape like fn(...)
    return /^[A-Za-z_$][\w$]*\s*\(/.test(trimmed);
}

/**
 * Build a user-facing error message when tool calls look like code-only responses
 */
function buildToolCodeOnlyError(functionName, rawArgs) {
    const codeHint = isCodeLikeToolArguments(rawArgs);
    if (codeHint) {
        return `The AI tried to call '${functionName}' but only shared code for the call instead of executing it. Ask it to run the tool directly (no code blocks) or try again.`;
    }
    return `Function call '${functionName}' failed because the tool arguments were invalid. Please try again or select a different model.`;
}

// ==========================================
// Tool Strategy Initialization
// ==========================================

/**
 * Initialize tool strategies (lazy initialization)
 * Strategies are created once and reused for all function calls
 */
function initToolStrategies() {
    if (toolStrategies) return;

    const deps = {
        CircuitBreaker: _CircuitBreaker,
        Functions: _Functions,
        SessionManager: _SessionManager,
        FunctionCallingFallback: _FunctionCallingFallback,
        timeoutMs: _timeoutMs
    };

    // Strategies imported at module level via static ES imports

    toolStrategies = [
        new NativeToolStrategy(deps),
        new PromptInjectionStrategy(deps),
        new IntentExtractionStrategy(deps)
    ];

    // Add identifier for each strategy (used instead of instanceof check)
    toolStrategies.forEach(s => {
        s.strategyName = s.constructor.name;
    });

    console.log('[ToolCallHandlingService] Tool strategies initialized');
}

/**
 * Handle tool calls with fallback support for models without native function calling.
 * Uses Strategy pattern to delegate to appropriate handler based on capability level.
 * 
 * SHARED BUDGET: All strategies share a single 30s budget. This prevents 120s hangs
 * from 30s × 4 strategies. Budget is allocated dynamically to each strategy.
 * 
 * @param {object} responseMessage - LLM response message
 * @param {object} providerConfig - Provider configuration
 * @param {string} key - API key
 * @param {function} onProgress - Progress callback
 * @param {number} capabilityLevel - Detected capability level (1-4)
 * @param {Array} tools - Available function tools
 * @param {Array} messages - Original messages array
 * @param {string} userMessage - Original user message (for Level 4)
 * @returns {Promise<{responseMessage?: object, earlyReturn?: object}>}
 */
async function handleToolCallsWithFallback(
    responseMessage,
    providerConfig,
    key,
    onProgress,
    capabilityLevel,
    tools,
    messages,
    userMessage
) {
    // Initialize strategies on first use
    initToolStrategies();

    // ==========================================
    // SHARED BUDGET: 30s total across all strategies
    // ==========================================
    const TOTAL_STRATEGY_BUDGET_MS = 30000;
    const strategyBudget = TimeoutBudget.allocate('strategy_fallback', TOTAL_STRATEGY_BUDGET_MS);

    try {
        // Build execution context
        const context = {
            responseMessage,
            providerConfig,
            key,
            onProgress,
            capabilityLevel,
            tools,
            messages,
            userMessage,
            streamsData: _streamsData,
            buildSystemPrompt: _buildSystemPrompt,
            callLLM: _callLLM
        };

        // ==========================================
        // Strategy Voting System
        // Collect confidence scores from all strategies,
        // pick highest confidence (not first match)
        // ==========================================

        const candidates = [];

        for (const strategy of toolStrategies) {
            if (strategy.strategyName === 'IntentExtractionStrategy') {
                continue; // handled separately to avoid duplicates
            }

            const result = strategy.canHandle(responseMessage, capabilityLevel);

            if (result.confidence > 0) {
                candidates.push({
                    strategy,
                    confidence: result.confidence,
                    reason: result.reason
                });
            }
        }

        // Special case: IntentExtractionStrategy uses getIntentConfidence
        const intentStrategy = toolStrategies.find(s => s.strategyName === 'IntentExtractionStrategy');
        if (intentStrategy?.getIntentConfidence) {
            const intentResult = intentStrategy.getIntentConfidence(userMessage);
            if (intentResult.confidence > 0) {
                candidates.push({
                    strategy: intentStrategy,
                    confidence: intentResult.confidence,
                    reason: intentResult.reason
                });
            }
        }

        // Sort by confidence (highest first)
        candidates.sort((a, b) => b.confidence - a.confidence);

        // Log voting results for debugging
        if (candidates.length > 0) {
            console.log('[ToolCallHandlingService] Strategy voting results:',
                candidates.map(c => `${c.strategy.strategyName}: ${c.confidence.toFixed(2)} (${c.reason})`));
        }

        // Try strategies in order of confidence until one succeeds or budget exhausted
        for (const candidate of candidates) {
            // Check if budget exhausted before trying next strategy
            if (strategyBudget.isExhausted()) {
                const budgetInfo = strategyBudget.getAccounting();
                console.warn(`[ToolCallHandlingService] Strategy budget exhausted after ${budgetInfo.elapsed}ms`);

                // Notify UI about timeout
                if (onProgress) {
                    onProgress({ type: 'strategy_timeout', elapsed: budgetInfo.elapsed });
                }

                return {
                    earlyReturn: {
                        status: 'error',
                        content: buildTimeoutExhaustedError(budgetInfo.elapsed),
                        role: 'assistant',
                        isTimeoutError: true
                    }
                };
            }

            // Provide remaining budget to strategy
            const remainingMs = strategyBudget.remaining();
            context.timeoutMs = remainingMs;

            console.log(`[ToolCallHandlingService] Trying ${candidate.strategy.strategyName} (confidence: ${candidate.confidence.toFixed(2)}, budget: ${remainingMs}ms remaining)`);

            try {
                const result = await candidate.strategy.execute(context);

                // Strategy succeeded
                if (result && !result.earlyReturn?.status?.includes('error')) {
                    return result;
                }

                // Strategy returned an error - continue to next if budget permits
                if (result?.earlyReturn) {
                    console.log(`[ToolCallHandlingService] ${candidate.strategy.strategyName} returned error, trying next strategy`);
                    continue;
                }

                return result;
            } catch (strategyError) {
                // Strategy threw - log and continue to next
                console.error(`[ToolCallHandlingService] ${candidate.strategy.strategyName} threw:`, strategyError);
                continue;
            }
        }

        // No winning strategy or all failed - check for native tool_calls fallback
        if (responseMessage?.tool_calls?.length > 0) {
            console.log('[ToolCallHandlingService] Native tool calls found in response (fallback)');
            return handleToolCalls(responseMessage, providerConfig, key, onProgress);
        }

        // No function calls to handle
        return { responseMessage };

    } finally {
        // Always release budget
        TimeoutBudget.release(strategyBudget);
    }
}

/**
 * Build user-friendly error message for strategy timeout exhaustion
 * @param {number} elapsedMs - Time elapsed before timeout
 * @returns {string}
 */
function buildTimeoutExhaustedError(elapsedMs) {
    const seconds = Math.round(elapsedMs / 1000);
    return `⏱️ **Request timed out** after ${seconds} seconds.

This can happen when:
• The AI model is slow to respond
• Your query requires complex data processing
• Network latency is high

**Suggestions:**
1. **Try a faster model** — Switch to a lighter model like "gpt-4o-mini" or enable "Ollama" for local processing
2. **Simplify your question** — Ask about a specific year or artist instead of your entire history
3. **Wait and retry** — The service may be temporarily overloaded

You can change your AI model in Settings (⚙️).`;
}

// ==========================================
// Public API
// ==========================================

const ToolCallHandlingService = {
    // Lifecycle
    init,
    setStreamsData,

    // Core operations
    handleToolCalls,
    handleToolCallsWithFallback,

    // Utilities
    isCodeLikeToolArguments,
    buildToolCodeOnlyError
};

// ES Module export
export { ToolCallHandlingService };

console.log('[ToolCallHandlingService] Service loaded with strategy voting');
