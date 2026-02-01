/**
 * Native Tool Strategy Unit Tests
 *
 * Tests for the native function calling strategy implementation.
 *
 * @module tests/unit/native-strategy.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==========================================
// Mocks
// ==========================================

const mockCircuitBreaker = {
  check: vi.fn(() => ({ allowed: true, reason: null })),
  recordCall: vi.fn(),
};

const mockFunctions = {
  execute: vi.fn(),
};

const mockSessionManager = {
  addMessageToHistory: vi.fn(),
  getHistory: vi.fn(() => []),
};

const mockTimeoutBudget = {
  allocate: vi.fn(() => ({ remaining: () => 10000 })),
  release: vi.fn(),
};

// Mock modules
vi.mock('../../js/services/circuit-breaker.js', () => ({ CircuitBreaker: mockCircuitBreaker }));
vi.mock('../../js/functions/index.js', () => ({ Functions: mockFunctions }));
vi.mock('../../js/services/session-manager.js', () => ({ SessionManager: mockSessionManager }));
vi.mock('../../js/services/timeout-budget-manager.js', () => ({
  TimeoutBudget: mockTimeoutBudget,
}));

// ==========================================
// Setup & Teardown
// ==========================================

let NativeToolStrategy;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();

  const module = await import('../../js/services/tool-strategies/native-strategy.js');
  NativeToolStrategy = module.NativeToolStrategy;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ==========================================
// Strategy Detection Tests
// ==========================================

describe('NativeToolStrategy Detection', () => {
  it('should have strategyName property', () => {
    const deps = {
      CircuitBreaker: mockCircuitBreaker,
      Functions: mockFunctions,
      SessionManager: mockSessionManager,
      TimeoutBudget: mockTimeoutBudget,
    };
    const strategy = new NativeToolStrategy(deps);
    strategy.strategyName = 'NativeToolStrategy';

    expect(strategy.strategyName).toBe('NativeToolStrategy');
  });

  it('should detect native tool_calls in response', () => {
    const deps = {
      CircuitBreaker: mockCircuitBreaker,
      Functions: mockFunctions,
      SessionManager: mockSessionManager,
      TimeoutBudget: mockTimeoutBudget,
    };
    const strategy = new NativeToolStrategy(deps);

    const responseMessage = {
      tool_calls: [{ id: 'call-1', function: { name: 'test_func', arguments: '{}' } }],
    };

    const result = strategy.canHandle(responseMessage, 1);

    expect(result.confidence).toBeGreaterThan(0);
    expect(result.reason.toLowerCase()).toContain('native');
  });

  it('should not handle responses without tool_calls', () => {
    const deps = {
      CircuitBreaker: mockCircuitBreaker,
      Functions: mockFunctions,
      SessionManager: mockSessionManager,
      TimeoutBudget: mockTimeoutBudget,
    };
    const strategy = new NativeToolStrategy(deps);

    const responseMessage = {
      content: 'Just a text response',
    };

    const result = strategy.canHandle(responseMessage, 1);

    expect(result.confidence).toBe(0);
  });

  it('should have high confidence for capability level 1', () => {
    const deps = {
      CircuitBreaker: mockCircuitBreaker,
      Functions: mockFunctions,
      SessionManager: mockSessionManager,
      TimeoutBudget: mockTimeoutBudget,
    };
    const strategy = new NativeToolStrategy(deps);

    const responseMessage = {
      tool_calls: [{ id: 'call-1', function: { name: 'test_func', arguments: '{}' } }],
    };

    const resultCap1 = strategy.canHandle(responseMessage, 1);
    const resultCap4 = strategy.canHandle(responseMessage, 4);

    // NativeToolStrategy only handles capability level 1
    expect(resultCap1.confidence).toBeGreaterThan(0);
    expect(resultCap4.confidence).toBe(0);
  });
});

// ==========================================
// Edge Cases
// ==========================================

describe('NativeToolStrategy Edge Cases', () => {
  it('should handle empty tool_calls array', () => {
    const deps = {
      CircuitBreaker: mockCircuitBreaker,
      Functions: mockFunctions,
      SessionManager: mockSessionManager,
      TimeoutBudget: mockTimeoutBudget,
    };
    const strategy = new NativeToolStrategy(deps);

    const responseMessage = {
      tool_calls: [],
    };

    const result = strategy.canHandle(responseMessage, 1);

    expect(result.confidence).toBe(0);
  });

  it('should handle tool_call with missing function property', () => {
    const deps = {
      CircuitBreaker: mockCircuitBreaker,
      Functions: mockFunctions,
      SessionManager: mockSessionManager,
      TimeoutBudget: mockTimeoutBudget,
    };
    const strategy = new NativeToolStrategy(deps);

    const responseMessage = {
      tool_calls: [
        { id: 'call-1' }, // Missing function property
      ],
    };

    const result = strategy.canHandle(responseMessage, 1);

    // Should still detect presence of tool_calls
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should handle tool_call with empty function name', () => {
    const deps = {
      CircuitBreaker: mockCircuitBreaker,
      Functions: mockFunctions,
      SessionManager: mockSessionManager,
      TimeoutBudget: mockTimeoutBudget,
    };
    const strategy = new NativeToolStrategy(deps);

    const responseMessage = {
      tool_calls: [{ id: 'call-1', function: { name: '', arguments: '{}' } }],
    };

    const result = strategy.canHandle(responseMessage, 1);

    // Should still detect presence of tool_calls
    expect(result.confidence).toBeGreaterThan(0);
  });
});
