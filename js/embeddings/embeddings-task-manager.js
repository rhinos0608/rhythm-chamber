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
    ERROR: 'error',
};

// ==========================================
// Configuration
// ==========================================

const CONFIG = {
    BATCH_SIZE: 10, // Embeddings per batch
    CHECKPOINT_INTERVAL: 50, // Save progress every N items
    LOCK_NAME: 'embedding_generation',
    WORKER_TIMEOUT_MS: 30000, // 30s timeout per batch
    MIN_INTERVAL_MS: 100, // Minimum interval between batches (for responsiveness)
    ETA_INITIAL_CHUNKS: 5, // Emit first ETA after processing this many chunks
    ETA_UPDATE_INTERVAL: 10, // Update ETA every N chunks after initial emit
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

// ETA tracking state
let etaEmitted = false;
let lastEtaEmitCount = 0;

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
            maxWait: 60000,
        });
        return acquired;
    } catch (e) {
        console.warn(
            '[EmbeddingsTaskManager] OperationLock not available, proceeding without lock'
        );
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
// Checkpointing (Hybrid Storage: localStorage + IndexedDB)
// ==========================================

// Checkpoint storage keys
const CHECKPOINT_METADATA_KEY = 'embedding_checkpoint_meta';
const CHECKPOINT_TEXTS_KEY = 'embedding_checkpoint_texts';
const CHECKPOINT_IDB_STORE = 'config'; // Use existing config store in IndexedDB

/**
 * Calculate approximate JSON string size in bytes
 * @param {any} data - Data to estimate size of
 * @returns {number} Approximate size in bytes
 */
function estimateJsonSize(data) {
    try {
        return new Blob([JSON.stringify(data)]).size;
    } catch (e) {
        // Fallback: rough estimate (2 bytes per char for UTF-16)
        return JSON.stringify(data).length * 2;
    }
}

/**
 * Get IndexedDB connection for checkpoint storage
 * @returns {Promise<IDBDatabase|null>}
 */
async function getCheckpointDB() {
    try {
        // Try to import IndexedDBCore if available
        const { IndexedDBCore } = await import('../storage/indexeddb.js');
        return await IndexedDBCore.initDatabase();
    } catch (e) {
        console.warn('[EmbeddingsTaskManager] IndexedDB not available for checkpoint:', e.message);
        return null;
    }
}

/**
 * Save bulk texts to IndexedDB
 * @param {string[]} texts - Texts array to save
 * @returns {Promise<boolean>} True if saved successfully
 */
async function saveTextsToIndexedDB(texts) {
    try {
        const db = await getCheckpointDB();
        if (!db) {
            EventBus.emit('embedding:error', {
                error: 'IndexedDB not available for checkpoint storage',
                context: 'checkpoint_save',
                userFacing: true,
                userMessage: 'Unable to save progress - database unavailable',
                recoverable: true,
            });
            return false;
        }

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(CHECKPOINT_IDB_STORE, 'readwrite');
            const store = transaction.objectStore(CHECKPOINT_IDB_STORE);

            const request = store.put({
                key: CHECKPOINT_TEXTS_KEY,
                value: texts,
                timestamp: Date.now(),
            });

            request.onsuccess = () => resolve(true);
            request.onerror = () => {
                const errorMsg = request.error?.message || 'Unknown IndexedDB error';
                console.error(
                    '[EmbeddingsTaskManager] Failed to save texts to IndexedDB:',
                    request.error
                );

                // Emit user-facing error
                EventBus.emit('embedding:error', {
                    error: errorMsg,
                    context: 'checkpoint_save',
                    userFacing: true,
                    userMessage:
                        'Failed to save checkpoint progress. Your data may not be recoverable if interrupted.',
                    recoverable: false,
                    technicalDetails: request.error,
                });

                reject(request.error);
            };
        });
    } catch (e) {
        console.error('[EmbeddingsTaskManager] IndexedDB save error:', e);

        // Emit error for unexpected failures
        EventBus.emit('embedding:error', {
            error: e.message || 'Unknown error',
            context: 'checkpoint_save',
            userFacing: true,
            userMessage: 'Unexpected error while saving checkpoint progress',
            recoverable: true,
            technicalDetails: e,
        });

        return false;
    }
}

/**
 * Load bulk texts from IndexedDB
 * @returns {Promise<string[]|null>}
 */
async function loadTextsFromIndexedDB() {
    try {
        const db = await getCheckpointDB();
        if (!db) {
            EventBus.emit('embedding:error', {
                error: 'IndexedDB not available for checkpoint recovery',
                context: 'checkpoint_load',
                userFacing: true,
                userMessage: 'Unable to recover progress - database unavailable',
                recoverable: false,
            });
            return null;
        }

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(CHECKPOINT_IDB_STORE, 'readonly');
            const store = transaction.objectStore(CHECKPOINT_IDB_STORE);
            const request = store.get(CHECKPOINT_TEXTS_KEY);

            request.onsuccess = () => {
                const result = request.result;
                resolve(result?.value || null);
            };
            request.onerror = () => {
                const errorMsg = request.error?.message || 'Unknown IndexedDB error';
                console.error(
                    '[EmbeddingsTaskManager] Failed to load texts from IndexedDB:',
                    request.error
                );

                // Emit user-facing error
                EventBus.emit('embedding:error', {
                    error: errorMsg,
                    context: 'checkpoint_load',
                    userFacing: true,
                    userMessage: 'Failed to load saved progress. Starting from beginning.',
                    recoverable: true,
                    technicalDetails: request.error,
                });

                reject(request.error);
            };
        });
    } catch (e) {
        console.error('[EmbeddingsTaskManager] IndexedDB load error:', e);

        // Emit error for unexpected failures
        EventBus.emit('embedding:error', {
            error: e.message || 'Unknown error',
            context: 'checkpoint_load',
            userFacing: true,
            userMessage: 'Unexpected error while loading saved progress',
            recoverable: true,
            technicalDetails: e,
        });

        return null;
    }
}

/**
 * Clear bulk texts from IndexedDB
 * @returns {Promise<void>}
 */
async function clearTextsFromIndexedDB() {
    try {
        const db = await getCheckpointDB();
        if (!db) {
            console.warn('[EmbeddingsTaskManager] Database unavailable for cleanup');
            return;
        }

        return new Promise(resolve => {
            const transaction = db.transaction(CHECKPOINT_IDB_STORE, 'readwrite');
            const store = transaction.objectStore(CHECKPOINT_IDB_STORE);
            const request = store.delete(CHECKPOINT_TEXTS_KEY);

            request.onsuccess = () => resolve();
            request.onerror = () => {
                const errorMsg = request.error?.message || 'Unknown IndexedDB error';
                console.warn(
                    '[EmbeddingsTaskManager] Failed to clear texts from IndexedDB:',
                    request.error
                );

                // Emit cleanup error (non-critical, but good to know)
                EventBus.emit('embedding:error', {
                    error: errorMsg,
                    context: 'checkpoint_cleanup',
                    userFacing: false, // Cleanup errors are not critical for users
                    userMessage: null,
                    recoverable: true,
                    technicalDetails: request.error,
                });

                resolve();
            };
        });
    } catch (e) {
        // Log cleanup errors but don't fail
        console.warn('[EmbeddingsTaskManager] Cleanup error:', e);
    }
}

/**
 * Save checkpoint for recovery
 * Uses hybrid storage: lightweight metadata in localStorage, bulk texts in IndexedDB
 * This prevents localStorage quota exceeded errors for large streaming histories
 */
async function saveCheckpoint() {
    const texts = currentTask?.texts || [];
    const textsSize = estimateJsonSize(texts);

    // Threshold: 1MB is safe for localStorage (well under 5MB limit with margin for other data)
    const LOCALSTORAGE_SIZE_THRESHOLD = 1 * 1024 * 1024; // 1MB

    // Metadata (always lightweight, goes to localStorage)
    const metadata = {
        processedCount,
        totalCount,
        timestamp: Date.now(),
        taskId: currentTask?.id,
        processedIndices: currentTask?.processedIndices || [],
        nextIndex: currentTask?.nextIndex || 0,
        textsStoredInIDB: false, // Flag to indicate where texts are stored
        textsCount: texts.length,
    };

    checkpointData = { ...metadata, texts };

    try {
        if (textsSize > LOCALSTORAGE_SIZE_THRESHOLD) {
            // Large texts: store in IndexedDB
            console.log(
                `[EmbeddingsTaskManager] Texts array too large for localStorage (${(textsSize / 1024 / 1024).toFixed(2)}MB), using IndexedDB`
            );

            const saved = await saveTextsToIndexedDB(texts);
            if (saved) {
                metadata.textsStoredInIDB = true;
                localStorage.setItem(CHECKPOINT_METADATA_KEY, JSON.stringify(metadata));
                console.log(
                    '[EmbeddingsTaskManager] Checkpoint saved (metadata: localStorage, texts: IndexedDB)'
                );
            } else {
                // IndexedDB failed - try localStorage as last resort (may fail for very large data)
                console.warn(
                    '[EmbeddingsTaskManager] IndexedDB unavailable, attempting localStorage fallback'
                );
                metadata.texts = texts;
                localStorage.setItem(CHECKPOINT_METADATA_KEY, JSON.stringify(metadata));
            }
        } else {
            // Small enough for localStorage - include texts directly
            metadata.texts = texts;
            localStorage.setItem(CHECKPOINT_METADATA_KEY, JSON.stringify(metadata));
            console.log('[EmbeddingsTaskManager] Checkpoint saved to localStorage');
        }
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.message?.includes('quota')) {
            console.error(
                '[EmbeddingsTaskManager] localStorage quota exceeded, attempting IndexedDB fallback'
            );

            // Try IndexedDB as fallback
            try {
                const saved = await saveTextsToIndexedDB(texts);
                if (saved) {
                    metadata.textsStoredInIDB = true;
                    delete metadata.texts; // Remove texts from metadata
                    localStorage.setItem(CHECKPOINT_METADATA_KEY, JSON.stringify(metadata));
                    console.log('[EmbeddingsTaskManager] Checkpoint saved via IndexedDB fallback');
                } else {
                    console.error(
                        '[EmbeddingsTaskManager] Both localStorage and IndexedDB failed - checkpoint not saved'
                    );
                    EventBus.emit('embedding:checkpoint_failed', {
                        reason: 'storage_quota_exceeded',
                        textsSize,
                        processedCount,
                        userFacing: true,
                        userMessage:
                            'Storage quota exceeded. Progress cannot be saved - if interrupted, you will need to start over.',
                        recoverable: false,
                    });
                }
            } catch (fallbackError) {
                console.error(
                    '[EmbeddingsTaskManager] IndexedDB fallback also failed:',
                    fallbackError
                );
                EventBus.emit('embedding:checkpoint_failed', {
                    reason: 'all_storage_failed',
                    textsSize,
                    processedCount,
                    userFacing: true,
                    userMessage: 'All storage methods failed. Progress cannot be saved.',
                    recoverable: false,
                    technicalDetails: fallbackError,
                });
            }
        } else {
            console.warn('[EmbeddingsTaskManager] Could not save checkpoint:', e);
        }
    }
}

/**
 * Load checkpoint for recovery
 * Handles hybrid storage: metadata from localStorage, texts from IndexedDB if needed
 * @returns {Promise<Object|null>}
 */
async function loadCheckpoint() {
    try {
        // First, try new hybrid format
        let metadataStr = localStorage.getItem(CHECKPOINT_METADATA_KEY);

        // Fallback to legacy key for backwards compatibility
        if (!metadataStr) {
            metadataStr = localStorage.getItem('embedding_checkpoint');
            if (metadataStr) {
                console.log('[EmbeddingsTaskManager] Loading checkpoint from legacy key');
            }
        }

        if (!metadataStr) {
            return null;
        }

        const metadata = JSON.parse(metadataStr);

        // Validate basic structure
        if (metadata.processedCount === undefined || metadata.totalCount === undefined) {
            console.warn('[EmbeddingsTaskManager] Invalid checkpoint metadata');
            return null;
        }

        // Load texts from appropriate storage
        let texts = metadata.texts;

        if (metadata.textsStoredInIDB) {
            console.log('[EmbeddingsTaskManager] Loading texts from IndexedDB...');
            texts = await loadTextsFromIndexedDB();

            if (!texts) {
                console.warn('[EmbeddingsTaskManager] Could not load texts from IndexedDB');
                return null;
            }
        }

        // Validate texts
        if (!Array.isArray(texts) || texts.length === 0) {
            // Check if textsCount matches expectation
            if (metadata.textsCount && metadata.textsCount > 0) {
                console.warn('[EmbeddingsTaskManager] Checkpoint texts missing or empty');
                return null;
            }
        }

        // Validate texts count matches
        if (texts && metadata.textsCount && texts.length !== metadata.textsCount) {
            console.warn(
                `[EmbeddingsTaskManager] Texts count mismatch: expected ${metadata.textsCount}, got ${texts.length}`
            );
            return null;
        }

        return {
            ...metadata,
            texts,
        };
    } catch (e) {
        console.warn('[EmbeddingsTaskManager] Could not load checkpoint:', e);
        return null;
    }
}

/**
 * Clear checkpoint from all storage locations
 */
async function clearCheckpoint() {
    try {
        // Clear from localStorage (both new and legacy keys)
        localStorage.removeItem(CHECKPOINT_METADATA_KEY);
        localStorage.removeItem('embedding_checkpoint'); // Legacy key

        // Clear from IndexedDB
        await clearTextsFromIndexedDB();

        console.log('[EmbeddingsTaskManager] Checkpoint cleared');
    } catch (e) {
        console.warn('[EmbeddingsTaskManager] Error clearing checkpoint:', e);
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

    // Input validation - validate texts before acquiring lock
    if (!Array.isArray(texts)) {
        throw new Error('Invalid input: texts must be an array');
    }
    if (texts.length === 0) {
        throw new Error('Invalid input: texts array cannot be empty');
    }
    if (!texts.every(text => typeof text === 'string' && text.length > 0)) {
        throw new Error('Invalid input: all texts must be non-empty strings');
    }

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
        onError,
        processedIndices: [],
        nextIndex: 0,
    };

    totalCount = texts.length;
    processedCount = 0;
    errorCount = 0;
    pauseRequested = false;
    cancelRequested = false;
    taskState = TaskState.RUNNING;
    etaEmitted = false;
    lastEtaEmitCount = 0;

    // Start performance tracking
    const stopTimer = PerformanceProfiler.startOperation('embedding_task', {
        category: PerformanceCategory.EMBEDDING_GENERATION,
        metadata: { totalCount },
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
        totalCount,
    });

    try {
        // Initialize embeddings model
        await LocalEmbeddings.initialize(pct => {
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
                const batchResults = await LocalEmbeddings.getBatchEmbeddings(
                    batch,
                    (done, total) => {
                        const currentProcessed = i + done;
                        processedCount = currentProcessed;
                        onProgress?.({
                            phase: 'embedding',
                            processed: currentProcessed,
                            total: totalCount,
                            percent: 20 + (currentProcessed / totalCount) * 80,
                        });

                        // ETA calculation and emission
                        // Emit after ETA_INITIAL_CHUNKS (5), then every ETA_UPDATE_INTERVAL (10) chunks
                        const shouldEmitInitial =
                            !etaEmitted && currentProcessed >= CONFIG.ETA_INITIAL_CHUNKS;
                        const shouldEmitUpdate =
                            etaEmitted &&
                            currentProcessed - lastEtaEmitCount >= CONFIG.ETA_UPDATE_INTERVAL;

                        if (shouldEmitInitial || shouldEmitUpdate) {
                            const elapsed = Date.now() - currentTask.startTime;
                            const timePerChunk = elapsed / currentProcessed;
                            const remainingChunks = totalCount - currentProcessed;
                            const remainingMs = remainingChunks * timePerChunk;
                            const remainingSeconds = Math.ceil(remainingMs / 1000);

                            EventBus.emit('embedding:time_estimate', {
                                remainingSeconds,
                                remainingMs,
                                processedChunks: currentProcessed,
                                totalChunks: totalCount,
                                elapsedMs: elapsed,
                                averageChunkMs: timePerChunk,
                            });

                            etaEmitted = true;
                            lastEtaEmitCount = currentProcessed;
                        }
                    }
                );

                results.push(...batchResults);
            } catch (batchError) {
                errorCount += batch.length;
                console.error('[EmbeddingsTaskManager] Batch error:', batchError);
                results.push(...Array(batch.length).fill(null));
            }

            // Checkpoint periodically
            if ((i + CONFIG.BATCH_SIZE) % CONFIG.CHECKPOINT_INTERVAL === 0) {
                // Update task state for checkpoint recovery
                currentTask.processedIndices = Array.from(
                    { length: i + CONFIG.BATCH_SIZE },
                    (_, idx) => idx
                );
                currentTask.nextIndex = i + CONFIG.BATCH_SIZE;
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
            embeddings: cancelRequested ? null : results,
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
            total: totalCount,
            userFacing: true,
            userMessage: `Embedding generation failed: ${error.message}`,
            recoverable: false,
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
        progress: totalCount > 0 ? (processedCount / totalCount) * 100 : 0,
    };
}

/**
 * Check if a task can be recovered from checkpoint
 * @returns {Promise<boolean>}
 */
async function canRecover() {
    const checkpoint = await loadCheckpoint();
    if (!checkpoint) {
        return false;
    }
    // Check if checkpoint is valid and incomplete
    return (
        checkpoint.processedCount < checkpoint.totalCount &&
        Array.isArray(checkpoint.texts) &&
        checkpoint.texts.length > 0 &&
        checkpoint.texts.length === checkpoint.totalCount
    );
}

/**
 * Recover task from checkpoint
 * @param {Function} [options.onProgress] - Progress callback
 * @param {Function} [options.onComplete] - Completion callback
 * @param {Function} [options.onError] - Error callback
 * @returns {Promise<Object>} Task handle
 */
async function recoverTask(options = {}) {
    const checkpoint = await loadCheckpoint();

    // Validate checkpoint inline since canRecover() is async
    const isValid =
        checkpoint &&
        checkpoint.processedCount < checkpoint.totalCount &&
        Array.isArray(checkpoint.texts) &&
        checkpoint.texts.length > 0 &&
        checkpoint.texts.length === checkpoint.totalCount;

    if (!isValid) {
        throw new Error('No valid checkpoint found for recovery');
    }

    const { onProgress, onComplete, onError } = options;

    // Acquire lock
    const lockAcquired = await acquireLock();
    if (!lockAcquired) {
        throw new Error('Could not acquire embedding lock - another operation in progress');
    }

    // Initialize task from checkpoint
    // Use nullish coalescing to avoid treating 0 as falsy
    const startIndex = checkpoint.nextIndex ?? checkpoint.processedCount;

    currentTask = {
        id: checkpoint.taskId || `embed_${Date.now()}`,
        texts: checkpoint.texts,
        startTime: Date.now(),
        onProgress,
        onComplete,
        onError,
        processedIndices: checkpoint.processedIndices || [],
        nextIndex: startIndex,
    };

    totalCount = checkpoint.totalCount;
    processedCount = checkpoint.processedCount;
    errorCount = 0;
    pauseRequested = false;
    cancelRequested = false;
    taskState = TaskState.RUNNING;
    etaEmitted = false;
    lastEtaEmitCount = 0;

    // Start performance tracking
    const stopTimer = PerformanceProfiler.startOperation('embedding_task_recovery', {
        category: PerformanceCategory.EMBEDDING_GENERATION,
        metadata: { totalCount, recoveredFrom: startIndex },
    });

    // Subscribe to control events
    const cancelUnsub = EventBus.on('embedding:cancel_requested', () => {
        cancelRequested = true;
    });

    const pauseUnsub = EventBus.on('embedding:pause_toggle', ({ paused }) => {
        pauseRequested = paused;
    });

    // Emit recovery started event
    EventBus.emit('embedding:task_started', {
        taskId: currentTask.id,
        totalCount,
        recovered: true,
        startIndex,
    });

    try {
        // Initialize embeddings model
        await LocalEmbeddings.initialize(pct => {
            onProgress?.({ phase: 'initializing', percent: pct * 0.2 });
        });

        // Process remaining texts in batches
        const results = [];
        for (let i = startIndex; i < checkpoint.texts.length; i += CONFIG.BATCH_SIZE) {
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
            const batch = checkpoint.texts.slice(
                i,
                Math.min(i + CONFIG.BATCH_SIZE, checkpoint.texts.length)
            );

            try {
                const batchResults = await LocalEmbeddings.getBatchEmbeddings(
                    batch,
                    (done, total) => {
                        const currentProcessed = i + done;
                        processedCount = currentProcessed;
                        onProgress?.({
                            phase: 'embedding',
                            processed: currentProcessed,
                            total: totalCount,
                            percent: 20 + (currentProcessed / totalCount) * 80,
                            recovered: true,
                        });

                        // ETA calculation and emission (same logic as startTask)
                        const shouldEmitInitial =
                            !etaEmitted && currentProcessed >= CONFIG.ETA_INITIAL_CHUNKS;
                        const shouldEmitUpdate =
                            etaEmitted &&
                            currentProcessed - lastEtaEmitCount >= CONFIG.ETA_UPDATE_INTERVAL;

                        if (shouldEmitInitial || shouldEmitUpdate) {
                            const elapsed = Date.now() - currentTask.startTime;
                            const timePerChunk = elapsed / currentProcessed;
                            const remainingChunks = totalCount - currentProcessed;
                            const remainingMs = remainingChunks * timePerChunk;
                            const remainingSeconds = Math.ceil(remainingMs / 1000);

                            EventBus.emit('embedding:time_estimate', {
                                remainingSeconds,
                                remainingMs,
                                processedChunks: currentProcessed,
                                totalChunks: totalCount,
                                elapsedMs: elapsed,
                                averageChunkMs: timePerChunk,
                                recovered: true,
                            });

                            etaEmitted = true;
                            lastEtaEmitCount = currentProcessed;
                        }
                    }
                );

                results.push(...batchResults);
            } catch (batchError) {
                errorCount += batch.length;
                console.error('[EmbeddingsTaskManager] Batch error during recovery:', batchError);
                results.push(...Array(batch.length).fill(null));
            }

            // Checkpoint periodically
            if ((i + CONFIG.BATCH_SIZE) % CONFIG.CHECKPOINT_INTERVAL === 0) {
                // Clamp endIndex to prevent overflow beyond texts array
                const endIndex = Math.min(i + CONFIG.BATCH_SIZE, checkpoint.texts.length);
                currentTask.processedIndices = Array.from({ length: endIndex }, (_, idx) => idx);
                currentTask.nextIndex = endIndex;
                await saveCheckpoint();
            }

            // Yield to main thread
            await new Promise(resolve => setTimeout(resolve, CONFIG.MIN_INTERVAL_MS));
        }

        // Complete task
        taskState = cancelRequested ? TaskState.CANCELLED : TaskState.COMPLETING;
        stopTimer();

        // Cleanup EventBus subscriptions
        cancelUnsub();
        pauseUnsub();

        // Cleanup
        await clearCheckpoint();
        await releaseLock();

        const finalResult = {
            taskId: currentTask.id,
            processed: processedCount,
            total: totalCount,
            errors: errorCount,
            cancelled: cancelRequested,
            recovered: true,
            duration: Date.now() - currentTask.startTime,
            embeddings: cancelRequested ? null : results,
        };

        EventBus.emit('embedding:task_complete', finalResult);
        onComplete?.(finalResult);

        taskState = TaskState.IDLE;
        currentTask = null;

        return finalResult;
    } catch (error) {
        taskState = TaskState.ERROR;
        stopTimer();

        // Cleanup EventBus subscriptions
        cancelUnsub();
        pauseUnsub();

        await releaseLock();

        const errorResult = {
            taskId: currentTask?.id,
            error: error.message,
            processed: processedCount,
            total: totalCount,
            recovered: true,
            userFacing: true,
            userMessage: `Recovery failed: ${error.message}. Try starting from the beginning.`,
            recoverable: true,
        };

        EventBus.emit('embedding:task_error', errorResult);
        onError?.(error);

        currentTask = null;
        throw error;
    }
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
     * Recover task from checkpoint
     */
    recoverTask,

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
    CONFIG,
};

console.log('[EmbeddingsTaskManager] Module loaded');
