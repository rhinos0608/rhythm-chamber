/**
 * Storage Security Utilities
 *
 * Shared security checks for storage operations.
 * Provides centralized security enforcement for write operations.
 *
 * @module storage/security
 */

import { Crypto } from '../security/crypto.js';

/**
 * Assert that write operations are allowed in the current context.
 * This is a security check to prevent data corruption in non-secure contexts.
 *
 * @param {string} operation - Operation name for error message
 * @param {string} [moduleName='Storage'] - Module name for error message
 * @throws {Error} If not in secure context (HTTPS or localhost)
 * @private
 */
export function assertWriteAllowed(operation, moduleName = 'Storage') {
    if (!Crypto.isSecureContext()) {
        throw new Error(
            `[${moduleName}] Write blocked: not in secure context. ` +
                `Operation '${operation}' requires HTTPS or localhost.`
        );
    }
}
