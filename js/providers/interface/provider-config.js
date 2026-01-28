/**
 * Provider Configuration Builder
 *
 * Builds provider-specific configuration objects from user settings.
 * Part of the refactored ProviderInterface module.
 *
 * @module providers/interface/provider-config
 */

import { PROVIDER_TIMEOUTS } from './config.js';

/**
 * Build provider-specific configuration
 * @param {string} provider - Provider name (openrouter, ollama, lmstudio)
 * @param {object} settings - User settings from Settings module
 * @param {object} baseConfig - Base config from config.js
 * @returns {object} Provider-specific config
 */
export function buildProviderConfig(provider, settings, baseConfig) {
    switch (provider) {
        case 'ollama':
            return {
                provider: 'ollama',
                endpoint: settings.llm?.ollamaEndpoint || 'http://localhost:11434',
                model: settings.ollama?.model || 'llama3.2',
                temperature: settings.ollama?.temperature ?? settings.openrouter?.temperature ?? 0.7,
                topP: settings.ollama?.topP ?? 0.9,
                maxTokens: settings.ollama?.maxTokens || 2000,
                timeout: PROVIDER_TIMEOUTS.local,
                // Privacy flag for UI
                isLocal: true,
                privacyLevel: 'maximum'
            };

        case 'lmstudio':
            return {
                provider: 'lmstudio',
                endpoint: settings.llm?.lmstudioEndpoint || 'http://localhost:1234/v1',
                model: settings.lmstudio?.model || 'local-model',
                temperature: settings.lmstudio?.temperature ?? settings.openrouter?.temperature ?? 0.7,
                topP: settings.lmstudio?.topP ?? 0.9,
                maxTokens: settings.lmstudio?.maxTokens || 2000,
                timeout: PROVIDER_TIMEOUTS.local,
                // Privacy flag for UI
                isLocal: true,
                privacyLevel: 'maximum'
            };

        case 'gemini':
            return {
                provider: 'gemini',
                endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
                model: settings.gemini?.model || 'gemini-2.5-flash',
                temperature: settings.gemini?.temperature ?? settings.openrouter?.temperature ?? 0.7,
                topP: settings.gemini?.topP ?? 0.9,
                maxTokens: settings.gemini?.maxTokens || 8192,
                timeout: PROVIDER_TIMEOUTS.cloud,
                // Privacy flag for UI
                isLocal: false,
                privacyLevel: 'cloud'
            };

        case 'openai-compatible':
            return {
                provider: 'openai-compatible',
                apiUrl: settings.openaiCompatible?.apiUrl || '',
                model: settings.openaiCompatible?.model || 'gpt-3.5-turbo',
                temperature: settings.openaiCompatible?.temperature ?? settings.openrouter?.temperature ?? 0.7,
                topP: settings.openaiCompatible?.topP ?? 0.9,
                maxTokens: settings.openaiCompatible?.maxTokens || 4000,
                timeout: PROVIDER_TIMEOUTS.cloud,
                isLocal: false,
                privacyLevel: 'cloud'
            };

        case 'openrouter':
        default:
            return {
                provider: 'openrouter',
                ...baseConfig,
                ...(settings.openrouter || {}),
                model: settings.openrouter?.model || baseConfig.model,
                temperature: settings.openrouter?.temperature ?? 0.7,
                topP: settings.openrouter?.topP ?? 0.9,
                maxTokens: settings.openrouter?.maxTokens || 4500,
                frequencyPenalty: settings.openrouter?.frequencyPenalty ?? 0,
                presencePenalty: settings.openrouter?.presencePenalty ?? 0,
                timeout: PROVIDER_TIMEOUTS.cloud,
                // Privacy flag for UI
                isLocal: false,
                privacyLevel: 'cloud'
            };
    }
}
