/**
 * LM Studio Provider
 * 
 * Handles API calls to LM Studio (OpenAI-compatible local server).
 * Supports streaming with thinking block detection.
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
            return await handleStreamingResponse(response, onProgress);
        }

        return response.json();
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new Error(`LM Studio request timed out after ${timeout / 1000} seconds`);
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

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta;

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
                    }

                    lastMessage = parsed;
                } catch (e) {
                    // Ignore parse errors for malformed chunks
                }
            }
        }
    }

    // Build OpenAI-compatible response
    return {
        choices: [{
            message: {
                role: 'assistant',
                content: fullContent
            },
            finish_reason: 'stop'
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

window.LMStudioProvider = {
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

console.log('[LMStudioProvider] Provider loaded');
