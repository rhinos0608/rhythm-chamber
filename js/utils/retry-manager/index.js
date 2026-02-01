/**
 * RetryManager - Unified Retry Utility
 *
 * Facade module that re-exports all retry functionality from
 * the modular retry-manager subdirectory.
 *
 * Maintains 100% backward compatibility with the original
 * js/utils/retry-manager.js API.
 *
 * Architecture:
 * - retry-config.js: Configuration and error classification
 * - retry-strategies.js: Backoff calculation and retry conditions
 * - retry-executor.js: Core retry execution engine
 * - retry-monitoring.js: Statistics and performance metrics
 *
 * @module utils/retry-manager
 */

// ==========================================
// Configuration
// ==========================================

export {
    ErrorType,
    DEFAULT_RETRY_CONFIG,
    RetryStrategies,
    classifyError,
    isRetryable,
} from './retry-config.js';

// ==========================================
// Delay Calculation
// ==========================================

export {
    calculateExponentialBackoff,
    calculateLinearBackoff,
    calculateCustomBackoff,
    addJitter,
    calculateBackoffWithJitter,
    calculateBackoffForError,
    delay,
} from './retry-strategies.js';

// ==========================================
// Retry Conditions
// ==========================================

export {
    retryOnErrorTypes,
    retryWithMaxAttempts,
    retryOnStatus,
    retryIfAll,
    retryIfAny,
    retryNever,
    retryAlways,
} from './retry-strategies.js';

// ==========================================
// Core Retry Functions
// ==========================================

export { withRetry } from './retry-executor-core.js';

export { retryExponential, retryLinear, retryCustom } from './retry-executor-patterns.js';

// ==========================================
// Advanced Patterns
// ==========================================

export {
    withRetryParallel,
    withFallback,
    withCircuitBreaker,
    withStrategy,
} from './retry-executor-patterns.js';

// ==========================================
// Convenience Functions
// ==========================================

export {
    retryStorage,
    retryNetwork,
    retryFunction,
    retryTransaction,
} from './retry-executor-patterns.js';

// ==========================================
// Utilities
// ==========================================

export { withTimeout, RetryContext } from './retry-executor-core.js';

// ==========================================
// Monitoring (Optional)
// ==========================================

export {
    enableRetryMonitoring,
    disableRetryMonitoring,
    getRetryStatistics,
    resetRetryStatistics,
    recordRetryOperation,
    calculatePerformanceMetrics,
    logRetrySummary,
    createRetryLogger,
    retryStatistics,
} from './retry-monitoring.js';

// ==========================================
// Public API (Backward Compatibility)
// ==========================================

import {
    ErrorType as ET,
    DEFAULT_RETRY_CONFIG as DRC,
    RetryStrategies as RS,
} from './retry-config.js';
import { classifyError as ce, isRetryable as ir } from './retry-config.js';
import {
    calculateExponentialBackoff as ebo,
    calculateLinearBackoff as lbo,
    calculateCustomBackoff as cbo,
    addJitter as aj,
    calculateBackoffWithJitter as cbwj,
    calculateBackoffForError as cbfe,
    delay as d,
} from './retry-strategies.js';
import {
    retryOnErrorTypes as roet,
    retryWithMaxAttempts as rwma,
    retryOnStatus as ros,
    retryIfAll as ria,
    retryIfAny as riany,
    retryNever as rn,
    retryAlways as ra,
} from './retry-strategies.js';
import { withRetry as wr, withTimeout as wt, RetryContext as RCtx } from './retry-executor-core.js';
import {
    retryExponential as rexp,
    retryLinear as rlin,
    retryCustom as rcust,
    withRetryParallel as wrp,
    withFallback as wfb,
    withCircuitBreaker as wcb,
    withStrategy as ws,
    retryStorage as rs_storage,
    retryNetwork as rn_network,
    retryFunction as rf,
    retryTransaction as rt,
} from './retry-executor-patterns.js';

/**
 * Unified RetryManager API object
 * Provides both namespace access and compatibility with destructuring
 */
export const RetryManager = {
    // Configuration
    DEFAULT_RETRY_CONFIG: DRC,
    RetryStrategies: RS,
    ErrorType: ET,

    // Error classification
    classifyError: ce,
    isRetryable: ir,

    // Delay calculation
    calculateExponentialBackoff: ebo,
    calculateLinearBackoff: lbo,
    calculateCustomBackoff: cbo,
    addJitter: aj,
    calculateBackoffWithJitter: cbwj,
    calculateBackoffForError: cbfe,
    delay: d,

    // Retry conditions
    retryOnErrorTypes: roet,
    retryWithMaxAttempts: rwma,
    retryOnStatus: ros,
    retryIfAll: ria,
    retryIfAny: riany,
    retryNever: rn,
    retryAlways: ra,

    // Core retry
    withRetry: wr,
    retryExponential: rexp,
    retryLinear: rlin,
    retryCustom: rcust,

    // Advanced patterns
    withRetryParallel: wrp,
    withFallback: wfb,
    withCircuitBreaker: wcb,
    withStrategy: ws,

    // Convenience functions
    retryStorage: rs_storage,
    retryNetwork: rn_network,
    retryFunction: rf,
    retryTransaction: rt,

    // Utilities
    withTimeout: wt,
    RetryContext: RCtx,
};

// Default export for backward compatibility
export default RetryManager;

// Module loaded notification (only in debug mode)
const DEBUG = globalThis.DEBUG ?? false;
if (DEBUG) {
    console.log('[RetryManager] Unified retry utility loaded (modular)');
}
