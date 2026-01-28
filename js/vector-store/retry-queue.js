/**
 * Retry Queue for Failed Persist Operations
 *
 * Manages retry logic for failed IndexedDB persistence operations
 * Handles cooldown, concurrent retry protection, and stale entry cleanup
 *
 * @module vector-store/retry-queue
 */

import {
    RETRY_TIMEOUT,
    MAX_RETRIES,
    RETRY_COOLDOWN_MS,
    MAX_RETRIES_PER_UPSERT
} from './config.js';

/**
 * Create a retry queue manager
 *
 * @param {Map} vectorsMap - Reference to vectors map for validation
 * @returns {Object} Retry queue manager
 */
export function createRetryQueue(vectorsMap) {
    // Track failed persists for retry with metadata
    // Structure: Map<id, {timestamp, retryCount, lastError}>
    const failedPersists = new Map();

    // Track which vectors are currently being retried to prevent concurrent retries
    const retryInProgress = new Set();

    // Track last retry time to implement cooldown (prevent retry storms)
    let lastRetryTime = 0;

    /**
     * Process retry queue with all safety checks
     *
     * @param {Function} persistFn - Function to persist a vector
     * @returns {Promise<number>} Number of retries attempted
     */
    async function processRetries(persistFn) {
        if (failedPersists.size === 0) {
            return 0;
        }

        const now = Date.now();
        const timeSinceLastRetry = now - lastRetryTime;

        // Check cooldown before retrying (prevents retry storms)
        if (timeSinceLastRetry < RETRY_COOLDOWN_MS) {
            console.log(`[VectorStore] Retry cooldown active, skipping retry (${RETRY_COOLDOWN_MS - timeSinceLastRetry}ms remaining)`);
            return 0;
        }

        // Clone entries to prevent modification during iteration
        const entries = Array.from(failedPersists.entries());
        let retriesAttempted = 0;

        // Use Map.entries() for O(1) direct access
        for (const [retryId, metadata] of entries) {
            // Limit retries per upsert (prevents retry storms)
            if (retriesAttempted >= MAX_RETRIES_PER_UPSERT) {
                console.log(`[VectorStore] Reached max retries per upsert (${MAX_RETRIES_PER_UPSERT}), stopping retry loop`);
                break;
            }

            // Skip if already being retried concurrently (prevents TOCTOU race)
            if (retryInProgress.has(retryId)) {
                console.log(`[VectorStore] Retry already in progress for ${retryId}, skipping`);
                continue;
            }

            // Skip if too old (stale cleanup)
            if (now - metadata.timestamp > RETRY_TIMEOUT) {
                failedPersists.delete(retryId);
                console.log(`[VectorStore] Removed stale retry entry for ${retryId}`);
                continue;
            }

            // Skip if max retries exceeded
            if (metadata.retryCount >= MAX_RETRIES) {
                failedPersists.delete(retryId);
                console.warn(`[VectorStore] Max retries exceeded for ${retryId}, giving up`);
                continue;
            }

            // Validate retry target still exists before attempting (prevents data loss)
            const retryItem = vectorsMap.get(retryId);
            if (!retryItem) {
                // Vector was deleted - clean up retry entry immediately
                failedPersists.delete(retryId);
                console.log(`[VectorStore] Vector ${retryId} no longer exists, cleaned up retry entry`);
                continue;
            }

            // Mark as in-progress before async operation (prevents concurrent retries)
            retryInProgress.add(retryId);
            retriesAttempted++;

            // Attempt retry
            try {
                await persistFn(retryItem);
                failedPersists.delete(retryId);
                retryInProgress.delete(retryId);
                console.log(`[VectorStore] Successfully retried persist for ${retryId} (attempt ${metadata.retryCount + 1})`);
            } catch (e) {
                // Clone metadata before mutation to avoid reference sharing issues
                const updatedMetadata = {
                    timestamp: now,
                    retryCount: metadata.retryCount + 1,
                    lastError: e.message
                };
                failedPersists.set(retryId, updatedMetadata);
                retryInProgress.delete(retryId);
                console.warn(`[VectorStore] Retry ${updatedMetadata.retryCount}/${MAX_RETRIES} failed for ${retryId}:`, e);
                // Keep in failedPersists for next retry
            }
        }

        // Update last retry time after attempting retries
        if (retriesAttempted > 0) {
            lastRetryTime = now;
        }

        return retriesAttempted;
    }

    /**
     * Add a failed persist to the retry queue
     *
     * @param {string} id - Vector ID
     * @param {Error} error - The error that occurred
     */
    function addFailure(id, error) {
        failedPersists.set(id, {
            timestamp: Date.now(),
            retryCount: 0,
            lastError: error.message
        });
    }

    /**
     * Remove a retry entry (e.g., when vector is deleted)
     *
     * @param {string} id - Vector ID
     */
    function removeEntry(id) {
        failedPersists.delete(id);
        retryInProgress.delete(id);
    }

    /**
     * Clear all retry entries
     */
    function clear() {
        const count = failedPersists.size;
        failedPersists.clear();
        retryInProgress.clear();
        if (count > 0) {
            console.log(`[VectorStore] Cleared ${count} retry entries`);
        }
    }

    /**
     * Get retry queue metrics
     *
     * @returns {Object} Metrics about the retry queue
     */
    function getMetrics() {
        let oldestRetry = null;
        let maxRetries = 0;
        const now = Date.now();

        for (const [id, metadata] of failedPersists) {
            if (!oldestRetry || metadata.timestamp < oldestRetry) {
                oldestRetry = metadata.timestamp;
            }
            if (metadata.retryCount > maxRetries) {
                maxRetries = metadata.retryCount;
            }
        }

        return {
            size: failedPersists.size,
            oldestEntryAge: oldestRetry ? now - oldestRetry : null,
            maxRetries
        };
    }

    return {
        processRetries,
        addFailure,
        removeEntry,
        clear,
        getMetrics,
        get size() {
            return failedPersists.size;
        }
    };
}
