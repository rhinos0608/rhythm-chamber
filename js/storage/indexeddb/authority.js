/**
 * Write Authority Enforcement (HNW)
 *
 * Implements write authority checks to ensure only the primary tab
 * can perform write operations. This prevents conflicts in multi-tab scenarios.
 *
 * @module storage/indexeddb/authority
 */

import { TabCoordinator } from '../../services/tab-coordination.js';
import { AUTHORITY_CONFIG } from './config.js';

/**
 * Check write authority before performing write operation
 * HNW Hierarchy: Ensures only primary tab can write
 *
 * @param {string} storeName - Store being written to
 * @param {string} operation - Operation name (for logging)
 * @returns {boolean} True if write is allowed
 * @throws {Error} In strict mode, throws if write not allowed
 */
export function checkWriteAuthority(storeName, operation) {
    // Skip check if disabled
    if (!AUTHORITY_CONFIG.enforceWriteAuthority) {
        return true;
    }

    // Skip check for exempt stores
    if (AUTHORITY_CONFIG.exemptStores.has(storeName)) {
        return true;
    }

    // Check with TabCoordinator
    const isAllowed = TabCoordinator?.isWriteAllowed?.() ?? true;

    if (!isAllowed) {
        const message = `[IndexedDB] Write authority denied for ${operation} on ${storeName}. Tab is in read-only mode.`;

        if (AUTHORITY_CONFIG.strictMode) {
            const error = new Error(message);
            error.code = 'WRITE_AUTHORITY_DENIED';
            error.storeName = storeName;
            error.operation = operation;
            throw error;
        } else {
            console.warn(message);
            return false;
        }
    }

    return true;
}
