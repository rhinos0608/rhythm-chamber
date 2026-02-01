/**
 * File Upload Controller
 *
 * Handles file upload processing with Web Worker orchestration.
 * Extracted from app.js to separate file processing concerns.
 *
 * @module controllers/file-upload-controller
 */

'use strict';

// Import ErrorBoundary for error handling
import { ErrorBoundary } from '../services/error-boundary.js';

// ==========================================
// Dependencies (injected via init)
// ==========================================

let _Storage = null;
let _AppState = null;
let _OperationLock = null;
let _Patterns = null;
let _Personality = null;
let _ViewController = null;
let _SessionManager = null;
let _showToast = null;
let _WaveTelemetry = null;

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
    _SessionManager = dependencies.SessionManager;
    _showToast = dependencies.showToast;
    _WaveTelemetry = dependencies.WaveTelemetry;

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

    // EDGE CASE FIX: Add file size validation to prevent browser crash
    // Spotify history files can be hundreds of MB or even GB
    // Attempting to parse these in the browser can cause the tab to crash or freeze
    const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB limit
    if (file.size > MAX_FILE_SIZE) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(1);
        _showToast(`File too large (${sizeMB}MB). Maximum is 500MB.`);
        return;
    }

    // Determine expected file type from extension
    const fileType = file.name.toLowerCase().endsWith('.zip') ? 'zip' : 'json';

    // SECURITY: Validate MIME type and file signature, not just extension
    const validMimeTypes = [
        'application/zip',
        'application/json',
        'application/x-zip-compressed',
        'text/plain',
    ];

    // Check MIME type
    if (!validMimeTypes.includes(file.type)) {
        _showToast(
            `Invalid file type: ${file.type || 'unknown'}. Please upload a .zip or .json file.`
        );
        return;
    }

    // For ZIP files, verify magic bytes (file signature)
    // ZIP files start with PK (0x504B) - checking first 4 bytes
    if (fileType === 'zip') {
        const slice = file.slice(0, 4);
        const arrayBuffer = await slice.arrayBuffer();
        const signature = new Uint8Array(arrayBuffer);

        // ZIP magic bytes: 0x50 0x4B (PK) - either 0x504B0304 or 0x504B0506 or 0x504B0708
        const validZipSignatures = [
            [0x50, 0x4b, 0x03, 0x04], // Local file header
            [0x50, 0x4b, 0x05, 0x06], // End of central directory
            [0x50, 0x4b, 0x07, 0x08], // Data descriptor
        ];

        const isValidZip = validZipSignatures.some(sig =>
            sig.every((byte, i) => signature[i] === byte)
        );

        if (!isValidZip) {
            _showToast('Invalid ZIP file. The file signature does not match a ZIP archive.');
            return;
        }
    }

    // Validate file type and content using InputValidation utility
    // Note: We need to dynamically import since InputValidation might not be loaded
    let InputValidation;
    try {
        const module = await import('../utils/input-validation.js');
        InputValidation = module.InputValidation || module.default;
    } catch (e) {
        console.warn('[FileUploadController] InputValidation not available, using basic checks');
    }

    if (InputValidation) {
        const validation = await InputValidation.validateFileUpload(file, fileType);
        if (!validation.valid) {
            _showToast(validation.error || 'Invalid file');
            return;
        }
    } else {
        // Fallback to basic extension check (only if InputValidation unavailable)
        if (!file.name.endsWith('.zip') && !file.name.endsWith('.json')) {
            _showToast('Please upload a .zip or .json file');
            return;
        }
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
                console.log(
                    `[FileUploadController] Recovery: ${lockError.getRecoverySuggestion()}`
                );
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
        activeWorker.onmessage = async e => {
            try {
                await handleWorkerMessage(e, resolve, reject);
            } catch (error) {
                reject(error);
            }
        };

        // Set up error handler
        activeWorker.onerror = err => {
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
    const { type, message, streams, chunks, error, partialStreams, fileIndex, totalFiles, usage } =
        e.data;

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
        _ViewController.updateProgress(
            `Low on memory (${usagePercent}%) - pausing to avoid crash...`
        );
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
    await ErrorBoundary.wrap(
        async () => {
            if (_Storage) {
                await _Storage.appendStreams(partialStreams);
            }
            if (_ViewController) {
                _ViewController.updateProgress(
                    `Parsing file ${fileIndex}/${totalFiles}... (${streamCount.toLocaleString()} streams)`
                );
            }
        },
        {
            context: 'fileUploadPartialSave',
            fallback: null,
            rethrow: false,
            telemetry: _WaveTelemetry,
            onError: err => {
                console.warn('[FileUploadController] Failed to save partial streams:', err);
            },
        }
    );
}

/**
 * Handle final processing completion
 */
async function handleProcessingComplete(streams, chunks) {
    // Wrap entire completion handling with error boundary
    await ErrorBoundary.wrap(
        async () => {
            // Update app state
            if (_AppState) {
                _AppState.update('data', {
                    streams: streams,
                    chunks: chunks,
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
        },
        {
            context: 'fileUploadProcessingComplete',
            fallback: null,
            rethrow: true,
            telemetry: _WaveTelemetry,
            onError: error => {
                console.error('[FileUploadController] Processing completion failed:', error);
                _showToast('Failed to complete file processing. Please try again.');
            },
        }
    );
}

/**
 * Process uploaded file data
 * @param {Object} fileData - Parsed file data with chunks and personality
 * @returns {Promise<void>}
 */
async function processFile(fileData) {
    // Attempt to recover emergency backup if one exists
    // This handles the case where a backup was created before file upload
    if (_SessionManager && _SessionManager.recoverEmergencyBackup) {
        try {
            await _SessionManager.recoverEmergencyBackup();
        } catch (e) {
            console.warn('[FileUploadController] Emergency backup recovery failed:', e);
        }
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
        // EDGE CASE FIX: Wrap terminate in try-catch to handle browser edge cases
        // Worker.terminate() can throw in certain browser states (e.g., tab closing, worker already terminated)
        try {
            activeWorker.onmessage = null;
            activeWorker.onerror = null;
            activeWorker.terminate();
        } catch (e) {
            console.warn('[FileUploadController] Worker terminate failed:', e);
            // Continue with cleanup even if terminate throws
        }
        // Always clear reference to prevent stale worker references
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
        workerActive: activeWorker !== null,
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
    cleanupWorker,
};

console.log('[FileUploadController] Controller loaded - race condition fixed');
