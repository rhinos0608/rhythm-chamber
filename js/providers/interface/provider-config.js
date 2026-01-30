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
    // All settings are stored under settings.llm.* for consistency
    const llmSettings = settings?.llm || {};

    switch (provider) {
        case 'ollama':
            return {
                provider: 'ollama',
                endpoint: llmSettings.ollamaEndpoint || 'http://localhost:11434',
                model: llmSettings.ollamaModel || 'llama3.2',
                temperature: llmSettings.temperature ?? 0.7,
                topP: 0.9,
                maxTokens: llmSettings.maxTokens || 2000,
                timeout: PROVIDER_TIMEOUTS.local,
                // Privacy flag for UI
                isLocal: true,
                privacyLevel: 'maximum'
            };

        case 'lmstudio':
            return {
                provider: 'lmstudio',
                endpoint: llmSettings.lmstudioEndpoint || 'http://localhost:1234/v1',
                model: llmSettings.lmstudioModel || 'local-model',
                temperature: llmSettings.temperature ?? 0.7,
                topP: 0.9,
                maxTokens: llmSettings.maxTokens || 2000,
                timeout: PROVIDER_TIMEOUTS.local,
                // Privacy flag for UI
                isLocal: true,
                privacyLevel: 'maximum'
            };

        case 'gemini':
            return {
                provider: 'gemini',
                endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
                model: llmSettings.geminiModel || 'gemini-2.5-flash',
                temperature: llmSettings.temperature ?? 0.7,
                topP: 0.9,
                maxTokens: llmSettings.maxTokens || 8192,
                timeout: PROVIDER_TIMEOUTS.cloud,
                // Privacy flag for UI
                isLocal: false,
                privacyLevel: 'cloud'
            };

        case 'openai-compatible':
            return {
                provider: 'openai-compatible',
                endpoint: llmSettings.openaiCompatibleEndpoint || '',
                model: llmSettings.openaiCompatibleModel || 'gpt-4o-mini',
                temperature: llmSettings.temperature ?? 0.7,
                topP: 0.9,
                maxTokens: llmSettings.maxTokens || 4000,
                timeout: PROVIDER_TIMEOUTS.cloud,
                isLocal: false,
                privacyLevel: 'cloud'
            };

        case 'openrouter':
        default:
            return {
                provider: 'openrouter',
                ...baseConfig,
                model: llmSettings.openrouterModel || baseConfig?.model || 'xiaomi/mimo-v2-flash:free',
                temperature: llmSettings.temperature ?? 0.7,
                topP: 0.9,
                maxTokens: llmSettings.maxTokens || 4500,
                frequencyPenalty: 0,
                presencePenalty: 0,
                timeout: PROVIDER_TIMEOUTS.cloud,
                // Privacy flag for UI
                isLocal: false,
                privacyLevel: 'cloud'
            };
    }
}

