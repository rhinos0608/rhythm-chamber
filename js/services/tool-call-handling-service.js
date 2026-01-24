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
import { ProviderHealthAuthority } from './provider-health-authority.js';

'use strict';

// ==========================================
// Dependencies (injected via init)
// ==========================================

let _CircuitBreaker = null; // Kept for backward compatibility, now uses ProviderHealthAuthority
let _Functions = null;
let _SessionManager = null;
let _FunctionCallingFallback = null;
let _buildSystemPrompt = null;
let _callLLM = null;
let _ConversationOrchestrator = null;
let _timeoutMs = 30000;

// Retry configuration
const MAX_FUNCTION_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 300;

// ==========================================
// State Management
// ==========================================

let toolStrategies = null;

// ==========================================
// Utility Functions
// ==========================================

/**
 * Generate a unique ID for tool calls
 * Used as fallback when toolCall.id is missing
 * @returns {string} A unique identifier
 */
function generateToolCallId() {
    // Use crypto.randomUUID if available, otherwise fall back to timestamp + random
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ==========================================
// Retry Helpers
// ==========================================

/**
 * Check if an error is retryable (transient)
 * EDGE CASE FIX: AbortError is NOT retryable as it indicates intentional cancellation
 * (budget exhausted, user stopped, or timeout). Retrying after abort causes
 * duplicate actions on operations that succeeded server-side before timeout.
 *
 * @param {Error} err - The error to check
 * @param {AbortSignal} [signal] - Optional AbortSignal to check for aborted state
 * @returns {boolean} Whether the error is retryable
 */
function isRetryableError(err, signal = null) {
    if (!err) return false;

    // EDGE CASE FIX: AbortError is NOT retryable
    // An abort indicates intentional cancellation, not a transient failure.
    // Retrying after abort causes duplicate tool executions.
    if (err.name === 'AbortError') {
        return false;
    }

    // EDGE CASE FIX: Check signal state even if error isn't AbortError
    // This catches cases where timeout occurred but error type doesn't match
    if (signal?.aborted) {
        return false;
    }

    const msg = (err.message || '').toLowerCase();
    return msg.includes('timeout') ||
        msg.includes('rate limit') ||
        msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('network') ||
        msg.includes('fetch') ||
        msg.includes('temporary');
}

/**
 * Check if a function result indicates a validation error
 * @param {Object} result - Function execution result
 * @returns {boolean} Whether the result has validation errors
 */
function hasValidationError(result) {
    return result?.validationErrors && Array.isArray(result.validationErrors) && result.validationErrors.length > 0;
}

/**
 * Delay with exponential backoff
 * @param {number} attempt - Current attempt number
 * @returns {Promise<void>}
 */
function retryDelay(attempt) {
    const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
    const jitter = Math.random() * 50;
    return new Promise(resolve => setTimeout(resolve, delay + jitter));
}

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
    _ConversationOrchestrator = dependencies.ConversationOrchestrator;
    _timeoutMs = dependencies.timeoutMs || 30000;

    console.log('[ToolCallHandlingService] Initialized with dependencies');
}

/**
 * Get streams data from ConversationOrchestrator (single source of truth)
 * @returns {Array} Streaming history data
 */
function getStreamsData() {
    return _ConversationOrchestrator?.getStreamsData() || null;
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
        await _SessionManager.addMessageToHistory({
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

        // CRITICAL FIX: Record call AFTER successful argument parsing
        // Previously, parse failures were counted against the circuit breaker,
        // causing premature trips when LLMs return malformed JSON
        if (_CircuitBreaker?.recordCall) {
            _CircuitBreaker.recordCall();
        }

        console.log(`[ToolCallHandlingService] Executing function: ${functionName}`, args);

        // Notify UI: Tool start
        if (onProgress) onProgress({ type: 'tool_start', tool: functionName });

        // Allocate timeout budget for this function call (max 10s per call)
        // This ensures we don't exceed the 50s total budget for 5 calls
        const functionBudget = TimeoutBudget.allocate(`function_${functionName}`, 10000);

        // MEMORY LEAK FIX: Ensure budget is always released, even on early return
        try {
            // Execute with retry logic for transient errors and validation issues
            let result;
            let lastError;
            let succeeded = false;

            for (let attempt = 0; attempt <= MAX_FUNCTION_RETRIES && !succeeded; attempt++) {
                try {
                    // Guard: Check if Functions is available
                    if (!_Functions || typeof _Functions.execute !== 'function') {
                        throw new Error(`Functions service not available - cannot execute ${functionName}`);
                    }

                    result = await _Functions.execute(functionName, args, getStreamsData(), {
                        signal: functionBudget.signal
                    });

                    // Check if aborted while executing
                    if (result?.aborted) {
                        throw new Error(`Function ${functionName} timed out`);
                    }

                    // MEDIUM PRIORITY FIX: Do NOT retry validation errors
                    // Validation errors are caused by invalid input data - retrying with the same
                    // arguments will always fail. This wastes retry attempts that could be used
                    // for transient network/timeout errors instead.
                    if (hasValidationError(result)) {
                        console.error(`[ToolCallHandlingService] Validation error for ${functionName} (not retrying):`, result.validationErrors);
                        lastError = new Error(`Validation failed: ${result.validationErrors.join(', ')}`);
                        // Break immediately - don't waste retry attempts on permanent validation failures
                        break;
                    }

                    // PREMIUM GATE: Check if function requires premium
                    // Do NOT retry premium requirement - show upgrade modal instead
                    if (result?.premium_required) {
                        console.log(`[ToolCallHandlingService] Premium required for ${functionName}:`, result.error);
                        // PremiumController already showed the modal from within the function
                        // Return early with the error so the LLM can explain to the user
                        return {
                            earlyReturn: {
                                status: 'premium_required',
                                content: result.error || 'This feature requires Premium.',
                                functionName,
                                premiumFeatures: result.premiumFeatures
                            }
                        };
                    }

                    // Check for function execution errors in result
                    if (result?.error) {
                        if (attempt < MAX_FUNCTION_RETRIES && isRetryableError(new Error(result.error), functionBudget.signal)) {
                            console.warn(`[ToolCallHandlingService] Retryable error for ${functionName} (attempt ${attempt + 1}): ${result.error}`);
                            await retryDelay(attempt);
                            lastError = new Error(result.error);
                            continue;
                        }
                        // Non-retryable error or last attempt - use this result
                        break;
                    }

                    succeeded = true;
                } catch (funcError) {
                    lastError = funcError;

                    if (attempt < MAX_FUNCTION_RETRIES && isRetryableError(funcError, functionBudget.signal)) {
                        console.warn(`[ToolCallHandlingService] Retryable error for ${functionName} (attempt ${attempt + 1}): ${funcError.message}`);
                        await retryDelay(attempt);
                        continue;
                    }
                    // Non-retryable error or last attempt
                    console.error(`[ToolCallHandlingService] Function execution failed after ${attempt + 1} attempts:`, funcError);
                    break;
                }
            }

            // If we never succeeded and have a last error, return error status
            if (!succeeded && lastError && !result?.error) {
                // Notify UI: Tool error
                if (onProgress) onProgress({ type: 'tool_end', tool: functionName, error: true });

                return {
                    earlyReturn: {
                        status: 'error',
                        content: `Function call '${functionName}' failed after ${MAX_FUNCTION_RETRIES + 1} attempts: ${lastError.message}. Please try again.`,
                        role: 'assistant',
                        isFunctionError: true
                    }
                };
            }

            // Even if not fully successful, if we have a result, use it (e.g., validation error result)
            console.log(`[ToolCallHandlingService] Function result:`, result);

            // EDGE CASE FIX: Distinguish between "intentionally empty" and "unexpectedly empty" results
            // Empty tool results can cause LLM parsing issues on follow-up call
            // A result with { _empty: true } or { result: '' } is intentionally empty (e.g., no data found)
            // A result that is null/undefined/0-length object is unexpectedly empty (likely an error)
            const isIntentionallyEmpty = result &&
                typeof result === 'object' &&
                (result._empty === true || result._intentionallyEmpty === true);

            const hasValidContent = result !== null && result !== undefined &&
                !(typeof result === 'string' && result.trim() === '' && !isIntentionallyEmpty) &&
                !(typeof result === 'object' && Object.keys(result).length === 0 && !isIntentionallyEmpty);

            if (!hasValidContent) {
                console.warn(`[ToolCallHandlingService] Tool ${functionName} returned empty result, using placeholder`);
                result = { result: '(No output)', _empty: true };
            }

            // Notify UI: Tool end
            if (onProgress) onProgress({ type: 'tool_end', tool: functionName, result });

            // Add tool result to conversation
            if (_SessionManager?.addMessageToHistory) {
                // EDGE CASE FIX: Handle circular references in tool result serialization
                // JSON.stringify throws on circular references, causing tool results to be lost
                let content;
                try {
                    content = JSON.stringify(result);
                } catch (stringifyError) {
                    // Fallback for circular references or unserializable data
                    console.warn(`[ToolCallHandlingService] Failed to stringify tool result for ${functionName}:`, stringifyError.message);
                    content = JSON.stringify({
                        result: '(Result contains unserializable data)',
                        _error: 'Unserializable result'
                    });
                }

                await _SessionManager.addMessageToHistory({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: content
                });
            }

            // Continue to next tool call (no early return)
            continue;
        } finally {
            // MEMORY LEAK FIX: Always release budget, even on error or early return
            TimeoutBudget.release(functionBudget);
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

    // Guard: Wrap follow-up LLM call in try/catch to preserve tool results if summary fails
    let response;
    try {
        response = await _callLLM(providerConfig, key, followUpMessages, undefined);
    } catch (llmError) {
        console.error('[ToolCallHandlingService] Follow-up summary generation failed:', llmError);
        // Return early with partial success status - tools executed but summary failed
        return {
            earlyReturn: {
                status: 'partial_success',
                content: `Tools executed successfully, but final summary generation failed (${llmError.message}). Please try again.`,
                role: 'assistant',
                isFunctionError: true,
                toolsSucceeded: true
            }
        };
    }
    // HNW Guard: response.choices may be undefined or empty
    const choices = Array.isArray(response?.choices) ? response.choices : [];
    const message = choices[0]?.message;

    return { responseMessage: message || responseMessage };
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
            streamsData: getStreamsData(),
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

        // ==========================================
        // HNW Wave: Parallel Strategy Execution
        // Race all qualifying strategies using Promise.race for fastest response
        // ==========================================

        if (candidates.length === 0) {
            // No qualifying strategies - check for native tool_calls fallback
            if (responseMessage?.tool_calls?.length > 0) {
                console.log('[ToolCallHandlingService] Native tool calls found in response (fallback)');
                return handleToolCalls(responseMessage, providerConfig, key, onProgress);
            }
            return { responseMessage };
        }

        // Provide remaining budget to context
        const remainingMs = strategyBudget.remaining();
        context.timeoutMs = Math.min(remainingMs, 10000); // Max 10s per strategy

        console.log(`[ToolCallHandlingService] Racing ${candidates.length} strategies with ${context.timeoutMs}ms budget`);

        // Create shared AbortController for strategy cancellation
        // When one strategy succeeds, others can be aborted to save resources
        const raceAbortController = new AbortController();

        // Add abort signal to context for all strategies
        context.abortSignal = raceAbortController.signal;

        // Create race promises for each strategy - wrap to throw on failure so firstSuccess works
        const racePromises = candidates.map((candidate) => (async () => {
            // Check if already aborted (another strategy won)
            if (raceAbortController.signal.aborted) {
                throw new Error(`${candidate.strategy.strategyName}: Cancelled - another strategy won`);
            }

            try {
                const result = await candidate.strategy.execute(context);

                // Only return successful results - throw on errors to trigger next strategy
                if (result && !result.earlyReturn?.status?.includes('error')) {
                    // Check if any function calls returned errors (even though strategy completed)
                    if (result.hadFunctionErrors) {
                        const errorSummary = result.functionErrors
                            ?.map(e => `${e.function}: ${e.error}`)
                            .join('; ');
                        console.warn(`[ToolCallHandlingService] Strategy ${candidate.strategy.strategyName} completed with function errors: ${errorSummary}`);
                    } else {
                        console.log(`[ToolCallHandlingService] Strategy ${candidate.strategy.strategyName} succeeded`);
                    }
                    // Abort other strategies since we won
                    raceAbortController.abort();
                    return result;
                }

                // Strategy returned an error - check if it was due to function errors
                if (result.earlyReturn?.hadFunctionErrors) {
                    const errorSummary = result.earlyReturn.functionErrors
                        ?.map(e => `${e.function}: ${e.error}`)
                        .join('; ') || result.earlyReturn.content;
                    console.warn(`[ToolCallHandlingService] Strategy ${candidate.strategy.strategyName} failed with function errors: ${errorSummary}`);
                } else {
                    console.warn(`[ToolCallHandlingService] Strategy ${candidate.strategy.strategyName} failed: ${result?.earlyReturn?.content || 'Unknown error'}`);
                }

                // Throw to let other strategies try
                throw new Error(result?.earlyReturn?.content || 'Strategy failed');
            } catch (strategyError) {
                // Re-throw to let Promise.any try next strategy
                throw new Error(`${candidate.strategy.strategyName}: ${strategyError.message}`);
            }
        })());

        // Add timeout promise that rejects - used consistently for both Promise.any and polyfill
        // When timeout occurs, abort all pending strategies
        const timeoutPromise = new Promise((_, reject) => {
            const timeoutId = setTimeout(() => {
                raceAbortController.abort();
                reject(new Error('All strategies timed out'));
            }, context.timeoutMs);
            // Store timeoutId for cleanup (not needed since abort is idempotent)
        });

        try {
            // Use Promise.any for true first-success-wins (or polyfill if unavailable)
            // Promise.any resolves as soon as ANY promise resolves, ignoring rejections
            let successfulResult;

            if (typeof Promise.any === 'function') {
                // Modern browsers: Promise.any with timeout as a competing promise
                successfulResult = await Promise.any([...racePromises, timeoutPromise]);
            } else {
                // Fallback for older browsers: custom first-success implementation
                // Mirrors Promise.any semantics exactly - timeout only wins when all racePromises reject
                successfulResult = await new Promise((resolve, reject) => {
                    let pendingCount = racePromises.length;
                    const errors = [];
                    let settled = false;

                    // Wire up race promises
                    racePromises.forEach((promise, i) => {
                        promise.then(
                            (result) => {
                                // CRITICAL FIX: Atomic check-and-set to prevent race condition
                                // Multiple promises could resolve in same microtask; only first should call resolve
                                if (!settled) {
                                    settled = true;
                                    // Abort other strategies since we won
                                    raceAbortController.abort();
                                    resolve(result);
                                }
                            },
                            (error) => {
                                errors[i] = error;
                                pendingCount--;
                                if (pendingCount === 0 && !settled) {
                                    // All strategies rejected - check if timeout wins
                                    settled = true;
                                    reject(new AggregateError(errors, 'All strategies failed'));
                                }
                            }
                        );
                    });

                    // Wire up timeout promise to compete with strategies
                    // If timeout resolves (rejects) first, it wins; otherwise strategies win
                    timeoutPromise.catch((timeoutError) => {
                        // CRITICAL FIX: Atomic check-and-set to prevent race condition
                        if (!settled) {
                            settled = true;
                            reject(timeoutError);
                        }
                    });
                });
            }

            return successfulResult;
        } catch (raceError) {
            // All strategies failed or timed out - check for native fallback
            console.warn(`[ToolCallHandlingService] Strategy race failed: ${raceError.message}`);

            if (responseMessage?.tool_calls?.length > 0) {
                console.log('[ToolCallHandlingService] Falling back to native tool calls');
                return handleToolCalls(responseMessage, providerConfig, key, onProgress);
            }

            // No function calls to handle
            return { responseMessage };
        }

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

    // Core operations
    handleToolCalls,
    handleToolCallsWithFallback,

    // Utilities
    getStreamsData,
    isCodeLikeToolArguments,
    buildToolCodeOnlyError
};

// ES Module export
export { ToolCallHandlingService };

console.log('[ToolCallHandlingService] Service loaded with strategy voting');
