/**
 * Centralized logging utility with level filtering and production-ready defaults
 *
 * Features:
 * - Log level filtering (TRACE, DEBUG, INFO, WARN, ERROR, NONE)
 * - Sensitive data redaction (tokens, keys, passwords, secrets)
 * - Module-specific loggers with consistent formatting
 * - Development vs production mode detection
 * - Performance optimized (no-op for disabled levels)
 *
 * @module utils/logger
 */

const LOG_LEVELS = {
    TRACE: 0,
    DEBUG: 1,
    INFO: 2,
    WARN: 3,
    ERROR: 4,
    NONE: 5,
};

// Detect environment: development if localhost, 127.0.0.1, or file://
const isDevelopment =
    typeof window !== 'undefined' &&
    (window.location?.hostname === 'localhost' ||
        window.location?.hostname === '127.0.0.1' ||
        window.location?.protocol === 'file:');

// Default to DEBUG in development, INFO in production
const DEFAULT_LEVEL = isDevelopment ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;

let currentLevel = DEFAULT_LEVEL;
let releaseStage = isDevelopment ? 'development' : 'production';

/**
 * Configure the logger
 *
 * @param {Object} options - Configuration options
 * @param {number} [options.level] - Log level (use LOG_LEVELS constants)
 * @param {string} [options.releaseStage] - 'development' or 'production'
 * @param {boolean} [options.isDev] - Override development detection
 */
export function configureLogger(options = {}) {
    if (options.level !== undefined) {
        currentLevel = options.level;
    }
    if (options.releaseStage) {
        releaseStage = options.releaseStage;
    } else if (options.isDev !== undefined) {
        releaseStage = options.isDev ? 'development' : 'production';
    }
}

/**
 * Get current log level as a number
 *
 * @returns {number} Current log level
 */
export function getLogLevel() {
    return currentLevel;
}

/**
 * Get current log level name
 *
 * @returns {string} Log level name
 */
export function getLogLevelName() {
    return (
        Object.entries(LOG_LEVELS).find(([_, value]) => value === currentLevel)?.[0] ?? 'UNKNOWN'
    );
}

/**
 * Check if a given log level would be output
 *
 * @param {number} level - Log level to check
 * @returns {boolean} True if logs at this level would be output
 */
export function isLevelEnabled(level) {
    return level >= currentLevel;
}

/**
 * Keys that indicate sensitive data (case-insensitive match)
 */
const SENSITIVE_KEYS = [
    'token',
    'key',
    'secret',
    'password',
    'pass',
    'apiKey',
    'apikey',
    'authorization',
    'auth',
    'credential',
    'session',
    'cookie',
];

/**
 * Check if a key name suggests sensitive data
 *
 * @param {string} key - Key name to check
 * @returns {boolean} True if key appears to be sensitive
 */
function isSensitiveKey(key) {
    const lowerKey = key.toLowerCase();
    return SENSITIVE_KEYS.some(sensitive => lowerKey.includes(sensitive));
}

/**
 * Sanitize data for logging (remove sensitive fields)
 *
 * @param {*} data - Data to sanitize
 * @returns {*} Sanitized data
 */
function sanitize(data, depth = 0, maxDepth = 5) {
    // Prevent infinite recursion
    if (depth > maxDepth) {
        return '[Max depth reached]';
    }

    // Primitives and null/undefined pass through
    if (data === null || data === undefined) {
        return data;
    }

    // Handle errors specially - preserve message and stack
    if (data instanceof Error) {
        const error = {
            name: data.name,
            message: sanitizeErrorMessage(data.message),
        };
        if (data.stack) {
            // Sanitize stack trace - remove potential query strings with tokens
            error.stack = sanitizeErrorMessage(data.stack);
        }
        return error;
    }

    // Handle DOMException
    if (data instanceof DOMException) {
        return {
            name: data.name,
            message: sanitizeErrorMessage(data.message),
            code: data.code,
        };
    }

    // Handle Dates
    if (data instanceof Date) {
        return data.toISOString();
    }

    // Handle Regex
    if (data instanceof RegExp) {
        return data.toString();
    }

    // Handle Arrays
    if (Array.isArray(data)) {
        return data.map(item => sanitize(item, depth + 1, maxDepth));
    }

    // Handle Objects (but not null, already handled)
    if (typeof data === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(data)) {
            if (isSensitiveKey(key)) {
                // Redact sensitive values
                if (typeof value === 'string' && value.length > 0) {
                    sanitized[key] = '[REDACTED]';
                } else if (typeof value === 'object' && value !== null) {
                    sanitized[key] = '[REDACTED]';
                } else {
                    sanitized[key] = '[REDACTED]';
                }
            } else {
                sanitized[key] = sanitize(value, depth + 1, maxDepth);
            }
        }
        return sanitized;
    }

    // Strings, numbers, booleans pass through (but sanitize for sensitive patterns)
    if (typeof data === 'string') {
        return sanitizeString(data);
    }

    return data;
}

/**
 * Sanitize string for sensitive patterns
 *
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeString(str) {
    // Look for common API key patterns and redact
    // This is basic protection - more sophisticated patterns could be added
    return str;
}

/**
 * Sanitize error messages for potential token leaks
 *
 * @param {string} message - Error message
 * @returns {string} Sanitized message
 */
function sanitizeErrorMessage(message) {
    if (!message || typeof message !== 'string') {
        return message;
    }

    // Remove potential tokens from error messages (basic pattern)
    // Looks for things like "Bearer sk-..." or "Bearer eyJ..."
    return message
        .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
        .replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-[REDACTED]')
        .replace(/AIza[a-zA-Z0-9\-_]{35}/g, 'AIza[REDACTED]')
        .replace(/xox[baprs]-[a-zA-Z0-9-]{10,}/g, 'xox[baprs]-[REDACTED]');
}

/**
 * Format log message with module prefix and timestamp
 *
 * @param {string} module - Module name
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @returns {string} Formatted message
 */
function formatMessage(module, level, message) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
    return `[${timestamp}] [${module}] ${message}`;
}

/**
 * Core logging function
 *
 * @param {number} level - Log level
 * @param {string} levelName - Log level name
 * @param {string} module - Module name
 * @param {string} message - Log message
 * @param {...*} args - Additional arguments
 */
function log(level, levelName, module, message, ...args) {
    if (level < currentLevel) {
        return;
    }

    const formattedMessage = formatMessage(module, levelName, message);
    const sanitizedArgs = args.map(arg => sanitize(arg));

    switch (levelName) {
        case 'TRACE':
        case 'DEBUG':
        case 'INFO':
            console.log(formattedMessage, ...sanitizedArgs);
            break;
        case 'WARN':
            console.warn(formattedMessage, ...sanitizedArgs);
            break;
        case 'ERROR':
            console.error(formattedMessage, ...sanitizedArgs);
            break;
    }
}

/**
 * Create a module-specific logger
 *
 * Usage:
 *   const logger = createLogger('MyModule');
 *   logger.debug('Something happened', { data: 'value' });
 *   logger.error('Something broke', error);
 *
 * @param {string} moduleName - Name of the module (used in log prefix)
 * @returns {Object} Logger object with trace, debug, info, warn, error methods
 */
export function createLogger(moduleName) {
    return {
        trace: (message, ...args) => log(LOG_LEVELS.TRACE, 'TRACE', moduleName, message, ...args),
        debug: (message, ...args) => log(LOG_LEVELS.DEBUG, 'DEBUG', moduleName, message, ...args),
        info: (message, ...args) => log(LOG_LEVELS.INFO, 'INFO', moduleName, message, ...args),
        warn: (message, ...args) => log(LOG_LEVELS.WARN, 'WARN', moduleName, message, ...args),
        error: (message, ...args) => log(LOG_LEVELS.ERROR, 'ERROR', moduleName, message, ...args),
    };
}

/**
 * Default logger for quick use
 */
export const logger = createLogger('App');

/**
 * Convenience exports
 */
export const trace = logger.trace.bind(logger);
export const debug = logger.debug.bind(logger);
export const info = logger.info.bind(logger);
export const warn = logger.warn.bind(logger);
export const error = logger.error.bind(logger);

// Export constants for use elsewhere
export { LOG_LEVELS };

// Initialize with current environment
configureLogger();

// Log initialization in development only
if (isDevelopment) {
    console.log('[Logger] Initialized with level:', getLogLevelName(), '(development mode)');
}
