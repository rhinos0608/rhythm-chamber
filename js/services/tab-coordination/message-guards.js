import { MESSAGE_TYPES } from './constants.js';

const MESSAGE_SCHEMA = {
    CANDIDATE: {
        required: ['type', 'tabId', 'timestamp'],
        optional: ['senderId', 'seq', 'nonce', 'origin', 'vectorClock']
    },
    CLAIM_PRIMARY: {
        required: ['type', 'tabId', 'timestamp'],
        optional: ['senderId', 'seq', 'nonce', 'origin', 'vectorClock']
    },
    RELEASE_PRIMARY: {
        required: ['type', 'tabId', 'timestamp'],
        optional: ['senderId', 'seq', 'nonce', 'origin', 'vectorClock']
    },
    HEARTBEAT: {
        required: ['type', 'tabId', 'timestamp'],
        optional: ['senderId', 'seq', 'nonce', 'origin', 'lamportTimestamp', 'vectorClock']
    },
    EVENT_WATERMARK: {
        required: ['type', 'tabId', 'timestamp', 'watermark'],
        optional: ['senderId', 'seq', 'nonce', 'origin', 'vectorClock']
    },
    REPLAY_REQUEST: {
        required: ['type', 'tabId', 'timestamp', 'fromWatermark'],
        optional: ['senderId', 'seq', 'nonce', 'origin', 'vectorClock']
    },
    REPLAY_RESPONSE: {
        required: ['type', 'tabId', 'timestamp', 'events'],
        optional: ['senderId', 'seq', 'nonce', 'origin', 'vectorClock']
    },
    SAFE_MODE_CHANGED: {
        required: ['type', 'tabId', 'timestamp', 'enabled', 'reason'],
        optional: ['senderId', 'seq', 'nonce', 'origin', 'vectorClock']
    }
};

function validateMessageStructure(message) {
    let messageSize = 0;
    try {
        messageSize = JSON.stringify(message).length;
    } catch (e) {
        return { valid: false, error: 'Message serialization failed (possible circular structure)' };
    }
    const MAX_MESSAGE_SIZE = 1024 * 1024;
    if (messageSize > MAX_MESSAGE_SIZE) {
        return { valid: false, error: `Message too large: ${messageSize} bytes (max ${MAX_MESSAGE_SIZE})` };
    }

    const MAX_DEPTH = 10;
    function checkDepth(obj, depth = 0, visited = new WeakSet()) {
        if (depth > MAX_DEPTH) {
            return false;
        }
        if (!obj || typeof obj !== 'object') {
            return true;
        }
        if (visited.has(obj)) {
            return false;
        }
        visited.add(obj);

        if (Array.isArray(obj)) {
            for (const item of obj) {
                if (!checkDepth(item, depth + 1, visited)) {
                    return false;
                }
            }
        } else {
            for (const key of Object.keys(obj)) {
                if (!checkDepth(obj[key], depth + 1, visited)) {
                    return false;
                }
            }
        }
        return true;
    }
    if (!checkDepth(message)) {
        return { valid: false, error: `Message object depth exceeds ${MAX_DEPTH} levels or contains circular references` };
    }

    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    function checkPrototypePollution(obj) {
        if (!obj || typeof obj !== 'object') {
            return true;
        }
        for (const key of Object.keys(obj)) {
            if (dangerousKeys.includes(key)) {
                return false;
            }
            if (typeof obj[key] === 'object' && !checkPrototypePollution(obj[key])) {
                return false;
            }
        }
        return true;
    }
    if (!checkPrototypePollution(message)) {
        return { valid: false, error: 'Message contains dangerous prototype pollution keys' };
    }

    if (!message || typeof message !== 'object') {
        return { valid: false, error: 'Message is not an object' };
    }

    const { type } = message;
    if (!type) {
        return { valid: false, error: 'Message missing type field' };
    }

    const schema = MESSAGE_SCHEMA[type];
    if (!schema) {
        return { valid: false, error: `Unknown message type: ${type}` };
    }

    for (const field of schema.required) {
        if (message[field] === undefined || message[field] === null) {
            return { valid: false, error: `Missing required field: ${field} for type ${type}` };
        }
    }

    if (type === MESSAGE_TYPES.EVENT_WATERMARK) {
        if (typeof message.watermark !== 'number') {
            return { valid: false, error: 'watermark must be a number' };
        }
    }

    if (type === MESSAGE_TYPES.REPLAY_REQUEST) {
        if (typeof message.fromWatermark !== 'number') {
            return { valid: false, error: 'fromWatermark must be a number' };
        }
    }

    if (type === MESSAGE_TYPES.REPLAY_RESPONSE) {
        if (!Array.isArray(message.events)) {
            return { valid: false, error: 'events must be an array' };
        }
    }

    if (type === MESSAGE_TYPES.SAFE_MODE_CHANGED) {
        if (typeof message.enabled !== 'boolean') {
            return { valid: false, error: 'enabled must be a boolean' };
        }
        if (typeof message.reason !== 'string') {
            return { valid: false, error: 'reason must be a string' };
        }
    }

    if (message.timestamp && typeof message.timestamp !== 'number') {
        return { valid: false, error: 'timestamp must be a number' };
    }

    if (message.tabId && typeof message.tabId !== 'string') {
        return { valid: false, error: 'tabId must be a string' };
    }

    return { valid: true, error: null };
}

const DEFAULT_RATE_LIMIT = 10;
const GLOBAL_RATE_LIMIT = 50;
const BURST_RATE_LIMIT = 10;
const BURST_WINDOW_MS = 100;

const MESSAGE_RATE_LIMITS = {
    CANDIDATE: { maxPerSecond: 10 },
    CLAIM_PRIMARY: { maxPerSecond: 5 },
    RELEASE_PRIMARY: { maxPerSecond: 5 },
    HEARTBEAT: { maxPerSecond: 10 },
    EVENT_WATERMARK: { maxPerSecond: 20 },
    REPLAY_REQUEST: { maxPerSecond: 5 },
    REPLAY_RESPONSE: { maxPerSecond: 10 },
    SAFE_MODE_CHANGED: { maxPerSecond: 5 }
};

const messageRateTracking = new Map();
let globalMessageCount = 0;
let globalWindowStart = Date.now();
let burstMessageCount = 0;
let burstWindowStart = Date.now();

function cleanupOldTrackingEntries(now) {
    const windowStart = now - 1000;
    for (const [type, entries] of messageRateTracking.entries()) {
        const validEntries = entries.filter(entry => entry.windowStart > windowStart);
        if (validEntries.length === 0) {
            messageRateTracking.delete(type);
        } else {
            messageRateTracking.set(type, validEntries);
        }
    }
}

function isRateLimited(messageType) {
    const now = Date.now();

    if (now - globalWindowStart > 1000) {
        globalMessageCount = 0;
        globalWindowStart = now;
    }

    globalMessageCount++;
    if (globalMessageCount > GLOBAL_RATE_LIMIT) {
        return true;
    }

    if (now - burstWindowStart > BURST_WINDOW_MS) {
        burstMessageCount = 0;
        burstWindowStart = now;
    }

    burstMessageCount++;
    if (burstMessageCount > BURST_RATE_LIMIT) {
        return true;
    }

    const limit = MESSAGE_RATE_LIMITS[messageType]?.maxPerSecond ?? DEFAULT_RATE_LIMIT;
    const entries = messageRateTracking.get(messageType) || [];
    const currentWindow = now - 1000;
    const recentEntries = entries.filter(entry => entry.windowStart > currentWindow);

    const count = recentEntries.reduce((sum, entry) => sum + entry.count, 0);

    if (count >= limit) {
        return true;
    }

    recentEntries.push({ count: 1, windowStart: now });
    messageRateTracking.set(messageType, recentEntries);

    if (Math.random() < 0.01) {
        cleanupOldTrackingEntries(now);
    }

    return false;
}

const usedNonces = new Map();
const NONCE_EXPIRY_MS = 60000;
const NONCE_CLEANUP_INTERVAL_MS = 30000;
const CLEANUP_THRESHOLD = 500;

/**
 * Interval ID for nonce cleanup
 * @type {number|null}
 */
let nonceCleanupIntervalId = null;

/**
 * Start the nonce cleanup interval
 * Called automatically when the module is loaded.
 * @private
 */
function startNonceCleanupInterval() {
    if (nonceCleanupIntervalId) {
        clearInterval(nonceCleanupIntervalId);
    }
    nonceCleanupIntervalId = setInterval(() => {
        if (usedNonces.size > CLEANUP_THRESHOLD) {
            const now = Date.now();
            const expiredNonces = [];
            let removedCount = 0;

            for (const [nonce, timestamp] of usedNonces.entries()) {
                if (now - timestamp > NONCE_EXPIRY_MS) {
                    expiredNonces.push(nonce);
                }
            }

            for (const nonce of expiredNonces) {
                usedNonces.delete(nonce);
                removedCount++;
            }

            if (removedCount > 0) {
                console.log(`[TabCoordination] Cleaned up ${removedCount} expired nonces (${usedNonces.size} remaining)`);
            }
        }
    }, NONCE_CLEANUP_INTERVAL_MS);
}

/**
 * Cleanup function to stop the nonce cleanup interval
 * Should be called on page unload or when the tab coordination is no longer needed
 * to prevent memory leaks.
 * @example
 * window.addEventListener('beforeunload', cleanupMessageGuards);
 */
function cleanupMessageGuards() {
    if (nonceCleanupIntervalId) {
        clearInterval(nonceCleanupIntervalId);
        nonceCleanupIntervalId = null;
    }
    // Also clear any stored state
    usedNonces.clear();
}

// Start the cleanup interval when the module loads
startNonceCleanupInterval();

function isNonceFresh(nonce) {
    if (!nonce) return false;
    if (usedNonces.has(nonce)) {
        return false;
    }
    usedNonces.set(nonce, Date.now());
    return true;
}

const remoteSequences = new Map();
const remoteSequenceTimestamps = new Map();
let outOfOrderCount = 0;
const REMOTE_SEQUENCE_MAX_AGE_MS = 300000;

// Import ordering functions from message-sender
let queuePendingMessage = null;
let processPendingMessages = null;
let checkForMessageGaps = null;

// Lazy import to avoid circular dependency
async function initOrderingFunctions() {
    if (!queuePendingMessage) {
        const module = await import('./modules/message-sender.js');
        queuePendingMessage = module.queuePendingMessage || null;
        processPendingMessages = module.processPendingMessages || null;
        checkForMessageGaps = module.checkForMessageGaps || null;

        // Note: These functions are internal to message-sender.js
        // We'll need to export them if we want to use them here
        // For now, we'll implement ordering logic inline
    }
}

// Initialize on module load
initOrderingFunctions().catch(() => {
    // Ignore errors - ordering functions are optional enhancement
});

function pruneStaleRemoteSequences(debugMode = false) {
    const now = Date.now();
    const pruned = [];

    for (const [senderId, timestamp] of remoteSequenceTimestamps.entries()) {
        if (now - timestamp > REMOTE_SEQUENCE_MAX_AGE_MS) {
            pruned.push(senderId);
        }
    }

    for (const senderId of pruned) {
        remoteSequences.delete(senderId);
        remoteSequenceTimestamps.delete(senderId);
    }

    if (pruned.length > 0 && debugMode) {
        console.log(`[TabCoordination] Pruned ${pruned.length} stale remote sequence entries`);
    }

    return pruned.length;
}

/**
 * Check sequence and determine if message should be processed or queued
 * Enhanced version that supports message ordering with pending queue
 *
 * @param {Object} params - Sequence check parameters
 * @param {number} params.seq - Message sequence number
 * @param {string} params.senderId - Sender's tab ID
 * @param {string} params.localTabId - Local tab ID
 * @param {boolean} params.debugMode - Enable debug logging
 * @param {Object} params.message - Full message object (for queuing)
 * @param {Function} params.processFn - Function to process pending messages
 * @returns {Object} Result object with processing decision
 */
function checkAndTrackSequence({ seq, senderId, localTabId, debugMode = false, message = null, processFn = null }) {
    // Handle messages without sequence numbers or from self
    if (seq === undefined || !senderId || senderId === localTabId) {
        return { shouldProcess: true, isDuplicate: false, isOutOfOrder: false, shouldQueue: false };
    }

    const lastSeq = remoteSequences.get(senderId) || 0;

    // Check for duplicate messages
    if (seq <= lastSeq) {
        if (debugMode) {
            console.warn(`[TabCoordination] Duplicate message: seq=${seq} from ${senderId} (last=${lastSeq})`);
        }
        return { shouldProcess: false, isDuplicate: true, isOutOfOrder: false, shouldQueue: false };
    }

    // Check for out-of-order messages
    if (seq > lastSeq + 1) {
        outOfOrderCount++;

        // Log gap detection
        const gapSize = seq - lastSeq - 1;
        if (!checkForMessageGaps) {
            // Inline gap detection if function not available
            console.warn(`[TabCoordination] Message gap detected from ${senderId}: missing seq ${lastSeq + 1} to ${seq - 1} (${gapSize} messages)`);
        }

        if (debugMode) {
            console.warn(`[TabCoordination] Out-of-order message: expected seq=${lastSeq + 1}, got seq=${seq} from ${senderId} (total OOO: ${outOfOrderCount})`);
        }

        // Queue the message for later processing
        // We'll process it when the missing sequence numbers arrive
        if (message && gapSize <= 10) { // Only queue if gap is reasonable
            // Update the sequence tracking to the current message
            // This allows us to track that we've seen this sequence
            remoteSequences.set(senderId, seq);
            remoteSequenceTimestamps.set(senderId, Date.now());

            return {
                shouldProcess: false,
                isDuplicate: false,
                isOutOfOrder: true,
                shouldQueue: true,
                expectedSeq: lastSeq + 1,
                gapSize
            };
        } else {
            // Gap too large or no message provided, process anyway
            remoteSequences.set(senderId, seq);
            remoteSequenceTimestamps.set(senderId, Date.now());
            if (Math.random() < 0.05) {
                pruneStaleRemoteSequences(debugMode);
            }

            return {
                shouldProcess: true,
                isDuplicate: false,
                isOutOfOrder: true,
                shouldQueue: false,
                gapSize
            };
        }
    }

    // Message is in order, process it and check for pending messages
    remoteSequences.set(senderId, seq);
    remoteSequenceTimestamps.set(senderId, Date.now());

    // Periodically prune stale entries
    if (Math.random() < 0.05) {
        pruneStaleRemoteSequences(debugMode);
    }

    return {
        shouldProcess: true,
        isDuplicate: false,
        isOutOfOrder: false,
        shouldQueue: false,
        expectedSeq: seq + 1
    };
}

function getOutOfOrderCount() {
    return outOfOrderCount;
}

function resetOutOfOrderCount() {
    outOfOrderCount = 0;
}

/**
 * Reset sequence tracking state
 * Used primarily in tests to ensure clean state between test runs
 */
function resetSequenceTracking() {
    remoteSequences.clear();
    remoteSequenceTimestamps.clear();
    outOfOrderCount = 0;
}

function getRemoteSequenceCount() {
    return remoteSequences.size;
}

function getRateTracking() {
    return new Map(messageRateTracking);
}

export {
    MESSAGE_RATE_LIMITS,
    MESSAGE_SCHEMA,
    checkAndTrackSequence,
    cleanupMessageGuards,
    getOutOfOrderCount,
    getRateTracking,
    getRemoteSequenceCount,
    isNonceFresh,
    isRateLimited,
    pruneStaleRemoteSequences,
    resetOutOfOrderCount,
    resetSequenceTracking,
    validateMessageStructure
};
