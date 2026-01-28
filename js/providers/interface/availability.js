/**
 * Provider Availability Checks
 *
 * Functions to check if providers are available for use.
 * Part of the refactored ProviderInterface module.
 *
 * @module providers/interface/availability
 */

import { Settings } from '../../settings.js';
import { ConfigLoader } from '../../services/config-loader.js';
import { ModuleRegistry } from '../../module-registry.js';

/**
 * Check if a provider is available
 * @param {string} provider - Provider name
 * @returns {Promise<boolean>} True if provider is available
 */
export async function isProviderAvailable(provider) {
    switch (provider) {
        case 'ollama': {
            const Ollama = ModuleRegistry.getModuleSync('Ollama');
            return Ollama?.isAvailable?.() ?? false;
        }

        case 'lmstudio':
            // LM Studio has no built-in detection, so check endpoint
            try {
                const endpoint = Settings?.get?.()?.llm?.lmstudioEndpoint || 'http://localhost:1234/v1';
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                const response = await fetch(`${endpoint}/models`, {
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                return response.ok;
            } catch {
                return false;
            }

        case 'gemini':
            // MEDIUM FIX #15: Verify Gemini API key AND connectivity
            // Previously only checked for API key existence, which could lead to
            // users waiting for timeout before discovering the API is unreachable
            const geminiApiKey = Settings?.get?.()?.gemini?.apiKey;
            if (!geminiApiKey || geminiApiKey === 'your-api-key-here') {
                return false;
            }
            // Quick health check with short timeout
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);
                const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/models', {
                    headers: { 'Authorization': `Bearer ${geminiApiKey}` },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                return response.ok;
            } catch {
                // Network error or timeout - API key exists but service unreachable
                return false;
            }

        case 'openai-compatible':
            // Check for apiUrl configuration
            const openaiCompatibleUrl = Settings?.get?.()?.openaiCompatible?.apiUrl;
            if (!openaiCompatibleUrl) {
                return false;
            }
            // Quick health check with short timeout
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);
                const response = await fetch(openaiCompatibleUrl.replace('/chat/completions', '/models'), {
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                // Accept 200, 401 (auth works but no key), or 404 (no /models endpoint)
                return response.ok || response.status === 401 || response.status === 404;
            } catch {
                return false;
            }

        case 'openrouter':
        default:
            // MEDIUM FIX #15: Verify OpenRouter API key AND connectivity
            // Previously only checked for API key existence
            const apiKey = Settings?.get?.()?.openrouter?.apiKey ||
                ConfigLoader.get('openrouter.apiKey');
            if (!apiKey) {
                return false;
            }
            // Quick health check with short timeout
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);
                const response = await fetch('https://openrouter.ai/api/v1/models', {
                    headers: { 'Authorization': `Bearer ${apiKey}` },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                return response.ok;
            } catch {
                // Network error or timeout - API key exists but service unreachable
                return false;
            }
    }
}

/**
 * Get available providers
 * @returns {Promise<Array<{name: string, available: boolean}>>}
 */
export async function getAvailableProviders() {
    const providers = ['openrouter', 'ollama', 'lmstudio', 'gemini', 'openai-compatible'];
    const results = await Promise.all(
        providers.map(async (name) => ({
            name,
            available: await isProviderAvailable(name)
        }))
    );
    return results;
}
