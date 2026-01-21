/**
 * Reset Controller
 *
 * Handles data reset operations with proper worker cleanup.
 * Extracted from app.js to separate reset concerns from main app flow.
 *
 * @module controllers/reset-controller
 */

'use strict';

import { setupModalFocusTrap } from '../utils/focus-trap.js';

// ==========================================
// Dependencies (injected via init)
// ==========================================

let _Storage = null;
let _AppState = null;
let _Spotify = null;
let _Chat = null;
let _OperationLock = null;
let _ViewController = null;
let _showToast = null;
let _FileUploadController = null;

// ==========================================
// State Management
// ==========================================

let pendingDeleteSessionId = null;

// Focus trap cleanup functions for modals
let resetModalFocusTrapCleanup = null;
let privacyModalFocusTrapCleanup = null;

// ==========================================
// Core Functions
// ==========================================

/**
 * Initialize ResetController with dependencies
 * @param {Object} dependencies - Required dependencies
 */
function init(dependencies) {
    _Storage = dependencies.Storage;
    _AppState = dependencies.AppState;
    _Spotify = dependencies.Spotify;
    _Chat = dependencies.Chat;
    _OperationLock = dependencies.OperationLock;
    _ViewController = dependencies.ViewController;
    _showToast = dependencies.showToast;
    _FileUploadController = dependencies.FileUploadController;

    console.log('[ResetController] Initialized with dependencies');
}

/**
 * Handle reset button click
 * Shows confirmation modal or executes reset if no conflicts
 */
function handleReset() {
    // HNW Hierarchy: Check if conflicting operation is in progress
    if (_OperationLock) {
        const fileProcessing = _OperationLock.isLocked('file_processing');
        const embedding = _OperationLock.isLocked('embedding_generation');

        if (fileProcessing || embedding) {
            const blockedBy = fileProcessing ? 'file upload' : 'embedding generation';
            if (_showToast) _showToast(`Cannot reset while ${blockedBy} is in progress`);
            return;
        }
    }

    showResetConfirmModal();
}

/**
 * Show custom confirmation modal
 */
function showResetConfirmModal() {
    const modal = document.getElementById('reset-confirm-modal');
    if (modal) {
        modal.style.display = 'flex';

        // Set up focus trap for accessibility (WCAG 2.1.2)
        // Clean up any existing trap first
        if (resetModalFocusTrapCleanup) {
            resetModalFocusTrapCleanup();
            resetModalFocusTrapCleanup = null;
        }
        resetModalFocusTrapCleanup = setupModalFocusTrap('reset-confirm-modal', () => hideResetConfirmModal());
    }
}

/**
 * Hide reset confirmation modal
 */
function hideResetConfirmModal() {
    // Clean up focus trap first (restores focus to previous element)
    if (resetModalFocusTrapCleanup) {
        resetModalFocusTrapCleanup();
        resetModalFocusTrapCleanup = null;
    }

    const modal = document.getElementById('reset-confirm-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Execute the reset operation
 * Orchestrates safe cleanup of all data and workers
 * @returns {Promise<void>}
 */
async function executeReset() {
    hideResetConfirmModal();

    if (!_ViewController || !_Storage || !_AppState) {
        console.error('[ResetController] Required dependencies not available');
        return;
    }

    try {
        // Step 1: Stop background operations
        if (Spotify && _Spotify.stopBackgroundRefresh) {
            _Spotify.stopBackgroundRefresh();
        }

        // Step 2: Cancel all pending operations with timeout
        if (_ViewController) {
            _ViewController.updateProgress('Cancelling operations...');
        }

        const abortController = new AbortController();
        await waitForWorkersAbort(abortController, 30_000); // 30s max

        // Step 3: Clear ALL data across ALL backends (unified)
        if (_ViewController) {
            _ViewController.updateProgress('Clearing data...');
        }

        const result = await _Storage.clearAllData();

        if (!result.success) {
            if (result.blockedBy) {
                if (_showToast) _showToast(`Cannot reset: ${result.blockedBy}`);
                if (_ViewController) _ViewController.showUpload();
                return;
            }
        }

        // Log results for debugging
        console.log('[ResetController] clearAllData result:', result);

        // Show warning if Qdrant clear failed
        if (result.qdrant?.error) {
            console.warn('[ResetController] Qdrant embeddings may not have been cleared:', result.qdrant.error);
        }

        // Step 4: Clear Spotify tokens (handled separately for security)
        if (_Spotify) {
            _Spotify.clearTokens();
        }

        // Step 5: Reset app state (via centralized AppState)
        if (_AppState) {
            _AppState.reset();
        }

        // Step 6: Clear chat history
        if (_Chat) {
            _Chat.clearHistory();
        }

        console.log('[ResetController] Reset complete');

        if (_ViewController) {
            _ViewController.showUpload();
        }

    } catch (error) {
        console.error('[ResetController] Reset failed:', error);
        if (_ViewController) {
            _ViewController.updateProgress(`Reset error: ${error.message}`);
            _ViewController.showUpload();
        }
    }
}

/**
 * Wait for all workers to abort with timeout
 * This is the core of the safe reset flow
 * 
 * HNW Fix: Keep the "force terminate" timeout logic from app.js
 * It's a necessary safety valve for client-side processing that can freeze
 * 
 * @param {AbortController} abortController - Abort controller for timeout
 * @param {number} timeoutMs - Maximum wait time in milliseconds
 * @returns {Promise<boolean>} Success status
 */
async function waitForWorkersAbort(abortController, timeoutMs) {
    const start = Date.now();

    // Get active worker from FileUploadController if available
    const activeWorker = _FileUploadController?.getProcessingState?.().workerActive
        ? _FileUploadController
        : null;

    // Send abort signal to worker
    if (activeWorker) {
        try {
            // Try to cancel via FileUploadController
            if (activeWorker.cancelProcessing) {
                activeWorker.cancelProcessing();
            }
        } catch (e) {
            // Worker may already be terminated
        }
    }

    // Wait for worker to acknowledge or timeout
    while (Date.now() - start < timeoutMs) {
        const processingState = _FileUploadController?.getProcessingState?.();

        if (!processingState || !processingState.isProcessing) {
            // Worker already terminated
            return true;
        }

        // Check if worker is still responding
        try {
            // If worker is still active after 100ms, it's not responding to abort
            await new Promise(resolve => setTimeout(resolve, 100));

            // If still active, force terminate
            const stillProcessing = _FileUploadController?.getProcessingState?.();
            if (stillProcessing && stillProcessing.isProcessing) {
                console.log('[ResetController] Worker not responding to abort, forcing termination');

                // Force cleanup
                if (_FileUploadController?.cleanupWorker) {
                    _FileUploadController.cleanupWorker();
                }

                return true;
            }
        } catch (e) {
            return true;
        }
    }

    // Timeout reached
    console.warn('[ResetController] Worker abort timeout reached');

    // Force cleanup on timeout
    if (_FileUploadController?.cleanupWorker) {
        _FileUploadController.cleanupWorker();
    }

    return false;
}

/**
 * Clear sensitive data only (keep personality and chat)
 * @returns {Promise<void>}
 */
async function clearSensitiveData() {
    if (!confirm('Clear all raw streams? This keeps your personality analysis and chat history.')) {
        return;
    }

    if (!_Storage || !_ViewController) return;

    await _Storage.clearSensitiveData();
    if (_showToast) _showToast('Raw data cleared. Your personality analysis and chat history are preserved.');

    if (_ViewController) {
        _ViewController.showPrivacyDashboard(); // Refresh the dashboard
    }
}

/**
 * Show privacy dashboard modal
 */
async function showPrivacyDashboard() {
    const modal = document.getElementById('privacy-dashboard-modal');
    if (!modal || !_Storage) return;

    // Get data summary
    const summary = await _Storage.getDataSummary();

    // Update UI
    const rawStreamsCount = document.getElementById('raw-streams-count');
    const patternsSummary = document.getElementById('patterns-summary');
    const spotifyTokenStatus = document.getElementById('spotify-token-status');

    if (rawStreamsCount) {
        rawStreamsCount.textContent = summary.hasRawStreams
            ? `${summary.streamCount.toLocaleString()} streams (${summary.estimatedSizeMB}MB)`
            : 'None';
    }

    if (patternsSummary) {
        patternsSummary.textContent = summary.chunkCount > 0
            ? `${summary.chunkCount} chunks, ${summary.chatSessionCount} chat sessions`
            : 'No patterns yet';
    }

    // Check Spotify tokens
    if (spotifyTokenStatus) {
        const hasSpotifyToken = await _Storage.getToken('spotify_access_token');
        spotifyTokenStatus.textContent = hasSpotifyToken ? 'Present (encrypted)' : 'Not stored';
    }

    // Show modal
    modal.style.display = 'flex';

    // Set up focus trap for accessibility (WCAG 2.1.2)
    // Clean up any existing trap first
    if (privacyModalFocusTrapCleanup) {
        privacyModalFocusTrapCleanup();
        privacyModalFocusTrapCleanup = null;
    }
    privacyModalFocusTrapCleanup = setupModalFocusTrap('privacy-dashboard-modal', () => {
        // Hide modal on Escape
        modal.style.display = 'none';
        if (privacyModalFocusTrapCleanup) {
            privacyModalFocusTrapCleanup();
            privacyModalFocusTrapCleanup = null;
        }
    });
}

/**
 * Get reset confirmation state
 * @returns {string|null} Pending session ID or null
 */
function getPendingDeleteSessionId() {
    return pendingDeleteSessionId;
}

/**
 * Set pending delete session ID
 * @param {string|null} sessionId - Session ID to delete
 */
function setPendingDeleteSessionId(sessionId) {
    pendingDeleteSessionId = sessionId;
}

// ==========================================
// Public API
// ==========================================

// ES Module export
export const ResetController = {
    init,
    handleReset,
    showResetConfirmModal,
    hideResetConfirmModal,
    executeReset,
    clearSensitiveData,
    showPrivacyDashboard,
    getPendingDeleteSessionId,
    setPendingDeleteSessionId,
    waitForWorkersAbort
};


console.log('[ResetController] Controller loaded');