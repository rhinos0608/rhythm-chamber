import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock modules
vi.mock('../../js/services/turn-queue.js', () => ({
    TurnQueue: {
        push: vi.fn((message, options) => {
            // Simulate processing
            return Promise.resolve({
                content: `Response to: ${message}`,
                status: 'success',
                role: 'assistant'
            });
        }),
        getPendingCount: vi.fn(() => 0),
        isActive: vi.fn(() => false),
        getStatus: vi.fn(() => ({
            pending: 0,
            isProcessing: false,
            currentTurnId: null,
            queuedTurnIds: []
        }))
    }
}));

vi.mock('../../js/services/tool-strategies/native-strategy.js', () => ({
    NativeToolStrategy: vi.fn()
}));

vi.mock('../../js/services/tool-strategies/prompt-injection-strategy.js', () => ({
    PromptInjectionStrategy: vi.fn()
}));

vi.mock('../../js/services/tool-strategies/intent-extraction-strategy.js', () => ({
    IntentExtractionStrategy: vi.fn()
}));

vi.mock('../../js/module-registry.js', () => ({
    ModuleRegistry: {
        getModuleSync: vi.fn(() => null)
    }
}));

// Create mock window objects
function createMockWindow() {
    return {
        SessionManager: {
            init: vi.fn(),
            setUserContext: vi.fn(),
            addMessageToHistory: vi.fn(),
            getHistory: vi.fn(() => []),
            saveConversation: vi.fn(),
            flushPendingSaveAsync: vi.fn(),
            emergencyBackupSync: vi.fn(),
            recoverEmergencyBackup: vi.fn(),
            saveCurrentSession: vi.fn(),
            createNewSession: vi.fn(),
            loadSession: vi.fn(),
            switchSession: vi.fn(),
            listSessions: vi.fn(),
            deleteSessionById: vi.fn(),
            renameSession: vi.fn(),
            getCurrentSessionId: vi.fn(),
            onSessionUpdate: vi.fn(),
            clearConversation: vi.fn(),
            truncateHistory: vi.fn(),
            removeMessageFromHistory: vi.fn()
        },
        Storage: {
            onUpdate: vi.fn(),
            getStreams: vi.fn(() => [])
        },
        CircuitBreaker: {
            resetTurn: vi.fn()
        },
        TokenCountingService: {
            init: vi.fn(),
            calculateTokenUsage: vi.fn(() => ({
                totalTokens: 100,
                contextWindow: 4096,
                warnings: []
            })),
            getRecommendedAction: vi.fn(() => ({ action: 'none' })),
            truncateToTarget: vi.fn((params) => params)
        },
        ToolCallHandlingService: {
            init: vi.fn(),
            handleToolCallsWithFallback: vi.fn((responseMessage) => ({
                responseMessage
            }))
        },
        LLMProviderRoutingService: {
            init: vi.fn(),
            callLLM: vi.fn(() => Promise.resolve({
                choices: [{ message: { content: 'Test response' } }]
            })),
            buildProviderConfig: vi.fn(() => ({
                provider: 'openrouter',
                model: 'test-model',
                baseUrl: ''
            }))
        },
        FallbackResponseService: {
            init: vi.fn(),
            generateFallbackResponse: vi.fn(() => 'Fallback response')
        },
        Functions: {
            getEnabledSchemas: vi.fn(() => []),
            schemas: []
        },
        Settings: {
            getSettings: vi.fn(() => ({
                llm: { provider: 'openrouter', model: 'test-model' },
                openrouter: { apiKey: 'test-key' }
            }))
        },
        Config: {
            openrouter: { apiKey: 'test-key' }
        },
        Prompts: {
            system: 'System prompt for {{personality_name}}'
        },
        DataQuery: {
            parseDateQuery: vi.fn(),
            queryByTimePeriod: vi.fn(),
            findPeakListeningPeriod: vi.fn(),
            comparePeriods: vi.fn()
        },
        RAG: {
            isConfigured: vi.fn(() => false)
        },
        TokenCounter: {
            countTokens: vi.fn(() => 100)
        }
    };
}

describe('Chat TurnQueue Integration', () => {
    let Chat;
    let mockWindow;

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();

        // Setup mock window
        mockWindow = createMockWindow();

        // Add missing window methods
        mockWindow.addEventListener = vi.fn();
        mockWindow.removeEventListener = vi.fn();

        globalThis.window = mockWindow;

        // Import Chat module
        Chat = (await import('../../js/chat.js')).Chat;
    });

    it('should use TurnQueue.push for normal message processing', async () => {
        const { TurnQueue } = await import('../../js/services/turn-queue.js');

        // Initialize chat
        await Chat.initChat(
            { name: 'Test', tagline: 'Test', dataInsights: 'Test data' },
            {},
            { dateRange: { start: '2024-01-01', end: '2024-12-31' } },
            []
        );

        // Send a message
        const result = await Chat.sendMessage('Hello');

        // Verify TurnQueue.push was called
        expect(TurnQueue.push).toHaveBeenCalledWith('Hello', null);
        expect(result).toEqual({
            content: 'Response to: Hello',
            status: 'success',
            role: 'assistant'
        });
    });

    it('should bypass TurnQueue for internal operations', async () => {
        const { TurnQueue } = await import('../../js/services/turn-queue.js');

        // Initialize chat
        await Chat.initChat(
            { name: 'Test', tagline: 'Test', dataInsights: 'Test data' },
            {},
            { dateRange: { start: '2024-01-01', end: '2024-12-31' } },
            []
        );

        // Send a message with bypassQueue option
        const result = await Chat.sendMessage('Internal message', null, { bypassQueue: true });

        // Verify TurnQueue.push was NOT called
        expect(TurnQueue.push).not.toHaveBeenCalled();

        // Verify the message was processed directly
        expect(mockWindow.SessionManager.addMessageToHistory).toHaveBeenCalledWith({
            role: 'user',
            content: 'Internal message'
        });
    });

    it('should handle multiple messages in sequence via TurnQueue', async () => {
        const { TurnQueue } = await import('../../js/services/turn-queue.js');

        // Initialize chat
        await Chat.initChat(
            { name: 'Test', tagline: 'Test', dataInsights: 'Test data' },
            {},
            { dateRange: { start: '2024-01-01', end: '2024-12-31' } },
            []
        );

        // Send multiple messages
        await Chat.sendMessage('First message');
        await Chat.sendMessage('Second message');
        await Chat.sendMessage('Third message');

        // Verify TurnQueue.push was called for each message
        expect(TurnQueue.push).toHaveBeenCalledTimes(3);
        expect(TurnQueue.push).toHaveBeenNthCalledWith(1, 'First message', null);
        expect(TurnQueue.push).toHaveBeenNthCalledWith(2, 'Second message', null);
        expect(TurnQueue.push).toHaveBeenNthCalledWith(3, 'Third message', null);
    });

    it('should pass options to TurnQueue.push', async () => {
        const { TurnQueue } = await import('../../js/services/turn-queue.js');

        // Initialize chat
        await Chat.initChat(
            { name: 'Test', tagline: 'Test', dataInsights: 'Test data' },
            {},
            { dateRange: { start: '2024-01-01', end: '2024-12-31' } },
            []
        );

        // Send message with options
        const options = { apiKey: 'custom-key', onProgress: vi.fn() };
        await Chat.sendMessage('Test message', options);

        // Verify TurnQueue.push was called with options
        expect(TurnQueue.push).toHaveBeenCalledWith('Test message', options);
    });

    it('should handle errors from TurnQueue', async () => {
        const { TurnQueue } = await import('../../js/services/turn-queue.js');

        // Make TurnQueue.push throw an error
        TurnQueue.push.mockRejectedValue(new Error('Queue error'));

        // Initialize chat
        await Chat.initChat(
            { name: 'Test', tagline: 'Test', dataInsights: 'Test data' },
            {},
            { dateRange: { start: '2024-01-01', end: '2024-12-31' } },
            []
        );

        // Verify error is propagated
        await expect(Chat.sendMessage('Test message')).rejects.toThrow('Queue error');
    });

    it('should not use TurnQueue when not initialized', async () => {
        const { TurnQueue } = await import('../../js/services/turn-queue.js');

        // Try to send message without initialization
        await expect(Chat.sendMessage('Test message')).rejects.toThrow('Chat not initialized');

        // Verify TurnQueue.push was not called
        expect(TurnQueue.push).not.toHaveBeenCalled();
    });
});
