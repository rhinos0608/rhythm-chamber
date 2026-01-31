/**
 * Tab Coordinator - Message Sender Module
 *
 * Handles sending messages through the coordination transport:
 * - Wraps messages with nonce, sequence, and metadata
 * - Provides access to coordination transport
 *
 * @module tab-coordination/modules/message-sender
 */

import { TAB_ID, vectorClock } from '../constants.js';

// ==========================================
// Transport State
// ==========================================

let coordinationTransport = null;
let broadcastChannel = null;
let sharedWorkerFallback = false;

// ==========================================
// Sequence State
// ==========================================

let localSequence = 0;

// ==========================================
// Message Ordering State
// ==========================================

/**
 * Pending messages waiting for earlier sequence numbers
 * Maps senderId -> Map<expectedSeq, {message, timestamp, retries}>
 *
 * Example:
 * {
 *   "tab_123": Map {
 *     5 => { message: {...}, timestamp: 1234567890, retries: 0 },
 *     7 => { message: {...}, timestamp: 1234567891, retries: 0 }
 *   }
 * }
 * where we're waiting for seq 6 to arrive from tab_123
 */
const pendingMessages = new Map();

/**
 * Maximum time to hold a pending message (in milliseconds)
 * After this time, the message is processed even if out-of-order
 */
const MAX_PENDING_TIME_MS = 5000;

/**
 * Maximum number of retries before giving up on waiting
 */
const MAX_RETRIES = 3;

/**
 * Check interval for processing pending messages
 */
const PENDING_CHECK_INTERVAL_MS = 100;

/**
 * Set of sender IDs that have been marked as having gaps
 * This prevents re-warned about the same gap repeatedly
 */
const gapWarnedSenders = new Set();

/**
 * Interval ID for periodic cleanup of expired pending messages
 */
let cleanupIntervalId = null;

/**
 * Start periodic cleanup of expired pending messages
 * Runs every 10 seconds to clean up messages that have exceeded MAX_PENDING_TIME_MS
 */
export function startPendingMessageCleanup() {
    if (cleanupIntervalId) {
        return; // Already running
    }

    cleanupIntervalId = setInterval(() => {
        const now = Date.now();
        let cleaned = 0;

        for (const [senderId, senderQueue] of pendingMessages.entries()) {
            for (const [seq, pending] of senderQueue.entries()) {
                if (now - pending.timestamp > MAX_PENDING_TIME_MS) {
                    console.warn(`[TabCoordination] Auto-cleaning expired pending message seq=${seq} from ${senderId}`);
                    senderQueue.delete(seq);
                    cleaned++;
                }
            }

            // Clean up empty queues
            if (senderQueue.size === 0) {
                pendingMessages.delete(senderId);
                gapWarnedSenders.delete(senderId);
            }
        }

        if (cleaned > 0) {
            console.log(`[TabCoordination] Cleaned up ${cleaned} expired pending messages`);
        }
    }, 10000); // Check every 10 seconds
}

/**
 * Stop periodic cleanup of expired pending messages
 */
export function stopPendingMessageCleanup() {
    if (cleanupIntervalId) {
        clearInterval(cleanupIntervalId);
        cleanupIntervalId = null;
    }
}

// Auto-start cleanup when module loads
if (typeof window !== 'undefined') {
    startPendingMessageCleanup();

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        stopPendingMessageCleanup();
    });
}

// ==========================================
// Transport Management
// ==========================================

/**
 * Set the coordination transport
 */
export function setTransport(transport) {
    coordinationTransport = transport;
}

/**
 * Get the current coordination transport
 */
export function getTransport() {
    return coordinationTransport;
}

/**
 * Set the broadcast channel instance
 */
export function setBroadcastChannel(channel) {
    broadcastChannel = channel;
}

/**
 * Get the broadcast channel instance
 */
export function getBroadcastChannel() {
    return broadcastChannel;
}

/**
 * Set whether using shared worker fallback
 */
export function setSharedWorkerFallback(value) {
    sharedWorkerFallback = value;
}

/**
 * Check if using shared worker fallback
 */
export function isUsingFallback() {
    return sharedWorkerFallback;
}

/**
 * Get transport type name
 */
export function getTransportType() {
    return sharedWorkerFallback ? 'SharedWorker' : 'BroadcastChannel';
}

/**
 * Close transport connection
 */
export function closeTransport() {
    if (coordinationTransport) {
        coordinationTransport.close();
        coordinationTransport = null;
    }

    if (broadcastChannel) {
        broadcastChannel.close();
        broadcastChannel = null;
    }
}

// ==========================================
// Message Ordering Functions
// ==========================================

/**
 * Add a message to the pending queue
 * @param {string} senderId - Sender's tab ID
 * @param {number} seq - Message sequence number
 * @param {Object} message - The message to hold
 * @returns {boolean} True if message was queued, false if queue full
 */
function queuePendingMessage(senderId, seq, message) {
    if (!pendingMessages.has(senderId)) {
        pendingMessages.set(senderId, new Map());
    }

    const senderQueue = pendingMessages.get(senderId);

    // Check if queue is getting too large (prevent memory issues)
    if (senderQueue.size >= 50) {
        console.warn(`[TabCoordination] Pending message queue full for ${senderId}, dropping message seq=${seq}`);
        return false;
    }

    senderQueue.set(seq, {
        message,
        timestamp: Date.now(),
        retries: 0
    });

    return true;
}

/**
 * Process all pending messages that are now ready
 * @param {string} senderId - Sender's tab ID
 * @param {number} expectedSeq - The expected sequence number
 * @param {Function} processFn - Function to call for each ready message
 */
function processPendingMessages(senderId, expectedSeq, processFn) {
    if (!pendingMessages.has(senderId)) {
        return;
    }

    const senderQueue = pendingMessages.get(senderId);
    const now = Date.now();
    let processed = 0;
    let currentSeq = expectedSeq;

    // Process messages in order
    while (senderQueue.has(currentSeq)) {
        const pending = senderQueue.get(currentSeq);

        // Check if message has expired
        if (now - pending.timestamp > MAX_PENDING_TIME_MS) {
            console.warn(`[TabCoordination] Pending message seq=${currentSeq} from ${senderId} expired, processing anyway`);
        }

        try {
            processFn(pending.message);
            processed++;
        } catch (error) {
            console.error(`[TabCoordination] Error processing pending message seq=${currentSeq}:`, error);
        }

        senderQueue.delete(currentSeq);
        currentSeq++;
    }

    // Clean up expired messages
    for (const [seq, pending] of senderQueue.entries()) {
        if (now - pending.timestamp > MAX_PENDING_TIME_MS) {
            console.warn(`[TabCoordination] Pending message seq=${seq} from ${senderId} expired, processing anyway`);
            try {
                processFn(pending.message);
                processed++;
            } catch (error) {
                console.error(`[TabCoordination] Error processing expired pending message seq=${seq}:`, error);
            }
            senderQueue.delete(seq);
        }
    }

    // Clean up empty queues
    if (senderQueue.size === 0) {
        pendingMessages.delete(senderId);
        gapWarnedSenders.delete(senderId);
    }

    return processed;
}

/**
 * Get pending message count for a sender
 * @param {string} senderId - Sender's tab ID
 * @returns {number} Number of pending messages
 */
export function getPendingCount(senderId) {
    const senderQueue = pendingMessages.get(senderId);
    return senderQueue ? senderQueue.size : 0;
}

/**
 * Get all pending message counts
 * @returns {Object} Map of senderId to pending count
 */
export function getAllPendingCounts() {
    const counts = {};
    for (const [senderId, queue] of pendingMessages.entries()) {
        counts[senderId] = queue.size;
    }
    return counts;
}

/**
 * Clear all pending messages
 * Used during cleanup or when re-syncing
 */
export function clearPendingMessages() {
    const totalCleared = pendingMessages.size;
    pendingMessages.clear();
    gapWarnedSenders.clear();
    return totalCleared;
}

/**
 * Check for gaps in message sequences and log warnings
 * @param {string} senderId - Sender's tab ID
 * @param {number} lastSeq - Last processed sequence number
 * @param {number} currentSeq - Current sequence number
 */
export function checkForMessageGaps(senderId, lastSeq, currentSeq) {
    if (currentSeq > lastSeq + 1) {
        const gapSize = currentSeq - lastSeq - 1;

        // Only warn once per sender for a given gap to avoid spam
        if (!gapWarnedSenders.has(senderId)) {
            console.warn(`[TabCoordination] Message gap detected from ${senderId}: missing seq ${lastSeq + 1} to ${currentSeq - 1} (${gapSize} messages)`);
            gapWarnedSenders.add(senderId);

            // Auto-clear warning after 10 seconds
            setTimeout(() => {
                gapWarnedSenders.delete(senderId);
            }, 10000);
        }

        return gapSize;
    }

    return 0;
}

/**
 * Queue a pending message (exported for use by other modules)
 * @param {string} senderId - Sender's tab ID
 * @param {number} seq - Message sequence number
 * @param {Object} message - The message to hold
 * @returns {boolean} True if message was queued, false if queue full
 */
export { queuePendingMessage };

/**
 * Process pending messages (exported for use by other modules)
 * @param {string} senderId - Sender's tab ID
 * @param {number} expectedSeq - The expected sequence number
 * @param {Function} processFn - Function to call for each ready message
 * @returns {number} Number of messages processed
 */
export { processPendingMessages };

// ==========================================
// Message Sending
// ==========================================

/**
 * Wrap message with nonce, sequence, sender ID, and timestamp
 */
function withNonce(msg) {
    localSequence++;
    const timestamp = msg.timestamp || Date.now();
    const nonce = msg.nonce || `${TAB_ID}_${localSequence}_${timestamp}`;
    return {
        ...msg,
        seq: localSequence,
        senderId: TAB_ID,
        origin: typeof window !== 'undefined' ? window.location.origin : 'unknown',
        timestamp,
        nonce
    };
}

/**
 * Send a message through the coordination transport
 * @param {Object} msg - Message to send
 * @param {boolean} skipQueue - Whether to skip queue processing
 */
export async function sendMessage(msg, skipQueue = false) {
    if (!coordinationTransport) {
        return;
    }

    const wrapped = withNonce(msg);
    coordinationTransport.postMessage(wrapped);
}

/**
 * Get local sequence number
 */
export function getLocalSequence() {
    return localSequence;
}

/**
 * Reset local sequence number
 */
export function resetLocalSequence() {
    localSequence = 0;
}
