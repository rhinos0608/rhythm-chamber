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

// Mock SessionManager as ES module (Chat imports it directly)
vi.mock('../../js/services/session-manager.js', () => ({
    SessionManager: {
        init: vi.fn(),
        setUserContext: vi.fn(),
        addMessageToHistory: vi.fn(),
        addMessagesToHistory: vi.fn(), // Added for atomic message batching
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
    }
}));

// Mock CircuitBreaker as ES module
vi.mock('../../js/services/circuit-breaker.js', () => ({
    CircuitBreaker: {
        resetTurn: vi.fn(),
        check: vi.fn(() => ({ allowed: true })),
        recordCall: vi.fn(),
        getErrorMessage: vi.fn(() => 'Circuit breaker error')
    }
}));

// Mock LLMProviderRoutingService as ES module
vi.mock('../../js/services/llm-provider-routing-service.js', () => ({
    LLMProviderRoutingService: {
        init: vi.fn(),
        callLLM: vi.fn(() => Promise.resolve({
            choices: [{ message: { content: 'Test response', role: 'assistant' } }]
        })),
        buildProviderConfig: vi.fn(() => ({
            provider: 'openrouter',
            model: 'test-model',
            baseUrl: ''
        }))
    }
}));

// Mock TokenCountingService as ES module
vi.mock('../../js/services/token-counting-service.js', () => ({
    TokenCountingService: {
        init: vi.fn(),
        calculateTokenUsage: vi.fn(() => ({
            totalTokens: 100,
            contextWindow: 4096,
            warnings: []
        })),
        getRecommendedAction: vi.fn(() => ({ action: 'none' })),
        truncateToTarget: vi.fn((params) => params)
    }
}));

// Mock ToolCallHandlingService as ES module
vi.mock('../../js/services/tool-call-handling-service.js', () => ({
    ToolCallHandlingService: {
        init: vi.fn(),
        setStreamsData: vi.fn(),
        handleToolCalls: vi.fn((responseMessage) => ({ responseMessage })),
        handleToolCallsWithFallback: vi.fn((responseMessage) => ({ responseMessage }))
    }
}));

// Mock FallbackResponseService as ES module
vi.mock('../../js/services/fallback-response-service.js', () => ({
    FallbackResponseService: {
        init: vi.fn(),
        generateFallbackResponse: vi.fn(() => 'Fallback response')
    }
}));

// Mock TimeoutBudget as ES module
vi.mock('../../js/services/timeout-budget-manager.js', () => ({
    TimeoutBudget: {
        allocate: vi.fn((operation, budgetMs) => ({
            operation,
            budgetMs,
            id: `${operation}:1`,
            startTime: Date.now(),
            remaining: () => budgetMs,
            isExhausted: () => false,
            elapsed: () => 0,
            signal: new AbortController().signal
        })),
        release: vi.fn(),
        getBudget: vi.fn(() => null),
        withBudget: vi.fn((operation, budgetMs, fn) => fn()),
        getActiveAccounting: vi.fn(() => []),
        DEFAULT_BUDGETS: {
            llm_call: 60000,
            function_call: 10000
        }
    }
}));

// Mock WaveTelemetry as ES module
vi.mock('../../js/services/wave-telemetry.js', () => ({
    WaveTelemetry: {
        record: vi.fn(),
        recordMetrics: vi.fn(),
        getMetrics: vi.fn(() => ({}))
    }
}));

// Mock Storage as ES module
vi.mock('../../js/storage.js', () => ({
    Storage: {
        onUpdate: vi.fn(),
        getStreams: vi.fn(() => [])
    }
}));

// Mock Settings as ES module
vi.mock('../../js/settings.js', () => ({
    Settings: {
        getSettings: vi.fn(() => ({
            llm: { provider: 'openrouter', model: 'test-model' },
            openrouter: { apiKey: 'test-key' }
        })),
        showToast: vi.fn()
    }
}));

// Mock Prompts as ES module
vi.mock('../../js/prompts.js', () => ({
    Prompts: {
        system: 'System prompt for {{personality_name}}',
        build: vi.fn(() => 'System prompt')
    }
}));

// Mock TokenCounter as ES module
vi.mock('../../js/token-counter.js', () => ({
    TokenCounter: {
        countTokens: vi.fn(() => 100)
    }
}));

// Mock Patterns, Personality, Parser, DataQuery, ProviderInterface, FunctionCallingFallback
vi.mock('../../js/patterns.js', () => ({
    Patterns: {}
}));

vi.mock('../../js/personality.js', () => ({
    Personality: {}
}));

vi.mock('../../js/parser.js', () => ({
    Parser: {}
}));

vi.mock('../../js/data-query.js', () => ({
    DataQuery: {
        parseDateQuery: vi.fn(),
        queryByTimePeriod: vi.fn(),
        findPeakListeningPeriod: vi.fn(),
        comparePeriods: vi.fn()
    }
}));

vi.mock('../../js/providers/provider-interface.js', () => ({
    ProviderInterface: {
        callAPI: vi.fn()
    }
}));

vi.mock('../../js/services/function-calling-fallback.js', () => ({
    FunctionCallingFallback: {
        handleFallback: vi.fn()
    }
}));

vi.mock('../../js/functions/index.js', () => ({
    Functions: {
        getEnabledSchemas: vi.fn(() => []),
        schemas: []
    }
}));

// Mock ConfigLoader to prevent window.location.origin access
vi.mock('../../js/services/config-loader.js', () => ({
    ConfigLoader: {
        getAll: vi.fn(() => ({
            openrouter: { apiKey: 'test-key' },
            spotify: {
                clientId: '',
                redirectUri: '',
                scopes: ['user-read-recently-played', 'user-top-read']
            }
        }))
    }
}));

// Mock ConversationOrchestrator
vi.mock('../../js/services/conversation-orchestrator.js', () => ({
    ConversationOrchestrator: {
        init: vi.fn(),
        setUserContext: vi.fn(),
        setStreamsData: vi.fn(),
        getUserContext: vi.fn(() => ({
            personality: { name: 'Test' },
            patterns: {},
            summary: {}
        })),
        buildSystemPrompt: vi.fn(() => 'System prompt'),
        generateQueryContext: vi.fn(() => 'Query context'),
        getStreamsData: vi.fn(() => [])
    }
}));

// Mock MessageOperations
vi.mock('../../js/services/message-operations.js', () => ({
    MessageOperations: {
        init: vi.fn(),
        regenerateLastResponse: vi.fn(),
        deleteMessage: vi.fn(),
        editMessage: vi.fn()
    }
}));

// Create mock window objects
function createMockWindow() {
    return {
        location: {
            origin: 'http://localhost:3000',
            href: 'http://localhost:3000/app.html'
        },
        document: {
            visibilityState: 'visible',
            addEventListener: vi.fn()
        },
        SessionManager: {
            init: vi.fn(),
            setUserContext: vi.fn(),
            addMessageToHistory: vi.fn(),
            addMessagesToHistory: vi.fn(), // Added for atomic message batching
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
        const { SessionManager } = await import('../../js/services/session-manager.js');

        // Initialize chat
        await Chat.initChat(
            { name: 'Test', tagline: 'Test', dataInsights: 'Test data' },
            {},
            { dateRange: { start: '2024-01-01', end: '2024-12-31' } },
            []
        );

        // Send a message with bypassQueue option AND allowBypass flag (required for security)
        const result = await Chat.sendMessage('Internal message', null, { bypassQueue: true, allowBypass: true });

        // Verify TurnQueue.push was NOT called
        expect(TurnQueue.push).not.toHaveBeenCalled();

        // Verify the message was processed directly - messages are added atomically via addMessagesToHistory
        expect(SessionManager.addMessagesToHistory).toHaveBeenCalledWith([
            { role: 'user', content: 'Internal message' },
            { role: 'assistant', content: 'Test response' }
        ]);
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
