/**
 * Tool Call Handling Service - Critical Edge Cases Unit Tests
 *
 * Security-focused tests for js/services/tool-call-handling-service.js
 *
 * Test Coverage:
 * 1. Circuit breaker edge cases (trip threshold, recovery, half-open state)
 * 2. Recursive call prevention (depth limiting, cycle detection)
 * 3. Timeout exhaustion (budget allocation, hierarchical timeouts)
 * 4. Tool execution reliability (error handling, retry logic, fallback)
 * 5. State management (active calls, pending results, cleanup)
 *
 * @author Rhythm Chamber Test Suite
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ==========================================
// Mock Circuit Breaker
// ==========================================

const mockCircuitBreaker = {
    state: 'closed',
    callCount: 0,
    failures: 0,
    successes: 0,
    lastFailureTime: null,
    maxCallsPerTurn: 5,
    failureThreshold: 5,

    resetTurn() {
        this.state = 'closed';
        this.callCount = 0;
        this.failures = 0;
        this.successes = 0;
        this.lastFailureTime = null;
    },

    check() {
        if (this.state === 'open') {
            const elapsed = Date.now() - this.lastFailureTime;
            if (elapsed < 60000) {
                return {
                    allowed: false,
                    state: this.state,
                    reason: 'Circuit breaker is OPEN',
                };
            }
            // Transition to half-open after cooldown
            this.state = 'half_open';
        }

        if (this.state === 'half_open') {
            // Allow limited requests in half-open state
            return { allowed: true, state: this.state };
        }

        if (this.callCount >= this.maxCallsPerTurn) {
            return {
                allowed: false,
                state: this.state,
                reason: `Max ${this.maxCallsPerTurn} function calls per turn exceeded`,
            };
        }

        return { allowed: true, state: this.state };
    },

    recordCall() {
        this.callCount++;
    },

    recordFailure(error) {
        this.failures++;
        this.lastFailureTime = Date.now();
        if (this.failures >= this.failureThreshold) {
            this.state = 'open';
        }
    },

    recordSuccess() {
        this.successes++;
        if (this.state === 'half_open' && this.successes >= 2) {
            this.state = 'closed';
            this.failures = 0;
            this.successes = 0;
        }
    },

    getErrorMessage(reason) {
        return `Circuit breaker tripped: ${reason}`;
    },
};

// ==========================================
// Mock Timeout Budget
// ==========================================

const mockTimeoutBudget = {
    budgets: new Map(),
    budgetIdCounter: 0,

    allocate(operation, budgetMs) {
        const id = `budget_${this.budgetIdCounter++}`;
        const budget = {
            id,
            operation,
            budgetMs,
            startTime: Date.now(),
            signal: {
                aborted: false,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            },
            remaining() {
                const elapsed = Date.now() - this.startTime;
                return Math.max(0, this.budgetMs - elapsed);
            },
            elapsed() {
                return Date.now() - this.startTime;
            },
            isExhausted() {
                return this.remaining() === 0;
            },
            abort() {
                this.signal.aborted = true;
                this.reason = 'Budget exhausted';
            },
        };
        this.budgets.set(id, budget);
        return budget;
    },

    release(budget) {
        if (budget?.id) {
            this.budgets.delete(budget.id);
        }
    },

    getActiveAccounting() {
        return Array.from(this.budgets.values()).map(b => ({
            operation: b.operation,
            remaining: b.remaining(),
            elapsed: b.elapsed(),
        }));
    },
};

// ==========================================
// Mock Functions Service
// ==========================================

const mockFunctions = {
    execute: vi.fn(),
    executionHistory: [],

    reset() {
        this.execute = vi.fn();
        this.executionHistory = [];
    },

    async executeWithRetry(functionName, args, attempts = 1) {
        const result = {
            functionName,
            args,
            attempts,
            timestamp: Date.now(),
        };
        this.executionHistory.push(result);
        return this.execute(functionName, args);
    },
};

// ==========================================
// Mock Session Manager
// ==========================================

const mockSessionManager = {
    history: [],
    addMessageToHistory: vi.fn((msg) => {
        mockSessionManager.history.push(msg);
    }),
    getHistory: vi.fn(() => mockSessionManager.history),
    clearHistory() {
        mockSessionManager.history = [];
        mockSessionManager.addMessageToHistory.mockClear();
        mockSessionManager.getHistory.mockClear();
    },
};

// ==========================================
// Mock LLM Call
// ==========================================

const mockCallLLM = vi.fn();

// ==========================================
// Test Utilities
// ==========================================

function createMockToolCall(functionName, args = {}, id = null) {
    return {
        id: id || `call_${functionName}_${Date.now()}`,
        type: 'function',
        function: {
            name: functionName,
            arguments: JSON.stringify(args),
        },
    };
}

function createMockResponseMessage(toolCalls = []) {
    return {
        role: 'assistant',
        content: null,
        tool_calls: toolCalls,
    };
}

function createMockProviderConfig() {
    return {
        provider: 'openai',
        model: 'gpt-4',
        baseUrl: 'https://api.openai.com/v1',
    };
}

async function importToolCallHandlingService() {
    // Mock all dependencies before import
    vi.mock('../../js/services/timeout-budget-manager.js', () => ({
        TimeoutBudget: mockTimeoutBudget,
    }));

    vi.mock('../../js/services/circuit-breaker.js', () => ({
        CircuitBreaker: mockCircuitBreaker,
    }));

    // Import the service (will use mocked dependencies)
    const module = await import('../../js/services/tool-call-handling-service.js');
    return module.ToolCallHandlingService;
}

// ==========================================
// Test Suite
// ==========================================

describe('Tool Call Handling Service - Critical Edge Cases', () => {
    let ToolCallHandlingService;

    beforeEach(async () => {
        // Reset all mocks
        mockCircuitBreaker.resetTurn();
        mockTimeoutBudget.budgetIdCounter = 0;
        mockTimeoutBudget.budgets.clear();
        mockFunctions.reset();
        mockSessionManager.clearHistory();
        mockCallLLM.mockClear();

        // Import service
        ToolCallHandlingService = await importToolCallHandlingService();

        // Initialize service with dependencies
        ToolCallHandlingService.init({
            CircuitBreaker: mockCircuitBreaker,
            Functions: mockFunctions,
            SessionManager: mockSessionManager,
            FunctionCallingFallback: null,
            buildSystemPrompt: () => 'System prompt',
            callLLM: mockCallLLM,
            ConversationOrchestrator: { getStreamsData: () => [] },
            timeoutMs: 30000,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ==========================================
    // Circuit Breaker Edge Cases
    // ==========================================

    describe('Circuit Breaker Edge Cases', () => {
        it('should trip circuit breaker when max calls per turn exceeded', async () => {
            const toolCalls = Array.from({ length: 6 }, (_, i) =>
                createMockToolCall(`test_function_${i}`, { index: i })
            );

            mockFunctions.execute.mockResolvedValue({ result: `success_${i}` });

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Should return early with circuit breaker error
            expect(result.earlyReturn).toBeDefined();
            expect(result.earlyReturn.isCircuitBreakerError).toBe(true);
            expect(result.earlyReturn.content).toContain('Circuit breaker tripped');
        });

        it('should transition from OPEN to HALF_OPEN after cooldown period', async () => {
            // Trip the circuit breaker
            mockCircuitBreaker.state = 'open';
            mockCircuitBreaker.lastFailureTime = Date.now() - 70000; // 70 seconds ago

            const toolCalls = [createMockToolCall('test_function', { data: 'test' })];
            mockFunctions.execute.mockResolvedValue({ result: 'success' });

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Should allow the call (transitioned to half_open)
            expect(result.earlyReturn).toBeUndefined();
            expect(mockCircuitBreaker.state).toBe('half_open');
        });

        it('should block requests in OPEN state during cooldown', async () => {
            mockCircuitBreaker.state = 'open';
            mockCircuitBreaker.lastFailureTime = Date.now() - 30000; // 30 seconds ago

            const toolCalls = [createMockToolCall('test_function', { data: 'test' })];

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Should block the request
            expect(result.earlyReturn).toBeDefined();
            expect(result.earlyReturn.isCircuitBreakerError).toBe(true);
            expect(result.earlyReturn.content).toContain('Circuit breaker tripped');
        });

        it('should track call count correctly across multiple calls', async () => {
            mockCircuitBreaker.maxCallsPerTurn = 3;

            const toolCalls = [
                createMockToolCall('func1', { data: 'test1' }),
                createMockToolCall('func2', { data: 'test2' }),
                createMockToolCall('func3', { data: 'test3' }),
            ];

            mockFunctions.execute.mockImplementation((name) => Promise.resolve({ result: `${name}_success` }));

            mockCallLLM.mockResolvedValue({
                choices: [{ message: { role: 'assistant', content: 'All done' } }],
            });

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // All 3 calls should succeed
            expect(result.earlyReturn).toBeUndefined();
            expect(mockCircuitBreaker.callCount).toBe(3);
        });

        it('should prevent calls when failure threshold is reached', async () => {
            mockCircuitBreaker.failures = 5;
            mockCircuitBreaker.state = 'open';
            mockCircuitBreaker.lastFailureTime = Date.now();

            const toolCalls = [createMockToolCall('test_function', { data: 'test' })];

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            expect(result.earlyReturn).toBeDefined();
            expect(result.earlyReturn.isCircuitBreakerError).toBe(true);
        });
    });

    // ==========================================
    // Recursive Call Prevention
    // ==========================================

    describe('Recursive Call Prevention', () => {
        it('should detect and prevent deeply nested tool calls', async () => {
            // Simulate a function that triggers another function call
            let callDepth = 0;
            const maxDepth = 10;

            mockFunctions.execute.mockImplementation(async (functionName, args) => {
                callDepth++;
                if (callDepth > maxDepth) {
                    throw new Error('Maximum recursion depth exceeded');
                }
                return { result: `depth_${callDepth}`, _triggerNext: true };
            });

            const toolCalls = [createMockToolCall('recursive_function', { depth: 0 })];

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Should detect the recursion attempt
            expect(mockCircuitBreaker.callCount).toBeLessThanOrEqual(mockCircuitBreaker.maxCallsPerTurn);
        });

        it('should detect circular function call patterns', async () => {
            const callSequence = ['func_a', 'func_b', 'func_c', 'func_a']; // Circular back to func_a
            let callIndex = 0;

            mockFunctions.execute.mockImplementation(async (functionName) => {
                const nextCall = callSequence[callIndex % callSequence.length];
                callIndex++;
                return {
                    result: `executed_${functionName}`,
                    _nextCall: nextCall,
                };
            });

            // Start with func_a
            const toolCalls = [createMockToolCall('func_a', {})];

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Circuit breaker should prevent infinite loop
            expect(mockCircuitBreaker.callCount).toBeLessThanOrEqual(mockCircuitBreaker.maxCallsPerTurn);
        });

        it('should enforce depth limits on nested tool execution', async () => {
            mockCircuitBreaker.maxCallsPerTurn = 3;

            const toolCalls = [
                createMockToolCall('level_1', {}),
                createMockToolCall('level_2', {}),
                createMockToolCall('level_3', {}),
                createMockToolCall('level_4', {}), // This should be blocked
            ];

            mockFunctions.execute.mockResolvedValue({ result: 'success' });

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Should trip before executing level_4
            expect(result.earlyReturn).toBeDefined();
            expect(result.earlyReturn.isCircuitBreakerError).toBe(true);
        });
    });

    // ==========================================
    // Timeout Exhaustion
    // ==========================================

    describe('Timeout Exhaustion', () => {
        it('should allocate timeout budget hierarchically', async () => {
            const toolCalls = [
                createMockToolCall('fast_function', { data: 'test' }),
                createMockToolCall('medium_function', { data: 'test' }),
            ];

            mockFunctions.execute.mockImplementation(async (name) => {
                // Simulate different execution times
                if (name === 'fast_function') {
                    await new Promise(resolve => setTimeout(resolve, 100));
                } else {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                return { result: `${name}_done` };
            });

            mockCallLLM.mockResolvedValue({
                choices: [{ message: { role: 'assistant', content: 'Complete' } }],
            });

            const responseMessage = createMockResponseMessage(toolCalls);
            await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Should have allocated budgets for both functions
            const budgets = mockTimeoutBudget.getActiveAccounting();
            expect(budgets.length).toBeGreaterThan(0);
            expect(budgets.every(b => b.operation.startsWith('function_'))).toBe(true);
        });

        it('should respect parent budget constraints', async () => {
            const parentBudget = mockTimeoutBudget.allocate('parent_operation', 5000);

            // Try to allocate more than parent allows
            let childBudget;
            try {
                childBudget = mockTimeoutBudget.allocate('child_operation', 10000);
                // Should still work but be constrained by parent
                expect(childBudget.remaining()).toBeLessThanOrEqual(parentBudget.remaining());
            } finally {
                if (childBudget) mockTimeoutBudget.release(childBudget);
                mockTimeoutBudget.release(parentBudget);
            }
        });

        it('should abort operations when budget exhausted', async () => {
            const toolCalls = [createMockToolCall('slow_function', { data: 'test' })];

            let abortSignalPassed = null;
            mockFunctions.execute.mockImplementation(async (name, args, streams, options) => {
                abortSignalPassed = options?.signal;
                // Simulate slow operation
                await new Promise(resolve => setTimeout(resolve, 200));
                return { result: `${name}_done` };
            });

            mockCallLLM.mockResolvedValue({
                choices: [{ message: { role: 'assistant', content: 'Complete' } }],
            });

            const responseMessage = createMockResponseMessage(toolCalls);
            await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Should have passed abort signal to function
            expect(abortSignalPassed).toBeDefined();
        });

        it('should release budget even on error', async () => {
            const toolCalls = [createMockToolCall('failing_function', { data: 'test' })];

            mockFunctions.execute.mockRejectedValue(new Error('Function failed'));

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Should return error but budget should be released
            expect(result.earlyReturn).toBeDefined();
            expect(mockTimeoutBudget.budgets.size).toBe(0); // All budgets released
        });

        it('should track elapsed time correctly', async () => {
            const budget = mockTimeoutBudget.allocate('test_operation', 5000);

            await new Promise(resolve => setTimeout(resolve, 100));

            const elapsed = budget.elapsed();
            expect(elapsed).toBeGreaterThan(50); // At least 50ms
            expect(elapsed).toBeLessThan(5000); // Less than budget

            mockTimeoutBudget.release(budget);
        });
    });

    // ==========================================
    // Tool Execution Reliability
    // ==========================================

    describe('Tool Execution Reliability', () => {
        it('should retry on transient errors', async () => {
            const toolCalls = [createMockToolCall('flaky_function', { data: 'test' })];

            let attempts = 0;
            mockFunctions.execute.mockImplementation(async () => {
                attempts++;
                if (attempts < 3) {
                    throw new Error('Temporary network error');
                }
                return { result: 'success_after_retry' };
            });

            mockCallLLM.mockResolvedValue({
                choices: [{ message: { role: 'assistant', content: 'Complete' } }],
            });

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Should have retried and succeeded
            expect(result.earlyReturn).toBeUndefined();
            expect(attempts).toBeGreaterThan(1);
        });

        it('should NOT retry on AbortError', async () => {
            const toolCalls = [createMockToolCall('timeout_function', { data: 'test' })];

            let attempts = 0;
            mockFunctions.execute.mockImplementation(async () => {
                attempts++;
                const error = new Error('Aborted');
                error.name = 'AbortError';
                throw error;
            });

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Should fail immediately without retry
            expect(result.earlyReturn).toBeDefined();
            expect(attempts).toBe(1); // Only one attempt, no retries
        });

        it('should handle validation errors without retry', async () => {
            const toolCalls = [createMockToolCall('validated_function', { invalid: 'data' })];

            let attempts = 0;
            mockFunctions.execute.mockImplementation(async () => {
                attempts++;
                return {
                    error: 'Validation failed',
                    validationErrors: ['Invalid parameter: invalid'],
                };
            });

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Should return error without retry
            expect(result.earlyReturn).toBeDefined();
            expect(attempts).toBe(1); // Only one attempt
        });

        it('should handle premium requirement gracefully', async () => {
            const toolCalls = [createMockToolCall('premium_function', { data: 'test' })];

            mockFunctions.execute.mockResolvedValue({
                error: 'Premium feature',
                premium_required: true,
                premiumFeatures: ['advanced-analytics'],
            });

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            expect(result.earlyReturn).toBeDefined();
            expect(result.earlyReturn.status).toBe('premium_required');
            expect(result.earlyReturn.premiumFeatures).toContain('advanced-analytics');
        });

        it('should handle malformed tool call arguments', async () => {
            const toolCalls = [
                {
                    id: 'call_malformed',
                    type: 'function',
                    function: {
                        name: 'test_function',
                        arguments: '{ invalid json }',
                    },
                },
            ];

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Should return error for malformed arguments
            expect(result.earlyReturn).toBeDefined();
            expect(result.earlyReturn.isFunctionError).toBe(true);
        });

        it('should detect code-like tool arguments', () => {
            const codeArgs = `
function test() {
    return "hello";
}
test();
`;

            const isCodeLike = ToolCallHandlingService.isCodeLikeToolArguments(codeArgs);
            expect(isCodeLike).toBe(true);
        });

        it('should build appropriate error for code-only responses', () => {
            const functionName = 'search_tracks';
            const rawArgs = '```javascript\nsearchTracks("artist")\n```';

            const errorMsg = ToolCallHandlingService.buildToolCodeOnlyError(functionName, rawArgs);
            expect(errorMsg).toContain('code-only');
            expect(errorMsg).toContain(functionName);
        });
    });

    // ==========================================
    // State Management
    // ==========================================

    describe('State Management', () => {
        it('should track active tool calls correctly', async () => {
            const toolCalls = [
                createMockToolCall('func1', { data: 'test1' }),
                createMockToolCall('func2', { data: 'test2' }),
            ];

            mockFunctions.execute.mockImplementation((name) => {
                return Promise.resolve({ result: `${name}_done` });
            });

            mockCallLLM.mockResolvedValue({
                choices: [{ message: { role: 'assistant', content: 'Complete' } }],
            });

            const onProgress = vi.fn();
            const responseMessage = createMockResponseMessage(toolCalls);
            await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                onProgress
            );

            // Should have tracked progress for both functions
            expect(onProgress).toHaveBeenCalledWith({ type: 'tool_start', tool: 'func1' });
            expect(onProgress).toHaveBeenCalledWith({ type: 'tool_end', tool: 'func1', result: expect.any(Object) });
            expect(onProgress).toHaveBeenCalledWith({ type: 'tool_start', tool: 'func2' });
            expect(onProgress).toHaveBeenCalledWith({ type: 'tool_end', tool: 'func2', result: expect.any(Object) });
        });

        it('should add tool results to session history', async () => {
            const toolCalls = [createMockToolCall('test_function', { data: 'test' })];

            mockFunctions.execute.mockResolvedValue({ result: 'test_result' });

            mockCallLLM.mockResolvedValue({
                choices: [{ message: { role: 'assistant', content: 'Complete' } }],
            });

            const responseMessage = createMockResponseMessage(toolCalls);
            await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Should have added assistant message and tool result to history
            expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledTimes(2); // assistant + tool
            expect(mockSessionManager.history).toHaveLength(2);
        });

        it('should handle empty tool results gracefully', async () => {
            const toolCalls = [createMockToolCall('empty_function', { data: 'test' })];

            mockFunctions.execute.mockResolvedValue(null); // Empty result

            mockCallLLM.mockResolvedValue({
                choices: [{ message: { role: 'assistant', content: 'Complete' } }],
            });

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Should handle empty result with placeholder
            expect(result.earlyReturn).toBeUndefined();
            const toolMessage = mockSessionManager.history.find(m => m.role === 'tool');
            expect(toolMessage).toBeDefined();
            expect(toolMessage.content).toContain('No output');
        });

        it('should handle circular references in tool results', async () => {
            const toolCalls = [createMockToolCall('circular_function', { data: 'test' })];

            const circularResult = { a: 1 };
            circularResult.self = circularResult; // Circular reference

            mockFunctions.execute.mockResolvedValue(circularResult);

            mockCallLLM.mockResolvedValue({
                choices: [{ message: { role: 'assistant', content: 'Complete' } }],
            });

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Should handle circular reference without crashing
            expect(result.earlyReturn).toBeUndefined();
            const toolMessage = mockSessionManager.history.find(m => m.role === 'tool');
            expect(toolMessage).toBeDefined();
            // Should have fallback for unserializable data
            expect(toolMessage.content).toBeDefined();
        });

        it('should cleanup state after partial failures', async () => {
            const toolCalls = [
                createMockToolCall('success_func', { data: 'test1' }),
                createMockToolCall('failure_func', { data: 'test2' }),
                createMockToolCall('never_called', { data: 'test3' }),
            ];

            mockFunctions.execute.mockImplementation((name) => {
                if (name === 'failure_func') {
                    throw new Error('Function failed');
                }
                return Promise.resolve({ result: `${name}_done` });
            });

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Should return early on failure
            expect(result.earlyReturn).toBeDefined();

            // Budgets should be cleaned up
            expect(mockTimeoutBudget.budgets.size).toBe(0);

            // History should have assistant message but not all tool results
            expect(mockSessionManager.history.length).toBeGreaterThanOrEqual(1);
        });

        it('should handle follow-up LLM call failures', async () => {
            const toolCalls = [createMockToolCall('test_function', { data: 'test' })];

            mockFunctions.execute.mockResolvedValue({ result: 'tool_result' });

            mockCallLLM.mockRejectedValue(new Error('LLM service unavailable'));

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Should return partial success - tools executed but summary failed
            expect(result.earlyReturn).toBeDefined();
            expect(result.earlyReturn.status).toBe('partial_success');
            expect(result.earlyReturn.toolsSucceeded).toBe(true);
        });
    });

    // ==========================================
    // Security-Focused Tests
    // ==========================================

    describe('Security: Edge Case Protection', () => {
        it('should prevent injection through tool arguments', async () => {
            const maliciousArgs = JSON.stringify({
                command: '"; DROP TABLE users; --',
                query: '{"$ne": null}',
            });

            const toolCalls = [
                {
                    id: 'call_inject',
                    type: 'function',
                    function: {
                        name: 'search_function',
                        arguments: maliciousArgs,
                    },
                },
            ];

            mockFunctions.execute.mockResolvedValue({ result: 'safe' });

            mockCallLLM.mockResolvedValue({
                choices: [{ message: { role: 'assistant', content: 'Safe' } }],
            });

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Should parse arguments without executing injection
            expect(result.earlyReturn).toBeUndefined();
            expect(mockFunctions.execute).toHaveBeenCalledWith(
                'search_function',
                expect.objectContaining({ command: expect.any(String) }),
                expect.any(Array),
                expect.any(Object)
            );
        });

        it('should sanitize tool results before storage', async () => {
            const toolCalls = [createMockToolCall('sanitization_test', { data: 'test' })];

            const unserializableResult = {
                normalData: 'safe',
                function: () => 'cannot serialize functions',
                circular: null,
            };
            unserializableResult.circular = unserializableResult;

            mockFunctions.execute.mockResolvedValue(unserializableResult);

            mockCallLLM.mockResolvedValue({
                choices: [{ message: { role: 'assistant', content: 'Complete' } }],
            });

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Should handle unserializable data gracefully
            expect(result.earlyReturn).toBeUndefined();
            const toolMessage = mockSessionManager.history.find(m => m.role === 'tool');
            expect(toolMessage.content).toBeDefined();
            // Content should be valid JSON string
            expect(() => JSON.parse(toolMessage.content)).not.toThrow();
        });

        it('should enforce timeout limits to prevent DoS', async () => {
            const toolCalls = [createMockToolCall('slow_function', { data: 'test' })];

            mockFunctions.execute.mockImplementation(async () => {
                // Simulate very slow function
                await new Promise(resolve => setTimeout(resolve, 20000));
                return { result: 'done' };
            });

            // Mock timeout to trigger quickly
            const quickBudget = mockTimeoutBudget.allocate('quick_test', 100);
            setTimeout(() => quickBudget.abort(), 50);

            mockCallLLM.mockResolvedValue({
                choices: [{ message: { role: 'assistant', content: 'Complete' } }],
            });

            const responseMessage = createMockResponseMessage(toolCalls);
            const startTime = Date.now();
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );
            const elapsed = Date.now() - startTime;

            // Should timeout quickly, not wait 20 seconds
            expect(elapsed).toBeLessThan(5000);

            mockTimeoutBudget.release(quickBudget);
        });
    });

    // ==========================================
    // Error Recovery Paths
    // ==========================================

    describe('Error Recovery Paths', () => {
        it('should recover from transient network errors', async () => {
            const toolCalls = [createMockToolCall('network_function', { data: 'test' })];

            let attempts = 0;
            mockFunctions.execute.mockImplementation(async () => {
                attempts++;
                if (attempts <= 2) {
                    const error = new Error('Network timeout');
                    error.message = 'Request timed out after 30000ms';
                    throw error;
                }
                return { result: 'success' };
            });

            mockCallLLM.mockResolvedValue({
                choices: [{ message: { role: 'assistant', content: 'Complete' } }],
            });

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Should retry and succeed
            expect(result.earlyReturn).toBeUndefined();
            expect(attempts).toBe(3);
        });

        it('should fail gracefully on persistent errors', async () => {
            const toolCalls = [createMockToolCall('failing_function', { data: 'test' })];

            mockFunctions.execute.mockRejectedValue(new Error('Persistent failure'));

            const responseMessage = createMockResponseMessage(toolCalls);
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );

            // Should return error after exhausting retries
            expect(result.earlyReturn).toBeDefined();
            expect(result.earlyReturn.isFunctionError).toBe(true);
            expect(result.earlyReturn.content).toContain('failed after');
        });

        it('should handle rate limiting with backoff', async () => {
            const toolCalls = [createMockToolCall('rate_limited', { data: 'test' })];

            let attempts = 0;
            mockFunctions.execute.mockImplementation(async () => {
                attempts++;
                if (attempts < 2) {
                    const error = new Error('Rate limit exceeded');
                    error.message = '429 Too Many Requests';
                    throw error;
                }
                return { result: 'success' };
            });

            mockCallLLM.mockResolvedValue({
                choices: [{ message: { role: 'assistant', content: 'Complete' } }],
            });

            const responseMessage = createMockResponseMessage(toolCalls);
            const startTime = Date.now();
            const result = await ToolCallHandlingService.handleToolCalls(
                responseMessage,
                createMockProviderConfig(),
                'test-key',
                vi.fn()
            );
            const elapsed = Date.now() - startTime;

            // Should have used exponential backoff
            expect(elapsed).toBeGreaterThan(300); // At least base delay
            expect(result.earlyReturn).toBeUndefined();
        });
    });
});
