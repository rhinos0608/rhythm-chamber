/**
 * StorageDegradationManager - Quota Exceeded Handling with Graceful Degradation
 *
 * This service manages storage quota by implementing tier-based degradation modes.
 * Prevents app crashes when storage quota is exceeded through automatic cleanup,
 * read-only mode activation, and session-only fallback.
 *
 * @module StorageDegradationManager
 * @author Rhythm Chamber Architecture Team
 * @version 1.0.0
 */

import { EventBus } from './event-bus.js';
import { Storage } from '../storage.js';
import { STORAGE_KEYS } from '../storage/keys.js';

/**
 * Degradation tier enumeration
 * @readonly
 * @enum {string}
 */
export const DegradationTier = Object.freeze({
    NORMAL: 'normal',        // < 80% quota used
    WARNING: 'warning',      // 80-94% quota used
    CRITICAL: 'critical',    // 95-99% quota used
    EXCEEDED: 'exceeded',    // 100% quota used
    EMERGENCY: 'emergency'   // Emergency mode activated
});

/**
 * Cleanup priority levels (higher = more likely to be cleaned)
 * @readonly
 * @enum {number}
 */
export const CleanupPriority = Object.freeze({
    NEVER_DELETE: 0,         // Critical data (personality, settings, active session)
    LOW: 1,                  // Recent data (< 7 days)
    MEDIUM: 2,               // Medium age data (7-30 days)
    HIGH: 3,                 // Old data (> 30 days)
    AGGRESSIVE: 4            // Very old data (> 90 days) or regeneratable
});

/**
 * Storage quota metrics
 * @typedef {Object} StorageQuotaMetrics
 * @property {number} usageBytes - Current usage in bytes
 * @property {number} quotaBytes - Total quota in bytes
 * @property {number} usagePercent - Usage percentage (0-100)
 * @property {DegradationTier} tier - Current degradation tier
 * @property {number} availableBytes - Available bytes
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
 * StorageDegradationManager Class
 *
 * Manages storage quota through tier-based degradation and automatic cleanup.
 */
export class StorageDegradationManager {
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
     * @type {boolean}
     */
    _isEmergencyMode = false;

    /**
     * @private
     * @type {boolean}
     */
    _isReadOnlyMode = false;

    /**
     * @private
     * @type {boolean}
     */
    _autoCleanupEnabled = true;

    /**
     * @private
     * @type {number}
     */
    _checkIntervalMs = 30000; // 30 seconds

    /**
     * @private
     * @type {number|null}
     */
    _checkIntervalId = null;

    /**
     * @private
     * @type {Map<string, StorageItemMetadata>}
     */
    _itemRegistry = new Map();

    /**
     * @private
     * @type {EventBus}
     */
    _eventBus = EventBus;

    /**
     * Initialize the StorageDegradationManager
     * @public
     * @param {Object} options - Configuration options
     * @param {EventBus} options.eventBus - Event bus instance
     * @param {boolean} options.autoCleanupEnabled - Enable automatic cleanup
     * @param {number} options.checkIntervalMs - Quota check interval in milliseconds
     */
    constructor({ eventBus, autoCleanupEnabled = true, checkIntervalMs = 30000 } = {}) {
        if (eventBus) this._eventBus = eventBus;
        this._autoCleanupEnabled = autoCleanupEnabled;
        this._checkIntervalMs = checkIntervalMs;

        this._initializeItemRegistry();
        this._subscribeToStorageEvents();
        this._startQuotaMonitoring();

        performance.mark('storage-degradation-manager-init');
    }

    /**
     * Initialize item registry with metadata
     * @private
     */
    _initializeItemRegistry() {
        // Critical data - never delete
        this._registerItem(STORAGE_KEYS.PERSONALITY_RESULT, {
            priority: CleanupPriority.NEVER_DELETE,
            category: 'personality',
            regeneratable: false
        });

        this._registerItem(STORAGE_KEYS.USER_SETTINGS, {
            priority: CleanupPriority.NEVER_DELETE,
            category: 'settings',
            regeneratable: false
        });

        // Active session - never delete
        this._registerItem(STORAGE_KEYS.ACTIVE_SESSION_ID, {
            priority: CleanupPriority.NEVER_DELETE,
            category: 'session',
            regeneratable: false
        });

        // Embeddings - regeneratable, high cleanup priority
        this._registerItem(STORAGE_KEYS.EMBEDDING_CACHE, {
            priority: CleanupPriority.AGGRESSIVE,
            category: 'embedding',
            regeneratable: true
        });

        // Chat sessions - medium priority based on age
        this._registerItem(STORAGE_KEYS.CHAT_SESSIONS, {
            priority: CleanupPriority.MEDIUM,
            category: 'session',
            regeneratable: false
        });

        // Chunks - regeneratable from streams
        this._registerItem(STORAGE_KEYS.AGGREGATED_CHUNKS, {
            priority: CleanupPriority.HIGH,
            category: 'chunk',
            regeneratable: true
        });

        // Raw streams - keep recent, aggressive cleanup for old
        this._registerItem(STORAGE_KEYS.RAW_STREAMS, {
            priority: CleanupPriority.HIGH,
            category: 'stream',
            regeneratable: false
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
            lastAccessed: Date.now()
        });
    }

    /**
     * Subscribe to storage events
     * @private
     */
    _subscribeToStorageEvents() {
        // Monitor storage writes
        this._eventBus.on('STORAGE:WRITE', async (event, data) => {
            await this._onStorageWrite(data);
        });

        // Monitor storage errors
        this._eventBus.on('STORAGE:ERROR', async (event, data) => {
            await this._onStorageError(data);
        });

        // Monitor quota changes
        this._eventBus.on('STORAGE:QUOTA_CHANGE', async (event, data) => {
            await this._checkQuotaAndDegrade();
        });

        // Monitor connection failures from IndexedDB
        this._eventBus.on('storage:connection_failed', async (payload) => {
            await this._onConnectionFailed(payload);
        });

        // Monitor connection blocked (upgrade blocked by other tabs)
        this._eventBus.on('storage:connection_blocked', async (payload) => {
            this._eventBus.emit('UI:TOAST', {
                type: 'warning',
                message: payload.message || 'Database upgrade blocked by other tabs. Please close other tabs.',
                duration: 10000
            });
        });
    }

    /**
     * Handle IndexedDB connection failure
     * @private
     * @param {Object} data - Event data
     */
    async _onConnectionFailed(data) {
        console.error('[StorageDegradationManager] IndexedDB connection failed:', data.error);

        // Track old tier for event emission
        const oldTier = this._currentTier;

        // Enter emergency mode and update tier
        this._isEmergencyMode = true;
        this._currentTier = DegradationTier.EMERGENCY;

        // Emit tier change event (matching _transitionToTier behavior)
        this._eventBus.emit('STORAGE:TIER_CHANGE', {
            oldTier,
            newTier: DegradationTier.EMERGENCY,
            metrics: this._currentMetrics,
            reason: 'connection_failed'
        });

        // Pause non-critical operations (matching _handleEmergencyMode behavior)
        this._eventBus.emit('STORAGE:PAUSE_NON_CRITICAL');

        // Show emergency modal for session-only mode
        this._eventBus.emit('UI:MODAL', {
            type: 'emergency',
            title: 'Storage Unavailable',
            message: `Unable to connect to storage after ${data.attempts} attempts. Your data will only be saved for this session.`,
            options: [
                {
                    label: 'Continue in Session-Only Mode',
                    action: 'session_only_mode',
                    primary: true
                },
                {
                    label: 'Retry Connection',
                    action: 'retry_connection'
                }
            ]
        });

        // Emit storage mode change
        this._eventBus.emit('STORAGE:SESSION_ONLY_MODE', { enabled: true, reason: 'connection_failed' });
    }

    /**
     * Handle storage write events
     * @private
     * @param {Object} data - Event data
     */
    async _onStorageWrite(data) {
        // Update item registry with size and access time
        if (data.key && this._itemRegistry.has(data.key)) {
            const item = this._itemRegistry.get(data.key);
            item.sizeBytes = data.size || 0;
            item.lastAccessed = Date.now();
        }

        // Check quota after write
        await this._checkQuotaAndDegrade();
    }

    /**
     * Handle storage error events
     * @private
     * @param {Object} data - Event data
     */
    async _onStorageError(data) {
        // Check if error is quota exceeded
        if (data.error?.name === 'QuotaExceededError' ||
            data.error?.message?.includes('quota')) {
            console.error('[StorageDegradationManager] Quota exceeded error detected');
            await this._handleQuotaExceeded();
        }
    }

    /**
     * Start quota monitoring
     * @private
     */
    _startQuotaMonitoring() {
        if (this._checkIntervalId) {
            clearInterval(this._checkIntervalId);
        }

        this._checkIntervalId = setInterval(async () => {
            await this._checkQuotaAndDegrade();
        }, this._checkIntervalMs);

        // Initial check
        this._checkQuotaAndDegrade();
    }

    /**
     * Stop quota monitoring
     * @public
     */
    stopQuotaMonitoring() {
        if (this._checkIntervalId) {
            clearInterval(this._checkIntervalId);
            this._checkIntervalId = null;
        }
    }

    /**
     * Check quota and trigger appropriate degradation
     * @private
     */
    async _checkQuotaAndDegrade() {
        try {
            const metrics = await this._getStorageMetrics();
            this._currentMetrics = metrics;

            const newTier = this._determineDegradationTier(metrics);

            if (newTier !== this._currentTier) {
                await this._transitionToTier(newTier);
            }

            // Emit quota status event
            this._eventBus.emit('STORAGE:QUOTA_STATUS', {
                tier: this._currentTier,
                metrics
            });

        } catch (error) {
            console.error('[StorageDegradationManager] Failed to check quota:', error);
        }
    }

    /**
     * Get current storage metrics
     * @private
     * @returns {Promise<StorageQuotaMetrics>} Storage metrics
     */
    async _getStorageMetrics() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            const estimate = await navigator.storage.estimate();
            const usageBytes = estimate.usage || 0;
            const quotaBytes = estimate.quota || 1;
            const usagePercent = (usageBytes / quotaBytes) * 100;

            return {
                usageBytes,
                quotaBytes,
                usagePercent,
                tier: this._determineDegradationTier({ usagePercent }),
                availableBytes: quotaBytes - usageBytes
            };
        }

        // Fallback: estimate from IndexedDB
        return this._estimateStorageFromIndexedDB();
    }

    /**
     * Estimate storage from IndexedDB
     * @private
     * @returns {Promise<StorageQuotaMetrics>} Estimated storage metrics
     */
    async _estimateStorageFromIndexedDB() {
        try {
            const db = await new Promise((resolve, reject) => {
                const request = indexedDB.open('RhythmChamber', 1);

                request.onerror = () => {
                    reject(new Error(`Failed to open database: ${request.error}`));
                };

                request.onsuccess = () => {
                    resolve(request.result);
                };
            });

            const usageBytes = await this._calculateDatabaseSize(db);
            db.close();

            // Assume 50MB default quota if unavailable
            const quotaBytes = 50 * 1024 * 1024;
            const usagePercent = (usageBytes / quotaBytes) * 100;

            return {
                usageBytes,
                quotaBytes,
                usagePercent,
                tier: this._determineDegradationTier({ usagePercent }),
                availableBytes: quotaBytes - usageBytes
            };
        } catch (error) {
            console.error('[StorageDegradationManager] Failed to estimate storage:', error);
            return {
                usageBytes: 0,
                quotaBytes: 50 * 1024 * 1024,
                usagePercent: 0,
                tier: DegradationTier.NORMAL,
                availableBytes: 50 * 1024 * 1024
            };
        }
    }

    /**
     * Calculate database size
     * @private
     * @param {IDBDatabase} db - IndexedDB database
     * @returns {Promise<number>} Database size in bytes
     */
    async _calculateDatabaseSize(db) {
        let totalSize = 0;

        for (const name of db.objectStoreNames) {
            const transaction = db.transaction(name, 'readonly');
            const store = transaction.objectStore(name);
            const count = await new Promise((resolve, reject) => {
                const request = store.count();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            // Estimate: 1KB per record
            totalSize += count * 1024;
        }

        return totalSize;
    }

    /**
     * Determine degradation tier from metrics
     * @private
     * @param {Object} metrics - Storage metrics
     * @returns {DegradationTier} Degradation tier
     */
    _determineDegradationTier(metrics) {
        const usagePercent = metrics.usagePercent || 0;

        if (usagePercent >= 100) return DegradationTier.EXCEEDED;
        if (usagePercent >= 99) return DegradationTier.EMERGENCY;
        if (usagePercent >= 95) return DegradationTier.CRITICAL;
        if (usagePercent >= 80) return DegradationTier.WARNING;
        return DegradationTier.NORMAL;
    }

    /**
     * Transition to new degradation tier
     * @private
     * @param {DegradationTier} newTier - New degradation tier
     */
    async _transitionToTier(newTier) {
        const oldTier = this._currentTier;
        this._currentTier = newTier;

        console.log(`[StorageDegradationManager] Transitioning from ${oldTier} to ${newTier}`);

        performance.mark(`storage-tier-transition-${oldTier}-to-${newTier}`);

        switch (newTier) {
            case DegradationTier.WARNING:
                await this._handleWarningTier();
                break;

            case DegradationTier.CRITICAL:
                await this._handleCriticalTier();
                break;

            case DegradationTier.EXCEEDED:
                await this._handleQuotaExceeded();
                break;

            case DegradationTier.EMERGENCY:
                await this._handleEmergencyMode();
                break;

            case DegradationTier.NORMAL:
                await this._handleNormalTier();
                break;
        }

        // Emit tier transition event
        this._eventBus.emit('STORAGE:TIER_CHANGE', {
            oldTier,
            newTier,
            metrics: this._currentMetrics
        });

        performance.measure(`storage-tier-${oldTier}-to-${newTier}`, `storage-tier-transition-${oldTier}-to-${newTier}`);
    }

    /**
     * Handle WARNING tier (80-94%)
     * @private
     */
    async _handleWarningTier() {
        console.warn('[StorageDegradationManager] Storage quota at WARNING level (80-94%)');

        // Show user warning
        this._eventBus.emit('UI:TOAST', {
            type: 'warning',
            message: 'Storage space is getting low. Old chat sessions may be cleaned up automatically.',
            duration: 10000
        });

        // Enable aggressive LRU eviction
        this._eventBus.emit('LRU:EVICTION_POLICY', {
            mode: 'aggressive',
            targetRatio: 0.7 // Target 70% of current usage
        });

        // Clean up old sessions if auto-cleanup enabled
        if (this._autoCleanupEnabled) {
            await this._performCleanup(CleanupPriority.HIGH);
        }
    }

    /**
     * Handle CRITICAL tier (95-99%)
     * @private
     */
    async _handleCriticalTier() {
        console.error('[StorageDegradationManager] Storage quota at CRITICAL level (95-99%)');

        // Show urgent warning
        this._eventBus.emit('UI:TOAST', {
            type: 'error',
            message: 'Storage space is critically low! Old data is being cleaned up. Consider exporting your data.',
            duration: 15000,
            actions: [
                {
                    label: 'Export Data',
                    action: 'export_data'
                },
                {
                    label: 'Clear Old Sessions',
                    action: 'clear_sessions'
                }
            ]
        });

        // Enter read-only mode for non-essential writes
        this._isReadOnlyMode = true;
        this._eventBus.emit('STORAGE:READ_ONLY_MODE', { enabled: true });

        // Aggressive cleanup
        if (this._autoCleanupEnabled) {
            await this._performCleanup(CleanupPriority.AGGRESSIVE);
        }

        // Clear all cached embeddings
        await this._clearEmbeddings();
    }

    /**
     * Handle quota exceeded (100%)
     * @private
     */
    async _handleQuotaExceeded() {
        console.error('[StorageDegradationManager] Storage quota EXCEEDED');

        // Immediate emergency cleanup
        const cleanupResult = await this._performEmergencyCleanup();

        if (!cleanupResult.success || cleanupResult.bytesFreed === 0) {
            // If cleanup failed, enter emergency mode
            await this._handleEmergencyMode();
        }
    }

    /**
     * Handle EMERGENCY mode
     * @private
     */
    async _handleEmergencyMode() {
        console.error('[StorageDegradationManager] Entering EMERGENCY mode');

        this._isEmergencyMode = true;

        // Show emergency modal
        this._eventBus.emit('UI:MODAL', {
            type: 'emergency',
            title: 'Storage Full - Action Required',
            message: 'Storage quota has been exceeded. Please choose an option:',
            options: [
                {
                    label: 'Clear Old Data (Keep Active Session)',
                    action: 'clear_old_data',
                    primary: true
                },
                {
                    label: 'Export and Clear',
                    action: 'export_and_clear'
                },
                {
                    label: 'Continue in Session-Only Mode',
                    action: 'session_only_mode'
                }
            ]
        });

        // Pause non-critical operations
        this._eventBus.emit('STORAGE:PAUSE_NON_CRITICAL');
    }

    /**
     * Handle NORMAL tier
     * @private
     */
    async _handleNormalTier() {
        console.log('[StorageDegradationManager] Storage quota back to NORMAL');

        // Disable emergency/read-only modes
        this._isEmergencyMode = false;
        this._isReadOnlyMode = false;

        // Resume normal operations
        this._eventBus.emit('STORAGE:READ_ONLY_MODE', { enabled: false });
        this._eventBus.emit('STORAGE:RESUME_NON_CRITICAL');

        // Reset LRU eviction to normal
        this._eventBus.emit('LRU:EVICTION_POLICY', {
            mode: 'normal',
            targetRatio: 1.0
        });
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
                        if (this._currentMetrics && bytesFreed > this._currentMetrics.usageBytes * 0.1) {
                            console.log('[StorageDegradationManager] Freed 10% of usage, stopping cleanup');
                            break;
                        }
                    }
                } catch (error) {
                    console.error(`[StorageDegradationManager] Failed to cleanup ${item.key}:`, error);
                }
            }

            return {
                success: true,
                bytesFreed,
                itemsDeleted,
                operationsPerformed,
                error: null
            };

        } catch (error) {
            console.error('[StorageDegradationManager] Cleanup failed:', error);
            return {
                success: false,
                bytesFreed,
                itemsDeleted,
                operationsPerformed,
                error
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
        console.log('[StorageDegradationManager] Performing emergency cleanup');

        // Clean everything except NEVER_DELETE priority
        return await this._performCleanup(CleanupPriority.LOW);
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
                case 'session':
                    const sessionResult = await this._cleanupOldSessions();
                    bytesFreed += sessionResult.bytesFreed;
                    itemsDeleted += sessionResult.itemsDeleted;
                    operations.push(...sessionResult.operations);
                    break;

                case 'embedding':
                    const embedResult = await this._clearEmbeddings();
                    bytesFreed += embedResult.bytesFreed;
                    itemsDeleted += embedResult.itemsDeleted;
                    operations.push(...embedResult.operations);
                    break;

                case 'chunk':
                    const chunkResult = await this._cleanupOldChunks();
                    bytesFreed += chunkResult.bytesFreed;
                    itemsDeleted += chunkResult.itemsDeleted;
                    operations.push(...chunkResult.operations);
                    break;

                case 'stream':
                    const streamResult = await this._cleanupOldStreams();
                    bytesFreed += streamResult.bytesFreed;
                    itemsDeleted += streamResult.itemsDeleted;
                    operations.push(...streamResult.operations);
                    break;
            }

            return {
                success: true,
                bytesFreed,
                itemsDeleted,
                operations,
                error: null
            };

        } catch (error) {
            console.error(`[StorageDegradationManager] Failed to cleanup ${item.key}:`, error);
            return {
                success: false,
                bytesFreed: 0,
                itemsDeleted: 0,
                operations: [],
                error
            };
        } finally {
            performance.measure(`cleanup-item-${item.key}`, `cleanup-item-${item.key}-start`);
        }
    }

    /**
     * Cleanup old chat sessions with batched parallel processing
     * @private
     * @returns {Promise<CleanupResult>} Cleanup result
     */
    async _cleanupOldSessions() {
        try {
            const sessions = await Storage.getAllChatSessions();
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
                return sessionAge > threshold && session.id !== Storage.getActiveSessionId();
            });

            // Batch processing to avoid event loop blocking
            const BATCH_SIZE = 10;
            for (let i = 0; i < sessionsToDelete.length; i += BATCH_SIZE) {
                const batch = sessionsToDelete.slice(i, i + BATCH_SIZE);

                // Process batch in parallel
                await Promise.all(batch.map(async (session) => {
                    try {
                        await Storage.deleteChatSession(session.id);
                        itemsDeleted++;
                        bytesFreed += 2048; // Estimate 2KB per session
                        operations.push(`deleted_session_${session.id}`);
                    } catch (error) {
                        console.warn(`[StorageDegradationManager] Failed to delete session ${session.id}:`, error);
                        // Continue with other sessions even if one fails
                    }
                }));

                // Yield to event loop between batches
                await new Promise(resolve => setTimeout(resolve, 0));
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
            const { VectorLRUCache } = await import('../storage/lru-cache.js');
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
                error: null
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
            const chunks = await Storage.getChunks();
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
                await Promise.all(batch.map(async (chunk) => {
                    try {
                        await Storage.deleteChunk(chunk.id);
                        itemsDeleted++;
                        bytesFreed += 10240; // Estimate 10KB per chunk
                        operations.push(`deleted_chunk_${chunk.id}`);
                    } catch (error) {
                        console.warn(`[StorageDegradationManager] Failed to delete chunk ${chunk.id}:`, error);
                        // Continue with other chunks even if one fails
                    }
                }));

                // Yield to event loop between batches
                await new Promise(resolve => setTimeout(resolve, 0));
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
            const streams = await Storage.getStreams();
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
                await Promise.all(batch.map(async (stream) => {
                    try {
                        await Storage.deleteStream(stream.id);
                        itemsDeleted++;
                        bytesFreed += 512; // Estimate 512B per stream
                        operations.push(`deleted_stream_${stream.id}`);
                    } catch (error) {
                        console.warn(`[StorageDegradationManager] Failed to delete stream ${stream.id}:`, error);
                        // Continue with other streams even if one fails
                    }
                }));

                // Yield to event loop between batches
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            return { success: true, bytesFreed, itemsDeleted, operations, error: null };

        } catch (error) {
            return { success: false, bytesFreed: 0, itemsDeleted: 0, operations: [], error };
        }
    }

    /**
     * Get current degradation tier
     * @public
     * @returns {DegradationTier} Current tier
     */
    getCurrentTier() {
        return this._currentTier;
    }

    /**
     * Get current storage metrics
     * @public
     * @returns {StorageQuotaMetrics|null} Current metrics
     */
    getCurrentMetrics() {
        return this._currentMetrics;
    }

    /**
     * Check if in read-only mode
     * @public
     * @returns {boolean} True if in read-only mode
     */
    isReadOnlyMode() {
        return this._isReadOnlyMode;
    }

    /**
     * Check if in emergency mode
     * @public
     * @returns {boolean} True if in emergency mode
     */
    isEmergencyMode() {
        return this._isEmergencyMode;
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
     * Set auto-cleanup enabled state
     * @public
     * @param {boolean} enabled - Whether auto-cleanup should be enabled
     */
    setAutoCleanupEnabled(enabled) {
        this._autoCleanupEnabled = enabled;
    }

    /**
     * Export current storage data
     * @public
     * @returns {Promise<Blob>} Exported data as blob
     */
    async exportStorageData() {
        const data = {
            personality: await Storage.getPersonalityResult(),
            sessions: await Storage.getAllChatSessions(),
            streams: await Storage.getStreams(),
            chunks: await Storage.getChunks(),
            settings: await Storage.getAllSettings(),
            timestamp: Date.now(),
            version: '1.0.0'
        };

        const json = JSON.stringify(data, null, 2);
        return new Blob([json], { type: 'application/json' });
    }

    /**
     * Clear all data except critical
     * @public
     * @returns {Promise<CleanupResult>} Cleanup result
     */
    async clearAllData() {
        performance.mark('storage-clear-all-start');

        try {
            let bytesFreed = 0;
            let itemsDeleted = 0;
            const operations = [];

            // Clear all sessions except active
            const sessionResult = await this._cleanupOldSessions();
            bytesFreed += sessionResult.bytesFreed;
            itemsDeleted += sessionResult.itemsDeleted;
            operations.push(...sessionResult.operations);

            // Clear embeddings
            const embedResult = await this._clearEmbeddings();
            bytesFreed += embedResult.bytesFreed;
            itemsDeleted += embedResult.itemsDeleted;
            operations.push(...embedResult.operations);

            // Clear chunks
            const chunkResult = await this._cleanupOldChunks();
            bytesFreed += chunkResult.bytesFreed;
            itemsDeleted += chunkResult.itemsDeleted;
            operations.push(...chunkResult.operations);

            // Clear old streams
            const streamResult = await this._cleanupOldStreams();
            bytesFreed += streamResult.bytesFreed;
            itemsDeleted += streamResult.itemsDeleted;
            operations.push(...streamResult.operations);

            performance.measure('storage-clear-all', 'storage-clear-all-start');

            return {
                success: true,
                bytesFreed,
                itemsDeleted,
                operations,
                error: null
            };

        } catch (error) {
            console.error('[StorageDegradationManager] Failed to clear all data:', error);
            return {
                success: false,
                bytesFreed: 0,
                itemsDeleted: 0,
                operations: [],
                error
            };
        }
    }

    // ==========================================
    // P2.7: Embedding Freeze During Storage Crisis
    // ==========================================

    /**
     * Check if embedding generation should be frozen
     * HNW Hierarchy: Prevents storage crisis from worsening during high-usage tiers
     * 
     * @public
     * @returns {boolean} True if embedding generation should be paused
     */
    isEmbeddingFrozen() {
        // Freeze embeddings at CRITICAL tier or above
        const frozenTiers = [
            DegradationTier.CRITICAL,
            DegradationTier.EXCEEDED,
            DegradationTier.EMERGENCY
        ];
        return frozenTiers.includes(this._currentTier);
    }

    /**
     * Check if a specific operation should be blocked
     * @public
     * @param {string} operationType - Operation type to check
     * @returns {{ blocked: boolean, reason?: string }}
     */
    shouldBlockOperation(operationType) {
        if (operationType === 'embedding') {
            if (this.isEmbeddingFrozen()) {
                return {
                    blocked: true,
                    reason: `Embedding generation paused: storage at ${this._currentTier} tier`
                };
            }
        }

        if (this._isReadOnlyMode && ['write', 'update', 'delete'].includes(operationType)) {
            return {
                blocked: true,
                reason: 'Storage is in read-only mode due to quota constraints'
            };
        }

        return { blocked: false };
    }

    // ==========================================
    // P2.4: Storage Breakdown by Category
    // ==========================================

    /**
     * Get storage breakdown by category
     * HNW Network: Shows storage distribution for informed cleanup decisions
     * 
     * @public
     * @returns {Promise<Object>} Storage breakdown with sizes and percentages
     */
    async getStorageBreakdown() {
        const breakdown = {
            sessions: { count: 0, estimatedBytes: 0, priority: 'medium' },
            embeddings: { count: 0, estimatedBytes: 0, priority: 'aggressive' },
            chunks: { count: 0, estimatedBytes: 0, priority: 'high' },
            streams: { count: 0, estimatedBytes: 0, priority: 'high' },
            personality: { count: 0, estimatedBytes: 0, priority: 'never' },
            settings: { count: 0, estimatedBytes: 0, priority: 'never' }
        };

        try {
            // Sessions
            const sessions = await Storage.getAllChatSessions?.() || [];
            breakdown.sessions.count = sessions.length;
            breakdown.sessions.estimatedBytes = JSON.stringify(sessions).length;

            // Streams
            const streams = await Storage.getStreams?.() || [];
            breakdown.streams.count = streams.length;
            breakdown.streams.estimatedBytes = JSON.stringify(streams).length;

            // Chunks (estimate)
            const chunks = await Storage.getChunks?.() || [];
            breakdown.chunks.count = chunks.length;
            breakdown.chunks.estimatedBytes = JSON.stringify(chunks).length;

            // Personality
            const personality = await Storage.getPersonalityResult?.();
            if (personality) {
                breakdown.personality.count = 1;
                breakdown.personality.estimatedBytes = JSON.stringify(personality).length;
            }

            // Settings
            const settings = await Storage.getAllSettings?.() || {};
            breakdown.settings.count = Object.keys(settings).length;
            breakdown.settings.estimatedBytes = JSON.stringify(settings).length;

            // Embeddings - estimate from LRU cache if available
            try {
                const { LocalVectorStore } = await import('../local-vector-store.js');
                if (LocalVectorStore?.getStats) {
                    const stats = LocalVectorStore.getStats();
                    breakdown.embeddings.count = stats.vectorCount || 0;
                    // Estimate 2KB per embedding (384 dims * 4 bytes + overhead)
                    breakdown.embeddings.estimatedBytes = breakdown.embeddings.count * 2048;
                }
            } catch (e) {
                // Vector store not available
            }

            // Calculate totals and percentages
            const totalBytes = Object.values(breakdown).reduce((sum, cat) => sum + cat.estimatedBytes, 0);
            for (const category of Object.keys(breakdown)) {
                breakdown[category].percentage = totalBytes > 0
                    ? Math.round((breakdown[category].estimatedBytes / totalBytes) * 100)
                    : 0;
            }

            breakdown.total = {
                estimatedBytes: totalBytes,
                formattedSize: this._formatBytes(totalBytes)
            };

            return breakdown;

        } catch (error) {
            console.error('[StorageDegradationManager] Failed to get storage breakdown:', error);
            return breakdown;
        }
    }

    /**
     * Format bytes to human-readable string
     * @private
     * @param {number} bytes - Bytes to format
     * @returns {string} Formatted string
     */
    _formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Export singleton instance
export default new StorageDegradationManager();