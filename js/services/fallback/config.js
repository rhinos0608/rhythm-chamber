/**
 * Fallback Chain Configuration
 *
 * Provider configurations, priority definitions, and constants.
 *
 * @module fallback/config
 */

import { HealthStatus } from '../provider-health-authority.js';

/**
 * Provider priority order (tried in sequence)
 * @readonly
 * @enum {number}
 */
export const ProviderPriority = Object.freeze({
    OPENROUTER: 1,    // Primary cloud provider
    LM_STUDIO: 2,     // Local inference
    OLLAMA: 3,        // Local inference
    FALLBACK: 4       // Static fallback responses
});

/**
 * Provider health status
 * @deprecated Use HealthStatus from provider-health-authority.js instead
 * @readonly
 * @enum {string}
 */
export const ProviderHealth = HealthStatus; // Re-export for backwards compatibility

/**
 * Provider configuration
 * @typedef {Object} ProviderConfig
 * @property {string} name - Provider name
 * @property {ProviderPriority} priority - Provider priority
 * @property {number} timeoutMs - Request timeout in milliseconds
 * @property {boolean} isLocal - Whether provider is local
 * @property {number} maxRetries - Maximum retry attempts
 */

/**
 * Default provider configurations
 * @returns {Map<string, ProviderConfig>}
 */
export function createDefaultProviderConfigs() {
    const configs = new Map();

    // OpenRouter - Primary cloud provider
    configs.set('openrouter', {
        name: 'openrouter',
        priority: ProviderPriority.OPENROUTER,
        timeoutMs: 60000,
        isLocal: false,
        maxRetries: 3
    });

    // LM Studio - Local inference
    configs.set('lmstudio', {
        name: 'lmstudio',
        priority: ProviderPriority.LM_STUDIO,
        timeoutMs: 90000,
        isLocal: true,
        maxRetries: 2
    });

    // Ollama - Local inference
    configs.set('ollama', {
        name: 'ollama',
        priority: ProviderPriority.OLLAMA,
        timeoutMs: 90000,
        isLocal: true,
        maxRetries: 2
    });

    // Fallback responses - Static data
    configs.set('fallback', {
        name: 'fallback',
        priority: ProviderPriority.FALLBACK,
        timeoutMs: 0,
        isLocal: true,
        maxRetries: 0
    });

    return configs;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = Object.freeze({
    BLACKLIST_DURATION_MS: 300000,      // 5 minutes
    HEALTH_CHECK_INTERVAL_MS: 60000     // 1 minute
});
