/**
 * Write-Ahead Log Entry Factory
 *
 * Factory function for creating WAL entries.
 * Ensures consistent entry structure across the system.
 *
 * @module storage/write-ahead-log/entry-factory
 */

import { walState } from './state.js';
import { WalPriority, WalStatus } from './config.js';

/**
 * Create a WAL entry with proper structure
 *
 * @param {string} operation - Operation name
 * @param {Array} args - Operation arguments
 * @param {string} [priority=WalPriority.NORMAL] - Priority level
 * @returns {Object} WAL entry
 */
export function createWalEntry(operation, args, priority = WalPriority.NORMAL) {
    return {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        sequence: walState.sequence++,
        operation,
        args,
        priority,
        status: WalStatus.PENDING,
        createdAt: Date.now(),
        processedAt: null,
        attempts: 0,
        error: null,
    };
}

/**
 * Validate WAL entry structure
 * @param {Object} entry - Entry to validate
 * @returns {boolean} True if entry has valid structure
 */
export function isValidEntry(entry) {
    return (
        entry &&
        typeof entry.id === 'string' &&
        typeof entry.sequence === 'number' &&
        typeof entry.operation === 'string' &&
        Array.isArray(entry.args) &&
        typeof entry.priority === 'string' &&
        typeof entry.status === 'string' &&
        typeof entry.createdAt === 'number' &&
        typeof entry.attempts === 'number'
    );
}
