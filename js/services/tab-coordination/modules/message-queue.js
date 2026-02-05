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
// Recursion Protection
// ==========================================

/**
 * Track recursion depth to prevent stack overflow
 * CRITICAL FIX #1: Prevent unbounded recursion
 */
let recursionDepth = 0;
const MAX_RECURSION_DEPTH = 100;

/**
 * Prevent deferred processing storms - only one setTimeout pending at a time
 */
let deferredProcessingPending = false;

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
 *
 * CRITICAL FIX #1: Added recursion depth tracking to prevent stack overflow
 * CRITICAL FIX #3: Added error handling and tracking for failed messages
 */
export async function processMessageQueue() {
    if (isProcessingQueue || messageQueue.length === 0) {
        return;
    }

    // CRITICAL FIX #1: Check recursion depth to prevent stack overflow
    if (recursionDepth >= MAX_RECURSION_DEPTH) {
        if (!deferredProcessingPending) {
            deferredProcessingPending = true;
            console.error('[MessageQueue] Max recursion depth reached, deferring processing');
            // Defer to next event loop to allow stack to clear
            setTimeout(() => {
                deferredProcessingPending = false;
                processMessageQueue().catch(e =>
                    console.error('[MessageQueue] Deferred processing failed:', e)
                );
            }, 100);
        }
        return;
    }

    isProcessingQueue = true;
    recursionDepth++;

    // CRITICAL FIX #3: Track processing results and failed messages
    let processedCount = 0;
    const failedMessages = [];

    try {
        while (messageQueue.length > 0) {
            const queued = messageQueue.shift();
            try {
                await sendMessage(queued.msg, true);
                processedCount++;
            } catch (sendError) {
                // CRITICAL FIX #3: Don't lose messages - track failures
                console.error('[MessageQueue] Failed to send message:', sendError);
                failedMessages.push({
                    msg: queued.msg,
                    error: sendError,
                    timestamp: Date.now(),
                });
            }
        }

        // CRITICAL FIX #3: Report processing results
        if (processedCount > 0) {
            console.log(`[MessageQueue] Processed ${processedCount} messages`);
        }

        if (failedMessages.length > 0) {
            console.error(`[MessageQueue] ${failedMessages.length} messages failed to send`);
            // Emit event for monitoring
            try {
                // Dynamic import to avoid circular dependency
                import('../../../services/event-bus/index.js')
                    .then(({ EventBus }) => {
                        EventBus.emit('messagequeue:send_failed', {
                            failedCount: failedMessages.length,
                            messages: failedMessages,
                        });
                    })
                    .catch(emitError => {
                        console.error('[MessageQueue] Failed to emit failure event:', emitError);
                    });
            } catch (emitError) {
                console.error('[MessageQueue] Failed to import EventBus:', emitError);
            }
        }
    } finally {
        // CRITICAL FIX: Reset counter when queue drains and prevent negative counter
        if (messageQueue.length === 0 && recursionDepth > 0) {
            console.log(
                `[MessageQueue] Queue drained, resetting recursion depth from ${recursionDepth} to 0`
            );
            recursionDepth = 0;

            // CRITICAL: Don't decrement - we already reset
            // Also clear the isProcessingQueue flag
            isProcessingQueue = false;

            // Queue is empty - no more work to do
            // Don't call processMessageQueue() here - it will be called when new items arrive
        } else if (messageQueue.length > 0) {
            // Only reach here if queue has items
            isProcessingQueue = false;

            // Check if we need to defer to next tick to prevent stack overflow
            if (recursionDepth >= MAX_RECURSION_DEPTH) {
                recursionDepth--;
                if (!deferredProcessingPending) {
                    deferredProcessingPending = true;
                    console.warn(
                        '[MessageQueue] Max recursion depth in finally, deferring to next tick'
                    );
                    setTimeout(() => {
                        deferredProcessingPending = false;
                        processMessageQueue().catch(e =>
                            console.error('[MessageQueue] Deferred failed:', e)
                        );
                    }, 100);
                }
            } else {
                recursionDepth--;
                // RACE CONDITION FIX: Continue processing if messages were added during processing
                // This ensures the queue is drained completely before returning
                processMessageQueue().catch(e =>
                    console.error('[MessageQueue] Next batch failed:', e)
                );
            }
        } else {
            // Edge case: recursionDepth already 0
            isProcessingQueue = false;
        }
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
