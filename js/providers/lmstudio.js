/**
 * LM Studio Provider
 * 
 * Handles API calls to LM Studio (OpenAI-compatible local server).
 * Supports streaming with thinking block detection.
 * 
 * BRING YOUR OWN AI: Users run AI models on their own hardware for maximum privacy.
 * 
 * @module providers/lmstudio
 */

// ==========================================
// Configuration
// ==========================================

const LMSTUDIO_TIMEOUT_MS = 90000;  // 90 seconds for local models
const LMSTUDIO_DEFAULT_ENDPOINT = 'http://localhost:1234/v1';

// ==========================================
// API Call
// ==========================================

/**
 * Make an API call to LM Studio
 * @param {object} config - Provider config
 * @param {Array} messages - Chat messages
 * @param {Array} tools - Function calling tools (optional)
 * @param {function} onProgress - Progress callback for streaming (optional)
 * @returns {Promise<object>} OpenAI-compatible response
 */
async function call(config, messages, tools, onProgress = null) {
    const useStreaming = typeof onProgress === 'function';
    const endpoint = config.endpoint || LMSTUDIO_DEFAULT_ENDPOINT;

    const body = {
        model: config.model,
        messages,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        top_p: config.topP,
        stream: useStreaming
    };

    // Add tools if provided
    if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
    }

    const timeout = config.timeout || LMSTUDIO_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[LMStudio] API error:', response.status, errorText);
            throw new Error(`LM Studio error: ${response.status}`);
        }

        // Handle streaming response
        if (useStreaming) {
            try {
                const result = await handleStreamingResponse(response, onProgress);
                // Validate the result has non-empty content or tool calls
                const hasContent = result.choices?.[0]?.message?.content?.length > 0;
                const hasToolCalls = result.choices?.[0]?.message?.tool_calls?.length > 0;

                if (hasContent || hasToolCalls) {
                    return result;
                }

                // Streaming returned empty response - fallback to non-streaming
                console.warn('[LMStudio] Streaming returned empty response, retrying non-streaming');

                // Make a new non-streaming request
                const fallbackController = new AbortController();
                const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), timeout);

                try {
                    const fallbackBody = { ...body, stream: false };
                    const fallbackResponse = await fetch(`${endpoint}/chat/completions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(fallbackBody),
                        signal: fallbackController.signal
                    });

                    clearTimeout(fallbackTimeoutId);

                    if (!fallbackResponse.ok) {
                        throw new Error(`LM Studio fallback error: ${fallbackResponse.status}`);
                    }

                    const fallbackResult = await fallbackResponse.json();
                    console.log('[LMStudio] Non-streaming fallback succeeded');

                    // Emit the full content through onProgress for UI update
                    if (fallbackResult.choices?.[0]?.message?.content) {
                        onProgress({ type: 'token', token: fallbackResult.choices[0].message.content });
                    }

                    return fallbackResult;
                } catch (fallbackErr) {
                    clearTimeout(fallbackTimeoutId);
                    throw fallbackErr;
                }
            } catch (streamErr) {
                console.error('[LMStudio] Streaming error:', streamErr);
                throw new Error(`LM Studio streaming failed: ${streamErr.message}`);
            }
        }

        return response.json();
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new Error(`LM Studio request timed out after ${timeout / 1000} seconds`);
        }
        // Catch network errors (server not running)
        if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.name === 'TypeError') {
            throw new Error('Cannot connect to LM Studio. Make sure the server is running at ' + endpoint);
        }
        throw err;
    }
}

// ==========================================
// Streaming Response Handler
// ==========================================

/**
 * Handle SSE streaming response from LM Studio
 * Supports <think>...</think> blocks for reasoning models
 * @param {Response} response - Fetch response
 * @param {function} onProgress - Progress callback
 * @returns {Promise<object>} OpenAI-compatible response
 */
async function handleStreamingResponse(response, onProgress) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let fullContent = '';
    let thinkingContent = '';
    let inThinking = false;
    let lastMessage = null;
    let toolCallsAccumulator = [];  // Collect tool calls from streaming
    let toolCallsById = {};  // Track tool calls by id for proper assembly
    let buffer = '';  // Buffer for incomplete chunks

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Append to buffer and process complete lines
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Keep last incomplete line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine === '' || trimmedLine === '[DONE]') continue;

            // Try to parse the line - support both SSE format and NDJSON
            let data = trimmedLine;

            // Handle SSE data: prefix
            if (trimmedLine.startsWith('data: ')) {
                data = trimmedLine.slice(6);
                if (data === '[DONE]') continue;
            }

            // Skip non-JSON lines (SSE comments, empty data, etc.)
            if (!data.startsWith('{')) continue;

            try {
                const parsed = JSON.parse(data);

                // Handle both streaming delta format AND complete message format
                const delta = parsed.choices?.[0]?.delta;
                const message = parsed.choices?.[0]?.message;

                // For complete (non-streaming) responses embedded in stream
                if (message?.content && !delta) {
                    fullContent = message.content;
                    if (message.tool_calls) {
                        for (const tc of message.tool_calls) {
                            toolCallsById[tc.id || `call_${Object.keys(toolCallsById).length}`] = {
                                id: tc.id || `call_${Object.keys(toolCallsById).length}`,
                                type: 'function',
                                function: {
                                    name: tc.function?.name || '',
                                    arguments: typeof tc.function?.arguments === 'string'
                                        ? tc.function.arguments
                                        : JSON.stringify(tc.function?.arguments || {})
                                }
                            };
                        }
                    }
                    lastMessage = parsed;
                    continue;
                }

                if (delta?.content) {
                    const token = delta.content;

                    // Detect thinking blocks (<think>...</think>)
                    if (token.includes('<think>')) {
                        inThinking = true;
                        const parts = token.split('<think>');
                        if (parts[0]) {
                            fullContent += parts[0];
                            onProgress({ type: 'token', token: parts[0] });
                        }
                        thinkingContent += parts[1] || '';
                        continue;
                    }

                    if (token.includes('</think>')) {
                        inThinking = false;
                        const parts = token.split('</think>');
                        thinkingContent += parts[0] || '';
                        onProgress({ type: 'thinking', content: thinkingContent });
                        thinkingContent = '';
                        if (parts[1]) {
                            fullContent += parts[1];
                            onProgress({ type: 'token', token: parts[1] });
                        }
                        continue;
                    }

                    if (inThinking) {
                        thinkingContent += token;
                    } else {
                        fullContent += token;
                        onProgress({ type: 'token', token });
                    }
                }

                // Track tool calls in streaming
                if (delta?.tool_calls) {
                    onProgress({ type: 'tool_call', toolCalls: delta.tool_calls });
                    // Accumulate tool calls from streaming chunks
                    for (const tc of delta.tool_calls) {
                        const idx = tc.index ?? 0;
                        if (!toolCallsById[idx]) {
                            toolCallsById[idx] = {
                                id: tc.id || `call_${idx}`,
                                type: 'function',
                                function: {
                                    name: tc.function?.name || '',
                                    arguments: tc.function?.arguments || ''
                                }
                            };
                        } else {
                            // Append arguments for chunked tool calls
                            if (tc.function?.name) {
                                toolCallsById[idx].function.name = tc.function.name;
                            }
                            if (tc.function?.arguments) {
                                toolCallsById[idx].function.arguments += tc.function.arguments;
                            }
                        }
                    }
                }

                lastMessage = parsed;
            } catch (e) {
                // Log parse errors for debugging (only in dev)
                if (data.length > 0 && data.startsWith('{')) {
                    console.debug('[LMStudio] Failed to parse chunk:', data.substring(0, 100));
                }
            }
        }
    }

    // Process any remaining buffer content
    if (buffer.trim()) {
        let data = buffer.trim();
        if (data.startsWith('data: ')) {
            data = data.slice(6);
        }
        if (data.startsWith('{')) {
            try {
                const parsed = JSON.parse(data);
                const message = parsed.choices?.[0]?.message;
                if (message?.content) {
                    fullContent = message.content;
                }
                if (message?.tool_calls) {
                    for (const tc of message.tool_calls) {
                        toolCallsById[tc.id || `call_${Object.keys(toolCallsById).length}`] = {
                            id: tc.id || `call_${Object.keys(toolCallsById).length}`,
                            type: 'function',
                            function: {
                                name: tc.function?.name || '',
                                arguments: typeof tc.function?.arguments === 'string'
                                    ? tc.function.arguments
                                    : JSON.stringify(tc.function?.arguments || {})
                            }
                        };
                    }
                }
                lastMessage = parsed;
            } catch (e) {
                console.debug('[LMStudio] Failed to parse final buffer');
            }
        }
    }

    // Finalize tool calls array (outside the while loop)
    toolCallsAccumulator = Object.values(toolCallsById);

    // Build OpenAI-compatible response
    const responseMessage = {
        role: 'assistant',
        content: fullContent || null
    };

    // Add tool calls if present
    if (toolCallsAccumulator.length > 0) {
        responseMessage.tool_calls = toolCallsAccumulator;
    }

    console.log('[LMStudio] Streaming complete - content length:', fullContent.length, 'tool_calls:', toolCallsAccumulator.length);

    return {
        choices: [{
            message: responseMessage,
            finish_reason: toolCallsAccumulator.length > 0 ? 'tool_calls' : 'stop'
        }],
        model: lastMessage?.model,
        thinking: thinkingContent || undefined
    };
}

// ==========================================
// Server Detection
// ==========================================

/**
 * Check if LM Studio server is running
 * @param {string} [endpoint] - Custom endpoint to check
 * @returns {Promise<{available: boolean, error?: string}>}
 */
async function detectServer(endpoint = LMSTUDIO_DEFAULT_ENDPOINT) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${endpoint}/models`, {
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            return { available: true };
        }
        return { available: false, error: `Server returned ${response.status}` };
    } catch (err) {
        if (err.name === 'AbortError') {
            return { available: false, error: 'Connection timeout' };
        }
        return { available: false, error: err.message };
    }
}

/**
 * Check if server is available (simple boolean)
 * @param {string} [endpoint] - Custom endpoint to check
 * @returns {Promise<boolean>}
 */
async function isAvailable(endpoint = LMSTUDIO_DEFAULT_ENDPOINT) {
    const result = await detectServer(endpoint);
    return result.available;
}

/**
 * List available models from LM Studio
 * @param {string} [endpoint] - Custom endpoint
 * @returns {Promise<Array>} List of models
 */
async function listModels(endpoint = LMSTUDIO_DEFAULT_ENDPOINT) {
    const response = await fetch(`${endpoint}/models`);

    if (!response.ok) {
        throw new Error(`Failed to list models: ${response.status}`);
    }

    const data = await response.json();
    return data.data || [];
}

// ==========================================
// Public API
// ==========================================

// ES Module export
export const LMStudioProvider = {
    // Core API
    call,

    // Server detection
    detectServer,
    isAvailable,
    listModels,

    // Constants
    TIMEOUT_MS: LMSTUDIO_TIMEOUT_MS,
    DEFAULT_ENDPOINT: LMSTUDIO_DEFAULT_ENDPOINT,

    // Provider info
    name: 'lmstudio',
    displayName: 'LM Studio',
    type: 'local'
};

// Keep window global for backwards compatibility
if (typeof window !== 'undefined') {
    window.LMStudioProvider = LMStudioProvider;
}

console.log('[LMStudioProvider] Provider loaded');

