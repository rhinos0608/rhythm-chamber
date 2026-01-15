/**
 * IndexedDB Quota Monitor
 * 
 * Provides storage quota estimation and monitoring for user feedback.
 * Displays usage like "Using 45MB of 120MB available" in settings and header.
 * 
 * @module storage/quota-monitor
 */

'use strict';

// ==========================================
// Constants
// ==========================================

const QUOTA_WARNING_THRESHOLD = 0.80; // 80% usage triggers warning
const QUOTA_CRITICAL_THRESHOLD = 0.95; // 95% usage triggers critical
const UPDATE_INTERVAL_MS = 30000; // Update every 30 seconds

// ==========================================
// State
// ==========================================

let cachedEstimate = null;
let updateInterval = null;
let listeners = [];

// ==========================================
// Core Functions
// ==========================================

/**
 * Get storage estimate using StorageManager API
 * Falls back to navigator.webkitTemporaryStorage for legacy browsers
 * @returns {Promise<{used: number, available: number, quota: number}>}
 */
async function getStorageEstimate() {
    try {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            return {
                used: estimate.usage || 0,
                quota: estimate.quota || 0,
                available: (estimate.quota || 0) - (estimate.usage || 0)
            };
        }

        // Fallback for older browsers (Chrome < 55)
        if (navigator.webkitTemporaryStorage) {
            return new Promise((resolve) => {
                navigator.webkitTemporaryStorage.queryUsageAndQuota(
                    (used, quota) => resolve({ used, quota, available: quota - used }),
                    () => resolve({ used: 0, quota: 0, available: 0 })
                );
            });
        }

        // No API available
        console.warn('[QuotaMonitor] Storage API not available');
        return { used: 0, quota: 0, available: 0 };
    } catch (error) {
        console.error('[QuotaMonitor] Error getting storage estimate:', error);
        return { used: 0, quota: 0, available: 0 };
    }
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Bytes to format
 * @param {number} decimals - Decimal places (default 1)
 * @returns {string} Formatted string (e.g., "45.2 MB")
 */
function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

/**
 * Get quota status with human-readable values
 * @returns {Promise<{
 *   used: number,
 *   available: number,
 *   quota: number,
 *   usedFormatted: string,
 *   availableFormatted: string,
 *   quotaFormatted: string,
 *   percentUsed: number,
 *   status: 'ok' | 'warning' | 'critical',
 *   displayText: string
 * }>}
 */
async function getQuotaStatus() {
    const estimate = await getStorageEstimate();
    cachedEstimate = estimate;

    const percentUsed = estimate.quota > 0
        ? (estimate.used / estimate.quota) * 100
        : 0;

    let status = 'ok';
    if (percentUsed >= QUOTA_CRITICAL_THRESHOLD * 100) {
        status = 'critical';
    } else if (percentUsed >= QUOTA_WARNING_THRESHOLD * 100) {
        status = 'warning';
    }

    const displayText = estimate.quota > 0
        ? `Using ${formatBytes(estimate.used)} of ${formatBytes(estimate.quota)} available`
        : 'Storage quota unknown';

    return {
        used: estimate.used,
        available: estimate.available,
        quota: estimate.quota,
        usedFormatted: formatBytes(estimate.used),
        availableFormatted: formatBytes(estimate.available),
        quotaFormatted: formatBytes(estimate.quota),
        percentUsed: Math.round(percentUsed * 10) / 10, // 1 decimal place
        status,
        displayText
    };
}

/**
 * Check if storage is approaching limit
 * @returns {Promise<boolean>}
 */
async function isQuotaWarning() {
    const status = await getQuotaStatus();
    return status.status === 'warning' || status.status === 'critical';
}

/**
 * Check if storage is critically low
 * @returns {Promise<boolean>}
 */
async function isQuotaCritical() {
    const status = await getQuotaStatus();
    return status.status === 'critical';
}

// ==========================================
// UI Integration
// ==========================================

/**
 * Update quota display in settings modal
 * Creates the element if it doesn't exist
 */
async function updateSettingsDisplay() {
    const status = await getQuotaStatus();

    // Find or create quota display in settings
    let container = document.getElementById('quota-display-settings');
    if (!container) {
        // Settings modal may not be open, that's OK
        return;
    }

    container.innerHTML = `
        <div class="quota-info">
            <div class="quota-bar-container">
                <div class="quota-bar" style="width: ${Math.min(status.percentUsed, 100)}%; 
                    background: ${status.status === 'critical' ? 'var(--error, #e74c3c)' :
            status.status === 'warning' ? 'var(--warning, #f39c12)' :
                'var(--accent, #3498db)'};"></div>
            </div>
            <span class="quota-text">${status.displayText}</span>
            <span class="quota-percent ${status.status}">${status.percentUsed.toFixed(1)}%</span>
        </div>
    `;
}

/**
 * Update quota warning in header (only shows when approaching limit)
 */
async function updateHeaderWarning() {
    const status = await getQuotaStatus();

    // Only show warning in header when approaching limit
    if (status.status === 'ok') {
        // Remove warning if exists
        const existing = document.getElementById('quota-warning-header');
        if (existing) {
            existing.remove();
        }
        return;
    }

    // Find header
    const headerRight = document.querySelector('.header-right');
    if (!headerRight) return;

    // Create or update warning badge
    let warning = document.getElementById('quota-warning-header');
    if (!warning) {
        warning = document.createElement('span');
        warning.id = 'quota-warning-header';
        warning.className = `quota-warning-badge ${status.status}`;
        headerRight.insertBefore(warning, headerRight.firstChild);
    }

    warning.innerHTML = `
        <span class="quota-icon">${status.status === 'critical' ? '⚠️' : '📊'}</span>
        <span class="quota-label">${status.percentUsed.toFixed(0)}% storage</span>
    `;
    warning.title = status.displayText;
    warning.className = `quota-warning-badge ${status.status}`;
}

/**
 * Update all quota displays
 */
async function updateQuotaDisplay() {
    await Promise.all([
        updateSettingsDisplay(),
        updateHeaderWarning()
    ]);

    // Notify listeners
    const status = await getQuotaStatus();
    listeners.forEach(listener => {
        try {
            listener(status);
        } catch (error) {
            console.error('[QuotaMonitor] Listener error:', error);
        }
    });
}

/**
 * Start periodic quota monitoring
 */
function startMonitoring() {
    if (updateInterval) {
        clearInterval(updateInterval);
    }

    // Initial update
    updateQuotaDisplay();

    // Periodic updates
    updateInterval = setInterval(updateQuotaDisplay, UPDATE_INTERVAL_MS);

    console.log('[QuotaMonitor] Started monitoring (interval: ' + UPDATE_INTERVAL_MS + 'ms)');
}

/**
 * Stop monitoring
 */
function stopMonitoring() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
}

/**
 * Register a listener for quota changes
 * @param {Function} callback - Called with quota status
 * @returns {Function} Unsubscribe function
 */
function onQuotaChange(callback) {
    listeners.push(callback);
    return () => {
        const index = listeners.indexOf(callback);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    };
}

/**
 * Get cached estimate (synchronous, may be stale)
 * @returns {{used: number, available: number, quota: number} | null}
 */
function getCachedEstimate() {
    return cachedEstimate;
}

// ==========================================
// Public API
// ==========================================

export const QuotaMonitor = {
    // Core
    getStorageEstimate,
    getQuotaStatus,
    formatBytes,

    // Status checks
    isQuotaWarning,
    isQuotaCritical,

    // UI
    updateQuotaDisplay,
    updateSettingsDisplay,
    updateHeaderWarning,

    // Monitoring
    startMonitoring,
    stopMonitoring,
    onQuotaChange,

    // Cache
    getCachedEstimate,

    // Constants
    QUOTA_WARNING_THRESHOLD,
    QUOTA_CRITICAL_THRESHOLD
};

// Make available globally for backwards compatibility
if (typeof window !== 'undefined') {
    window.QuotaMonitor = QuotaMonitor;
}

console.log('[QuotaMonitor] Module loaded');
