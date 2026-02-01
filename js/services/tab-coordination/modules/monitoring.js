/**
 * Tab Coordinator - Monitoring Module
 *
 * Handles device monitoring setup:
 * - Network monitoring
 * - Visibility monitoring
 * - Wake from sleep detection
 *
 * @module tab-coordination/modules/monitoring
 */

import { DeviceDetection } from '../../device-detection.js';
import { setupWakeFromSleepDetection } from './sleep-detection.js';

// ==========================================
// Monitoring State
// ==========================================

let visibilityMonitorCleanup = null;
let networkMonitorCleanup = null;
let wakeFromSleepCleanup = null;

// ==========================================
// Monitoring Setup
// ==========================================

/**
 * Setup network monitoring
 * @returns {Function|null} Cleanup function or null if not supported
 */
export function setupNetworkMonitoring() {
    if (typeof window === 'undefined') {
        return null;
    }

    return DeviceDetection.startNetworkMonitoring?.() || null;
}

/**
 * Setup all monitoring
 * @returns {Object} Cleanup functions for each monitor
 */
export function setupAllMonitoring() {
    visibilityMonitorCleanup = DeviceDetection.startVisibilityMonitoring?.() || null;
    networkMonitorCleanup = setupNetworkMonitoring();
    wakeFromSleepCleanup = setupWakeFromSleepDetection();

    return {
        visibility: visibilityMonitorCleanup,
        network: networkMonitorCleanup,
        wakeFromSleep: wakeFromSleepCleanup,
    };
}

// ==========================================
// Cleanup
// ==========================================

/**
 * Cleanup all monitoring
 */
export function cleanupMonitoring() {
    if (visibilityMonitorCleanup) {
        visibilityMonitorCleanup();
        visibilityMonitorCleanup = null;
    }

    if (networkMonitorCleanup) {
        networkMonitorCleanup();
        networkMonitorCleanup = null;
    }

    if (wakeFromSleepCleanup) {
        wakeFromSleepCleanup();
        wakeFromSleepCleanup = null;
    }
}

/**
 * Get cleanup functions for all monitors
 */
export function getCleanupFunctions() {
    return {
        visibility: visibilityMonitorCleanup,
        network: networkMonitorCleanup,
        wakeFromSleep: wakeFromSleepCleanup,
    };
}
