/**
 * Error Formatting Module
 *
 * Formats classified errors for different display contexts
 * Supports user-friendly messages, logging, and toast notifications
 *
 * @module utils/error-handling/error-formatter
 */

import { ErrorSeverity, ErrorType } from './error-classifier.js';
import { sanitizeMessage, sanitizeStack } from './error-sanitizer.js';

/**
 * Format a classified error for display to users
 * Provides user-friendly messages with actionable hints
 *
 * @param {ClassifiedError} classifiedError - The classified error to format
 * @param {Object} options - Formatting options
 * @param {boolean} [options.includeHint=true] - Include recovery hint
 * @param {boolean} [options.includeSeverity=true] - Include severity indicator
 * @param {boolean} [options.includeTimestamp=false] - Include timestamp
 * @returns {string} Formatted error message for user display
 */
export function formatForUser(classifiedError, options = {}) {
    const {
        includeHint = true,
        includeSeverity = true,
        includeTimestamp = false
    } = options;

    let message = '';

    // Add severity indicator
    if (includeSeverity) {
        const severityIcons = {
            [ErrorSeverity.CRITICAL]: '🔴',
            [ErrorSeverity.HIGH]: '⚠️',
            [ErrorSeverity.MEDIUM]: '⚡',
            [ErrorSeverity.LOW]: 'ℹ️',
            [ErrorSeverity.INFO]: '💡'
        };
        message += `${severityIcons[classifiedError.severity] || '⚠️'} `;
    }

    // Add error type in human-readable form
    const errorTypeLabel = classifiedError.type
        .replace(/_/g, ' ')
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    message += `**${errorTypeLabel}**\n\n`;
    message += `${classifiedError.message}\n`;

    // Add hint if available
    if (includeHint && classifiedError.hint) {
        message += `\n💡 **Tip:** ${classifiedError.hint}`;
    }

    // Add timestamp if requested
    if (includeTimestamp && classifiedError.timestamp) {
        const date = new Date(classifiedError.timestamp);
        message += `\n\n_Time: ${date.toLocaleTimeString()}_`;
    }

    return message;
}

/**
 * Format a classified error for logging
 * Provides detailed technical information for debugging
 * SANITIZES originalMessage and originalStack to prevent sensitive data leakage
 *
 * @param {ClassifiedError} classifiedError - The classified error to format
 * @returns {Object} Formatted error object for logging
 */
export function formatForLog(classifiedError) {
    return {
        type: classifiedError.type,
        severity: classifiedError.severity,
        recoverable: classifiedError.recoverable,
        message: classifiedError.message,
        originalMessage: sanitizeMessage(classifiedError.originalError?.message),
        originalStack: sanitizeStack(classifiedError.originalError?.stack),
        context: classifiedError.context,
        timestamp: classifiedError.timestamp
    };
}

/**
 * Format a classified error for toast notifications
 * Provides a short, concise message suitable for temporary display
 *
 * @param {ClassifiedError} classifiedError - The classified error to format
 * @returns {string} Short error message for toast
 */
export function formatForToast(classifiedError) {
    // Short, concise message for toast notifications
    const shortMessages = {
        [ErrorType.LLM_RATE_LIMIT]: 'Rate limit exceeded. Please wait.',
        [ErrorType.LLM_API_KEY_INVALID]: 'Invalid API key. Check settings.',
        [ErrorType.LLM_TIMEOUT]: 'Request timed out. Please retry.',
        [ErrorType.STORAGE_QUOTA_EXCEEDED]: 'Storage full. Clear old data.',
        [ErrorType.NETWORK_OFFLINE]: 'No internet connection.',
        [ErrorType.NETWORK_TIMEOUT]: 'Network timeout. Please retry.',
        [ErrorType.VALIDATION_MISSING_REQUIRED]: 'Missing required information.',
        [ErrorType.TRANSACTION_TIMEOUT]: 'Operation timed out. Please retry.'
    };

    return shortMessages[classifiedError.type] ||
           classifiedError.message.split('\n')[0].substring(0, 100);
}
