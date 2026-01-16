/**
 * Tab Coordination Service
 * 
 * Handles cross-tab coordination using BroadcastChannel with deterministic leader election.
 * Part of the HNW architecture to prevent data corruption from multiple tabs.
 * 
 * @module services/tab-coordination
 */

import { LamportClock } from './lamport-clock.js';
import { WaveTelemetry } from './wave-telemetry.js';

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

// Initialize Lamport clock for this tab
LamportClock.init();

// Use Lamport timestamp for deterministic ordering instead of Date.now()
// This eliminates clock skew issues between tabs
const TAB_ID = `${LamportClock.tick()}-${LamportClock.getId().substring(0, 8)}`;

// Message types
const MESSAGE_TYPES = {
    CANDIDATE: 'CANDIDATE',
    CLAIM_PRIMARY: 'CLAIM_PRIMARY',
    RELEASE_PRIMARY: 'RELEASE_PRIMARY',
    HEARTBEAT: 'HEARTBEAT'
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

    // Heartbeat timing
    heartbeat: {
        intervalMs: 5000,
        maxMissed: 2,
        skewToleranceMs: 2000  // Allow 2 seconds clock skew
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
let isPrimaryTab = true;
let electionTimeout = null;
let messageHandler = null;
let heartbeatInterval = null;
let heartbeatCheckInterval = null;
let lastLeaderHeartbeat = Date.now();
let lastLeaderLamportTime = LamportClock.getTime(); // Track Lamport time for heartbeat

// Module-scoped election state to prevent race conditions
let electionCandidates = new Set();
let receivedPrimaryClaim = false;
let electionAborted = false;
let lastHeartbeatSentTime = 0; // Track for WaveTelemetry

// ==========================================
// Core Functions
// ==========================================

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
 * @returns {Promise<boolean>} True if this tab won election
 */
async function init() {
    if (!('BroadcastChannel' in window)) {
        console.warn('[TabCoordination] BroadcastChannel not supported, skipping cross-tab coordination');
        return true; // Assume primary if no coordination available
    }

    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);

    // Set up message handler
    messageHandler = createMessageHandler();
    broadcastChannel.addEventListener('message', messageHandler);

    // Reset election state
    electionCandidates = new Set([TAB_ID]);
    receivedPrimaryClaim = false;
    electionAborted = false;

    // Announce candidacy with Lamport timestamp for deterministic ordering
    broadcastChannel.postMessage(LamportClock.stamp({
        type: MESSAGE_TYPES.CANDIDATE,
        tabId: TAB_ID
    }));

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

    // Set up heartbeat system
    if (isPrimaryTab) {
        startHeartbeat();
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
        const { type, tabId, lamportTimestamp } = event.data;

        // Sync Lamport clock with received message
        // This ensures logical ordering across all tabs
        if (typeof lamportTimestamp === 'number') {
            LamportClock.update(lamportTimestamp);
        }

        switch (type) {
            case MESSAGE_TYPES.CANDIDATE:
                // Another tab announced candidacy - collect it for election
                // If we're already primary, assert dominance so new tab knows leader exists
                if (isPrimaryTab && tabId !== TAB_ID) {
                    broadcastChannel?.postMessage(LamportClock.stamp({
                        type: MESSAGE_TYPES.CLAIM_PRIMARY,
                        tabId: TAB_ID
                    }));
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
        }
    };
}

/**
 * Claim this tab as primary
 */
function claimPrimary() {
    isPrimaryTab = true;
    broadcastChannel?.postMessage({
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
    broadcastChannel?.postMessage({
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
 * Send a heartbeat with both wall-clock and Lamport timestamps
 * HNW Wave: Dual timestamp system prevents clock skew issues
 */
function sendHeartbeat() {
    const wallClockTime = Date.now();
    const lamportTime = LamportClock.tick();

    // Record actual heartbeat interval for WaveTelemetry
    if (lastHeartbeatSentTime > 0) {
        const actualInterval = wallClockTime - lastHeartbeatSentTime;
        WaveTelemetry.record('heartbeat_interval', actualInterval);
    }
    lastHeartbeatSentTime = wallClockTime;

    // Send via BroadcastChannel with both timestamps
    broadcastChannel?.postMessage(LamportClock.stamp({
        type: MESSAGE_TYPES.HEARTBEAT,
        tabId: TAB_ID,
        timestamp: wallClockTime,
        lamportTimestamp: lamportTime
    }));

    // Also store in localStorage for cross-tab fallback
    try {
        localStorage.setItem(HEARTBEAT_STORAGE_KEY, JSON.stringify({
            tabId: TAB_ID,
            timestamp: wallClockTime,
            lamportTimestamp: lamportTime
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
    lastLeaderLamportTime = LamportClock.getTime();

    heartbeatCheckInterval = setInterval(() => {
        const maxAllowedGap = HEARTBEAT_INTERVAL_MS * MAX_MISSED_HEARTBEATS;
        const now = Date.now();
        let timeSinceLastHeartbeat = 0;

        // Check localStorage fallback with skew tolerance
        try {
            const stored = localStorage.getItem(HEARTBEAT_STORAGE_KEY);
            if (stored) {
                const { timestamp, lamportTimestamp } = JSON.parse(stored);

                // Update Lamport time from stored heartbeat
                if (lamportTimestamp && lamportTimestamp > lastLeaderLamportTime) {
                    lastLeaderLamportTime = lamportTimestamp;
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

    if (isPrimaryTab && broadcastChannel) {
        broadcastChannel.postMessage({
            type: MESSAGE_TYPES.RELEASE_PRIMARY,
            tabId: TAB_ID
        });
    }

    if (broadcastChannel) {
        broadcastChannel.removeEventListener('message', messageHandler);
        broadcastChannel.close();
    }

    if (electionTimeout) {
        clearTimeout(electionTimeout);
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

    // Heartbeat (exposed for testing)
    _startHeartbeat: startHeartbeat,
    _stopHeartbeat: stopHeartbeat
};

// ES Module export
export { TabCoordinator };

console.log('[TabCoordination] Service loaded with heartbeat, authority control, and clock skew handling');

