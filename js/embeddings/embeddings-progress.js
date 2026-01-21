/**
 * Embeddings Progress Component
 * 
 * Multi-stage progress indicator for embedding generation:
 * - 6-stage progress (Check → Download → Initialize → Process → Embed → Store)
 * - Overall progress bar with percentage and ETA
 * - Transparency panel (chunks, storage, location)
 * - Background/Pause/Cancel actions
 * 
 * HNW Considerations:
 * - Hierarchy: Controlled by EmbeddingsTaskManager
 * - Network: Receives events from EventBus for updates
 * - Wave: Smooth animations for progress transitions
 * 
 * @module embeddings/embeddings-progress
 */

import { EventBus } from '../services/event-bus.js';
import { escapeHtml } from '../utils/html-escape.js';

// ==========================================
// Stage Definitions
// ==========================================

const STAGES = [
    { id: 'check', name: 'Checking', icon: '🔍', description: 'Verifying compatibility' },
    { id: 'download', name: 'Downloading', icon: '📥', description: 'Fetching model (~6MB)' },
    { id: 'initialize', name: 'Initializing', icon: '⚙️', description: 'Loading model' },
    { id: 'process', name: 'Processing', icon: '📄', description: 'Preparing chunks' },
    { id: 'embed', name: 'Embedding', icon: '🧠', description: 'Generating vectors' },
    { id: 'store', name: 'Storing', icon: '💾', description: 'Saving to IndexedDB' }
];

// ==========================================
// Progress HTML Template
// ==========================================

const PROGRESS_HTML = `
<div class="embedding-progress-container" id="embedding-progress">
    <div class="progress-header">
        <h3>Generating Embeddings</h3>
        <div class="progress-actions">
            <button class="btn-icon" id="progress-background" title="Run in background">📌</button>
            <button class="btn-icon" id="progress-pause" title="Pause">⏸️</button>
            <button class="btn-icon" id="progress-cancel" title="Cancel">✕</button>
        </div>
    </div>
    
    <div class="stage-progress">
        ${STAGES.map((stage, i) => `
            <div class="stage-item" id="stage-${stage.id}" data-stage="${i}">
                <div class="stage-icon">${stage.icon}</div>
                <div class="stage-name">${stage.name}</div>
            </div>
            ${i < STAGES.length - 1 ? '<div class="stage-connector"></div>' : ''}
        `).join('')}
    </div>
    
    <div class="overall-progress">
        <div class="embeddings-progress-bar-container">
            <div class="embeddings-progress-fill" id="overall-progress-bar" style="width: 0%"></div>
        </div>
        <div class="progress-stats">
            <span id="progress-percent">0%</span>
            <span id="progress-eta">Calculating...</span>
        </div>
    </div>
    
    <div class="current-operation" id="current-operation">
        <span class="operation-text">Starting...</span>
    </div>
    
    <div class="transparency-panel">
        <div class="transparency-toggle" id="transparency-toggle">
            <span>Details</span>
            <span class="toggle-icon">▼</span>
        </div>
        <div class="transparency-content" id="transparency-content">
            <div class="transparency-row">
                <span class="label">Chunks processed:</span>
                <span class="value" id="chunks-count">0 / 0</span>
            </div>
            <div class="transparency-row">
                <span class="label">Storage used:</span>
                <span class="value" id="storage-used">-- KB</span>
            </div>
            <div class="transparency-row">
                <span class="label">Backend:</span>
                <span class="value" id="backend-mode">--</span>
            </div>
            <div class="transparency-row">
                <span class="label">Avg time per embedding:</span>
                <span class="value" id="avg-time">-- ms</span>
            </div>
        </div>
    </div>
</div>
`;

// ==========================================
// State
// ==========================================

let container = null;
let currentStage = 0;
let isPaused = false;
let isBackground = false;
let startTime = null;
let totalItems = 0;
let processedItems = 0;
let unsubscribers = [];

// ==========================================
// UI Updates
// ==========================================

/**
 * Update current stage
 * @param {number} stageIndex - Index of active stage (0-5)
 */
function setStage(stageIndex) {
    currentStage = stageIndex;

    STAGES.forEach((stage, i) => {
        const el = document.getElementById(`stage-${stage.id}`);
        if (!el) return;

        el.classList.remove('active', 'complete', 'pending');
        if (i < stageIndex) {
            el.classList.add('complete');
        } else if (i === stageIndex) {
            el.classList.add('active');
        } else {
            el.classList.add('pending');
        }
    });

    // Update current operation text
    const operationEl = document.querySelector('#current-operation .operation-text');
    if (operationEl && STAGES[stageIndex]) {
        operationEl.textContent = STAGES[stageIndex].description;
    }
}

/**
 * Update overall progress
 * @param {number} percent - Progress percentage (0-100)
 * @param {string} [eta] - Optional ETA string
 */
function setProgress(percent, eta = null) {
    const bar = document.getElementById('overall-progress-bar');
    const percentEl = document.getElementById('progress-percent');
    const etaEl = document.getElementById('progress-eta');

    if (bar) {
        bar.style.width = `${percent}%`;
    }
    if (percentEl) {
        percentEl.textContent = `${Math.round(percent)}%`;
    }
    if (etaEl && eta) {
        etaEl.textContent = eta;
    }
}

/**
 * Update transparency panel values
 */
function updateTransparency(data) {
    if (data.chunks !== undefined) {
        const chunksEl = document.getElementById('chunks-count');
        if (chunksEl) chunksEl.textContent = `${data.chunks.processed} / ${data.chunks.total}`;
    }
    if (data.storageKB !== undefined) {
        const storageEl = document.getElementById('storage-used');
        if (storageEl) storageEl.textContent = `${data.storageKB} KB`;
    }
    if (data.backend !== undefined) {
        const backendEl = document.getElementById('backend-mode');
        if (backendEl) backendEl.textContent = data.backend;
    }
    if (data.avgTimeMs !== undefined) {
        const avgEl = document.getElementById('avg-time');
        if (avgEl) avgEl.textContent = `${Math.round(data.avgTimeMs)} ms`;
    }
}

/**
 * Calculate ETA based on progress
 */
function calculateETA(processed, total) {
    if (!startTime || processed === 0) return 'Calculating...';

    const elapsed = Date.now() - startTime;
    const rate = processed / elapsed;
    const remaining = total - processed;
    const etaMs = remaining / rate;

    if (etaMs < 60000) {
        return `~${Math.ceil(etaMs / 1000)}s remaining`;
    } else if (etaMs < 3600000) {
        return `~${Math.ceil(etaMs / 60000)}m remaining`;
    } else {
        return `~${Math.ceil(etaMs / 3600000)}h remaining`;
    }
}

// ==========================================
// Event Handlers
// ==========================================

/**
 * Subscribe to embedding events
 */
function subscribeToEvents() {
    // Model loading events
    unsubscribers.push(EventBus.on('embedding:model_loaded', (payload) => {
        setStage(2); // Initialize complete
        updateTransparency({ backend: `${payload.backend} (${payload.quantization})` });
    }));

    // Generation events
    unsubscribers.push(EventBus.on('embedding:generation_start', (payload) => {
        setStage(4); // Embedding stage
        totalItems = payload.count;
        processedItems = 0;
        startTime = Date.now();
        updateTransparency({ chunks: { processed: 0, total: payload.count } });
    }));

    unsubscribers.push(EventBus.on('embedding:generation_complete', (payload) => {
        setStage(5); // Store stage
        setProgress(100, 'Complete!');
        updateTransparency({ avgTimeMs: payload.avgTimePerEmbedding });
    }));

    // Error events
    unsubscribers.push(EventBus.on('embedding:error', (payload) => {
        const operationEl = document.querySelector('#current-operation .operation-text');
        if (operationEl) {
            operationEl.textContent = `Error: ${payload.error}`;
            operationEl.classList.add('error');
        }
    }));
}

/**
 * Unsubscribe from all events
 */
function unsubscribeFromEvents() {
    unsubscribers.forEach(unsub => unsub());
    unsubscribers = [];
}

// ==========================================
// Component Lifecycle
// ==========================================

/**
 * Show the progress component
 * @param {HTMLElement} parent - Parent element to append to
 * @param {Object} options - Display options
 */
function show(parent = document.body, options = {}) {
    if (container) {
        hide();
    }

    const wrapper = document.createElement('div');
    // SAFE: PROGRESS_HTML is a static template constant defined in this module
    wrapper.innerHTML = PROGRESS_HTML;
    container = wrapper.firstElementChild;
    parent.appendChild(container);

    // Bind button handlers
    bindActionButtons();

    // Subscribe to events
    subscribeToEvents();

    // Initialize state
    startTime = Date.now();
    setStage(0);
    setProgress(0, 'Starting...');

    // Setup transparency toggle
    const toggle = document.getElementById('transparency-toggle');
    const content = document.getElementById('transparency-content');
    toggle?.addEventListener('click', () => {
        content?.classList.toggle('collapsed');
        const icon = toggle.querySelector('.toggle-icon');
        if (icon) icon.textContent = content?.classList.contains('collapsed') ? '▶' : '▼';
    });

    return container;
}

/**
 * Bind action button handlers
 */
function bindActionButtons() {
    const backgroundBtn = document.getElementById('progress-background');
    const pauseBtn = document.getElementById('progress-pause');
    const cancelBtn = document.getElementById('progress-cancel');

    backgroundBtn?.addEventListener('click', () => {
        isBackground = true;
        EventBus.emit('embedding:background_requested', {});
        if (container) container.classList.add('minimized');
    });

    pauseBtn?.addEventListener('click', () => {
        isPaused = !isPaused;
        EventBus.emit('embedding:pause_toggle', { paused: isPaused });
        if (pauseBtn) pauseBtn.textContent = isPaused ? '▶️' : '⏸️';
    });

    cancelBtn?.addEventListener('click', () => {
        EventBus.emit('embedding:cancel_requested', {});
        hide();
    });
}

/**
 * Hide the progress component
 */
function hide() {
    unsubscribeFromEvents();
    if (container) {
        container.remove();
        container = null;
    }
    isPaused = false;
    isBackground = false;
    startTime = null;
}

/**
 * Update processed item count (for external progress updates)
 */
function updateProgress(processed, total) {
    processedItems = processed;
    totalItems = total;
    const percent = total > 0 ? (processed / total) * 100 : 0;
    const eta = calculateETA(processed, total);
    setProgress(percent, eta);
    updateTransparency({ chunks: { processed, total } });
}

// ==========================================
// Public API
// ==========================================

export const EmbeddingsProgress = {
    /**
     * Show the progress component
     */
    show,

    /**
     * Hide the progress component
     */
    hide,

    /**
     * Set the current stage (0-5)
     */
    setStage,

    /**
     * Update progress percentage
     */
    setProgress,

    /**
     * Update processed items count
     */
    updateProgress,

    /**
     * Update transparency panel
     */
    updateTransparency,

    /**
     * Check if paused
     */
    isPaused() {
        return isPaused;
    },

    /**
     * Check if in background mode
     */
    isBackground() {
        return isBackground;
    },

    /**
     * Stage definitions
     */
    STAGES
};

console.log('[EmbeddingsProgress] Module loaded');
