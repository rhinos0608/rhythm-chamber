/**
 * Embeddings Onboarding Component
 * 
 * Feature discovery modal explaining local embeddings:
 * - Privacy verification UI
 * - Compatibility checking (WebGPU, WASM, IndexedDB, storage)
 * - Storage preview bar
 * - Enable/Cancel buttons
 * 
 * HNW Considerations:
 * - Hierarchy: Entry point for embedding feature activation
 * - Network: Checks all dependencies before enabling
 * - Wave: Sequential compatibility checks with visual feedback
 * 
 * @module embeddings/embeddings-onboarding
 */

import { EventBus } from '../services/event-bus.js';
import { BatteryAwareModeSelector } from '../services/battery-aware-mode-selector.js';
import { escapeHtml } from '../utils/html-escape.js';

// ==========================================
// Modal HTML Template
// ==========================================

const MODAL_HTML = `
<div class="modal-overlay" id="embedding-onboarding-modal">
    <div class="modal-content modal-embeddings">
        <div class="modal-header">
            <h2>Enable Semantic Search</h2>
            <span class="badge badge-local">100% Local</span>
        </div>
        
        <div class="privacy-card">
            <div class="privacy-icon">🔒</div>
            <h3>Privacy-First Design</h3>
            <p>All processing happens on your device. Your data never leaves your browser.</p>
            <ul class="feature-checklist">
                <li class="check-item">✓ No data sent to external servers</li>
                <li class="check-item">✓ Works offline after initial setup</li>
                <li class="check-item">✓ ~6MB one-time download (INT8 optimized)</li>
                <li class="check-item">✓ Results stored locally in IndexedDB</li>
            </ul>
        </div>
        
        <div class="requirements-section">
            <h4>Compatibility Check</h4>
            <div class="requirements-grid" id="compatibility-checks">
                <div class="requirement-item" id="check-wasm">
                    <span class="requirement-icon">⏳</span>
                    <span class="requirement-label">WASM Support</span>
                    <span class="requirement-status">Checking...</span>
                </div>
                <div class="requirement-item" id="check-webgpu">
                    <span class="requirement-icon">⏳</span>
                    <span class="requirement-label">WebGPU (Optional)</span>
                    <span class="requirement-status">Checking...</span>
                </div>
                <div class="requirement-item" id="check-indexeddb">
                    <span class="requirement-icon">⏳</span>
                    <span class="requirement-label">IndexedDB</span>
                    <span class="requirement-status">Checking...</span>
                </div>
                <div class="requirement-item" id="check-storage">
                    <span class="requirement-icon">⏳</span>
                    <span class="requirement-label">Storage Space</span>
                    <span class="requirement-status">Checking...</span>
                </div>
            </div>
        </div>
        
        <div class="storage-preview" id="storage-preview">
            <h4>Storage Estimate</h4>
            <div class="storage-bar-container">
                <div class="storage-bar" id="storage-bar" style="width: 0%"></div>
            </div>
            <div class="storage-details">
                <span id="storage-used">-- MB used</span>
                <span id="storage-available">-- MB available</span>
            </div>
        </div>
        
        <div class="modal-actions">
            <button class="btn btn-secondary" id="onboarding-cancel">Cancel</button>
            <button class="btn btn-primary" id="onboarding-enable" disabled>Enable Semantic Search</button>
        </div>
    </div>
</div>
`;

// ==========================================
// State
// ==========================================

let modal = null;
let isChecking = false;
let compatibilityResults = {};
let compatibilityPromise = null;
let currentShowPromise = null;
let isSettled = false;

// ==========================================
// Compatibility Checks
// ==========================================

/**
 * Run all compatibility checks
 * @returns {Promise<Object>} Compatibility results
 */
async function runCompatibilityChecks() {
    // Prevent reentry - return existing promise if checks are in progress
    if (isChecking && compatibilityPromise) {
        console.log('[EmbeddingsOnboarding] Compatibility checks already in progress, returning existing promise');
        return compatibilityPromise;
    }

    isChecking = true;
    compatibilityResults = {};

    // Create a shared promise that all callers will await
    compatibilityPromise = (async () => {
        try {
            // WASM Check
            updateCheckStatus('check-wasm', 'checking');
            const wasmSupported = await checkWASM();
            compatibilityResults.wasm = wasmSupported;
            updateCheckStatus('check-wasm', wasmSupported ? 'pass' : 'fail', wasmSupported ? 'Available' : 'Not supported');

            // WebGPU Check (optional enhancement) - wrapped in try-catch for safety
            updateCheckStatus('check-webgpu', 'checking');
            try {
                const webgpuResult = await BatteryAwareModeSelector.checkWebGPUSupport();
                compatibilityResults.webgpu = webgpuResult.supported;
                updateCheckStatus('check-webgpu', webgpuResult.supported ? 'pass' : 'optional',
                    webgpuResult.supported ? '100x faster' : 'Using WASM');
            } catch (webgpuError) {
                // WebGPU check failed - log error and use safe default
                console.error('[EmbeddingsOnboarding] WebGPU check failed:', webgpuError);
                compatibilityResults.webgpu = false;
                updateCheckStatus('check-webgpu', 'optional', 'Using WASM (check failed)');
            }

            // IndexedDB Check
            updateCheckStatus('check-indexeddb', 'checking');
            const indexedDBSupported = await checkIndexedDB();
            compatibilityResults.indexeddb = indexedDBSupported;
            updateCheckStatus('check-indexeddb', indexedDBSupported ? 'pass' : 'fail',
                indexedDBSupported ? 'Available' : 'Required');

            // Storage Check
            updateCheckStatus('check-storage', 'checking');
            const storageResult = await checkStorage();
            compatibilityResults.storage = storageResult;
            updateCheckStatus('check-storage', storageResult.ok ? 'pass' : 'fail',
                storageResult.ok ? 'Sufficient' : 'Low space');

            // Update storage preview
            updateStoragePreview(storageResult);

            // Enable button if minimum requirements met
            const canEnable = compatibilityResults.wasm && compatibilityResults.indexeddb && compatibilityResults.storage?.ok;
            const enableBtn = document.getElementById('onboarding-enable');
            if (enableBtn) {
                enableBtn.disabled = !canEnable;
            }

            return compatibilityResults;
        } finally {
            // Reset state after completion
            isChecking = false;
            compatibilityPromise = null;
        }
    })();

    return compatibilityPromise;
}

/**
 * Check WASM support
 */
async function checkWASM() {
    try {
        if (typeof WebAssembly === 'object' &&
            typeof WebAssembly.instantiate === 'function') {
            const module = new WebAssembly.Module(
                Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)
            );
            return new WebAssembly.Instance(module) instanceof WebAssembly.Instance;
        }
    } catch (e) {
        return false;
    }
    return false;
}

/**
 * Check IndexedDB support
 */
async function checkIndexedDB() {
    return new Promise((resolve) => {
        try {
            const request = indexedDB.open('__test__');
            request.onerror = () => resolve(false);
            request.onsuccess = () => {
                request.result.close();

                // Wait for delete operation completion
                const deleteRequest = indexedDB.deleteDatabase('__test__');
                deleteRequest.onsuccess = () => resolve(true);
                deleteRequest.onerror = () => resolve(false);
                deleteRequest.onblocked = () => resolve(false);
            };
        } catch (e) {
            resolve(false);
        }
    });
}

/**
 * Check available storage
 */
async function checkStorage() {
    try {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            const usedMB = Math.round((estimate.usage || 0) / (1024 * 1024));
            const totalMB = Math.round((estimate.quota || 0) / (1024 * 1024));
            const availableMB = totalMB - usedMB;
            const percentUsed = totalMB > 0 ? (usedMB / totalMB) * 100 : 0;

            return {
                ok: availableMB >= 50, // Need at least 50MB free
                usedMB,
                totalMB,
                availableMB,
                percentUsed
            };
        }
    } catch (e) {
        console.warn('[EmbeddingsOnboarding] Storage check failed:', e);
    }

    // Fallback: assume OK
    return { ok: true, usedMB: 0, totalMB: 1000, availableMB: 1000, percentUsed: 0 };
}

// ==========================================
// UI Helpers
// ==========================================

/**
 * Update check status in UI
 */
function updateCheckStatus(checkId, status, message = '') {
    const item = document.getElementById(checkId);
    if (!item) return;

    const icon = item.querySelector('.requirement-icon');
    const statusEl = item.querySelector('.requirement-status');

    // Update icon
    switch (status) {
        case 'checking':
            icon.textContent = '⏳';
            item.className = 'requirement-item checking';
            break;
        case 'pass':
            icon.textContent = '✓';
            item.className = 'requirement-item pass';
            break;
        case 'fail':
            icon.textContent = '✗';
            item.className = 'requirement-item fail';
            break;
        case 'optional':
            icon.textContent = '◐';
            item.className = 'requirement-item optional';
            break;
    }

    // Update status text
    if (message && statusEl) {
        statusEl.textContent = message;
    }
}

/**
 * Update storage preview bar
 */
function updateStoragePreview(storageResult) {
    const bar = document.getElementById('storage-bar');
    const usedEl = document.getElementById('storage-used');
    const availableEl = document.getElementById('storage-available');

    if (bar) {
        bar.style.width = `${Math.min(storageResult.percentUsed, 100)}%`;
        bar.className = `storage-bar ${storageResult.percentUsed > 90 ? 'critical' : storageResult.percentUsed > 70 ? 'warning' : ''}`;
    }

    if (usedEl) {
        usedEl.textContent = `${storageResult.usedMB} MB used`;
    }

    if (availableEl) {
        availableEl.textContent = `${storageResult.availableMB} MB available`;
    }
}

// ==========================================
// Modal Management
// ==========================================

/**
 * Show the onboarding modal
 * @returns {Promise<boolean>} True if user enabled, false if cancelled
 */
function show() {
    // Guard against concurrent modal displays
    if (currentShowPromise) {
        console.log('[EmbeddingsOnboarding] Modal already displayed, returning existing promise');
        return currentShowPromise;
    }

    currentShowPromise = new Promise((resolve) => {
        // Reset settled flag
        isSettled = false;

        // Create modal
        const container = document.createElement('div');
        // SAFE: MODAL_HTML is a static template constant defined in this module
        container.innerHTML = MODAL_HTML;
        modal = container.firstElementChild;
        document.body.appendChild(modal);

        // Run compatibility checks
        runCompatibilityChecks();

        // Single cleanup function to prevent multiple resolves
        const cleanup = (result) => {
            if (isSettled) {
                console.warn('[EmbeddingsOnboarding] Promise already settled, ignoring duplicate resolve');
                return;
            }
            isSettled = true;

            // Remove all event listeners
            if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
            if (enableBtn) enableBtn.removeEventListener('click', onEnable);
            if (modal) modal.removeEventListener('click', onOverlayClick);
            document.removeEventListener('keydown', handleEscape);

            // Remove modal and reset state
            hide();
            currentShowPromise = null;

            resolve(result);
        };

        // Bind event handlers
        const cancelBtn = document.getElementById('onboarding-cancel');
        const enableBtn = document.getElementById('onboarding-enable');

        const onCancel = () => cleanup(false);
        const onEnable = () => {
            EventBus.emit('embedding:onboarding_complete', { enabled: true });
            cleanup(true);
        };
        const onOverlayClick = (e) => {
            if (e.target === modal) {
                cleanup(false);
            }
        };
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                cleanup(false);
            }
        };

        cancelBtn?.addEventListener('click', onCancel);
        enableBtn?.addEventListener('click', onEnable);
        modal.addEventListener('click', onOverlayClick);
        document.addEventListener('keydown', handleEscape);
    });

    return currentShowPromise;
}

/**
 * Hide the onboarding modal
 */
function hide() {
    if (modal) {
        modal.remove();
        modal = null;
    }
}

// ==========================================
// Public API
// ==========================================

export const EmbeddingsOnboarding = {
    /**
     * Show the onboarding modal
     * @returns {Promise<boolean>} True if user enabled semantic search
     */
    show,

    /**
     * Hide the onboarding modal
     */
    hide,

    /**
     * Get compatibility results (after checks complete)
     */
    getCompatibilityResults() {
        return { ...compatibilityResults };
    },

    /**
     * Re-run compatibility checks
     */
    runCompatibilityChecks
};

console.log('[EmbeddingsOnboarding] Module loaded');
