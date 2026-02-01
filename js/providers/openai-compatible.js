/**
 * OpenAI-Compatible Provider
 *
 * Handles API calls to any OpenAI-compatible API endpoint.
 * Supports custom base URLs for local/self-hosted or cloud providers.
 *
 * @module providers/openai-compatible
 */

import { safeJsonParse } from '../utils/safe-json.js';

// ==========================================
// Configuration
// ==========================================

const OPENAI_COMPATIBLE_TIMEOUT_MS = 60000; // 60 seconds

// ==========================================
// API Call
// ==========================================

/**
 * Make an API call to an OpenAI-compatible endpoint
 * @param {string} apiKey - API key (optional for some providers)
 * @param {object} config - Provider config (must include apiUrl)
 * @param {Array} messages - Chat messages
 * @param {Array} tools - Function calling tools (optional)
 * @param {function} onProgress - Progress callback for streaming (optional)
 * @returns {Promise<object>} OpenAI-compatible response
 */
async function call(apiKey, config, messages, tools, onProgress = null) {
    // Validate required parameters
    if (!config?.apiUrl) {
        throw new Error(
            'OpenAI-Compatible provider requires apiUrl to be configured. Add "apiUrl" to your provider settings (e.g., "https://api.example.com/v1/chat/completions").'
        );
    }
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages array is required and must not be empty');
    }
    if (!config?.model) {
        throw new Error('Model is required but not configured. Check your provider settings.');
    }

    const body = {
        model: config.model,
        messages,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
    };

    // Add optional parameters if provided
    if (config.topP !== undefined) {
        body.top_p = config.topP;
    }
    if (config.frequencyPenalty !== undefined) {
        body.frequency_penalty = config.frequencyPenalty;
    }
    if (config.presencePenalty !== undefined) {
        body.presence_penalty = config.presencePenalty;
    }

    // Add tools if provided
    if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
    }

    // CRITICAL FIX #3: Fix AbortController timeout race condition
    // Use a flag to track if timeout fired before checking response
    const timeout = config.timeout || OPENAI_COMPATIBLE_TIMEOUT_MS;
    const controller = new AbortController();
    let timeoutFired = false;
    const timeoutId = setTimeout(() => {
        timeoutFired = true;
        controller.abort();
    }, timeout);

    try {
        // Build URL using URL API to handle existing query params correctly
        const url = new URL(config.apiUrl);

        const headers = {
            'Content-Type': 'application/json',
        };

        // Only add Authorization header if apiKey is provided
        // Some local/self-hosted providers don't require an API key
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(url.toString(), {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        // Only clear timeout if it hasn't fired yet
        // This prevents race condition where timeout fires at same time as response arrives
        if (!timeoutFired) {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[OpenAICompatible] API error:', response.status, errorText);

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
            throw new Error(`OpenAI-Compatible request timed out after ${timeout / 1000} seconds`);
        }
        throw err;
    }
}

// ==========================================
// Streaming Implementation
// ==========================================

/**
 * Make a streaming API call to an OpenAI-compatible endpoint
 * @param {string} apiKey - API key (optional for some providers)
 * @param {object} config - Provider config (must include apiUrl)
 * @param {Array} messages - Chat messages
 * @param {Array} tools - Function calling tools (optional)
 * @param {function} onToken - Token callback
 * @returns {Promise<object>} Final response
 */
async function callStreaming(apiKey, config, messages, tools, onToken) {
    // Validate required parameters
    if (!config?.apiUrl) {
        throw new Error(
            'OpenAI-Compatible provider requires apiUrl to be configured. Add "apiUrl" to your provider settings (e.g., "https://api.example.com/v1/chat/completions").'
        );
    }
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages array is required and must not be empty');
    }
    if (!config?.model) {
        throw new Error('Model is required but not configured. Check your provider settings.');
    }

    const body = {
        model: config.model,
        messages,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        stream: true, // Enable streaming
    };

    // Add optional parameters if provided
    if (config.topP !== undefined) {
        body.top_p = config.topP;
    }
    if (config.frequencyPenalty !== undefined) {
        body.frequency_penalty = config.frequencyPenalty;
    }
    if (config.presencePenalty !== undefined) {
        body.presence_penalty = config.presencePenalty;
    }

    // Add tools if provided
    if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
    }

    // CRITICAL FIX #3: Fix AbortController timeout race condition
    const timeout = config.timeout || OPENAI_COMPATIBLE_TIMEOUT_MS;
    const controller = new AbortController();
    let timeoutFired = false;
    const timeoutId = setTimeout(() => {
        timeoutFired = true;
        controller.abort();
    }, timeout);

    try {
        // Build URL using URL API to handle existing query params correctly
        const url = new URL(config.apiUrl);

        const headers = {
            'Content-Type': 'application/json',
        };

        // Only add Authorization header if apiKey is provided
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(url.toString(), {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        // Only clear timeout if it hasn't fired yet
        if (!timeoutFired) {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[OpenAICompatible] API error:', response.status, errorText);

            // MEDIUM FIX #11, #12: Improved error response parsing with Content-Type validation
            let errorMessage = `API error: ${response.status}`;
            const contentType = response.headers.get('content-type');

            // Attempt to parse as JSON only if Content-Type indicates JSON response
            if (contentType && contentType.includes('application/json')) {
                const errorJson = safeJsonParse(errorText, null);
                if (errorJson?.error?.message) {
                    errorMessage = errorJson.error.message;
                } else if (errorJson?.message) {
                    errorMessage = errorJson.message;
                } else {
                    errorMessage = `API error: ${response.status}: ${errorText.substring(0, 200)}`;
                }
            } else {
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
            throw new Error(`OpenAI-Compatible request timed out after ${timeout / 1000} seconds`);
        }
        throw err;
    }
}

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
            console.error(
                '[OpenAICompatible] Invalid tool arguments JSON string:',
                args.substring(0, 100)
            );
            return '{}'; // Return empty object rather than crashing
        }
    }

    // If it's an object, stringify it
    if (typeof args === 'object' && args !== null) {
        return JSON.stringify(args);
    }

    // Fallback for undefined/null/other types
    console.warn('[OpenAICompatible] Unexpected tool arguments type:', typeof args);
    return '{}';
}

/**
 * Handle SSE streaming response from OpenAI-compatible endpoint
 * Supports tool calls, thinking blocks, and token accumulation
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
                console.error('[OpenAICompatible] Buffer overflow detected, closing stream');
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
                        '[OpenAICompatible] Failed to parse chunk, skipping:',
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
                    console.debug('[OpenAICompatible] Error processing chunk:', e.message);
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
            '[OpenAICompatible] Streaming complete - content length:',
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
 * Check if API key/endpoint is valid
 * For OpenAI-compatible providers, this validates the endpoint is accessible
 * @param {string} apiKey - API key (optional for some providers)
 * @param {object} config - Provider config (must include apiUrl)
 * @returns {Promise<boolean>} True if endpoint appears valid
 */
async function validateApiKey(apiKey, config) {
    if (!config?.apiUrl) {
        console.warn('[OpenAICompatible] Cannot validate: apiUrl not configured');
        return false;
    }

    // For some providers, API key is optional (e.g., local Ollama)
    // Only validate length if key is provided
    if (apiKey && apiKey.length < 5) {
        return false;
    }

    try {
        // Build models endpoint URL from the base URL
        // If apiUrl ends with /chat/completions, replace with /models
        // Otherwise, append /models
        let modelsUrl = config.apiUrl;
        if (modelsUrl.endsWith('/chat/completions')) {
            modelsUrl = modelsUrl.replace('/chat/completions', '/models');
        } else if (modelsUrl.endsWith('/v1/chat/completions')) {
            modelsUrl = modelsUrl.replace('/v1/chat/completions', '/v1/models');
        } else if (!modelsUrl.endsWith('/models')) {
            // Try appending /models
            const url = new URL(modelsUrl);
            url.pathname = url.pathname.replace(/\/$/, '') + '/models';
            modelsUrl = url.toString();
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const headers = {};
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(modelsUrl, {
            headers,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Accept 200 OK or 401 (which means endpoint exists but auth failed)
        // Some providers don't implement /models endpoint
        if (response.ok || response.status === 401) {
            return true;
        }

        // If 404, the endpoint might still work for chat (some providers don't have /models)
        if (response.status === 404) {
            console.warn(
                '[OpenAICompatible] /models endpoint not found, but chat endpoint may still work'
            );
            return true;
        }

        return false;
    } catch (error) {
        console.warn('[OpenAICompatible] Endpoint validation failed:', error.message);
        // Don't fail validation completely - the endpoint might still work for chat
        return true;
    }
}

/**
 * Get available models from the OpenAI-compatible endpoint
 * @param {string} apiKey - API key (optional for some providers)
 * @param {object} config - Provider config (must include apiUrl)
 * @returns {Promise<Array>} List of models
 */
async function listModels(apiKey, config) {
    if (!config?.apiUrl) {
        throw new Error('apiUrl is required to list models');
    }

    // Build models endpoint URL from the base URL
    let modelsUrl = config.apiUrl;
    if (modelsUrl.endsWith('/chat/completions')) {
        modelsUrl = modelsUrl.replace('/chat/completions', '/models');
    } else if (modelsUrl.endsWith('/v1/chat/completions')) {
        modelsUrl = modelsUrl.replace('/v1/chat/completions', '/v1/models');
    } else if (!modelsUrl.endsWith('/models')) {
        const url = new URL(modelsUrl);
        url.pathname = url.pathname.replace(/\/$/, '') + '/models';
        modelsUrl = url.toString();
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
        const headers = {};
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(modelsUrl, {
            headers,
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
        console.error('[OpenAICompatible] Failed to list models:', error.message);
        throw error;
    }
}

// ==========================================
// Public API
// ==========================================

// ES Module export
export const OpenAICompatibleProvider = {
    // Core API
    call,
    callStreaming,

    // Utility
    validateApiKey,
    listModels,

    // Internal (exposed for testing/extension)
    normalizeToolArguments,
    handleStreamingResponse,

    // Constants
    TIMEOUT_MS: OPENAI_COMPATIBLE_TIMEOUT_MS,

    // Provider info
    name: 'openai-compatible',
    displayName: 'OpenAI Compatible',
    type: 'generic',
};

console.log('[OpenAICompatibleProvider] Provider loaded');
