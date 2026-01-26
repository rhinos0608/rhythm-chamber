/**
 * Centralized Error Handling Utilities
 *
 * Addresses the "Error Handling Sprawl" anti-pattern by providing:
 * - Error classification by type and severity
 * - User-friendly error formatting
 * - Provider-specific error hints and recovery strategies
 * - Standardized error types for consistent handling
 *
 * @module utils/error-handling
 *
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
// Security Constants
// ==========================================

/**
 * Allowlist of safe context fields that won't leak sensitive data
 * Any field NOT in this list will be filtered out from error context
 * @constant {string[]}
 */
const SAFE_CONTEXT_FIELDS = [
    'provider',
    'operation',
    'model',
    'maxTokens',
    'temperature',
    'timestamp',
    'code',
    'status',
    'attempt',
    'maxRetries'
];

/**
 * Regular expression patterns for detecting and redacting sensitive data
 * These patterns match common credential formats in error messages
 * @constant {Object<string,RegExp>}
 */
const SENSITIVE_PATTERNS = {
    // API keys (sk-ant-, sk-or-, sk-proj-, etc.)
    // Matches short keys like sk-ant-1 and long keys like sk-ant-api03-1234567890abcdef
    // Minimum 5 chars after sk- prefix to catch edge cases in tests
    // Uses word boundary to prevent bypasses
    apiKey: /\bsk-[a-zA-Z0-9\-_]{5,}/gi,

    // Bearer tokens (short and long variants)
    // Reduced minimum length to catch shorter tokens in tests
    // More strict pattern to avoid false positives
    bearerToken: /Bearer\s+[a-zA-Z0-9_\-\.=]{5,}/gi,

    // Passwords in various formats
    // Enhanced to catch more variations while avoiding bypasses
    password: /password["']?\s*[:=]\s*["']?[^\s"']{4,}/gi,

    // API key params in URLs
    // More robust pattern to prevent bypasses
    urlApiKey: /[?&]api[_-]?key["']?\s*[:=]\s*["']?[^\s"']{4,}/gi,

    // Token params
    // Enhanced to prevent bypasses
    urlToken: /[?&]token["']?\s*[:=]\s*["']?[^\s"']{4,}/gi,

    // Auth headers
    // More comprehensive pattern
    authHeader: /auth["']?\s*[:=]\s*["']?[^\s"']{4,}/gi,

    // Secret keys
    // Enhanced to prevent bypasses
    secret: /secret["']?\s*[:=]\s*["']?[^\s"']{4,}/gi
};

/**
 * Sanitize a string by redacting sensitive data patterns
 * @param {string} message - The message to sanitize
 * @returns {string} Sanitized message with sensitive data redacted
 */
function sanitizeMessage(message) {
    if (!message || typeof message !== 'string') {
        return message;
    }

    let sanitized = message;

    // Apply all redaction patterns
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.apiKey, '[REDACTED_API_KEY]');
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.bearerToken, 'Bearer [REDACTED_TOKEN]');
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.password, 'password=[REDACTED]');
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.urlApiKey, '?api_key=[REDACTED]');
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.urlToken, '&token=[REDACTED]');
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.authHeader, 'auth=[REDACTED]');
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.secret, 'secret=[REDACTED]');

    return sanitized;
}

/**
 * Sanitize a stack trace by redacting sensitive data patterns
 * Stack traces can contain file paths, URLs with query parameters, and other sensitive data
 * @param {string} stack - The stack trace to sanitize
 * @returns {string} Sanitized stack trace with sensitive data redacted
 */
function sanitizeStack(stack) {
    if (!stack || typeof stack !== 'string') {
        return stack;
    }

    // Apply the same sanitization patterns to stack traces
    // Stack traces can contain API keys in URLs, file paths with sensitive info, etc.
    return sanitizeMessage(stack);
}

/**
 * Filter context metadata to only include safe fields
 * Also sanitizes string values to prevent sensitive data leakage
 * @param {Object} metadata - The metadata object to filter
 * @returns {Object} Filtered metadata with only safe fields and sanitized values
 */
function sanitizeContext(metadata) {
    if (!metadata || typeof metadata !== 'object') {
        return {};
    }

    const sanitized = {};

    for (const [key, value] of Object.entries(metadata)) {
        // Only include fields that are in the allowlist
        if (SAFE_CONTEXT_FIELDS.includes(key)) {
            // Sanitize string values to prevent sensitive data leakage
            if (typeof value === 'string') {
                sanitized[key] = sanitizeMessage(value);
            } else {
                sanitized[key] = value;
            }
        }
    }

    return sanitized;
}

// ==========================================
// Error Type Definitions
// ==========================================

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
    OPERATION_CANCELLED: 'OPERATION_CANCELLED'
};

/**
 * Error severity levels for prioritization
 *
 * @enum {string}
 */
export const ErrorSeverity = {
    CRITICAL: 'CRITICAL',      // System-breaking, requires immediate attention
    HIGH: 'HIGH',             // Major feature impact, user intervention needed
    MEDIUM: 'MEDIUM',         // Degraded experience, workaround available
    LOW: 'LOW',               // Minor issue, cosmetic or informational
    INFO: 'INFO'              // Not an error, just informational
};

/**
 * Error recoverability flag
 * Indicates whether the error can be automatically recovered
 *
 * @enum {string}
 */
export const ErrorRecoverability = {
    RECOVERABLE: 'RECOVERABLE',           // Can retry with same parameters
    RECOVERABLE_WITH_RETRY: 'RECOVERABLE_WITH_RETRY',  // Can retry with modified parameters
    USER_ACTION_REQUIRED: 'USER_ACTION_REQUIRED',      // User must provide input/fix
    NOT_RECOVERABLE: 'NOT_RECOVERABLE'     // Cannot be recovered, must fail
};

// ==========================================
// Provider-Specific Error Patterns
// ==========================================

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
        quotaExceeded: /quota|credits|insufficient.*credits/i
    },
    anthropic: {
        rateLimit: /rate.*limit|429/i,
        invalidKey: /invalid.*key|unauthorized|401/i,
        timeout: /timeout|504/i,
        quotaExceeded: /quota|credits/i
    },
    ollama: {
        connection: /connection.*refused|ECONNREFUSED/i,
        timeout: /timeout/i,
        unavailable: /not.*running|unavailable/i
    },
    lmstudio: {
        connection: /connection.*refused|ECONNREFUSED/i,
        timeout: /timeout/i,
        unavailable: /not.*running|unavailable/i
    },
    gemini: {
        rateLimit: /rate.*limit|quota|429/i,
        invalidKey: /invalid.*key|unauthorized|401|403/i,
        quotaExceeded: /quota|exceeded/i
    }
};

/**
 * Storage backend error patterns
 */
const STORAGE_ERROR_PATTERNS = {
    indexeddb: {
        quotaExceeded: /QuotaExceededError|quota.*exceeded/i,
        transactionFailed: /Transaction.*failed|abort/i,
        unavailable: /IndexedDB.*not.*available|not.*supported/i,
        readOnly: /readonly|read.*only/i,
        corruption: /database.*corruption|invalid.*state/i
    },
    localStorage: {
        quotaExceeded: /QuotaExceededError/i,
        unavailable: /access.*denied|security/i
    }
};

// ==========================================
// Error Classification
// ==========================================

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
 *
 * @example
 * try {
 *   await callLLM(messages);
 * } catch (error) {
 *   const classified = ErrorHandler.classify(error, {
 *     provider: 'openrouter',
 *     operation: 'chat_completion'
 *   });
 *   // Returns: { type: 'LLM_TIMEOUT', severity: 'MEDIUM', recoverable: true, ... }
 * }
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
                context: sanitizeContext({ provider, operation, ...sanitizedMetadata })
            });
        }
    }

    // Try storage-specific classification
    const storageClassification = classifyStorageError(message, name, errorObj);
    if (storageClassification) {
        return createClassifiedError({
            ...storageClassification,
            originalError: errorObj,
            context: sanitizeContext({ provider, operation, ...sanitizedMetadata })
        });
    }

    // Try network-specific classification
    const networkClassification = classifyNetworkError(message, errorObj);
    if (networkClassification) {
        return createClassifiedError({
            ...networkClassification,
            originalError: errorObj,
            context: sanitizeContext({ provider, operation, ...sanitizedMetadata })
        });
    }

    // Try validation-specific classification
    const validationClassification = classifyValidationError(message, operation, errorObj);
    if (validationClassification) {
        return createClassifiedError({
            ...validationClassification,
            originalError: errorObj,
            context: sanitizeContext({ provider, operation, ...sanitizedMetadata })
        });
    }

    // Try transaction-specific classification
    const transactionClassification = classifyTransactionError(message, code, errorObj);
    if (transactionClassification) {
        return createClassifiedError({
            ...transactionClassification,
            originalError: errorObj,
            context: sanitizeContext({ provider, operation, ...sanitizedMetadata })
        });
    }

    // Default to unknown error
    return createClassifiedError({
        type: ErrorType.UNKNOWN_ERROR,
        severity: ErrorSeverity.MEDIUM,
        recoverable: ErrorRecoverability.NOT_RECOVERABLE,
        message: message,
        originalError: errorObj,
        context: sanitizeContext({ provider, operation, ...sanitizedMetadata })
    });
}

/**
 * Normalize various error types to a standard error object
 * SANITIZES error messages to prevent sensitive data leakage
 * @param {Error|string|unknown} error - The error to normalize
 * @returns {Object} Normalized error object with sanitized message
 */
function normalizeError(error) {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: sanitizeMessage(error.message),
            stack: error.stack,
            code: error.code,
            status: error.status
        };
    }

    if (typeof error === 'string') {
        return {
            name: 'Error',
            message: sanitizeMessage(error),
            stack: undefined
        };
    }

    if (error && typeof error === 'object') {
        return {
            name: error.name || error.constructor?.name || 'Error',
            message: sanitizeMessage(error.message || error.toString() || 'Unknown error'),
            stack: error.stack,
            code: error.code,
            status: error.status
        };
    }

    return {
        name: 'Error',
        message: sanitizeMessage(String(error)),
        stack: undefined
    };
}

/**
 * Classify provider-specific errors
 * @param {string} message - Error message
 * @param {string} provider - Provider name
 * @param {Object} errorObj - Normalized error object
 * @returns {Object|null} Classification or null
 */
function classifyProviderError(message, provider, errorObj) {
    const patterns = PROVIDER_ERROR_PATTERNS[provider.toLowerCase()];
    if (!patterns) return null;

    // Rate limit errors
    if (patterns.rateLimit && patterns.rateLimit.test(message)) {
        return {
            type: ErrorType.LLM_RATE_LIMIT,
            severity: ErrorSeverity.MEDIUM,
            recoverable: ErrorRecoverability.RECOVERABLE_WITH_RETRY,
            message: `Rate limit exceeded for ${provider}. Please try again later.`,
            hint: getRateLimitHint(provider)
        };
    }

    // Invalid API key
    if (patterns.invalidKey && patterns.invalidKey.test(message)) {
        return {
            type: ErrorType.LLM_API_KEY_INVALID,
            severity: ErrorSeverity.HIGH,
            recoverable: ErrorRecoverability.USER_ACTION_REQUIRED,
            message: `Invalid API key for ${provider}. Please check your settings.`,
            hint: getInvalidKeyHint(provider)
        };
    }

    // Timeout errors
    if (patterns.timeout && patterns.timeout.test(message)) {
        return {
            type: ErrorType.LLM_TIMEOUT,
            severity: ErrorSeverity.MEDIUM,
            recoverable: ErrorRecoverability.RECOVERABLE_WITH_RETRY,
            message: `Request to ${provider} timed out. Please try again.`,
            hint: 'The service may be experiencing high load. Wait a moment and retry.'
        };
    }

    // Model unavailable
    if (patterns.modelUnavailable && patterns.modelUnavailable.test(message)) {
        return {
            type: ErrorType.LLM_MODEL_UNAVAILABLE,
            severity: ErrorSeverity.HIGH,
            recoverable: ErrorRecoverability.USER_ACTION_REQUIRED,
            message: `The selected model is not available on ${provider}.`,
            hint: 'Please select a different model in settings.'
        };
    }

    // Quota exceeded
    if (patterns.quotaExceeded && patterns.quotaExceeded.test(message)) {
        return {
            type: ErrorType.LLM_QUOTA_EXCEEDED,
            severity: ErrorSeverity.HIGH,
            recoverable: ErrorRecoverability.USER_ACTION_REQUIRED,
            message: `Quota exceeded for ${provider}. Please check your account.`,
            hint: getQuotaExceededHint(provider)
        };
    }

    // Connection errors (for local providers)
    if (patterns.connection && patterns.connection.test(message)) {
        return {
            type: ErrorType.LLM_PROVIDER_ERROR,
            severity: ErrorSeverity.HIGH,
            recoverable: ErrorRecoverability.USER_ACTION_REQUIRED,
            message: `Could not connect to ${provider}.`,
            hint: getConnectionHint(provider)
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
function classifyStorageError(message, name, errorObj) {
    // IndexedDB quota exceeded
    if (name === 'QuotaExceededError' || /quota.*exceeded/i.test(message)) {
        return {
            type: ErrorType.STORAGE_QUOTA_EXCEEDED,
            severity: ErrorSeverity.HIGH,
            recoverable: ErrorRecoverability.USER_ACTION_REQUIRED,
            message: 'Storage quota exceeded. Please clear some data or use a different browser.',
            hint: 'Try clearing old conversations or exporting your data first.'
        };
    }

    // Transaction failed
    if (name === 'TransactionInactiveError' || /transaction.*failed/i.test(message)) {
        return {
            type: ErrorType.STORAGE_TRANSACTION_FAILED,
            severity: ErrorSeverity.MEDIUM,
            recoverable: ErrorRecoverability.RECOVERABLE_WITH_RETRY,
            message: 'Storage transaction failed. Please try again.',
            hint: 'This may be due to browser storage limitations. Try refreshing the page.'
        };
    }

    // IndexedDB unavailable
    if (/indexeddb.*not.*available|not.*supported/i.test(message)) {
        return {
            type: ErrorType.STORAGE_INDEXEDDB_UNAVAILABLE,
            severity: ErrorSeverity.HIGH,
            recoverable: ErrorRecoverability.NOT_RECOVERABLE,
            message: 'IndexedDB is not available in this browser.',
            hint: 'Try using a modern browser like Chrome, Firefox, or Edge.'
        };
    }

    // Read-only mode
    if (/readonly|read.*only|write.*denied/i.test(message)) {
        return {
            type: ErrorType.STORAGE_READ_ONLY,
            severity: ErrorSeverity.MEDIUM,
            recoverable: ErrorRecoverability.USER_ACTION_REQUIRED,
            message: 'Cannot write in read-only mode. Close other tabs to enable editing.',
            hint: 'Multiple tabs may be open. Close other tabs to enable write access.'
        };
    }

    // Fatal state
    if (/fatal.*state|fatal.*error/i.test(message)) {
        return {
            type: ErrorType.STORAGE_FATAL_STATE,
            severity: ErrorSeverity.CRITICAL,
            recoverable: ErrorRecoverability.NOT_RECOVERABLE,
            message: 'Storage system in fatal error state. Please refresh the page.',
            hint: 'If this persists, clear browser data and reload.'
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
function classifyNetworkError(message, errorObj) {
    // Offline
    if (/offline|no.*internet|network.*down/i.test(message)) {
        return {
            type: ErrorType.NETWORK_OFFLINE,
            severity: ErrorSeverity.HIGH,
            recoverable: ErrorRecoverability.RECOVERABLE_WITH_RETRY,
            message: 'No internet connection. Please check your network.',
            hint: 'Check your WiFi or ethernet connection and try again.'
        };
    }

    // Timeout
    if (/timeout|timed.*out|ETIMEDOUT/i.test(message)) {
        return {
            type: ErrorType.NETWORK_TIMEOUT,
            severity: ErrorSeverity.MEDIUM,
            recoverable: ErrorRecoverability.RECOVERABLE_WITH_RETRY,
            message: 'Network request timed out. Please try again.',
            hint: 'The network may be slow. Wait a moment and retry.'
        };
    }

    // Connection refused
    if (/ECONNREFUSED|connection.*refused/i.test(message)) {
        return {
            type: ErrorType.NETWORK_CONNECTION_REFUSED,
            severity: ErrorSeverity.HIGH,
            recoverable: ErrorRecoverability.RECOVERABLE_WITH_RETRY,
            message: 'Connection refused. The service may be down.',
            hint: 'Check if the service is running and accessible.'
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
function classifyValidationError(message, operation, errorObj) {
    // Missing required parameter
    if (/missing.*required|required.*parameter/i.test(message)) {
        return {
            type: ErrorType.VALIDATION_MISSING_REQUIRED,
            severity: ErrorSeverity.MEDIUM,
            recoverable: ErrorRecoverability.NOT_RECOVERABLE,
            message: `Missing required parameter for ${operation || 'operation'}.`,
            hint: 'Please check that all required fields are provided.'
        };
    }

    // Invalid type
    if (/expected.*type|invalid.*type|type.*mismatch/i.test(message)) {
        return {
            type: ErrorType.VALIDATION_INVALID_TYPE,
            severity: ErrorSeverity.MEDIUM,
            recoverable: ErrorRecoverability.NOT_RECOVERABLE,
            message: 'Invalid parameter type.',
            hint: 'Please check the parameter types and try again.'
        };
    }

    // Invalid format
    if (/invalid.*format|format.*invalid/i.test(message)) {
        return {
            type: ErrorType.VALIDATION_INVALID_FORMAT,
            severity: ErrorSeverity.MEDIUM,
            recoverable: ErrorRecoverability.NOT_RECOVERABLE,
            message: 'Invalid parameter format.',
            hint: 'Please check the parameter format (e.g., date, email, JSON).'
        };
    }

    // Schema mismatch
    if (/schema.*validation|schema.*mismatch/i.test(message)) {
        return {
            type: ErrorType.VALIDATION_SCHEMA_MISMATCH,
            severity: ErrorSeverity.MEDIUM,
            recoverable: ErrorRecoverability.NOT_RECOVERABLE,
            message: 'Data schema validation failed.',
            hint: 'The data structure does not match the expected schema.'
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
function classifyTransactionError(message, code, errorObj) {
    // Nested transaction
    if (code === 'NESTED_TRANSACTION_NOT_SUPPORTED' || /nested.*transaction/i.test(message)) {
        return {
            type: ErrorType.TRANSACTION_NESTED_NOT_SUPPORTED,
            severity: ErrorSeverity.HIGH,
            recoverable: ErrorRecoverability.NOT_RECOVERABLE,
            message: 'Nested transactions are not supported.',
            hint: 'Please move this operation outside the current transaction context.'
        };
    }

    // Transaction timeout
    if (/transaction.*timeout|timed.*out/i.test(message)) {
        return {
            type: ErrorType.TRANSACTION_TIMEOUT,
            severity: ErrorSeverity.MEDIUM,
            recoverable: ErrorRecoverability.RECOVERABLE_WITH_RETRY,
            message: 'Transaction timed out.',
            hint: 'The operation may have hung due to an unresponsive storage backend.'
        };
    }

    // Rollback failed
    if (/rollback.*failed/i.test(message)) {
        return {
            type: ErrorType.TRANSACTION_ROLLBACK_FAILED,
            severity: ErrorSeverity.CRITICAL,
            recoverable: ErrorRecoverability.NOT_RECOVERABLE,
            message: 'Transaction rollback failed. Data may be inconsistent.',
            hint: 'Please refresh the page and check for data corruption.'
        };
    }

    // Prepare phase failed
    if (/prepare.*failed|prepare.*phase/i.test(message)) {
        return {
            type: ErrorType.TRANSACTION_PREPARE_FAILED,
            severity: ErrorSeverity.HIGH,
            recoverable: ErrorRecoverability.NOT_RECOVERABLE,
            message: 'Transaction preparation failed.',
            hint: 'A backend validation check failed. Please check your data.'
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
        timestamp: new Date().toISOString()
    };
}

// ==========================================
// Provider-Specific Hints
// ==========================================

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
        gemini: 'Rate limit reached. Please wait before making more requests.'
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
        gemini: 'Check your Gemini API key in Settings. Get one at console.cloud.google.com'
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
        gemini: 'Check your Gemini API quota at console.cloud.google.com'
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
        openrouter: 'Check your internet connection and API key.'
    };
    return hints[provider.toLowerCase()] || 'Check your connection and settings.';
}

// ==========================================
// Error Formatting
// ==========================================

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
 *
 * @example
 * const classified = ErrorHandler.classify(error, { provider: 'openrouter' });
 * const userMessage = ErrorHandler.formatForUser(classified);
 * // Returns: "**Connection Error**\n\nRate limit exceeded.\n\n💡 Tip: Wait a moment..."
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
 *
 * @example
 * const classified = ErrorHandler.classify(error);
 * console.error(ErrorHandler.formatForLog(classified));
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
 *
 * @example
 * const classified = ErrorHandler.classify(error);
 * showToast(ErrorHandler.formatForToast(classified), 5000);
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

// ==========================================
// Error Logging
// ==========================================

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
 *
 * @example
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   const classified = ErrorHandler.classify(error);
 *   ErrorHandler.log(classified);
 * }
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

// ==========================================
// Error Recovery
// ==========================================

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
 *
 * @example
 * const classified = ErrorHandler.classify(error, { provider: 'openrouter' });
 * if (classified.recoverable === ErrorRecoverability.RECOVERABLE) {
 *   const recovered = await ErrorHandler.attemptRecovery(classified, {
 *     maxRetries: 3,
 *     retryCallback: () => callLLM(messages)
 *   });
 *   if (recovered.success) {
 *     console.log('Operation succeeded on retry');
 *   }
 * }
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

// ==========================================
// Error Type Guards
// ==========================================

/**
 * Check if an error is of a specific type
 * @param {ClassifiedError} classifiedError - The error to check
 * @param {string} errorType - The error type to check against
 * @returns {boolean} True if error matches type
 *
 * @example
 * if (ErrorHandler.isType(classified, ErrorType.LLM_RATE_LIMIT)) {
 *   // Handle rate limit specifically
 * }
 */
export function isType(classifiedError, errorType) {
    return classifiedError?.type === errorType;
}

/**
 * Check if an error is critical or high severity
 * @param {ClassifiedError} classifiedError - The error to check
 * @returns {boolean} True if error is critical or high
 *
 * @example
 * if (ErrorHandler.isSevere(classified)) {
 *   // Notify user immediately
 *   showToast(ErrorHandler.formatForToast(classified), 0); // Don't auto-hide
 * }
 */
export function isSevere(classifiedError) {
    return classifiedError?.severity === ErrorSeverity.CRITICAL ||
           classifiedError?.severity === ErrorSeverity.HIGH;
}

/**
 * Check if an error is recoverable (automatic or with retry)
 * @param {ClassifiedError} classifiedError - The error to check
 * @returns {boolean} True if error can be recovered
 *
 * @example
 * if (ErrorHandler.isRecoverable(classified)) {
 *   const recovered = await ErrorHandler.attemptRecovery(classified, {
 *     retryCallback: () => operation()
 *   });
 * }
 */
export function isRecoverable(classifiedError) {
    return classifiedError?.recoverable === ErrorRecoverability.RECOVERABLE ||
           classifiedError?.recoverable === ErrorRecoverability.RECOVERABLE_WITH_RETRY;
}

/**
 * Check if an error requires user action
 * @param {ClassifiedError} classifiedError - The error to check
 * @returns {boolean} True if user action is required
 *
 * @example
 * if (ErrorHandler.requiresUserAction(classified)) {
 *   // Show detailed error dialog with instructions
 *   showErrorModal(classified);
 * }
 */
export function requiresUserAction(classifiedError) {
    return classifiedError?.recoverable === ErrorRecoverability.USER_ACTION_REQUIRED;
}

// ==========================================
// Batch Error Handling
// ==========================================

/**
 * Handle multiple errors from batch operations
 * Aggregates and summarizes errors for batch operations
 *
 * @param {Array<Error>} errors - Array of errors to handle
 * @param {Object} context - Shared context for all errors
 * @returns {Object} Batch error summary
 *
 * @example
 * const results = await Promise.allSettled(operations);
 * const errors = results
 *   .filter(r => r.status === 'rejected')
 *   .map(r => r.reason);
 * const batchError = ErrorHandler.handleBatchErrors(errors, { operation: 'batch_import' });
 */
export function handleBatchErrors(errors, context = {}) {
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

// ==========================================
// Public API
// ==========================================

/**
 * Centralized error handling utilities
 * Provides classification, formatting, logging, and recovery strategies
 */
export const ErrorHandler = {
    // Core classification
    classify: classifyError,

    // Formatting
    formatForUser,
    formatForLog,
    formatForToast,

    // Logging
    log,

    // Recovery
    attemptRecovery,

    // Type guards
    isType,
    isSevere,
    isRecoverable,
    requiresUserAction,

    // Batch handling
    handleBatchErrors,

    // Constants
    ErrorType,
    ErrorSeverity,
    ErrorRecoverability
};

// ES Module export
export default ErrorHandler;
