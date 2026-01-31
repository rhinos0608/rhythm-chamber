/**
 * Tab Coordinator - Message Handler Module
 *
 * Handles incoming message routing and processing:
 * - Creates message handler for transport
 * - Validates message structure and security
 * - Routes messages to appropriate handlers
 * - Manages message queues and replay
 *
 * @module tab-coordination/modules/message-handler
 */

import { AppState } from '../../../state/app-state.js';
import { MESSAGE_TYPES, TAB_ID, vectorClock } from '../constants.js';
import { allowUnsignedMessage } from '../timing.js';
import { debugMode } from './shared-state.js';
import {
    validateMessageStructure,
    isRateLimited,
    checkAndTrackSequence,
    isNonceFresh
} from '../message-guards.js';
import { sendMessage, queuePendingMessage, processPendingMessages, clearPendingMessages } from './message-sender.js';
import {
    getIsPrimaryTab,
    setIsPrimaryTab,
    handleSecondaryMode,
    enterSafeMode
} from './authority.js';
import {
    addCandidate,
    setReceivedPrimaryClaim,
    abortElection,
    setCalledSecondaryMode,
    getHasConcededLeadership,
    setConcededLeadership
} from './election.js';
import {
    getLastLeaderHeartbeat,
    setLastLeaderHeartbeat,
    getLastLeaderVectorClock,
    setLastLeaderVectorClock
} from './heartbeat.js';
import {
    setTabWatermark,
    handleReplayRequest,
    handleReplayResponse
} from './watermark.js';
import {
    showSafeModeWarningFromRemote,
    hideSafeModeWarning
} from './safe-mode.js';

// ==========================================
// Message Handler State
// ==========================================

let messageHandler = null;

// ==========================================
// Message Ordering State
// ==========================================

/**
 * Pending messages awaiting processing
 * Maps senderId -> Map<sequenceNumber, message>
 */
const pendingMessageQueue = new Map();

/**
 * Maximum time to hold a pending message (ms)
 */
const MAX_PENDING_AGE_MS = 5000;

/**
 * Check and process pending messages for a sender
 * @param {string} senderId - Sender's tab ID
 * @param {number} expectedSeq - Expected next sequence number
 */
async function checkPendingMessages(senderId, expectedSeq) {
    if (!pendingMessageQueue.has(senderId)) {
        return;
    }

    const senderQueue = pendingMessageQueue.get(senderId);
    const now = Date.now();
    let currentSeq = expectedSeq;
    let processed = 0;

    // Process messages in sequence order
    while (senderQueue.has(currentSeq)) {
        const pending = senderQueue.get(currentSeq);

        // Check if message has expired
        if (now - pending.timestamp > MAX_PENDING_AGE_MS) {
            console.warn(`[TabCoordination] Pending message seq=${currentSeq} from ${senderId} expired, processing anyway`);
        }

        try {
            // Process the pending message
            await routeMessage(pending.message);
            processed++;
        } catch (error) {
            console.error(`[TabCoordination] Error processing pending message seq=${currentSeq}:`, error);
        }

        senderQueue.delete(currentSeq);
        currentSeq++;
    }

    // Clean up expired messages
    for (const [seq, pending] of senderQueue.entries()) {
        if (now - pending.timestamp > MAX_PENDING_AGE_MS) {
            console.warn(`[TabCoordination] Expired pending message seq=${seq} from ${senderId}, processing anyway`);
            try {
                await routeMessage(pending.message);
                processed++;
            } catch (error) {
                console.error(`[TabCoordination] Error processing expired message seq=${seq}:`, error);
            }
            senderQueue.delete(seq);
        }
    }

    // Clean up empty queues
    if (senderQueue.size === 0) {
        pendingMessageQueue.delete(senderId);
    }

    if (processed > 0 && debugMode) {
        console.log(`[TabCoordination] Processed ${processed} pending messages from ${senderId}`);
    }
}

/**
 * Queue an out-of-order message for later processing
 * @param {string} senderId - Sender's tab ID
 * @param {number} seq - Message sequence number
 * @param {Object} message - The message to queue
 * @returns {boolean} True if queued successfully
 */
function queueOutOfOrderMessage(senderId, seq, message) {
    if (!pendingMessageQueue.has(senderId)) {
        pendingMessageQueue.set(senderId, new Map());
    }

    const senderQueue = pendingMessageQueue.get(senderId);

    // Limit queue size to prevent memory issues
    if (senderQueue.size >= 50) {
        console.warn(`[TabCoordination] Pending message queue full for ${senderId}, dropping seq=${seq}`);
        return false;
    }

    senderQueue.set(seq, {
        message,
        timestamp: Date.now()
    });

    if (debugMode) {
        console.log(`[TabCoordination] Queued out-of-order message seq=${seq} from ${senderId} (${senderQueue.size} pending)`);
    }

    return true;
}

// ==========================================
// Message Handler Creation
// ==========================================

/**
 * Create message handler for transport
 * Returns async function that processes incoming messages
 */
export function createMessageHandler() {
    return async (event) => {
        try {
            // Validate message structure
            const structureValidation = validateMessageStructure(event.data);
            if (!structureValidation.valid) {
                return;
            }

            const { type, tabId, vectorClock: remoteClock, seq, senderId, origin, timestamp, nonce } = event.data;

            // Rate limiting
            if (isRateLimited(type)) {
                return;
            }

            // Unsigned message check
            const isUnsigned = !!event.data.unsigned;
            if (isUnsigned && !allowUnsignedMessage()) {
                return;
            }

            // Origin validation
            if (origin && typeof window !== 'undefined' && origin !== window.location.origin) {
                return;
            }

            // Timestamp freshness check
            const isFresh = timestamp && (Date.now() - timestamp) < 60000;
            if (!isFresh) {
                return;
            }

            // Nonce freshness check
            if (nonce && !isNonceFresh(nonce)) {
                return;
            }

            // Sequence tracking with ordering support
            const ordering = checkAndTrackSequence({
                seq,
                senderId,
                localTabId: TAB_ID,
                debugMode,
                message: event.data
            });

            // Handle out-of-order messages
            if (ordering.shouldQueue) {
                queueOutOfOrderMessage(senderId, seq, event.data);
                return;
            }

            // Skip processing for duplicates
            if (!ordering.shouldProcess) {
                return;
            }

            // Merge vector clock
            if (remoteClock && typeof remoteClock === 'object') {
                vectorClock.merge(remoteClock);
            }

            // Route message by type
            await routeMessage(event.data);

            // Check for pending messages that can now be processed
            if (ordering.expectedSeq) {
                await checkPendingMessages(senderId, ordering.expectedSeq);
            }

        } catch (error) {
            console.error('[TabCoordination] Message handler error:', error);
        }
    };
}

/**
 * Route message to appropriate handler
 */
async function routeMessage(message) {
    const { type, tabId } = message;

    switch (type) {
        case MESSAGE_TYPES.CANDIDATE:
            await handleCandidateMessage(message);
            break;

        case MESSAGE_TYPES.CLAIM_PRIMARY:
            await handleClaimPrimaryMessage(message);
            break;

        case MESSAGE_TYPES.RELEASE_PRIMARY:
            await handleReleasePrimaryMessage(message);
            break;

        case MESSAGE_TYPES.HEARTBEAT:
            await handleHeartbeatMessage(message);
            break;

        case MESSAGE_TYPES.EVENT_WATERMARK:
            await handleWatermarkMessage(message);
            break;

        case MESSAGE_TYPES.REPLAY_REQUEST:
            await handleReplayRequestMessage(message);
            break;

        case MESSAGE_TYPES.REPLAY_RESPONSE:
            await handleReplayResponseMessage(message);
            break;

        case MESSAGE_TYPES.SAFE_MODE_CHANGED:
            await handleSafeModeChangedMessage(message);
            break;

        default:
            console.warn('[TabCoordination] Unknown message type:', type);
    }
}

// ==========================================
// Message Type Handlers
// ==========================================

/**
 * Handle CANDIDATE message
 */
async function handleCandidateMessage(message) {
    const { tabId } = message;

    if (getIsPrimaryTab() && tabId !== TAB_ID) {
        // We're primary, assert our position
        await sendMessage({
            type: MESSAGE_TYPES.CLAIM_PRIMARY,
            tabId: TAB_ID,
            vectorClock: vectorClock.tick()
        });
    }

    addCandidate(tabId);
}

/**
 * Handle CLAIM_PRIMARY message
 */
async function handleClaimPrimaryMessage(message) {
    const { tabId } = message;

    if (tabId === TAB_ID) {
        // Our own claim, ignore
        return;
    }

    // Another tab is claiming primary
    setReceivedPrimaryClaim(true);
    abortElection();

    if (getIsPrimaryTab() && !getHasConcededLeadership()) {
        // We thought we were primary, need to concede
        setIsPrimaryTab(false);
        setCalledSecondaryMode(true);

        try {
            handleSecondaryMode();
            setConcededLeadership(true);
        } catch (error) {
            // Failed to transition to secondary
            setIsPrimaryTab(true);
            setCalledSecondaryMode(false);
            setReceivedPrimaryClaim(false);
            enterSafeMode('secondary_mode_transition_failed');
        }
    } else if (!getIsPrimaryTab() && !getHasConcededLeadership()) {
        // We're already secondary, but need to handle it
        try {
            handleSecondaryMode();
            setConcededLeadership(true);
        } catch (error) {
            enterSafeMode('secondary_mode_entry_failed');
        }
    }
}

/**
 * Handle RELEASE_PRIMARY message
 */
async function handleReleasePrimaryMessage(message) {
    const { tabId } = message;

    if (getIsPrimaryTab() || tabId === TAB_ID) {
        // We're primary or this is our own message, ignore
        return;
    }

    // Primary tab released, initiate re-election
    const { initiateReElection } = await import('./election.js');
    initiateReElection().catch(error => {
        console.error('[TabCoordination] Re-election error after RELEASE_PRIMARY:', error, {
            primaryTabId: tabId,
            localTabId: TAB_ID,
            isPrimaryTab: getIsPrimaryTab()
        });
    });
}

/**
 * Handle HEARTBEAT message
 */
async function handleHeartbeatMessage(message) {
    const { tabId, vectorClock: remoteClock } = message;

    if (tabId === TAB_ID) {
        // Our own heartbeat, ignore
        return;
    }

    if (!getIsPrimaryTab()) {
        // We're secondary, record leader heartbeat
        setLastLeaderHeartbeat(Date.now());
        if (remoteClock) {
            setLastLeaderVectorClock(remoteClock);
        }
    } else {
        // We're primary but another tab is sending heartbeats
        // Assert our primacy to prevent split-brain
        await sendMessage({
            type: MESSAGE_TYPES.CLAIM_PRIMARY,
            tabId: TAB_ID,
            vectorClock: vectorClock.tick()
        }, true);
    }
}

/**
 * Handle EVENT_WATERMARK message
 */
async function handleWatermarkMessage(message) {
    const { tabId, watermark } = message;

    if (tabId !== TAB_ID && typeof watermark === 'number') {
        setTabWatermark(tabId, watermark);
    }
}

/**
 * Handle REPLAY_REQUEST message
 */
async function handleReplayRequestMessage(message) {
    const { tabId, fromWatermark } = message;
    await handleReplayRequest(tabId, fromWatermark);
}

/**
 * Handle REPLAY_RESPONSE message
 */
async function handleReplayResponseMessage(message) {
    const { events } = message;
    await handleReplayResponse(events || []);
}

/**
 * Handle SAFE_MODE_CHANGED message
 */
async function handleSafeModeChangedMessage(message) {
    const { tabId, enabled, reason } = message;

    if (tabId === TAB_ID) {
        // Our own message, ignore
        return;
    }

    if (enabled) {
        showSafeModeWarningFromRemote(reason);
    } else {
        hideSafeModeWarning();
    }

    // Update app state
    try {
        AppState?.update?.('operations', { safeMode: !!enabled });
    } catch (e) {
        // Ignore errors
    }
}

// ==========================================
// Getters
// ==========================================

/**
 * Get the message handler
 */
export function getMessageHandler() {
    return messageHandler;
}

/**
 * Set the message handler
 */
export function setMessageHandler(handler) {
    messageHandler = handler;
}
