import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock modules
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
    })),
    release: vi.fn(),
    getBudget: vi.fn(() => null),
    withBudget: vi.fn((operation, budgetMs, fn) => fn()),
    getActiveAccounting: vi.fn(() => []),
    DEFAULT_BUDGETS: {
      llm_call: 60000,
      function_call: 10000,
    },
    DEFAULT_LIMITS: {
      max_function_calls: 5,
    },
  },
}));

vi.mock('../../js/services/turn-queue.js', () => ({
  TurnQueue: {
    push: vi.fn((message, options) => {
      return Promise.resolve({
        content: `Response to: ${message}`,
        status: 'success',
        role: 'assistant',
      });
    }),
    getPendingCount: vi.fn(() => 0),
    isActive: vi.fn(() => false),
    getStatus: vi.fn(() => ({
      pending: 0,
      isProcessing: false,
      currentTurnId: null,
      queuedTurnIds: [],
    })),
  },
}));

vi.mock('../../js/services/tool-strategies/native-strategy.js', () => ({
  NativeToolStrategy: vi.fn(),
}));

vi.mock('../../js/services/tool-strategies/prompt-injection-strategy.js', () => ({
  PromptInjectionStrategy: vi.fn(),
}));

vi.mock('../../js/services/tool-strategies/intent-extraction-strategy.js', () => ({
  IntentExtractionStrategy: vi.fn(),
}));

vi.mock('../../js/module-registry.js', () => ({
  ModuleRegistry: {
    getModuleSync: vi.fn(() => null),
  },
}));

// Mock SessionManager as ES module (Chat imports it directly)
vi.mock('../../js/services/session-manager.js', () => ({
  SessionManager: {
    init: vi.fn(),
    setUserContext: vi.fn(),
    addMessageToHistory: vi.fn(),
    addMessagesToHistory: vi.fn(),
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
    removeMessageFromHistory: vi.fn(),
  },
}));

// Mock CircuitBreaker as ES module
vi.mock('../../js/services/circuit-breaker.js', () => ({
  CircuitBreaker: {
    resetTurn: vi.fn(),
    check: vi.fn(() => ({ allowed: true })),
    recordCall: vi.fn(),
    getErrorMessage: vi.fn(() => 'Circuit breaker error'),
  },
}));

// Mock LLMProviderRoutingService as ES module
vi.mock('../../js/services/llm-provider-routing-service.js', () => ({
  LLMProviderRoutingService: {
    init: vi.fn(),
    callLLM: vi.fn(() =>
      Promise.resolve({
        choices: [{ message: { role: 'assistant', content: 'Test response' } }],
      })
    ),
    buildProviderConfig: vi.fn(() => ({
      provider: 'openrouter',
      model: 'test-model',
      baseUrl: '',
    })),
  },
}));

// Mock TokenCountingService as ES module
vi.mock('../../js/services/token-counting-service.js', () => ({
  TokenCountingService: {
    init: vi.fn(),
    calculateTokenUsage: vi.fn(() => ({
      totalTokens: 100,
      contextWindow: 4096,
      warnings: [],
    })),
    getRecommendedAction: vi.fn(() => ({ action: 'none' })),
    truncateToTarget: vi.fn(params => params),
  },
}));

// Mock ToolCallHandlingService as ES module
vi.mock('../../js/services/tool-call-handling-service.js', () => ({
  ToolCallHandlingService: {
    init: vi.fn(),
    setStreamsData: vi.fn(),
    handleToolCalls: vi.fn(responseMessage => ({ responseMessage })),
    handleToolCallsWithFallback: vi.fn(responseMessage => ({ responseMessage })),
  },
}));

// Mock FallbackResponseService as ES module
vi.mock('../../js/services/fallback-response-service.js', () => ({
  FallbackResponseService: {
    init: vi.fn(),
    generateFallbackResponse: vi.fn(() => 'Fallback response'),
  },
}));

// Create mock window objects
function createMockWindow() {
  return {
    location: {
      origin: 'http://localhost:3000',
      href: 'http://localhost:3000/app.html',
    },
    SessionManager: {
      init: vi.fn(),
      setUserContext: vi.fn(),
      addMessageToHistory: vi.fn(),
      addMessagesToHistory: vi.fn(),
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
      removeMessageFromHistory: vi.fn(),
    },
    Storage: {
      onUpdate: vi.fn(),
      getStreams: vi.fn(() => []),
    },
    CircuitBreaker: {
      resetTurn: vi.fn(),
    },
    TokenCountingService: {
      init: vi.fn(),
      calculateTokenUsage: vi.fn(() => ({
        totalTokens: 100,
        contextWindow: 4096,
        warnings: [],
      })),
      getRecommendedAction: vi.fn(() => ({ action: 'none' })),
      truncateToTarget: vi.fn(params => params),
    },
    ToolCallHandlingService: {
      init: vi.fn(),
      handleToolCallsWithFallback: vi.fn(responseMessage => ({
        responseMessage,
      })),
    },
    LLMProviderRoutingService: {
      init: vi.fn(),
      callLLM: vi.fn(() =>
        Promise.resolve({
          choices: [{ message: { role: 'assistant', content: 'Test response' } }],
        })
      ),
      buildProviderConfig: vi.fn(() => ({
        provider: 'openrouter',
        model: 'test-model',
        baseUrl: '',
      })),
    },
    FallbackResponseService: {
      init: vi.fn(),
      generateFallbackResponse: vi.fn(() => 'Fallback response'),
    },
    Functions: {
      getEnabledSchemas: vi.fn(() => []),
      schemas: [],
    },
    Settings: {
      getSettings: vi.fn(() => ({
        llm: { provider: 'openrouter', model: 'test-model' },
        openrouter: { apiKey: 'test-key' },
      })),
    },
    Config: {
      openrouter: { apiKey: 'test-key' },
    },
    Prompts: {
      system: 'System prompt for {{personality_name}}',
    },
    DataQuery: {
      parseDateQuery: vi.fn(),
      queryByTimePeriod: vi.fn(),
      findPeakListeningPeriod: vi.fn(),
      comparePeriods: vi.fn(),
    },
    RAG: {
      isConfigured: vi.fn(() => false),
    },
    TokenCounter: {
      countTokens: vi.fn(() => 100),
    },
  };
}

describe('Chat TimeoutBudget Integration', () => {
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
    mockWindow.dispatchEvent = vi.fn();

    globalThis.window = mockWindow;

    // Import Chat module
    Chat = (await import('../../js/chat.js')).Chat;
  });

  it('should allocate timeout budget for chat turn', async () => {
    const { TimeoutBudget } = await import('../../js/services/timeout-budget-manager.js');

    // Initialize chat
    await Chat.initChat(
      { name: 'Test', tagline: 'Test', dataInsights: 'Test data' },
      {},
      { dateRange: { start: '2024-01-01', end: '2024-12-31' } },
      []
    );

    // Send a message
    await Chat.sendMessage('Hello', null, { bypassQueue: true, allowBypass: true });

    // Verify timeout budget was allocated for chat turn
    expect(TimeoutBudget.allocate).toHaveBeenCalledWith('chat_turn', 60000);
  });

  it('should release timeout budget after processing', async () => {
    const { TimeoutBudget } = await import('../../js/services/timeout-budget-manager.js');

    // Initialize chat
    await Chat.initChat(
      { name: 'Test', tagline: 'Test', dataInsights: 'Test data' },
      {},
      { dateRange: { start: '2024-01-01', end: '2024-12-31' } },
      []
    );

    // Send a message
    await Chat.sendMessage('Hello', null, { bypassQueue: true, allowBypass: true });

    // Verify timeout budget was released
    expect(TimeoutBudget.release).toHaveBeenCalled();
  });

  it('should allocate budget with correct operation name', async () => {
    const { TimeoutBudget } = await import('../../js/services/timeout-budget-manager.js');

    // Initialize chat
    await Chat.initChat(
      { name: 'Test', tagline: 'Test', dataInsights: 'Test data' },
      {},
      { dateRange: { start: '2024-01-01', end: '2024-12-31' } },
      []
    );

    // Send a message
    await Chat.sendMessage('Test message', null, { bypassQueue: true, allowBypass: true });

    // Verify budget was allocated with correct operation name
    expect(TimeoutBudget.allocate).toHaveBeenCalledWith('chat_turn', 60000);
  });

  it('should handle errors and still release budget', async () => {
    const { TimeoutBudget } = await import('../../js/services/timeout-budget-manager.js');
    const { LLMProviderRoutingService } =
      await import('../../js/services/llm-provider-routing-service.js');

    // Make LLM call fail
    LLMProviderRoutingService.callLLM.mockRejectedValue(new Error('LLM error'));

    // Initialize chat
    await Chat.initChat(
      { name: 'Test', tagline: 'Test', dataInsights: 'Test data' },
      {},
      { dateRange: { start: '2024-01-01', end: '2024-12-31' } },
      []
    );

    // Send a message and expect error
    const result = await Chat.sendMessage('Test message', null, {
      bypassQueue: true,
      allowBypass: true,
    });
    expect(result.status).toBe('error');
    expect(result.error).toBe('LLM error');

    // Verify timeout budget was still allocated and released
    expect(TimeoutBudget.allocate).toHaveBeenCalledWith('chat_turn', 60000);
    expect(TimeoutBudget.release).toHaveBeenCalled();
  });

  it('should not allocate budget when chat is not initialized', async () => {
    const { TimeoutBudget } = await import('../../js/services/timeout-budget-manager.js');

    // Try to send message without initialization
    await expect(Chat.sendMessage('Test message')).rejects.toThrow('Chat not initialized');

    // Verify timeout budget was not allocated
    expect(TimeoutBudget.allocate).not.toHaveBeenCalled();
  });

  it('should use default budget from TimeoutBudget.DEFAULT_BUDGETS', async () => {
    const { TimeoutBudget } = await import('../../js/services/timeout-budget-manager.js');

    // Initialize chat
    await Chat.initChat(
      { name: 'Test', tagline: 'Test', dataInsights: 'Test data' },
      {},
      { dateRange: { start: '2024-01-01', end: '2024-12-31' } },
      []
    );

    // Send a message
    await Chat.sendMessage('Test message', null, { bypassQueue: true, allowBypass: true });

    // Verify budget was allocated with correct timeout
    expect(TimeoutBudget.allocate).toHaveBeenCalledWith('chat_turn', 60000);
  });
});
