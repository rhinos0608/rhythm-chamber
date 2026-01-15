/**
 * Ollama Integration Module for Rhythm Chamber
 * 
 * Provides local LLM support via Ollama.
 * This is the differentiating feature - zero data sent to cloud.
 * 
 * Default endpoint: http://localhost:11434
 * 
 * API Reference: https://github.com/ollama/ollama/blob/main/docs/api.md
 * 
 * BRING YOUR OWN AI: Users run AI models on their own hardware for maximum privacy.
 */

// ==========================================
// Configuration
// ==========================================

const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';
const CONNECTION_TIMEOUT_MS = 5000;
const GENERATION_TIMEOUT_MS = 120000; // 2 minutes for generation

// Models recommended for music analysis
// These have good instruction following and context understanding
const RECOMMENDED_MODELS = [
    { id: 'llama3.2', name: 'Llama 3.2 (8B)', recommended: true, notes: 'Best balance of speed and quality' },
    { id: 'llama3.2:1b', name: 'Llama 3.2 (1B)', recommended: false, notes: 'Fast, lower quality' },
    { id: 'mistral', name: 'Mistral (7B)', recommended: true, notes: 'Good for creative responses' },
    { id: 'deepseek-r1:8b', name: 'DeepSeek R1 (8B)', recommended: true, notes: 'Strong reasoning' },
    { id: 'qwen2.5:7b', name: 'Qwen 2.5 (7B)', recommended: true, notes: 'Good multilingual support' },
    { id: 'phi3', name: 'Phi-3 (3.8B)', recommended: false, notes: 'Microsoft, fast inference' },
    { id: 'gemma2:9b', name: 'Gemma 2 (9B)', recommended: true, notes: 'Google, good quality' }
];

// Models known to support function/tool calling
// Updated 2026-01 with expanded Ollama tool support
const TOOL_CAPABLE_MODELS = [
    // Llama family
    'llama3.2', 'llama3.1', 'llama3.3',
    // Mistral family
    'mistral', 'mistral-nemo', 'mixtral',
    // Qwen family
    'qwen2.5', 'qwen2.5-coder', 'qwen2',
    // DeepSeek family
    'deepseek-r1', 'deepseek-coder', 'deepseek-v2', 'deepseek',
    // Cohere Command
    'command-r', 'command-r-plus',
    // Granite
    'granite3-dense', 'granite3.1-dense',
    // Hermes (fine-tuned for function calling)
    'hermes3', 'nous-hermes', 'hermes',
    // NVIDIA Nemotron
    'nemotron',
    // Functionary (specialized for function calling)
    'functionary'
];

// ==========================================
// Helper Functions
// ==========================================

/**
 * Get the configured Ollama endpoint
 * @returns {string} Ollama API endpoint URL
 */
function getEndpoint() {
    try {
        const settings = window.Settings?.getSettings() || {};
        return settings.ollama?.endpoint || DEFAULT_OLLAMA_ENDPOINT;
    } catch {
        return DEFAULT_OLLAMA_ENDPOINT;
    }
}

/**
 * Make a request to the Ollama API with timeout
 * @param {string} path - API path (e.g., '/api/tags')
 * @param {object} options - Fetch options
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Response>}
 */
async function ollamaFetch(path, options = {}, timeout = CONNECTION_TIMEOUT_MS) {
    const endpoint = getEndpoint();
    const url = `${endpoint}${path}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Ollama request timed out after ${timeout}ms`);
        }
        throw error;
    }
}

// ==========================================
// Server Detection
// ==========================================

/**
 * Check if Ollama server is running and accessible
 * @returns {Promise<{available: boolean, version?: string, error?: string}>}
 */
async function detectServer() {
    try {
        const response = await ollamaFetch('/api/version', {}, CONNECTION_TIMEOUT_MS);

        if (!response.ok) {
            return {
                available: false,
                error: `Server returned ${response.status}`
            };
        }

        const data = await response.json();
        return {
            available: true,
            version: data.version || 'unknown'
        };
    } catch (error) {
        // Distinguish between connection refused vs timeout
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            return {
                available: false,
                error: 'Ollama not running. Start with: ollama serve'
            };
        }
        return {
            available: false,
            error: error.message
        };
    }
}

/**
 * Check if server is available (simple boolean check)
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
    const result = await detectServer();
    return result.available;
}

// ==========================================
// Model Management
// ==========================================

/**
 * List all models available on the Ollama server
 * @returns {Promise<Array<{name: string, size: number, modified: string, details: object}>>}
 */
async function listModels() {
    try {
        const response = await ollamaFetch('/api/tags');

        if (!response.ok) {
            throw new Error(`Failed to list models: ${response.status}`);
        }

        const data = await response.json();
        return (data.models || []).map(model => ({
            id: model.name,
            name: model.name,
            size: model.size,
            sizeGB: (model.size / (1024 * 1024 * 1024)).toFixed(1),
            modified: model.modified_at,
            details: model.details || {},
            family: model.details?.family || 'unknown',
            parameterSize: model.details?.parameter_size || 'unknown'
        }));
    } catch (error) {
        console.error('[Ollama] Failed to list models:', error);
        throw error;
    }
}

/**
 * Get recommended models that are installed
 * @returns {Promise<Array>} Installed models with recommendations
 */
async function getRecommendedModels() {
    const installed = await listModels();
    const installedIds = installed.map(m => m.id.split(':')[0]); // Base model name

    return RECOMMENDED_MODELS.map(rec => ({
        ...rec,
        installed: installedIds.some(id => id.includes(rec.id.split(':')[0]))
    }));
}

/**
 * Check if a model supports function/tool calling
 * @param {string} modelName - Model name
 * @returns {boolean}
 */
function supportsToolCalling(modelName) {
    const baseName = modelName.split(':')[0].toLowerCase();
    return TOOL_CAPABLE_MODELS.some(m => baseName.includes(m));
}

/**
 * Pull a model from Ollama registry
 * @param {string} modelName - Model to pull
 * @param {function} onProgress - Progress callback
 * @returns {Promise<void>}
 */
async function pullModel(modelName, onProgress = () => { }) {
    const response = await ollamaFetch('/api/pull', {
        method: 'POST',
        body: JSON.stringify({ name: modelName, stream: true })
    }, GENERATION_TIMEOUT_MS * 5); // 10 minutes for large models

    if (!response.ok) {
        throw new Error(`Failed to pull model: ${response.status}`);
    }

    // Handle streaming progress
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split('\n').filter(Boolean);
        for (const line of lines) {
            try {
                const data = JSON.parse(line);
                if (data.completed && data.total) {
                    onProgress({
                        status: data.status,
                        completed: data.completed,
                        total: data.total,
                        percent: Math.round((data.completed / data.total) * 100)
                    });
                } else if (data.status) {
                    onProgress({ status: data.status });
                }
            } catch { /* Ignore parse errors */ }
        }
    }
}

// ==========================================
// Chat/Generation
// ==========================================

/**
 * Preprocess messages for Ollama API
 * Ollama expects tool_calls arguments as objects, not strings
 * @param {Array} messages - Chat messages
 * @returns {Array} Preprocessed messages
 */
function preprocessMessages(messages) {
    return messages.map(msg => {
        // Handle tool_calls in assistant messages
        if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
            return {
                ...msg,
                tool_calls: msg.tool_calls.map(tc => ({
                    ...tc,
                    function: {
                        name: tc.function.name,
                        // Convert string arguments back to object if needed
                        arguments: typeof tc.function.arguments === 'string'
                            ? JSON.parse(tc.function.arguments)
                            : tc.function.arguments
                    }
                }))
            };
        }
        return msg;
    });
}

/**
 * Generate a chat completion using Ollama
 * @param {Array} messages - Chat messages [{role, content}]
 * @param {string} model - Model name
 * @param {object} options - Generation options
 * @returns {Promise<{content: string, model: string, done: boolean}>}
 */
async function chat(messages, model, options = {}) {
    const {
        temperature = 0.7,
        topP = 0.9,
        maxTokens = 2000,
        stream = false,
        onToken = null,
        tools = null // Function calling tools
    } = options;

    const requestBody = {
        model,
        messages: preprocessMessages(messages),
        stream,
        options: {
            temperature,
            top_p: topP,
            num_predict: maxTokens
        }
    };

    // Add tools if provided and model supports them
    if (tools && supportsToolCalling(model)) {
        requestBody.tools = tools;
    }

    const response = await ollamaFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify(requestBody)
    }, GENERATION_TIMEOUT_MS);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama chat failed: ${response.status} - ${errorText}`);
    }

    if (stream && onToken) {
        const result = await handleStreamingResponse(response, onToken);

        // Check if streaming returned empty content - fallback to non-streaming
        if (!result.content && !result.toolCalls) {
            console.warn('[Ollama] Streaming returned empty response, retrying non-streaming');

            // Make a new non-streaming request
            const fallbackRequestBody = { ...requestBody, stream: false };
            const fallbackResponse = await ollamaFetch('/api/chat', {
                method: 'POST',
                body: JSON.stringify(fallbackRequestBody)
            }, GENERATION_TIMEOUT_MS);

            if (!fallbackResponse.ok) {
                throw new Error(`Ollama fallback failed: ${fallbackResponse.status}`);
            }

            const fallbackData = await fallbackResponse.json();
            console.log('[Ollama] Non-streaming fallback succeeded');

            // Send full content through onToken for UI update
            if (fallbackData.message?.content) {
                onToken(fallbackData.message.content);
            }

            return {
                content: fallbackData.message?.content || '',
                model: fallbackData.model,
                done: fallbackData.done,
                toolCalls: fallbackData.message?.tool_calls || null
            };
        }

        return result;
    }

    const data = await response.json();
    return {
        content: data.message?.content || '',
        model: data.model,
        done: data.done,
        toolCalls: data.message?.tool_calls || null,
        // Performance metrics
        evalCount: data.eval_count,
        evalDuration: data.eval_duration,
        tokensPerSecond: data.eval_count && data.eval_duration
            ? (data.eval_count / (data.eval_duration / 1e9)).toFixed(1)
            : null
    };
}

/**
 * Handle streaming response from Ollama
 * @param {Response} response - Fetch response
 * @param {function} onToken - Token callback
 * @returns {Promise<object>} Final response
 */
async function handleStreamingResponse(response, onToken) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let fullContent = '';
    let lastData = null;
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
            if (!trimmedLine) continue;

            try {
                const data = JSON.parse(trimmedLine);
                if (data.message?.content) {
                    fullContent += data.message.content;
                    onToken(data.message.content);
                }
                lastData = data;
            } catch {
                // Ignore parse errors for non-JSON lines
            }
        }
    }

    // Process any remaining buffer content
    if (buffer.trim()) {
        try {
            const data = JSON.parse(buffer.trim());
            if (data.message?.content) {
                fullContent += data.message.content;
                onToken(data.message.content);
            }
            lastData = data;
        } catch {
            // Ignore
        }
    }

    console.log('[Ollama] Streaming complete - content length:', fullContent.length);

    return {
        content: fullContent,
        model: lastData?.model,
        done: true,
        toolCalls: lastData?.message?.tool_calls || null
    };
}

/**
 * Simple completion (non-chat) generation
 * @param {string} prompt - Text prompt
 * @param {string} model - Model name
 * @param {object} options - Generation options
 * @returns {Promise<string>} Generated text
 */
async function generate(prompt, model, options = {}) {
    const {
        temperature = 0.7,
        topP = 0.9,
        maxTokens = 2000,
        stream = false,
        onToken = null
    } = options;

    const response = await ollamaFetch('/api/generate', {
        method: 'POST',
        body: JSON.stringify({
            model,
            prompt,
            stream,
            options: {
                temperature,
                top_p: topP,
                num_predict: maxTokens
            }
        })
    }, GENERATION_TIMEOUT_MS);

    if (!response.ok) {
        throw new Error(`Ollama generate failed: ${response.status}`);
    }

    if (stream && onToken) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const lines = decoder.decode(value).split('\n').filter(Boolean);
            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    if (data.response) {
                        fullResponse += data.response;
                        onToken(data.response);
                    }
                } catch { /* Ignore parse errors */ }
            }
        }
        return fullResponse;
    }

    const data = await response.json();
    return data.response || '';
}

// ==========================================
// Embeddings (for future RAG integration)
// ==========================================

/**
 * Generate embeddings using Ollama
 * @param {string|string[]} input - Text(s) to embed
 * @param {string} model - Embedding model (default: nomic-embed-text)
 * @returns {Promise<number[]|number[][]>} Embedding vector(s)
 */
async function embed(input, model = 'nomic-embed-text') {
    const inputs = Array.isArray(input) ? input : [input];
    const embeddings = [];

    for (const text of inputs) {
        const response = await ollamaFetch('/api/embeddings', {
            method: 'POST',
            body: JSON.stringify({ model, prompt: text })
        }, GENERATION_TIMEOUT_MS);

        if (!response.ok) {
            throw new Error(`Ollama embedding failed: ${response.status}`);
        }

        const data = await response.json();
        embeddings.push(data.embedding);
    }

    return Array.isArray(input) ? embeddings : embeddings[0];
}

// ==========================================
// Provider Integration Interface
// ==========================================

/**
 * Unified interface for chat.js integration
 * Matches the signature expected by the LLM provider abstraction
 * 
 * @param {Array} messages - Chat messages
 * @param {object} config - Full config including model, temperature, stream, onToken
 * @param {Array} tools - Function calling tools (optional)
 * @returns {Promise<object>} Response in OpenAI-compatible format
 */
async function chatCompletion(messages, config, tools = null) {
    const {
        model = 'llama3.2',
        temperature = 0.7,
        topP = 0.9,
        maxTokens = 2000,
        stream = false,
        onToken = null
    } = config;

    // For streaming, we need to handle thinking blocks
    let thinkingContent = '';
    let inThinking = false;
    let streamedContent = '';

    const wrappedOnToken = stream && onToken ? (token) => {
        // Detect thinking blocks (<think>...</think>)
        if (token.includes('<think>')) {
            inThinking = true;
            const parts = token.split('<think>');
            if (parts[0]) {
                streamedContent += parts[0];
                onToken(parts[0], false);
            }
            thinkingContent += parts[1] || '';
            return;
        }

        if (token.includes('</think>')) {
            inThinking = false;
            const parts = token.split('</think>');
            thinkingContent += parts[0] || '';
            // Emit thinking complete event
            onToken('[thinking]' + thinkingContent + '[/thinking]', true);
            thinkingContent = '';
            if (parts[1]) {
                streamedContent += parts[1];
                onToken(parts[1], false);
            }
            return;
        }

        if (inThinking) {
            thinkingContent += token;
        } else {
            streamedContent += token;
            onToken(token, false);
        }
    } : null;

    const response = await chat(messages, model, {
        temperature,
        topP,
        maxTokens,
        stream,
        onToken: wrappedOnToken,
        tools: tools && supportsToolCalling(model) ? tools : null
    });

    // Convert to OpenAI-compatible format for chat.js
    const result = {
        choices: [{
            message: {
                role: 'assistant',
                content: stream ? streamedContent : response.content
            },
            finish_reason: response.done ? 'stop' : 'length'
        }],
        model: response.model,
        usage: {
            completion_tokens: response.evalCount || 0
        }
    };

    // Include thinking content if captured
    if (thinkingContent) {
        result.thinking = thinkingContent;
    }

    // Add tool calls if present
    if (response.toolCalls) {
        result.choices[0].message.tool_calls = response.toolCalls.map((tc, i) => ({
            id: `call_${i}`,
            type: 'function',
            function: {
                name: tc.function.name,
                arguments: JSON.stringify(tc.function.arguments)
            }
        }));
    }

    return result;
}

// ==========================================
// Public API
// ==========================================

// ES Module export
export const Ollama = {
    // Server detection
    detectServer,
    isAvailable,
    getEndpoint,

    // Model management
    listModels,
    getRecommendedModels,
    supportsToolCalling,
    pullModel,

    // Generation
    chat,
    generate,
    chatCompletion, // OpenAI-compatible interface

    // Embeddings
    embed,

    // Constants
    DEFAULT_ENDPOINT: DEFAULT_OLLAMA_ENDPOINT,
    RECOMMENDED_MODELS,
    TOOL_CAPABLE_MODELS
};

// Keep window global for backwards compatibility
if (typeof window !== 'undefined') {
    window.Ollama = Ollama;
}

console.log('[Ollama] Module loaded');

