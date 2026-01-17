/**
 * Embeddings Task Manager
 * 
 * Background processing orchestration for embedding generation:
 * - Web Worker integration for non-blocking processing
 * - Operation Lock integration (embedding_generation lock)
 * - Pause/resume/cancel functionality
 * - Cross-tab coordination via EventBus
 * - Background notification system
 * 
 * HNW Considerations:
 * - Hierarchy: Central coordinator for all embedding operations
 * - Network: Coordinates with LocalEmbeddings, LocalVectorStore, EventBus
 * - Wave: Manages long-running operations with checkpoints
 * 
 * @module embeddings/embeddings-task-manager
 */

import { EventBus } from '../services/event-bus.js';
import { LocalEmbeddings } from '../local-embeddings.js';
import PerformanceProfiler, { PerformanceCategory } from '../services/performance-profiler.js';

// ==========================================
// Task States
// ==========================================

const TaskState = {
    IDLE: 'idle',
    RUNNING: 'running',
    PAUSED: 'paused',
    COMPLETING: 'completing',
    CANCELLED: 'cancelled',
    ERROR: 'error'
};

// ==========================================
// Configuration
// ==========================================

const CONFIG = {
    BATCH_SIZE: 10,              // Embeddings per batch
    CHECKPOINT_INTERVAL: 50,     // Save progress every N items
    LOCK_NAME: 'embedding_generation',
    WORKER_TIMEOUT_MS: 30000,    // 30s timeout per batch
    MIN_INTERVAL_MS: 100         // Minimum interval between batches (for responsiveness)
};

// ==========================================
// State
// ==========================================

let currentTask = null;
let taskState = TaskState.IDLE;
let processedCount = 0;
let totalCount = 0;
let errorCount = 0;
let pauseRequested = false;
let cancelRequested = false;
let checkpointData = null;

// ==========================================
// Operation Lock Integration
// ==========================================

/**
 * Acquire embedding generation lock
 * @returns {Promise<boolean>} True if lock acquired
 */
async function acquireLock() {
    // Try to import OperationLock if available
    try {
        const { OperationLock } = await import('../operation-lock.js');
        const acquired = await OperationLock.acquire(CONFIG.LOCK_NAME, {
            timeout: 5000,
            maxWait: 60000
        });
        return acquired;
    } catch (e) {
        console.warn('[EmbeddingsTaskManager] OperationLock not available, proceeding without lock');
        return true;
    }
}

/**
 * Release embedding generation lock
 */
async function releaseLock() {
    try {
        const { OperationLock } = await import('../operation-lock.js');
        OperationLock.release(CONFIG.LOCK_NAME);
    } catch (e) {
        // Lock module not available
    }
}

// ==========================================
// Checkpointing
// ==========================================

/**
 * Save checkpoint for recovery
 */
async function saveCheckpoint() {
    checkpointData = {
        processedCount,
        totalCount,
        timestamp: Date.now(),
        taskId: currentTask?.id
    };

    try {
        localStorage.setItem('embedding_checkpoint', JSON.stringify(checkpointData));
    } catch (e) {
        console.warn('[EmbeddingsTaskManager] Could not save checkpoint:', e);
    }
}

/**
 * Load checkpoint for recovery
 */
function loadCheckpoint() {
    try {
        const data = localStorage.getItem('embedding_checkpoint');
        return data ? JSON.parse(data) : null;
    } catch (e) {
        return null;
    }
}

/**
 * Clear checkpoint
 */
function clearCheckpoint() {
    try {
        localStorage.removeItem('embedding_checkpoint');
    } catch (e) {
        // Ignore
    }
    checkpointData = null;
}

// ==========================================
// Task Execution
// ==========================================

/**
 * Start embedding generation task
 * @param {Object} options - Task options
 * @param {string[]} options.texts - Texts to embed
 * @param {Function} [options.onProgress] - Progress callback
 * @param {Function} [options.onComplete] - Completion callback
 * @param {Function} [options.onError] - Error callback
 * @returns {Promise<Object>} Task handle
 */
async function startTask(options) {
    if (taskState === TaskState.RUNNING) {
        throw new Error('Embedding task already running');
    }

    const { texts, onProgress, onComplete, onError } = options;

    // Acquire lock
    const lockAcquired = await acquireLock();
    if (!lockAcquired) {
        throw new Error('Could not acquire embedding lock - another operation in progress');
    }

    // Initialize task
    currentTask = {
        id: `embed_${Date.now()}`,
        texts,
        startTime: Date.now(),
        onProgress,
        onComplete,
        onError
    };

    totalCount = texts.length;
    processedCount = 0;
    errorCount = 0;
    pauseRequested = false;
    cancelRequested = false;
    taskState = TaskState.RUNNING;

    // Start performance tracking
    const stopTimer = PerformanceProfiler.startOperation('embedding_task', {
        category: PerformanceCategory.EMBEDDING_GENERATION,
        metadata: { totalCount }
    });

    // Subscribe to control events
    const cancelUnsub = EventBus.on('embedding:cancel_requested', () => {
        cancelRequested = true;
    });

    const pauseUnsub = EventBus.on('embedding:pause_toggle', ({ paused }) => {
        pauseRequested = paused;
    });

    // Emit task started event
    EventBus.emit('embedding:task_started', {
        taskId: currentTask.id,
        totalCount
    });

    try {
        // Initialize embeddings model
        await LocalEmbeddings.initialize((pct) => {
            onProgress?.({ phase: 'initializing', percent: pct * 0.2 });
        });

        // Process in batches
        const results = [];
        for (let i = 0; i < texts.length; i += CONFIG.BATCH_SIZE) {
            // Check for cancel
            if (cancelRequested) {
                taskState = TaskState.CANCELLED;
                break;
            }

            // Check for pause
            while (pauseRequested && !cancelRequested) {
                taskState = TaskState.PAUSED;
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            if (taskState === TaskState.PAUSED && !cancelRequested) {
                taskState = TaskState.RUNNING;
            }

            // Process batch
            const batch = texts.slice(i, Math.min(i + CONFIG.BATCH_SIZE, texts.length));

            try {
                const batchResults = await LocalEmbeddings.getBatchEmbeddings(batch, (done, total) => {
                    const currentProcessed = i + done;
                    processedCount = currentProcessed;
                    onProgress?.({
                        phase: 'embedding',
                        processed: currentProcessed,
                        total: totalCount,
                        percent: 20 + (currentProcessed / totalCount) * 80
                    });
                });

                results.push(...batchResults);
            } catch (batchError) {
                errorCount += batch.length;
                console.error('[EmbeddingsTaskManager] Batch error:', batchError);
                results.push(...Array(batch.length).fill(null));
            }

            // Checkpoint periodically
            if ((i + CONFIG.BATCH_SIZE) % CONFIG.CHECKPOINT_INTERVAL === 0) {
                await saveCheckpoint();
            }

            // Yield to main thread
            await new Promise(resolve => setTimeout(resolve, CONFIG.MIN_INTERVAL_MS));
        }

        // Complete task
        taskState = cancelRequested ? TaskState.CANCELLED : TaskState.COMPLETING;
        stopTimer();

        // Cleanup
        cancelUnsub();
        pauseUnsub();
        clearCheckpoint();
        await releaseLock();

        const finalResult = {
            taskId: currentTask.id,
            processed: processedCount,
            total: totalCount,
            errors: errorCount,
            cancelled: cancelRequested,
            duration: Date.now() - currentTask.startTime,
            embeddings: cancelRequested ? null : results
        };

        EventBus.emit('embedding:task_complete', finalResult);
        onComplete?.(finalResult);

        taskState = TaskState.IDLE;
        currentTask = null;

        return finalResult;

    } catch (error) {
        taskState = TaskState.ERROR;
        stopTimer();
        cancelUnsub();
        pauseUnsub();
        await releaseLock();

        const errorResult = {
            taskId: currentTask?.id,
            error: error.message,
            processed: processedCount,
            total: totalCount
        };

        EventBus.emit('embedding:task_error', errorResult);
        onError?.(error);

        currentTask = null;
        throw error;
    }
}

/**
 * Pause current task
 */
function pause() {
    if (taskState === TaskState.RUNNING) {
        pauseRequested = true;
    }
}

/**
 * Resume paused task
 */
function resume() {
    if (taskState === TaskState.PAUSED) {
        pauseRequested = false;
    }
}

/**
 * Cancel current task
 */
function cancel() {
    cancelRequested = true;
}

/**
 * Get current task status
 */
function getStatus() {
    return {
        state: taskState,
        taskId: currentTask?.id || null,
        processed: processedCount,
        total: totalCount,
        errors: errorCount,
        progress: totalCount > 0 ? (processedCount / totalCount) * 100 : 0
    };
}

/**
 * Check if a task can be recovered from checkpoint
 */
function canRecover() {
    const checkpoint = loadCheckpoint();
    return checkpoint !== null && checkpoint.processedCount < checkpoint.totalCount;
}

// ==========================================
// Public API
// ==========================================

export const EmbeddingsTaskManager = {
    /**
     * Start embedding generation task
     */
    startTask,

    /**
     * Pause current task
     */
    pause,

    /**
     * Resume paused task
     */
    resume,

    /**
     * Cancel current task
     */
    cancel,

    /**
     * Get current task status
     */
    getStatus,

    /**
     * Check if recovery is possible
     */
    canRecover,

    /**
     * Task state constants
     */
    TaskState,

    /**
     * Configuration
     */
    CONFIG
};

console.log('[EmbeddingsTaskManager] Module loaded');
