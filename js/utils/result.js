/**
 * Result Type for Consistent Error Handling
 *
 * Provides a Result pattern for functions that can fail.
 * This pattern encourages explicit error handling and makes
 * success/failure paths clear and type-safe.
 *
 * @module utils/result
 * @example
 * import { Result, Ok, Err } from './utils/result.js';
 *
 * function divide(a, b) {
 *     if (b === 0) {
 *         return Err('Division by zero', { a, b });
 *     }
 *     return Ok(a / b);
 * }
 *
 * const result = divide(10, 2);
 * if (result.ok) {
 *     console.log(result.value); // 5
 * } else {
 *     console.error(result.error);
 * }
 */

/**
 * Creates a successful Result
 * @template T
 * @param {T} data - The successful result data
 * @returns {{ success: true, data: T, ok: true }}
 */
export function Ok(data) {
    return {
        success: true,
        data,
        ok: true,
        isOk: () => true,
        isErr: () => false,
        map: fn => Ok(fn(data)),
        mapErr: fn => Ok(data),
        andThen: fn => fn(data),
        orElse: fn => Ok(data),
        unwrap: () => data,
        unwrapOr: () => data,
        unwrapOrElse: () => data,
        match: patterns => patterns.ok?.(data) ?? patterns._?.(data),
    };
}

/**
 * Creates a failed Result
 * @template E
 * @param {E} error - The error value
 * @param {Object} context - Optional context about the error
 * @returns {{ success: false, error: E, context: Object, ok: false }}
 */
export function Err(error, context = {}) {
    return {
        success: false,
        error,
        context,
        ok: false,
        isOk: () => false,
        isErr: () => true,
        map: fn => Err(error, context),
        mapErr: fn => Err(fn(error), context),
        andThen: fn => Err(error, context),
        orElse: fn => fn(error, context),
        unwrap: () => {
            throw new Error(String(error));
        },
        unwrapOr: defaultValue => defaultValue,
        unwrapOrElse: fn => fn(error, context),
        match: patterns => patterns.err?.(error, context) ?? patterns._?.(error, context),
    };
}

/**
 * Result class for static factory methods
 * Provides a convenient namespace for creating Results
 */
export const Result = {
    /**
     * Creates a successful Result
     * @template T
     * @param {T} data - The successful result data
     * @returns {{ success: true, data: T, ok: true }}
     */
    success: Ok,

    /**
     * Creates a failed Result
     * @template E
     * @param {E} error - The error value
     * @param {Object} context - Optional context about the error
     * @returns {{ success: false, error: E, context: Object, ok: false }}
     */
    failure: Err,

    /**
     * Creates a successful Result (alias for success)
     */
    ok: Ok,

    /**
     * Creates a failed Result (alias for failure)
     */
    error: Err,

    /**
     * Wraps a synchronous function that may throw
     * @template T, R
     * @param {(...args: T[]) => R} fn - Function to wrap
     * @returns {(...args: T[]) => Result<R, Error>}
     */
    wrapSync(fn) {
        return (...args) => {
            try {
                return Ok(fn(...args));
            } catch (e) {
                return Err(e);
            }
        };
    },

    /**
     * Wraps an async function that may throw
     * @template T, R
     * @param {(...args: T[]) => Promise<R>} fn - Function to wrap
     * @returns {(...args: T[]) => Promise<Result<R, Error>>}
     */
    wrapAsync(fn) {
        return async (...args) => {
            try {
                return Ok(await fn(...args));
            } catch (e) {
                return Err(e);
            }
        };
    },

    /**
     * Combines multiple Results into one
     * Returns Ok if all Results are Ok, otherwise returns the first Err
     * @template T
     * @param {Array<Result<T, Error>>} results - Array of Results to combine
     * @returns {Result<Array<T>, Error>}
     */
    all(results) {
        const values = [];
        for (const result of results) {
            if (!result.ok) {
                return result; // Return first error
            }
            values.push(result.data);
        }
        return Ok(values);
    },

    /**
     * Combines multiple Results, collecting all errors
     * @template T
     * @param {Array<Result<T, Error>>} results - Array of Results to combine
     * @returns {Result<Array<T>, Array<Error>>}
     */
    allWithErrors(results) {
        const values = [];
        const errors = [];
        for (const result of results) {
            if (result.ok) {
                values.push(result.data);
            } else {
                errors.push(result.error);
            }
        }
        return errors.length > 0 ? Err(errors, { count: errors.length }) : Ok(values);
    },

    /**
     * Type guard for successful Results
     * @template T, E
     * @param {Result<T, E>} result - Result to check
     * @returns {result is { success: true, data: T, ok: true }}
     */
    isOk(result) {
        return result?.ok === true;
    },

    /**
     * Type guard for failed Results
     * @template T, E
     * @param {Result<T, E>} result - Result to check
     * @returns {result is { success: false, error: E, ok: false }}
     */
    isErr(result) {
        return result?.ok === false;
    },

    /**
     * Converts a promise to a Result
     * @template T
     * @param {Promise<T>} promise - Promise to convert
     * @returns {Promise<Result<T, Error>>}
     */
    fromPromise(promise) {
        return promise.then(Ok).catch(Err);
    },
};

export default Result;
