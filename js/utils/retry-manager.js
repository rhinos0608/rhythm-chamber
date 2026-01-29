/**
 * Unified Retry Manager
 *
 * CONSOLIDATED MODULE - Now uses modular architecture
 *
 * This file now serves as a facade that re-exports all functionality
 * from the modular retry-manager directory structure.
 *
 * New Architecture:
 * - js/utils/retry-manager/retry-config.js (configuration, error classification)
 * - js/utils/retry-manager/retry-strategies.js (backoff calculation, retry conditions)
 * - js/utils/retry-manager/retry-executor.js (core retry execution)
 * - js/utils/retry-manager/retry-monitoring.js (statistics and monitoring)
 * - js/utils/retry-manager/index.js (facade)
 *
 * This change maintains 100% backward compatibility - all existing
 * imports continue to work without modification.
 *
 * Features:
 * - Multiple retry strategies (exponential, linear, custom)
 * - Unified retry configuration
 * - Retry condition builders
 * - Jitter utilities
 * - Circuit breaker integration
 * - Timeout wrapping
 * - Error classification
 * - Retry context tracking
 * - Parallel retry support
 * - Fallback chain execution
 *
 * HNW Considerations:
 * - Hierarchy: Single source of truth for all retry logic
 * - Network: Jitter prevents thundering herd
 * - Wave: Exponential backoff respects system capacity
 *
 * @module utils/retry-manager
 * @see js/utils/retry-manager/index.js for modular implementation
 */

// Re-export everything from the modular index
export {
    ErrorType,
    DEFAULT_RETRY_CONFIG,
    RetryStrategies,
    classifyError,
    isRetryable,
    calculateExponentialBackoff,
    calculateLinearBackoff,
    calculateCustomBackoff,
    addJitter,
    calculateBackoffWithJitter,
    calculateBackoffForError,
    delay,
    retryOnErrorTypes,
    retryWithMaxAttempts,
    retryOnStatus,
    retryIfAll,
    retryIfAny,
    retryNever,
    retryAlways,
    withRetry,
    retryExponential,
    retryLinear,
    retryCustom,
    withRetryParallel,
    withFallback,
    withCircuitBreaker,
    withStrategy,
    retryStorage,
    retryNetwork,
    retryFunction,
    retryTransaction,
    withTimeout,
    RetryContext,
    // Monitoring exports
    enableRetryMonitoring,
    disableRetryMonitoring,
    getRetryStatistics,
    resetRetryStatistics,
    recordRetryOperation,
    calculatePerformanceMetrics,
    logRetrySummary,
    createRetryLogger,
    retryStatistics,
    RetryManager as default
} from './retry-manager/index.js';

console.log('[RetryManager] Unified retry utility loaded (modular architecture)');
