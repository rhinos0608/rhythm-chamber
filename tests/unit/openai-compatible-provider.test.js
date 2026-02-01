/**
 * OpenAI-Compatible Provider Unit Tests
 *
 * Tests for js/providers/openai-compatible.js
 * Tests provider structure, configuration handling, normalizeToolArguments,
 * and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==========================================
// Mocks
// ==========================================

// Mock fetch globally
global.fetch = vi.fn();

// Mock safeJsonParse utility
vi.mock('../../js/utils/safe-json.js', () => ({
  safeJsonParse: vi.fn((json, defaultValue) => {
    try {
      return JSON.parse(json);
    } catch {
      return defaultValue;
    }
  }),
}));

// ==========================================
// Setup & Teardown
// ==========================================

let OpenAICompatibleProvider;
let safeJsonParse;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();

  // Import after clearing modules
  const providerModule = await import('../../js/providers/openai-compatible.js');
  OpenAICompatibleProvider = providerModule.OpenAICompatibleProvider;

  // Import mocked utility
  const safeJsonModule = await import('../../js/utils/safe-json.js');
  safeJsonParse = safeJsonModule.safeJsonParse;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ==========================================
// Provider Structure Tests
// ==========================================

describe('OpenAICompatibleProvider Provider exports', () => {
  it('should export as OpenAICompatibleProvider', () => {
    expect(OpenAICompatibleProvider).toBeDefined();
    expect(typeof OpenAICompatibleProvider).toBe('object');
  });

  it('has name property set to "openai-compatible"', () => {
    expect(OpenAICompatibleProvider.name).toBe('openai-compatible');
  });

  it('has displayName property set to "OpenAI Compatible"', () => {
    expect(OpenAICompatibleProvider.displayName).toBe('OpenAI Compatible');
  });

  it('has type property', () => {
    expect(OpenAICompatibleProvider.type).toBe('generic');
  });

  it('has TIMEOUT_MS constant', () => {
    expect(OpenAICompatibleProvider.TIMEOUT_MS).toBe(60000);
  });

  it('has call function', () => {
    expect(OpenAICompatibleProvider.call).toBeDefined();
    expect(typeof OpenAICompatibleProvider.call).toBe('function');
  });

  it('has callStreaming function', () => {
    expect(OpenAICompatibleProvider.callStreaming).toBeDefined();
    expect(typeof OpenAICompatibleProvider.callStreaming).toBe('function');
  });

  it('has validateApiKey function', () => {
    expect(OpenAICompatibleProvider.validateApiKey).toBeDefined();
    expect(typeof OpenAICompatibleProvider.validateApiKey).toBe('function');
  });

  it('has listModels function', () => {
    expect(OpenAICompatibleProvider.listModels).toBeDefined();
    expect(typeof OpenAICompatibleProvider.listModels).toBe('function');
  });

  it('has normalizeToolArguments function', () => {
    expect(OpenAICompatibleProvider.normalizeToolArguments).toBeDefined();
    expect(typeof OpenAICompatibleProvider.normalizeToolArguments).toBe('function');
  });
});

// ==========================================
// normalizeToolArguments Tests
// ==========================================

describe('OpenAICompatibleProvider normalizeToolArguments', () => {
  it('returns valid JSON string as-is', () => {
    const validJson = '{"artist":"Taylor Swift","year":2023}';
    const result = OpenAICompatibleProvider.normalizeToolArguments(validJson);

    expect(result).toBe(validJson);
  });

  it('stringifies object arguments', () => {
    const objArgs = { artist: 'Taylor Swift', year: 2023 };
    const result = OpenAICompatibleProvider.normalizeToolArguments(objArgs);

    expect(result).toBe('{"artist":"Taylor Swift","year":2023}');
  });

  it('returns empty object for invalid JSON strings', () => {
    const invalidJson = 'invalid json string{';
    const result = OpenAICompatibleProvider.normalizeToolArguments(invalidJson);

    expect(result).toBe('{}');
  });

  it('returns empty object for null', () => {
    const result = OpenAICompatibleProvider.normalizeToolArguments(null);

    expect(result).toBe('{}');
  });

  it('returns empty object for undefined', () => {
    const result = OpenAICompatibleProvider.normalizeToolArguments(undefined);

    expect(result).toBe('{}');
  });

  it('handles empty object', () => {
    const result = OpenAICompatibleProvider.normalizeToolArguments({});

    expect(result).toBe('{}');
  });

  it('handles nested object structures', () => {
    const nested = {
      filter: { artist: 'Taylor Swift', year: 2023 },
      options: { limit: 10, offset: 0 },
    };
    const result = OpenAICompatibleProvider.normalizeToolArguments(nested);

    expect(result).toBe(JSON.stringify(nested));
  });

  it('handles array arguments', () => {
    const arrArgs = ['item1', 'item2', 'item3'];
    const result = OpenAICompatibleProvider.normalizeToolArguments(arrArgs);

    expect(result).toBe('["item1","item2","item3"]');
  });
});

// ==========================================
// call function Tests
// ==========================================

describe('OpenAICompatibleProvider call function', () => {
  it('throws error when config.apiUrl is missing', async () => {
    const messages = [{ role: 'user', content: 'Hello' }];

    await expect(OpenAICompatibleProvider.call('test-key', {}, messages)).rejects.toThrow(
      'apiUrl to be configured'
    );
  });

  it('throws error when messages array is empty', async () => {
    const config = { apiUrl: 'https://api.example.com/v1/chat/completions' };

    await expect(OpenAICompatibleProvider.call('test-key', config, [])).rejects.toThrow(
      'Messages array is required'
    );
  });

  it('throws error when messages is not an array', async () => {
    const config = { apiUrl: 'https://api.example.com/v1/chat/completions' };

    await expect(OpenAICompatibleProvider.call('test-key', config, null)).rejects.toThrow(
      'Messages array is required'
    );
  });

  it('throws error when model is not configured', async () => {
    const config = { apiUrl: 'https://api.example.com/v1/chat/completions' };
    const messages = [{ role: 'user', content: 'Hello' }];

    await expect(OpenAICompatibleProvider.call('test-key', config, messages)).rejects.toThrow(
      'Model is required'
    );
  });

  it('includes Authorization header when apiKey is provided', async () => {
    const config = {
      apiUrl: 'https://api.example.com/v1/chat/completions',
      model: 'gpt-4',
    };
    const messages = [{ role: 'user', content: 'Hello' }];

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Response', role: 'assistant' } }],
      }),
    });

    await OpenAICompatibleProvider.call('sk-test-key', config, messages);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test-key',
        }),
      })
    );
  });

  it('does NOT include Authorization header when apiKey is NOT provided', async () => {
    const config = {
      apiUrl: 'https://api.example.com/v1/chat/completions',
      model: 'gpt-4',
    };
    const messages = [{ role: 'user', content: 'Hello' }];

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Response', role: 'assistant' } }],
      }),
    });

    await OpenAICompatibleProvider.call(null, config, messages);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          Authorization: expect.any(String),
        }),
      })
    );
  });

  it('handles timeout by rejecting with AbortError', async () => {
    const config = {
      apiUrl: 'https://api.example.com/v1/chat/completions',
      model: 'gpt-4',
      timeout: 100,
    };
    const messages = [{ role: 'user', content: 'Hello' }];

    // Mock fetch to reject with AbortError (simulating timeout)
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    global.fetch.mockRejectedValue(abortError);

    await expect(OpenAICompatibleProvider.call('test-key', config, messages)).rejects.toThrow(
      'timed out after 0.1 seconds'
    );
  });

  it('returns OpenAI-compatible response structure', async () => {
    const config = {
      apiUrl: 'https://api.example.com/v1/chat/completions',
      model: 'gpt-4',
    };
    const messages = [{ role: 'user', content: 'Hello' }];

    const mockResponse = {
      choices: [{ message: { content: 'Test response', role: 'assistant' } }],
      model: 'gpt-4',
      usage: { total_tokens: 10 },
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await OpenAICompatibleProvider.call('test-key', config, messages);

    expect(result).toEqual(mockResponse);
  });

  it('includes tools in request when provided', async () => {
    const config = {
      apiUrl: 'https://api.example.com/v1/chat/completions',
      model: 'gpt-4',
    };
    const messages = [{ role: 'user', content: 'Hello' }];
    const tools = [{ type: 'function', function: { name: 'test_func', parameters: {} } }];

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Response' } }] }),
    });

    await OpenAICompatibleProvider.call('test-key', config, messages, tools);

    const fetchCall = global.fetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);

    expect(body.tools).toEqual(tools);
    expect(body.tool_choice).toBe('auto');
  });

  it('includes optional parameters when configured', async () => {
    const config = {
      apiUrl: 'https://api.example.com/v1/chat/completions',
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 1000,
      topP: 0.9,
      frequencyPenalty: 0.5,
      presencePenalty: 0.3,
    };
    const messages = [{ role: 'user', content: 'Hello' }];

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Response' } }] }),
    });

    await OpenAICompatibleProvider.call('test-key', config, messages);

    const fetchCall = global.fetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);

    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(1000);
    expect(body.top_p).toBe(0.9);
    expect(body.frequency_penalty).toBe(0.5);
    expect(body.presence_penalty).toBe(0.3);
  });
});

// ==========================================
// callStreaming function Tests
// ==========================================

describe('OpenAICompatibleProvider callStreaming function', () => {
  it('throws error when config.apiUrl is missing', async () => {
    const messages = [{ role: 'user', content: 'Hello' }];
    const onToken = vi.fn();

    await expect(
      OpenAICompatibleProvider.callStreaming('test-key', {}, messages, [], onToken)
    ).rejects.toThrow('apiUrl to be configured');
  });

  it('throws error when messages array is empty', async () => {
    const config = { apiUrl: 'https://api.example.com/v1/chat/completions' };
    const onToken = vi.fn();

    await expect(
      OpenAICompatibleProvider.callStreaming('test-key', config, [], [], onToken)
    ).rejects.toThrow('Messages array is required');
  });

  it('throws error when model is not configured', async () => {
    const config = { apiUrl: 'https://api.example.com/v1/chat/completions' };
    const messages = [{ role: 'user', content: 'Hello' }];
    const onToken = vi.fn();

    await expect(
      OpenAICompatibleProvider.callStreaming('test-key', config, messages, [], onToken)
    ).rejects.toThrow('Model is required');
  });

  it('sets stream: true in request body', async () => {
    const config = {
      apiUrl: 'https://api.example.com/v1/chat/completions',
      model: 'gpt-4',
    };
    const messages = [{ role: 'user', content: 'Hello' }];
    const onToken = vi.fn();

    // Create a mock stream response
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    global.fetch.mockResolvedValue({
      ok: true,
      body: mockStream,
    });

    await OpenAICompatibleProvider.callStreaming('test-key', config, messages, [], onToken);

    const fetchCall = global.fetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);

    expect(body.stream).toBe(true);
  });

  it('processes SSE chunks correctly', async () => {
    const config = {
      apiUrl: 'https://api.example.com/v1/chat/completions',
      model: 'gpt-4',
    };
    const messages = [{ role: 'user', content: 'Hello' }];
    const onToken = vi.fn();

    // Create a mock streaming response with SSE chunks
    const streamData = [
      'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(streamData));
        controller.close();
      },
    });

    global.fetch.mockResolvedValue({
      ok: true,
      body: mockStream,
    });

    const result = await OpenAICompatibleProvider.callStreaming(
      'test-key',
      config,
      messages,
      [],
      onToken
    );

    expect(result.choices[0].message.content).toBe('Hello world');
  });

  it('handles thinking blocks in streaming', async () => {
    const config = {
      apiUrl: 'https://api.example.com/v1/chat/completions',
      model: 'gpt-4',
    };
    const messages = [{ role: 'user', content: 'Hello' }];
    const onToken = vi.fn();

    // Create streaming response with thinking tags
    // The thinking tag comes in one chunk, content in another, end tag in a third
    const streamData = [
      'data: {"choices":[{"delta":{"content":"<extended_thinking>"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"thinking process"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"</extended_thinking>"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Response"},"finish_reason":null}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(streamData));
        controller.close();
      },
    });

    global.fetch.mockResolvedValue({
      ok: true,
      body: mockStream,
    });

    const result = await OpenAICompatibleProvider.callStreaming(
      'test-key',
      config,
      messages,
      [],
      onToken
    );

    // The thinking content is excluded from the main response content
    expect(result.choices[0].message.content).toBe('Response');
    // Verify onProgress was called with thinking type
    expect(onToken).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'thinking', content: 'thinking process' })
    );
  });

  it('accumulates tool calls in streaming', async () => {
    const config = {
      apiUrl: 'https://api.example.com/v1/chat/completions',
      model: 'gpt-4',
    };
    const messages = [{ role: 'user', content: 'Hello' }];
    const onToken = vi.fn();

    // Create streaming response with tool calls
    const streamData = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"search","arguments":""}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"artist\\""}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"test\\"}"}}]}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(streamData));
        controller.close();
      },
    });

    global.fetch.mockResolvedValue({
      ok: true,
      body: mockStream,
    });

    const result = await OpenAICompatibleProvider.callStreaming(
      'test-key',
      config,
      messages,
      [],
      onToken
    );

    expect(result.choices[0].message.tool_calls).toHaveLength(1);
    expect(result.choices[0].message.tool_calls[0].function.name).toBe('search');
    expect(result.choices[0].message.tool_calls[0].function.arguments).toBe('{"artist":"test"}');
  });
});

// ==========================================
// Error handling Tests
// ==========================================

describe('OpenAICompatibleProvider Error handling', () => {
  it('parses JSON error messages correctly', async () => {
    const config = {
      apiUrl: 'https://api.example.com/v1/chat/completions',
      model: 'gpt-4',
    };
    const messages = [{ role: 'user', content: 'Hello' }];

    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () =>
        JSON.stringify({
          error: { message: 'Invalid request' },
        }),
    });

    await expect(OpenAICompatibleProvider.call('test-key', config, messages)).rejects.toThrow(
      'Invalid request'
    );
  });

  it('parses flat JSON error structure', async () => {
    const config = {
      apiUrl: 'https://api.example.com/v1/chat/completions',
      model: 'gpt-4',
    };
    const messages = [{ role: 'user', content: 'Hello' }];

    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () =>
        JSON.stringify({
          message: 'Unauthorized access',
        }),
    });

    await expect(OpenAICompatibleProvider.call('test-key', config, messages)).rejects.toThrow(
      'Unauthorized access'
    );
  });

  it('handles plain text error responses', async () => {
    const config = {
      apiUrl: 'https://api.example.com/v1/chat/completions',
      model: 'gpt-4',
    };
    const messages = [{ role: 'user', content: 'Hello' }];

    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => 'Internal Server Error',
    });

    await expect(OpenAICompatibleProvider.call('test-key', config, messages)).rejects.toThrow(
      'API error: 500: Internal Server Error'
    );
  });

  it('handles HTML error responses', async () => {
    const config = {
      apiUrl: 'https://api.example.com/v1/chat/completions',
      model: 'gpt-4',
    };
    const messages = [{ role: 'user', content: 'Hello' }];

    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => '<html><body>Not Found</body></html>',
    });

    await expect(OpenAICompatibleProvider.call('test-key', config, messages)).rejects.toThrow(
      'API error: 404: <html><body>Not Fo'
    );
  });

  it('returns meaningful error message for malformed JSON errors', async () => {
    const config = {
      apiUrl: 'https://api.example.com/v1/chat/completions',
      model: 'gpt-4',
    };
    const messages = [{ role: 'user', content: 'Hello' }];

    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{invalid json}',
    });

    await expect(OpenAICompatibleProvider.call('test-key', config, messages)).rejects.toThrow(
      'API error: 400:'
    );
  });

  it('handles timeout errors in streaming', async () => {
    const config = {
      apiUrl: 'https://api.example.com/v1/chat/completions',
      model: 'gpt-4',
      timeout: 100,
    };
    const messages = [{ role: 'user', content: 'Hello' }];
    const onToken = vi.fn();

    // Mock fetch to reject with AbortError (simulating timeout)
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    global.fetch.mockRejectedValue(abortError);

    await expect(
      OpenAICompatibleProvider.callStreaming('test-key', config, messages, [], onToken)
    ).rejects.toThrow('timed out after 0.1 seconds');
  });

  it('handles streaming errors', async () => {
    const config = {
      apiUrl: 'https://api.example.com/v1/chat/completions',
      model: 'gpt-4',
    };
    const messages = [{ role: 'user', content: 'Hello' }];
    const onToken = vi.fn();

    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ error: { message: 'Invalid token' } }),
    });

    await expect(
      OpenAICompatibleProvider.callStreaming('test-key', config, messages, [], onToken)
    ).rejects.toThrow('Invalid token');
  });
});

// ==========================================
// validateApiKey Tests
// ==========================================

describe('OpenAICompatibleProvider validateApiKey', () => {
  it('returns false when apiUrl is not configured', async () => {
    const result = await OpenAICompatibleProvider.validateApiKey('test-key', {});

    expect(result).toBe(false);
  });

  it('returns false for short API keys', async () => {
    const config = { apiUrl: 'https://api.example.com/v1/chat/completions' };

    const result = await OpenAICompatibleProvider.validateApiKey('abc', config);

    expect(result).toBe(false);
  });

  it('returns true when endpoint is accessible (200)', async () => {
    const config = { apiUrl: 'https://api.example.com/v1/chat/completions' };

    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
    });

    const result = await OpenAICompatibleProvider.validateApiKey('valid-key', config);

    expect(result).toBe(true);
  });

  it('returns true when endpoint returns 401 (endpoint exists but auth failed)', async () => {
    const config = { apiUrl: 'https://api.example.com/v1/chat/completions' };

    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
    });

    const result = await OpenAICompatibleProvider.validateApiKey('invalid-key', config);

    expect(result).toBe(true);
  });

  it('returns true when endpoint returns 404 (some providers dont have /models)', async () => {
    const config = { apiUrl: 'https://api.example.com/v1/chat/completions' };

    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await OpenAICompatibleProvider.validateApiKey('test-key', config);

    expect(result).toBe(true);
  });

  it('includes Authorization header when apiKey is provided for validation', async () => {
    const config = { apiUrl: 'https://api.example.com/v1/chat/completions' };

    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
    });

    await OpenAICompatibleProvider.validateApiKey('test-key', config);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      })
    );
  });

  it('does not include Authorization header when apiKey is not provided', async () => {
    const config = { apiUrl: 'https://api.example.com/v1/chat/completions' };

    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
    });

    await OpenAICompatibleProvider.validateApiKey(null, config);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.not.objectContaining({
          Authorization: expect.any(String),
        }),
      })
    );
  });

  it('handles network errors gracefully', async () => {
    const config = { apiUrl: 'https://api.example.com/v1/chat/completions' };

    global.fetch.mockRejectedValue(new Error('Network error'));

    const result = await OpenAICompatibleProvider.validateApiKey('test-key', config);

    // Should return true (don't fail validation completely)
    expect(result).toBe(true);
  });
});

// ==========================================
// listModels Tests
// ==========================================

describe('OpenAICompatibleProvider listModels', () => {
  it('throws error when apiUrl is not configured', async () => {
    await expect(OpenAICompatibleProvider.listModels('test-key', {})).rejects.toThrow(
      'apiUrl is required'
    );
  });

  it('returns models list from API', async () => {
    const config = { apiUrl: 'https://api.example.com/v1/chat/completions' };

    const mockModels = {
      data: [
        { id: 'gpt-4', object: 'model' },
        { id: 'gpt-3.5-turbo', object: 'model' },
      ],
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => mockModels,
    });

    const result = await OpenAICompatibleProvider.listModels('test-key', config);

    expect(result).toEqual(mockModels.data);
  });

  it('includes Authorization header when apiKey is provided', async () => {
    const config = { apiUrl: 'https://api.example.com/v1/chat/completions' };

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    await OpenAICompatibleProvider.listModels('test-key', config);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      })
    );
  });

  it('throws error on non-OK response', async () => {
    const config = { apiUrl: 'https://api.example.com/v1/chat/completions' };

    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
    });

    await expect(OpenAICompatibleProvider.listModels('invalid-key', config)).rejects.toThrow(
      'Failed to list models: 401'
    );
  });

  it('throws timeout error after configured timeout', async () => {
    const config = { apiUrl: 'https://api.example.com/v1/chat/completions' };

    // Mock that rejects with AbortError (simulating timeout)
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';

    global.fetch.mockRejectedValue(abortError);

    await expect(OpenAICompatibleProvider.listModels('test-key', config)).rejects.toThrow();
  });
});

// ==========================================
// URL Construction Tests
// ==========================================

describe('OpenAICompatibleProvider URL construction', () => {
  it('correctly constructs models URL from /chat/completions endpoint', async () => {
    const config = { apiUrl: 'https://api.example.com/v1/chat/completions' };

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    await OpenAICompatibleProvider.listModels('test-key', config);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/models',
      expect.any(Object)
    );
  });

  it('correctly constructs models URL from /v1/chat/completions endpoint', async () => {
    const config = { apiUrl: 'https://api.example.com/chat/completions' };

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    await OpenAICompatibleProvider.listModels('test-key', config);

    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/models', expect.any(Object));
  });

  it('correctly handles URL with existing path', async () => {
    const config = { apiUrl: 'https://api.example.com/v1/chat/completions' };

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    await OpenAICompatibleProvider.validateApiKey('test-key', config);

    // Should replace /v1/chat/completions with /v1/models
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/models',
      expect.any(Object)
    );
  });
});
