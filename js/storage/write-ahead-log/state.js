/**
 * Write-Ahead Log State Management
 *
 * Central state object for the WAL system.
 * Provides a single source of truth for WAL state.
 *
 * @module storage/write-ahead-log/state
 */

import { WalStatus } from './config.js';

/**
 * WAL state object
 * Encapsulates all mutable state for the WAL system
 */
export const walState = {
    entries: [], // Array of WAL entries
    sequence: 0, // Current sequence number
    isProcessing: false, // Is WAL being processed
    isReplaying: false, // Is WAL being replayed
    lastReplayTime: 0, // Last time WAL was replayed
    batchTimeout: null, // Batch processing timeout
    cleanupInterval: null, // Cleanup interval
    operationResults: new Map(), // Track operation results for crash recovery
};

/**
 * Reset WAL state to initial values
 * Useful for testing and cleanup
 */
export function resetState() {
    walState.entries = [];
    walState.sequence = 0;
    walState.isProcessing = false;
    walState.isReplaying = false;
    walState.lastReplayTime = 0;
    walState.batchTimeout = null;
    walState.cleanupInterval = null;
    walState.operationResults.clear();
}

/**
 * Check if WAL is currently processing or replaying
 * @returns {boolean} True if WAL is busy
 */
export function isWalBusy() {
    return walState.isProcessing || walState.isReplaying;
}

/**
 * Get pending entry count
 * @returns {number} Number of pending entries
 */
export function getPendingCount() {
    return walState.entries.filter(
        entry => entry.status === WalStatus.PENDING || entry.status === WalStatus.FAILED
    ).length;
}
