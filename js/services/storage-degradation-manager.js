/**
 * Storage Degradation Manager - Facade
 *
 * This is a FACADE that re-exports all storage degradation functionality
 * from focused modules. Maintains backward compatibility with existing imports.
 *
 * Module structure:
 * - degradation-detector: Quota monitoring and tier detection
 * - cleanup-strategies: Automatic cleanup strategies
 * - tier-handlers: Tier-specific behavior management
 *
 * @module services/storage-degradation-manager
 * @example
 * import { StorageDegradationManager } from './services/storage-degradation-manager.js';
 * const manager = new StorageDegradationManager();
 * await manager.checkQuotaNow();
 */

// Import internal coordinator
import * as Internal from './storage-degradation/index.js';

// ==========================================
// Re-export Enums and Constants
// ==========================================

export { DegradationTier, CleanupPriority } from './storage-degradation/degradation-detector.js';

// ==========================================
// StorageDegradationManager Class (Backward Compatible)
// ==========================================

export class StorageDegradationManager {
    /**
     * Initialize the StorageDegradationManager
     * @public
     * @param {Object} options - Configuration options
     * @param {EventBus} options.eventBus - Event bus instance
     * @param {boolean} options.autoCleanupEnabled - Enable automatic cleanup
     * @param {number} options.checkIntervalMs - Quota check interval in milliseconds
     */
    constructor(options = {}) {
        this._internal = new Internal.StorageDegradationManager(options);
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
        return this._internal.getCurrentTier();
    }

    /**
     * Get current storage metrics
     * @public
     * @returns {Object|null} Current metrics
     */
    getCurrentMetrics() {
        return this._internal.getCurrentMetrics();
    }

    /**
     * Manually trigger quota check
     * @public
     * @returns {Promise<void>}
     */
    async checkQuotaNow() {
        return this._internal.checkQuotaNow();
    }

    /**
     * Stop quota monitoring
     * @public
     */
    stopQuotaMonitoring() {
        return this._internal.stopQuotaMonitoring();
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
        return this._internal.isReadOnlyMode();
    }

    /**
     * Check if in emergency mode
     * @public
     * @returns {boolean} True if in emergency mode
     */
    isEmergencyMode() {
        return this._internal.isEmergencyMode();
    }

    /**
     * Set auto-cleanup enabled state
     * @public
     * @param {boolean} enabled - Whether auto-cleanup should be enabled
     */
    setAutoCleanupEnabled(enabled) {
        return this._internal.setAutoCleanupEnabled(enabled);
    }

    // ==========================================
    // Cleanup Methods
    // ==========================================

    /**
     * Manually trigger cleanup
     * @public
     * @param {CleanupPriority} priority - Cleanup priority level
     * @returns {Promise<Object>} Cleanup result
     */
    async triggerCleanup(priority) {
        return await this._internal.triggerCleanup(priority);
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
        return await this._internal.exportStorageData();
    }

    /**
     * Clear all data except critical
     * @public
     * @returns {Promise<Object>} Cleanup result
     */
    async clearAllData() {
        return await this._internal.clearAllData();
    }

    /**
     * Check if embedding generation should be frozen
     * @public
     * @returns {boolean} True if embedding generation should be paused
     */
    isEmbeddingFrozen() {
        return this._internal.isEmbeddingFrozen();
    }

    /**
     * Check if a specific operation should be blocked
     * @public
     * @param {string} operationType - Operation type to check
     * @returns {{ blocked: boolean, reason?: string }}
     */
    shouldBlockOperation(operationType) {
        return this._internal.shouldBlockOperation(operationType);
    }

    /**
     * Get storage breakdown by category
     * @public
     * @returns {Promise<Object>} Storage breakdown with sizes and percentages
     */
    async getStorageBreakdown() {
        return await this._internal.getStorageBreakdown();
    }
}

// ==========================================
// Export all from internal index
// ==========================================

export * from './storage-degradation/index.js';

// Export default instance for backward compatibility
export default new StorageDegradationManager();
