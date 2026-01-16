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
                <button class="btn btn-small btn-secondary" onclick="StorageBreakdownUI.refresh()">
                    ↻ Refresh
                </button>
                <button class="btn btn-small btn-warning" onclick="StorageBreakdownUI.cleanup('embeddings')">
                    Clear Embeddings
                </button>
                <button class="btn btn-small btn-danger" onclick="StorageBreakdownUI.showCleanupModal()">
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
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
    console.log('[StorageBreakdownUI] Initialized');
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
        containerEl.innerHTML = `
            <div class="storage-breakdown-panel error">
                <p>Failed to load storage breakdown: ${error.message}</p>
                <button class="btn btn-small" onclick="StorageBreakdownUI.refresh()">Retry</button>
            </div>
        `;
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
 * @param {string} category - Category to cleanup
 */
async function cleanup(category) {
    try {
        const manager = _storageDegradationManager || await getStorageDegradationManager();

        if (category === 'embeddings') {
            // Import and clear LRU cache
            const { VectorLRUCache } = await import('./storage/lru-cache.js');
            await VectorLRUCache.clear();
            showToast('Embeddings cleared successfully');
        } else {
            // Use manager's cleanup with appropriate priority
            const result = await manager.triggerCleanup(2); // MEDIUM priority
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
    const manager = _storageDegradationManager || await getStorageDegradationManager();
    const breakdown = await manager.getStorageBreakdown();

    const modal = document.createElement('div');
    modal.className = 'storage-cleanup-modal';
    modal.id = 'storage-cleanup-modal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="StorageBreakdownUI.hideCleanupModal()"></div>
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
                <button class="btn btn-secondary" onclick="StorageBreakdownUI.hideCleanupModal()">Cancel</button>
                <button class="btn btn-danger" onclick="StorageBreakdownUI.runSelectedCleanup()">🧹 Cleanup Selected</button>
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

        for (const category of categories) {
            if (category === 'embeddings') {
                const { VectorLRUCache } = await import('./storage/lru-cache.js');
                const beforeSize = VectorLRUCache.size?.() || 0;
                await VectorLRUCache.clear();
                totalFreed += beforeSize * 1536;
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
    // Use EventBus if available
    if (window.EventBus?.emit) {
        window.EventBus.emit('UI:TOAST', { message, type: 'info', duration: 3000 });
        return;
    }

    // Fallback to console
    console.log('[StorageBreakdownUI]', message);
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

// Make available globally for onclick handlers
if (typeof window !== 'undefined') {
    window.StorageBreakdownUI = StorageBreakdownUI;
}

console.log('[StorageBreakdownUI] Component loaded');
