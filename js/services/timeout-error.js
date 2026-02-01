/**
 * Timeout Error Class (TD-15)
 *
 * Enhanced timeout error with detailed context for better user experience
 * and debugging. Supports different timeout types and retry information.
 *
 * @module services/timeout-error
 */

'use strict';

/**
 * Timeout types for different network operation phases
 * @readonly
 * @enum {string}
 */
export const TimeoutType = {
    CONNECTION: 'connection', // Failed to establish connection
    READ: 'read', // Timeout while reading response
    WRITE: 'write', // Timeout while sending request
    GENERAL: 'general', // General/unknown timeout
};

/**
 * Labels for timeout types (user-friendly)
 * @private
 */
const TIMEOUT_TYPE_LABELS = {
    [TimeoutType.CONNECTION]: 'Connection',
    [TimeoutType.READ]: 'Read',
    [TimeoutType.WRITE]: 'Write',
    [TimeoutType.GENERAL]: 'Request',
};

/**
 * Enhanced Timeout Error Class
 *
 * Provides detailed timeout context including:
 * - Timeout duration
 * - Operation being performed
 * - Provider involved
 * - Retry information
 * - Timeout type (connection/read/write)
 *
 * @example
 * ```javascript
 * throw new TimeoutError('Request timed out', {
 *     timeout: 60000,
 *     operation: 'sendMessage',
 *     provider: 'OpenAI',
 *     retryable: true,
 *     retryAfter: 1000,
 *     timeoutType: 'read'
 * });
 * ```
 */
export class TimeoutError extends Error {
    /**
     * @param {string} message - Error message
     * @param {Object} options - Timeout options
     * @param {number} options.timeout - Timeout duration in milliseconds
     * @param {string} [options.operation] - Operation being performed
     * @param {string} [options.provider] - Provider name
     * @param {boolean} [options.retryable=true] - Whether the operation can be retried
     * @param {number} [options.retryAfter] - Suggested retry delay in milliseconds
     * @param {TimeoutType} [options.timeoutType='general'] - Type of timeout
     * @param {boolean} [options.isLocalProvider=false] - Whether provider is local
     */
    constructor(message, options = {}) {
        super(message);
        this.name = 'TimeoutError';

        // Capture stack trace (V8-specific)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, TimeoutError);
        }

        /**
         * Timeout duration in milliseconds
         * @type {number}
         */
        this.timeout = options.timeout ?? 60000;

        /**
         * Operation being performed when timeout occurred
         * @type {string|undefined}
         */
        this.operation = options.operation;

        /**
         * Provider name (e.g., 'OpenAI', 'Ollama')
         * @type {string|undefined}
         */
        this.provider = options.provider;

        /**
         * Whether the operation can be retried
         * @type {boolean}
         */
        this.retryable = options.retryable ?? true;

        /**
         * Suggested retry delay in milliseconds
         * @type {number|null}
         */
        this.retryAfter = options.retryAfter ?? null;

        /**
         * Type of timeout (connection/read/write/general)
         * @type {TimeoutType}
         */
        this.timeoutType = options.timeoutType ?? TimeoutType.GENERAL;

        /**
         * Whether the provider is local (affects error messaging)
         * @type {boolean}
         */
        this.isLocalProvider = options.isLocalProvider ?? false;
    }

    /**
     * Get user-friendly label for timeout type
     * @returns {string} Label for timeout type
     */
    getTimeoutTypeLabel() {
        return TIMEOUT_TYPE_LABELS[this.timeoutType] || TIMEOUT_TYPE_LABELS[TimeoutType.GENERAL];
    }

    /**
     * Get a user-friendly description of the timeout
     * @returns {string} Description of what timed out
     */
    getDescription() {
        const typeLabel = this.getTimeoutTypeLabel();
        const provider = this.provider ? ` for ${this.provider}` : '';
        const operation = this.operation ? ` during ${this.operation}` : '';

        return `${typeLabel} timeout${provider}${operation}`;
    }

    /**
     * Check if this is a connection timeout
     * @returns {boolean}
     */
    isConnectionTimeout() {
        return this.timeoutType === TimeoutType.CONNECTION;
    }

    /**
     * Check if this is a read timeout
     * @returns {boolean}
     */
    isReadTimeout() {
        return this.timeoutType === TimeoutType.READ;
    }

    /**
     * Check if this is a write timeout
     * @returns {boolean}
     */
    isWriteTimeout() {
        return this.timeoutType === TimeoutType.WRITE;
    }

    /**
     * Convert error to a plain object for serialization
     * @returns {Object} Plain object representation
     */
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            timeout: this.timeout,
            operation: this.operation,
            provider: this.provider,
            retryable: this.retryable,
            retryAfter: this.retryAfter,
            timeoutType: this.timeoutType,
            isLocalProvider: this.isLocalProvider,
            stack: this.stack,
        };
    }

    // ==========================================
    // Static Factory Methods
    // ==========================================

    /**
     * Create a connection timeout error
     * @param {Object} options - Timeout options
     * @returns {TimeoutError}
     */
    static connection(options = {}) {
        return new TimeoutError(options.message || 'Connection timed out', {
            ...options,
            timeoutType: TimeoutType.CONNECTION,
        });
    }

    /**
     * Create a read timeout error
     * @param {Object} options - Timeout options
     * @returns {TimeoutError}
     */
    static read(options = {}) {
        return new TimeoutError(options.message || 'Read operation timed out', {
            ...options,
            timeoutType: TimeoutType.READ,
        });
    }

    /**
     * Create a write timeout error
     * @param {Object} options - Timeout options
     * @returns {TimeoutError}
     */
    static write(options = {}) {
        return new TimeoutError(options.message || 'Write operation timed out', {
            ...options,
            timeoutType: TimeoutType.WRITE,
        });
    }

    /**
     * Create a general timeout error
     * @param {Object} options - Timeout options
     * @returns {TimeoutError}
     */
    static general(options = {}) {
        return new TimeoutError(options.message || 'Request timed out', {
            ...options,
            timeoutType: TimeoutType.GENERAL,
        });
    }

    /**
     * Create a timeout error from an existing error
     * @param {Error} error - Original error
     * @param {Object} options - Additional context
     * @returns {TimeoutError|null}
     */
    static fromError(error, options = {}) {
        if (!error || !(error instanceof Error)) {
            return null;
        }

        // If already a TimeoutError, just merge options
        if (error instanceof TimeoutError) {
            return new TimeoutError(error.message, { ...error.toJSON(), ...options });
        }

        // Check if error message indicates timeout
        const isTimeout =
            error.message.toLowerCase().includes('timeout') ||
            error.message.toLowerCase().includes('timed out');

        if (isTimeout) {
            return new TimeoutError(error.message, { timeout: 60000, ...options });
        }

        return null;
    }
}

// ==========================================
// Type Guard
// ==========================================

/**
 * Check if an error is a TimeoutError instance
 * @param {*} error - Error to check
 * @returns {boolean} True if error is a TimeoutError
 */
export function isTimeoutError(error) {
    return error instanceof TimeoutError;
}

// ==========================================
// User-Friendly Message Generator
// ==========================================

/**
 * Format timeout duration for display
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
export function formatTimeoutDuration(ms) {
    if (ms >= 1000) {
        return `${Math.round(ms / 1000)}s`;
    }
    return `${ms}ms`;
}

/**
 * Generate a user-friendly error message from a TimeoutError
 *
 * Provides context about:
 * - What type of timeout occurred
 * - How long the timeout was
 * - Whether retry is possible
 * - How long to wait before retry
 * - Which provider was involved
 *
 * @param {Error|TimeoutError|string|null} error - Error to format
 * @returns {string} User-friendly error message
 */
export function getUserMessage(error) {
    // Handle null/undefined
    if (!error) {
        return 'An unknown error occurred. Please try again.';
    }

    // Handle string errors
    if (typeof error === 'string') {
        return error;
    }

    // Handle generic Error
    if (!(error instanceof TimeoutError)) {
        return error.message || 'An error occurred. Please try again.';
    }

    /**
     * Get timeout type description
     * @param {TimeoutType} type - Timeout type
     * @returns {string} Description
     */
    const getTimeoutDescription = type => {
        switch (type) {
            case TimeoutType.CONNECTION:
                return 'connecting to the server';
            case TimeoutType.READ:
                return 'reading the response';
            case TimeoutType.WRITE:
                return 'sending your request';
            default:
                return 'processing your request';
        }
    };

    /**
     * Get retry instruction
     * @param {boolean} retryable - Whether retry is allowed
     * @param {number|null} retryAfter - Suggested retry delay
     * @returns {string} Retry instruction
     */
    const getRetryInstruction = (retryable, retryAfter) => {
        if (!retryable) {
            return 'Please contact support if this issue persists.';
        }

        if (retryAfter) {
            const seconds = Math.round(retryAfter / 1000);
            const unit = seconds === 1 ? 'second' : 'seconds';
            return `Please wait ${seconds} ${unit} and try again.`;
        }

        return 'Please try again.';
    };

    // Build user-friendly message
    const duration = formatTimeoutDuration(error.timeout);
    const timeoutDesc = getTimeoutDescription(error.timeoutType);
    const retryInstruction = getRetryInstruction(error.retryable, error.retryAfter);

    // Add provider context if available
    let providerPrefix = '';
    if (error.provider) {
        if (error.isLocalProvider) {
            providerPrefix = `Your local provider (${error.provider}) `;
        } else {
            providerPrefix = `The ${error.provider} provider `;
        }
    } else {
        providerPrefix = 'The service ';
    }

    // Add operation context if available
    let operationContext = '';
    if (error.operation) {
        const formattedOperation = error.operation
            .replace(/([A-Z])/g, ' $1')
            .trim()
            .toLowerCase();
        operationContext = ` while ${formattedOperation}`;
    }

    return (
        `${providerPrefix}timed out after ${duration} ` +
        `while ${timeoutDesc}${operationContext}. ` +
        retryInstruction
    );
}

// ==========================================
// Exports
// ==========================================

export default {
    TimeoutError,
    TimeoutType,
    isTimeoutError,
    getUserMessage,
    formatTimeoutDuration,
};

console.log('[TimeoutError] Module loaded with enhanced timeout error support');
