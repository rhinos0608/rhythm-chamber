/**
 * Centralized Error Handling Utilities
 *
 * This is a FACADE that re-exports all error handling functionality
 * from focused modules. Maintains backward compatibility with existing imports.
 *
 * Module structure:
 * - error-sanitizer: Security and data redaction
 * - error-classifier: Error classification and type definitions
 * - error-formatter: Message formatting for different contexts
 * - error-recovery: Recovery logic and batch handling
 *
 * @module utils/error-handling
 * @example
 * import { ErrorHandler, ErrorTypes, ErrorSeverity } from './utils/error-handling.js';
 *
 * try {
 *   await someOperation();
 * } catch (error) {
 *   const classified = ErrorHandler.classify(error);
 *   const userMessage = ErrorHandler.formatForUser(classified);
 *   ErrorHandler.log(classified);
 *   if (classified.recoverable) {
 *     const recovered = await ErrorHandler.attemptRecovery(classified);
 *   }
 * }
 */

// ==========================================
// Import all modules for re-export
// ==========================================

// Error Sanitization
export {
    sanitizeMessage,
    sanitizeStack,
    sanitizeContext,
    SENSITIVE_PATTERNS,
    SAFE_CONTEXT_FIELDS
} from './error-handling/error-sanitizer.js';

// Error Classification
export {
    classifyError,
    normalizeError,
    classifyProviderError,
    classifyStorageError,
    classifyNetworkError,
    classifyValidationError,
    classifyTransactionError,
    ErrorType,
    ErrorSeverity,
    ErrorRecoverability
} from './error-handling/error-classifier.js';

// Error Formatting
export {
    formatForUser,
    formatForLog,
    formatForToast
} from './error-handling/error-formatter.js';

// Error Recovery
export {
    log,
    attemptRecovery,
    isType,
    isSevere,
    isRecoverable,
    requiresUserAction,
    handleBatchErrors
} from './error-handling/error-recovery.js';

// ==========================================
// Import for ErrorHandler namespace
// ==========================================

import {
    classifyError as _classifyError,
    ErrorType as _ErrorType,
    ErrorSeverity as _ErrorSeverity,
    ErrorRecoverability as _ErrorRecoverability
} from './error-handling/error-classifier.js';

import {
    formatForUser as _formatForUser,
    formatForLog as _formatForLog,
    formatForToast as _formatForToast
} from './error-handling/error-formatter.js';

import {
    log as _log,
    attemptRecovery as _attemptRecovery,
    isType as _isType,
    isSevere as _isSevere,
    isRecoverable as _isRecoverable,
    requiresUserAction as _requiresUserAction,
    handleBatchErrors as _handleBatchErrors
} from './error-handling/error-recovery.js';

// ==========================================
// Public API - ErrorHandler namespace
// ==========================================

/**
 * Centralized error handling utilities
 * Provides classification, formatting, logging, and recovery strategies
 */
export const ErrorHandler = {
    // Core classification
    classify: _classifyError,

    // Formatting
    formatForUser: _formatForUser,
    formatForLog: _formatForLog,
    formatForToast: _formatForToast,

    // Logging
    log: _log,

    // Recovery
    attemptRecovery: _attemptRecovery,

    // Type guards
    isType: _isType,
    isSevere: _isSevere,
    isRecoverable: _isRecoverable,
    requiresUserAction: _requiresUserAction,

    // Batch handling
    handleBatchErrors: _handleBatchErrors,

    // Constants
    ErrorType: _ErrorType,
    ErrorSeverity: _ErrorSeverity,
    ErrorRecoverability: _ErrorRecoverability
};

// ES Module export
export default ErrorHandler;
