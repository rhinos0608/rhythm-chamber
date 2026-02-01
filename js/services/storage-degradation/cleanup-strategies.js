/**
 * Cleanup Strategies - Storage Cleanup Execution
 *
 * Executes cleanup operations based on priority levels and categories.
 * Responsible for:
 * - Priority-based cleanup scheduling
 * - Category-specific cleanup (sessions, embeddings, chunks, streams)
 * - Batch processing with parallel execution
 * - Emergency cleanup operations
 *
 * @module CleanupStrategies
 * @author Rhythm Chamber Architecture Team
 * @version 1.0.0
 */

import { Storage } from '../../storage.js';
import { DegradationTier } from './degradation-detector.js';

/**
 * Cleanup priority levels (higher = more likely to be cleaned)
 * @readonly
 * @enum {number}
 */
export const CleanupPriority = Object.freeze({
    NEVER_DELETE: 0, // Critical data (personality, settings, active session)
    LOW: 1, // Recent data (< 7 days)
    MEDIUM: 2, // Medium age data (7-30 days)
    HIGH: 3, // Old data (> 30 days)
    AGGRESSIVE: 4, // Very old data (> 90 days) or regeneratable
});

/**
 * Storage item metadata
 * @typedef {Object} StorageItemMetadata
 * @property {string} key - Storage key
 * @property {CleanupPriority} priority - Cleanup priority
 * @property {number} sizeBytes - Item size in bytes
 * @property {number} lastAccessed - Last access timestamp
 * @property {boolean} regeneratable - Whether data can be regenerated
 * @property {string} category - Item category (session, embedding, chunk, etc.)
 */

/**
 * Cleanup operation result
 * @typedef {Object} CleanupResult
 * @property {boolean} success - Whether cleanup succeeded
 * @property {number} bytesFreed - Bytes freed by cleanup
 * @property {number} itemsDeleted - Number of items deleted
 * @property {string[]} operationsPerformed - List of operations performed
 * @property {Error|null} error - Error if cleanup failed
 */

/**
 * CleanupStrategies Class
 *
 * Executes cleanup operations based on priority and category.
 */
export class CleanupStrategies {
    /**
     * @private
     * @type {Map<string, StorageItemMetadata>}
     */
    _itemRegistry = new Map();

    /**
     * @private
     * @type {DegradationTier}
     */
    _currentTier = DegradationTier.NORMAL;

    /**
     * @private
     * @type {StorageQuotaMetrics|null}
     */
    _currentMetrics = null;

    /**
     * @private
     * @type {EventBus}
     */
    _eventBus;

    /**
     * @private
     * @type {Storage}
     */
    _storage;

    /**
     * Initialize the CleanupStrategies
     * @public
     * @param {Object} options - Configuration options
     * @param {EventBus} options.eventBus - Event bus instance
     * @param {Storage} options.storage - Storage instance
     */
    constructor(options = {}) {
        const { eventBus = null, storage = null } = options;
        this._eventBus = eventBus;
        this._storage = storage || Storage;

        this._initializeItemRegistry();

        performance.mark('cleanup-strategies-init');
    }

    /**
     * Initialize item registry with metadata
     * @private
     */
    _initializeItemRegistry() {
        // Import STORAGE_KEYS
        import('../../storage/keys.js').then(({ STORAGE_KEYS }) => {
            // Critical data - never delete
            this._registerItem(STORAGE_KEYS.PERSONALITY_RESULT, {
                priority: CleanupPriority.NEVER_DELETE,
                category: 'personality',
                regeneratable: false,
            });

            this._registerItem(STORAGE_KEYS.USER_SETTINGS, {
                priority: CleanupPriority.NEVER_DELETE,
                category: 'settings',
                regeneratable: false,
            });

            // Active session - never delete
            this._registerItem(STORAGE_KEYS.ACTIVE_SESSION_ID, {
                priority: CleanupPriority.NEVER_DELETE,
                category: 'session',
                regeneratable: false,
            });

            // Embeddings - regeneratable, high cleanup priority
            this._registerItem(STORAGE_KEYS.EMBEDDING_CACHE, {
                priority: CleanupPriority.AGGRESSIVE,
                category: 'embedding',
                regeneratable: true,
            });

            // Chat sessions - medium priority based on age
            this._registerItem(STORAGE_KEYS.CHAT_SESSIONS, {
                priority: CleanupPriority.MEDIUM,
                category: 'session',
                regeneratable: false,
            });

            // Chunks - regeneratable from streams
            this._registerItem(STORAGE_KEYS.AGGREGATED_CHUNKS, {
                priority: CleanupPriority.HIGH,
                category: 'chunk',
                regeneratable: true,
            });

            // Raw streams - keep recent, aggressive cleanup for old
            this._registerItem(STORAGE_KEYS.RAW_STREAMS, {
                priority: CleanupPriority.HIGH,
                category: 'stream',
                regeneratable: false,
            });
        });
    }

    /**
     * Register storage item with metadata
     * @private
     * @param {string} key - Storage key
     * @param {Object} metadata - Item metadata
     */
    _registerItem(key, metadata) {
        this._itemRegistry.set(key, {
            key,
            ...metadata,
            sizeBytes: 0,
            lastAccessed: Date.now(),
        });
    }

    /**
     * Get items for cleanup based on priority
     * @private
     * @param {CleanupPriority} minPriority - Minimum priority to clean
     * @returns {StorageItemMetadata[]} Items to clean
     */
    _getItemsForCleanup(minPriority) {
        const items = Array.from(this._itemRegistry.values());

        // Filter by priority
        const eligible = items.filter(item => item.priority >= minPriority);

        // Sort by priority (descending) and last accessed (ascending)
        return eligible.sort((a, b) => {
            if (a.priority !== b.priority) {
                return b.priority - a.priority; // Higher priority first
            }
            return a.lastAccessed - b.lastAccessed; // Older items first
        });
    }

    /**
     * Cleanup individual storage item
     * @private
     * @param {StorageItemMetadata} item - Item to cleanup
     * @returns {Promise<CleanupResult>} Cleanup result
     */
    async _cleanupItem(item) {
        const startTime = performance.now();
        performance.mark(`cleanup-item-${item.key}-start`);

        try {
            let bytesFreed = 0;
            let itemsDeleted = 0;
            const operations = [];

            switch (item.category) {
                case 'session': {
                    const sessionResult = await this._cleanupOldSessions();
                    bytesFreed += sessionResult.bytesFreed;
                    itemsDeleted += sessionResult.itemsDeleted;
                    operations.push(...sessionResult.operations);
                    break;
                }

                case 'embedding': {
                    const embedResult = await this._clearEmbeddings();
                    bytesFreed += embedResult.bytesFreed;
                    itemsDeleted += embedResult.itemsDeleted;
                    operations.push(...embedResult.operations);
                    break;
                }

                case 'chunk': {
                    const chunkResult = await this._cleanupOldChunks();
                    bytesFreed += chunkResult.bytesFreed;
                    itemsDeleted += chunkResult.itemsDeleted;
                    operations.push(...chunkResult.operations);
                    break;
                }

                case 'stream': {
                    const streamResult = await this._cleanupOldStreams();
                    bytesFreed += streamResult.bytesFreed;
                    itemsDeleted += streamResult.itemsDeleted;
                    operations.push(...streamResult.operations);
                    break;
                }
            }

            return {
                success: true,
                bytesFreed,
                itemsDeleted,
                operations,
                error: null,
            };
        } catch (error) {
            console.error(`[CleanupStrategies] Failed to cleanup ${item.key}:`, error);
            return {
                success: false,
                bytesFreed: 0,
                itemsDeleted: 0,
                operations: [],
                error,
            };
        } finally {
            performance.measure(`cleanup-item-${item.key}`, `cleanup-item-${item.key}-start`);
        }
    }

    /**
     * Perform cleanup at specified priority level
     * @private
     * @param {CleanupPriority} minPriority - Minimum priority to clean
     * @returns {Promise<CleanupResult>} Cleanup result
     */
    async _performCleanup(minPriority) {
        performance.mark('storage-cleanup-start');

        let bytesFreed = 0;
        let itemsDeleted = 0;
        const operationsPerformed = [];

        try {
            // Get items to clean (sorted by priority and last accessed)
            const itemsToClean = this._getItemsForCleanup(minPriority);

            for (const item of itemsToClean) {
                try {
                    const result = await this._cleanupItem(item);
                    if (result.success) {
                        bytesFreed += result.bytesFreed;
                        itemsDeleted += result.itemsDeleted;
                        operationsPerformed.push(...result.operations);

                        // Check if we've freed enough space
                        if (
                            this._currentMetrics &&
                            bytesFreed > this._currentMetrics.usageBytes * 0.1
                        ) {
                            console.log('[CleanupStrategies] Freed 10% of usage, stopping cleanup');
                            break;
                        }
                    }
                } catch (error) {
                    console.error(`[CleanupStrategies] Failed to cleanup ${item.key}:`, error);
                }
            }

            return {
                success: true,
                bytesFreed,
                itemsDeleted,
                operationsPerformed,
                error: null,
            };
        } catch (error) {
            console.error('[CleanupStrategies] Cleanup failed:', error);
            return {
                success: false,
                bytesFreed,
                itemsDeleted,
                operationsPerformed,
                error,
            };
        } finally {
            performance.measure('storage-cleanup', 'storage-cleanup-start');
        }
    }

    /**
     * Perform emergency cleanup
     * @private
     * @returns {Promise<CleanupResult>} Cleanup result
     */
    async _performEmergencyCleanup() {
        console.log('[CleanupStrategies] Performing emergency cleanup');

        // Clean everything except NEVER_DELETE priority
        return await this._performCleanup(CleanupPriority.LOW);
    }

    /**
     * Cleanup old chat sessions with batched parallel processing
     * @private
     * @returns {Promise<CleanupResult>} Cleanup result
     */
    async _cleanupOldSessions() {
        try {
            const sessions = await this._storage.getAllChatSessions();
            const now = Date.now();
            const days30 = 30 * 24 * 60 * 60 * 1000;
            const days7 = 7 * 24 * 60 * 60 * 1000;

            let itemsDeleted = 0;
            let bytesFreed = 0;
            const operations = [];

            // Determine age threshold based on tier
            const threshold = this._currentTier === DegradationTier.CRITICAL ? days7 : days30;

            // Identify sessions to delete
            const sessionsToDelete = sessions.filter(session => {
                const sessionAge = now - new Date(session.createdAt).getTime();
                return sessionAge > threshold && session.id !== this._storage.getActiveSessionId();
            });

            // Batch processing to avoid event loop blocking
            const BATCH_SIZE = 10;
            for (let i = 0; i < sessionsToDelete.length; i += BATCH_SIZE) {
                const batch = sessionsToDelete.slice(i, i + BATCH_SIZE);

                // Process batch in parallel
                await Promise.all(
                    batch.map(async session => {
                        try {
                            await this._storage.deleteChatSession(session.id);
                            itemsDeleted++;
                            bytesFreed += 2048; // Estimate 2KB per session
                            operations.push(`deleted_session_${session.id}`);
                        } catch (error) {
                            console.warn(
                                `[CleanupStrategies] Failed to delete session ${session.id}:`,
                                error
                            );
                            // Continue with other sessions even if one fails
                        }
                    })
                );

                // Yield to event loop between batches
                await new Promise(resolve => queueMicrotask(resolve));
            }

            return { success: true, bytesFreed, itemsDeleted, operations, error: null };
        } catch (error) {
            return { success: false, bytesFreed: 0, itemsDeleted: 0, operations: [], error };
        }
    }

    /**
     * Clear all embeddings
     * @private
     * @returns {Promise<CleanupResult>} Cleanup result
     */
    async _clearEmbeddings() {
        try {
            // Clear LRU cache
            const { VectorLRUCache } = await import('../../storage/lru-cache.js');
            const cache = VectorLRUCache;
            const beforeSize = cache.size();

            await cache.clear();

            const bytesFreed = beforeSize * 1536; // Assume 1.5KB per vector
            const itemsDeleted = beforeSize;

            return {
                success: true,
                bytesFreed,
                itemsDeleted,
                operations: ['cleared_embedding_cache'],
                error: null,
            };
        } catch (error) {
            return { success: false, bytesFreed: 0, itemsDeleted: 0, operations: [], error };
        }
    }

    /**
     * Cleanup old chunks with batched parallel processing
     * @private
     * @returns {Promise<CleanupResult>} Cleanup result
     */
    async _cleanupOldChunks() {
        try {
            const chunks = await this._storage.getChunks();
            const now = Date.now();
            const days90 = 90 * 24 * 60 * 60 * 1000;

            let itemsDeleted = 0;
            let bytesFreed = 0;
            const operations = [];

            // Identify chunks to delete
            const chunksToDelete = chunks.filter(chunk => {
                const chunkAge = now - new Date(chunk.endDate).getTime();
                return chunkAge > days90;
            });

            // Batch processing to avoid event loop blocking
            const BATCH_SIZE = 20; // Larger batch for chunks (smaller operations)
            for (let i = 0; i < chunksToDelete.length; i += BATCH_SIZE) {
                const batch = chunksToDelete.slice(i, i + BATCH_SIZE);

                // Process batch in parallel
                await Promise.all(
                    batch.map(async chunk => {
                        try {
                            await this._storage.deleteChunk(chunk.id);
                            itemsDeleted++;
                            bytesFreed += 10240; // Estimate 10KB per chunk
                            operations.push(`deleted_chunk_${chunk.id}`);
                        } catch (error) {
                            console.warn(
                                `[CleanupStrategies] Failed to delete chunk ${chunk.id}:`,
                                error
                            );
                            // Continue with other chunks even if one fails
                        }
                    })
                );

                // Yield to event loop between batches
                await new Promise(resolve => queueMicrotask(resolve));
            }

            return { success: true, bytesFreed, itemsDeleted, operations, error: null };
        } catch (error) {
            return { success: false, bytesFreed: 0, itemsDeleted: 0, operations: [], error };
        }
    }

    /**
     * Cleanup old streams with batched parallel processing
     * @private
     * @returns {Promise<CleanupResult>} Cleanup result
     */
    async _cleanupOldStreams() {
        try {
            const streams = await this._storage.getStreams();
            const now = Date.now();
            const days30 = 30 * 24 * 60 * 60 * 1000;

            let itemsDeleted = 0;
            let bytesFreed = 0;
            const operations = [];

            // Identify streams to delete
            const streamsToDelete = streams.filter(stream => {
                const streamDate = new Date(stream.ts);
                const streamAge = now - streamDate.getTime();
                return streamAge > days30;
            });

            // Batch processing to avoid event loop blocking
            const BATCH_SIZE = 50; // Larger batch for streams (smallest operations)
            for (let i = 0; i < streamsToDelete.length; i += BATCH_SIZE) {
                const batch = streamsToDelete.slice(i, i + BATCH_SIZE);

                // Process batch in parallel
                await Promise.all(
                    batch.map(async stream => {
                        try {
                            await this._storage.deleteStream(stream.id);
                            itemsDeleted++;
                            bytesFreed += 512; // Estimate 512B per stream
                            operations.push(`deleted_stream_${stream.id}`);
                        } catch (error) {
                            console.warn(
                                `[CleanupStrategies] Failed to delete stream ${stream.id}:`,
                                error
                            );
                            // Continue with other streams even if one fails
                        }
                    })
                );

                // Yield to event loop between batches
                await new Promise(resolve => queueMicrotask(resolve));
            }

            return { success: true, bytesFreed, itemsDeleted, operations, error: null };
        } catch (error) {
            return { success: false, bytesFreed: 0, itemsDeleted: 0, operations: [], error };
        }
    }

    /**
     * Set current degradation tier (affects cleanup thresholds)
     * @public
     * @param {DegradationTier} tier - Current tier
     */
    setCurrentTier(tier) {
        this._currentTier = tier;
    }

    /**
     * Set current metrics (affects cleanup targets)
     * @public
     * @param {StorageQuotaMetrics} metrics - Current metrics
     */
    setCurrentMetrics(metrics) {
        this._currentMetrics = metrics;
    }

    /**
     * Manually trigger cleanup
     * @public
     * @param {CleanupPriority} priority - Cleanup priority level
     * @returns {Promise<CleanupResult>} Cleanup result
     */
    async triggerCleanup(priority = CleanupPriority.MEDIUM) {
        return await this._performCleanup(priority);
    }

    /**
     * Manually trigger emergency cleanup
     * @public
     * @returns {Promise<CleanupResult>} Cleanup result
     */
    async triggerEmergencyCleanup() {
        return await this._performEmergencyCleanup();
    }

    /**
     * Perform full cleanup of all data except critical
     * @public
     * @returns {Promise<CleanupResult>} Cleanup result
     */
    async performFullCleanup() {
        let bytesFreed = 0;
        let itemsDeleted = 0;
        const operations = [];

        try {
            // Cleanup all categories
            const sessionResult = await this._cleanupOldSessions();
            bytesFreed += sessionResult.bytesFreed;
            itemsDeleted += sessionResult.itemsDeleted;
            operations.push(...sessionResult.operations);

            const embedResult = await this._clearEmbeddings();
            bytesFreed += embedResult.bytesFreed;
            itemsDeleted += embedResult.itemsDeleted;
            operations.push(...embedResult.operations);

            const chunkResult = await this._cleanupOldChunks();
            bytesFreed += chunkResult.bytesFreed;
            itemsDeleted += chunkResult.itemsDeleted;
            operations.push(...chunkResult.operations);

            const streamResult = await this._cleanupOldStreams();
            bytesFreed += streamResult.bytesFreed;
            itemsDeleted += streamResult.itemsDeleted;
            operations.push(...streamResult.operations);

            return {
                success: true,
                bytesFreed,
                itemsDeleted,
                operations,
                error: null,
            };
        } catch (error) {
            return {
                success: false,
                bytesFreed,
                itemsDeleted,
                operations,
                error,
            };
        }
    }
}
