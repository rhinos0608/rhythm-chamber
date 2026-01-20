/**
 * File Upload Controller
 * 
 * Handles file upload processing with Web Worker orchestration.
 * Extracted from app.js to separate file processing concerns.
 * 
 * @module controllers/file-upload-controller
 */

'use strict';

// ==========================================
// Dependencies (injected via init)
// ==========================================

let _Storage = null;
let _AppState = null;
let _OperationLock = null;
let _Patterns = null;
let _Personality = null;
let _ViewController = null;
let _showToast = null;

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
    _Storage = dependencies.Storage;
    _AppState = dependencies.AppState;
    _OperationLock = dependencies.OperationLock;
    _Patterns = dependencies.Patterns;
    _Personality = dependencies.Personality;
    _ViewController = dependencies.ViewController;
    _showToast = dependencies.showToast;

    console.log('[FileUploadController] Initialized with dependencies');
}

/**
 * Handle file upload - main entry point
 * @param {File} file - File object from input or drop
 * @returns {Promise<void>}
 */
async function handleFileUpload(file) {
    if (!file) {
        _showToast('No file selected');
        return;
    }

    // Validate file type
    if (!file.name.endsWith('.zip') && !file.name.endsWith('.json')) {
        _showToast('Please upload a .zip or .json file');
        return;
    }

    // ✅ FIXED: Remove race condition - directly attempt to acquire lock
    // The acquire() method is atomic and will throw if blocked
    try {
        currentFileLockId = await _OperationLock.acquire('file_processing');
    } catch (lockError) {
        // Use the new error class for better diagnostics
        if (lockError.name === 'LockAcquisitionError') {
            _showToast(`Cannot upload: ${lockError.message}`);

            // Optional: Show recovery suggestion
            if (lockError.getRecoverySuggestion) {
                console.log(`[FileUploadController] Recovery: ${lockError.getRecoverySuggestion()}`);
            }
        } else {
            // Unexpected error type
            _showToast(`Cannot upload: ${lockError.message}`);
        }
        return;
    }

    try {
        // Show processing view
        _ViewController.showProcessing('Preparing to parse file...');

        // Update app state
        if (_AppState) {
            _AppState.update('lite', { isLiteMode: false });
        }

        // Create abort controller for this parsing session
        if (workerAbortController) {
            workerAbortController.abort();
        }
        workerAbortController = new AbortController();

        // Terminate any existing worker (with proper cleanup)
        cleanupWorker();

        // Clear any previous partial saves
        if (_Storage) {
            await _Storage.clearStreams();
        }

        // Process file with Web Worker
        await processWithWorker(file);

    } catch (error) {
        console.error('[FileUploadController] Upload failed:', error);
        if (_ViewController && _showToast) {
            _ViewController.showUpload();
            _showToast(`Upload failed: ${error.message}`);
        }
    } finally {
        // Release operation lock
        if (currentFileLockId && _OperationLock) {
            try {
                _OperationLock.release('file_processing', currentFileLockId);
            } catch (releaseError) {
                console.error('[FileUploadController] Lock release error:', releaseError);
            }
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
            if (_ViewController) {
                _ViewController.updateProgress(message);
            }
            break;

        case 'error':
            console.error('[FileUploadController] Worker error:', error);
            cleanupWorker();
            if (_ViewController) {
                _ViewController.updateProgress(`Error: ${error}`);
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
    if (_ViewController) {
        _ViewController.updateProgress(`Low on memory (${usagePercent}%) - pausing to avoid crash...`);
    }
    console.warn(`[FileUploadController] Memory warning: ${usagePercent}% usage`);
}

/**
 * Handle memory resumed
 */
function handleMemoryResumed() {
    if (_ViewController) {
        _ViewController.updateProgress('Resuming processing...');
    }
    console.log('[FileUploadController] Memory usage normalized, resuming');
}

/**
 * Handle partial save of streams
 */
async function handlePartialSave(partialStreams, fileIndex, totalFiles, streamCount) {
    try {
        if (_Storage) {
            await _Storage.appendStreams(partialStreams);
        }
        if (_ViewController) {
            _ViewController.updateProgress(`Parsing file ${fileIndex}/${totalFiles}... (${streamCount.toLocaleString()} streams)`);
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
    if (_AppState) {
        _AppState.update('data', {
            streams: streams,
            chunks: chunks
        });
    }

    // Show progress
    if (_ViewController) {
        _ViewController.updateProgress('Detecting behavioral patterns...');
    }
    await new Promise(r => setTimeout(r, 10)); // Let UI update

    // Detect patterns
    const patterns = _Patterns.detectAllPatterns(streams, chunks);
    if (_AppState) {
        _AppState.setPatterns(patterns);
    }

    // Classify personality
    if (_ViewController) {
        _ViewController.updateProgress('Classifying personality...');
    }
    await new Promise(r => setTimeout(r, 10));

    const personality = _Personality.classifyPersonality(patterns);
    personality.summary = patterns.summary;
    if (_AppState) {
        _AppState.setPersonality(personality);
    }

    // Save final complete data to IndexedDB
    if (_ViewController) {
        _ViewController.updateProgress('Saving...');
    }

    if (_Storage) {
        await _Storage.saveStreams(streams);
        await _Storage.saveChunks(chunks);
        await _Storage.savePersonality(personality);
    }

    // Show reveal
    if (_ViewController) {
        _ViewController.showReveal();
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
    if (currentFileLockId && _OperationLock) {
        try {
            _OperationLock.release('file_processing', currentFileLockId);
        } catch (releaseError) {
            console.error('[FileUploadController] Lock release error on abort:', releaseError);
        }
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
    if (currentFileLockId && _OperationLock) {
        try {
            _OperationLock.release('file_processing', currentFileLockId);
        } catch (releaseError) {
            console.error('[FileUploadController] Lock release error on cancel:', releaseError);
        }
        currentFileLockId = null;
    }

    // Show upload view
    if (_ViewController) {
        _ViewController.showUpload();
    }

    return true;
}

// ==========================================
// Public API
// ==========================================

// ES Module export
export const FileUploadController = {
    init,
    handleFileUpload,
    cancelProcessing,
    getProcessingState,
    cleanupWorker
};


console.log('[FileUploadController] Controller loaded - race condition fixed');