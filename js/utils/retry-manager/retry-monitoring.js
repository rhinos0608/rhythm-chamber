/**
 * Retry Monitoring - Statistics and Performance Metrics
 *
 * Provides retry statistics tracking, performance metrics collection,
 * and operation logging for monitoring retry behavior.
 *
 * Note: This is a lightweight monitoring module. The core retry
 * statistics are tracked in RetryContext (retry-executor.js).
 * This module provides additional monitoring utilities if needed.
 *
 * Depends on: retry-executor.js (uses RetryContext)
 *
 * @module utils/retry-manager/retry-monitoring
 */

import { classifyError, ErrorType } from './retry-config.js';

// Default EventBus instance (fallback if not injected)
let defaultEventBus = null;

/**
 * Set the default EventBus for this module
 * @param {Object} eventBus - EventBus instance
 */
export function setDefaultEventBus(eventBus) {
    defaultEventBus = eventBus;
}

// ==========================================
// Retry Statistics Tracker
// ==========================================

/**
 * Global retry statistics tracker
 */
class RetryStatistics {
    constructor() {
        this.stats = {
            totalOperations: 0,
            successfulOperations: 0,
            failedOperations: 0,
            totalRetries: 0,
            totalDelayTime: 0,
            errorBreakdown: {}
        };
    }

    /**
     * Record a retry operation result
     * @param {Object} context - RetryContext from retry operation
     */
    recordOperation(context) {
        const summary = context.getSummary();

        this.stats.totalOperations++;
        this.stats.totalRetries += summary.attempts;
        this.stats.totalDelayTime += summary.totalDelayTime;

        if (summary.succeeded) {
            this.stats.successfulOperations++;
        } else {
            this.stats.failedOperations++;

            // Track error types
            summary.errors.forEach(error => {
                const errorType = classifyError(error);
                this.stats.errorBreakdown[errorType] = (this.stats.errorBreakdown[errorType] || 0) + 1;
            });
        }
    }

    /**
     * Get retry statistics
     * @returns {Object} Statistics summary
     */
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalOperations > 0
                ? (this.stats.successfulOperations / this.stats.totalOperations * 100).toFixed(2) + '%'
                : 'N/A',
            avgRetriesPerOperation: this.stats.totalOperations > 0
                ? (this.stats.totalRetries / this.stats.totalOperations).toFixed(2)
                : '0',
            avgDelayTime: this.stats.totalRetries > 0
                ? Math.round(this.stats.totalDelayTime / this.stats.totalRetries) + 'ms'
                : '0ms'
        };
    }

    /**
     * Reset statistics
     */
    reset() {
        this.stats = {
            totalOperations: 0,
            successfulOperations: 0,
            failedOperations: 0,
            totalRetries: 0,
            totalDelayTime: 0,
            errorBreakdown: {}
        };
    }
}

// Global statistics instance
const retryStatistics = new RetryStatistics();

// ==========================================
// Event-based Monitoring
// ==========================================

/**
 * Enable automatic retry monitoring via EventBus
 * Listens to retry:attempt events and tracks statistics
 * @param {Object} eventBus - Optional EventBus instance (HNW compliance)
 */
export function enableRetryMonitoring(eventBus = defaultEventBus) {
    const DEBUG = globalThis.DEBUG ?? false;
    eventBus?.on('retry:attempt', (data) => {
        // Auto-record retry attempts
        // Can be extended with more sophisticated monitoring
        if (DEBUG) {
            console.debug('[RetryMonitor] Retry attempt detected:', data);
        }
    }, { domain: 'retry' });
}

/**
 * Disable automatic retry monitoring
 * @param {Object} eventBus - Optional EventBus instance (HNW compliance)
 */
export function disableRetryMonitoring(eventBus = defaultEventBus) {
    eventBus?.off('retry:attempt', null, { domain: 'retry' });
}

// ==========================================
// Statistics Access
// ==========================================

/**
 * Get current retry statistics
 * @returns {Object} Statistics summary
 */
export function getRetryStatistics() {
    return retryStatistics.getStats();
}

/**
 * Reset retry statistics
 */
export function resetRetryStatistics() {
    retryStatistics.reset();
}

/**
 * Record a retry operation from a RetryContext
 * @param {Object} context - RetryContext from retry operation
 */
export function recordRetryOperation(context) {
    retryStatistics.recordOperation(context);
}

// ==========================================
// Performance Metrics
// ==========================================

/**
 * Calculate retry performance metrics
 * @param {Array<Object>} contexts - Array of RetryContext objects
 * @returns {Object} Performance metrics
 */
export function calculatePerformanceMetrics(contexts) {
    if (!contexts || contexts.length === 0) {
        return {
            totalOperations: 0,
            avgAttempts: 0,
            maxAttempts: 0,
            avgDelayTime: 0,
            maxDelayTime: 0,
            avgElapsedTime: 0,
            successRate: 'N/A'
        };
    }

    const summaries = contexts.map(ctx => ctx.getSummary());

    const totalAttempts = summaries.reduce((sum, s) => sum + s.attempts, 0);
    const totalDelayTime = summaries.reduce((sum, s) => sum + s.totalDelayTime, 0);
    const totalElapsedTime = summaries.reduce((sum, s) => sum + s.elapsedTime, 0);
    const successfulOps = summaries.filter(s => s.succeeded).length;

    return {
        totalOperations: contexts.length,
        avgAttempts: (totalAttempts / contexts.length).toFixed(2),
        maxAttempts: Math.max(...summaries.map(s => s.attempts)),
        avgDelayTime: Math.round(totalDelayTime / contexts.length) + 'ms',
        maxDelayTime: Math.max(...summaries.map(s => s.totalDelayTime)) + 'ms',
        avgElapsedTime: Math.round(totalElapsedTime / contexts.length) + 'ms',
        successRate: (successfulOps / contexts.length * 100).toFixed(2) + '%'
    };
}

// ==========================================
// Logging Utilities
// ==========================================

/**
 * Log retry summary for a RetryContext
 * @param {Object} context - RetryContext to log
 * @param {string} [operationName] - Optional operation name for logging
 */
export function logRetrySummary(context, operationName = 'Operation') {
    const summary = context.getSummary();

    const DEBUG = globalThis.DEBUG ?? false;
    if (DEBUG) {
        console.log(`[RetryMonitor] ${operationName} Summary:`, {
            attempts: summary.attempts,
            succeeded: summary.succeeded,
            elapsedTime: summary.elapsedTime + 'ms',
            totalDelayTime: summary.totalDelayTime + 'ms',
            errors: summary.errors.length
        });
    }

    if (summary.errors.length > 0) {
        console.warn('[RetryMonitor] Errors encountered:', summary.errors.map(e => ({
            type: classifyError(e),
            message: e.message
        })));
    }
}

/**
 * Create a retry logger that logs to EventBus
 * @param {string} domain - Domain for logging
 * @param {Object} eventBus - Optional EventBus instance (HNW compliance)
 * @returns {Object} Logger with log, warn, error methods
 */
export function createRetryLogger(domain, eventBus = defaultEventBus) {
    const DEBUG = globalThis.DEBUG ?? false;
    return {
        log: (message, data) => {
            eventBus?.emit('retry:log', { level: 'info', message, data }, { domain });
            if (DEBUG) {
                console.log(`[Retry:${domain}] ${message}`, data);
            }
        },
        warn: (message, data) => {
            eventBus?.emit('retry:log', { level: 'warn', message, data }, { domain });
            if (DEBUG) {
                console.warn(`[Retry:${domain}] ${message}`, data);
            }
        },
        error: (message, data) => {
            eventBus?.emit('retry:log', { level: 'error', message, data }, { domain });
            if (DEBUG) {
                console.error(`[Retry:${domain}] ${message}`, data);
            }
        }
    };
}

// Export statistics instance for advanced use cases
export { retryStatistics };
