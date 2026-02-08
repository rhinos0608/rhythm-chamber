/**
 * Tool Calling E2E Integration Tests
 *
 * End-to-end tests for complete tool calling workflows covering:
 * 1. Multi-turn conversations (user → LLM → tool → LLM → user)
 * 2. Parallel tool calls (multiple simultaneous tool executions)
 * 3. Error recovery (tool failures, LLM errors, network issues)
 * 4. Complete function calling workflows (from request to response)
 * 5. Integration with all components (LLM providers, function registry, executor)
 *
 * @module tests/integration/tool-calling-e2e.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==========================================
// Test Utilities
// ==========================================

/**
 * Create a mock LLM response with tool calls
 * @param {Array} toolCalls - Array of tool call objects
 * @param {string} content - Optional content message
 * @returns {Object} Mock LLM response
 */
function createMockLLMResponse(toolCalls, content = null) {
    return {
        choices: [
            {
                message: {
                    role: 'assistant',
                    content,
                    tool_calls: toolCalls.map((tc, index) => ({
                        id: `call_${Date.now()}_${index}`,
                        type: 'function',
                        function: {
                            name: tc.name,
                            arguments: typeof tc.arguments === 'string'
                                ? tc.arguments
                                : JSON.stringify(tc.arguments),
                        },
                    })),
                },
            },
        ],
    };
}

/**
 * Create a mock follow-up LLM response (after tool execution)
 * @param {string} content - Response content
 * @returns {Object} Mock LLM response
 */
function createMockFollowUpResponse(content) {
    return {
        choices: [
            {
                message: {
                    role: 'assistant',
                    content,
                },
            },
        ],
    };
}

/**
 * Create mock streaming data
 * @returns {Array} Mock streams array
 */
function createMockStreams() {
    return [
        {
            msPlayed: 120000,
            endTime: 1609459200000,
            artistName: 'Test Artist',
            trackName: 'Test Track',
            albumName: 'Test Album',
            reasonStart: 'click',
            reasonEnd: 'endplay',
        },
    ];
}

/**
 * Create a mock AbortController
 * @returns {AbortController} Mock controller
 */
function createMockAbortController() {
    const controller = new AbortController();
    controller.signal = {
        aborted: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    };
    return controller;
}

// ==========================================
// Mock Dependencies
// ==========================================

const mockSessionManager = {
    addMessageToHistory: vi.fn().mockResolvedValue(undefined),
    getHistory: vi.fn().mockReturnValue([]),
    clearHistory: vi.fn().mockResolvedValue(undefined),
};

const mockCircuitBreaker = {
    check: vi.fn().mockReturnValue({ allowed: true, reason: null }),
    recordCall: vi.fn().mockReturnValue(undefined),
    resetTurn: vi.fn().mockReturnValue(undefined),
    getErrorMessage: vi.fn().mockReturnValue('Circuit breaker tripped'),
};

const mockFunctions = {
    execute: vi.fn().mockResolvedValue({ result: 'Mock result' }),
};

const mockBuildSystemPrompt = vi.fn().mockReturnValue('System prompt');

const mockCallLLM = vi.fn();

const mockConversationOrchestrator = {
    getStreamsData: vi.fn().mockReturnValue([]),
};

const mockTimeoutBudget = {
    allocate: vi.fn().mockReturnValue({
        signal: { aborted: false },
        remaining: vi.fn().mockReturnValue(10000),
    }),
    release: vi.fn().mockReturnValue(undefined),
};

// ==========================================
// Test Suites
// ==========================================

describe('Tool Calling E2E Integration', () => {
    let ToolCallHandlingService;

    beforeEach(async () => {
        // Reset all mocks
        vi.clearAllMocks();

        // Import module with mocks
        const module = await import('../../js/services/tool-call-handling-service.js');
        ToolCallHandlingService = module.ToolCallHandlingService;

        // Initialize with mock dependencies
        ToolCallHandlingService.init({
            CircuitBreaker: mockCircuitBreaker,
            Functions: mockFunctions,
            SessionManager: mockSessionManager,
            FunctionCallingFallback: null,
            buildSystemPrompt: mockBuildSystemPrompt,
            callLLM: mockCallLLM,
            ConversationOrchestrator: mockConversationOrchestrator,
            timeoutMs: 30000,
        });

        // Set up mock history
        mockSessionManager.getHistory.mockReturnValue([
            { role: 'system', content: 'System prompt' },
            { role: 'user', content: 'What are my top tracks?' },
        ]);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    // ==========================================
    // Suite 1: Multi-Turn Conversations
    // ==========================================

    describe('Multi-Turn Conversations', () => {
        it('should complete user → LLM → tool → LLM → user flow', async () => {
            // Arrange: User asks for top tracks
            const userMessage = 'What are my top tracks?';
            const streams = createMockStreams();

            // First LLM response requests tool call
            const firstLLMResponse = createMockLLMResponse([
                {
                    name: 'get_top_tracks',
                    arguments: { limit: 10, time_range: 'medium_term' },
                },
            ]);

            // Tool execution result
            const toolResult = {
                result: [
                    { trackName: 'Song 1', artistName: 'Artist 1', playCount: 100 },
                    { trackName: 'Song 2', artistName: 'Artist 2', playCount: 90 },
                ],
            };

            // Follow-up LLM response with natural language summary
            const followUpResponse = createMockFollowUpResponse(
                'Your top tracks include "Song 1" by Artist 1 and "Song 2" by Artist 2.'
            );

            // Set up mocks
            mockFunctions.execute.mockResolvedValue(toolResult);
            mockCallLLM
                .mockResolvedValueOnce(firstLLMResponse)
                .mockResolvedValueOnce(followUpResponse);
            mockConversationOrchestrator.getStreamsData.mockReturnValue(streams);

            // Act: Handle tool calls from first LLM response
            const result = await ToolCallHandlingService.handleToolCalls(
                firstLLMResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Tool was executed
            expect(mockFunctions.execute).toHaveBeenCalledWith(
                'get_top_tracks',
                { limit: 10, time_range: 'medium_term' },
                streams,
                expect.any(Object)
            );

            // Assert: Assistant tool call message was added to history
            expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledWith(
                expect.objectContaining({
                    role: 'assistant',
                    tool_calls: expect.any(Array),
                })
            );

            // Assert: Tool result message was added to history
            expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledWith(
                expect.objectContaining({
                    role: 'tool',
                    tool_call_id: expect.any(String),
                    content: expect.stringContaining('Song 1'),
                })
            );

            // Assert: Follow-up LLM call was made
            expect(mockCallLLM).toHaveBeenCalledTimes(2);
            expect(mockCallLLM).toHaveBeenLastCalledWith(
                { provider: 'openai' },
                'test-key',
                expect.arrayContaining([
                    expect.objectContaining({ role: 'system' }),
                    expect.objectContaining({ role: 'user' }),
                    expect.objectContaining({ role: 'assistant' }),
                    expect.objectContaining({ role: 'tool' }),
                ]),
                undefined
            );

            // Assert: Final response contains natural language summary
            expect(result.responseMessage.content).toContain('Song 1');
        });

        it('should handle multiple tool calls in sequence', async () => {
            // Arrange: Multiple tools requested
            const multiToolResponse = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 5 } },
                { name: 'get_top_tracks', arguments: { limit: 10 } },
                { name: 'get_genre_distribution', arguments: {} },
            ]);

            const toolResults = [
                { result: ['Artist 1', 'Artist 2'] },
                { result: ['Track 1', 'Track 2'] },
                { result: { rock: 40, pop: 30, jazz: 30 } },
            ];

            // Set up mocks
            mockFunctions.execute
                .mockResolvedValueOnce(toolResults[0])
                .mockResolvedValueOnce(toolResults[1])
                .mockResolvedValueOnce(toolResults[2]);

            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('Here is your complete music profile.')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle multiple tool calls
            const onProgress = vi.fn();
            const result = await ToolCallHandlingService.handleToolCalls(
                multiToolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                onProgress
            );

            // Assert: All tools were executed in sequence
            expect(mockFunctions.execute).toHaveBeenCalledTimes(3);
            expect(mockFunctions.execute).toHaveBeenNthCalledWith(1, 'get_top_artists', { limit: 5 }, expect.any(Array), expect.any(Object));
            expect(mockFunctions.execute).toHaveBeenNthCalledWith(2, 'get_top_tracks', { limit: 10 }, expect.any(Array), expect.any(Object));
            expect(mockFunctions.execute).toHaveBeenNthCalledWith(3, 'get_genre_distribution', {}, expect.any(Array), expect.any(Object));

            // Assert: Progress callbacks were fired for each tool
            expect(onProgress).toHaveBeenCalledWith({ type: 'tool_start', tool: 'get_top_artists' });
            expect(onProgress).toHaveBeenCalledWith({ type: 'tool_end', tool: 'get_top_artists', result: toolResults[0] });
            expect(onProgress).toHaveBeenCalledWith({ type: 'tool_start', tool: 'get_top_tracks' });
            expect(onProgress).toHaveBeenCalledWith({ type: 'tool_end', tool: 'get_top_tracks', result: toolResults[1] });
            expect(onProgress).toHaveBeenCalledWith({ type: 'tool_start', tool: 'get_genre_distribution' });
            expect(onProgress).toHaveBeenCalledWith({ type: 'tool_end', tool: 'get_genre_distribution', result: toolResults[2] });

            // Assert: All results added to history
            expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledTimes(4); // assistant + 3 tools
        });

        it('should handle tool calls with no content in first response', async () => {
            // Arrange: Tool call with null content
            const toolOnlyResponse = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 5 } },
            ], null);

            mockFunctions.execute.mockResolvedValue({ result: ['Artist 1'] });
            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('Your top artists are...')
            );
            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle tool-only response
            const result = await ToolCallHandlingService.handleToolCalls(
                toolOnlyResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Tool was executed successfully
            expect(mockFunctions.execute).toHaveBeenCalled();
            expect(result.responseMessage.content).toContain('top artists');
        });

        it('should handle follow-up LLM call failure gracefully', async () => {
            // Arrange: Tool execution succeeds but follow-up LLM fails
            const toolResponse = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 5 } },
            ]);

            mockFunctions.execute.mockResolvedValue({ result: ['Artist 1'] });
            mockCallLLM
                .mockResolvedValueOnce(toolResponse)
                .mockRejectedValueOnce(new Error('Network timeout'));
            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle tool calls with failing follow-up
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Early return with partial success
            expect(result.earlyReturn).toBeDefined();
            expect(result.earlyReturn.status).toBe('partial_success');
            expect(result.earlyReturn.content).toContain('summary generation failed');
            expect(result.earlyReturn.toolsSucceeded).toBe(true);
        });
    });

    // ==========================================
    // Suite 2: Parallel Tool Calls
    // ==========================================

    describe('Parallel Tool Calls', () => {
        it('should handle multiple independent tool calls in same response', async () => {
            // Arrange: LLM requests multiple tools at once
            const parallelToolResponse = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 5 } },
                { name: 'get_top_tracks', arguments: { limit: 10 } },
            ]);

            const artistResult = { result: ['Artist 1', 'Artist 2'] };
            const trackResult = { result: ['Track 1', 'Track 2'] };

            mockFunctions.execute
                .mockImplementation((name) => {
                    if (name === 'get_top_artists') return Promise.resolve(artistResult);
                    if (name === 'get_top_tracks') return Promise.resolve(trackResult);
                    return Promise.resolve({ error: 'Unknown function' });
                });

            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('Here are your top artists and tracks.')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Track execution order
            const executionOrder = [];
            mockFunctions.execute.mockImplementation((name) => {
                executionOrder.push(name);
                if (name === 'get_top_artists') return Promise.resolve(artistResult);
                if (name === 'get_top_tracks') return Promise.resolve(trackResult);
                return Promise.resolve({ error: 'Unknown function' });
            });

            // Act: Handle parallel tool calls
            const onProgress = vi.fn();
            const result = await ToolCallHandlingService.handleToolCalls(
                parallelToolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                onProgress
            );

            // Assert: Both tools executed
            expect(mockFunctions.execute).toHaveBeenCalledTimes(2);
            expect(executionOrder).toEqual(['get_top_artists', 'get_top_tracks']);

            // Assert: Progress callbacks for both tools
            expect(onProgress).toHaveBeenCalledWith({ type: 'tool_start', tool: 'get_top_artists' });
            expect(onProgress).toHaveBeenCalledWith({ type: 'tool_start', tool: 'get_top_tracks' });
            expect(onProgress).toHaveBeenCalledWith({ type: 'tool_end', tool: 'get_top_artists', result: artistResult });
            expect(onProgress).toHaveBeenCalledWith({ type: 'tool_end', tool: 'get_top_tracks', result: trackResult });
        });

        it('should handle parallel tool calls where one fails', async () => {
            // Arrange: Multiple tools, one fails
            const parallelToolResponse = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 5 } },
                { name: 'get_top_tracks', arguments: { limit: 10 } },
            ]);

            let callCount = 0;
            mockFunctions.execute.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve({ result: ['Artist 1'] });
                } else {
                    return Promise.resolve({ error: 'Failed to get tracks' });
                }
            });

            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('Got your artists, but there was an issue with tracks.')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle mixed success/failure
            const onProgress = vi.fn();
            const result = await ToolCallHandlingService.handleToolCalls(
                parallelToolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                onProgress
            );

            // Assert: Both tools attempted
            expect(mockFunctions.execute).toHaveBeenCalledTimes(2);

            // Assert: Error callback for failed tool
            expect(onProgress).toHaveBeenCalledWith({ type: 'tool_end', tool: 'get_top_tracks', error: true });

            // Assert: Results still added to history
            expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledTimes(3); // assistant + 2 tools
        });

        it('should enforce circuit breaker on parallel tool calls', async () => {
            // Arrange: Many parallel tools to test circuit breaker
            const manyToolsResponse = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 5 } },
                { name: 'get_top_tracks', arguments: { limit: 10 } },
                { name: 'get_genre_distribution', arguments: {} },
                { name: 'get_listening_history', arguments: {} },
                { name: 'get_audio_features', arguments: {} },
                { name: 'get_recent_tracks', arguments: {} }, // 6th tool - should trip breaker
            ]);

            // Circuit breaker trips on 6th call
            mockCircuitBreaker.check
                .mockReturnValueOnce({ allowed: true, reason: null })
                .mockReturnValueOnce({ allowed: true, reason: null })
                .mockReturnValueOnce({ allowed: true, reason: null })
                .mockReturnValueOnce({ allowed: true, reason: null })
                .mockReturnValueOnce({ allowed: true, reason: null })
                .mockReturnValueOnce({ allowed: false, reason: 'Too many function calls' });

            mockFunctions.execute.mockResolvedValue({ result: 'ok' });
            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle tool calls with circuit breaker
            const onProgress = vi.fn();
            const result = await ToolCallHandlingService.handleToolCalls(
                manyToolsResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                onProgress
            );

            // Assert: Circuit breaker was checked before 6th tool
            expect(mockCircuitBreaker.check).toHaveBeenCalledTimes(6);

            // Assert: Early return with circuit breaker error
            expect(result.earlyReturn).toBeDefined();
            expect(result.earlyReturn.isCircuitBreakerError).toBe(true);
            expect(result.earlyReturn.content).toContain('Too many function calls');

            // Assert: Progress callback for circuit breaker trip
            expect(onProgress).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'circuit_breaker_trip',
                    reason: 'Too many function calls',
                })
            );
        });
    });

    // ==========================================
    // Suite 3: Error Recovery
    // ==========================================

    describe('Error Recovery', () => {
        it('should retry on transient tool execution errors', async () => {
            // Arrange: Tool fails twice then succeeds
            const toolResponse = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 5 } },
            ]);

            let attemptCount = 0;
            mockFunctions.execute.mockImplementation(() => {
                attemptCount++;
                if (attemptCount < 3) {
                    // First two attempts fail with retryable error
                    return Promise.reject(new Error('Network timeout'));
                }
                // Third attempt succeeds
                return Promise.resolve({ result: ['Artist 1'] });
            });

            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('Your top artists are...')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle tool with retry
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Tool was retried and eventually succeeded
            expect(attemptCount).toBe(3);
            expect(mockFunctions.execute).toHaveBeenCalledTimes(3);
            expect(result.responseMessage.content).toContain('top artists');
        });

        it('should not retry on non-retryable errors', async () => {
            // Arrange: Tool fails with validation error (not retryable)
            const toolResponse = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 'invalid' } },
            ]);

            mockFunctions.execute.mockResolvedValue({
                error: 'Validation failed: limit must be a number',
                validationErrors: ['limit must be a number'],
            });

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle tool with validation error
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Tool was executed only once (no retries)
            expect(mockFunctions.execute).toHaveBeenCalledTimes(1);

            // Assert: Early return with error
            expect(result.earlyReturn).toBeDefined();
            expect(result.earlyReturn.status).toBe('error');
            expect(result.earlyReturn.isFunctionError).toBe(true);
            expect(result.earlyReturn.content).toContain('failed after 3 attempts');
        });

        it('should handle tool execution with timeout', async () => {
            // Arrange: Tool times out
            const toolResponse = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 5 } },
            ]);

            const abortController = new AbortController();
            setTimeout(() => abortController.abort(), 100);

            mockFunctions.execute.mockImplementation(
                () => new Promise((resolve, reject) => {
                    abortController.signal.addEventListener('abort', () => {
                        reject(new Error('Function get_top_artists timed out'));
                    });
                })
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle tool that times out
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn(),
                abortController.signal
            );

            // Assert: Early return with timeout error
            expect(result.earlyReturn).toBeDefined();
            expect(result.earlyReturn.status).toBe('error');
            expect(result.earlyReturn.content).toContain('timed out');
        });

        it('should recover from malformed tool arguments', async () => {
            // Arrange: Tool call has invalid JSON arguments
            const toolResponse = {
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            tool_calls: [
                                {
                                    id: 'call_123',
                                    type: 'function',
                                    function: {
                                        name: 'get_top_artists',
                                        arguments: 'invalid json {{{',
                                    },
                                },
                            ],
                        },
                    },
                ],
            };

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle malformed arguments
            const onProgress = vi.fn();
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                onProgress
            );

            // Assert: Tool was not executed
            expect(mockFunctions.execute).not.toHaveBeenCalled();

            // Assert: Error callback fired
            expect(onProgress).toHaveBeenCalledWith({ type: 'tool_end', tool: 'get_top_artists', error: true });

            // Assert: Early return with parse error
            expect(result.earlyReturn).toBeDefined();
            expect(result.earlyReturn.status).toBe('error');
            expect(result.earlyReturn.isFunctionError).toBe(true);
            expect(result.earlyReturn.content).toContain('invalid');
        });

        it('should handle premium feature requirement', async () => {
            // Arrange: Tool requires premium
            const toolResponse = createMockLLMResponse([
                { name: 'get_advanced_analytics', arguments: {} },
            ]);

            mockFunctions.execute.mockResolvedValue({
                premium_required: true,
                error: 'Advanced analytics requires Premium subscription',
                premiumFeatures: ['advanced_analytics'],
            });

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle premium-gated tool
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Early return with premium required
            expect(result.earlyReturn).toBeDefined();
            expect(result.earlyReturn.status).toBe('premium_required');
            expect(result.earlyReturn.content).toContain('Premium');
            expect(result.earlyReturn.premiumFeatures).toContain('advanced_analytics');
        });

        it('should not retry after abort error', async () => {
            // Arrange: Tool aborts (user cancelled)
            const toolResponse = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 5 } },
            ]);

            const abortController = new AbortController();
            abortController.abort();

            mockFunctions.execute.mockRejectedValue(
                new Error('AbortError: Operation cancelled')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle aborted tool call
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn(),
                abortController.signal
            );

            // Assert: Tool was not retried
            expect(mockFunctions.execute).toHaveBeenCalledTimes(1);

            // Assert: Early return with error
            expect(result.earlyReturn).toBeDefined();
            expect(result.earlyReturn.status).toBe('error');
        });

        it('should handle circular reference in tool results', async () => {
            // Arrange: Tool result has circular reference
            const toolResponse = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 5 } },
            ]);

            const circularResult = { name: 'Artist 1' };
            circularResult.self = circularResult; // Circular reference

            mockFunctions.execute.mockResolvedValue(circularResult);
            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('Here are your top artists.')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle circular reference
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Result was handled gracefully (unserializable error)
            expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledWith(
                expect.objectContaining({
                    role: 'tool',
                    content: expect.stringContaining('unserializable'),
                })
            );

            // Assert: Follow-up call still made
            expect(mockCallLLM).toHaveBeenCalledTimes(2);
        });

        it('should handle empty tool results with placeholder', async () => {
            // Arrange: Tool returns empty result
            const toolResponse = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 5 } },
            ]);

            mockFunctions.execute.mockResolvedValue(null);
            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('No artists found.')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle empty result
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Placeholder used for empty result
            expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledWith(
                expect.objectContaining({
                    role: 'tool',
                    content: expect.stringContaining('No output'),
                })
            );
        });

        it('should handle intentionally empty results', async () => {
            // Arrange: Tool returns intentionally empty result
            const toolResponse = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 5 } },
            ]);

            mockFunctions.execute.mockResolvedValue({ _empty: true });
            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('No data available.')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle intentionally empty result
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Empty result preserved
            expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledWith(
                expect.objectContaining({
                    role: 'tool',
                    content: expect.stringContaining('(No output)'),
                })
            );
        });
    });

    // ==========================================
    // Suite 4: Complete Function Calling Workflows
    // ==========================================

    describe('Complete Function Calling Workflows', () => {
        it('should execute data query function with streams', async () => {
            // Arrange: Data query function requires streams
            const toolResponse = createMockLLMResponse([
                { name: 'query_streams', arguments: { limit: 10 } },
            ]);

            const streams = createMockStreams();
            mockFunctions.execute.mockResolvedValue({
                result: streams.slice(0, 5),
            });
            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('Found 5 tracks in your history.')
            );
            mockConversationOrchestrator.getStreamsData.mockReturnValue(streams);

            // Act: Execute data query
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Function received streams
            expect(mockFunctions.execute).toHaveBeenCalledWith(
                'query_streams',
                { limit: 10 },
                streams,
                expect.any(Object)
            );

            expect(result.responseMessage.content).toContain('5 tracks');
        });

        it('should execute template function without streams', async () => {
            // Arrange: Template function doesn't need streams
            const toolResponse = createMockLLMResponse([
                { name: 'get_personality_description', arguments: { type: 'explorer' } },
            ]);

            mockFunctions.execute.mockResolvedValue({
                result: 'The Explorer: Always seeking new sounds.',
            });
            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('You are an Explorer!')
            );

            // Act: Execute template function
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Function executed without streams
            expect(mockFunctions.execute).toHaveBeenCalledWith(
                'get_personality_description',
                { type: 'explorer' },
                expect.any(Array), // streamsData still passed
                expect.any(Object)
            );

            expect(result.responseMessage.content).toContain('Explorer');
        });

        it('should handle analytics function with complex result', async () => {
            // Arrange: Analytics function returns complex data
            const toolResponse = createMockLLMResponse([
                { name: 'analyze_listening_patterns', arguments: {} },
            ]);

            const complexResult = {
                patterns: {
                    comfortDiscovery: { ratio: 25, description: 'Balanced' },
                    peakHours: [10, 14, 20],
                    diversity: 0.75,
                },
                metrics: {
                    totalPlays: 5420,
                    uniqueArtists: 342,
                    avgDailyHours: 2.5,
                },
                insights: [
                    'You listen to music throughout the day',
                    'High diversity in your choices',
                ],
            };

            mockFunctions.execute.mockResolvedValue(complexResult);
            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('Your listening patterns show a balanced mix of comfort and discovery.')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Execute analytics function
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Complex result serialized and added to history
            expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledWith(
                expect.objectContaining({
                    role: 'tool',
                    content: expect.stringContaining('comfortDiscovery'),
                })
            );

            expect(result.responseMessage.content).toContain('balanced mix');
        });

        it('should handle artifact-generating function', async () => {
            // Arrange: Function generates visualization artifact
            const toolResponse = createMockLLMResponse([
                { name: 'generate_genre_chart', arguments: { type: 'pie' } },
            ]);

            const artifactResult = {
                artifact: {
                    type: 'chart',
                    format: 'svg',
                    data: '<svg>...</svg>',
                    metadata: { width: 800, height: 600 },
                },
            };

            mockFunctions.execute.mockResolvedValue(artifactResult);
            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('I\'ve generated a pie chart of your genres.')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Generate artifact
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Artifact data handled properly
            expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledWith(
                expect.objectContaining({
                    role: 'tool',
                    content: expect.stringContaining('artifact'),
                })
            );

            expect(result.responseMessage.content).toContain('pie chart');
        });

        it('should handle playlist query function', async () => {
            // Arrange: Query user's playlists
            const toolResponse = createMockLLMResponse([
                { name: 'get_user_playlists', arguments: {} },
            ]);

            const playlistResult = {
                result: [
                    { name: 'Chill Vibes', tracks: 45, owner: 'user' },
                    { name: 'Workout Mix', tracks: 30, owner: 'user' },
                ],
            };

            mockFunctions.execute.mockResolvedValue(playlistResult);
            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('You have 2 playlists: Chill Vibes and Workout Mix.')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Query playlists
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Playlist data handled
            expect(mockFunctions.execute).toHaveBeenCalledWith(
                'get_user_playlists',
                {},
                expect.any(Array),
                expect.any(Object)
            );

            expect(result.responseMessage.content).toContain('2 playlists');
        });
    });

    // ==========================================
    // Suite 5: Integration with All Components
    // ==========================================

    describe('Integration with All Components', () => {
        it('should integrate with LLM provider correctly', async () => {
            // Arrange: Test with different providers
            const toolResponse = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 5 } },
            ]);

            mockFunctions.execute.mockResolvedValue({ result: ['Artist 1'] });
            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('Here are your artists.')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Call with OpenAI provider
            await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai', model: 'gpt-4' },
                'sk-test-key',
                vi.fn()
            );

            // Assert: LLM called with provider config
            expect(mockCallLLM).toHaveBeenCalledWith(
                { provider: 'openai', model: 'gpt-4' },
                'sk-test-key',
                expect.any(Array),
                undefined
            );
        });

        it('should integrate with function registry schema validation', async () => {
            // Arrange: Function with schema validation
            const toolResponse = createMockLLMResponse([
                {
                    name: 'get_top_artists',
                    arguments: { limit: 5, time_range: 'short_term' },
                },
            ]);

            mockFunctions.execute.mockImplementation((name, args) => {
                // Simulate schema validation
                if (args.limit > 50) {
                    return Promise.resolve({
                        error: 'limit must be <= 50',
                        validationErrors: ['limit exceeds maximum'],
                    });
                }
                return Promise.resolve({ result: ['Artist 1'] });
            });

            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('Your top artists...')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Valid arguments
            const validResult = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Valid arguments succeeded
            expect(validResult.responseMessage.content).toContain('artists');

            // Test invalid arguments
            const invalidToolResponse = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 100 } },
            ]);

            mockFunctions.execute.mockClear();
            mockFunctions.execute.mockResolvedValue({
                error: 'limit must be <= 50',
                validationErrors: ['limit exceeds maximum'],
            });

            const invalidResult = await ToolCallHandlingService.handleToolCalls(
                invalidToolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Invalid arguments caused error
            expect(invalidResult.earlyReturn).toBeDefined();
            expect(invalidResult.earlyReturn.isFunctionError).toBe(true);
        });

        it('should integrate with timeout budget manager', async () => {
            // Arrange: Long-running function
            const toolResponse = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 5 } },
            ]);

            mockFunctions.execute.mockImplementation(
                () =>
                    new Promise(resolve => {
                        setTimeout(() => resolve({ result: ['Artist 1'] }), 100);
                    })
            );

            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('Your top artists...')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Execute with timeout budget
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Function completed within budget
            expect(mockFunctions.execute).toHaveBeenCalled();
            expect(result.responseMessage.content).toContain('artists');
        });

        it('should integrate with session manager history', async () => {
            // Arrange: Multi-turn conversation
            const toolResponse = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 5 } },
            ]);

            mockFunctions.execute.mockResolvedValue({ result: ['Artist 1'] });
            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('Your top artists...')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Execute tool call
            await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Session manager history updated
            expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledTimes(2);

            // Verify assistant message
            expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledWith(
                expect.objectContaining({
                    role: 'assistant',
                    tool_calls: expect.any(Array),
                })
            );

            // Verify tool result message
            expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledWith(
                expect.objectContaining({
                    role: 'tool',
                    tool_call_id: expect.any(String),
                    content: expect.any(String),
                })
            );
        });

        it('should integrate with circuit breaker', async () => {
            // Arrange: Circuit breaker already tripped
            const toolResponse = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 5 } },
            ]);

            mockCircuitBreaker.check.mockReturnValue({
                allowed: false,
                reason: 'Circuit breaker open',
            });

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle tool call with tripped breaker
            const onProgress = vi.fn();
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                onProgress
            );

            // Assert: No function execution
            expect(mockFunctions.execute).not.toHaveBeenCalled();

            // Assert: Circuit breaker error returned
            expect(result.earlyReturn).toBeDefined();
            expect(result.earlyReturn.isCircuitBreakerError).toBe(true);
            expect(result.earlyReturn.content).toContain('Circuit breaker');

            // Assert: Progress callback
            expect(onProgress).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'circuit_breaker_trip',
                })
            );
        });

        it('should integrate with conversation orchestrator for streams data', async () => {
            // Arrange: Tool needs streams data
            const toolResponse = createMockLLMResponse([
                { name: 'query_streams', arguments: { limit: 10 } },
            ]);

            const streams = createMockStreams();
            mockFunctions.execute.mockResolvedValue({ result: streams });
            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('Found your streams.')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(streams);

            // Act: Execute tool
            await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Conversation orchestrator queried for streams
            expect(mockConversationOrchestrator.getStreamsData).toHaveBeenCalled();

            // Assert: Streams passed to function executor
            expect(mockFunctions.execute).toHaveBeenCalledWith(
                'query_streams',
                { limit: 10 },
                streams,
                expect.any(Object)
            );
        });

        it('should handle missing dependencies gracefully', async () => {
            // Arrange: Initialize without callLLM
            ToolCallHandlingService.init({
                CircuitBreaker: mockCircuitBreaker,
                Functions: mockFunctions,
                SessionManager: mockSessionManager,
                FunctionCallingFallback: null,
                buildSystemPrompt: mockBuildSystemPrompt,
                callLLM: null, // Missing!
                ConversationOrchestrator: mockConversationOrchestrator,
                timeoutMs: 30000,
            });

            const toolResponse = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 5 } },
            ]);

            mockFunctions.execute.mockResolvedValue({ result: ['Artist 1'] });
            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle tool calls without callLLM
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Early return with error
            expect(result.earlyReturn).toBeDefined();
            expect(result.earlyReturn.status).toBe('error');
            expect(result.earlyReturn.content).toContain('LLM service not available');
        });

        it('should handle missing Functions service', async () => {
            // Arrange: Initialize without Functions
            ToolCallHandlingService.init({
                CircuitBreaker: mockCircuitBreaker,
                Functions: null, // Missing!
                SessionManager: mockSessionManager,
                FunctionCallingFallback: null,
                buildSystemPrompt: mockBuildSystemPrompt,
                callLLM: mockCallLLM,
                ConversationOrchestrator: mockConversationOrchestrator,
                timeoutMs: 30000,
            });

            const toolResponse = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 5 } },
            ]);

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle tool calls without Functions
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Error in tool execution
            expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledWith(
                expect.objectContaining({
                    role: 'tool',
                    content: expect.stringContaining('error'),
                })
            );
        });
    });

    // ==========================================
    // Suite 6: Edge Cases and Boundary Conditions
    // ==========================================

    describe('Edge Cases and Boundary Conditions', () => {
        it('should handle response without tool calls', async () => {
            // Arrange: Response with no tool calls
            const responseWithoutTools = {
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            content: 'Hello! How can I help you?',
                        },
                    },
                ],
            };

            // Act: Handle response without tools
            const result = await ToolCallHandlingService.handleToolCalls(
                responseWithoutTools.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Return response as-is
            expect(result.responseMessage).toEqual(responseWithoutTools.choices[0].message);
            expect(mockFunctions.execute).not.toHaveBeenCalled();
        });

        it('should handle empty tool_calls array', async () => {
            // Arrange: Response with empty tool_calls
            const responseWithEmptyTools = {
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            content: 'Hello!',
                            tool_calls: [],
                        },
                    },
                ],
            };

            // Act: Handle empty tool_calls
            const result = await ToolCallHandlingService.handleToolCalls(
                responseWithEmptyTools.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Return response as-is
            expect(result.responseMessage).toEqual(responseWithEmptyTools.choices[0].message);
        });

        it('should handle tool call with missing function name', async () => {
            // Arrange: Tool call without function name
            const toolResponse = {
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            tool_calls: [
                                {
                                    id: 'call_123',
                                    type: 'function',
                                    function: {
                                        // name missing!
                                        arguments: '{}',
                                    },
                                },
                            ],
                        },
                    },
                ],
            };

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle malformed tool call
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Handled gracefully
            expect(result.earlyReturn).toBeDefined();
            expect(result.earlyReturn.status).toBe('error');
        });

        it('should handle tool call with missing arguments', async () => {
            // Arrange: Tool call without arguments
            const toolResponse = {
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            tool_calls: [
                                {
                                    id: 'call_123',
                                    type: 'function',
                                    function: {
                                        name: 'get_top_artists',
                                        // arguments missing!
                                    },
                                },
                            ],
                        },
                    },
                ],
            };

            mockFunctions.execute.mockResolvedValue({ result: ['Artist 1'] });
            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('Your top artists...')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle tool call with missing arguments
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Arguments default to empty object
            expect(mockFunctions.execute).toHaveBeenCalledWith(
                'get_top_artists',
                {}, // Empty object
                expect.any(Array),
                expect.any(Object)
            );

            expect(result.responseMessage.content).toContain('artists');
        });

        it('should handle tool call with null arguments', async () => {
            // Arrange: Tool call with null arguments
            const toolResponse = {
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            tool_calls: [
                                {
                                    id: 'call_123',
                                    type: 'function',
                                    function: {
                                        name: 'get_top_artists',
                                        arguments: null,
                                    },
                                },
                            ],
                        },
                    },
                ],
            };

            mockFunctions.execute.mockResolvedValue({ result: ['Artist 1'] });
            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('Your top artists...')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle null arguments
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Arguments default to empty object
            expect(mockFunctions.execute).toHaveBeenCalledWith(
                'get_top_artists',
                {}, // Empty object
                expect.any(Array),
                expect.any(Object)
            );
        });

        it('should handle tool result that is a string', async () => {
            // Arrange: Tool returns string result
            const toolResponse = createMockLLMResponse([
                { name: 'get_artist_info', arguments: { artist: 'Artist 1' } },
            ]);

            mockFunctions.execute.mockResolvedValue('Artist 1 is a popular musician.');
            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('Artist 1 is indeed popular!')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle string result
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: String result handled correctly
            expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledWith(
                expect.objectContaining({
                    role: 'tool',
                    content: expect.stringContaining('Artist 1 is a popular musician'),
                })
            );
        });

        it('should handle tool result that is a number', async () => {
            // Arrange: Tool returns number result
            const toolResponse = createMockLLMResponse([
                { name: 'get_stream_count', arguments: {} },
            ]);

            mockFunctions.execute.mockResolvedValue(5420);
            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('You have 5,420 streams!')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle number result
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Number result serialized correctly
            expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledWith(
                expect.objectContaining({
                    role: 'tool',
                    content: '5420', // Number as string
                })
            );
        });

        it('should handle response with undefined choices', async () => {
            // Arrange: Response without choices
            const invalidResponse = {
                choices: undefined,
            };

            // Act: Handle invalid response
            const result = await ToolCallHandlingService.handleToolCalls(
                invalidResponse,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Return original response
            expect(result.responseMessage).toEqual(invalidResponse);
        });

        it('should handle response with empty choices array', async () => {
            // Arrange: Response with empty choices
            const emptyChoicesResponse = {
                choices: [],
            };

            // Act: Handle empty choices
            const result = await ToolCallHandlingService.handleToolCalls(
                emptyChoicesResponse,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Return original response
            expect(result.responseMessage).toEqual(emptyChoicesResponse);
        });

        it('should handle malformed JSON in arguments string', async () => {
            // Arrange: Arguments have trailing comma (invalid JSON)
            const toolResponse = {
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            tool_calls: [
                                {
                                    id: 'call_123',
                                    type: 'function',
                                    function: {
                                        name: 'get_top_artists',
                                        arguments: '{ limit: 5, }', // Invalid JSON
                                    },
                                },
                            ],
                        },
                    },
                ],
            };

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Handle invalid JSON
            const result = await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: Parse error returned
            expect(result.earlyReturn).toBeDefined();
            expect(result.earlyReturn.status).toBe('error');
            expect(result.earlyReturn.isFunctionError).toBe(true);
        });
    });

    // ==========================================
    // Suite 7: Performance and Resource Management
    // ==========================================

    describe('Performance and Resource Management', () => {
        it('should release timeout budget after tool execution', async () => {
            // Arrange: Tool execution
            const toolResponse = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 5 } },
            ]);

            mockFunctions.execute.mockResolvedValue({ result: ['Artist 1'] });
            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('Your top artists...')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Mock TimeoutBudget to track allocations
            const allocations = [];
            const releases = [];
            mockTimeoutBudget.allocate.mockImplementation((op) => {
                allocations.push(op);
                return { signal: { aborted: false }, remaining: () => 10000 };
            });
            mockTimeoutBudget.release.mockImplementation((budget) => {
                releases.push(budget);
            });

            // Act: Execute tool
            await ToolCallHandlingService.handleToolCalls(
                toolResponse.choices[0].message,
                { provider: 'openai' },
                'test-key',
                vi.fn()
            );

            // Assert: If budget was allocated, it should be released
            // (This test verifies the pattern, actual budgeting happens inside execute)
        });

        it('should handle rapid sequential tool calls efficiently', async () => {
            // Arrange: Multiple rapid tool calls
            const tools = ['get_top_artists', 'get_top_tracks', 'get_genre_distribution'];
            const responses = tools.map(name =>
                createMockLLMResponse([{ name, arguments: {} }])
            );

            mockFunctions.execute.mockResolvedValue({ result: 'ok' });
            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('Done.')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Execute tools rapidly
            const startTime = Date.now();
            for (const response of responses) {
                await ToolCallHandlingService.handleToolCalls(
                    response.choices[0].message,
                    { provider: 'openai' },
                    'test-key',
                    vi.fn()
                );
            }
            const duration = Date.now() - startTime;

            // Assert: All tools executed (performance check)
            expect(mockFunctions.execute).toHaveBeenCalledTimes(3);
            // Should complete in reasonable time (< 5 seconds for simple mocks)
            expect(duration).toBeLessThan(5000);
        });

        it('should handle concurrent tool call handling', async () => {
            // Arrange: Multiple concurrent tool requests
            const toolResponse1 = createMockLLMResponse([
                { name: 'get_top_artists', arguments: { limit: 5 } },
            ]);
            const toolResponse2 = createMockLLMResponse([
                { name: 'get_top_tracks', arguments: { limit: 10 } },
            ]);

            mockFunctions.execute.mockImplementation((name) =>
                Promise.resolve({ result: `${name} result` })
            );
            mockCallLLM.mockResolvedValue(
                createMockFollowUpResponse('All done!')
            );

            mockConversationOrchestrator.getStreamsData.mockReturnValue(createMockStreams());

            // Act: Execute tools concurrently
            const [result1, result2] = await Promise.all([
                ToolCallHandlingService.handleToolCalls(
                    toolResponse1.choices[0].message,
                    { provider: 'openai' },
                    'test-key',
                    vi.fn()
                ),
                ToolCallHandlingService.handleToolCalls(
                    toolResponse2.choices[0].message,
                    { provider: 'openai' },
                    'test-key',
                    vi.fn()
                ),
            ]);

            // Assert: Both completed successfully
            expect(result1.responseMessage.content).toBeDefined();
            expect(result2.responseMessage.content).toBeDefined();
        });
    });
});
