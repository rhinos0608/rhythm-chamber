/**
 * OpenRouter Provider
 * 
 * Handles API calls to OpenRouter for cloud-based LLM inference.
 * 
 * @module providers/openrouter
 */

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
    if (!apiKey) {
        throw new Error('OpenRouter API key required. Set in Settings or config.js');
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
            throw new Error(`OpenRouter request timed out after ${timeout / 1000} seconds`);
        }
        throw err;
    }
}

// ==========================================
// Streaming (Future Enhancement)
// ==========================================

/**
 * Make a streaming API call to OpenRouter
 * @param {string} apiKey - OpenRouter API key
 * @param {object} config - Provider config
 * @param {Array} messages - Chat messages
 * @param {function} onToken - Token callback
 * @returns {Promise<object>} Final response
 */
async function callStreaming(apiKey, config, messages, onToken) {
    // TODO: Implement SSE streaming for OpenRouter
    // For now, fall back to non-streaming
    console.warn('[OpenRouter] Streaming not yet implemented, using non-streaming');
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
    } catch {
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
}

// ==========================================
// Public API
// ==========================================

window.OpenRouterProvider = {
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
