/**
 * Tab Coordinator - Message Queue Module
 *
 * Handles message queuing for tabs that are not yet ready:
 * - Queues messages when secure context is not available
 * - Processes queued messages when context becomes ready
 * - Limits queue size to prevent memory issues
 *
 * @module tab-coordination/modules/message-queue
 */

import { isInBootstrapWindow } from '../timing.js';
import { sendMessage } from './message-sender.js';
import { isKeySessionActive } from './shared-state.js';

// ==========================================
// Queue State
// ==========================================

const messageQueue = [];
let isProcessingQueue = false;

// ==========================================
// Queue Operations
// ==========================================

/**
 * Queue a message for later processing
 * Messages are queued when secure context is not available
 */
export function queueMessage(msg) {
    if (messageQueue.length >= 100) {
        // Queue is full, drop message
        return false;
    }

    messageQueue.push({ msg, timestamp: Date.now() });
    return true;
}

/**
 * Check if message should be queued
 */
export function shouldQueueMessage() {
    return !isKeySessionActive() && !isInBootstrapWindow();
}

/**
 * Get current queue size
 */
export function getQueueSize() {
    return messageQueue.length;
}

/**
 * Check if queue is currently being processed
 */
export function isProcessing() {
    return isProcessingQueue;
}

/**
 * Get queue info
 */
export function getQueueInfo(isReady) {
    return {
        size: messageQueue.length,
        isProcessing: isProcessingQueue,
        isWatching: false,
        isReady: isReady,
    };
}

/**
 * Process all queued messages
 * Sends each message in order
 *
 * RACE CONDITION FIX: Added recursive call in finally block to ensure
 * messages added during processing are handled. Without this, if messages
 * are queued while processing, they won't be processed until another
 * message triggers processMessageQueue(), causing potential delays.
 */
export async function processMessageQueue() {
    if (isProcessingQueue || messageQueue.length === 0) {
        return;
    }

    isProcessingQueue = true;
    try {
        while (messageQueue.length > 0) {
            const queued = messageQueue.shift();
            await sendMessage(queued.msg, true);
        }
    } finally {
        isProcessingQueue = false;
        // RACE CONDITION FIX: Continue processing if messages were added during processing
        // This ensures the queue is drained completely before returning
        processMessageQueue().catch(e => console.error('[MessageQueue] Next batch failed:', e));
    }
}

/**
 * Clear all queued messages
 */
export function clearQueue() {
    messageQueue.length = 0;
}

/**
 * Send message with queue handling
 * If secure context is not available, queue the message
 * Otherwise, send immediately
 */
export async function sendMessageWithQueue(msg) {
    if (shouldQueueMessage()) {
        // FIX: Return consistent status object
        const queued = queueMessage(msg);
        return { success: queued, queued: true, added: queued };
    }

    // FIX: Return status so caller knows if message was sent
    try {
        await sendMessage(msg, false);
        return { success: true, queued: false };
    } catch (error) {
        console.error('[MessageQueue] Failed to send message:', error);
        return { success: false, queued: false, error: error.message };
    }
}
