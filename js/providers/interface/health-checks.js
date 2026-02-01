/**
 * Provider Health Checks
 *
 * Health check functions for all LLM providers.
 * Part of the refactored ProviderInterface module.
 *
 * @module providers/interface/health-checks
 */

import { Settings } from '../../settings.js';
import { ConfigLoader } from '../../services/config-loader.js';
import { HEALTH_CHECK_TIMEOUT } from './config.js';
import { safeJSONParse } from './errors.js';

/**
 * Check OpenRouter health and API key validity
 * @returns {Promise<ProviderHealthStatus>}
 */
export async function checkOpenRouterHealth() {
    const start = Date.now();
    const apiKey = Settings?.get?.()?.openrouter?.apiKey || ConfigLoader.get('openrouter.apiKey');

    if (!apiKey || apiKey === 'your-api-key-here') {
        return {
            available: false,
            status: 'no_key',
            reason: 'No API key configured',
            models: [],
            latencyMs: 0,
        };
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const latencyMs = Date.now() - start;

        if (response.status === 401 || response.status === 403) {
            return {
                available: false,
                status: 'invalid_key',
                reason: 'API key is invalid or expired',
                models: [],
                latencyMs,
            };
        }

        if (!response.ok) {
            return {
                available: false,
                status: 'error',
                reason: `API error: ${response.status}`,
                models: [],
                latencyMs,
            };
        }

        const data = await safeJSONParse(response, { data: [] });
        const models = data.data?.map(m => m.id) || [];

        return {
            available: true,
            status: 'ready',
            models: models.slice(0, 20), // Limit to first 20 for display
            totalModels: models.length,
            hasKey: true,
            latencyMs,
        };
    } catch (error) {
        const latencyMs = Date.now() - start;
        if (error.name === 'AbortError') {
            return {
                available: false,
                status: 'timeout',
                reason: 'Connection timeout - check your internet',
                models: [],
                latencyMs,
            };
        }
        // Distinguish JSON parse errors from other errors
        if (error instanceof SyntaxError) {
            return {
                available: false,
                status: 'parse_error',
                reason: 'Invalid response format from API',
                models: [],
                latencyMs,
            };
        }
        return {
            available: false,
            status: 'error',
            reason: error.message,
            models: [],
            latencyMs,
        };
    }
}

/**
 * Check Ollama health and available models
 * @returns {Promise<ProviderHealthStatus>}
 */
export async function checkOllamaHealth() {
    const start = Date.now();
    const endpoint = Settings?.get?.()?.llm?.ollamaEndpoint || 'http://localhost:11434';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

        const response = await fetch(`${endpoint}/api/tags`, {
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const latencyMs = Date.now() - start;

        if (!response.ok) {
            return {
                available: false,
                status: 'not_running',
                reason: `Ollama responded with error: ${response.status}`,
                models: [],
                latencyMs,
            };
        }

        const data = await safeJSONParse(response, { models: [] });
        const models = data.models?.map(m => m.name) || [];

        if (models.length === 0) {
            return {
                available: true,
                status: 'running_no_models',
                reason: 'No models installed. Run: ollama pull llama3.2',
                models: [],
                latencyMs,
            };
        }

        return {
            available: true,
            status: 'ready',
            models,
            latencyMs,
        };
    } catch (error) {
        const latencyMs = Date.now() - start;
        if (error.name === 'AbortError') {
            return {
                available: false,
                status: 'not_running',
                reason: 'Connection timeout - is Ollama running? Try: ollama serve',
                models: [],
                latencyMs,
            };
        }
        // Distinguish JSON parse errors from network errors
        if (error instanceof SyntaxError) {
            return {
                available: false,
                status: 'parse_error',
                reason: 'Invalid response from Ollama',
                models: [],
                latencyMs,
            };
        }
        // CORS or network error usually means Ollama isn't running
        return {
            available: false,
            status: 'not_running',
            reason: 'Cannot connect to Ollama. Start it with: ollama serve',
            models: [],
            latencyMs,
        };
    }
}

/**
 * Check LM Studio health and loaded models
 * @returns {Promise<ProviderHealthStatus>}
 */
export async function checkLMStudioHealth() {
    const start = Date.now();
    const endpoint = Settings?.get?.()?.llm?.lmstudioEndpoint || 'http://localhost:1234/v1';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

        const response = await fetch(`${endpoint}/models`, {
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const latencyMs = Date.now() - start;

        if (!response.ok) {
            return {
                available: false,
                status: 'not_running',
                reason: `LM Studio responded with error: ${response.status}`,
                models: [],
                latencyMs,
            };
        }

        const data = await safeJSONParse(response, { data: [] });
        const models = data.data?.map(m => m.id) || [];

        if (models.length === 0) {
            return {
                available: true,
                status: 'running_no_models',
                reason: 'No models loaded. Load a model in LM Studio.',
                models: [],
                latencyMs,
            };
        }

        return {
            available: true,
            status: 'ready',
            models,
            latencyMs,
        };
    } catch (error) {
        const latencyMs = Date.now() - start;
        if (error.name === 'AbortError') {
            return {
                available: false,
                status: 'not_running',
                reason: 'Connection timeout - is LM Studio running with server enabled?',
                models: [],
                latencyMs,
            };
        }
        // Distinguish JSON parse errors from network errors
        if (error instanceof SyntaxError) {
            return {
                available: false,
                status: 'parse_error',
                reason: 'Invalid response from LM Studio',
                models: [],
                latencyMs,
            };
        }
        return {
            available: false,
            status: 'not_running',
            reason: 'Cannot connect to LM Studio. Enable the local server in LM Studio settings.',
            models: [],
            latencyMs,
        };
    }
}

/**
 * Check Gemini health and API key validity
 * @returns {Promise<ProviderHealthStatus>}
 */
export async function checkGeminiHealth() {
    const start = Date.now();
    const apiKey = Settings?.get?.()?.gemini?.apiKey;

    if (!apiKey || apiKey === 'your-api-key-here') {
        return {
            available: false,
            status: 'no_key',
            reason: 'No API key configured',
            models: [],
            latencyMs: 0,
        };
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

        // Use Authorization header instead of query parameter to avoid exposing the key
        const response = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/openai/models',
            {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: controller.signal,
            }
        );
        clearTimeout(timeoutId);

        const latencyMs = Date.now() - start;

        if (response.status === 401 || response.status === 403) {
            return {
                available: false,
                status: 'invalid_key',
                reason: 'API key is invalid or expired',
                models: [],
                latencyMs,
            };
        }

        if (!response.ok) {
            return {
                available: false,
                status: 'error',
                reason: `API error: ${response.status}`,
                models: [],
                latencyMs,
            };
        }

        const data = await safeJSONParse(response, { data: [] });
        const models = data.data?.map(m => m.id) || [];

        return {
            available: true,
            status: 'ready',
            models: models.slice(0, 20),
            totalModels: models.length,
            hasKey: true,
            latencyMs,
        };
    } catch (error) {
        const latencyMs = Date.now() - start;
        if (error.name === 'AbortError') {
            return {
                available: false,
                status: 'timeout',
                reason: 'Connection timeout - check your internet',
                models: [],
                latencyMs,
            };
        }
        // Distinguish JSON parse errors from other errors
        if (error instanceof SyntaxError) {
            return {
                available: false,
                status: 'parse_error',
                reason: 'Invalid response format from Gemini API',
                models: [],
                latencyMs,
            };
        }
        return {
            available: false,
            status: 'error',
            reason: error.message,
            models: [],
            latencyMs,
        };
    }
}

/**
 * Check OpenAI-Compatible provider health
 * @returns {Promise<ProviderHealthStatus>}
 */
export async function checkOpenAICompatibleHealth() {
    const start = Date.now();
    const config = Settings?.get?.()?.openaiCompatible || {};

    if (!config.apiUrl) {
        return {
            available: false,
            status: 'not_configured',
            reason: 'No API endpoint configured',
            models: [],
            latencyMs: 0,
        };
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

        // Build models endpoint URL
        let modelsUrl = config.apiUrl;
        if (modelsUrl.endsWith('/chat/completions')) {
            modelsUrl = modelsUrl.replace('/chat/completions', '/models');
        } else if (!modelsUrl.endsWith('/models')) {
            const url = new URL(modelsUrl);
            url.pathname = url.pathname.replace(/\/$/, '') + '/models';
            modelsUrl = url.toString();
        }

        const headers = {};
        if (config.apiKey) {
            headers['Authorization'] = `Bearer ${config.apiKey}`;
        }

        const response = await fetch(modelsUrl, {
            headers,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const latencyMs = Date.now() - start;

        if (response.status === 401 || response.status === 403) {
            return {
                available: false,
                status: 'invalid_key',
                reason: 'API key is invalid or expired',
                models: [],
                latencyMs,
            };
        }

        if (!response.ok && response.status !== 404) {
            return {
                available: false,
                status: 'error',
                reason: `API error: ${response.status}`,
                models: [],
                latencyMs,
            };
        }

        // If 404, endpoint might work for chat even if /models doesn't exist
        let models = [];
        if (response.ok) {
            const data = await safeJSONParse(response, { data: [] });
            models = data.data?.map(m => m.id) || [];
        }

        return {
            available: true,
            status: 'ready',
            models: models.slice(0, 20),
            totalModels: models.length,
            hasKey: !!config.apiKey,
            latencyMs,
        };
    } catch (error) {
        const latencyMs = Date.now() - start;
        if (error.name === 'AbortError') {
            return {
                available: false,
                status: 'timeout',
                reason: 'Connection timeout - check your endpoint URL',
                models: [],
                latencyMs,
            };
        }
        return {
            available: false,
            status: 'error',
            reason: error.message,
            models: [],
            latencyMs,
        };
    }
}

/**
 * Comprehensive health check for all providers
 * Returns detailed status including model availability
 *
 * @returns {Promise<{
 *   openrouter: ProviderHealthStatus,
 *   ollama: ProviderHealthStatus,
 *   lmstudio: ProviderHealthStatus,
 *   gemini: ProviderHealthStatus,
 *   openaiCompatible: ProviderHealthStatus
 * }>}
 */
export async function checkHealth() {
    const [openrouter, ollama, lmstudio, gemini, openaiCompatible] = await Promise.all([
        checkOpenRouterHealth(),
        checkOllamaHealth(),
        checkLMStudioHealth(),
        checkGeminiHealth(),
        checkOpenAICompatibleHealth(),
    ]);

    return { openrouter, ollama, lmstudio, gemini, openaiCompatible };
}
