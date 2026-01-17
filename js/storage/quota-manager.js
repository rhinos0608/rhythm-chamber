/**
 * QuotaManager - Storage Quota Monitoring Service
 * 
 * Monitors IndexedDB storage quota and emits events at defined thresholds.
 * Works with StorageDegradationManager for tier-based degradation.
 * 
 * HNW Hierarchy: Reports quota status to StorageDegradationManager for policy decisions
 * HNW Network: Emits events via EventBus for UI and other services to consume
 * HNW Wave: Polls periodically with option for on-demand checks after large writes
 * 
 * @module storage/quota-manager
 */

import { EventBus } from '../services/event-bus.js';

// ==========================================
// Quota Thresholds Configuration
// ==========================================

const QUOTA_CONFIG = {
    // Warning threshold (80% of quota)
    warningThreshold: 0.80,

    // Critical threshold (95% of quota) - writes may be blocked
    criticalThreshold: 0.95,

    // Polling interval in milliseconds (60 seconds)
    pollIntervalMs: 60000,

    // Minimum bytes written to trigger post-write check
    largeWriteThresholdBytes: 1024 * 1024, // 1MB

    // Default quota if navigator.storage.estimate() fails (50MB)
    fallbackQuotaBytes: 50 * 1024 * 1024
};

// ==========================================
// Internal State
// ==========================================

let pollIntervalId = null;
let currentStatus = {
    usageBytes: 0,
    quotaBytes: QUOTA_CONFIG.fallbackQuotaBytes,
    percentage: 0,
    isBlocked: false,
    tier: 'normal' // 'normal' | 'warning' | 'critical'
};
let isInitialized = false;

// ==========================================
// Core Functions
// ==========================================

/**
 * Initialize quoter manager and start polling
 * @param {Object} [options] - Configuration options
 * @param {number} [options.pollIntervalMs] - Override polling interval
 * @param {number} [options.warningThreshold] - Override warning threshold (0-1)
 * @param {number} [options.criticalThreshold] - Override critical threshold (0-1)
 */
async function init(options = {}) {
    if (isInitialized) {
        console.log('[QuotaManager] Already initialized');
        return currentStatus;
    }

    // Apply options
    if (options.pollIntervalMs) QUOTA_CONFIG.pollIntervalMs = options.pollIntervalMs;
    if (options.warningThreshold) QUOTA_CONFIG.warningThreshold = options.warningThreshold;
    if (options.criticalThreshold) QUOTA_CONFIG.criticalThreshold = options.criticalThreshold;

    isInitialized = true;

    // Initial check
    await checkNow();

    // Start polling
    startPolling();

    console.log('[QuotaManager] Initialized with polling every', QUOTA_CONFIG.pollIntervalMs, 'ms');
    return currentStatus;
}

/**
 * Check quota immediately and update status
 * @returns {Promise<QuotaStatus>} Current quota status
 */
async function checkNow() {
    try {
        const estimate = await getStorageEstimate();
        const previousTier = currentStatus.tier;

        currentStatus = {
            usageBytes: estimate.usage,
            quotaBytes: estimate.quota,
            percentage: (estimate.usage / estimate.quota) * 100,
            availableBytes: estimate.quota - estimate.usage,
            isBlocked: false,
            tier: 'normal'
        };

        // Determine tier and emit events
        if (currentStatus.percentage >= QUOTA_CONFIG.criticalThreshold * 100) {
            currentStatus.tier = 'critical';
            currentStatus.isBlocked = true;

            if (previousTier !== 'critical') {
                EventBus.emit('storage:quota_critical', {
                    usageBytes: currentStatus.usageBytes,
                    quotaBytes: currentStatus.quotaBytes,
                    percentage: currentStatus.percentage
                });
            }
        } else if (currentStatus.percentage >= QUOTA_CONFIG.warningThreshold * 100) {
            currentStatus.tier = 'warning';

            if (previousTier === 'normal') {
                EventBus.emit('storage:quota_warning', {
                    usageBytes: currentStatus.usageBytes,
                    quotaBytes: currentStatus.quotaBytes,
                    percentage: currentStatus.percentage
                });
            }
        } else if (previousTier !== 'normal') {
            // Recovered from warning/critical
            currentStatus.tier = 'normal';
            EventBus.emit('storage:quota_normal', {
                usageBytes: currentStatus.usageBytes,
                quotaBytes: currentStatus.quotaBytes,
                percentage: currentStatus.percentage
            });
        }

        return currentStatus;
    } catch (error) {
        console.error('[QuotaManager] Failed to check quota:', error);
        return currentStatus;
    }
}

/**
 * Get storage estimate from navigator.storage API
 * @private
 * @returns {Promise<{usage: number, quota: number}>}
 */
async function getStorageEstimate() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        return {
            usage: estimate.usage || 0,
            quota: estimate.quota || QUOTA_CONFIG.fallbackQuotaBytes
        };
    }

    // Fallback: return unknown estimate
    console.warn('[QuotaManager] navigator.storage.estimate() not available');
    return {
        usage: 0,
        quota: QUOTA_CONFIG.fallbackQuotaBytes
    };
}

/**
 * Start polling for quota changes
 * @private
 */
function startPolling() {
    if (pollIntervalId) {
        clearInterval(pollIntervalId);
    }

    pollIntervalId = setInterval(async () => {
        await checkNow();
    }, QUOTA_CONFIG.pollIntervalMs);
}

/**
 * Stop polling
 */
function stopPolling() {
    if (pollIntervalId) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
    }
}

/**
 * Get current quota status
 * @returns {QuotaStatus} Current status
 */
function getStatus() {
    return { ...currentStatus };
}

/**
 * Check if writes are blocked due to quota
 * @returns {boolean} True if writes should be blocked
 */
function isWriteBlocked() {
    return currentStatus.isBlocked;
}

/**
 * Notify QuotaManager of a large write for immediate quota check
 * Should be called after writes larger than largeWriteThresholdBytes
 * @param {number} bytesWritten - Number of bytes written
 */
async function notifyLargeWrite(bytesWritten) {
    if (bytesWritten >= QUOTA_CONFIG.largeWriteThresholdBytes) {
        console.log('[QuotaManager] Large write detected, checking quota');
        await checkNow();
    }
}

/**
 * Set warning threshold
 * @param {number} threshold - Threshold as decimal (0-1)
 */
function setWarningThreshold(threshold) {
    if (threshold > 0 && threshold < 1) {
        QUOTA_CONFIG.warningThreshold = threshold;
    }
}

/**
 * Set critical threshold
 * @param {number} threshold - Threshold as decimal (0-1)
 */
function setCriticalThreshold(threshold) {
    if (threshold > 0 && threshold < 1) {
        QUOTA_CONFIG.criticalThreshold = threshold;
    }
}

/**
 * Reset QuotaManager state (for testing)
 */
function reset() {
    stopPolling();
    isInitialized = false;
    currentStatus = {
        usageBytes: 0,
        quotaBytes: QUOTA_CONFIG.fallbackQuotaBytes,
        percentage: 0,
        isBlocked: false,
        tier: 'normal'
    };
}

// ==========================================
// Public API
// ==========================================

/**
 * @typedef {Object} QuotaStatus
 * @property {number} usageBytes - Current usage in bytes
 * @property {number} quotaBytes - Total quota in bytes
 * @property {number} percentage - Usage percentage (0-100)
 * @property {number} availableBytes - Available bytes
 * @property {boolean} isBlocked - Whether writes are blocked
 * @property {string} tier - Current tier ('normal', 'warning', 'critical')
 */

export const QuotaManager = {
    init,
    checkNow,
    getStatus,
    isWriteBlocked,
    notifyLargeWrite,
    setWarningThreshold,
    setCriticalThreshold,
    stopPolling,
    reset,

    // Expose config for testing
    get config() {
        return { ...QUOTA_CONFIG };
    }
};

console.log('[QuotaManager] Quota monitoring service loaded');
