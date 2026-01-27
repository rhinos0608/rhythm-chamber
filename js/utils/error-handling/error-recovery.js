/**
 * Error Recovery Module
 *
 * Provides error recovery strategies, logging, and batch error handling
 * Includes type guards and recovery orchestration
 *
 * @module utils/error-handling/error-recovery
 */

import { ErrorSeverity, ErrorRecoverability } from './error-classifier.js';
import { sanitizeMessage } from './error-sanitizer.js';

/**
 * Log a classified error with appropriate severity level
 * Routes to console and optionally to external logging services
 * STACK TRACES ONLY INCLUDED IN NON-PRODUCTION ENVIRONMENTS
 *
 * @param {ClassifiedError} classifiedError - The error to log
 * @param {Object} options - Logging options
 * @param {boolean} [options.includeStack=true] - Include stack trace (dev-only)
 * @param {boolean} [options.includeContext=true] - Include context
 * @param {boolean} [options.silent=false] - Skip console output
 * @returns {Object} Log entry for external processing
 */
export function log(classifiedError, options = {}) {
    const {
        includeStack = true,
        includeContext = true,
        silent = false
    } = options;

    // Determine if we're in production (no stack traces in production)
    const isProduction = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';
    const shouldIncludeStack = includeStack && !isProduction;

    const logEntry = {
        type: classifiedError.type,
        severity: classifiedError.severity,
        message: classifiedError.message,
        timestamp: classifiedError.timestamp
    };

    if (includeContext && classifiedError.context) {
        logEntry.context = classifiedError.context;
    }

    // Only include stack trace if not in production
    if (shouldIncludeStack && classifiedError.originalError?.stack) {
        logEntry.stack = classifiedError.originalError.stack;
    }

    if (silent) {
        return logEntry;
    }

    // Route to appropriate console method based on severity
    const consoleMethod = {
        [ErrorSeverity.CRITICAL]: console.error,
        [ErrorSeverity.HIGH]: console.error,
        [ErrorSeverity.MEDIUM]: console.warn,
        [ErrorSeverity.LOW]: console.info,
        [ErrorSeverity.INFO]: console.log
    }[classifiedError.severity] || console.error;

    const logMessage = `[${classifiedError.type}] ${classifiedError.message}`;

    if (includeContext && classifiedError.context) {
        consoleMethod(logMessage, { context: classifiedError.context });
    } else {
        consoleMethod(logMessage);
    }

    // Only log stack trace in non-production environments
    // SECURITY: Stack traces expose internal structure and file paths
    const isDevelopment = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
    if (shouldIncludeStack && isDevelopment && classifiedError.originalError?.stack) {
        console.group('Stack Trace');
        console.trace(classifiedError.originalError);
        console.groupEnd();
    }

    return logEntry;
}

/**
 * Attempt automatic recovery from a classified error
 * Implements recovery strategies based on error type and recoverability
 *
 * @param {ClassifiedError} classifiedError - The error to recover from
 * @param {Object} options - Recovery options
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @param {number} [options.retryDelayMs=1000] - Delay between retries
 * @param {Function} [options.retryCallback] - Callback to execute on retry
 * @returns {Promise<{success: boolean, attempt: number, message?: string}>}
 */
export async function attemptRecovery(classifiedError, options = {}) {
    const {
        maxRetries = 3,
        retryDelayMs = 1000,
        retryCallback = null
    } = options;

    // Check if error is recoverable
    if (classifiedError.recoverable === ErrorRecoverability.NOT_RECOVERABLE) {
        return {
            success: false,
            attempt: 0,
            message: 'Error is not recoverable'
        };
    }

    if (classifiedError.recoverable === ErrorRecoverability.USER_ACTION_REQUIRED) {
        return {
            success: false,
            attempt: 0,
            message: 'User action required for recovery'
        };
    }

    // Check if retry callback is provided
    if (!retryCallback || typeof retryCallback !== 'function') {
        return {
            success: false,
            attempt: 0,
            message: 'No retry callback provided'
        };
    }

    // Attempt retry with exponential backoff
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Calculate delay with exponential backoff
            const delay = retryDelayMs * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));

            // Execute retry callback
            const result = await retryCallback();

            return {
                success: true,
                attempt,
                message: `Recovery successful on attempt ${attempt}`
            };
        } catch (retryError) {
            // Log retry attempt with sanitized error
            // SECURITY: Sanitize retry error to prevent sensitive data leakage
            const sanitizedRetryError = sanitizeMessage(String(retryError?.message || retryError));
            console.warn(`[ErrorHandler] Retry attempt ${attempt}/${maxRetries} failed:`, sanitizedRetryError);

            // Check if this was the last attempt
            if (attempt === maxRetries) {
                return {
                    success: false,
                    attempt,
                    message: `Recovery failed after ${maxRetries} attempts`
                };
            }
        }
    }

    return {
        success: false,
        attempt: maxRetries,
        message: 'All retry attempts exhausted'
    };
}

/**
 * Check if an error is of a specific type
 * @param {ClassifiedError} classifiedError - The error to check
 * @param {string} errorType - The error type to check against
 * @returns {boolean} True if error matches type
 */
export function isType(classifiedError, errorType) {
    return classifiedError?.type === errorType;
}

/**
 * Check if an error is critical or high severity
 * @param {ClassifiedError} classifiedError - The error to check
 * @returns {boolean} True if error is critical or high
 */
export function isSevere(classifiedError) {
    return classifiedError?.severity === ErrorSeverity.CRITICAL ||
           classifiedError?.severity === ErrorSeverity.HIGH;
}

/**
 * Check if an error is recoverable (automatic or with retry)
 * @param {ClassifiedError} classifiedError - The error to check
 * @returns {boolean} True if error can be recovered
 */
export function isRecoverable(classifiedError) {
    return classifiedError?.recoverable === ErrorRecoverability.RECOVERABLE ||
           classifiedError?.recoverable === ErrorRecoverability.RECOVERABLE_WITH_RETRY;
}

/**
 * Check if an error requires user action
 * @param {ClassifiedError} classifiedError - The error to check
 * @returns {boolean} True if user action is required
 */
export function requiresUserAction(classifiedError) {
    return classifiedError?.recoverable === ErrorRecoverability.USER_ACTION_REQUIRED;
}

/**
 * Handle multiple errors from batch operations
 * Aggregates and summarizes errors for batch operations
 *
 * @param {Array<Error>} errors - Array of errors to handle
 * @param {Object} context - Shared context for all errors
 * @returns {Object} Batch error summary
 */
export function handleBatchErrors(errors, context = {}) {
    // Import here to avoid circular dependency
    const { classifyError } = require('./error-classifier.js');

    const classifiedErrors = errors.map(error =>
        classifyError(error, context)
    );

    // Group by type
    const grouped = {};
    for (const error of classifiedErrors) {
        if (!grouped[error.type]) {
            grouped[error.type] = [];
        }
        grouped[error.type].push(error);
    }

    // Find highest severity
    const severities = classifiedErrors.map(e => e.severity);
    const maxSeverity = severities.includes(ErrorSeverity.CRITICAL) ? ErrorSeverity.CRITICAL :
                       severities.includes(ErrorSeverity.HIGH) ? ErrorSeverity.HIGH :
                       severities.includes(ErrorSeverity.MEDIUM) ? ErrorSeverity.MEDIUM :
                       ErrorSeverity.LOW;

    // Check if all are recoverable
    const allRecoverable = classifiedErrors.every(e =>
        e.recoverable === ErrorRecoverability.RECOVERABLE ||
        e.recoverable === ErrorRecoverability.RECOVERABLE_WITH_RETRY
    );

    return {
        total: errors.length,
        grouped,
        maxSeverity,
        allRecoverable,
        summary: `${errors.length} error(s) occurred. See details for more information.`,
        errors: classifiedErrors
    };
}
