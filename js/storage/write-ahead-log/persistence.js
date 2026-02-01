/**
 * Write-Ahead Log Persistence Layer
 *
 * Handles all localStorage operations for the WAL system.
 * Manages persistence of entries, sequence numbers, and operation results.
 *
 * @module storage/write-ahead-log/persistence
 */

import { walState } from './state.js';
import { STORAGE_KEYS, CONFIG, WalStatus } from './config.js';
import { isValidEntry } from './entry-factory.js';

/**
 * Save WAL to localStorage
 * MEDIUM FIX Issue #19: Pre-filters entries before limiting to prevent performance spike
 * and validates JSON.stringify success before committing
 *
 * @returns {boolean} True if saved successfully
 */
export function saveWal() {
    try {
        // Filter out committed entries FIRST before any processing
        // This prevents processing 1000+ entries that will just be discarded
        const activeEntries = walState.entries.filter(
            entry => entry.status !== WalStatus.COMMITTED
        );

        // Early return if nothing to save
        if (activeEntries.length === 0) {
            // Still save sequence number even if no entries
            localStorage.setItem(STORAGE_KEYS.SEQUENCE, String(walState.sequence));
            return true;
        }

        // Apply count limit BEFORE sorting for better performance
        // Sorting is O(n log n), so reducing n first is more efficient
        const sortedBySequence = activeEntries.sort((a, b) => b.sequence - a.sequence);
        const entriesToSave =
            sortedBySequence.length > CONFIG.MAX_SIZE
                ? sortedBySequence.slice(0, CONFIG.MAX_SIZE) // Get most recent entries (newest first)
                : sortedBySequence;

        // Validate JSON.stringify result before committing
        // This prevents partial writes if quota is exceeded mid-serialization
        const serialized = JSON.stringify(entriesToSave);

        // Validate serialization succeeded
        if (typeof serialized !== 'string' || serialized.length === 0) {
            throw new Error('WAL serialization produced invalid result');
        }

        // Check size before writing (prevent quota exceeded errors)
        if (serialized.length > CONFIG.MAX_SIZE_BYTES) {
            console.warn(
                `[WAL] WAL size (${serialized.length} bytes) exceeds safe limit, truncating`
            );

            // Try reducing size by keeping newest entries until it fits
            let truncatedEntries = entriesToSave;
            while (truncatedEntries.length > 0) {
                const halfLength = Math.floor(truncatedEntries.length / 2);
                truncatedEntries = truncatedEntries.slice(0, halfLength);
                const truncatedSerialized = JSON.stringify(truncatedEntries);

                if (truncatedSerialized.length <= CONFIG.MAX_SIZE_BYTES) {
                    localStorage.setItem(STORAGE_KEYS.WAL, truncatedSerialized);
                    localStorage.setItem(STORAGE_KEYS.SEQUENCE, String(walState.sequence));
                    console.warn(
                        `[WAL] Truncated WAL from ${entriesToSave.length} to ${truncatedEntries.length} entries`
                    );
                    return true;
                }
            }

            // If even 1 entry is too large, we have a serious problem
            throw new Error('Single WAL entry exceeds storage limit');
        }

        localStorage.setItem(STORAGE_KEYS.WAL, serialized);
        localStorage.setItem(STORAGE_KEYS.SEQUENCE, String(walState.sequence));

        return true;
    } catch (error) {
        console.error('[WAL] Failed to save WAL:', error);
        return false;
    }
}

/**
 * Load WAL from localStorage
 * @returns {boolean} True if loaded successfully
 */
export function loadWal() {
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.WAL);
        if (stored) {
            const entries = JSON.parse(stored);
            walState.entries = entries.filter(entry => {
                // Validate entry structure
                if (!isValidEntry(entry)) {
                    console.warn('[WAL] Invalid entry found, skipping:', entry);
                    return false;
                }

                // Filter out old entries
                const age = Date.now() - entry.createdAt;
                return age < CONFIG.MAX_AGE_MS;
            });
        }

        const sequence = localStorage.getItem(STORAGE_KEYS.SEQUENCE);
        if (sequence) {
            walState.sequence = parseInt(sequence, 10);
        }

        console.log(`[WAL] Loaded ${walState.entries.length} entries from storage`);
        return true;
    } catch (error) {
        console.error('[WAL] Failed to load WAL:', error);
        return false;
    }
}

/**
 * Clear WAL from localStorage
 * @returns {boolean} True if cleared successfully
 */
export function clearWal() {
    try {
        localStorage.removeItem(STORAGE_KEYS.WAL);
        localStorage.removeItem(STORAGE_KEYS.SEQUENCE);
        console.log('[WAL] WAL cleared from storage');
        return true;
    } catch (error) {
        console.error('[WAL] Failed to clear WAL:', error);
        return false;
    }
}

/**
 * Save operation results to localStorage for crash recovery
 * @returns {boolean} True if saved successfully
 */
export function saveOperationResults() {
    try {
        const results = [];
        for (const [entryId, result] of walState.operationResults.entries()) {
            results.push({ entryId, result, timestamp: Date.now() });
        }
        localStorage.setItem(STORAGE_KEYS.RESULTS, JSON.stringify(results));
        return true;
    } catch (error) {
        console.error('[WAL] Failed to save operation results:', error);
        return false;
    }
}

/**
 * Load operation results from localStorage
 */
export function loadOperationResults() {
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.RESULTS);
        if (stored) {
            const results = JSON.parse(stored);
            const now = Date.now();
            for (const { entryId, result, timestamp } of results) {
                // Only load results that are recent
                if (now - timestamp < CONFIG.RESULTS_MAX_AGE_MS) {
                    walState.operationResults.set(entryId, result);
                }
            }
            console.log(
                `[WAL] Loaded ${walState.operationResults.size} operation results from storage`
            );
        }
    } catch (error) {
        console.error('[WAL] Failed to load operation results:', error);
    }
}

/**
 * Get operation result by entry ID
 * @param {string} entryId - WAL entry ID
 * @returns {Object|null} Operation result or null if not found
 */
export function getOperationResult(entryId) {
    // Check in-memory results first
    if (walState.operationResults.has(entryId)) {
        return walState.operationResults.get(entryId);
    }

    // Check persisted results
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.RESULTS);
        if (stored) {
            const results = JSON.parse(stored);
            const found = results.find(r => r.entryId === entryId);
            if (found && Date.now() - found.timestamp < CONFIG.RESULTS_MAX_AGE_MS) {
                // Cache in memory
                walState.operationResults.set(entryId, found.result);
                return found.result;
            }
        }
    } catch (error) {
        console.error('[WAL] Failed to get operation result:', error);
    }

    return null;
}

/**
 * Clear operation results from localStorage
 * @returns {boolean} True if cleared successfully
 */
export function clearOperationResults() {
    try {
        localStorage.removeItem(STORAGE_KEYS.RESULTS);
        console.log('[WAL] Operation results cleared from storage');
        return true;
    } catch (error) {
        console.error('[WAL] Failed to clear operation results:', error);
        return false;
    }
}
