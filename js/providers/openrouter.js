/**
 * OpenRouter Provider
 *
 * Handles API calls to OpenRouter for cloud-based LLM inference.
 *
 * @module providers/openrouter
 */

import { safeJsonParse } from '../utils/safe-json.js';

// ==========================================
// Configuration
// ==========================================

const OPENROUTER_TIMEOUT_MS = 60000;  // 60 seconds

// ==========================================
// API Call
// ==========================================

/**
 * Make an API call to OpenRouter
 * @param {string} apiKey - OpenRouter API key
 * @param {object} config - Provider config
 * @param {Array} messages - Chat messages
 * @param {Array} tools - Function calling tools (optional)
 * @param {function} onProgress - Progress callback for streaming (optional) - NOT supported yet
 * @returns {Promise<object>} OpenAI-compatible response
 */
async function call(apiKey, config, messages, tools, onProgress = null) {
    // Validate required parameters
    if (!apiKey) {
        throw new Error('OpenRouter API key required. Set in Settings or config.js');
    }
    if (!config?.model) {
        throw new Error('OpenRouter model is required but not configured. Check your settings.');
    }
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages array is required and must not be empty');
    }

    const body = {
        model: config.model,
        messages,
        max_tokens: config.maxTokens,
        temperature: config.temperature
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

    const timeout = config.timeout || OPENROUTER_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const apiUrl = config.apiUrl || 'https://openrouter.ai/api/v1/chat/completions';

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': config.app?.url || window.location.origin,
                'X-Title': config.app?.name || 'Rhythm Chamber'
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[OpenRouter] API error:', response.status, errorText);

            // Parse error for better messages
            let errorMessage = `API error: ${response.status}`;
            const errorJson = safeJsonParse(errorText, null);
            if (errorJson?.error?.message) {
                errorMessage = errorJson.error.message;
            }

            throw new Error(errorMessage);
        }

        return response.json();
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new Error(`OpenRouter request timed out after ${timeout / 1000} seconds`);
        }
        throw err;
    }
}

// ==========================================
// Streaming Implementation
// ==========================================

/**
 * Make a streaming API call to OpenRouter
 * @param {string} apiKey - OpenRouter API key
 * @param {object} config - Provider config
 * @param {Array} messages - Chat messages
 * @param {Array} tools - Function calling tools (optional)
 * @param {function} onToken - Token callback
 * @returns {Promise<object>} Final response
 */
async function callStreaming(apiKey, config, messages, tools, onToken) {
    // Validate required parameters
    if (!apiKey) {
        throw new Error('OpenRouter API key required. Set in Settings or config.js');
    }
    if (!config?.model) {
        throw new Error('OpenRouter model is required but not configured. Check your settings.');
    }
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages array is required and must not be empty');
    }

    const body = {
        model: config.model,
        messages,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        stream: true // Enable streaming
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

    const timeout = config.timeout || OPENROUTER_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const apiUrl = config.apiUrl || 'https://openrouter.ai/api/v1/chat/completions';

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': config.app?.url || window.location.origin,
                'X-Title': config.app?.name || 'Rhythm Chamber'
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[OpenRouter] API error:', response.status, errorText);

            // Parse error for better messages
            let errorMessage = `API error: ${response.status}`;
            const errorJson = safeJsonParse(errorText, null);
            if (errorJson?.error?.message) {
                errorMessage = errorJson.error.message;
            }

            throw new Error(errorMessage);
        }

        // Handle streaming response
        return await handleStreamingResponse(response, onToken);
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new Error(`OpenRouter request timed out after ${timeout / 1000} seconds`);
        }
        throw err;
    }
}

/**
 * Handle SSE streaming response from OpenRouter
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
    let toolCallsById = {};
    let buffer = '';

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

            // Handle SSE data: prefix
            let data = trimmedLine;
            if (trimmedLine.startsWith('data: ')) {
                data = trimmedLine.slice(6);
                if (data === '[DONE]') continue;
            }

            // Skip non-JSON lines
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

                    // Detect thinking blocks (extended thinking)
                    if (token.includes('extended_thinking')) {
                        inThinking = true;
                        const parts = token.split('extended_thinking');
                        if (parts[0]) {
                            fullContent += parts[0];
                            if (onProgress) onProgress({ type: 'token', token: parts[0] });
                        }
                        thinkingContent += parts[1] || '';
                        continue;
                    }

                    if (inThinking) {
                        thinkingContent += token;
                        // Check for end tag in thinking content
                        if (thinkingContent.includes('')) {
                            inThinking = false;
                            const parts = thinkingContent.split('');
                            thinkingContent = parts[0] || '';
                            if (onProgress) onProgress({ type: 'thinking', content: thinkingContent });
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
                    if (onProgress) onProgress({ type: 'tool_call', toolCalls: delta.tool_calls });
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
                    console.debug('[OpenRouter] Failed to parse chunk:', data.substring(0, 100));
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
                console.debug('[OpenRouter] Failed to parse final buffer');
            }
        }
    }

    // Finalize tool calls array
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

    console.log('[OpenRouter] Streaming complete - content length:', fullContent.length, 'tool_calls:', toolCallsAccumulator.length);

    return {
        choices: [{
            message: responseMessage,
            finish_reason: toolCallsAccumulator.length > 0 ? 'tool_calls' : 'stop'
        }],
        model: lastMessage?.model,
        thinking: thinkingContent || undefined,
        usage: lastMessage?.usage
    };
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
        // Do a minimal request to check the key
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        return response.ok;
    } catch (error) {
        console.warn('[OpenRouter] API key validation failed:', error.message);
        return false;
    }
}

/**
 * Get available models from OpenRouter
 * @param {string} apiKey - API key
 * @returns {Promise<Array>} List of models
 */
async function listModels(apiKey) {
    if (!apiKey) {
        throw new Error('API key required');
    }

    try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to list models: ${response.status}`);
        }

        const data = await response.json();
        return data.data || [];
    } catch (error) {
        console.error('[OpenRouter] Failed to list models:', error.message);
        throw error;
    }
}

// ==========================================
// Public API
// ==========================================

// ES Module export
export const OpenRouterProvider = {
    // Core API
    call,
    callStreaming,

    // Utility
    validateApiKey,
    listModels,

    // Constants
    TIMEOUT_MS: OPENROUTER_TIMEOUT_MS,

    // Provider info
    name: 'openrouter',
    displayName: 'OpenRouter',
    type: 'cloud'
};


console.log('[OpenRouterProvider] Provider loaded');

