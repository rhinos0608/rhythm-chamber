/**
 * Tool Call Handling Service
 * 
 * Handles LLM-requested tool calls with fallback support for models without native function calling.
 * Extracted from chat.js to separate tool call concerns from chat orchestration.
 * 
 * @module services/tool-call-handling-service
 */

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

    // Import strategies
    const { NativeToolStrategy } = require('./tool-strategies/native-strategy.js');
    const { PromptInjectionStrategy } = require('./tool-strategies/prompt-injection-strategy.js');
    const { IntentExtractionStrategy } = require('./tool-strategies/intent-extraction-strategy.js');

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

    // Try each strategy in order
    for (const strategy of toolStrategies) {
        if (strategy.canHandle(responseMessage, capabilityLevel)) {
            console.log(`[ToolCallHandlingService] Using ${strategy.constructor.name} (Level ${strategy.level})`);
            return strategy.execute(context);
        }
    }

    // Special case: Level 4 intent extraction (fallback of last resort)
    // Use strategyName property instead of instanceof (class not in scope)
    const intentStrategy = toolStrategies.find(s => s.strategyName === 'IntentExtractionStrategy');
    if (intentStrategy?.shouldAttemptExtraction?.(userMessage)) {
        console.log('[ToolCallHandlingService] Attempting Level 4 intent extraction');
        return intentStrategy.execute(context);
    }

    // Check if we still have native tool_calls (fallback for unknown model capability)
    if (responseMessage?.tool_calls?.length > 0) {
        console.log('[ToolCallHandlingService] Native tool calls found in response');
        return handleToolCalls(responseMessage, providerConfig, key, onProgress);
    }

    // No function calls to handle
    return { responseMessage };
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

// Make available globally for backwards compatibility
if (typeof window !== 'undefined') {
    window.ToolCallHandlingService = ToolCallHandlingService;
}

console.log('[ToolCallHandlingService] Service loaded');
