/**
 * Write-Ahead Log Write Queue
 *
 * Manages the write queue and handles replay blocking logic.
 * Ensures proper ordering and crash recovery semantics.
 *
 * @module storage/write-ahead-log/write-queue
 */

import { EventBus } from '../../services/event-bus.js';
import { Crypto } from '../../security/crypto.js';
import { walState } from './state.js';
import { WalPriority } from './config.js';
import { createWalEntry } from './entry-factory.js';
import { saveWal, saveOperationResults } from './persistence.js';
import { executeOperation } from './operation-executor.js';
import { scheduleProcessing } from './batch-processor.js';

/**
 * Check if encryption is available (secure context)
 * @returns {boolean} True if in secure context
 */
function canEncrypt() {
    return Crypto.isSecureContext();
}

/**
 * Wait for WAL replay to complete
 * CRITICAL FIX: Use event-based approach instead of polling to avoid race condition
 * @param {number} [timeoutMs=30000] - Maximum time to wait
 * @returns {Promise<void>} Resolves when replay is complete or timeout
 */
export function waitForReplayComplete(timeoutMs = 30000) {
    if (!walState.isReplaying) {
        return Promise.resolve();
    }

    return new Promise(resolve => {
        function cleanup() {
            clearTimeout(timeoutHandle);
            EventBus.off('wal:replay_complete', eventHandler);
        }

        // Set timeout as fallback
        const timeoutHandle = setTimeout(() => {
            cleanup();
            console.warn('[WAL] Timeout waiting for replay to complete, proceeding anyway');
            resolve();
        }, timeoutMs);

        // Listen for replay complete event (immediate notification)
        const eventHandler = () => {
            cleanup();
            resolve();
        };

        EventBus.on('wal:replay_complete', eventHandler);

        // Double-check state in case event was already emitted
        if (!walState.isReplaying) {
            cleanup();
            resolve();
        }
    });
}

/**
 * Check if WAL replay is in progress
 * @returns {boolean} True if replay is in progress
 */
export function isReplaying() {
    return walState.isReplaying;
}

/**
 * Queue a write operation for processing
 *
 * **CRASH-RECOVERY SEMANTICS:**
 * The resolve/reject callbacks attached to WAL entries are **NOT persisted** across page reloads.
 * If the browser crashes or reloads while operations are queued, callers' Promises will never settle.
 *
 * **RECOVERY MECHANISM:**
 * - Operation results are persisted to localStorage for 5 minutes
 * - Use `WriteAheadLog.getOperationResult(entryId)` to check operation status after reload
 * - The returned object includes { promise, entryId } for tracking
 *
 * **Implications:**
 * - The returned Promise from this function will only settle if the page remains alive
 * - After a crash/reload, use getOperationResult() with the entryId to check if operation completed
 * - Callers should design for idempotency to safely retry operations
 *
 * **REPLAY BLOCKING:**
 * If WAL replay is in progress, new writes are blocked until replay completes.
 * This prevents ordering conflicts between replayed and new writes.
 *
 * See `createWalEntry`, `saveWal`, `walState.entries`, and `scheduleProcessing` for implementation details.
 *
 * @param {string} operation - Operation name
 * @param {Array} args - Operation arguments
 * @param {string} [priority=WalPriority.NORMAL] - Priority level
 * @returns {Promise<{ promise: Promise, entryId: string }>} Promise and entryId for result tracking
 */
export async function queueWrite(operation, args, priority = WalPriority.NORMAL) {
    // Block writes during WAL replay to prevent ordering conflicts
    if (walState.isReplaying) {
        console.warn(`[WAL] Write blocked during replay, waiting: ${operation}`);
        await waitForReplayComplete();
        console.log(`[WAL] Replay complete, proceeding with write: ${operation}`);
    }

    // Check if encryption is available
    if (canEncrypt()) {
        // Process immediately if encryption is available
        const result = await executeOperation(operation, args);
        // Return in same format for consistency
        const entryId = `immediate-${Date.now()}`;
        return { promise: Promise.resolve(result), entryId };
    }

    // Queue for later processing if in Safe Mode
    return new Promise(resolveOuter => {
        const entry = createWalEntry(operation, args, priority);

        // Store entryId in closure for result tracking
        const entryId = entry.id;

        new Promise((resolve, reject) => {
            entry.resolve = resolve;
            entry.reject = reject;

            walState.entries.push(entry);

            // Save to persistent storage
            saveWal();

            // Trigger processing if not already processing
            if (!walState.isProcessing) {
                scheduleProcessing();
            }

            console.log(`[WAL] Queued write operation: ${operation} (${priority})`);

            // Return both the promise and entryId for tracking
            resolveOuter({
                promise: new Promise((res, rej) => {
                    entry.promise = { resolve: res, reject: rej };
                }),
                entryId: entryId,
            });
        })
            .then(result => {
                // CRITICAL FIX: Use entryId from closure, not result
                // When operation completes, save result for crash recovery
                const operationResult = {
                    success: !result?.error,
                    result: result,
                    completedAt: Date.now(),
                };
                walState.operationResults.set(entryId, operationResult);
                saveOperationResults();

                // Resolve the inner promise
                if (result.promise) {
                    result.promise.resolve(operationResult.result);
                }
            })
            .catch(error => {
                // CRITICAL FIX: Use entryId from closure, not error
                // Save error result with preserved stack trace
                const operationResult = {
                    success: false,
                    error: error.message,
                    stack: error.stack,
                    completedAt: Date.now(),
                };
                walState.operationResults.set(entryId, operationResult);
                saveOperationResults();

                // Reject the inner promise
                if (error.promise) {
                    error.promise.reject(error);
                }
            });
    });
}

/**
 * Wait for a WAL operation result, surviving page reloads
 * CRITICAL FIX for Issue #1: Solves Promise Resolution Breaks Across Reloads
 *
 * When a page reloads occurs during WAL processing, the original Promise from
 * queueWrite() is lost. This function provides a recovery mechanism by:
 * 1. Checking if result already exists (immediate resolution)
 * 2. Waiting for WAL replay to complete if result pending
 * 3. Returning the result or throwing appropriate error
 *
 * @param {string} entryId - WAL entry ID from queueWrite()
 * @param {Object} [options] - Options
 * @param {number} [options.timeoutMs=30000] - Max wait time for result (milliseconds)
 * @returns {Promise<any>} Operation result
 * @throws {Error} If operation failed, not found after replay, or timeout exceeded
 *
 * @example
 * const { promise, entryId } = await WriteAheadLog.queueWrite('put', [key, value]);
 * // After page reload, original promise is lost - use waitForResult instead:
 * try {
 *     const result = await WriteAheadLog.waitForResult(entryId);
 * } catch (error) {
 *     // Handle error or timeout
 * }
 */
export async function waitForResult(entryId, options = {}) {
    const { timeoutMs = 30000 } = options;
    const startTime = Date.now();

    // Helper to process result consistently (success or failure)
    const processResult = operationResult => {
        if (operationResult.success) {
            return operationResult.result;
        }
        throw new Error(operationResult.error || 'Operation failed');
    };

    // Early check - handles immediate resolution for already-completed operations
    let getOperationResult;
    try {
        const persistence = await import('./persistence.js');
        getOperationResult = persistence.getOperationResult;
    } catch (importError) {
        throw new Error(`Failed to import WAL persistence module: ${importError.message}`);
    }

    const immediateResult = await getOperationResult(entryId);
    if (immediateResult) {
        return processResult(immediateResult);
    }

    // Calculate remaining timeout (accounts for time spent in getOperationResult)
    const elapsed = Date.now() - startTime;
    const remainingTimeout = timeoutMs - elapsed;

    if (remainingTimeout <= 0) {
        throw new Error('Timeout waiting for WAL result');
    }

    // Wait for replay completion with remaining timeout
    // waitForReplayComplete handles the race condition where replay completes
    // between our check and attaching the event listener
    await waitForReplayComplete(remainingTimeout);

    // Final check after replay - result should now be available
    const finalResult = await getOperationResult(entryId);
    if (finalResult) {
        return processResult(finalResult);
    }

    // If replay completed but no result found, the operation may have been
    // discarded or the entryId was invalid
    throw new Error(`WAL result not found after replay for entry: ${entryId}`);
}
