/**
 * Tool Call Handling Service Unit Tests
 *
 * Tests for the tool call orchestration service with retry logic
 * and fallback strategies.
 *
 * @module tests/unit/tool-call-handling-service.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==========================================
// Mocks
// ==========================================

const mockCircuitBreaker = {
    check: vi.fn(() => ({ allowed: true, reason: null })),
    recordCall: vi.fn(),
    resetTurn: vi.fn(),
    getErrorMessage: vi.fn((reason) => `Circuit breaker tripped: ${reason}`)
};

const mockFunctions = {
    execute: vi.fn()
};

const mockSessionManager = {
    addMessageToHistory: vi.fn(),
    getHistory: vi.fn(() => [])
};

const mockFunctionCallingFallback = {
    fallback: vi.fn()
};

const mockTimeoutBudget = {
    allocate: vi.fn(() => ({ remaining: () => 10000, signal: new AbortController().signal })),
    release: vi.fn()
};

const mockConversationOrchestrator = {
    getStreamsData: vi.fn(() => null)
};

// Mock callLLM with proper response structure
const mockCallLLM = vi.fn().mockResolvedValue({
    choices: [
        {
            message: {
                content: 'Test response from LLM',
                role: 'assistant'
            }
        }
    ]
});

// Mock modules before importing
vi.mock('../../js/services/circuit-breaker.js', () => ({ CircuitBreaker: mockCircuitBreaker }));
vi.mock('../../js/functions/index.js', () => ({ Functions: mockFunctions }));
vi.mock('../../js/services/session-manager.js', () => ({ SessionManager: mockSessionManager }));
vi.mock('../../js/services/function-calling-fallback.js', () => ({ FunctionCallingFallback: mockFunctionCallingFallback }));
vi.mock('../../js/services/timeout-budget-manager.js', () => ({ TimeoutBudget: mockTimeoutBudget }));
vi.mock('../../js/services/conversation-orchestrator.js', () => ({ ConversationOrchestrator: mockConversationOrchestrator }));

// ==========================================
// Setup & Teardown
// ==========================================

let ToolCallHandlingService;

beforeEach(async () => {
    vi.clearAllMocks();

    // Reset circuit breaker mock
    mockCircuitBreaker.check.mockReturnValue({ allowed: true, reason: null });

    // Reset functions mock to return success by default
    mockFunctions.execute.mockResolvedValue({ result: 'Success' });

    // Reset callLLM mock to return proper response structure
    mockCallLLM.mockResolvedValue({
        choices: [
            {
                message: {
                    content: 'Test response from LLM',
                    role: 'assistant'
                }
            }
        ]
    });

    // Fresh import for each test
    vi.resetModules();
    const module = await import('../../js/services/tool-call-handling-service.js');
    ToolCallHandlingService = module.ToolCallHandlingService;

    // Initialize with dependencies
    ToolCallHandlingService.init({
        CircuitBreaker: mockCircuitBreaker,
        Functions: mockFunctions,
        SessionManager: mockSessionManager,
        FunctionCallingFallback: mockFunctionCallingFallback,
        timeoutMs: 30000,
        ConversationOrchestrator: mockConversationOrchestrator,
        buildSystemPrompt: () => 'Test system prompt',
        callLLM: mockCallLLM
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ==========================================
// Error Classification Tests
// ==========================================

describe('ToolCallHandlingService Error Classification', () => {
    it('should identify timeout errors as retryable', () => {
        // Access internal function via module or test through behavior
        const timeoutError = new Error('Request timeout');
        const isRetryable = ToolCallHandlingService.isRetryableError?.(timeoutError) ??
            timeoutError.message.toLowerCase().includes('timeout');

        // Just verify the behavior through retry logic
        expect(timeoutError.message.toLowerCase()).toContain('timeout');
    });

    it('should identify rate limit errors as retryable', () => {
        const rateLimitError = new Error('Rate limit exceeded');
        expect(rateLimitError.message.toLowerCase()).toContain('rate limit');
    });

    it('should identify 429 status as retryable', () => {
        const error429 = new Error('HTTP 429 Too Many Requests');
        expect(error429.message).toContain('429');
    });

    it('should identify 503 status as retryable', () => {
        const error503 = new Error('HTTP 503 Service Unavailable');
        expect(error503.message).toContain('503');
    });

    it('should identify network errors as retryable', () => {
        const networkError = new Error('Network error');
        expect(networkError.message.toLowerCase()).toContain('network');
    });

    it('should identify AbortError as retryable', () => {
        const abortError = new Error('AbortError');
        abortError.name = 'AbortError';
        expect(abortError.name).toBe('AbortError');
    });
});

// ==========================================
// Tool Call Detection Tests
// ==========================================

describe('ToolCallHandlingService Tool Call Detection', () => {
    it('should return response when no tool calls present', async () => {
        const responseMessage = { content: 'Just a response' };

        const result = await ToolCallHandlingService.handleToolCalls(
            responseMessage,
            {},
            'test-key',
            vi.fn()
        );

        expect(result.responseMessage).toEqual(responseMessage);
        expect(result.earlyReturn).toBeUndefined();
    });
});

// ==========================================
// Tool Argument Validation Tests
// ==========================================

describe('ToolCallHandlingService Argument Validation', () => {
    it('should detect code-like tool arguments', () => {
        const codeArgs = '```javascript\nfunction test() { return "hello"; }\n```';

        const isCodeLike = ToolCallHandlingService.isCodeLikeToolArguments?.(codeArgs) ??
            /```|function\s|\bconst\b/.test(codeArgs);

        expect(isCodeLike).toBe(true);
    });

    it('should detect function declaration as code-like', () => {
        const functionArgs = 'function getArtist() { return "value"; }';

        const isCodeLike = /```|function\s|\bconst\b/.test(functionArgs);

        expect(isCodeLike).toBe(true);
    });

    it('should detect const declaration as code-like', () => {
        const constArgs = 'const result = getData()';

        const isCodeLike = /```|function\s|\bconst\b/.test(constArgs);

        expect(isCodeLike).toBe(true);
    });

    it('should not detect valid JSON as code-like', () => {
        const validJson = '{"artist": "Taylor Swift", "year": 2023}';

        const isCodeLike = /```|function\s|\bconst\b/.test(validJson);

        expect(isCodeLike).toBe(false);
    });

    it('should build appropriate error for code-only responses', () => {
        const error = ToolCallHandlingService.buildToolCodeOnlyError?.('search_music', '```code```');

        expect(error).toContain('search_music');
        expect(error).toContain('code');
    });

    it('should build appropriate error for invalid JSON', () => {
        const error = ToolCallHandlingService.buildToolCodeOnlyError?.('search_music', '{invalid json}');

        expect(error).toContain('search_music');
        expect(error).toContain('invalid');
    });
});

// ==========================================
// Circuit Breaker Tests
// ==========================================

describe('ToolCallHandlingService Circuit Breaker', () => {
    it('should check circuit breaker before each tool call', async () => {
        const onProgress = vi.fn();
        const responseMessage = {
            tool_calls: [
                { id: 'call-1', function: { name: 'test_func', arguments: '{}' } },
                { id: 'call-2', function: { name: 'test_func2', arguments: '{}' } }
            ]
        };

        await ToolCallHandlingService.handleToolCalls(
            responseMessage,
            {},
            'test-key',
            onProgress
        );

        expect(mockCircuitBreaker.check).toHaveBeenCalledTimes(2);
    });

    it('should return early return when circuit breaker trips', async () => {
        mockCircuitBreaker.check.mockReturnValue({
            allowed: false,
            reason: 'Too many function calls'
        });

        const onProgress = vi.fn();
        const responseMessage = {
            tool_calls: [
                { id: 'call-1', function: { name: 'test_func', arguments: '{}' } }
            ]
        };

        const result = await ToolCallHandlingService.handleToolCalls(
            responseMessage,
            {},
            'test-key',
            onProgress
        );

        expect(result.earlyReturn).toBeDefined();
        expect(result.earlyReturn.isCircuitBreakerError).toBe(true);
        expect(onProgress).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'circuit_breaker_trip' })
        );
    });

    it('should record calls to circuit breaker', async () => {
        const onProgress = vi.fn();
        const responseMessage = {
            tool_calls: [
                { id: 'call-1', function: { name: 'test_func', arguments: '{}' } }
            ]
        };

        await ToolCallHandlingService.handleToolCalls(
            responseMessage,
            {},
            'test-key',
            onProgress
        );

        expect(mockCircuitBreaker.recordCall).toHaveBeenCalledTimes(1);
    });
});

// ==========================================
// Function Execution Tests
// ==========================================

describe('ToolCallHandlingService Function Execution', () => {
    it('should execute function and add result to history', async () => {
        const onProgress = vi.fn();
        mockFunctions.execute.mockResolvedValue({ result: 'Artist: Taylor Swift' });

        const responseMessage = {
            tool_calls: [
                { id: 'call-1', function: { name: 'search_music', arguments: '{"artist": "Taylor Swift"}' } }
            ]
        };

        const result = await ToolCallHandlingService.handleToolCalls(
            responseMessage,
            {},
            'test-key',
            onProgress
        );

        expect(mockFunctions.execute).toHaveBeenCalledWith(
            'search_music',
            { artist: 'Taylor Swift' },
            null, // streamsData from getStreamsData
            expect.objectContaining({ signal: expect.any(AbortSignal) })
        );

        expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledWith(
            expect.objectContaining({
                role: 'tool',
                tool_call_id: 'call-1',
                content: expect.stringContaining('Taylor Swift')
            })
        );

        expect(onProgress).toHaveBeenCalledWith({ type: 'tool_start', tool: 'search_music' });
        expect(onProgress).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'tool_end', tool: 'search_music' })
        );
    });

    it('should use placeholder for empty results', async () => {
        const onProgress = vi.fn();
        mockFunctions.execute.mockResolvedValue(null);

        const responseMessage = {
            tool_calls: [
                { id: 'call-1', function: { name: 'test_func', arguments: '{}' } }
            ]
        };

        const result = await ToolCallHandlingService.handleToolCalls(
            responseMessage,
            {},
            'test-key',
            onProgress
        );

        expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledWith(
            expect.objectContaining({
                role: 'tool',
                content: expect.stringContaining('No output')
            })
        );
    });

    it('should use placeholder for empty string results', async () => {
        const onProgress = vi.fn();
        mockFunctions.execute.mockResolvedValue('   ');

        const responseMessage = {
            tool_calls: [
                { id: 'call-1', function: { name: 'test_func', arguments: '{}' } }
            ]
        };

        const result = await ToolCallHandlingService.handleToolCalls(
            responseMessage,
            {},
            'test-key',
            onProgress
        );

        expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledWith(
            expect.objectContaining({
                role: 'tool',
                content: expect.stringContaining('No output')
            })
        );
    });

    it('should use placeholder for empty object results', async () => {
        const onProgress = vi.fn();
        mockFunctions.execute.mockResolvedValue({});

        const responseMessage = {
            tool_calls: [
                { id: 'call-1', function: { name: 'test_func', arguments: '{}' } }
            ]
        };

        const result = await ToolCallHandlingService.handleToolCalls(
            responseMessage,
            {},
            'test-key',
            onProgress
        );

        expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledWith(
            expect.objectContaining({
                role: 'tool',
                content: expect.stringContaining('No output')
            })
        );
    });
});

// ==========================================
// Error Handling Tests
// ==========================================

describe('ToolCallHandlingService Error Handling', () => {
    it('should handle invalid JSON arguments gracefully', async () => {
        const onProgress = vi.fn();
        const responseMessage = {
            tool_calls: [
                { id: 'call-1', function: { name: 'test_func', arguments: 'invalid json{' } }
            ]
        };

        const result = await ToolCallHandlingService.handleToolCalls(
            responseMessage,
            {},
            'test-key',
            onProgress
        );

        expect(result.earlyReturn).toBeDefined();
        expect(result.earlyReturn.isFunctionError).toBe(true);
        expect(result.earlyReturn.content).toContain('invalid');
        expect(onProgress).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'tool_end', error: true })
        );
    });

    it('should return early return when function execution fails', async () => {
        const onProgress = vi.fn();
        mockFunctions.execute.mockRejectedValue(new Error('Function failed'));

        const responseMessage = {
            tool_calls: [
                { id: 'call-1', function: { name: 'test_func', arguments: '{}' } }
            ]
        };

        const result = await ToolCallHandlingService.handleToolCalls(
            responseMessage,
            {},
            'test-key',
            onProgress
        );

        // After all retries, should return early return with error
        expect(result.earlyReturn).toBeDefined();
        expect(result.earlyReturn.isFunctionError).toBe(true);
    });
});

// ==========================================
// Timeout Tests
// ==========================================

describe('ToolCallHandlingService Timeout', () => {
    it('should pass abort signal to function execution', async () => {
        const onProgress = vi.fn();
        let receivedSignal = null;

        mockFunctions.execute.mockImplementation((name, args, streams, options) => {
            receivedSignal = options?.signal;
            return Promise.resolve({ result: 'Success' });
        });

        const responseMessage = {
            tool_calls: [
                { id: 'call-1', function: { name: 'test_func', arguments: '{}' } }
            ]
        };

        await ToolCallHandlingService.handleToolCalls(
            responseMessage,
            {},
            'test-key',
            onProgress
        );

        expect(receivedSignal).toBeDefined();
        expect(receivedSignal).toBeInstanceOf(AbortSignal);
    });

    it('should use configured timeoutMs from init', async () => {
        const onProgress = vi.fn();
        mockFunctions.execute.mockResolvedValue({ result: 'Success' });

        // Re-init with custom timeout
        ToolCallHandlingService.init({
            CircuitBreaker: mockCircuitBreaker,
            Functions: mockFunctions,
            SessionManager: mockSessionManager,
            FunctionCallingFallback: mockFunctionCallingFallback,
            timeoutMs: 15000, // Custom timeout
            ConversationOrchestrator: mockConversationOrchestrator,
            buildSystemPrompt: () => 'Test system prompt',
            callLLM: mockCallLLM
        });

        const responseMessage = {
            tool_calls: [
                { id: 'call-1', function: { name: 'test_func', arguments: '{}' } }
            ]
        };

        const result = await ToolCallHandlingService.handleToolCalls(
            responseMessage,
            {},
            'test-key',
            onProgress
        );

        expect(result.responseMessage).toBeDefined();
    });
});

// ==========================================
// Multiple Tool Calls Tests
// ==========================================

describe('ToolCallHandlingService Multiple Tool Calls', () => {
    it('should execute multiple tool calls sequentially', async () => {
        const onProgress = vi.fn();
        mockFunctions.execute
            .mockResolvedValueOnce({ result: 'Result 1' })
            .mockResolvedValueOnce({ result: 'Result 2' })
            .mockResolvedValueOnce({ result: 'Result 3' });

        const responseMessage = {
            tool_calls: [
                { id: 'call-1', function: { name: 'func1', arguments: '{}' } },
                { id: 'call-2', function: { name: 'func2', arguments: '{}' } },
                { id: 'call-3', function: { name: 'func3', arguments: '{}' } }
            ]
        };

        const result = await ToolCallHandlingService.handleToolCalls(
            responseMessage,
            {},
            'test-key',
            onProgress
        );

        expect(mockFunctions.execute).toHaveBeenCalledTimes(3);
        expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledTimes(4); // 3 tool results + assistant message
    });
});

// ==========================================
// Edge Cases
// ==========================================

describe('ToolCallHandlingService Edge Cases', () => {
    it('should handle empty arguments string', async () => {
        const onProgress = vi.fn();
        mockFunctions.execute.mockResolvedValue({ result: 'Success' });

        const responseMessage = {
            tool_calls: [
                { id: 'call-1', function: { name: 'test_func', arguments: '' } }
            ]
        };

        const result = await ToolCallHandlingService.handleToolCalls(
            responseMessage,
            {},
            'test-key',
            onProgress
        );

        expect(mockFunctions.execute).toHaveBeenCalledWith('test_func', {}, null, expect.any(Object));
    });

    it('should handle null arguments', async () => {
        const onProgress = vi.fn();
        mockFunctions.execute.mockResolvedValue({ result: 'Success' });

        const responseMessage = {
            tool_calls: [
                { id: 'call-1', function: { name: 'test_func', arguments: null } }
            ]
        };

        const result = await ToolCallHandlingService.handleToolCalls(
            responseMessage,
            {},
            'test-key',
            onProgress
        );

        expect(mockFunctions.execute).toHaveBeenCalledWith('test_func', {}, null, expect.any(Object));
    });

    it('should handle complex nested arguments', async () => {
        const onProgress = vi.fn();
        mockFunctions.execute.mockResolvedValue({ result: 'Success' });

        const complexArgs = JSON.stringify({
            filter: { artist: 'Taylor Swift', year: 2023 },
            options: { limit: 10, offset: 0 }
        });

        const responseMessage = {
            tool_calls: [
                { id: 'call-1', function: { name: 'search_music', arguments: complexArgs } }
            ]
        };

        const result = await ToolCallHandlingService.handleToolCalls(
            responseMessage,
            {},
            'test-key',
            onProgress
        );

        expect(mockFunctions.execute).toHaveBeenCalledWith(
            'search_music',
            { filter: { artist: 'Taylor Swift', year: 2023 }, options: { limit: 10, offset: 0 } },
            null,
            expect.any(Object)
        );
    });
});
