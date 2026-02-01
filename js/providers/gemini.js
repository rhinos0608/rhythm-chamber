/**
 * Gemini Provider (Google AI Studio)
 *
 * Handles API calls to Google AI Studio for cloud-based LLM inference.
 * Uses the OpenAI-compatible endpoint for seamless integration.
 *
 * @module providers/gemini
 */

import { safeJsonParse } from '../utils/safe-json.js';

// ==========================================
// Configuration
// ==========================================

const GEMINI_TIMEOUT_MS = 60000; // 60 seconds
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';

// Supported Gemini models (free tier available)
const GEMINI_MODELS = {
    'gemini-2.5-flash': { name: 'Gemini 2.5 Flash', free: true, context: 1000000 },
    'gemini-2.5-flash-lite': { name: 'Gemini 2.5 Flash Lite', free: true, context: 1000000 },
    'gemini-2.5-pro': { name: 'Gemini 2.5 Pro', free: false, context: 1000000 },
    'gemini-2.0-flash': { name: 'Gemini 2.0 Flash', free: true, context: 1000000 },
    'gemini-2.0-flash-lite': { name: 'Gemini 2.0 Flash Lite', free: true, context: 1000000 },
    'gemini-2.0-flash-exp': { name: 'Gemini 2.0 Flash Experimental', free: true, context: 1000000 },
    'gemini-1.5-flash': { name: 'Gemini 1.5 Flash', free: true, context: 1000000 },
    'gemini-1.5-pro': { name: 'Gemini 1.5 Pro', free: false, context: 2000000 },
    'gemini-1.5-pro-exp': { name: 'Gemini 1.5 Pro Experimental', free: false, context: 2000000 },
};

// ==========================================
// API Call
// ==========================================

/**
 * Make an API call to Google AI Studio (OpenAI-compatible endpoint)
 * @param {string} apiKey - Google AI Studio API key
 * @param {object} config - Provider config
 * @param {Array} messages - Chat messages
 * @param {Array} tools - Function calling tools (optional)
 * @param {function} onProgress - Progress callback for streaming (optional) - NOT supported yet
 * @returns {Promise<object>} OpenAI-compatible response
 */
async function call(apiKey, config, messages, tools, onProgress = null) {
    // Validate required parameters
    if (!apiKey) {
        throw new Error('Google AI Studio API key required. Set in Settings.');
    }
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages array is required and must not be empty');
    }

    const body = {
        model: config.model || 'gemini-2.5-flash',
        messages,
        max_tokens: config.maxTokens || 8192,
        temperature: config.temperature ?? 0.7,
    };

    // Add optional parameters if provided
    if (config.topP !== undefined) {
        body.top_p = config.topP;
    }

    // Add tools if provided (function calling)
    if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
    }

    // CRITICAL FIX #3: Fix AbortController timeout race condition
    const timeout = config.timeout || GEMINI_TIMEOUT_MS;
    const controller = new AbortController();
    let timeoutFired = false;
    const timeoutId = setTimeout(() => {
        timeoutFired = true;
        controller.abort();
    }, timeout);

    try {
        // Build URL using URL API to handle existing query params correctly
        const baseUrl = config.apiUrl || `${GEMINI_API_BASE}/chat/completions`;
        const url = new URL(baseUrl);

        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
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
            console.error('[Gemini] API error:', response.status, errorText);

            // MEDIUM FIX #11, #12: Improved error response parsing with Content-Type validation
            // Distinguishes between JSON and plain text errors for better error messages
            let errorMessage = `API error: ${response.status}`;
            const contentType = response.headers.get('content-type');

            // Attempt to parse as JSON only if Content-Type indicates JSON response
            if (contentType && contentType.includes('application/json')) {
                const errorJson = safeJsonParse(errorText, null);
                if (errorJson?.error?.message) {
                    errorMessage = errorJson.error.message;
                } else if (errorJson?.message) {
                    // Some APIs use flat error structure with top-level message
                    errorMessage = errorJson.message;
                } else {
                    // JSON parsing failed or structure unexpected, show raw text
                    errorMessage = `API error: ${response.status}: ${errorText.substring(0, 200)}`;
                }
            } else {
                // Non-JSON response (HTML, plain text), show raw content
                const preview = errorText.substring(0, 150);
                errorMessage = `API error: ${response.status}${preview ? ': ' + preview : ''}`;
            }

            throw new Error(errorMessage);
        }

        return response.json();
    } catch (err) {
        // Clear timeout in error case too
        if (!timeoutFired) {
            clearTimeout(timeoutId);
        }

        // Check if this was a timeout
        if (timeoutFired || err.name === 'AbortError') {
            throw new Error(`Gemini request timed out after ${timeout / 1000} seconds`);
        }
        throw err;
    }
}

// ==========================================
// Streaming Implementation
// ==========================================

/**
 * Make a streaming API call to Gemini
 * @param {string} apiKey - Google AI Studio API key
 * @param {object} config - Provider config
 * @param {Array} messages - Chat messages
 * @param {Array} tools - Function calling tools (optional)
 * @param {function} onToken - Token callback
 * @returns {Promise<object>} Final response
 */
async function callStreaming(apiKey, config, messages, tools, onToken) {
    // Validate required parameters
    if (!apiKey) {
        throw new Error('Google AI Studio API key required. Set in Settings.');
    }
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages array is required and must not be empty');
    }

    const body = {
        model: config.model || 'gemini-2.5-flash',
        messages,
        max_tokens: config.maxTokens || 8192,
        temperature: config.temperature ?? 0.7,
        stream: true, // Enable streaming
    };

    // Add optional parameters if provided
    if (config.topP !== undefined) {
        body.top_p = config.topP;
    }

    // Add tools if provided (function calling)
    if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
    }

    // CRITICAL FIX #3: Fix AbortController timeout race condition
    const timeout = config.timeout || GEMINI_TIMEOUT_MS;
    const controller = new AbortController();
    let timeoutFired = false;
    const timeoutId = setTimeout(() => {
        timeoutFired = true;
        controller.abort();
    }, timeout);

    try {
        // Build URL using URL API to handle existing query params correctly
        const baseUrl = config.apiUrl || `${GEMINI_API_BASE}/chat/completions`;
        const url = new URL(baseUrl);

        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
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
            console.error('[Gemini] API error:', response.status, errorText);

            // MEDIUM FIX #11, #12: Improved error response parsing with Content-Type validation
            // Distinguishes between JSON and plain text errors for better error messages
            let errorMessage = `API error: ${response.status}`;
            const contentType = response.headers.get('content-type');

            // Attempt to parse as JSON only if Content-Type indicates JSON response
            if (contentType && contentType.includes('application/json')) {
                const errorJson = safeJsonParse(errorText, null);
                if (errorJson?.error?.message) {
                    errorMessage = errorJson.error.message;
                } else if (errorJson?.message) {
                    // Some APIs use flat error structure with top-level message
                    errorMessage = errorJson.message;
                } else {
                    // JSON parsing failed or structure unexpected, show raw text
                    errorMessage = `API error: ${response.status}: ${errorText.substring(0, 200)}`;
                }
            } else {
                // Non-JSON response (HTML, plain text), show raw content
                const preview = errorText.substring(0, 150);
                errorMessage = `API error: ${response.status}${preview ? ': ' + preview : ''}`;
            }

            throw new Error(errorMessage);
        }

        // Handle streaming response
        return await handleStreamingResponse(response, onToken);
    } catch (err) {
        // Clear timeout in error case too
        if (!timeoutFired) {
            clearTimeout(timeoutId);
        }

        // Check if this was a timeout
        if (timeoutFired || err.name === 'AbortError') {
            throw new Error(`Gemini request timed out after ${timeout / 1000} seconds`);
        }
        throw err;
    }
}

/**
 * Handle SSE streaming response from Gemini
 * Supports tool calls, thinking blocks, and token accumulation
 * @param {Response} response - Fetch response
 * @param {function} onProgress - Progress callback
 * @returns {Promise<object>} OpenAI-compatible response
 */
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
            console.error('[Gemini] Invalid tool arguments JSON string:', args.substring(0, 100));
            return '{}'; // Return empty object rather than crashing
        }
    }

    // If it's an object, stringify it
    if (typeof args === 'object' && args !== null) {
        return JSON.stringify(args);
    }

    // Fallback for undefined/null/other types
    console.warn('[Gemini] Unexpected tool arguments type:', typeof args);
    return '{}';
}

async function handleStreamingResponse(response, onProgress) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let fullContent = '';
    let thinkingContent = '';
    let inThinking = false;
    let lastMessage = null;
    let toolCallsAccumulator = [];
    const toolCallsById = {};
    let buffer = '';

    // MEDIUM FIX #18: Wrap stream processing in try-finally to ensure cleanup
    // If an error occurs mid-stream, reader.cancel() is called to release resources
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
                console.error('[Gemini] Buffer overflow detected, closing stream');
                reader.cancel();
                throw new Error('Stream buffer overflow - malformed response');
            }

            const lines = buffer.split('\n');

            // Keep last incomplete line in buffer
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine === '' || trimmedLine === '[DONE]') continue;

                // Handle SSE data: prefix
                let data = trimmedLine;
                if (trimmedLine.startsWith('data: ')) {
                    data = trimmedLine.slice(6);
                    if (data === '[DONE]') continue;
                }

                // Skip non-JSON lines
                if (!data.startsWith('{')) continue;

                // CRITICAL FIX #1: Use safeJsonParse to prevent crash on malformed JSON
                // If API returns malformed JSON due to network corruption or API bugs,
                // we skip the chunk instead of crashing the entire stream
                const parsed = safeJsonParse(data, null);
                if (!parsed) {
                    console.debug(
                        '[Gemini] Failed to parse chunk, skipping:',
                        data.substring(0, 100)
                    );
                    continue;
                }

                try {
                    // Handle both streaming delta format AND complete message format
                    const delta = parsed.choices?.[0]?.delta;
                    const message = parsed.choices?.[0]?.message;

                    // For complete (non-streaming) responses embedded in stream
                    if (message?.content && !delta) {
                        fullContent = message.content;
                        if (message.tool_calls) {
                            for (const tc of message.tool_calls) {
                                toolCallsById[
                                    tc.id || `call_${Object.keys(toolCallsById).length}`
                                ] = {
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

                        // MEDIUM FIX #17: Detect thinking blocks using proper tag boundary matching
                        // Use regex to match actual XML-like tags instead of substring search
                        // This prevents false positives when model outputs "extended_thinking" as normal text
                        const THINKING_START_TAG = '<extended_thinking>';
                        const THINKING_END_TAG = '</extended_thinking>';

                        // Check if token contains the start tag
                        if (token.includes(THINKING_START_TAG)) {
                            inThinking = true;
                            const parts = token.split(THINKING_START_TAG);
                            if (parts[0]) {
                                fullContent += parts[0];
                                if (onProgress) onProgress({ type: 'token', token: parts[0] });
                            }
                            // Check if end tag is in the same token
                            if (token.includes(THINKING_END_TAG)) {
                                const afterStart = parts[1] || '';
                                const endParts = afterStart.split(THINKING_END_TAG);
                                thinkingContent += endParts[0] || '';
                                inThinking = false;
                                if (onProgress)
                                    onProgress({ type: 'thinking', content: thinkingContent });
                                thinkingContent = '';
                                if (endParts[1]) {
                                    fullContent += endParts[1];
                                    if (onProgress)
                                        onProgress({ type: 'token', token: endParts[1] });
                                }
                            } else {
                                thinkingContent += parts[1] || '';
                            }
                            continue;
                        }

                        if (inThinking) {
                            thinkingContent += token;
                            // Check for end tag in thinking content
                            if (thinkingContent.includes(THINKING_END_TAG)) {
                                inThinking = false;
                                const parts = thinkingContent.split(THINKING_END_TAG);
                                thinkingContent = parts[0] || '';
                                if (onProgress)
                                    onProgress({ type: 'thinking', content: thinkingContent });
                                thinkingContent = '';
                                if (parts[1]) {
                                    fullContent += parts[1];
                                    if (onProgress) onProgress({ type: 'token', token: parts[1] });
                                }
                            }
                        } else {
                            fullContent += token;
                            if (onProgress) onProgress({ type: 'token', token });
                        }
                    }

                    // Track tool calls in streaming
                    if (delta?.tool_calls) {
                        if (onProgress)
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
                } catch (e) {
                    // Catch non-parsing errors in message processing logic
                    // Note: JSON parse errors are now handled by safeJsonParse above
                    console.debug('[Gemini] Error processing chunk:', e.message);
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
                // CRITICAL FIX #1: Use safeJsonParse for final buffer too
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
                // Note: safeJsonParse handles parse errors - no catch needed here
            }
        }

        // Finalize tool calls array
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
            '[Gemini] Streaming complete - content length:',
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
            usage: lastMessage?.usage,
        };
    } finally {
        // MEDIUM FIX #18: Ensure reader is closed even if an error occurs
        // This prevents resource leaks and hanging connections
        try {
            if (reader) {
                reader.releaseLock();
            }
        } catch (e) {
            // Reader may already be closed or stream may have ended
            // This is safe to ignore
        }
    }
}

// ==========================================
// Utility Functions
// ==========================================

/**
 * Check if API key is valid (does a lightweight check)
 * @param {string} apiKey - API key to validate
 * @returns {Promise<boolean>} True if key appears valid
 */
async function validateApiKey(apiKey) {
    if (!apiKey || apiKey.length < 10) {
        return false;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${GEMINI_API_BASE}/models`, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return response.ok;
    } catch (error) {
        console.warn('[Gemini] API key validation failed:', error.message);
        return false;
    }
}

/**
 * Get available models from Google AI Studio
 * @param {string} apiKey - API key
 * @returns {Promise<Array>} List of models
 */
async function listModels(apiKey) {
    if (!apiKey) {
        throw new Error('API key required');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout for model listing

    try {
        const url = new URL(`${GEMINI_API_BASE}/models`);

        const response = await fetch(url.toString(), {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
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
        if (error.name === 'AbortError') {
            throw new Error('Models request timed out after 10 seconds');
        }
        console.error('[Gemini] Failed to list models:', error.message);
        throw error;
    }
}

/**
 * Get model info for a specific model ID
 * @param {string} modelId - Model identifier
 * @returns {object|null} Model info or null if not found
 */
function getModelInfo(modelId) {
    return GEMINI_MODELS[modelId] || null;
}

/**
 * Get all available Gemini models
 * @returns {Array} List of available models with metadata
 */
function getAvailableModels() {
    return Object.entries(GEMINI_MODELS).map(([id, info]) => ({
        id,
        ...info,
    }));
}

/**
 * Get free tier models only
 * @returns {Array} List of free tier models
 */
function getFreeModels() {
    return getAvailableModels().filter(model => model.free);
}

// ==========================================
// Public API
// ==========================================

// ES Module export
export const GeminiProvider = {
    // Core API
    call,
    callStreaming,

    // Utility
    validateApiKey,
    listModels,
    getModelInfo,
    getAvailableModels,
    getFreeModels,

    // Constants
    TIMEOUT_MS: GEMINI_TIMEOUT_MS,
    API_BASE: GEMINI_API_BASE,
    MODELS: GEMINI_MODELS,

    // Provider info
    name: 'gemini',
    displayName: 'Gemini (Google AI Studio)',
    type: 'cloud',
    description: 'Google AI models with native function calling. Gemini 2.0 Flash is free!',
};

console.log('[GeminiProvider] Provider loaded with OpenAI-compatible endpoint');
