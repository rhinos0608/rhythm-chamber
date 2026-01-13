/**
 * File Upload Controller
 * 
 * Handles file upload processing with Web Worker orchestration.
 * Extracted from app.js to separate file processing concerns.
 * 
 * @module controllers/file-upload-controller
 */

// ==========================================
// Dependencies (injected via init)
// ==========================================

let Storage = null;
let AppState = null;
let OperationLock = null;
let Patterns = null;
let Personality = null;
let ViewController = null;
let showToast = null;

// ==========================================
// State Management
// ==========================================

let activeWorker = null;
let workerAbortController = null;
let currentFileLockId = null;

// ==========================================
// Core Functions
// ==========================================

/**
 * Initialize FileUploadController with dependencies
 * @param {Object} dependencies - Required dependencies
 */
function init(dependencies) {
    Storage = dependencies.Storage;
    AppState = dependencies.AppState;
    OperationLock = dependencies.OperationLock;
    Patterns = dependencies.Patterns;
    Personality = dependencies.Personality;
    ViewController = dependencies.ViewController;
    showToast = dependencies.showToast;

    console.log('[FileUploadController] Initialized with dependencies');
}

/**
 * Handle file upload - main entry point
 * @param {File} file - File object from input or drop
 * @returns {Promise<void>}
 */
async function handleFileUpload(file) {
    if (!file) {
        showToast('No file selected');
        return;
    }

    // Validate file type
    if (!file.name.endsWith('.zip') && !file.name.endsWith('.json')) {
        showToast('Please upload a .zip or .json file');
        return;
    }

    // Check for conflicting operations
    if (OperationLock.isLocked('file_processing')) {
        showToast('Upload already in progress, please wait');
        return;
    }

    // Acquire operation lock
    try {
        currentFileLockId = await OperationLock.acquire('file_processing');
    } catch (lockError) {
        showToast(`Cannot upload: ${lockError.message}`);
        return;
    }

    try {
        // Show processing view
        ViewController.showProcessing('Preparing to parse file...');

        // Update app state
        if (AppState) {
            AppState.update('lite', { isLiteMode: false });
        }

        // Create abort controller for this parsing session
        if (workerAbortController) {
            workerAbortController.abort();
        }
        workerAbortController = new AbortController();

        // Terminate any existing worker (with proper cleanup)
        cleanupWorker();

        // Clear any previous partial saves
        if (Storage) {
            await Storage.clearStreams();
        }

        // Process file with Web Worker
        await processWithWorker(file);

    } catch (error) {
        console.error('[FileUploadController] Upload failed:', error);
        if (ViewController && showToast) {
            ViewController.showUpload();
            showToast(`Upload failed: ${error.message}`);
        }
    } finally {
        // Release operation lock
        if (currentFileLockId && OperationLock) {
            OperationLock.release('file_processing', currentFileLockId);
            currentFileLockId = null;
        }

        // Cleanup abort controller
        if (workerAbortController) {
            workerAbortController.abort();
            workerAbortController = null;
        }
    }
}

/**
 * Process file using Web Worker
 * @param {File} file - File to process
 * @returns {Promise<void>}
 */
async function processWithWorker(file) {
    return new Promise((resolve, reject) => {
        // Create worker
        activeWorker = new Worker('js/parser-worker.js');

        // Set up message handler
        activeWorker.onmessage = async (e) => {
            try {
                await handleWorkerMessage(e, resolve, reject);
            } catch (error) {
                reject(error);
            }
        };

        // Set up error handler
        activeWorker.onerror = (err) => {
            console.error('[FileUploadController] Worker error:', err);
            reject(new Error(err.message || 'Worker error'));
        };

        // Listen for abort signal
        if (workerAbortController) {
            workerAbortController.signal.addEventListener('abort', () => {
                handleWorkerAbort();
                reject(new Error('Processing aborted'));
            });
        }

        // Start parsing
        activeWorker.postMessage({ type: 'parse', file });
    });
}

/**
 * Handle worker messages
 */
async function handleWorkerMessage(e, resolve, reject) {
    const { type, message, streams, chunks, error, partialStreams, fileIndex, totalFiles, usage } = e.data;

    switch (type) {
        case 'progress':
            if (ViewController) {
                ViewController.updateProgress(message);
            }
            break;

        case 'error':
            console.error('[FileUploadController] Worker error:', error);
            cleanupWorker();
            if (ViewController) {
                ViewController.showUpload();
            }
            reject(new Error(error));
            break;

        case 'memory_warning':
            handleMemoryWarning(usage);
            break;

        case 'memory_resumed':
            handleMemoryResumed();
            break;

        case 'partial':
            await handlePartialSave(partialStreams, fileIndex, totalFiles, e.data.streamCount);
            // Send ACK for backpressure flow control
            if (e.data.ackId && activeWorker) {
                activeWorker.postMessage({ type: 'ack', ackId: e.data.ackId });
            }
            break;

        case 'complete':
            await handleProcessingComplete(streams, chunks);
            cleanupWorker();
            resolve();
            break;
    }
}

/**
 * Handle memory warning from worker
 */
function handleMemoryWarning(usage) {
    const usagePercent = Math.round(usage * 100);
    if (ViewController) {
        ViewController.updateProgress(`Low on memory (${usagePercent}%) - pausing to avoid crash...`);
    }
    console.warn(`[FileUploadController] Memory warning: ${usagePercent}% usage`);
}

/**
 * Handle memory resumed
 */
function handleMemoryResumed() {
    if (ViewController) {
        ViewController.updateProgress('Resuming processing...');
    }
    console.log('[FileUploadController] Memory usage normalized, resuming');
}

/**
 * Handle partial save of streams
 */
async function handlePartialSave(partialStreams, fileIndex, totalFiles, streamCount) {
    try {
        if (Storage) {
            await Storage.appendStreams(partialStreams);
        }
        if (ViewController) {
            ViewController.updateProgress(`Parsing file ${fileIndex}/${totalFiles}... (${streamCount.toLocaleString()} streams)`);
        }
    } catch (err) {
        console.warn('[FileUploadController] Failed to save partial streams:', err);
    }
}

/**
 * Handle final processing completion
 */
async function handleProcessingComplete(streams, chunks) {
    // Update app state
    if (AppState) {
        AppState.update('data', {
            streams: streams,
            chunks: chunks
        });
    }

    // Show progress
    if (ViewController) {
        ViewController.updateProgress('Detecting behavioral patterns...');
    }
    await new Promise(r => setTimeout(r, 10)); // Let UI update

    // Detect patterns
    const patterns = Patterns.detectAllPatterns(streams, chunks);
    if (AppState) {
        AppState.setPatterns(patterns);
    }

    // Classify personality
    if (ViewController) {
        ViewController.updateProgress('Classifying personality...');
    }
    await new Promise(r => setTimeout(r, 10));

    const personality = Personality.classifyPersonality(patterns);
    personality.summary = patterns.summary;
    if (AppState) {
        AppState.setPersonality(personality);
    }

    // Save final complete data to IndexedDB
    if (ViewController) {
        ViewController.updateProgress('Saving...');
    }

    if (Storage) {
        await Storage.saveStreams(streams);
        await Storage.saveChunks(chunks);
        await Storage.savePersonality(personality);
    }

    // Show reveal
    if (ViewController) {
        ViewController.showReveal();
    }
}

/**
 * Handle worker abort signal
 */
function handleWorkerAbort() {
    if (activeWorker) {
        activeWorker.onmessage = null;
        activeWorker.onerror = null;
        activeWorker.terminate();
        activeWorker = null;
        console.log('[FileUploadController] Worker aborted via signal');
    }

    // Release operation lock on abort
    if (currentFileLockId && OperationLock) {
        OperationLock.release('file_processing', currentFileLockId);
        currentFileLockId = null;
    }
}

/**
 * Cleanup worker with proper memory management
 */
function cleanupWorker() {
    if (activeWorker) {
        activeWorker.onmessage = null;
        activeWorker.onerror = null;
        activeWorker.terminate();
        activeWorker = null;
        // Force garbage collection hint
        if (typeof window !== 'undefined' && window.gc) {
            window.gc();
        }
    }
}

/**
 * Get current processing state
 * @returns {Object} Current state
 */
function getProcessingState() {
    return {
        isProcessing: !!activeWorker,
        hasLock: !!currentFileLockId,
        workerActive: activeWorker !== null
    };
}

/**
 * Cancel current processing
 * @returns {boolean} Success status
 */
function cancelProcessing() {
    if (!activeWorker) {
        return false;
    }

    if (workerAbortController) {
        workerAbortController.abort();
    }

    cleanupWorker();

    // Release lock
    if (currentFileLockId && OperationLock) {
        OperationLock.release('file_processing', currentFileLockId);
        currentFileLockId = null;
    }

    // Show upload view
    if (ViewController) {
        ViewController.showUpload();
    }

    return true;
}

// ==========================================
// Public API
// ==========================================

const FileUploadController = {
    init,
    handleFileUpload,
    cancelProcessing,
    getProcessingState,
    cleanupWorker
};

// Make available globally
if (typeof window !== 'undefined') {
    window.FileUploadController = FileUploadController;
}

console.log('[FileUploadController] Controller loaded');