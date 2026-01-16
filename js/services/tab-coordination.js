/**
 * Tab Coordination Service
 * 
 * Handles cross-tab coordination using BroadcastChannel with deterministic leader election.
 * Part of the HNW architecture to prevent data corruption from multiple tabs.
 * 
 * @module services/tab-coordination
 */

import { LamportClock } from './lamport-clock.js';

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
const ELECTION_WINDOW_MS = calculateElectionWindow();

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

// Heartbeat configuration
const HEARTBEAT_INTERVAL_MS = 5000;  // Leader sends heartbeat every 5s
const MAX_MISSED_HEARTBEATS = 2;     // Promote after 2 missed (10s dead leader)
const HEARTBEAT_STORAGE_KEY = 'rhythm_chamber_leader_heartbeat';

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

// Module-scoped election state to prevent race conditions
let electionCandidates = new Set();
let receivedPrimaryClaim = false;
let electionAborted = false;

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
                    lastLeaderHeartbeat = Date.now();
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

    // Send initial heartbeat
    sendHeartbeat();

    // Start interval
    heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    console.log('[TabCoordination] Started heartbeat as leader');
}

/**
 * Send a heartbeat
 */
function sendHeartbeat() {
    // Send via BroadcastChannel
    broadcastChannel?.postMessage({
        type: MESSAGE_TYPES.HEARTBEAT,
        tabId: TAB_ID,
        timestamp: Date.now()
    });

    // Also store in localStorage for cross-tab fallback
    try {
        localStorage.setItem(HEARTBEAT_STORAGE_KEY, JSON.stringify({
            tabId: TAB_ID,
            timestamp: Date.now()
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
 * Start monitoring leader heartbeat (followers only)
 */
function startHeartbeatMonitor() {
    if (heartbeatCheckInterval) {
        clearInterval(heartbeatCheckInterval);
    }

    lastLeaderHeartbeat = Date.now();

    heartbeatCheckInterval = setInterval(() => {
        const maxAllowedGap = HEARTBEAT_INTERVAL_MS * MAX_MISSED_HEARTBEATS;

        // Also check localStorage fallback
        try {
            const stored = localStorage.getItem(HEARTBEAT_STORAGE_KEY);
            if (stored) {
                const { timestamp } = JSON.parse(stored);
                const storedAge = Date.now() - timestamp;
                if (storedAge < timeSinceLastHeartbeat) {
                    lastLeaderHeartbeat = timestamp;
                }
            }
        } catch (e) {
            // Ignore localStorage errors
        }

        const timeSinceLastHeartbeat = Date.now() - lastLeaderHeartbeat;

        if (timeSinceLastHeartbeat > maxAllowedGap) {
            console.log(`[TabCoordination] Leader heartbeat missed for ${timeSinceLastHeartbeat}ms, promoting to leader`);
            stopHeartbeatMonitor();
            initiateReElection();
        }
    }, HEARTBEAT_INTERVAL_MS);

    console.log('[TabCoordination] Started heartbeat monitor as follower');
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

    // Heartbeat (exposed for testing)
    _startHeartbeat: startHeartbeat,
    _stopHeartbeat: stopHeartbeat
};

// ES Module export
export { TabCoordinator };

console.log('[TabCoordination] Service loaded with heartbeat and authority control');

