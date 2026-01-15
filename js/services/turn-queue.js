/**
 * Turn Queue Service
 * 
 * Serializes conversation message processing to prevent interleaving.
 * Ensures each message is fully processed before the next begins.
 * 
 * HNW Wave: Prevents timing chaos from rapid-fire messages by
 * enforcing sequential processing with proper queuing.
 * 
 * @module services/turn-queue
 */

// ==========================================
// Queue State
// ==========================================

/**
 * Represents a queued message turn
 */
class QueuedTurn {
    constructor(message, options, resolve, reject) {
        this.id = `turn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.message = message;
        this.options = options;
        this.resolve = resolve;
        this.reject = reject;
        this.queuedAt = Date.now();
        this.startedAt = null;
        this.completedAt = null;
        this.status = 'queued'; // 'queued' | 'processing' | 'completed' | 'failed'
    }
}

// Internal state
const queue = [];
let isProcessing = false;
let currentTurn = null;
const listeners = [];

// ==========================================
// Core Functions
// ==========================================

/**
 * Push a message to the turn queue
 * 
 * @param {string} message - User message
 * @param {Object} [options] - Message options (API key, etc.)
 * @returns {Promise<*>} Resolves with the chat response
 */
function push(message, options = null) {
    return new Promise((resolve, reject) => {
        const turn = new QueuedTurn(message, options, resolve, reject);
        queue.push(turn);

        console.log(`[TurnQueue] Queued turn ${turn.id}, queue length: ${queue.length}`);
        notifyListeners('queued', turn);

        // Start processing if not already
        processNext();
    });
}

/**
 * Process the next turn in the queue
 */
async function processNext() {
    if (isProcessing || queue.length === 0) {
        return;
    }

    isProcessing = true;
    currentTurn = queue.shift();
    currentTurn.status = 'processing';
    currentTurn.startedAt = Date.now();

    console.log(`[TurnQueue] Processing turn ${currentTurn.id}`);
    notifyListeners('processing', currentTurn);

    try {
        // Get Chat module
        const Chat = getChatModule();

        if (!Chat || typeof Chat.sendMessage !== 'function') {
            throw new Error('Chat module not available');
        }

        // Process the message
        const result = await Chat.sendMessage(
            currentTurn.message,
            currentTurn.options
        );

        currentTurn.status = 'completed';
        currentTurn.completedAt = Date.now();

        console.log(`[TurnQueue] Completed turn ${currentTurn.id} in ${currentTurn.completedAt - currentTurn.startedAt}ms`);
        notifyListeners('completed', currentTurn);

        currentTurn.resolve(result);
    } catch (error) {
        currentTurn.status = 'failed';
        currentTurn.completedAt = Date.now();

        console.error(`[TurnQueue] Failed turn ${currentTurn.id}:`, error);
        notifyListeners('failed', currentTurn, error);

        currentTurn.reject(error);
    } finally {
        currentTurn = null;
        isProcessing = false;

        // Process next turn
        processNext();
    }
}

/**
 * Get the Chat module (handles both ES modules and window globals)
 * 
 * @returns {Object|null}
 */
function getChatModule() {
    if (typeof window !== 'undefined' && window.Chat) {
        return window.Chat;
    }
    return null;
}

/**
 * Get count of pending (queued) turns
 * 
 * @returns {number}
 */
function getPendingCount() {
    return queue.length;
}

/**
 * Check if currently processing a turn
 * 
 * @returns {boolean}
 */
function isActive() {
    return isProcessing;
}

/**
 * Get the current turn being processed
 * 
 * @returns {QueuedTurn|null}
 */
function getCurrentTurn() {
    return currentTurn;
}

/**
 * Get queue status summary
 * 
 * @returns {{
 *   pending: number,
 *   isProcessing: boolean,
 *   currentTurnId: string|null,
 *   queuedTurnIds: string[]
 * }}
 */
function getStatus() {
    return {
        pending: queue.length,
        isProcessing,
        currentTurnId: currentTurn?.id || null,
        queuedTurnIds: queue.map(t => t.id)
    };
}

/**
 * Clear all pending turns (not the current one)
 * Rejected with AbortError
 * 
 * @returns {number} Number of cleared turns
 */
function clearPending() {
    const count = queue.length;

    while (queue.length > 0) {
        const turn = queue.shift();
        turn.reject(new DOMException('Turn queue cleared', 'AbortError'));
    }

    console.log(`[TurnQueue] Cleared ${count} pending turns`);
    return count;
}

/**
 * Subscribe to queue events
 * 
 * @param {function(string, QueuedTurn, Error?): void} callback - Event callback
 * @returns {function(): void} Unsubscribe function
 */
function subscribe(callback) {
    listeners.push(callback);

    return () => {
        const index = listeners.indexOf(callback);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    };
}

/**
 * Notify all listeners of an event
 * 
 * @param {string} event - Event type
 * @param {QueuedTurn} turn - The turn
 * @param {Error} [error] - Error if any
 */
function notifyListeners(event, turn, error = null) {
    for (const listener of listeners) {
        try {
            listener(event, turn, error);
        } catch (err) {
            console.error('[TurnQueue] Listener error:', err);
        }
    }
}

/**
 * Get wait time estimate for a new turn
 * Based on average processing time of recent turns
 * 
 * @returns {number} Estimated wait time in ms
 */
function getEstimatedWaitTime() {
    const avgProcessingTime = 5000; // 5 second default estimate
    const pendingCount = queue.length + (isProcessing ? 1 : 0);
    return pendingCount * avgProcessingTime;
}

/**
 * Get user-friendly status message for UI
 * 
 * @returns {string|null} Status message or null if queue is empty
 */
function getStatusMessage() {
    if (!isProcessing && queue.length === 0) {
        return null;
    }

    if (isProcessing && queue.length === 0) {
        return 'Processing your message...';
    }

    if (queue.length === 1) {
        return 'Thinking about your previous message...';
    }

    return `Processing ${queue.length + 1} messages...`;
}

// ==========================================
// Public API
// ==========================================

const TurnQueue = {
    // Core operations
    push,
    processNext,

    // Status
    getPendingCount,
    isActive,
    getCurrentTurn,
    getStatus,
    getStatusMessage,
    getEstimatedWaitTime,

    // Management
    clearPending,
    subscribe,

    // For testing
    _queue: queue,
    _QueuedTurn: QueuedTurn
};

// ES Module export
export { TurnQueue };

console.log('[TurnQueue] Turn Queue Service loaded');
