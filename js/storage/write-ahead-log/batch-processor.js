/**
 * Write-Ahead Log Batch Processor
 *
 * Handles processing of WAL entries in batches with adaptive timing.
 * Manages priority-based execution and cleanup.
 *
 * @module storage/write-ahead-log/batch-processor
 */

import { TabCoordinator } from '../../services/tab-coordination.js';
import { DeviceDetection } from '../../services/device-detection.js';
import { Crypto } from '../../security/crypto.js';
import { walState } from './state.js';
import { CONFIG, PRIORITY_ORDER, WalStatus, WalPriority } from './config.js';
import { saveWal, saveOperationResults } from './persistence.js';
import { executeOperationForReplay } from './operation-executor.js';

/**
 * Check if encryption is available (secure context)
 * @returns {boolean} True if in secure context
 */
function canEncrypt() {
    return Crypto.isSecureContext();
}

/**
 * Schedule WAL processing with adaptive batching
 */
export function scheduleProcessing() {
    if (walState.batchTimeout) {
        clearTimeout(walState.batchTimeout);
    }

    // Adaptive batching based on device and network
    const adaptiveTiming = DeviceDetection.getAdaptiveTiming();
    const batchDelay = adaptiveTiming?.heartbeat?.intervalMs || 1000;

    walState.batchTimeout = setTimeout(() => {
        processWal();
    }, batchDelay);
}

/**
 * Process WAL entries
 * HNW Network: Only primary tab processes WAL
 * HNW Wave: Adaptive batching for performance
 */
export async function processWal() {
    // Only primary tab should process WAL
    if (TabCoordinator.isPrimary && !TabCoordinator.isPrimary()) {
        console.log('[WAL] Skipping WAL processing - not primary tab');
        return;
    }

    if (walState.isProcessing || walState.isReplaying) {
        console.log('[WAL] Already processing/replaying WAL');
        return;
    }

    walState.isProcessing = true;

    try {
        // Sort entries by priority and sequence
        const sortedEntries = walState.entries
            .filter(entry => entry.status === WalStatus.PENDING || entry.status === WalStatus.FAILED)
            .sort((a, b) => {
                const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
                if (priorityDiff !== 0) return priorityDiff;
                return a.sequence - b.sequence;
            });

        if (sortedEntries.length === 0) {
            console.log('[WAL] No pending entries to process');
            return;
        }

        console.log(`[WAL] Processing ${sortedEntries.length} entries`);

        // Process entries in batches
        for (let i = 0; i < sortedEntries.length; i += CONFIG.BATCH_SIZE) {
            const batch = sortedEntries.slice(i, i + CONFIG.BATCH_SIZE);

            for (const entry of batch) {
                entry.status = WalStatus.PROCESSING;
                entry.attempts++;
                entry.processedAt = Date.now();

                try {
                    // Check if encryption is now available
                    if (canEncrypt()) {
                        // CRITICAL FIX: Use executeOperationForReplay for idempotency
                        // This converts 'add' to 'put' during WAL replay to prevent ConstraintError
                        const result = await executeOperationForReplay(entry.operation, entry.args, walState.isReplaying);

                        entry.status = WalStatus.COMMITTED;
                        entry.error = null;

                        // Save operation result for crash recovery
                        const operationResult = {
                            success: true,
                            result: result,
                            completedAt: Date.now()
                        };
                        walState.operationResults.set(entry.id, operationResult);
                        saveOperationResults();

                        // Resolve promise if queued
                        if (entry.resolve) {
                            entry.resolve(result);
                        }
                        // Also resolve the newer promise format
                        if (entry.promise?.resolve) {
                            entry.promise.resolve(result);
                        }

                        console.log(`[WAL] ✓ Committed: ${entry.operation} (${entry.sequence})`);
                    } else {
                        // Still in Safe Mode, mark as failed for retry
                        entry.status = WalStatus.FAILED;
                        entry.error = 'Encryption unavailable';

                        // Don't resolve yet - will retry
                        console.log(`[WAL] ⚠ Deferred: ${entry.operation} (${entry.sequence}) - Safe Mode active`);
                    }
                } catch (error) {
                    entry.status = WalStatus.FAILED;
                    entry.error = error.message || String(error);

                    // Save error result for crash recovery
                    const operationResult = {
                        success: false,
                        error: entry.error,
                        completedAt: Date.now()
                    };
                    walState.operationResults.set(entry.id, operationResult);
                    saveOperationResults();

                    // Reject promise if too many attempts
                    if (entry.attempts >= CONFIG.MAX_ATTEMPTS) {
                        if (entry.reject) {
                            entry.reject(error);
                        }
                        if (entry.promise?.reject) {
                            entry.promise.reject(error);
                        }
                        console.error(`[WAL] ✗ Failed after ${entry.attempts} attempts: ${entry.operation}`);
                    } else {
                        console.warn(`[WAL] ⚠ Retry (${entry.attempts}/${CONFIG.MAX_ATTEMPTS}): ${entry.operation}`);
                    }
                }
            }

            // Save after each batch
            saveWal();

            // Check if encryption became available mid-batch
            if (canEncrypt()) {
                console.log('[WAL] Encryption now available, processing remaining entries immediately');
            }
        }

        // Cleanup committed entries
        cleanupWal();

    } catch (error) {
        console.error('[WAL] Error processing WAL:', error);
    } finally {
        walState.isProcessing = false;
        walState.batchTimeout = null;

        // Schedule next processing if there are still pending entries
        const hasPending = walState.entries.some(
            entry => entry.status === WalStatus.PENDING || entry.status === WalStatus.FAILED
        );

        if (hasPending && !canEncrypt()) {
            scheduleProcessing();
        }
    }
}

/**
 * Cleanup old committed entries
 */
export function cleanupWal() {
    const beforeCount = walState.entries.length;

    walState.entries = walState.entries.filter(entry => {
        // Keep pending, processing, and failed entries
        if (entry.status !== WalStatus.COMMITTED) return true;

        // Keep committed entries for a short time for debugging
        const age = Date.now() - entry.processedAt;
        return age < CONFIG.CLEANUP_AGE_MS; // Keep for 1 minute
    });

    const cleanedCount = beforeCount - walState.entries.length;

    if (cleanedCount > 0) {
        console.log(`[WAL] Cleaned up ${cleanedCount} committed entries`);
        saveWal();
    }
}

/**
 * Stop WAL processing
 */
export function stopProcessing() {
    if (walState.batchTimeout) {
        clearTimeout(walState.batchTimeout);
        walState.batchTimeout = null;
    }
    walState.isProcessing = false;
}
