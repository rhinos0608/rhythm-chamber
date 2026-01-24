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

const DEFAULT_QUOTA_CONFIG = Object.freeze({
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
});

// Mutable config that can be modified
let QUOTA_CONFIG = { ...DEFAULT_QUOTA_CONFIG };

// ==========================================
// Internal State
// ==========================================

let pollIntervalId = null;
let currentStatus = {
    usageBytes: 0,
    quotaBytes: DEFAULT_QUOTA_CONFIG.fallbackQuotaBytes,
    percentage: 0,
    availableBytes: DEFAULT_QUOTA_CONFIG.fallbackQuotaBytes, // Initial available = full quota
    isBlocked: false,
    tier: 'normal' // 'normal' | 'warning' | 'critical'
};
let isInitialized = false;

// ==========================================
// Reservation Mechanism (CRITICAL FIX for Issue #5)
// ==========================================

/**
 * CRITICAL FIX for Issue #5: Pending write reservations to prevent TOCTOU race
 *
 * Tracks pending writes that have passed quota checks but not yet completed.
 * This prevents the time-of-check-to-time-of-use (TOCTOU) race condition where:
 * 1. checkWriteFits() passes (space available)
 * 2. Another operation writes data
 * 3. Original write exceeds quota
 *
 * Reservations are automatically released after a timeout to prevent stale locks.
 */
const pendingReservations = new Map(); // reservationId -> { size, timestamp }
const RESERVATION_TIMEOUT_MS = 30000; // 30 seconds - auto-release stale reservations
let reservationIdCounter = 0;

/**
 * Create a write reservation
 * CRITICAL FIX for Issue #5: Reserve space before write to prevent TOCTOU race
 *
 * @param {number} sizeBytes - Size to reserve
 * @returns {string} Reservation ID for later release
 */
function createReservation(sizeBytes) {
    const reservationId = `res_${Date.now()}_${++reservationIdCounter}`;
    pendingReservations.set(reservationId, {
        size: sizeBytes,
        timestamp: Date.now()
    });
    console.log(`[QuotaManager] Created reservation ${reservationId} for ${sizeBytes} bytes`);
    return reservationId;
}

/**
 * Release a write reservation
 * CRITICAL FIX for Issue #5: Release reservation after write completes or fails
 *
 * @param {string} reservationId - Reservation ID to release
 */
function releaseReservation(reservationId) {
    if (pendingReservations.has(reservationId)) {
        const reservation = pendingReservations.get(reservationId);
        pendingReservations.delete(reservationId);
        console.log(`[QuotaManager] Released reservation ${reservationId} (${reservation.size} bytes)`);
    }
}

/**
 * Get total reserved bytes
 * CRITICAL FIX for Issue #5: Calculate total pending reservations
 *
 * @returns {number} Total reserved bytes
 */
function getTotalReservedBytes() {
    let total = 0;
    const now = Date.now();

    // Clean up expired reservations while calculating
    for (const [id, reservation] of pendingReservations.entries()) {
        if (now - reservation.timestamp > RESERVATION_TIMEOUT_MS) {
            console.warn(`[QuotaManager] Auto-releasing stale reservation ${id}`);
            pendingReservations.delete(id);
        } else {
            total += reservation.size;
        }
    }

    return total;
}

/**
 * Clean up stale reservations
 * CRITICAL FIX for Issue #5: Periodic cleanup of expired reservations
 */
function cleanupStaleReservations() {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, reservation] of pendingReservations.entries()) {
        if (now - reservation.timestamp > RESERVATION_TIMEOUT_MS) {
            console.warn(`[QuotaManager] Auto-releasing stale reservation ${id}`);
            pendingReservations.delete(id);
            cleaned++;
        }
    }

    if (cleaned > 0) {
        console.log(`[QuotaManager] Cleaned up ${cleaned} stale reservation(s)`);
    }
}

// Event listeners (for threshold_exceeded, quota_cleaned, etc.)
const eventListeners = new Map();

// Cleanup threshold - triggers archival at 90%
const CLEANUP_THRESHOLD_PERCENT = 90;

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
        return { ...currentStatus }; // Return shallow copy
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
    return { ...currentStatus }; // Return shallow copy
}

/**
 * Check quota immediately and update status
 * CRITICAL FIX for High Issue #12: Accounts for pending writes in quota estimation
 * CRITICAL FIX for Issue #5: Includes reserved bytes in quota calculation
 *
 * Previous implementation only checked current usage, missing writes that are pending
 * in the WAL or operation queue. This version accepts pendingWriteSizeBytes parameter
 * to provide accurate quota estimation before large writes.
 *
 * @param {number} [pendingWriteSizeBytes=0] - Size of pending writes not yet committed
 * @returns {Promise<QuotaStatus>} Current quota status
 */
async function checkNow(pendingWriteSizeBytes = 0) {
    try {
        const estimate = await getStorageEstimate();
        const previousTier = currentStatus.tier;

        // CRITICAL FIX for Issue #5: Include reserved bytes in effective usage
        // This prevents TOCTOU race condition by accounting for pending reservations
        const reservedBytes = getTotalReservedBytes();

        // CRITICAL FIX for High Issue #12: Include pending writes in effective usage
        // This prevents scenarios where a check passes but actual write exceeds quota
        const effectiveUsage = estimate.usage + (pendingWriteSizeBytes || 0) + reservedBytes;
        const effectivePercentage = (effectiveUsage / estimate.quota) * 100;
        const effectiveAvailable = estimate.quota - effectiveUsage;

        currentStatus = {
            usageBytes: effectiveUsage,
            quotaBytes: estimate.quota,
            percentage: effectivePercentage,
            availableBytes: effectiveAvailable,
            isBlocked: false,
            tier: 'normal'
        };

        // Determine tier and emit events based on effective percentage
        if (effectivePercentage >= QUOTA_CONFIG.criticalThreshold * 100) {
            currentStatus.tier = 'critical';
            currentStatus.isBlocked = true;

            if (previousTier !== 'critical') {
                EventBus.emit('storage:quota_critical', {
                    usageBytes: currentStatus.usageBytes,
                    quotaBytes: currentStatus.quotaBytes,
                    percentage: currentStatus.percentage,
                    pendingWriteSizeBytes: pendingWriteSizeBytes
                });
            }
        } else if (effectivePercentage >= QUOTA_CONFIG.warningThreshold * 100) {
            currentStatus.tier = 'warning';

            // Emit warning on any transition INTO warning tier (from normal or critical)
            if (previousTier !== 'warning') {
                EventBus.emit('storage:quota_warning', {
                    usageBytes: currentStatus.usageBytes,
                    quotaBytes: currentStatus.quotaBytes,
                    percentage: currentStatus.percentage,
                    pendingWriteSizeBytes: pendingWriteSizeBytes
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

        // Emit threshold_exceeded when crossing cleanup threshold (90%)
        // Use effective percentage for this check
        if (effectivePercentage >= CLEANUP_THRESHOLD_PERCENT) {
            const thresholdPayload = {
                percent: currentStatus.percentage,
                usageBytes: currentStatus.usageBytes,
                quotaBytes: currentStatus.quotaBytes,
                availableBytes: currentStatus.availableBytes,
                pendingWriteSizeBytes: pendingWriteSizeBytes
            };
            emitLocalEvent('threshold_exceeded', thresholdPayload);
            EventBus.emit('storage:threshold_exceeded', thresholdPayload);
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
        // CRITICAL FIX for Issue #5: Clean up stale reservations periodically
        cleanupStaleReservations();
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
 * CRITICAL FIX for High Issue #12: Pre-flight quota check before large writes
 *
 * @param {number} bytesWritten - Number of bytes written
 * @param {number} [pendingBytes=0] - Additional pending bytes to account for
 */
async function notifyLargeWrite(bytesWritten, pendingBytes = 0) {
    if (bytesWritten >= QUOTA_CONFIG.largeWriteThresholdBytes) {
        console.log('[QuotaManager] Large write detected, checking quota');
        // Include any pending bytes in the quota check
        await checkNow(pendingBytes);
    }
}

/**
 * Check if a write of given size would fit within quota limits
 * CRITICAL FIX for High Issue #12: Pre-flight quota estimation
 * CRITICAL FIX for Issue #5: Creates reservation to prevent TOCTOU race condition
 *
 * @param {number} writeSizeBytes - Size of write to check
 * @returns {Promise<{ fits: boolean, currentStatus: QuotaStatus, reservationId?: string }>}
 */
async function checkWriteFits(writeSizeBytes) {
    // CRITICAL FIX for Issue #5: Check quota including existing reservations
    const status = await checkNow(0); // checkNow already includes reservations

    const fits = !status.isBlocked && status.availableBytes >= writeSizeBytes;

    let reservationId;
    if (fits) {
        // CRITICAL FIX for Issue #5: Create reservation to prevent TOCTOU race
        // Caller must release this reservation after write completes
        reservationId = createReservation(writeSizeBytes);
    }

    return {
        fits,
        currentStatus: status,
        reservationId // CRITICAL FIX for Issue #5: Return reservation ID for later release
    };
}

/**
 * Set warning threshold
 * @param {number} threshold - Threshold as decimal (0-1)
 * @returns {boolean} True if threshold was set
 */
function setWarningThreshold(threshold) {
    if (threshold > 0 && threshold < 1) {
        // Ensure warning < critical
        if (threshold >= QUOTA_CONFIG.criticalThreshold) {
            console.error('[QuotaManager] Warning threshold must be less than critical threshold');
            return false;
        }
        QUOTA_CONFIG.warningThreshold = threshold;
        return true;
    }
    return false;
}

/**
 * Set critical threshold
 * @param {number} threshold - Threshold as decimal (0-1)
 * @returns {boolean} True if threshold was set
 */
function setCriticalThreshold(threshold) {
    if (threshold > 0 && threshold < 1) {
        // Ensure critical > warning
        if (threshold <= QUOTA_CONFIG.warningThreshold) {
            console.error('[QuotaManager] Critical threshold must be greater than warning threshold');
            return false;
        }
        QUOTA_CONFIG.criticalThreshold = threshold;
        return true;
    }
    return false;
}

/**
 * Reset QuotaManager state (for testing)
 * CRITICAL FIX for Issue #5: Also clears pending reservations
 */
function reset() {
    stopPolling();
    isInitialized = false;

    // Restore config to defaults
    QUOTA_CONFIG = { ...DEFAULT_QUOTA_CONFIG };

    currentStatus = {
        usageBytes: 0,
        quotaBytes: DEFAULT_QUOTA_CONFIG.fallbackQuotaBytes,
        percentage: 0,
        availableBytes: DEFAULT_QUOTA_CONFIG.fallbackQuotaBytes,
        isBlocked: false,
        tier: 'normal'
    };

    // CRITICAL FIX for Issue #5: Clear pending reservations
    pendingReservations.clear();
    reservationIdCounter = 0;

    // Clear event listeners
    eventListeners.clear();
}

// ==========================================
// Event Listener API
// ==========================================

/**
 * Emit event to local listeners
 * @private
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
function emitLocalEvent(event, data) {
    const listeners = eventListeners.get(event);
    if (listeners) {
        for (const listener of listeners) {
            try {
                listener(data);
            } catch (error) {
                console.error(`[QuotaManager] Error in ${event} listener:`, error);
            }
        }
    }
}

/**
 * Subscribe to QuotaManager events
 * @param {string} event - Event name ('threshold_exceeded', 'quota_cleaned')
 * @param {function} handler - Event handler
 * @returns {function} Unsubscribe function
 */
function on(event, handler) {
    if (typeof handler !== 'function') {
        console.error('[QuotaManager] Handler must be a function');
        return () => { };
    }

    if (!eventListeners.has(event)) {
        eventListeners.set(event, new Set());
    }
    eventListeners.get(event).add(handler);

    console.log(`[QuotaManager] Subscribed to ${event}`);

    // Return unsubscribe function
    return () => off(event, handler);
}

/**
 * Unsubscribe from QuotaManager events
 * @param {string} event - Event name
 * @param {function} handler - Event handler to remove
 */
function off(event, handler) {
    const listeners = eventListeners.get(event);
    if (listeners) {
        listeners.delete(handler);
        console.log(`[QuotaManager] Unsubscribed from ${event}`);
    }
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
    checkWriteFits,  // CRITICAL FIX for High Issue #12: Pre-flight quota estimation
    setWarningThreshold,
    setCriticalThreshold,
    stopPolling,
    reset,

    // CRITICAL FIX for Issue #5: Reservation management API
    createReservation,
    releaseReservation,
    getTotalReservedBytes,
    cleanupStaleReservations,

    // Event listener API
    on,
    off,

    // Expose config for testing
    get config() {
        return { ...QUOTA_CONFIG };
    },

    // Expose cleanup threshold for testing
    get cleanupThreshold() {
        return CLEANUP_THRESHOLD_PERCENT;
    }
};

console.log('[QuotaManager] Quota monitoring service loaded');
