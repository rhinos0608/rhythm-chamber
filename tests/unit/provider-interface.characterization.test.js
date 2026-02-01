/**
 * Provider Interface Characterization Tests
 *
 * These tests capture the CURRENT behavior of ProviderInterface
 * before refactoring. They serve as a safety net to ensure refactoring
 * doesn't break existing functionality.
 *
 * After refactoring, these tests should continue to pass.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProviderInterface } from '../../js/providers/provider-interface.js';
import { Settings } from '../../js/settings.js';
import { ConfigLoader } from '../../js/services/config-loader.js';
import { ProviderHealthAuthority } from '../../js/services/provider-health-authority.js';
import { ModuleRegistry } from '../../js/module-registry.js';

// Mock all dependencies
vi.mock('../../js/settings.js', () => ({
  Settings: {
    get: vi.fn(() => ({
      openrouter: {
        apiKey: 'test-key',
        model: 'test-model',
        temperature: 0.7,
        maxTokens: 4000,
      },
      ollama: {
        model: 'llama3.2',
        temperature: 0.8,
        maxTokens: 2000,
      },
      lmstudio: {
        model: 'local-model',
        temperature: 0.7,
        maxTokens: 2000,
      },
      gemini: {
        apiKey: 'gemini-test-key',
        model: 'gemini-2.5-flash',
      },
      openaiCompatible: {
        apiUrl: 'http://localhost:8080/v1/chat/completions',
        apiKey: 'oa-compatible-key',
        model: 'gpt-3.5-turbo',
      },
      llm: {
        ollamaEndpoint: 'http://localhost:11434',
        lmstudioEndpoint: 'http://localhost:1234/v1',
      },
    })),
  },
}));

vi.mock('../../js/services/config-loader.js', () => ({
  ConfigLoader: {
    get: vi.fn(key => {
      if (key === 'openrouter.apiKey') return 'test-key';
      return null;
    }),
  },
}));

vi.mock('../../js/module-registry.js', () => ({
  ModuleRegistry: {
    getModuleSync: vi.fn(moduleName => {
      if (moduleName === 'OllamaProvider') {
        return {
          call: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'Ollama response' } }],
          }),
        };
      }
      if (moduleName === 'Ollama') {
        return {
          isAvailable: vi.fn().mockReturnValue(true),
        };
      }
      return null;
    }),
  },
}));

vi.mock('../../js/services/provider-health-authority.js', () => {
  const circuitStates = new Map();

  return {
    ProviderHealthAuthority: {
      canExecute: vi.fn(key => {
        const state = circuitStates.get(key);
        if (!state) return { allowed: true };
        return state;
      }),
      recordSuccess: vi.fn((key, duration) => {
        circuitStates.set(key, { allowed: true, lastSuccess: Date.now() });
      }),
      recordFailure: vi.fn((key, error) => {
        circuitStates.set(key, { allowed: false, lastFailure: Date.now() });
      }),
      _clearCircuitStates: () => circuitStates.clear(),
    },
  };
});

// Mock provider modules
vi.mock('../../js/providers/openrouter.js', () => ({
  OpenRouterProvider: {
    call: vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'OpenRouter response' } }],
    }),
  },
}));

vi.mock('../../js/providers/lmstudio.js', () => ({
  LMStudioProvider: {
    call: vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'LM Studio response' } }],
    }),
  },
}));

vi.mock('../../js/providers/gemini.js', () => ({
  GeminiProvider: {
    call: vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Gemini response' } }],
    }),
  },
}));

vi.mock('../../js/providers/openai-compatible.js', () => ({
  OpenAICompatibleProvider: {
    call: vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'OpenAI Compatible response' } }],
    }),
  },
}));

// Mock timeout wrapper
vi.mock('../../js/utils/timeout-wrapper.js', () => ({
  withTimeout: vi.fn(async (fn, timeout, options) => {
    return await fn();
  }),
  TimeoutError: class TimeoutError extends Error {
    constructor(message) {
      super(message);
      this.name = 'TimeoutError';
    }
  },
}));

// Mock fetch for health checks
global.fetch = vi.fn();

describe('ProviderInterface Characterization Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ProviderHealthAuthority._clearCircuitStates();
    // Reset Settings.get to default mock
    Settings.get.mockReturnValue({
      openrouter: {
        apiKey: 'test-key',
        model: 'test-model',
        temperature: 0.7,
        maxTokens: 4000,
      },
      ollama: {
        model: 'llama3.2',
        temperature: 0.8,
        maxTokens: 2000,
      },
      lmstudio: {
        model: 'local-model',
        temperature: 0.7,
        maxTokens: 2000,
      },
      gemini: {
        apiKey: 'gemini-test-key',
        model: 'gemini-2.5-flash',
      },
      openaiCompatible: {
        apiUrl: 'http://localhost:8080/v1/chat/completions',
        apiKey: 'oa-compatible-key',
        model: 'gpt-3.5-turbo',
      },
      llm: {
        ollamaEndpoint: 'http://localhost:11434',
        lmstudioEndpoint: 'http://localhost:1234/v1',
      },
    });
  });

  afterEach(() => {
    global.fetch.mockReset?.();
  });

  describe('buildProviderConfig', () => {
    it('should build openrouter config with defaults', () => {
      const settings = {
        openrouter: {
          apiKey: 'test-key',
          model: 'gpt-4',
        },
      };
      const baseConfig = { model: 'default-model' };

      const config = ProviderInterface.buildProviderConfig('openrouter', settings, baseConfig);

      expect(config).toMatchObject({
        provider: 'openrouter',
        model: 'gpt-4',
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 4500,
        frequencyPenalty: 0,
        presencePenalty: 0,
        timeout: 60000,
        isLocal: false,
        privacyLevel: 'cloud',
      });
    });

    it('should build ollama config with local settings', () => {
      const settings = {
        ollama: {
          model: 'llama3.2',
          temperature: 0.8,
          maxTokens: 2000,
        },
        llm: {
          ollamaEndpoint: 'http://localhost:11434',
        },
      };

      const config = ProviderInterface.buildProviderConfig('ollama', settings, {});

      expect(config).toMatchObject({
        provider: 'ollama',
        endpoint: 'http://localhost:11434',
        model: 'llama3.2',
        temperature: 0.8,
        topP: 0.9,
        maxTokens: 2000,
        timeout: 90000,
        isLocal: true,
        privacyLevel: 'maximum',
      });
    });

    it('should build lmstudio config with local settings', () => {
      const settings = {
        lmstudio: {
          model: 'local-model',
          temperature: 0.7,
        },
        llm: {
          lmstudioEndpoint: 'http://localhost:1234/v1',
        },
      };

      const config = ProviderInterface.buildProviderConfig('lmstudio', settings, {});

      expect(config).toMatchObject({
        provider: 'lmstudio',
        endpoint: 'http://localhost:1234/v1',
        model: 'local-model',
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 2000,
        timeout: 90000,
        isLocal: true,
        privacyLevel: 'maximum',
      });
    });

    it('should build gemini config with cloud settings', () => {
      const settings = {
        gemini: {
          apiKey: 'gemini-key',
          model: 'gemini-2.5-flash',
        },
      };

      const config = ProviderInterface.buildProviderConfig('gemini', settings, {});

      expect(config).toMatchObject({
        provider: 'gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-2.5-flash',
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 8192,
        timeout: 60000,
        isLocal: false,
        privacyLevel: 'cloud',
      });
    });

    it('should build openai-compatible config', () => {
      const settings = {
        openaiCompatible: {
          apiUrl: 'http://localhost:8080/v1/chat/completions',
          apiKey: 'oa-key',
          model: 'gpt-3.5-turbo',
        },
      };

      const config = ProviderInterface.buildProviderConfig('openai-compatible', settings, {});

      expect(config).toMatchObject({
        provider: 'openai-compatible',
        apiUrl: 'http://localhost:8080/v1/chat/completions',
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 4000,
        timeout: 60000,
        isLocal: false,
        privacyLevel: 'cloud',
      });
    });

    it('should fallback to openrouter for unknown provider', () => {
      const settings = {
        openrouter: { model: 'default-model' },
      };

      const config = ProviderInterface.buildProviderConfig('unknown', settings, {});

      expect(config.provider).toBe('openrouter');
    });
  });

  describe('normalizeProviderError', () => {
    it('should normalize timeout errors', () => {
      const error = new Error('Request timed out');
      error.name = 'AbortError';

      const normalized = ProviderInterface.normalizeProviderError(error, 'openrouter');

      expect(normalized.type).toBe('timeout');
      expect(normalized.recoverable).toBe(true);
      expect(normalized.suggestion).toContain('Try again');
    });

    it('should normalize auth errors (401)', () => {
      const error = new Error('401 Unauthorized');

      const normalized = ProviderInterface.normalizeProviderError(error, 'openrouter');

      expect(normalized.type).toBe('auth');
      expect(normalized.recoverable).toBe(true);
      expect(normalized.suggestion).toContain('API key');
    });

    it('should normalize rate limit errors (429)', () => {
      const error = new Error('429 Rate limit exceeded');

      const normalized = ProviderInterface.normalizeProviderError(error, 'openrouter');

      expect(normalized.type).toBe('rate_limit');
      expect(normalized.recoverable).toBe(true);
      expect(normalized.suggestion).toContain('Wait');
    });

    it('should normalize connection errors', () => {
      const error = new Error('ECONNREFUSED');

      const normalized = ProviderInterface.normalizeProviderError(error, 'ollama');

      expect(normalized.type).toBe('connection');
      expect(normalized.recoverable).toBe(true);
      expect(normalized.suggestion).toContain('Start ollama');
    });

    it('should handle unknown errors', () => {
      const error = new Error('Unknown error');

      const normalized = ProviderInterface.normalizeProviderError(error, 'openrouter');

      expect(normalized.type).toBe('unknown');
      expect(normalized.recoverable).toBe(false);
    });
  });

  describe('getProviderModule', () => {
    it('should return OpenRouterProvider for openrouter', async () => {
      const { OpenRouterProvider } = await import('../../js/providers/openrouter.js');
      const module = ProviderInterface.getProviderModule('openrouter');

      expect(module).toBe(OpenRouterProvider);
    });

    it('should return LMStudioProvider for lmstudio', async () => {
      const { LMStudioProvider } = await import('../../js/providers/lmstudio.js');
      const module = ProviderInterface.getProviderModule('lmstudio');

      expect(module).toBe(LMStudioProvider);
    });

    it('should return OllamaProvider from ModuleRegistry', () => {
      const module = ProviderInterface.getProviderModule('ollama');

      expect(module).not.toBeNull();
      expect(typeof module.call).toBe('function');
    });

    it('should return GeminiProvider for gemini', async () => {
      const { GeminiProvider } = await import('../../js/providers/gemini.js');
      const module = ProviderInterface.getProviderModule('gemini');

      expect(module).toBe(GeminiProvider);
    });

    it('should return OpenAICompatibleProvider for openai-compatible', async () => {
      const { OpenAICompatibleProvider } = await import('../../js/providers/openai-compatible.js');
      const module = ProviderInterface.getProviderModule('openai-compatible');

      expect(module).toBe(OpenAICompatibleProvider);
    });
  });

  describe('checkOpenRouterHealth', () => {
    it('should return no_key status when API key missing', async () => {
      Settings.get.mockReturnValue({ openrouter: {} });
      ConfigLoader.get.mockReturnValue(null);

      const health = await ProviderInterface.checkOpenRouterHealth();

      expect(health.available).toBe(false);
      expect(health.status).toBe('no_key');
      expect(health.reason).toContain('No API key');
    });

    it('should return ready status with models when successful', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ data: [{ id: 'model1' }, { id: 'model2' }] }),
        clone: function () {
          return this;
        },
      });

      const health = await ProviderInterface.checkOpenRouterHealth();

      expect(health.available).toBe(true);
      expect(health.status).toBe('ready');
      expect(health.models).toEqual(['model1', 'model2']);
    });

    it('should return invalid_key status for 401/403', async () => {
      global.fetch.mockResolvedValue({
        status: 401,
        ok: false,
        headers: { get: () => null },
        clone: function () {
          return this;
        },
      });

      const health = await ProviderInterface.checkOpenRouterHealth();

      expect(health.available).toBe(false);
      expect(health.status).toBe('invalid_key');
    });

    it('should return timeout status on abort', async () => {
      global.fetch.mockImplementation(() => {
        const error = new Error('Timeout');
        error.name = 'AbortError';
        throw error;
      });

      const health = await ProviderInterface.checkOpenRouterHealth();

      expect(health.available).toBe(false);
      expect(health.status).toBe('timeout');
    });
  });

  describe('checkOllamaHealth', () => {
    it('should return ready status with models', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ models: [{ name: 'llama3.2' }, { name: 'mistral' }] }),
        clone: function () {
          return this;
        },
      });

      const health = await ProviderInterface.checkOllamaHealth();

      expect(health.available).toBe(true);
      expect(health.status).toBe('ready');
      expect(health.models).toEqual(['llama3.2', 'mistral']);
    });

    it('should return running_no_models when no models installed', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ models: [] }),
        clone: function () {
          return this;
        },
      });

      const health = await ProviderInterface.checkOllamaHealth();

      expect(health.available).toBe(true);
      expect(health.status).toBe('running_no_models');
      expect(health.reason).toContain('No models installed');
    });

    it('should return not_running on connection failure', async () => {
      global.fetch.mockImplementation(() => {
        const error = new Error('ECONNREFUSED');
        throw error;
      });

      const health = await ProviderInterface.checkOllamaHealth();

      expect(health.available).toBe(false);
      expect(health.status).toBe('not_running');
    });
  });

  describe('checkLMStudioHealth', () => {
    it('should return ready status with models', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ data: [{ id: 'local-model-1' }] }),
        clone: function () {
          return this;
        },
      });

      const health = await ProviderInterface.checkLMStudioHealth();

      expect(health.available).toBe(true);
      expect(health.status).toBe('ready');
      expect(health.models).toEqual(['local-model-1']);
    });

    it('should return running_no_models when no models loaded', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ data: [] }),
        clone: function () {
          return this;
        },
      });

      const health = await ProviderInterface.checkLMStudioHealth();

      expect(health.available).toBe(true);
      expect(health.status).toBe('running_no_models');
    });
  });

  describe('checkGeminiHealth', () => {
    it('should return no_key status when API key missing', async () => {
      Settings.get.mockReturnValue({ gemini: {} });

      const health = await ProviderInterface.checkGeminiHealth();

      expect(health.available).toBe(false);
      expect(health.status).toBe('no_key');
    });

    it('should return ready status with models', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ data: [{ id: 'gemini-2.5-flash' }] }),
        clone: function () {
          return this;
        },
      });

      const health = await ProviderInterface.checkGeminiHealth();

      expect(health.available).toBe(true);
      expect(health.status).toBe('ready');
    });
  });

  describe('checkOpenAICompatibleHealth', () => {
    it('should return not_configured when no URL', async () => {
      Settings.get.mockReturnValue({ openaiCompatible: {} });

      const health = await ProviderInterface.checkOpenAICompatibleHealth();

      expect(health.available).toBe(false);
      expect(health.status).toBe('not_configured');
    });

    it('should return ready status when endpoint accessible', async () => {
      Settings.get.mockReturnValue({
        openaiCompatible: {
          apiUrl: 'http://localhost:8080/v1/chat/completions',
        },
      });

      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ data: [{ id: 'gpt-3.5-turbo' }] }),
        clone: function () {
          return this;
        },
      });

      const health = await ProviderInterface.checkOpenAICompatibleHealth();

      expect(health.available).toBe(true);
      expect(health.status).toBe('ready');
    });
  });

  describe('isProviderAvailable', () => {
    it('should check ollama availability', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ models: [{ name: 'llama3.2' }] }),
        clone: function () {
          return this;
        },
      });

      const available = await ProviderInterface.isProviderAvailable('ollama');

      expect(available).toBe(true);
    });

    it('should check lmstudio availability', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ data: [] }),
        clone: function () {
          return this;
        },
      });

      const available = await ProviderInterface.isProviderAvailable('lmstudio');

      expect(available).toBe(true);
    });

    it('should check gemini availability', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ data: [{ id: 'gemini-2.5-flash' }] }),
        clone: function () {
          return this;
        },
      });

      const available = await ProviderInterface.isProviderAvailable('gemini');

      expect(available).toBe(true);
    });

    it('should check openrouter availability', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ data: [] }),
        clone: function () {
          return this;
        },
      });

      const available = await ProviderInterface.isProviderAvailable('openrouter');

      expect(available).toBe(true);
    });
  });

  describe('getAvailableProviders', () => {
    it('should return availability status for all providers', async () => {
      // Mock all providers as available
      global.fetch
        .mockResolvedValue({
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({ data: [] }),
          clone: function () {
            return this;
          },
        })
        .mockResolvedValue({
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({ models: [] }),
          clone: function () {
            return this;
          },
        });

      const providers = await ProviderInterface.getAvailableProviders();

      expect(providers).toHaveLength(5);
      expect(providers[0]).toHaveProperty('name');
      expect(providers[0]).toHaveProperty('available');
    });
  });

  describe('checkHealth', () => {
    it('should return health status for all providers', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ data: [], models: [] }),
        clone: function () {
          return this;
        },
      });

      const health = await ProviderInterface.checkHealth();

      expect(health).toHaveProperty('openrouter');
      expect(health).toHaveProperty('ollama');
      expect(health).toHaveProperty('lmstudio');
      expect(health).toHaveProperty('gemini');
      expect(health).toHaveProperty('openaiCompatible');
    });
  });

  describe('TIMEOUTS constant', () => {
    it('should expose TIMEOUTS constant', () => {
      expect(ProviderInterface.TIMEOUTS).toBeDefined();
      expect(ProviderInterface.TIMEOUTS.cloud).toBe(60000);
      expect(ProviderInterface.TIMEOUTS.local).toBe(90000);
    });
  });
});
