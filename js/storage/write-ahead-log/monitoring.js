/**
 * Write-Ahead Log Monitoring
 *
 * Provides statistics, monitoring, and maintenance for the WAL system.
 * Tracks health and performance metrics.
 *
 * @module storage/write-ahead-log/monitoring
 */

import { walState } from './state.js';
import { CONFIG, WalStatus } from './config.js';
import { cleanupWal } from './batch-processor.js';

/**
 * Get WAL statistics
 * @returns {Object} WAL statistics
 */
export function getWalStats() {
    const stats = {
        totalEntries: walState.entries.length,
        pending: 0,
        processing: 0,
        committed: 0,
        failed: 0,
        isProcessing: walState.isProcessing,
        isReplaying: walState.isReplaying,
        lastReplayTime: walState.lastReplayTime,
        sequence: walState.sequence
    };

    for (const entry of walState.entries) {
        stats[entry.status]++;
    }

    return stats;
}

/**
 * Start WAL monitoring and cleanup
 */
export function startMonitoring() {
    // Cleanup interval - run every 5 minutes
    walState.cleanupInterval = setInterval(() => {
        cleanupWal();
    }, CONFIG.CLEANUP_INTERVAL_MS);

    console.log('[WAL] Monitoring started');
}

/**
 * Stop WAL monitoring
 */
export function stopMonitoring() {
    if (walState.cleanupInterval) {
        clearInterval(walState.cleanupInterval);
        walState.cleanupInterval = null;
    }

    if (walState.batchTimeout) {
        clearTimeout(walState.batchTimeout);
        walState.batchTimeout = null;
    }

    console.log('[WAL] Monitoring stopped');
}
