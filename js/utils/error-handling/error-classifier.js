/**
 * Error Classification Module
 *
 * Analyzes raw errors and classifies them into standardized types
 * Supports provider-specific, storage, network, validation, and transaction errors
 *
 * @module utils/error-handling/error-classifier
 */

import { sanitizeMessage, sanitizeContext } from './error-sanitizer.js';

/**
 * Standard error types across the application
 * Each type has specific handling logic and user messaging
 *
 * @enum {string}
 */
export const ErrorType = {
    // LLM Provider Errors
    LLM_PROVIDER_ERROR: 'LLM_PROVIDER_ERROR',
    LLM_TIMEOUT: 'LLM_TIMEOUT',
    LLM_RATE_LIMIT: 'LLM_RATE_LIMIT',
    LLM_QUOTA_EXCEEDED: 'LLM_QUOTA_EXCEEDED',
    LLM_INVALID_RESPONSE: 'LLM_INVALID_RESPONSE',
    LLM_API_KEY_INVALID: 'LLM_API_KEY_INVALID',
    LLM_MODEL_UNAVAILABLE: 'LLM_MODEL_UNAVAILABLE',

    // Storage Errors
    STORAGE_QUOTA_EXCEEDED: 'STORAGE_QUOTA_EXCEEDED',
    STORAGE_TRANSACTION_FAILED: 'STORAGE_TRANSACTION_FAILED',
    STORAGE_INDEXEDDB_UNAVAILABLE: 'STORAGE_INDEXEDDB_UNAVAILABLE',
    STORAGE_READ_ONLY: 'STORAGE_READ_ONLY',
    STORAGE_CORRUPTION: 'STORAGE_CORRUPTION',
    STORAGE_FATAL_STATE: 'STORAGE_FATAL_STATE',

    // Network Errors
    NETWORK_OFFLINE: 'NETWORK_OFFLINE',
    NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
    NETWORK_CONNECTION_REFUSED: 'NETWORK_CONNECTION_REFUSED',
    NETWORK_DNS_FAILURE: 'NETWORK_DNS_FAILURE',

    // Validation Errors
    VALIDATION_MISSING_REQUIRED: 'VALIDATION_MISSING_REQUIRED',
    VALIDATION_INVALID_TYPE: 'VALIDATION_INVALID_TYPE',
    VALIDATION_INVALID_FORMAT: 'VALIDATION_INVALID_FORMAT',
    VALIDATION_OUT_OF_RANGE: 'VALIDATION_OUT_OF_RANGE',
    VALIDATION_SCHEMA_MISMATCH: 'VALIDATION_SCHEMA_MISMATCH',

    // Transaction Errors
    TRANSACTION_NESTED_NOT_SUPPORTED: 'TRANSACTION_NESTED_NOT_SUPPORTED',
    TRANSACTION_TIMEOUT: 'TRANSACTION_TIMEOUT',
    TRANSACTION_ROLLBACK_FAILED: 'TRANSACTION_ROLLBACK_FAILED',
    TRANSACTION_PREPARE_FAILED: 'TRANSACTION_PREPARE_FAILED',

    // Authorization Errors
    AUTH_WRITE_DENIED: 'AUTH_WRITE_DENIED',
    AUTH_TAB_COORDINATION: 'AUTH_TAB_COORDINATION',

    // Configuration Errors
    CONFIG_MISSING: 'CONFIG_MISSING',
    CONFIG_INVALID: 'CONFIG_INVALID',

    // Generic Errors
    UNKNOWN_ERROR: 'UNKNOWN_ERROR',
    OPERATION_CANCELLED: 'OPERATION_CANCELLED',
};

/**
 * Error severity levels for prioritization
 *
 * @enum {string}
 */
export const ErrorSeverity = {
    CRITICAL: 'CRITICAL', // System-breaking, requires immediate attention
    HIGH: 'HIGH', // Major feature impact, user intervention needed
    MEDIUM: 'MEDIUM', // Degraded experience, workaround available
    LOW: 'LOW', // Minor issue, cosmetic or informational
    INFO: 'INFO', // Not an error, just informational
};

/**
 * Error recoverability flag
 * Indicates whether the error can be automatically recovered
 *
 * @enum {string}
 */
export const ErrorRecoverability = {
    RECOVERABLE: 'RECOVERABLE', // Can retry with same parameters
    RECOVERABLE_WITH_RETRY: 'RECOVERABLE_WITH_RETRY', // Can retry with modified parameters
    USER_ACTION_REQUIRED: 'USER_ACTION_REQUIRED', // User must provide input/fix
    NOT_RECOVERABLE: 'NOT_RECOVERABLE', // Cannot be recovered, must fail
};

/**
 * Error pattern signatures for different LLM providers
 * Used to classify raw errors from provider APIs
 */
const PROVIDER_ERROR_PATTERNS = {
    openrouter: {
        rateLimit: /rate.*limit|quota.*exceeded|429/i,
        invalidKey: /invalid.*key|unauthorized|401/i,
        timeout: /timeout|request.*timeout|504/i,
        modelUnavailable: /model.*not.*found|model.*unavailable|400/i,
        quotaExceeded: /quota|credits|insufficient.*credits/i,
    },
    anthropic: {
        rateLimit: /rate.*limit|429/i,
        invalidKey: /invalid.*key|unauthorized|401/i,
        timeout: /timeout|504/i,
        quotaExceeded: /quota|credits/i,
    },
    ollama: {
        connection: /connection.*refused|ECONNREFUSED/i,
        timeout: /timeout/i,
        unavailable: /not.*running|unavailable/i,
    },
    lmstudio: {
        connection: /connection.*refused|ECONNREFUSED/i,
        timeout: /timeout/i,
        unavailable: /not.*running|unavailable/i,
    },
    gemini: {
        rateLimit: /rate.*limit|quota|429/i,
        invalidKey: /invalid.*key|unauthorized|401|403/i,
        quotaExceeded: /quota|exceeded/i,
    },
};

/**
 * Classify a raw error into a standardized error object
 * Analyzes error message, type, and context to determine category
 * SANITIZES context metadata to prevent sensitive data leakage
 *
 * @param {Error|string|unknown} error - The error to classify
 * @param {Object} context - Additional context for classification
 * @param {string} [context.provider] - LLM provider name (if applicable)
 * @param {string} [context.operation] - Operation being performed
 * @param {Object} [context.metadata] - Additional metadata (will be sanitized)
 * @returns {ClassifiedError} Standardized error object
 */
export function classifyError(error, context = {}) {
    const { provider, operation, metadata = {} } = context;

    // Normalize error to object
    const errorObj = normalizeError(error);

    // Extract error details
    const message = errorObj.message || String(error);
    const name = errorObj.name || 'Error';
    const code = errorObj.code || errorObj.status;

    // Sanitize metadata to only include safe fields
    const sanitizedMetadata = sanitizeContext(metadata);

    // Try provider-specific classification first
    if (provider) {
        const providerClassification = classifyProviderError(message, provider, errorObj);
        if (providerClassification) {
            return createClassifiedError({
                ...providerClassification,
                originalError: errorObj,
                context: sanitizeContext({ provider, operation, ...sanitizedMetadata }),
            });
        }
    }

    // Try storage-specific classification
    const storageClassification = classifyStorageError(message, name, errorObj);
    if (storageClassification) {
        return createClassifiedError({
            ...storageClassification,
            originalError: errorObj,
            context: sanitizeContext({ provider, operation, ...sanitizedMetadata }),
        });
    }

    // Try network-specific classification
    const networkClassification = classifyNetworkError(message, errorObj);
    if (networkClassification) {
        return createClassifiedError({
            ...networkClassification,
            originalError: errorObj,
            context: sanitizeContext({ provider, operation, ...sanitizedMetadata }),
        });
    }

    // Try validation-specific classification
    const validationClassification = classifyValidationError(message, operation, errorObj);
    if (validationClassification) {
        return createClassifiedError({
            ...validationClassification,
            originalError: errorObj,
            context: sanitizeContext({ provider, operation, ...sanitizedMetadata }),
        });
    }

    // Try transaction-specific classification
    const transactionClassification = classifyTransactionError(message, code, errorObj);
    if (transactionClassification) {
        return createClassifiedError({
            ...transactionClassification,
            originalError: errorObj,
            context: sanitizeContext({ provider, operation, ...sanitizedMetadata }),
        });
    }

    // Default to unknown error
    return createClassifiedError({
        type: ErrorType.UNKNOWN_ERROR,
        severity: ErrorSeverity.MEDIUM,
        recoverable: ErrorRecoverability.NOT_RECOVERABLE,
        message: message,
        originalError: errorObj,
        context: sanitizeContext({ provider, operation, ...sanitizedMetadata }),
    });
}

/**
 * Normalize various error types to a standard error object
 * SANITIZES error messages to prevent sensitive data leakage
 * @param {Error|string|unknown} error - The error to normalize
 * @returns {Object} Normalized error object with sanitized message
 */
export function normalizeError(error) {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: sanitizeMessage(error.message),
            stack: error.stack,
            code: error.code,
            status: error.status,
        };
    }

    if (typeof error === 'string') {
        return {
            name: 'Error',
            message: sanitizeMessage(error),
            stack: undefined,
        };
    }

    if (error && typeof error === 'object') {
        return {
            name: error.name || error.constructor?.name || 'Error',
            message: sanitizeMessage(error.message || error.toString() || 'Unknown error'),
            stack: error.stack,
            code: error.code,
            status: error.status,
        };
    }

    return {
        name: 'Error',
        message: sanitizeMessage(String(error)),
        stack: undefined,
    };
}

/**
 * Classify provider-specific errors
 * @param {string} message - Error message
 * @param {string} provider - Provider name
 * @param {Object} errorObj - Normalized error object
 * @returns {Object|null} Classification or null
 */
export function classifyProviderError(message, provider, errorObj) {
    const patterns = PROVIDER_ERROR_PATTERNS[provider.toLowerCase()];
    if (!patterns) return null;

    // Rate limit errors
    if (patterns.rateLimit && patterns.rateLimit.test(message)) {
        return {
            type: ErrorType.LLM_RATE_LIMIT,
            severity: ErrorSeverity.MEDIUM,
            recoverable: ErrorRecoverability.RECOVERABLE_WITH_RETRY,
            message: `Rate limit exceeded for ${provider}. Please try again later.`,
            hint: getRateLimitHint(provider),
        };
    }

    // Invalid API key
    if (patterns.invalidKey && patterns.invalidKey.test(message)) {
        return {
            type: ErrorType.LLM_API_KEY_INVALID,
            severity: ErrorSeverity.HIGH,
            recoverable: ErrorRecoverability.USER_ACTION_REQUIRED,
            message: `Invalid API key for ${provider}. Please check your settings.`,
            hint: getInvalidKeyHint(provider),
        };
    }

    // Timeout errors
    if (patterns.timeout && patterns.timeout.test(message)) {
        return {
            type: ErrorType.LLM_TIMEOUT,
            severity: ErrorSeverity.MEDIUM,
            recoverable: ErrorRecoverability.RECOVERABLE_WITH_RETRY,
            message: `Request to ${provider} timed out. Please try again.`,
            hint: 'The service may be experiencing high load. Wait a moment and retry.',
        };
    }

    // Model unavailable
    if (patterns.modelUnavailable && patterns.modelUnavailable.test(message)) {
        return {
            type: ErrorType.LLM_MODEL_UNAVAILABLE,
            severity: ErrorSeverity.HIGH,
            recoverable: ErrorRecoverability.USER_ACTION_REQUIRED,
            message: `The selected model is not available on ${provider}.`,
            hint: 'Please select a different model in settings.',
        };
    }

    // Quota exceeded
    if (patterns.quotaExceeded && patterns.quotaExceeded.test(message)) {
        return {
            type: ErrorType.LLM_QUOTA_EXCEEDED,
            severity: ErrorSeverity.HIGH,
            recoverable: ErrorRecoverability.USER_ACTION_REQUIRED,
            message: `Quota exceeded for ${provider}. Please check your account.`,
            hint: getQuotaExceededHint(provider),
        };
    }

    // Connection errors (for local providers)
    if (patterns.connection && patterns.connection.test(message)) {
        return {
            type: ErrorType.LLM_PROVIDER_ERROR,
            severity: ErrorSeverity.HIGH,
            recoverable: ErrorRecoverability.USER_ACTION_REQUIRED,
            message: `Could not connect to ${provider}.`,
            hint: getConnectionHint(provider),
        };
    }

    return null;
}

/**
 * Classify storage-specific errors
 * @param {string} message - Error message
 * @param {string} name - Error name
 * @param {Object} errorObj - Normalized error object
 * @returns {Object|null} Classification or null
 */
export function classifyStorageError(message, name, errorObj) {
    // IndexedDB quota exceeded
    if (name === 'QuotaExceededError' || /quota.*exceeded/i.test(message)) {
        return {
            type: ErrorType.STORAGE_QUOTA_EXCEEDED,
            severity: ErrorSeverity.HIGH,
            recoverable: ErrorRecoverability.USER_ACTION_REQUIRED,
            message: 'Storage quota exceeded. Please clear some data or use a different browser.',
            hint: 'Try clearing old conversations or exporting your data first.',
        };
    }

    // Transaction failed
    if (name === 'TransactionInactiveError' || /transaction.*failed/i.test(message)) {
        return {
            type: ErrorType.STORAGE_TRANSACTION_FAILED,
            severity: ErrorSeverity.MEDIUM,
            recoverable: ErrorRecoverability.RECOVERABLE_WITH_RETRY,
            message: 'Storage transaction failed. Please try again.',
            hint: 'This may be due to browser storage limitations. Try refreshing the page.',
        };
    }

    // IndexedDB unavailable
    if (/indexeddb.*not.*available|not.*supported/i.test(message)) {
        return {
            type: ErrorType.STORAGE_INDEXEDDB_UNAVAILABLE,
            severity: ErrorSeverity.HIGH,
            recoverable: ErrorRecoverability.NOT_RECOVERABLE,
            message: 'IndexedDB is not available in this browser.',
            hint: 'Try using a modern browser like Chrome, Firefox, or Edge.',
        };
    }

    // Read-only mode
    if (/readonly|read.*only|write.*denied/i.test(message)) {
        return {
            type: ErrorType.STORAGE_READ_ONLY,
            severity: ErrorSeverity.MEDIUM,
            recoverable: ErrorRecoverability.USER_ACTION_REQUIRED,
            message: 'Cannot write in read-only mode. Close other tabs to enable editing.',
            hint: 'Multiple tabs may be open. Close other tabs to enable write access.',
        };
    }

    // Fatal state
    if (/fatal.*state|fatal.*error/i.test(message)) {
        return {
            type: ErrorType.STORAGE_FATAL_STATE,
            severity: ErrorSeverity.CRITICAL,
            recoverable: ErrorRecoverability.NOT_RECOVERABLE,
            message: 'Storage system in fatal error state. Please refresh the page.',
            hint: 'If this persists, clear browser data and reload.',
        };
    }

    return null;
}

/**
 * Classify network-specific errors
 * @param {string} message - Error message
 * @param {Object} errorObj - Normalized error object
 * @returns {Object|null} Classification or null
 */
export function classifyNetworkError(message, errorObj) {
    // Offline
    if (/offline|no.*internet|network.*down/i.test(message)) {
        return {
            type: ErrorType.NETWORK_OFFLINE,
            severity: ErrorSeverity.HIGH,
            recoverable: ErrorRecoverability.RECOVERABLE_WITH_RETRY,
            message: 'No internet connection. Please check your network.',
            hint: 'Check your WiFi or ethernet connection and try again.',
        };
    }

    // Timeout
    if (/timeout|timed.*out|ETIMEDOUT/i.test(message)) {
        return {
            type: ErrorType.NETWORK_TIMEOUT,
            severity: ErrorSeverity.MEDIUM,
            recoverable: ErrorRecoverability.RECOVERABLE_WITH_RETRY,
            message: 'Network request timed out. Please try again.',
            hint: 'The network may be slow. Wait a moment and retry.',
        };
    }

    // Connection refused
    if (/ECONNREFUSED|connection.*refused/i.test(message)) {
        return {
            type: ErrorType.NETWORK_CONNECTION_REFUSED,
            severity: ErrorSeverity.HIGH,
            recoverable: ErrorRecoverability.RECOVERABLE_WITH_RETRY,
            message: 'Connection refused. The service may be down.',
            hint: 'Check if the service is running and accessible.',
        };
    }

    return null;
}

/**
 * Classify validation-specific errors
 * @param {string} message - Error message
 * @param {string} operation - Operation being performed
 * @param {Object} errorObj - Normalized error object
 * @returns {Object|null} Classification or null
 */
export function classifyValidationError(message, operation, errorObj) {
    // Missing required parameter
    if (/missing.*required|required.*parameter/i.test(message)) {
        return {
            type: ErrorType.VALIDATION_MISSING_REQUIRED,
            severity: ErrorSeverity.MEDIUM,
            recoverable: ErrorRecoverability.NOT_RECOVERABLE,
            message: `Missing required parameter for ${operation || 'operation'}.`,
            hint: 'Please check that all required fields are provided.',
        };
    }

    // Invalid type
    if (/expected.*type|invalid.*type|type.*mismatch/i.test(message)) {
        return {
            type: ErrorType.VALIDATION_INVALID_TYPE,
            severity: ErrorSeverity.MEDIUM,
            recoverable: ErrorRecoverability.NOT_RECOVERABLE,
            message: 'Invalid parameter type.',
            hint: 'Please check the parameter types and try again.',
        };
    }

    // Invalid format
    if (/invalid.*format|format.*invalid/i.test(message)) {
        return {
            type: ErrorType.VALIDATION_INVALID_FORMAT,
            severity: ErrorSeverity.MEDIUM,
            recoverable: ErrorRecoverability.NOT_RECOVERABLE,
            message: 'Invalid parameter format.',
            hint: 'Please check the parameter format (e.g., date, email, JSON).',
        };
    }

    // Schema mismatch
    if (/schema.*validation|schema.*mismatch/i.test(message)) {
        return {
            type: ErrorType.VALIDATION_SCHEMA_MISMATCH,
            severity: ErrorSeverity.MEDIUM,
            recoverable: ErrorRecoverability.NOT_RECOVERABLE,
            message: 'Data schema validation failed.',
            hint: 'The data structure does not match the expected schema.',
        };
    }

    return null;
}

/**
 * Classify transaction-specific errors
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @param {Object} errorObj - Normalized error object
 * @returns {Object|null} Classification or null
 */
export function classifyTransactionError(message, code, errorObj) {
    // Nested transaction
    if (code === 'NESTED_TRANSACTION_NOT_SUPPORTED' || /nested.*transaction/i.test(message)) {
        return {
            type: ErrorType.TRANSACTION_NESTED_NOT_SUPPORTED,
            severity: ErrorSeverity.HIGH,
            recoverable: ErrorRecoverability.NOT_RECOVERABLE,
            message: 'Nested transactions are not supported.',
            hint: 'Please move this operation outside the current transaction context.',
        };
    }

    // Transaction timeout
    if (/transaction.*timeout|timed.*out/i.test(message)) {
        return {
            type: ErrorType.TRANSACTION_TIMEOUT,
            severity: ErrorSeverity.MEDIUM,
            recoverable: ErrorRecoverability.RECOVERABLE_WITH_RETRY,
            message: 'Transaction timed out.',
            hint: 'The operation may have hung due to an unresponsive storage backend.',
        };
    }

    // Rollback failed
    if (/rollback.*failed/i.test(message)) {
        return {
            type: ErrorType.TRANSACTION_ROLLBACK_FAILED,
            severity: ErrorSeverity.CRITICAL,
            recoverable: ErrorRecoverability.NOT_RECOVERABLE,
            message: 'Transaction rollback failed. Data may be inconsistent.',
            hint: 'Please refresh the page and check for data corruption.',
        };
    }

    // Prepare phase failed
    if (/prepare.*failed|prepare.*phase/i.test(message)) {
        return {
            type: ErrorType.TRANSACTION_PREPARE_FAILED,
            severity: ErrorSeverity.HIGH,
            recoverable: ErrorRecoverability.NOT_RECOVERABLE,
            message: 'Transaction preparation failed.',
            hint: 'A backend validation check failed. Please check your data.',
        };
    }

    return null;
}

/**
 * Create a standardized classified error object
 * @param {Object} classification - Error classification
 * @returns {ClassifiedError} Standardized error object
 */
function createClassifiedError(classification) {
    return {
        type: classification.type,
        severity: classification.severity,
        recoverable: classification.recoverable,
        message: classification.message,
        hint: classification.hint || null,
        originalError: classification.originalError,
        context: classification.context || {},
        timestamp: new Date().toISOString(),
    };
}

/**
 * Get provider-specific hint for rate limit errors
 * @param {string} provider - Provider name
 * @returns {string} Helpful hint
 */
function getRateLimitHint(provider) {
    const hints = {
        openrouter: 'You may have exceeded your rate limit. Wait a moment or upgrade your plan.',
        anthropic: 'Rate limit reached. Please wait before making more requests.',
        ollama: 'Local Ollama server is overloaded. Try reducing concurrent requests.',
        lmstudio: 'Local LM Studio server is overloaded. Try reducing concurrent requests.',
        gemini: 'Rate limit reached. Please wait before making more requests.',
    };
    return hints[provider.toLowerCase()] || 'Please wait before retrying.';
}

/**
 * Get provider-specific hint for invalid API key errors
 * @param {string} provider - Provider name
 * @returns {string} Helpful hint
 */
function getInvalidKeyHint(provider) {
    const hints = {
        openrouter: 'Check your OpenRouter API key in Settings. Get one at openrouter.ai/keys',
        anthropic: 'Check your Anthropic API key in Settings. Get one at console.anthropic.com',
        gemini: 'Check your Gemini API key in Settings. Get one at console.cloud.google.com',
    };
    return hints[provider.toLowerCase()] || 'Check your API key in Settings.';
}

/**
 * Get provider-specific hint for quota exceeded errors
 * @param {string} provider - Provider name
 * @returns {string} Helpful hint
 */
function getQuotaExceededHint(provider) {
    const hints = {
        openrouter: 'Check your OpenRouter credits at openrouter.ai/keys',
        anthropic: 'Check your Anthropic usage at console.anthropic.com',
        gemini: 'Check your Gemini API quota at console.cloud.google.com',
    };
    return hints[provider.toLowerCase()] || 'Check your account quota.';
}

/**
 * Get provider-specific hint for connection errors
 * @param {string} provider - Provider name
 * @returns {string} Helpful hint
 */
function getConnectionHint(provider) {
    const hints = {
        ollama: 'Ensure Ollama is running. Try `ollama serve` in terminal.',
        lmstudio: 'Check that LM Studio server is enabled in the app.',
        gemini: 'Check your internet connection and API key.',
        openrouter: 'Check your internet connection and API key.',
    };
    return hints[provider.toLowerCase()] || 'Check your connection and settings.';
}
