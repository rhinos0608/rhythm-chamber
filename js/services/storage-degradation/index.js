/**
 * Storage Degradation Manager - Facade
 *
 * Thin facade that composes degradation detector, cleanup strategies, and tier handlers
 * while maintaining backward compatibility with the original StorageDegradationManager.
 *
 * This module re-exports all types, enums, and provides a unified StorageDegradationManager
 * class that composes the three focused modules.
 *
 * @module storage-degradation
 * @author Rhythm Chamber Architecture Team
 * @version 1.0.0
 */

import { DegradationDetector, DegradationTier } from './degradation-detector.js';
import { CleanupStrategies, CleanupPriority } from './cleanup-strategies.js';
import { TierHandlers } from './tier-handlers.js';

// Re-export enums for backward compatibility
export { DegradationTier, CleanupPriority };

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
 * Facade that composes DegradationDetector, CleanupStrategies, and TierHandlers
 * to provide the original StorageDegradationManager API with backward compatibility.
 */
export class StorageDegradationManager {
    /**
     * @private
     * @type {DegradationDetector}
     */
    _detector;

    /**
     * @private
     * @type {CleanupStrategies}
     */
    _cleanup;

    /**
     * @private
     * @type {TierHandlers}
     */
    _handlers;

    /**
     * @private
     * @type {EventBus}
     */
    _eventBus;

    /**
     * Initialize the StorageDegradationManager
     * @public
     * @param {Object} options - Configuration options
     * @param {EventBus} options.eventBus - Event bus instance
     * @param {boolean} options.autoCleanupEnabled - Enable automatic cleanup
     * @param {number} options.checkIntervalMs - Quota check interval in milliseconds
     */
    constructor(options = {}) {
        const { eventBus = null, autoCleanupEnabled = true, checkIntervalMs = 30000 } = options;
        this._eventBus = eventBus;

        // Initialize cleanup and handlers first (before detector)
        this._cleanup = new CleanupStrategies({
            eventBus,
            storage: null // Will use default Storage import
        });

        this._handlers = new TierHandlers({
            eventBus,
            cleanupStrategies: this._cleanup,
            autoCleanupEnabled
        });

        // Wire up tier changes from detector to handlers BEFORE creating detector
        // This ensures the initial tier change event is captured
        if (eventBus) {
            eventBus.on('STORAGE:TIER_CHANGE', async (event, data) => {
                // Only handle quota_check events to avoid duplication
                if (data.reason === 'quota_check') {
                    // Sync cleanup strategies with new tier
                    this._cleanup.setCurrentTier(data.newTier);
                    this._cleanup.setCurrentMetrics(data.metrics);

                    // Sync handler's tier state
                    this._handlers.setCurrentTier(data.newTier);

                    // Let handlers manage the transition (without re-emitting event)
                    await this._handlers.transitionTo(data.newTier);
                }
            });

            // Monitor quota changes for immediate checks
            eventBus.on('STORAGE:QUOTA_CHANGE', async () => {
                await this._detector.checkQuotaNow();
            });
        }

        // Now initialize detector - its initial check will be captured by the listener above
        this._detector = new DegradationDetector({
            eventBus,
            checkIntervalMs
        });

        performance.mark('storage-degradation-manager-init');
    }

    // ==========================================
    // Degradation Detection Methods
    // ==========================================

    /**
     * Get current degradation tier
     * @public
     * @returns {DegradationTier} Current tier
     */
    getCurrentTier() {
        return this._detector.getCurrentTier();
    }

    /**
     * Get current storage metrics
     * @public
     * @returns {StorageQuotaMetrics|null} Current metrics
     */
    getCurrentMetrics() {
        return this._detector.getCurrentMetrics();
    }

    /**
     * Manually trigger quota check
     * @public
     * @returns {Promise<void>}
     */
    async checkQuotaNow() {
        await this._detector.checkQuotaNow();
    }

    /**
     * Stop quota monitoring
     * @public
     */
    stopQuotaMonitoring() {
        this._detector.stopQuotaMonitoring();
    }

    // ==========================================
    // Tier Handler Methods
    // ==========================================

    /**
     * Check if in read-only mode
     * @public
     * @returns {boolean} True if in read-only mode
     */
    isReadOnlyMode() {
        return this._handlers.isReadOnlyMode();
    }

    /**
     * Check if in emergency mode
     * @public
     * @returns {boolean} True if in emergency mode
     */
    isEmergencyMode() {
        return this._handlers.isEmergencyMode();
    }

    /**
     * Set auto-cleanup enabled state
     * @public
     * @param {boolean} enabled - Whether auto-cleanup should be enabled
     */
    setAutoCleanupEnabled(enabled) {
        this._handlers.setAutoCleanupEnabled(enabled);
    }

    // ==========================================
    // Cleanup Methods
    // ==========================================

    /**
     * Manually trigger cleanup
     * @public
     * @param {CleanupPriority} priority - Cleanup priority level
     * @returns {Promise<CleanupResult>} Cleanup result
     */
    async triggerCleanup(priority = CleanupPriority.MEDIUM) {
        return await this._cleanup.triggerCleanup(priority);
    }

    /**
     * Manually trigger emergency cleanup
     * @public
     * @returns {Promise<CleanupResult>} Cleanup result
     */
    async triggerEmergencyCleanup() {
        return await this._cleanup.triggerEmergencyCleanup();
    }

    // ==========================================
    // Utility Methods
    // ==========================================

    /**
     * Export current storage data
     * @public
     * @returns {Promise<Blob>} Exported data as blob
     */
    async exportStorageData() {
        const { Storage } = await import('../../storage.js');
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

        const result = await this._cleanup.performFullCleanup();

        performance.measure('storage-clear-all', 'storage-clear-all-start');

        return result;
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
        return frozenTiers.includes(this._detector.getCurrentTier());
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
                    reason: `Embedding generation paused: storage at ${this._detector.getCurrentTier()} tier`
                };
            }
        }

        if (this._handlers.isReadOnlyMode() && ['write', 'update', 'delete'].includes(operationType)) {
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
            const { Storage } = await import('../../storage.js');

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
                const { LocalVectorStore } = await import('../../local-vector-store.js');
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

// Export singleton instance for backward compatibility
export default new StorageDegradationManager();
