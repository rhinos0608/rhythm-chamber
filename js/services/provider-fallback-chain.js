/**
 * ProviderFallbackChain - Automatic Provider Fallback System
 *
 * Prevents cascade failures by automatically trying alternative LLM providers
 * when the primary provider fails. Implements health tracking, blacklisting,
 * and circuit breaker coordination for resilient provider switching.
 *
 * **REFACTORED**: This module now delegates to the refactored fallback/
 * subdirectory while maintaining backward compatibility through re-exports.
 *
 * @module ProviderFallbackChain
 * @author Rhythm Chamber Architecture Team
 * @version 2.0.0
 */

// Re-export everything from the refactored module
export {
    ProviderFallbackChain,
    ProviderPriority,
    ProviderHealth,
    default,
} from './fallback/index.js';

// Re-export the default singleton
export { default as ProviderFallbackChainSingleton } from './fallback/index.js';
