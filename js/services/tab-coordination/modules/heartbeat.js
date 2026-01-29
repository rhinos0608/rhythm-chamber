/**
 * Tab Coordinator - Heartbeat Module
 *
 * Handles heartbeat management:
 * - Sends periodic heartbeats from primary tab
 * - Monitors leader heartbeat on secondary tabs
 * - Triggers re-election if leader is missed
 * - Tracks heartbeat quality metrics
 *
 * @module tab-coordination/modules/heartbeat
 */

import { DeviceDetection } from '../../device-detection.js';
import { WaveTelemetry } from '../../wave-telemetry.js';
import { MESSAGE_TYPES, TAB_ID, vectorClock } from '../constants.js';
import {
    getHeartbeatIntervalMs,
    getMaxMissedHeartbeats,
    TimingConfig
} from '../timing.js';
import { sendMessage } from './message-sender.js';
import { getIsPrimaryTab } from './authority.js';
import { initiateReElection } from './election.js';

// ==========================================
// Heartbeat State
// ==========================================

let heartbeatInterval = null;
let heartbeatCheckInterval = null;
let lastLeaderHeartbeat = Date.now();
let lastLeaderVectorClock = vectorClock.toJSON();
let lastHeartbeatSentTime = 0;
let heartbeatInProgress = false;

// ==========================================
// Heartbeat Getters
// ==========================================

/**
 * Get last leader heartbeat timestamp
 */
export function getLastLeaderHeartbeat() {
    return lastLeaderHeartbeat;
}

/**
 * Set last leader heartbeat timestamp
 */
export function setLastLeaderHeartbeat(timestamp) {
    lastLeaderHeartbeat = timestamp;
}

/**
 * Get last leader vector clock
 */
export function getLastLeaderVectorClock() {
    return lastLeaderVectorClock;
}

/**
 * Set last leader vector clock
 */
export function setLastLeaderVectorClock(clock) {
    lastLeaderVectorClock = clock;
}

/**
 * Check if heartbeat is currently in progress
 */
export function isHeartbeatInProgress() {
    return heartbeatInProgress;
}

// ==========================================
// Heartbeat Sending (Primary Only)
// ==========================================

/**
 * Start periodic heartbeat (primary tab only)
 */
export function startHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }

    WaveTelemetry.setExpected('heartbeat_interval', getHeartbeatIntervalMs());

    sendHeartbeat().catch(error => {
        console.error('[TabCoordination] Initial heartbeat failed:', error);
    });

    heartbeatInterval = setInterval(async () => {
        if (heartbeatInProgress) return;

        heartbeatInProgress = true;
        try {
            await sendHeartbeat();
        } catch (e) {
            console.error('[TabCoordination] Heartbeat error:', e);
        } finally {
            heartbeatInProgress = false;
        }
    }, getHeartbeatIntervalMs());
}

/**
 * Stop periodic heartbeat
 */
export function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

/**
 * Send heartbeat message to all tabs
 */
async function sendHeartbeat() {
    const wallClockTime = Date.now();
    const currentVectorClock = vectorClock.tick();

    if (lastHeartbeatSentTime > 0) {
        const actualInterval = wallClockTime - lastHeartbeatSentTime;
        WaveTelemetry.record('heartbeat_interval', actualInterval);
        DeviceDetection.recordHeartbeatQuality(actualInterval);
    }

    lastHeartbeatSentTime = wallClockTime;

    await sendMessage({
        type: MESSAGE_TYPES.HEARTBEAT,
        tabId: TAB_ID,
        timestamp: wallClockTime,
        vectorClock: currentVectorClock,
        deviceInfo: {
            isMobile: DeviceDetection.isMobile(),
            networkQuality: DeviceDetection.getNetworkState().quality
        }
    });
}

// ==========================================
// Heartbeat Monitoring (Secondary Only)
// ==========================================

/**
 * Start monitoring leader heartbeat (secondary tab only)
 */
export function startHeartbeatMonitor() {
    if (heartbeatCheckInterval) {
        clearInterval(heartbeatCheckInterval);
    }

    lastLeaderHeartbeat = Date.now();

    heartbeatCheckInterval = setInterval(() => {
        const now = Date.now();
        const maxMissed = getMaxMissedHeartbeats();
        const intervalMs = getHeartbeatIntervalMs();
        const maxAgeMs = intervalMs * maxMissed + TimingConfig.failover.promotionDelayMs;

        if (now - lastLeaderHeartbeat > maxAgeMs) {
            initiateReElection().catch(e => {
                console.error('[TabCoordination] Re-election failed:', e);
            });
        }
    }, 500);
}

/**
 * Stop monitoring leader heartbeat
 */
export function stopHeartbeatMonitor() {
    if (heartbeatCheckInterval) {
        clearInterval(heartbeatCheckInterval);
        heartbeatCheckInterval = null;
    }
}

// ==========================================
// Cleanup
// ==========================================

/**
 * Stop all heartbeat intervals
 */
export function cleanupHeartbeat() {
    stopHeartbeat();
    stopHeartbeatMonitor();
    lastLeaderHeartbeat = Date.now();
    lastHeartbeatSentTime = 0;
    heartbeatInProgress = false;
}
