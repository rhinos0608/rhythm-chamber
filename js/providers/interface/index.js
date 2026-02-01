/**
 * Provider Interface Public API
 *
 * Facade maintaining backward compatibility with the original
 * provider-interface.js module while using the new modular architecture.
 *
 * @module providers/interface
 */

// Import all modules
import { PROVIDER_TIMEOUTS, RETRY_CONFIG, HEALTH_CHECK_TIMEOUT } from './config.js';
import { isRetryableError, calculateRetryDelay, delay, extractRetryAfter } from './retry.js';
import { normalizeProviderError, safeJSONParse } from './errors.js';
import { buildProviderConfig } from './provider-config.js';
import { callProvider, getProviderModule } from './routing.js';
import {
    checkOpenRouterHealth,
    checkOllamaHealth,
    checkLMStudioHealth,
    checkGeminiHealth,
    checkOpenAICompatibleHealth,
    checkHealth,
} from './health-checks.js';
import { isProviderAvailable, getAvailableProviders } from './availability.js';

/**
 * ProviderInterface public API
 * Maintains backward compatibility with original module
 */
export const ProviderInterface = {
    // Configuration
    buildProviderConfig,

    // Routing
    callProvider,

    // Discovery
    isProviderAvailable,
    getAvailableProviders,
    getProviderModule,

    // Health Checks
    checkHealth,
    checkOpenRouterHealth,
    checkOllamaHealth,
    checkLMStudioHealth,
    checkGeminiHealth,
    checkOpenAICompatibleHealth,

    // Error handling
    normalizeProviderError,

    // Constants
    TIMEOUTS: PROVIDER_TIMEOUTS,
};

// ES Module export for backward compatibility
export default ProviderInterface;

// Re-export individual functions for named imports
export {
    // Config
    PROVIDER_TIMEOUTS,
    RETRY_CONFIG,
    HEALTH_CHECK_TIMEOUT,

    // Retry
    isRetryableError,
    calculateRetryDelay,
    delay,
    extractRetryAfter,

    // Errors
    normalizeProviderError,
    safeJSONParse,

    // Config building
    buildProviderConfig,

    // Routing
    callProvider,
    getProviderModule,

    // Health checks
    checkOpenRouterHealth,
    checkOllamaHealth,
    checkLMStudioHealth,
    checkGeminiHealth,
    checkOpenAICompatibleHealth,
    checkHealth,

    // Availability
    isProviderAvailable,
    getAvailableProviders,
};

console.log(
    '[ProviderInterface] LLM provider abstraction layer loaded (refactored modular architecture)'
);
