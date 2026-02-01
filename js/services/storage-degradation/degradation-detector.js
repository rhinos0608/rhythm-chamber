/**
 * Degradation Detector - Quota Monitoring and Tier Detection
 *
 * Monitors storage quota usage and detects degradation tiers.
 * Responsible for:
 * - Quota monitoring with periodic checks
 * - Storage metrics calculation
 * - Degradation tier determination
 * - IndexedDB fallback estimation
 *
 * @module DegradationDetector
 * @author Rhythm Chamber Architecture Team
 * @version 1.0.0
 */

/**
 * Degradation tier enumeration
 * @readonly
 * @enum {string}
 */
export const DegradationTier = Object.freeze({
    NORMAL: 'normal', // < 80% quota used
    WARNING: 'warning', // 80-94% quota used
    CRITICAL: 'critical', // 95-99% quota used
    EXCEEDED: 'exceeded', // 100% quota used
    EMERGENCY: 'emergency', // Emergency mode activated
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
 * DegradationDetector Class
 *
 * Monitors storage quota and detects degradation tiers.
 */
export class DegradationDetector {
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
     * @type {EventBus}
     */
    _eventBus;

    /**
     * Initialize the DegradationDetector
     * @public
     * @param {Object} options - Configuration options
     * @param {EventBus} options.eventBus - Event bus instance
     * @param {number} options.checkIntervalMs - Quota check interval in milliseconds
     */
    constructor(options = {}) {
        const { eventBus = null, checkIntervalMs = 30000 } = options;
        this._eventBus = eventBus;
        this._checkIntervalMs = checkIntervalMs;

        this._startQuotaMonitoring();

        performance.mark('degradation-detector-init');
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
                // Notify tier change (handled by TierHandlers)
                if (this._eventBus) {
                    this._eventBus.emit('STORAGE:TIER_CHANGE', {
                        oldTier: this._currentTier,
                        newTier,
                        metrics,
                        reason: 'quota_check',
                    });
                }

                this._currentTier = newTier;
            }

            // Emit quota status event
            if (this._eventBus) {
                this._eventBus.emit('STORAGE:QUOTA_STATUS', {
                    tier: this._currentTier,
                    metrics,
                });
            }
        } catch (error) {
            console.error('[DegradationDetector] Failed to check quota:', error);
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
                availableBytes: quotaBytes - usageBytes,
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
                availableBytes: quotaBytes - usageBytes,
            };
        } catch (error) {
            console.error('[DegradationDetector] Failed to estimate storage:', error);
            return {
                usageBytes: 0,
                quotaBytes: 50 * 1024 * 1024,
                usagePercent: 0,
                tier: DegradationTier.NORMAL,
                availableBytes: 50 * 1024 * 1024,
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
     * Manually trigger quota check
     * @public
     * @returns {Promise<void>}
     */
    async checkQuotaNow() {
        await this._checkQuotaAndDegrade();
    }
}
