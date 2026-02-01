/**
 * LLM Provider Interface
 *
 * Unified abstraction layer for all LLM providers (OpenRouter, Ollama, LM Studio).
 * Handles configuration building and request routing.
 *
 * BRING YOUR OWN AI: Users choose their AI infrastructure - local or cloud.
 * Local AI (Ollama/LM Studio) provides maximum privacy with zero data transmission.
 *
 * REFACTORED: This module now serves as a backward-compatible facade that
 * re-exports from the new modular architecture in js/providers/interface/
 *
 * @module providers/provider-interface
 */

// Re-export everything from the new modular interface
export { ProviderInterface, default } from './interface/index.js';

// Re-export all named exports for backward compatibility
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
} from './interface/index.js';

// Import and log after re-exporting
import './interface/index.js';
