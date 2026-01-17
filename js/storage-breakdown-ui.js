/**
 * Storage Breakdown UI Component
 *
 * Displays storage usage breakdown by category with visual indicators
 * and cleanup actions. Integrates with StorageDegradationManager.
 *
 * HNW Network: Provides visibility into storage distribution
 * for informed cleanup decisions.
 *
 * @module StorageBreakdownUI
 */

// EventBus import for toast notifications
import { EventBus } from './services/event-bus.js';

// ==========================================
// Storage Breakdown Panel
// ==========================================

/**
 * Create storage breakdown panel HTML
 * @param {Object} breakdown - Storage breakdown from StorageDegradationManager
 * @param {Object} metrics - Current storage metrics
 * @returns {string} HTML string
 */
function createStorageBreakdownHTML(breakdown, metrics) {
    const tierColors = {
        NORMAL: 'var(--color-success, #4ade80)',
        WARNING: 'var(--color-warning, #facc15)',
        CRITICAL: 'var(--color-error, #f87171)',
        EXCEEDED: 'var(--color-error, #ef4444)',
        EMERGENCY: 'var(--color-error, #dc2626)'
    };

    const tierLabels = {
        NORMAL: '✓ Normal',
        WARNING: '⚠️ Warning',
        CRITICAL: '🔴 Critical',
        EXCEEDED: '❌ Exceeded',
        EMERGENCY: '🚨 Emergency'
    };

    const tier = metrics?.tier || 'NORMAL';
    const usagePercent = metrics?.usagePercent || 0;

    return `
        <div class="storage-breakdown-panel" id="storage-breakdown-panel">
            <div class="storage-header">
                <h4>📊 Storage Breakdown</h4>
                <span class="storage-tier" style="color: ${tierColors[tier]}">
                    ${tierLabels[tier] || tier}
                </span>
            </div>
            
            <!-- Overall Usage Bar -->
            <div class="storage-overall">
                <div class="storage-usage-bar">
                    <div class="storage-usage-fill" style="width: ${Math.min(usagePercent, 100)}%; background: ${tierColors[tier]}"></div>
                </div>
                <span class="storage-usage-text">
                    ${breakdown?.total?.formattedSize || '0 B'} used 
                    ${metrics?.quotaBytes ? `of ${formatBytes(metrics.quotaBytes)}` : ''}
                    (${usagePercent.toFixed(1)}%)
                </span>
            </div>
            
            <!-- Category Breakdown -->
            <div class="storage-categories">
                ${createCategoryRows(breakdown)}
            </div>
            
            <!-- Actions -->
            <div class="storage-actions">
                <button class="btn btn-small btn-secondary" data-action="storage-refresh">
                    ↻ Refresh
                </button>
                <button class="btn btn-small btn-warning" data-action="storage-clear-embeddings">
                    Clear Embeddings
                </button>
                <button class="btn btn-small btn-danger" data-action="storage-show-cleanup-modal">
                    Cleanup...
                </button>
            </div>
            
            ${breakdown?.embeddingsFrozen ? `
                <div class="storage-warning">
                    <span>⚠️ Embedding generation paused due to storage constraints</span>
                </div>
            ` : ''}
        </div>
    `;
}

/**
 * Create category rows HTML
 * @param {Object} breakdown - Storage breakdown object
 * @returns {string} HTML string
 */
function createCategoryRows(breakdown) {
    if (!breakdown) return '<div class="storage-empty">Loading...</div>';

    const categories = [
        { key: 'sessions', icon: '💬', label: 'Chat Sessions' },
        { key: 'embeddings', icon: '🧠', label: 'Embeddings' },
        { key: 'chunks', icon: '📦', label: 'Data Chunks' },
        { key: 'streams', icon: '🎵', label: 'Music Streams' },
        { key: 'personality', icon: '👤', label: 'Personality' },
        { key: 'settings', icon: '⚙️', label: 'Settings' }
    ];

    return categories.map(cat => {
        const data = breakdown[cat.key];
        if (!data) return '';

        const priorityColors = {
            never: 'var(--color-info, #60a5fa)',
            low: 'var(--color-success, #4ade80)',
            medium: 'var(--color-warning, #facc15)',
            high: 'var(--color-warning, #f59e0b)',
            aggressive: 'var(--color-error, #f87171)'
        };

        return `
            <div class="storage-category-row">
                <span class="category-icon">${cat.icon}</span>
                <span class="category-label">${cat.label}</span>
                <span class="category-count">${data.count} items</span>
                <span class="category-size">${formatBytes(data.estimatedBytes)}</span>
                <div class="category-bar">
                    <div class="category-bar-fill" 
                         style="width: ${data.percentage || 0}%; background: ${priorityColors[data.priority] || 'var(--color-muted)'}">
                    </div>
                </div>
                <span class="category-percent">${data.percentage || 0}%</span>
            </div>
        `;
    }).join('');
}

/**
 * Format bytes to human readable string
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
    // Validate input: check for finite number
    if (typeof bytes !== 'number' || !Number.isFinite(bytes)) {
        return '0 B';
    }

    if (bytes === 0) return '0 B';

    // Preserve sign for negative values
    const sign = Math.sign(bytes);
    const absBytes = Math.abs(bytes);

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];

    // Calculate unit index and clamp to array bounds
    const i = Math.min(Math.floor(Math.log(absBytes) / Math.log(k)), sizes.length - 1);

    // Format the value and reapply sign
    const value = parseFloat((absBytes / Math.pow(k, i)).toFixed(2));
    return (sign * value) + ' ' + sizes[i];
}

// ==========================================
// Public API
// ==========================================

let _storageDegradationManager = null;

/**
 * Initialize the Storage Breakdown UI
 * @param {StorageDegradationManager} manager - Storage degradation manager instance
 */
async function init(manager) {
    _storageDegradationManager = manager;

    // Set up event delegation for data-action attributes
    document.addEventListener('click', handleDataAction);

    console.log('[StorageBreakdownUI] Initialized with event delegation');
}

/**
 * Handle data-action events via event delegation
 * @param {Event} event - Click event
 */
function handleDataAction(event) {
    const target = event.target;
    const action = target.dataset?.action;

    if (!action || !action.startsWith('storage-')) return;

    event.preventDefault();

    switch (action) {
        case 'storage-refresh':
            refresh();
            break;
        case 'storage-clear-embeddings':
            cleanup('embeddings');
            break;
        case 'storage-show-cleanup-modal':
            showCleanupModal();
            break;
        case 'storage-hide-cleanup-modal':
            hideCleanupModal();
            break;
        case 'storage-run-cleanup':
            runSelectedCleanup();
            break;
        default:
            console.warn('[StorageBreakdownUI] Unknown action:', action);
    }
}

/**
 * Render the storage breakdown panel into a container
 * @param {HTMLElement|string} container - Container element or selector
 * @returns {Promise<void>}
 */
async function render(container) {
    const containerEl = typeof container === 'string'
        ? document.querySelector(container)
        : container;

    if (!containerEl) {
        console.warn('[StorageBreakdownUI] Container not found');
        return;
    }

    try {
        // Get storage degradation manager
        const manager = _storageDegradationManager || await getStorageDegradationManager();

        // Get breakdown and metrics
        const breakdown = await manager.getStorageBreakdown();
        const metrics = manager.getCurrentMetrics();

        // Check if embeddings are frozen
        breakdown.embeddingsFrozen = manager.isEmbeddingFrozen?.() || false;

        // Render HTML
        containerEl.innerHTML = createStorageBreakdownHTML(breakdown, {
            ...metrics,
            tier: manager.getCurrentTier?.() || 'NORMAL'
        });

    } catch (error) {
        console.error('[StorageBreakdownUI] Failed to render:', error);
        // Use DOM APIs to prevent XSS - don't use innerHTML with error.message
        const errorPanel = document.createElement('div');
        errorPanel.className = 'storage-breakdown-panel error';

        const errorMessage = document.createElement('p');
        errorMessage.textContent = 'Failed to load storage breakdown: ' + (error.message || 'Unknown error');
        errorPanel.appendChild(errorMessage);

        const retryButton = document.createElement('button');
        retryButton.className = 'btn btn-small';
        retryButton.textContent = 'Retry';
        retryButton.onclick = () => StorageBreakdownUI.refresh();
        errorPanel.appendChild(retryButton);

        containerEl.innerHTML = '';
        containerEl.appendChild(errorPanel);
    }
}

/**
 * Refresh the storage breakdown display
 */
async function refresh() {
    const panel = document.getElementById('storage-breakdown-panel');
    if (panel) {
        await render(panel.parentElement);
    }
}

/**
 * Run cleanup for a specific category
 * @param {string} category - Category to cleanup ('embeddings', 'sessions', 'streams', 'chunks', 'all')
 */
async function cleanup(category) {
    try {
        const manager = _storageDegradationManager || await getStorageDegradationManager();

        // Handle specific categories with appropriate cleanup strategies
        if (category === 'embeddings') {
            // Import and clear LRU cache
            const { VectorLRUCache } = await import('./storage/lru-cache.js');
            await VectorLRUCache.clear();
            showToast('Embeddings cleared successfully');
        } else if (category === 'all') {
            // Full cleanup with HIGH priority
            const result = await manager.triggerCleanup(3);
            showToast(`Cleaned ${result.itemsDeleted} items, freed ${formatBytes(result.bytesFreed)}`);
        } else if (category === 'sessions' || category === 'streams' || category === 'chunks') {
            // Category-specific cleanup with MEDIUM priority
            const result = await manager.triggerCleanup(2);
            showToast(`Cleaned ${result.itemsDeleted} items, freed ${formatBytes(result.bytesFreed)}`);
        } else {
            // Unknown category, perform general cleanup
            const result = await manager.triggerCleanup(2);
            showToast(`Cleaned ${result.itemsDeleted} items, freed ${formatBytes(result.bytesFreed)}`);
        }

        await refresh();
    } catch (error) {
        console.error('[StorageBreakdownUI] Cleanup failed:', error);
        showToast('Cleanup failed: ' + error.message);
    }
}

/**
 * Show the cleanup modal with options
 */
async function showCleanupModal() {
    // Check for existing modal to prevent duplicates
    const existingModal = document.getElementById('storage-cleanup-modal');
    if (existingModal) {
        // Focus existing modal instead of creating a duplicate
        existingModal.focus();
        return;
    }

    const manager = _storageDegradationManager || await getStorageDegradationManager();
    const breakdown = await manager.getStorageBreakdown();

    const modal = document.createElement('div');
    modal.className = 'storage-cleanup-modal';
    modal.id = 'storage-cleanup-modal';
    modal.innerHTML = `
        <div class="modal-overlay" data-action="storage-hide-cleanup-modal"></div>
        <div class="modal-content">
            <h3>🧹 Storage Cleanup</h3>
            <p>Select categories to cleanup:</p>
            
            <div class="cleanup-options">
                <label class="cleanup-option">
                    <input type="checkbox" name="cleanup" value="embeddings" checked>
                    <span>🧠 Embeddings (${formatBytes(breakdown.embeddings?.estimatedBytes || 0)})</span>
                    <span class="cleanup-hint">Can be regenerated</span>
                </label>
                <label class="cleanup-option">
                    <input type="checkbox" name="cleanup" value="streams">
                    <span>🎵 Old Streams (${formatBytes(breakdown.streams?.estimatedBytes || 0)})</span>
                    <span class="cleanup-hint">30+ days old</span>
                </label>
                <label class="cleanup-option">
                    <input type="checkbox" name="cleanup" value="chunks">
                    <span>📦 Old Chunks (${formatBytes(breakdown.chunks?.estimatedBytes || 0)})</span>
                    <span class="cleanup-hint">90+ days old</span>
                </label>
                <label class="cleanup-option">
                    <input type="checkbox" name="cleanup" value="sessions">
                    <span>💬 Old Sessions (${formatBytes(breakdown.sessions?.estimatedBytes || 0)})</span>
                    <span class="cleanup-hint">30+ days old, except active</span>
                </label>
            </div>
            
            <div class="modal-actions">
                <button class="btn btn-secondary" data-action="storage-hide-cleanup-modal">Cancel</button>
                <button class="btn btn-danger" data-action="storage-run-cleanup">🧹 Cleanup Selected</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

/**
 * Hide the cleanup modal
 */
function hideCleanupModal() {
    const modal = document.getElementById('storage-cleanup-modal');
    if (modal) modal.remove();
}

/**
 * Run cleanup for selected categories
 */
async function runSelectedCleanup() {
    const checkboxes = document.querySelectorAll('#storage-cleanup-modal input[name="cleanup"]:checked');
    const categories = Array.from(checkboxes).map(cb => cb.value);

    if (categories.length === 0) {
        showToast('Please select at least one category');
        return;
    }

    hideCleanupModal();
    showToast('Starting cleanup...');

    try {
        const manager = _storageDegradationManager || await getStorageDegradationManager();
        let totalFreed = 0;
        let totalDeleted = 0;

        // Float32 vector size: 1536 dimensions * 4 bytes per float32 = 6144 bytes per vector
        const EMBEDDING_BYTES_PER_VECTOR = 1536 * 4;

        for (const category of categories) {
            if (category === 'embeddings') {
                const { VectorLRUCache } = await import('./storage/lru-cache.js');
                const beforeSize = VectorLRUCache.size?.() || 0;
                await VectorLRUCache.clear();
                totalFreed += beforeSize * EMBEDDING_BYTES_PER_VECTOR;
                totalDeleted += beforeSize;
            }
        }

        // Run general cleanup for other categories
        const otherCategories = categories.filter(c => c !== 'embeddings');
        if (otherCategories.length > 0) {
            const result = await manager.triggerCleanup(3); // HIGH priority
            totalFreed += result.bytesFreed || 0;
            totalDeleted += result.itemsDeleted || 0;
        }

        showToast(`Cleaned ${totalDeleted} items, freed ${formatBytes(totalFreed)}`);
        await refresh();

    } catch (error) {
        console.error('[StorageBreakdownUI] Selected cleanup failed:', error);
        showToast('Cleanup failed: ' + error.message);
    }
}

/**
 * Get StorageDegradationManager instance
 * @returns {Promise<StorageDegradationManager>}
 */
async function getStorageDegradationManager() {
    const { default: manager } = await import('./services/storage-degradation-manager.js');
    return manager;
}

/**
 * Show a toast notification
 * @param {string} message - Message to show
 */
function showToast(message) {
    // Use EventBus for toast notifications
    EventBus.emit('UI:TOAST', { message, type: 'info', duration: 3000 });
}

// ==========================================
// CSS Styles (injected once)
// ==========================================

function injectStyles() {
    if (document.getElementById('storage-breakdown-styles')) return;

    const style = document.createElement('style');
    style.id = 'storage-breakdown-styles';
    style.textContent = `
        .storage-breakdown-panel {
            background: var(--color-surface, #1a1a2e);
            border-radius: 12px;
            padding: 16px;
            margin: 16px 0;
            border: 1px solid var(--color-border, #2d2d4a);
        }
        
        .storage-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        
        .storage-header h4 {
            margin: 0;
            font-size: 1rem;
            color: var(--color-text, #fff);
        }
        
        .storage-tier {
            font-weight: 600;
            font-size: 0.875rem;
        }
        
        .storage-overall {
            margin-bottom: 16px;
        }
        
        .storage-usage-bar {
            height: 8px;
            background: var(--color-muted, #333);
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 4px;
        }
        
        .storage-usage-fill {
            height: 100%;
            transition: width 0.3s ease;
            border-radius: 4px;
        }
        
        .storage-usage-text {
            font-size: 0.75rem;
            color: var(--color-text-muted, #888);
        }
        
        .storage-categories {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        .storage-category-row {
            display: grid;
            grid-template-columns: 24px 1fr 80px 70px 100px 40px;
            align-items: center;
            gap: 8px;
            padding: 8px;
            background: var(--color-surface-alt, #252540);
            border-radius: 8px;
            font-size: 0.875rem;
        }
        
        .category-icon {
            text-align: center;
        }
        
        .category-label {
            color: var(--color-text, #fff);
        }
        
        .category-count {
            color: var(--color-text-muted, #888);
            text-align: right;
        }
        
        .category-size {
            color: var(--color-text-muted, #888);
            text-align: right;
            font-family: monospace;
        }
        
        .category-bar {
            height: 6px;
            background: var(--color-muted, #333);
            border-radius: 3px;
            overflow: hidden;
        }
        
        .category-bar-fill {
            height: 100%;
            transition: width 0.3s ease;
            border-radius: 3px;
        }
        
        .category-percent {
            color: var(--color-text-muted, #888);
            text-align: right;
            font-size: 0.75rem;
        }
        
        .storage-actions {
            display: flex;
            gap: 8px;
            margin-top: 16px;
            flex-wrap: wrap;
        }
        
        .storage-warning {
            margin-top: 12px;
            padding: 8px 12px;
            background: var(--color-warning-bg, rgba(250, 204, 21, 0.1));
            border: 1px solid var(--color-warning, #facc15);
            border-radius: 8px;
            font-size: 0.875rem;
            color: var(--color-warning, #facc15);
        }
        
        .storage-cleanup-modal {
            position: fixed;
            inset: 0;
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .storage-cleanup-modal .modal-overlay {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.7);
        }
        
        .storage-cleanup-modal .modal-content {
            position: relative;
            background: var(--color-surface, #1a1a2e);
            border-radius: 16px;
            padding: 24px;
            max-width: 400px;
            width: 90%;
            border: 1px solid var(--color-border, #2d2d4a);
        }
        
        .storage-cleanup-modal h3 {
            margin: 0 0 12px 0;
        }
        
        .cleanup-options {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin: 16px 0;
        }
        
        .cleanup-option {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: var(--color-surface-alt, #252540);
            border-radius: 8px;
            cursor: pointer;
        }
        
        .cleanup-option input {
            width: 18px;
            height: 18px;
        }
        
        .cleanup-hint {
            flex-basis: 100%;
            margin-left: 26px;
            font-size: 0.75rem;
            color: var(--color-text-muted, #888);
        }
        
        .modal-actions {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }
        
        .storage-empty {
            text-align: center;
            padding: 24px;
            color: var(--color-text-muted, #888);
        }
        
        .storage-breakdown-panel.error {
            border-color: var(--color-error, #f87171);
        }
        
        .btn-warning {
            background: var(--color-warning, #f59e0b);
            color: #000;
        }
        
        .btn-danger {
            background: var(--color-error, #ef4444);
            color: #fff;
        }
        
        @media (max-width: 600px) {
            .storage-category-row {
                grid-template-columns: 24px 1fr 60px 50px;
            }
            
            .category-bar, .category-percent {
                display: none;
            }
        }
    `;

    document.head.appendChild(style);
}

// Inject styles on module load
if (typeof document !== 'undefined') {
    injectStyles();
}

// ==========================================
// Export Public API
// ==========================================

export const StorageBreakdownUI = {
    init,
    render,
    refresh,
    cleanup,
    showCleanupModal,
    hideCleanupModal,
    runSelectedCleanup
};

console.log('[StorageBreakdownUI] Component loaded');
