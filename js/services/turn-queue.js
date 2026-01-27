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

import { Chat } from '../chat.js';
import { CACHE_SIZES } from '../constants/limits.js';
import { DELAYS } from '../constants/delays.js';

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
// Metrics State
// ==========================================

/**
 * Configuration for metrics and observability
 */
const METRICS_CONFIG = {
    historySize: CACHE_SIZES.METRICS_HISTORY_SIZE,     // Keep last N completed turns for analysis
    warningThresholdMs: DELAYS.TOAST_SHORT_MS          // Emit warning if avgWaitTime exceeds this
};

/**
 * Completed turn history for metrics calculation
 * @type {Array<{id: string, waitTimeMs: number, processingTimeMs: number, completedAt: number}>}
 */
const turnHistory = [];

/**
 * Queue depth samples over time
 * @type {Array<{timestamp: number, depth: number}>}
 */
const depthSamples = [];

/**
 * Metrics counters
 */
let totalTurnsProcessed = 0;
let totalTurnsFailed = 0;
let maxWaitTimeMs = 0;
let warningEmitted = false;

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
 *
 * Uses atomic check-and-set pattern to prevent race conditions:
 * 1. Check isProcessing and return early if already processing
 * 2. Immediately set isProcessing = true (atomic in JS single-threaded execution)
 * 3. Use try/finally to guarantee isProcessing is always reset
 * 4. Call processNext() recursively in finally to continue queue processing
 */
async function processNext() {
    // Check if already processing - atomic in JS single-threaded model
    if (isProcessing) return;

    // Check queue after acquiring the "lock"
    if (queue.length === 0) return;

    // Set processing flag BEFORE any async operations
    isProcessing = true;

    try {
        currentTurn = queue.shift();
        currentTurn.status = 'processing';
        currentTurn.startedAt = Date.now();

        // Record queue depth sample
        recordDepthSample();

        console.log(`[TurnQueue] Processing turn ${currentTurn.id}`);
        notifyListeners('processing', currentTurn);

        // Get Chat module
        const Chat = getChatModule();

        if (!Chat || typeof Chat.sendMessage !== 'function') {
            throw new Error('Chat module not available');
        }

        // Process the message - bypass queue to avoid infinite recursion
        // TurnQueue already serializes turns, so we call sendMessage with bypassQueue: true
        const options = currentTurn.options || {};
        const result = await Chat.sendMessage(
            currentTurn.message,
            options,
            { bypassQueue: true, allowBypass: true }
        );

        currentTurn.status = 'completed';
        currentTurn.completedAt = Date.now();

        // Record metrics
        recordTurnMetrics(currentTurn, true);

        console.log(`[TurnQueue] Completed turn ${currentTurn.id} in ${currentTurn.completedAt - currentTurn.startedAt}ms`);
        notifyListeners('completed', currentTurn);

        currentTurn.resolve(result);
    } catch (error) {
        currentTurn.status = 'failed';
        currentTurn.completedAt = Date.now();

        // Record metrics for failed turn
        recordTurnMetrics(currentTurn, false);

        console.error(`[TurnQueue] Failed turn ${currentTurn.id}:`, error);
        notifyListeners('failed', currentTurn, error);

        currentTurn.reject(error);
    } finally {
        // Always reset processing flag, even if an error occurred
        // This ensures the queue doesn't get stuck in a processing state
        currentTurn = null;
        isProcessing = false;

        // FIX M3: Direct call instead of setTimeout
        // The isProcessing check at the top of processNext() prevents re-entry race conditions
        // This ensures deterministic sequencing without setTimeout's timing uncertainty
        // Error handling is done by the promise chain of each individual turn
        processNext().catch(e => console.error('[TurnQueue] Next turn failed:', e));
    }
}

/**
 * Get the Chat module
 *
 * @returns {Object} Chat module
 */
function getChatModule() {
    return Chat;
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
// Metrics Functions
// ==========================================

/**
 * Record metrics for a completed turn
 * @param {QueuedTurn} turn - The completed turn
 * @param {boolean} success - Whether it succeeded
 */
function recordTurnMetrics(turn, success) {
    const waitTimeMs = turn.startedAt - turn.queuedAt;
    const processingTimeMs = turn.completedAt - turn.startedAt;

    // Update counters
    if (success) {
        totalTurnsProcessed++;
    } else {
        totalTurnsFailed++;
    }

    // Track max wait time
    if (waitTimeMs > maxWaitTimeMs) {
        maxWaitTimeMs = waitTimeMs;
    }

    // Add to history
    turnHistory.push({
        id: turn.id,
        waitTimeMs,
        processingTimeMs,
        completedAt: turn.completedAt,
        success
    });

    // Trim old history
    while (turnHistory.length > METRICS_CONFIG.historySize) {
        turnHistory.shift();
    }

    // Check for warning threshold
    const metrics = calculateMetrics();
    if (metrics.avgWaitTimeMs > METRICS_CONFIG.warningThresholdMs && !warningEmitted) {
        warningEmitted = true;
        console.warn(`[TurnQueue] Average wait time (${metrics.avgWaitTimeMs.toFixed(0)}ms) exceeds threshold (${METRICS_CONFIG.warningThresholdMs}ms)`);

        // Emit event if EventBus is available
        try {
            // Dynamic import to avoid circular dependency
            import('./event-bus.js').then(({ EventBus }) => {
                EventBus.emit('turnqueue:performance_warning', {
                    avgWaitTimeMs: metrics.avgWaitTimeMs,
                    maxWaitTimeMs: metrics.maxWaitTimeMs,
                    queueDepth: queue.length,
                    threshold: METRICS_CONFIG.warningThresholdMs
                });
            }).catch((err) => {
                console.warn('[TurnQueue] Failed to emit performance warning event:', err);
            });
        } catch (e) {
            // Ignore
        }
    }
}

/**
 * Record queue depth sample
 */
function recordDepthSample() {
    depthSamples.push({
        timestamp: Date.now(),
        depth: queue.length + 1 // +1 for current processing turn
    });

    // Trim old samples
    while (depthSamples.length > CACHE_SIZES.DEPTH_SAMPLES_SIZE) {
        depthSamples.shift();
    }
}

/**
 * Calculate metrics from history
 * @returns {{avgWaitTimeMs: number, avgProcessingTimeMs: number, maxWaitTimeMs: number, totalProcessed: number, totalFailed: number, successRate: number}}
 */
function calculateMetrics() {
    if (turnHistory.length === 0) {
        return {
            avgWaitTimeMs: 0,
            avgProcessingTimeMs: 0,
            maxWaitTimeMs: 0,
            totalProcessed: totalTurnsProcessed,
            totalFailed: totalTurnsFailed,
            successRate: 1
        };
    }

    const totalWait = turnHistory.reduce((sum, t) => sum + t.waitTimeMs, 0);
    const totalProcessing = turnHistory.reduce((sum, t) => sum + t.processingTimeMs, 0);
    const successCount = turnHistory.filter(t => t.success).length;

    return {
        avgWaitTimeMs: totalWait / turnHistory.length,
        avgProcessingTimeMs: totalProcessing / turnHistory.length,
        maxWaitTimeMs,
        totalProcessed: totalTurnsProcessed,
        totalFailed: totalTurnsFailed,
        successRate: successCount / turnHistory.length
    };
}

/**
 * Get comprehensive queue metrics
 * @returns {Object} Metrics with wait times, processing times, queue depth, and history
 */
function getMetrics() {
    const metrics = calculateMetrics();

    // Calculate queue depth stats
    const avgDepth = depthSamples.length > 0
        ? depthSamples.reduce((sum, s) => sum + s.depth, 0) / depthSamples.length
        : 0;
    const maxDepth = depthSamples.length > 0
        ? Math.max(...depthSamples.map(s => s.depth))
        : 0;

    return {
        // Wait times
        avgWaitTimeMs: Math.round(metrics.avgWaitTimeMs),
        maxWaitTimeMs: Math.round(metrics.maxWaitTimeMs),

        // Processing times
        avgProcessingTimeMs: Math.round(metrics.avgProcessingTimeMs),

        // Queue depth
        currentDepth: queue.length + (isProcessing ? 1 : 0),
        avgDepth: Math.round(avgDepth * 10) / 10,
        maxDepth,

        // Counters
        totalProcessed: metrics.totalProcessed,
        totalFailed: metrics.totalFailed,
        successRate: Math.round(metrics.successRate * 100),

        // History info
        historySize: turnHistory.length,

        // Warning state
        warningThresholdMs: METRICS_CONFIG.warningThresholdMs,
        isAboveThreshold: metrics.avgWaitTimeMs > METRICS_CONFIG.warningThresholdMs
    };
}

/**
 * Reset all metrics
 */
function resetMetrics() {
    turnHistory.length = 0;
    depthSamples.length = 0;
    totalTurnsProcessed = 0;
    totalTurnsFailed = 0;
    maxWaitTimeMs = 0;
    warningEmitted = false;
    console.log('[TurnQueue] Metrics reset');
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

    // Metrics (observability)
    getMetrics,
    resetMetrics,

    // Management
    clearPending,
    subscribe,

    // For testing
    _queue: queue,
    _QueuedTurn: QueuedTurn,
    _turnHistory: turnHistory
};

// ES Module export
export { TurnQueue };

console.log('[TurnQueue] Turn Queue Service loaded');
