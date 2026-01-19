/**
 * Gemini Provider (Google AI Studio)
 *
 * Handles API calls to Google AI Studio for cloud-based LLM inference.
 * Uses the OpenAI-compatible endpoint for seamless integration.
 *
 * @module providers/gemini
 */

// ==========================================
// Configuration
// ==========================================

const GEMINI_TIMEOUT_MS = 60000;  // 60 seconds
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
    'gemini-1.5-pro-exp': { name: 'Gemini 1.5 Pro Experimental', free: false, context: 2000000 }
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
    if (!apiKey) {
        throw new Error('Google AI Studio API key required. Set in Settings.');
    }

    const body = {
        model: config.model || 'gemini-2.5-flash',
        messages,
        max_tokens: config.maxTokens || 8192,
        temperature: config.temperature ?? 0.7
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

    const timeout = config.timeout || GEMINI_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const apiUrl = config.apiUrl || `${GEMINI_API_BASE}/chat/completions`;

        const response = await fetch(`${apiUrl}?key=${apiKey}`, {
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
            console.error('[Gemini] API error:', response.status, errorText);

            // Parse error for better messages
            let errorMessage = `API error: ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.error?.message) {
                    errorMessage = errorJson.error.message;
                }
            } catch {
                // Keep generic error
            }

            throw new Error(errorMessage);
        }

        return response.json();
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new Error(`Gemini request timed out after ${timeout / 1000} seconds`);
        }
        throw err;
    }
}

// ==========================================
// Streaming (Future Enhancement)
// ==========================================

/**
 * Make a streaming API call to Gemini
 * @param {string} apiKey - Google AI Studio API key
 * @param {object} config - Provider config
 * @param {Array} messages - Chat messages
 * @param {function} onToken - Token callback
 * @returns {Promise<object>} Final response
 */
async function callStreaming(apiKey, config, messages, onToken) {
    // TODO: Implement SSE streaming for Gemini
    // For now, fall back to non-streaming
    console.warn('[Gemini] Streaming not yet implemented, using non-streaming');
    return call(apiKey, config, messages, null, null);
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

        const response = await fetch(`${GEMINI_API_BASE}/models?key=${apiKey}`, {
            signal: controller.signal
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

    try {
        const response = await fetch(`${GEMINI_API_BASE}/models?key=${apiKey}`, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to list models: ${response.status}`);
        }

        const data = await response.json();
        return data.data || [];
    } catch (error) {
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
        ...info
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
    description: 'Google AI models with native function calling. Gemini 2.0 Flash is free!'
};

// Keep window global for backwards compatibility
if (typeof window !== 'undefined') {
    window.GeminiProvider = GeminiProvider;
}

console.log('[GeminiProvider] Provider loaded with OpenAI-compatible endpoint');
