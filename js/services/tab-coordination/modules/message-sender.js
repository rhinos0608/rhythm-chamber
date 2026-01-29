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
