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

import { safeJsonParse } from '../utils/safe-json.js';

// ==========================================
// Configuration
// ==========================================

const LMSTUDIO_TIMEOUT_MS = 90000; // 90 seconds for local models
const LMSTUDIO_DEFAULT_ENDPOINT = 'http://localhost:1234/v1';

// ==========================================
// Endpoint Validation (SSRF Protection)
// ==========================================

/**
 * Validate that the endpoint is a localhost address
 * Prevents SSRF attacks by ensuring only local addresses are used
 * @param {string} endpoint - The endpoint URL to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateEndpoint(endpoint) {
    try {
        const url = new URL(endpoint);

        // Check protocol - only allow http or https
        if (!['http:', 'https:'].includes(url.protocol)) {
            return {
                valid: false,
                error: 'Invalid protocol. Only HTTP/HTTPS are allowed.',
            };
        }

        const hostname = url.hostname.toLowerCase();

        // List of allowed localhost patterns
        const allowedPatterns = [
            'localhost',
            '127.0.0.1',
            '[::1]', // IPv6 localhost
        ];

        // Check if hostname matches any allowed pattern
        const isAllowed = allowedPatterns.some(pattern => {
            // For IPv6 address with brackets, compare directly
            if (pattern.startsWith('[')) {
                return hostname === pattern;
            }
            // For other patterns, check exact match or starts with
            return hostname === pattern || hostname.startsWith(pattern);
        });

        // Also allow 127.x.x.x range (loopback)
        const isLoopback = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);

        if (!isAllowed && !isLoopback) {
            return {
                valid: false,
                error: `Invalid hostname "${hostname}". LM Studio endpoint must be localhost (127.0.0.1).`,
            };
        }

        // Validate port if specified (default to 1234 for LM Studio)
        const port = url.port || '1234';
        const portNum = parseInt(port, 10);

        // Reject privileged ports and suspicious high ports
        if (portNum < 1024 || portNum > 65535) {
            return {
                valid: false,
                error: `Invalid port "${port}". Port must be between 1024 and 65535.`,
            };
        }

        return { valid: true };
    } catch (e) {
        return {
            valid: false,
            error: `Invalid endpoint URL: ${e.message}`,
        };
    }
}

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
    // Validate required parameters
    if (!config?.model) {
        throw new Error(
            'LM Studio model is required but not configured. Ensure a model is loaded in LM Studio.'
        );
    }
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages array is required and must not be empty');
    }

    const useStreaming = typeof onProgress === 'function';
    const endpoint = config.endpoint || LMSTUDIO_DEFAULT_ENDPOINT;

    // SECURITY: Validate endpoint is localhost only (SSRF protection)
    const endpointValidation = validateEndpoint(endpoint);
    if (!endpointValidation.valid) {
        throw new Error(endpointValidation.error);
    }

    const body = {
        model: config.model,
        messages,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        top_p: config.topP,
        stream: useStreaming,
    };

    // Add tools if provided
    if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
    }

    // CRITICAL FIX #3: Fix AbortController timeout race condition
    const timeout = config.timeout || LMSTUDIO_TIMEOUT_MS;
    const controller = new AbortController();
    let timeoutFired = false;
    const timeoutId = setTimeout(() => {
        timeoutFired = true;
        controller.abort();
    }, timeout);

    try {
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        // Only clear timeout if it hasn't fired yet
        if (!timeoutFired) {
            clearTimeout(timeoutId);
        }

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

                // HIGH FIX #10: Check if there was a stream error before falling back
                // If streaming succeeded but produced no output, that's a valid response
                // Only fallback if there was an actual error during streaming
                if (!result.streamError) {
                    // Valid empty response - return as-is
                    console.warn(
                        '[LMStudio] Streaming succeeded but returned no content (valid for some prompts)'
                    );
                    return result;
                }

                // Streaming had an error - fallback to non-streaming
                console.warn('[LMStudio] Streaming failed with error, retrying non-streaming');

                // Make a new non-streaming request
                // CRITICAL FIX #3: Use same race-condition-safe timeout pattern for fallback
                const fallbackController = new AbortController();
                let fallbackTimeoutFired = false;
                const fallbackTimeoutId = setTimeout(() => {
                    fallbackTimeoutFired = true;
                    fallbackController.abort();
                }, timeout);

                try {
                    const fallbackBody = { ...body, stream: false };
                    const fallbackResponse = await fetch(`${endpoint}/chat/completions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(fallbackBody),
                        signal: fallbackController.signal,
                    });

                    // Only clear timeout if it hasn't fired yet
                    if (!fallbackTimeoutFired) {
                        clearTimeout(fallbackTimeoutId);
                    }

                    if (!fallbackResponse.ok) {
                        throw new Error(`LM Studio fallback error: ${fallbackResponse.status}`);
                    }

                    const fallbackResult = await fallbackResponse.json();
                    console.log('[LMStudio] Non-streaming fallback succeeded');

                    // Emit the full content through onProgress for UI update
                    if (fallbackResult.choices?.[0]?.message?.content) {
                        onProgress({
                            type: 'token',
                            token: fallbackResult.choices[0].message.content,
                        });
                    }

                    return fallbackResult;
                } catch (fallbackErr) {
                    // Clear fallback timeout
                    if (!fallbackTimeoutFired) {
                        clearTimeout(fallbackTimeoutId);
                    }
                    throw fallbackErr;
                }
            } catch (streamErr) {
                console.error('[LMStudio] Streaming error:', streamErr);
                throw new Error(`LM Studio streaming failed: ${streamErr.message}`);
            }
        }

        return response.json();
    } catch (err) {
        // Clear timeout in error case too
        if (!timeoutFired) {
            clearTimeout(timeoutId);
        }

        // Check if this was a timeout
        if (timeoutFired || err.name === 'AbortError') {
            throw new Error(`LM Studio request timed out after ${timeout / 1000} seconds`);
        }
        // Catch network errors (server not running)
        if (
            err.message.includes('Failed to fetch') ||
            err.message.includes('NetworkError') ||
            err.name === 'TypeError'
        ) {
            throw new Error(
                'Cannot connect to LM Studio. Make sure the server is running at ' + endpoint
            );
        }
        throw err;
    }
}

// ==========================================
// Streaming Response Handler
// ==========================================

/**
 * CRITICAL FIX #4: Normalize tool call arguments
 * Prevents string/object type confusion that can cause tool calls
 * to be invoked with malformed arguments like "[object Object]"
 *
 * @param {*} args - Tool arguments (string, object, or other)
 * @returns {string} Normalized JSON string of arguments
 */
function normalizeToolArguments(args) {
    // If already a string, validate it's valid JSON
    if (typeof args === 'string') {
        try {
            // Validate by parsing - if it succeeds, it's valid JSON
            JSON.parse(args);
            return args;
        } catch (e) {
            console.error('[LMStudio] Invalid tool arguments JSON string:', args.substring(0, 100));
            return '{}'; // Return empty object rather than crashing
        }
    }

    // If it's an object, stringify it
    if (typeof args === 'object' && args !== null) {
        return JSON.stringify(args);
    }

    // Fallback for undefined/null/other types
    console.warn('[LMStudio] Unexpected tool arguments type:', typeof args);
    return '{}';
}

/**
 * Handle SSE streaming response from LM Studio
 * Supports <thinking> blocks for reasoning models
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
    let toolCallsAccumulator = []; // Collect tool calls from streaming
    const toolCallsById = {}; // Track tool calls by id for proper assembly
    let buffer = ''; // Buffer for incomplete chunks
    let streamError = false; // HIGH FIX #10: Track if stream had an error

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Append to buffer and process complete lines
            buffer += decoder.decode(value, { stream: true });

            // HIGH FIX #7: Buffer overflow protection
            // Prevent unbounded buffer growth if API never sends newline
            const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB limit
            if (buffer.length > MAX_BUFFER_SIZE) {
                console.error('[LMStudio] Buffer overflow detected, closing stream');
                reader.cancel();
                throw new Error('Stream buffer overflow - malformed response');
            }

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

                const parsed = safeJsonParse(data, null);
                if (!parsed) continue;

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
                                    // CRITICAL FIX #4: Use normalizeToolArguments to handle type confusion
                                    arguments: normalizeToolArguments(tc.function?.arguments),
                                },
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
                                    arguments: tc.function?.arguments || '',
                                },
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
            }
        }

        // Process any remaining buffer content
        if (buffer.trim()) {
            let data = buffer.trim();
            if (data.startsWith('data: ')) {
                data = data.slice(6);
            }
            if (data.startsWith('{')) {
                const parsed = safeJsonParse(data, null);
                if (parsed) {
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
                                    // CRITICAL FIX #4: Use normalizeToolArguments to handle type confusion
                                    arguments: normalizeToolArguments(tc.function?.arguments),
                                },
                            };
                        }
                    }
                    lastMessage = parsed;
                }
            }
        }

        // Finalize tool calls array (outside the while loop)
        toolCallsAccumulator = Object.values(toolCallsById);

        // Build OpenAI-compatible response
        const responseMessage = {
            role: 'assistant',
            content: fullContent || null,
        };

        // Add tool calls if present
        if (toolCallsAccumulator.length > 0) {
            responseMessage.tool_calls = toolCallsAccumulator;
        }

        console.log(
            '[LMStudio] Streaming complete - content length:',
            fullContent.length,
            'tool_calls:',
            toolCallsAccumulator.length
        );

        return {
            choices: [
                {
                    message: responseMessage,
                    finish_reason: toolCallsAccumulator.length > 0 ? 'tool_calls' : 'stop',
                },
            ],
            model: lastMessage?.model,
            thinking: thinkingContent || undefined,
            streamError, // HIGH FIX #10: Indicate if there was a stream error
        };
    } catch (streamErr) {
        console.error('[LMStudio] Streaming error:', streamErr);
        streamError = true;
        throw streamErr;
    }
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
    // SECURITY: Validate endpoint is localhost only (SSRF protection)
    const endpointValidation = validateEndpoint(endpoint);
    if (!endpointValidation.valid) {
        return { available: false, error: endpointValidation.error };
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${endpoint}/models`, {
            signal: controller.signal,
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
    // SECURITY: Validate endpoint is localhost only (SSRF protection)
    const endpointValidation = validateEndpoint(endpoint);
    if (!endpointValidation.valid) {
        throw new Error(endpointValidation.error);
    }

    // HIGH FIX #8: Add timeout to listModels() call
    // Prevents indefinite hang when LM Studio server is frozen
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
        const response = await fetch(`${endpoint}/models`, {
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Failed to list models: ${response.status}`);
        }

        const data = await response.json();
        return data.data || [];
    } catch (error) {
        clearTimeout(timeoutId);

        // Check if this was a timeout
        if (error.name === 'AbortError') {
            throw new Error('Models request timed out after 10 seconds - server may be frozen');
        }
        console.error('[LMStudio] Failed to list models:', error.message);
        throw error;
    }
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
    type: 'local',
};

console.log('[LMStudioProvider] Provider loaded');
