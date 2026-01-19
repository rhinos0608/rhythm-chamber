/**
 * Tab Coordination Service
 * 
 * Handles cross-tab coordination using BroadcastChannel with deterministic leader election.
 * Part of the HNW architecture to prevent data corruption from multiple tabs.
 * 
 * @module services/tab-coordination
 */

import { VectorClock } from './vector-clock.js';
import { WaveTelemetry } from './wave-telemetry.js';
import { EventBus } from './event-bus.js';
import { DeviceDetection } from './device-detection.js';
import { SharedWorkerCoordinator } from '../workers/shared-worker-coordinator.js';

// ==========================================
// Constants
// ==========================================

const CHANNEL_NAME = 'rhythm_chamber_coordination';

/**
 * Calculate adaptive election window based on device performance
 * HNW Wave: Accounts for device speed variations to ensure reliable elections
 * 
 * @returns {number} Election window in milliseconds (300-600ms range)
 */
function calculateElectionWindow() {
    // Default baseline for fast devices
    const BASELINE_MS = 300;
    const MAX_WINDOW_MS = 600;

    // Defensive: If Performance API unavailable, use baseline
    if (typeof performance === 'undefined' || !performance.now) {
        console.log('[TabCoordination] Performance API unavailable, using baseline');
        return BASELINE_MS;
    }

    try {
        // Calibration task: measure device speed
        const iterations = 10000;
        const start = performance.now();

        // Simple compute task that correlates with overall device speed
        let sum = 0;
        for (let i = 0; i < iterations; i++) {
            sum += Math.random();
        }

        const duration = performance.now() - start;

        // Scale window based on duration:
        // Fast device (< 1ms): 300ms
        // Slow device (> 5ms): use proportional scaling up to 600ms
        // Formula: duration * 60 + 300, clamped to [300, 600]
        const calculated = Math.round(Math.min(MAX_WINDOW_MS, Math.max(BASELINE_MS, duration * 60 + BASELINE_MS)));

        console.log(`[TabCoordination] Device calibration: ${duration.toFixed(2)}ms → ${calculated}ms election window`);
        return calculated;
    } catch (e) {
        // Defensive: fallback to baseline on any error
        console.warn('[TabCoordination] Calibration failed, using baseline:', e.message);
        return BASELINE_MS;
    }
}

// Calculate once on module load
let ELECTION_WINDOW_MS = calculateElectionWindow();

// Initialize Vector clock for this tab (provides better conflict detection than Lamport)
const vectorClock = new VectorClock();

// Use Vector clock for deterministic ordering instead of Date.now()
// This eliminates clock skew issues between tabs and detects concurrent updates
const TAB_ID = `${vectorClock.tick()[vectorClock.processId]}-${vectorClock.processId.substring(0, 8)}`;

// Message types
const MESSAGE_TYPES = {
    CANDIDATE: 'CANDIDATE',
    CLAIM_PRIMARY: 'CLAIM_PRIMARY',
    RELEASE_PRIMARY: 'RELEASE_PRIMARY',
    HEARTBEAT: 'HEARTBEAT',
    EVENT_WATERMARK: 'EVENT_WATERMARK',     // Event replay watermark broadcast
    REPLAY_REQUEST: 'REPLAY_REQUEST',       // Request event replay from primary
    REPLAY_RESPONSE: 'REPLAY_RESPONSE'      // Replay data from primary
};

/**
 * Timing configuration - can be overridden at runtime
 * HNW Wave: Configurable timing for different environments
 */
const TimingConfig = {
    // Election timing
    election: {
        baselineMs: 300,
        maxWindowMs: 600,
        calibrationIterations: 10000,
        adaptiveMultiplier: 60
    },

    // Heartbeat timing - HNW Wave: Reduced for faster failover (~7s vs ~10s)
    heartbeat: {
        intervalMs: 3000,     // Reduced from 5000 for faster detection
        maxMissed: 2,         // 2 missed = 6s + promotion delay = ~7s total
        skewToleranceMs: 2000 // Allow 2 seconds clock skew
    },

    // Failover timing
    failover: {
        promotionDelayMs: 100,
        verificationMs: 500
    }
};

/**
 * Runtime configuration override
 * Allows changing timing parameters for testing or different environments
 * @param {Object} updates - Configuration updates to apply
 */
function configureTiming(updates) {
    // Deep merge for nested objects
    if (updates.election) {
        Object.assign(TimingConfig.election, updates.election);
    }
    if (updates.heartbeat) {
        Object.assign(TimingConfig.heartbeat, updates.heartbeat);
    }
    if (updates.failover) {
        Object.assign(TimingConfig.failover, updates.failover);
    }

    // Recalculate dependent values
    if (updates.election) {
        ELECTION_WINDOW_MS = calculateElectionWindow();
    }
    if (updates.heartbeat) {
        HEARTBEAT_INTERVAL_MS = TimingConfig.heartbeat.intervalMs;
        MAX_MISSED_HEARTBEATS = TimingConfig.heartbeat.maxMissed;
    }
}

// Heartbeat configuration (with defaults from TimingConfig)
let HEARTBEAT_INTERVAL_MS = TimingConfig.heartbeat.intervalMs;
let MAX_MISSED_HEARTBEATS = TimingConfig.heartbeat.maxMissed;
const HEARTBEAT_STORAGE_KEY = 'rhythm_chamber_leader_heartbeat';
const CLOCK_SKEW_TOLERANCE_MS = TimingConfig.heartbeat.skewToleranceMs;

/**
 * Clock skew tracking state
 * HNW Wave: Detect and compensate for wall-clock differences between tabs
 */
const clockSkewTracker = {
    detectedSkewMs: 0,
    lastSkewDetection: 0,
    skewSamples: [],
    maxSamples: 10,

    /**
     * Record a clock skew sample
     * @param {number} remoteTimestamp - Remote wall-clock timestamp
     * @param {number} localTimestamp - Local wall-clock timestamp
     */
    recordSkew(remoteTimestamp, localTimestamp) {
        const skew = remoteTimestamp - localTimestamp;
        this.skewSamples.push({
            skew,
            timestamp: Date.now()
        });

        // Keep only recent samples
        if (this.skewSamples.length > this.maxSamples) {
            this.skewSamples.shift();
        }

        // Update detected skew (average of recent samples)
        const recentSamples = this.skewSamples.slice(-5);

        // Guard against division by zero and empty samples
        if (!recentSamples || recentSamples.length === 0) {
            // Default to zero skew when no data available
            this.detectedSkewMs = 0;
            this.lastSkewDetection = Date.now();
            return;
        }

        const avgSkew = recentSamples.reduce((sum, s) => sum + s.skew, 0) / recentSamples.length;

        this.detectedSkewMs = avgSkew;
        this.lastSkewDetection = Date.now();

        // Log significant skew
        if (Math.abs(avgSkew) > 1000) {
            console.warn(`[TabCoordination] Detected ${avgSkew.toFixed(0)}ms clock skew`);
        }
    },

    /**
     * Get current clock skew estimate
     * @returns {number} Estimated clock skew in milliseconds
     */
    getSkew() {
        return this.detectedSkewMs;
    },

    /**
     * Adjust local timestamp by detected skew
     * @param {number} localTimestamp - Local wall-clock timestamp
     * @returns {number} Skew-adjusted timestamp
     */
    adjustTimestamp(localTimestamp) {
        return localTimestamp + this.detectedSkewMs;
    },

    /**
     * Check if timestamps are within skew tolerance
     * @param {number} timestamp1 - First timestamp
     * @param {number} timestamp2 - Second timestamp
     * @returns {boolean} True if within tolerance
     */
    isWithinTolerance(timestamp1, timestamp2) {
        const diff = Math.abs(timestamp1 - timestamp2);
        return diff <= CLOCK_SKEW_TOLERANCE_MS;
    },

    /**
     * Reset skew tracking
     */
    reset() {
        this.detectedSkewMs = 0;
        this.lastSkewDetection = 0;
        this.skewSamples = [];
    }
};

// ==========================================
// State Management
// ==========================================

let broadcastChannel = null;
let sharedWorkerFallback = false; // Track if using SharedWorker fallback
let coordinationTransport = null; // Unified interface for BroadcastChannel or SharedWorker
let isPrimaryTab = true;
let electionTimeout = null;
let messageHandler = null;
let heartbeatInterval = null;
let heartbeatCheckInterval = null;
let lastLeaderHeartbeat = Date.now();
let lastLeaderVectorClock = vectorClock.toJSON(); // Track Vector clock for heartbeat
let lastLeaderLamportTime = 0; // Track Lamport time for heartbeat (legacy, kept for compatibility)
let adaptiveTiming = null;
let visibilityMonitorCleanup = null;
let networkMonitorCleanup = null;
let wakeFromSleepCleanup = null;

// Module-scoped election state to prevent race conditions
let electionCandidates = new Set();
let receivedPrimaryClaim = false;
let electionAborted = false;
let lastHeartbeatSentTime = 0; // Track for WaveTelemetry

// Event replay watermark tracking
let lastEventWatermark = -1; // Last event sequence number processed
let knownWatermarks = new Map(); // Track watermarks from other tabs: tabId -> watermark
let watermarkBroadcastInterval = null;
const WATERMARK_BROADCAST_MS = 5000; // Broadcast watermark every 5 seconds

// Debug mode flag for conditional logging
let debugMode = false;

// Wake-from-sleep detection state
// HNW Wave: Detects OS sleep by tracking visibility change gaps
let lastVisibilityCheckTime = Date.now();
const SLEEP_DETECTION_THRESHOLD_MS = 30000; // 30 seconds gap indicates OS sleep

// ==========================================
// Core Functions
// ==========================================

/**
 * Initialize adaptive timing based on device and network conditions
 * HNW Wave: Mobile-aware timing configuration
 */
function initAdaptiveTiming() {
    adaptiveTiming = DeviceDetection.getAdaptiveTiming();

    // Update heartbeat configuration
    HEARTBEAT_INTERVAL_MS = adaptiveTiming.heartbeat.intervalMs;
    MAX_MISSED_HEARTBEATS = adaptiveTiming.heartbeat.maxMissed;

    // Update TimingConfig for consistency
    TimingConfig.heartbeat.intervalMs = HEARTBEAT_INTERVAL_MS;
    TimingConfig.heartbeat.maxMissed = MAX_MISSED_HEARTBEATS;
    TimingConfig.heartbeat.visibilityWaitMs = adaptiveTiming.heartbeat.visibilityWaitMs;

    // Recalculate election window for mobile
    ELECTION_WINDOW_MS = adaptiveTiming.election.windowMs;

    console.log('[TabCoordination] Adaptive timing initialized:', {
        deviceType: DeviceDetection.getDeviceInfo().deviceType,
        heartbeatInterval: HEARTBEAT_INTERVAL_MS,
        maxMissed: MAX_MISSED_HEARTBEATS,
        visibilityWait: adaptiveTiming.heartbeat.visibilityWaitMs,
        networkQuality: DeviceDetection.getNetworkState().quality
    });
}

/**
 * Proactive clock skew calibration
 * HNW Wave: Calibrate clock skew BEFORE elections to ensure accurate timing
 * 
 * Uses localStorage timestamp exchange to detect timing differences between tabs
 * without relying on BroadcastChannel messages.
 * 
 * @returns {Promise<void>}
 */
async function calibrateClockSkew() {
    const CALIBRATION_KEY = 'rhythm_chamber_clock_calibration';
    const CALIBRATION_DURATION_MS = 500;

    try {
        const localStart = Date.now();

        // Write our timestamp to localStorage
        localStorage.setItem(CALIBRATION_KEY, JSON.stringify({
            timestamp: localStart,
            tabId: TAB_ID
        }));

        // Wait for other tabs to potentially update
        await new Promise(resolve => setTimeout(resolve, CALIBRATION_DURATION_MS));

        // Read back and check for other tab timestamps
        const stored = localStorage.getItem(CALIBRATION_KEY);
        if (stored) {
            const data = JSON.parse(stored);
            if (data.tabId !== TAB_ID) {
                // Another tab wrote - calculate skew
                const localNow = Date.now();
                const remoteTimestamp = data.timestamp;
                clockSkewTracker.recordSkew(remoteTimestamp, localNow);
                console.log(`[TabCoordination] Proactive clock calibration: ` +
                    `detected ${clockSkewTracker.getSkew().toFixed(0)}ms skew from tab ${data.tabId}`);
            }
        }

        // Clean up calibration key
        localStorage.removeItem(CALIBRATION_KEY);
        console.log(`[TabCoordination] Clock calibration complete (${CALIBRATION_DURATION_MS}ms)`);
    } catch (e) {
        console.warn('[TabCoordination] Clock calibration failed:', e.message);
    }
}

/**
 * Initialize tab coordination service
 * Uses deterministic leader election (lowest tab ID wins)
 *
 * HNW Fix: Replaced 100ms timeout with proper coordination protocol
 * - All tabs announce candidacy simultaneously
 * - Wait 300ms for all candidates to announce (3x original timeout for safety)
 * - Lowest lexicographic tab ID wins (deterministic resolution)
 * - Eliminates race condition where two tabs both claim primary
 *
 * HNW Wave: Adaptive timing for mobile devices
 * - Adjusts heartbeat interval based on device type and network quality
 * - Uses visibility-aware heartbeat monitoring for background tabs
 *
 * @returns {Promise<boolean>} True if this tab won election
 */
async function init() {
    // Try BroadcastChannel first (preferred)
    if ('BroadcastChannel' in window) {
        console.log('[TabCoordination] Using BroadcastChannel for coordination');
        sharedWorkerFallback = false;
        return await initWithBroadcastChannel();
    }

    // Try SharedWorker fallback
    if (SharedWorkerCoordinator.isSupported()) {
        console.log('[TabCoordination] BroadcastChannel unavailable, trying SharedWorker fallback');
        const connected = await SharedWorkerCoordinator.init(TAB_ID);

        if (connected) {
            console.log('[TabCoordination] Using SharedWorker for coordination');
            sharedWorkerFallback = true;
            return await initWithSharedWorker();
        }
    }

    // No coordination available - assume primary (single-tab mode)
    console.warn('[TabCoordination] No cross-tab coordination available, operating in isolated mode');
    return true;
}

/**
 * Initialize with BroadcastChannel (original implementation)
 * @returns {Promise<boolean>} True if this tab won election
 */
async function initWithBroadcastChannel() {
    // HNW Wave: Initialize adaptive timing before election
    initAdaptiveTiming();

    // HNW Wave: Proactive clock calibration before election
    await calibrateClockSkew();

    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);

    // Create unified transport interface
    coordinationTransport = {
        postMessage: (msg) => broadcastChannel.postMessage(msg),
        addEventListener: (type, handler) => broadcastChannel.addEventListener(type, handler),
        removeEventListener: (type, handler) => broadcastChannel.removeEventListener(type, handler),
        close: () => broadcastChannel.close()
    };
    // Set up message handler
    messageHandler = createMessageHandler();
    broadcastChannel.addEventListener('message', messageHandler);

    // Reset election state
    electionCandidates = new Set([TAB_ID]);
    receivedPrimaryClaim = false;
    electionAborted = false;

    // Announce candidacy with Vector clock for deterministic ordering
    broadcastChannel.postMessage({
        type: MESSAGE_TYPES.CANDIDATE,
        tabId: TAB_ID,
        vectorClock: vectorClock.tick(),
        senderId: vectorClock.processId
    });

    // Wait for other candidates
    await new Promise(resolve => {
        electionTimeout = setTimeout(resolve, ELECTION_WINDOW_MS);
    });

    // Determine winner - but only if election wasn't aborted by a CLAIM_PRIMARY
    if (!electionAborted) {
        const sortedCandidates = Array.from(electionCandidates).sort();
        const winner = sortedCandidates[0];
        isPrimaryTab = (winner === TAB_ID);

        if (isPrimaryTab) {
            claimPrimary();
            console.log(`[TabCoordination] Won election against ${electionCandidates.size - 1} other candidate(s)`);
        } else {
            console.log(`[TabCoordination] Lost election to ${winner}. Becoming secondary.`);
        }
    } else {
        // Election was aborted by receiving a CLAIM_PRIMARY during the window
        // isPrimaryTab was already set to false by the handler
        console.log(`[TabCoordination] Election aborted due to primary claim from another tab`);
    }

    // Set up cleanup on unload
    window.addEventListener('beforeunload', cleanup);

    // HNW Wave: Set up visibility monitoring for adaptive heartbeat
    visibilityMonitorCleanup = DeviceDetection.startVisibilityMonitoring();

    // HNW Wave: Set up network monitoring for adaptive failover
    networkMonitorCleanup = setupNetworkMonitoring();

    // HNW Wave: Set up wake-from-sleep detection for election recovery
    wakeFromSleepCleanup = setupWakeFromSleepDetection();

    // Set up heartbeat system
    if (isPrimaryTab) {
        startHeartbeat();
        startWatermarkBroadcast(); // Start watermark broadcast as primary
    } else {
        startHeartbeatMonitor();
    }

    return isPrimaryTab;
}

/**
 * Initialize with SharedWorker fallback
 * Used when BroadcastChannel is not available
 * @returns {Promise<boolean>} True if this tab won election
 */
async function initWithSharedWorker() {
    // HNW Wave: Initialize adaptive timing before election
    initAdaptiveTiming();

    // Note: Skip clock calibration with SharedWorker (relies on worker coordination)

    // Create unified transport interface using SharedWorkerCoordinator
    coordinationTransport = {
        postMessage: (msg) => SharedWorkerCoordinator.postMessage(msg),
        addEventListener: (type, handler) => SharedWorkerCoordinator.addEventListener(type, handler),
        removeEventListener: (type, handler) => SharedWorkerCoordinator.removeEventListener(type, handler),
        close: () => SharedWorkerCoordinator.close()
    };

    // Set up message handler using unified interface
    messageHandler = createMessageHandler();
    coordinationTransport.addEventListener('message', messageHandler);

    // Reset module-scoped election state
    electionCandidates.clear();
    electionCandidates.add(TAB_ID);
    receivedPrimaryClaim = false;
    electionAborted = false;

    console.log('[TabCoordination] Announcing candidacy via SharedWorker:', TAB_ID);

    // Announce candidacy
    coordinationTransport.postMessage({
        type: MESSAGE_TYPES.CANDIDATE,
        tabId: TAB_ID,
        vectorClock: vectorClock.tick(),
        senderId: vectorClock.processId
    });

    // Wait for election window
    await new Promise(resolve => setTimeout(resolve, ELECTION_WINDOW_MS));

    // Determine winner (same logic as BroadcastChannel)

    if (!electionAborted && !receivedPrimaryClaim) {
        const sortedCandidates = Array.from(electionCandidates).sort();
        isPrimaryTab = sortedCandidates[0] === TAB_ID;

        if (isPrimaryTab) {
            console.log('[TabCoordination] Won SharedWorker election, claiming primary');
            coordinationTransport.postMessage({
                type: MESSAGE_TYPES.CLAIM_PRIMARY,
                tabId: TAB_ID,
                vectorClock: vectorClock.tick(),
                senderId: vectorClock.processId
            });
        } else {
            console.log('[TabCoordination] Lost election via SharedWorker to:', sortedCandidates[0]);
            handleSecondaryMode();
        }
    } else {
        isPrimaryTab = false;
        handleSecondaryMode();
    }

    // Set up beforeunload handler
    window.addEventListener('beforeunload', cleanup);

    // HNW Wave: Set up visibility monitoring
    visibilityMonitorCleanup = DeviceDetection.startVisibilityMonitoring();

    // HNW Wave: Set up network monitoring
    networkMonitorCleanup = setupNetworkMonitoring();

    // HNW Wave: Set up wake-from-sleep detection
    wakeFromSleepCleanup = setupWakeFromSleepDetection();

    // Set up heartbeat system
    if (isPrimaryTab) {
        startHeartbeat();
        startWatermarkBroadcast();
    } else {
        startHeartbeatMonitor();
    }

    return isPrimaryTab;
}

/**
 * Create message handler for BroadcastChannel
 */
function createMessageHandler() {
    return (event) => {
        const { type, tabId, vectorClock: remoteClock } = event.data;

        // Sync Vector clock with received message
        // This ensures logical ordering and conflict detection across all tabs
        if (remoteClock && typeof remoteClock === 'object') {
            vectorClock.merge(remoteClock);
        }

        switch (type) {
            case MESSAGE_TYPES.CANDIDATE:
                // Another tab announced candidacy - collect it for election
                // If we're already primary, assert dominance so new tab knows leader exists
                if (isPrimaryTab && tabId !== TAB_ID) {
                    coordinationTransport?.postMessage({
                        type: MESSAGE_TYPES.CLAIM_PRIMARY,
                        tabId: TAB_ID,
                        vectorClock: vectorClock.tick(),
                        senderId: vectorClock.processId
                    });
                }
                // Collect candidate for election with its timestamp for deterministic ordering
                electionCandidates.add(tabId);
                break;

            case MESSAGE_TYPES.CLAIM_PRIMARY:
                // Another tab claimed primary - we become secondary
                if (tabId !== TAB_ID) {
                    // Update module-scoped state to prevent race condition
                    receivedPrimaryClaim = true;
                    electionAborted = true;

                    if (isPrimaryTab) {
                        isPrimaryTab = false;
                        handleSecondaryMode();
                    }
                }
                break;

            case MESSAGE_TYPES.RELEASE_PRIMARY:
                // Primary tab closed - initiate new election
                if (!isPrimaryTab) {
                    initiateReElection();
                }
                break;

            case MESSAGE_TYPES.HEARTBEAT:
                // Received heartbeat from leader
                if (tabId !== TAB_ID && !isPrimaryTab) {
                    // Record clock skew from remote timestamp
                    if (event.data.timestamp) {
                        const localNow = Date.now();
                        clockSkewTracker.recordSkew(event.data.timestamp, localNow);
                    }

                    // Update both wall-clock and Lamport time tracking
                    lastLeaderHeartbeat = clockSkewTracker.adjustTimestamp(Date.now());
                    if (event.data.lamportTimestamp) {
                        lastLeaderLamportTime = event.data.lamportTimestamp;
                    }
                }
                break;

            case MESSAGE_TYPES.EVENT_WATERMARK:
                // Received watermark broadcast from another tab
                if (tabId !== TAB_ID && event.data.watermark !== undefined) {
                    knownWatermarks.set(tabId, event.data.watermark);
                    if (debugMode) {
                        console.log(`[TabCoordination] Received watermark ${event.data.watermark} from tab ${tabId}`);
                    }
                }
                break;

            case MESSAGE_TYPES.REPLAY_REQUEST:
                // Secondary tab requesting event replay
                if (isPrimaryTab && tabId !== TAB_ID) {
                    handleReplayRequest(tabId, event.data.fromWatermark);
                }
                break;

            case MESSAGE_TYPES.REPLAY_RESPONSE:
                // Primary tab responding with replay data
                if (!isPrimaryTab && tabId !== TAB_ID) {
                    handleReplayResponse(event.data.events);
                }
                break;
        }
    };
}

/**
 * Claim this tab as primary
 */
function claimPrimary() {
    isPrimaryTab = true;
    coordinationTransport?.postMessage({
        type: MESSAGE_TYPES.CLAIM_PRIMARY,
        tabId: TAB_ID
    });
    console.log('[TabCoordination] Claimed primary tab:', TAB_ID);
    notifyAuthorityChange();
}

/**
 * Handle transition to secondary mode
 */
function handleSecondaryMode() {
    console.log('[TabCoordination] Entering secondary mode (read-only)');

    // Stop watermark broadcast as we're now secondary
    stopWatermarkBroadcast();

    // Show warning modal if available
    const modal = document.getElementById('multi-tab-modal');
    if (modal) {
        modal.style.display = 'flex';
        const msgEl = modal.querySelector('.modal-message');
        if (msgEl) {
            msgEl.textContent =
                'Rhythm Chamber is open in another tab. ' +
                'This tab is now read-only to prevent data corruption. ' +
                'Close the other tab to regain full access here.';
        }
    }

    // Disable write operations
    disableWriteOperations();
    notifyAuthorityChange();
}

/**
 * Disable all write operations in secondary tab
 */
function disableWriteOperations() {
    // Disable file upload
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    if (uploadZone) {
        uploadZone.style.pointerEvents = 'none';
        uploadZone.style.opacity = '0.5';
    }
    if (fileInput) fileInput.disabled = true;

    // Disable chat input
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');
    if (chatInput) {
        chatInput.disabled = true;
        chatInput.placeholder = 'Read-only mode (close other tab to enable)';
    }
    if (chatSend) chatSend.disabled = true;

    // Disable reset
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) resetBtn.disabled = true;

    // Disable Spotify connect
    const spotifyConnectBtn = document.getElementById('spotify-connect-btn');
    if (spotifyConnectBtn) spotifyConnectBtn.disabled = true;

    // Disable new chat button
    const newChatBtn = document.getElementById('new-chat-btn');
    if (newChatBtn) newChatBtn.disabled = true;

    console.log('[TabCoordination] Write operations disabled - secondary tab mode');
}

/**
 * Initiate re-election after primary tab closes
 */
async function initiateReElection() {
    console.log('[TabCoordination] Primary tab released, initiating re-election');

    // Clear any existing election
    if (electionTimeout) {
        clearTimeout(electionTimeout);
    }

    // Reset election state
    electionCandidates = new Set([TAB_ID]);
    receivedPrimaryClaim = false;
    electionAborted = false;

    // Announce candidacy
    coordinationTransport?.postMessage({
        type: MESSAGE_TYPES.CANDIDATE,
        tabId: TAB_ID
    });

    // Wait for election window
    await new Promise(resolve => {
        electionTimeout = setTimeout(resolve, ELECTION_WINDOW_MS);
    });

    // Check if we should become primary
    // For simplicity, we'll assume we win if no other claims within window
    // In a more robust implementation, we'd collect all candidates again
    if (!isPrimaryTab && !electionAborted) {
        isPrimaryTab = true;
        claimPrimary();
        startHeartbeat();
        startWatermarkBroadcast(); // Start watermark broadcast as new primary
        stopHeartbeatMonitor();
        console.log('[TabCoordination] Became primary after re-election');
    }
}

/**
 * Start sending heartbeats (leader only)
 */
function startHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }

    // Set expected heartbeat interval for WaveTelemetry
    WaveTelemetry.setExpected('heartbeat_interval', HEARTBEAT_INTERVAL_MS);

    // Send initial heartbeat
    sendHeartbeat();

    // Start interval
    heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    console.log('[TabCoordination] Started heartbeat as leader');
}

/**
 * Send a heartbeat with both wall-clock and Vector clock timestamps
 * HNW Wave: Dual timestamp system prevents clock skew issues
 * HNW Wave: Heartbeat quality monitoring for mobile
 */
function sendHeartbeat() {
    const wallClockTime = Date.now();
    const currentVectorClock = vectorClock.tick();

    // Record actual heartbeat interval for WaveTelemetry
    if (lastHeartbeatSentTime > 0) {
        const actualInterval = wallClockTime - lastHeartbeatSentTime;
        WaveTelemetry.record('heartbeat_interval', actualInterval);

        // HNW Wave: Record heartbeat quality for mobile detection
        DeviceDetection.recordHeartbeatQuality(actualInterval);
    }
    lastHeartbeatSentTime = wallClockTime;

    // Send via coordination transport (BroadcastChannel or SharedWorker)
    coordinationTransport?.postMessage({
        type: MESSAGE_TYPES.HEARTBEAT,
        tabId: TAB_ID,
        timestamp: wallClockTime,
        vectorClock: currentVectorClock,
        senderId: vectorClock.processId,
        // HNW Wave: Include device info for adaptive follower behavior
        deviceInfo: {
            isMobile: DeviceDetection.isMobile(),
            networkQuality: DeviceDetection.getNetworkState().quality
        }
    });

    // Also store in localStorage for cross-tab fallback
    try {
        localStorage.setItem(HEARTBEAT_STORAGE_KEY, JSON.stringify({
            tabId: TAB_ID,
            timestamp: wallClockTime,
            vectorClock: currentVectorClock
        }));
    } catch (e) {
        // Ignore localStorage errors
    }
}

/**
 * Stop sending heartbeats
 */
function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

/**
 * Start monitoring leader heartbeat with skew tolerance (followers only)
 * HNW Wave: Uses both Lamport and wall-clock time with skew compensation
 */
function startHeartbeatMonitor() {
    if (heartbeatCheckInterval) {
        clearInterval(heartbeatCheckInterval);
    }

    lastLeaderHeartbeat = clockSkewTracker.adjustTimestamp(Date.now());
    lastLeaderVectorClock = vectorClock.toJSON();

    heartbeatCheckInterval = setInterval(() => {
        const maxAllowedGap = HEARTBEAT_INTERVAL_MS * MAX_MISSED_HEARTBEATS;
        const now = Date.now();
        let timeSinceLastHeartbeat = 0;

        // Check localStorage fallback with skew tolerance
        try {
            const stored = localStorage.getItem(HEARTBEAT_STORAGE_KEY);
            if (stored) {
                const { timestamp, vectorClock: storedVectorClock } = JSON.parse(stored);

                // Merge stored Vector clock for conflict detection
                if (storedVectorClock && typeof storedVectorClock === 'object') {
                    vectorClock.merge(storedVectorClock);
                    lastLeaderVectorClock = storedVectorClock;
                }

                // Calculate stored age with skew adjustment
                const storedAge = now - timestamp;
                const adjustedStoredAge = clockSkewTracker.adjustTimestamp(now) - timestamp;

                // Use the most recent timestamp
                if (adjustedStoredAge < (now - lastLeaderHeartbeat)) {
                    lastLeaderHeartbeat = clockSkewTracker.adjustTimestamp(timestamp);
                }
            }
        } catch (e) {
            // Ignore localStorage errors
        }

        // Calculate time since last heartbeat with skew tolerance
        timeSinceLastHeartbeat = clockSkewTracker.adjustTimestamp(now) - lastLeaderHeartbeat;

        // Check if heartbeat is overdue with skew tolerance
        if (timeSinceLastHeartbeat > maxAllowedGap) {
            // HNW Wave: Visibility-aware heartbeat - adaptive wait before promoting if tab may be backgrounded
            const isPageHidden = typeof document !== 'undefined' && document.hidden;
            if (isPageHidden) {
                // Primary may just be backgrounded - use adaptive visibility wait
                const visibilityWaitMs = DeviceDetection.getRecommendedVisibilityWait();
                console.log(`[TabCoordination] Leader heartbeat missed, but page hidden. Waiting ${visibilityWaitMs}ms before re-election...`);
                clearInterval(heartbeatCheckInterval);
                setTimeout(async () => {
                    // Re-check after delay
                    const recentHeartbeat = clockSkewTracker.adjustTimestamp(Date.now()) - lastLeaderHeartbeat;
                    if (recentHeartbeat > maxAllowedGap) {
                        console.log(`[TabCoordination] Still no heartbeat after visibility wait, promoting to leader`);
                        initiateReElection();
                    } else {
                        console.log(`[TabCoordination] Heartbeat received during visibility wait, resuming monitor`);
                        startHeartbeatMonitor(); // Resume monitoring
                    }
                }, visibilityWaitMs);
                return; // Exit early
            }

            console.log(`[TabCoordination] Leader heartbeat missed for ${timeSinceLastHeartbeat}ms (skew: ${clockSkewTracker.getSkew().toFixed(0)}ms), promoting to leader`);
            stopHeartbeatMonitor();
            initiateReElection();
        }

        // Note: Lamport time comparison removed as it mixes event counts with wall-clock time
        // Using wall-clock heartbeat monitoring only, which is more reliable for failover detection
    }, HEARTBEAT_INTERVAL_MS);

    console.log('[TabCoordination] Started heartbeat monitor as follower with skew tolerance');
}

/**
 * Stop monitoring heartbeat
 */
function stopHeartbeatMonitor() {
    if (heartbeatCheckInterval) {
        clearInterval(heartbeatCheckInterval);
        heartbeatCheckInterval = null;
    }
}

/**
 * Setup network monitoring for adaptive failover behavior
 * HNW Network: Adjust failover behavior based on network quality
 *
 * @returns {Function} Cleanup function
 */
function setupNetworkMonitoring() {
    const networkCleanup = DeviceDetection.startNetworkMonitoring();

    const handleNetworkChange = (newQuality, oldQuality) => {
        if (!adaptiveTiming) return;

        console.log(`[TabCoordination] Network quality changed: ${oldQuality} → ${newQuality}`);

        // Re-initialize adaptive timing based on new network conditions
        initAdaptiveTiming();

        // Update heartbeat intervals if we're the leader
        if (isPrimaryTab && heartbeatInterval) {
            stopHeartbeat();
            startHeartbeat();
            console.log('[TabCoordination] Heartbeat restarted with adaptive timing:', {
                interval: HEARTBEAT_INTERVAL_MS,
                maxMissed: MAX_MISSED_HEARTBEATS
            });
        }

        // Update monitor intervals if we're a follower
        if (!isPrimaryTab && heartbeatCheckInterval) {
            stopHeartbeatMonitor();
            startHeartbeatMonitor();
        }
    };

    const unsubscribe = DeviceDetection.onNetworkChange(handleNetworkChange);

    return () => {
        networkCleanup();
        unsubscribe();
    };
}

/**
 * Setup wake-from-sleep detection
 * HNW Wave: Detects OS sleep by tracking large time gaps between visibility changes.
 * When a gap > 30s is detected on visibility becoming visible, triggers immediate re-election.
 * 
 * @returns {Function} Cleanup function
 */
function setupWakeFromSleepDetection() {
    const handleVisibilityChange = () => {
        const now = Date.now();
        const gap = now - lastVisibilityCheckTime;

        // Update the check time
        lastVisibilityCheckTime = now;

        if (!document.hidden && gap > SLEEP_DETECTION_THRESHOLD_MS) {
            // Device woke up from sleep - large time gap detected
            console.log(`[TabCoordination] Wake-from-sleep detected (${(gap / 1000).toFixed(1)}s gap)`);

            // Trigger immediate leader election regardless of current role
            // This ensures clean state after possible stale heartbeats during sleep
            console.log('[TabCoordination] Triggering immediate re-election after sleep recovery');
            initiateReElection();
        }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also update check time periodically when tab is active to prevent false positives
    const intervalId = setInterval(() => {
        if (!document.hidden) {
            lastVisibilityCheckTime = Date.now();
        }
    }, 10000); // Update every 10 seconds when visible

    console.log('[TabCoordination] Wake-from-sleep detection initialized');

    return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        clearInterval(intervalId);
    };
}

// ==========================================
// Event Replay Coordination
// ==========================================

/**
 * Start broadcasting event watermark
 * Only primary tab broadcasts its watermark for secondary tabs to track
 */
function startWatermarkBroadcast() {
    if (watermarkBroadcastInterval) {
        clearInterval(watermarkBroadcastInterval);
    }

    watermarkBroadcastInterval = setInterval(() => {
        broadcastWatermark();
    }, WATERMARK_BROADCAST_MS);

    console.log('[TabCoordination] Started watermark broadcast');
}

/**
 * Stop broadcasting event watermark
 */
function stopWatermarkBroadcast() {
    if (watermarkBroadcastInterval) {
        clearInterval(watermarkBroadcastInterval);
        watermarkBroadcastInterval = null;
    }
}

/**
 * Broadcast current event watermark to all tabs
 */
function broadcastWatermark() {
    if (!broadcastChannel) return;

    broadcastChannel.postMessage({
        type: MESSAGE_TYPES.EVENT_WATERMARK,
        tabId: TAB_ID,
        watermark: lastEventWatermark,
        vectorClock: vectorClock.tick(),
        senderId: vectorClock.processId
    });
}

/**
 * Update local event watermark
 * @param {number} watermark - New watermark value
 */
function updateEventWatermark(watermark) {
    lastEventWatermark = watermark;
    // Broadcast watermark update immediately if primary
    if (isPrimaryTab) {
        broadcastWatermark();
    }
}

/**
 * Get current event watermark
 * @returns {number} Current watermark
 */
function getEventWatermark() {
    return lastEventWatermark;
}

/**
 * Get known watermarks from all tabs
 * @returns {Map<string, number>} Map of tab IDs to watermarks
 */
function getKnownWatermarks() {
    return new Map(knownWatermarks);
}

/**
 * Handle replay request from secondary tab (primary only)
 * @param {string} requestingTabId - Tab requesting replay
 * @param {number} fromWatermark - Starting watermark for replay
 */
async function handleReplayRequest(requestingTabId, fromWatermark) {
    if (!isPrimaryTab) return;

    try {
        console.log(`[TabCoordination] Handling replay request from tab ${requestingTabId} from watermark ${fromWatermark}`);

        // Use the already-imported EventBus at the top of this file to get events and replay
        const eventLog = await EventBus.replayEvents({
            fromSequenceNumber: fromWatermark,
            count: 1000,
            forward: true
        });

        // Send replay response to requesting tab
        coordinationTransport?.postMessage({
            type: MESSAGE_TYPES.REPLAY_RESPONSE,
            tabId: TAB_ID,
            events: eventLog,
            vectorClock: vectorClock.tick(),
            senderId: vectorClock.processId
        });
    } catch (error) {
        console.error('[TabCoordination] Error handling replay request:', error);
    }
}

/**
 * Handle replay response from primary tab (secondary only)
 * @param {Array} events - Events to replay
 */
async function handleReplayResponse(events) {
    if (isPrimaryTab) return;

    try {
        console.log(`[TabCoordination] Received replay response with ${events.length} events`);

        // Replay events using the already-imported EventBus at the top of this file
        for (const event of events) {
            await EventBus.emit(event.type, event.payload, {
                skipEventLog: true,
                domain: event.domain || 'global'
            });
        }

        // Update watermark
        if (events.length > 0) {
            const lastEvent = events[events.length - 1];
            updateEventWatermark(lastEvent.sequenceNumber);
        }

        console.log('[TabCoordination] Replay complete');
    } catch (error) {
        console.error('[TabCoordination] Error handling replay response:', error);
    }
}

/**
 * Request event replay from primary tab (secondary only)
 * @param {number} fromWatermark - Starting watermark for replay
 */
async function requestEventReplay(fromWatermark) {
    if (isPrimaryTab) {
        console.warn('[TabCoordination] Primary tab should not request replay');
        return;
    }

    if (!broadcastChannel) {
        console.warn('[TabCoordination] No broadcast channel available for replay request');
        return;
    }

    console.log(`[TabCoordination] Requesting event replay from watermark ${fromWatermark}`);

    broadcastChannel.postMessage({
        type: MESSAGE_TYPES.REPLAY_REQUEST,
        tabId: TAB_ID,
        fromWatermark,
        vectorClock: vectorClock.tick(),
        senderId: vectorClock.processId
    });
}

/**
 * Check if replay is needed based on watermarks
 * @returns {boolean} True if replay is needed
 */
function needsReplay() {
    if (isPrimaryTab) return false;

    // Get highest watermark from known tabs
    let highestWatermark = lastEventWatermark;
    for (const [tabId, watermark] of knownWatermarks.entries()) {
        if (watermark > highestWatermark) {
            highestWatermark = watermark;
        }
    }

    return highestWatermark > lastEventWatermark;
}

/**
 * Perform automatic replay if needed
 * @returns {Promise<boolean>} True if replay was performed
 */
async function autoReplayIfNeeded() {
    if (!needsReplay()) return false;

    try {
        const highestWatermark = Math.max(...knownWatermarks.values(), lastEventWatermark);
        console.log(`[TabCoordination] Auto-replaying events from ${lastEventWatermark} to ${highestWatermark}`);

        await requestEventReplay(lastEventWatermark);
        return true;
    } catch (error) {
        console.error('[TabCoordination] Auto-replay failed:', error);
        return false;
    }
}

/**
 * Check if this tab is the primary tab
 * @returns {boolean}
 */
function isPrimary() {
    return isPrimaryTab;
}

/**
 * Get current tab ID
 * @returns {string}
 */
function getTabId() {
    return TAB_ID;
}

// ==========================================
// Visual Authority Feedback (HNW Hierarchy)
// ==========================================

/**
 * Check if write operations are allowed
 * HNW Hierarchy: Central authority check for all write operations
 * 
 * @returns {boolean} - True if this tab has write authority
 */
function isWriteAllowed() {
    return isPrimaryTab;
}

/**
 * Get the current authority level
 * HNW Hierarchy: Returns authority status for UI feedback
 * 
 * @returns {Object} Authority status
 */
function getAuthorityLevel() {
    return {
        level: isPrimaryTab ? 'primary' : 'secondary',
        canWrite: isPrimaryTab,
        canRead: true,
        tabId: TAB_ID,
        mode: isPrimaryTab ? 'full_access' : 'read_only',
        message: isPrimaryTab
            ? 'Full access - You can make changes'
            : 'Read-only mode - Another tab has primary control'
    };
}

/**
 * Assert write authority - throws if not allowed
 * Use this before critical write operations
 * 
 * @param {string} [operation] - Operation name for error message
 * @throws {Error} If write not allowed
 */
function assertWriteAuthority(operation = 'write operation') {
    if (!isPrimaryTab) {
        const error = new Error(`Write authority denied: ${operation}. This tab is in read-only mode.`);
        error.code = 'WRITE_AUTHORITY_DENIED';
        error.isSecondaryTab = true;
        error.suggestion = 'Close other tabs or refresh this page to become primary';
        throw error;
    }
}

/**
 * Subscribe to authority changes
 * @param {Function} callback - Called with authority level when it changes
 * @returns {Function} Unsubscribe function
 */
const authorityChangeListeners = [];

function onAuthorityChange(callback) {
    authorityChangeListeners.push(callback);

    // Immediately call with current state
    callback(getAuthorityLevel());

    return () => {
        const idx = authorityChangeListeners.indexOf(callback);
        if (idx >= 0) authorityChangeListeners.splice(idx, 1);
    };
}

/**
 * Notify listeners of authority change
 */
function notifyAuthorityChange() {
    const level = getAuthorityLevel();

    // Emit EventBus event for UI components
    EventBus.emit('tab:authority_changed', {
        isPrimary: level.canWrite,
        level: level.level,
        mode: level.mode,
        message: level.message
    });

    // Call internal listeners
    for (const listener of authorityChangeListeners) {
        try {
            listener(level);
        } catch (e) {
            console.error('[TabCoordination] Authority listener error:', e);
        }
    }
}

/**
 * Cleanup on tab close/unload
 */
function cleanup() {
    // Stop heartbeat
    stopHeartbeat();
    stopHeartbeatMonitor();

    // Stop watermark broadcast
    stopWatermarkBroadcast();

    // Notify other tabs of release
    if (isPrimaryTab && coordinationTransport) {
        coordinationTransport.postMessage({
            type: MESSAGE_TYPES.RELEASE_PRIMARY,
            tabId: TAB_ID
        });
    }

    // Close coordination transport (BroadcastChannel or SharedWorker)
    if (coordinationTransport) {
        coordinationTransport.removeEventListener('message', messageHandler);
        coordinationTransport.close();
        coordinationTransport = null;
    }

    // Close BroadcastChannel if it exists
    if (broadcastChannel) {
        broadcastChannel.close();
        broadcastChannel = null;
    }

    // Close SharedWorker if it was used
    if (sharedWorkerFallback) {
        SharedWorkerCoordinator.close();
        sharedWorkerFallback = false;
    }

    if (electionTimeout) {
        clearTimeout(electionTimeout);
    }

    // HNW Wave: Cleanup monitoring
    if (visibilityMonitorCleanup) {
        visibilityMonitorCleanup();
        visibilityMonitorCleanup = null;
    }

    if (networkMonitorCleanup) {
        networkMonitorCleanup();
        networkMonitorCleanup = null;
    }

    // Reset election state
    electionCandidates = new Set();
    receivedPrimaryClaim = false;
    electionAborted = false;

    console.log('[TabCoordination] Cleanup complete');
}

// ==========================================
// Public API
// ==========================================

const TabCoordinator = {
    init,
    isPrimary,
    getTabId,
    cleanup,

    // Visual Authority Feedback (HNW)
    isWriteAllowed,
    getAuthorityLevel,
    assertWriteAuthority,
    onAuthorityChange,

    // Timing configuration (HNW Wave)
    configureTiming,
    getTimingConfig() {
        return structuredClone ? structuredClone(TimingConfig) : JSON.parse(JSON.stringify(TimingConfig));
    },

    // Clock skew tracking (HNW Wave)
    getClockSkew: () => clockSkewTracker.getSkew(),
    getClockSkewHistory: () => [...clockSkewTracker.skewSamples],
    resetClockSkewTracking: () => clockSkewTracker.reset(),

    // HNW Wave: Adaptive timing and device detection
    getAdaptiveTiming: () => adaptiveTiming ? structuredClone(adaptiveTiming) : null,
    getDeviceInfo: () => DeviceDetection.getDeviceInfo(),
    getNetworkState: () => DeviceDetection.getNetworkState(),
    getHeartbeatQualityStats: () => DeviceDetection.getHeartbeatQualityStats(),

    // VectorClock API (HNW Network - for conflict detection)
    getVectorClock: () => vectorClock.clone(),
    getVectorClockState: () => vectorClock.toJSON(),
    isConflict: (remoteClock) => vectorClock.isConcurrent(remoteClock),

    // Event Replay Coordination (NEW)
    updateEventWatermark,
    getEventWatermark,
    getKnownWatermarks,
    requestEventReplay,
    needsReplay,
    autoReplayIfNeeded,

    // Transport info (diagnostics)
    getTransportType: () => sharedWorkerFallback ? 'SharedWorker' : 'BroadcastChannel',
    isUsingFallback: () => sharedWorkerFallback,

    // Heartbeat (exposed for testing)
    _startHeartbeat: startHeartbeat,
    _stopHeartbeat: stopHeartbeat
};

// ES Module export
export { TabCoordinator };

console.log('[TabCoordination] Service loaded with VectorClock, heartbeat, authority control, and clock skew handling');
