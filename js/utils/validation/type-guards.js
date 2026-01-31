/**
 * Type Guards Module
 *
 * Provides type checking utilities for runtime type validation.
 * These functions help determine the type of values at runtime,
 * which is essential for validation, error handling, and type safety.
 *
 * @module validation/type-guards
 */

// ==========================================
// Type Guards
// ==========================================

/**
 * Check if a value is a non-null object
 * @param {*} value - Value to check
 * @returns {boolean} True if value is a non-null object
 *
 * @example
 * if (isObject(data)) {
 *   console.log(data.property);
 * }
 */
export function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if a value is a plain object (not null, not array, not a special object)
 * @param {*} value - Value to check
 * @returns {boolean} True if value is a plain object
 *
 * @example
 * if (isPlainObject(config)) {
 *   // Safe to mutate
 *   config.newProperty = 'value';
 * }
 */
export function isPlainObject(value) {
    if (!isObject(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === null || proto === Object.prototype;
}

/**
 * Check if a value is an array
 * @param {*} value - Value to check
 * @returns {boolean} True if value is an array
 *
 * @example
 * if (isArray(items)) {
 *   items.forEach(item => console.log(item));
 * }
 */
export function isArray(value) {
    return Array.isArray(value);
}

/**
 * Check if a value is a non-empty string
 * @param {*} value - Value to check
 * @returns {boolean} True if value is a non-empty string
 *
 * @example
 * if (isNonEmptyString(input)) {
 *   processInput(input);
 * }
 */
export function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Check if a value is a function
 * @param {*} value - Value to check
 * @returns {boolean} True if value is a function
 *
 * @example
 * if (isFunction(callback)) {
 *   callback();
 * }
 */
export function isFunction(value) {
    return typeof value === 'function';
}

/**
 * Check if a value is a promise
 * @param {*} value - Value to check
 * @returns {boolean} True if value is a promise
 *
 * @example
 * if (isPromise(result)) {
 *   await result;
 * }
 */
export function isPromise(value) {
    return isObject(value) && isFunction(value.then);
}

// ==========================================
// Utilities
// ==========================================

/**
 * Ensure value is a number with fallback
 * Converts string numbers to numeric type, returns fallback for invalid values
 *
 * @param {*} value - Value to convert
 * @param {number} [fallback=0] - Fallback value if conversion fails
 * @returns {number} Parsed number or fallback
 * @throws {TypeError} If fallback is not a finite number
 *
 * @example
 * const count = ensureNumber(userInput, 0);
 * const size = ensureNumber(config.size, 10);
 * const timeout = ensureNumber(config.timeout, 5000);
 */
export function ensureNumber(value, fallback = 0) {
    // Validate fallback parameter - it must be a finite number
    if (typeof fallback !== 'number' || !Number.isFinite(fallback)) {
        throw new TypeError(
            `ensureNumber fallback must be a finite number, received ${typeof fallback}: ${fallback}`
        );
    }

    // Fast path: already a valid finite number
    if (typeof value === 'number') {
        if (Number.isFinite(value)) {
            return value;
        }
        // Handle special number values (NaN, Infinity, -Infinity)
        // These are technically numbers but not valid for most use cases
        if (Number.isNaN(value)) {
            return fallback;
        }
        if (!Number.isFinite(value)) {
            // Infinity or -Infinity
            return fallback;
        }
        return fallback;
    }

    // Convert string to number
    if (typeof value === 'string') {
        // Trim whitespace first
        const trimmed = value.trim();

        // Empty string after trimming is invalid
        if (trimmed === '') {
            return fallback;
        }

        // Use Number() for conversion (handles decimal, hex, octal, scientific notation)
        const parsed = Number(trimmed);

        // Check if conversion produced a valid finite number
        if (Number.isNaN(parsed)) {
            return fallback;
        }
        if (!Number.isFinite(parsed)) {
            return fallback;
        }

        // Additional safety: ensure the entire string was consumed
        // This prevents partial matches like "123abc" from being parsed as 123
        // However, Number() already handles this correctly - it returns NaN for "123abc"
        // So we only need to verify the result is valid

        return parsed;
    }

    // All other types (null, undefined, boolean, object, array, etc.) use fallback
    return fallback;
}
