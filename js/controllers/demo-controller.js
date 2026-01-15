/**
 * Demo Controller
 * 
 * Handles demo mode with isolated data sandbox.
 * Extracted from app.js to separate demo concerns from main app flow.
 * 
 * @module controllers/demo-controller
 */

'use strict';

// ==========================================
// Dependencies (injected via init)
// ==========================================

let _AppState = null;
let _DemoData = null;
let _ViewController = null;
let _showToast = null;

// ==========================================
// Demo Storage Namespace
// HNW Defensive: Complete isolation of demo data from user data
// ==========================================

const DEMO_STORAGE_PREFIX = 'demo_';
const DEMO_SESSION_KEY = 'rhythm_chamber_demo_session';

/**
 * Demo-specific storage wrapper
 * Uses prefixed keys to ensure complete isolation from user data
 * All data is session-only - never persisted to IndexedDB
 */
const DemoStorage = {
    // In-memory cache for demo session data
    _cache: new Map(),
    _initialized: false,

    /**
     * Initialize demo storage with safeguards
     */
    init() {
        if (this._initialized) return;

        this._cache.clear();
        this._initialized = true;
        console.log('[DemoStorage] Initialized with isolated namespace');
    },

    /**
     * Set demo data (session-only, never persisted)
     * @param {string} key - Data key
     * @param {*} value - Data value (any serializable type)
     */
    set(key, value) {
        if (!this._initialized) this.init();

        const prefixedKey = DEMO_STORAGE_PREFIX + key;
        this._cache.set(prefixedKey, value);

        // Also store in sessionStorage for tab persistence
        try {
            sessionStorage.setItem(prefixedKey, JSON.stringify(value));
        } catch (e) {
            console.warn('[DemoStorage] SessionStorage write failed:', e.message);
        }
    },

    /**
     * Get demo data
     * @param {string} key - Data key
     * @returns {*} Stored value or null
     */
    get(key) {
        if (!this._initialized) this.init();

        const prefixedKey = DEMO_STORAGE_PREFIX + key;

        // Check memory cache first
        if (this._cache.has(prefixedKey)) {
            return this._cache.get(prefixedKey);
        }

        // Fall back to sessionStorage
        try {
            const stored = sessionStorage.getItem(prefixedKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                this._cache.set(prefixedKey, parsed);
                return parsed;
            }
        } catch (e) {
            console.warn('[DemoStorage] SessionStorage read failed:', e.message);
        }

        return null;
    },

    /**
     * Clear all demo data
     */
    clear() {
        this._cache.clear();

        // Clear all demo-prefixed sessionStorage keys
        try {
            const keysToRemove = [];
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key && key.startsWith(DEMO_STORAGE_PREFIX)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => sessionStorage.removeItem(key));
        } catch (e) {
            console.warn('[DemoStorage] SessionStorage clear failed:', e.message);
        }

        this._initialized = false;
        console.log('[DemoStorage] Cleared all demo data');
    },

    /**
     * Check if demo storage has data
     * @returns {boolean}
     */
    hasData() {
        return this._cache.size > 0 || this.get('streams') !== null;
    },

    /**
     * Validate demo data integrity
     * @returns {{ valid: boolean, reason?: string }}
     */
    validate() {
        const streams = this.get('streams');
        const patterns = this.get('patterns');
        const personality = this.get('personality');

        if (!streams || !Array.isArray(streams)) {
            return { valid: false, reason: 'Missing or invalid demo streams' };
        }
        if (!patterns || typeof patterns !== 'object') {
            return { valid: false, reason: 'Missing or invalid demo patterns' };
        }
        if (!personality || typeof personality !== 'object') {
            return { valid: false, reason: 'Missing or invalid demo personality' };
        }

        return { valid: true };
    }
};

// ==========================================
// Core Functions
// ==========================================

/**
 * Initialize DemoController with dependencies
 * @param {Object} dependencies - Required dependencies
 */
function init(dependencies) {
    _AppState = dependencies.AppState;
    _DemoData = dependencies.DemoData;
    _ViewController = dependencies.ViewController;
    _showToast = dependencies.showToast;

    console.log('[DemoController] Initialized with dependencies');
}

/**
 * Load demo mode with pre-computed "The Emo Teen" persona
 * Uses in-memory storage to avoid mixing with user's real data
 * HNW Defensive: Uses DemoStorage for complete isolation from IndexedDB
 * ATOMIC: Locks UI and flushes pending operations before state change
 * @returns {Promise<void>}
 */
async function loadDemoMode() {
    if (!_ViewController || !_AppState || !_DemoData) {
        console.error('[DemoController] Required dependencies not available');
        return;
    }

    console.log('[DemoController] Loading demo data: "The Emo Teen"');

    // ATOMIC: Lock UI during entire transition
    lockUI();

    try {
        // Flush any pending operations before switching
        await flushPendingOperations();

        _ViewController.showProcessing();
        _ViewController.updateProgress('🎭 Loading demo mode...');

        // Get demo data package
        const demoPackage = _DemoData.getFullDemoPackage();

        // HNW Defensive: Initialize isolated demo storage
        DemoStorage.init();

        // Store demo data in ISOLATED DemoStorage (session-only, never IndexedDB)
        _ViewController.updateProgress('Loading sample streaming history...');
        await new Promise(r => setTimeout(r, 300));

        DemoStorage.set('streams', demoPackage.streams);
        DemoStorage.set('patterns', demoPackage.patterns);
        DemoStorage.set('personality', demoPackage.personality);
        DemoStorage.set('loadedAt', Date.now());

        // Validate demo data integrity before proceeding
        const validation = DemoStorage.validate();
        if (!validation.valid) {
            throw new Error(validation.reason);
        }

        // Also update AppState for UI components that read from it
        // But the authoritative source is now DemoStorage
        _AppState.update('demo', {
            isDemoMode: true,
            streams: demoPackage.streams,
            patterns: demoPackage.patterns,
            personality: demoPackage.personality
        });

        _ViewController.updateProgress('Preparing demo experience...');
        await new Promise(r => setTimeout(r, 300));

        // Show reveal
        _ViewController.showReveal();

        // Add demo badge to UI
        addDemoBadge();

        // Pre-load chat with demo-specific suggestions
        setupDemoChatSuggestions();

        console.log('[DemoController] Demo mode loaded (isolated in DemoStorage + AppState)');
    } catch (error) {
        console.error('[DemoController] Demo mode load failed:', error);
        if (_showToast) {
            _showToast('Failed to load demo mode. Please try again.');
        }
    } finally {
        // ATOMIC: Always unlock UI
        unlockUI();
    }
}

/**
 * Lock UI during demo transition
 * Prevents user interaction during state change
 */
function lockUI() {
    document.body.classList.add('demo-transitioning');
    console.log('[DemoController] UI locked for demo transition');
}

/**
 * Unlock UI after demo transition
 */
function unlockUI() {
    document.body.classList.remove('demo-transitioning');
    console.log('[DemoController] UI unlocked');
}

/**
 * Flush all pending operations before state change
 * Ensures data consistency during demo switch
 * @returns {Promise<void>}
 */
async function flushPendingOperations() {
    console.log('[DemoController] Flushing pending operations...');

    const promises = [];

    // Flush pending chat saves
    if (window.Chat?.flushPendingSaveAsync) {
        promises.push(
            window.Chat.flushPendingSaveAsync().catch(e =>
                console.warn('[DemoController] Chat flush failed:', e)
            )
        );
    }

    // Flush IndexedDB operations if available
    if (window.IndexedDBCore?.getConnection) {
        // Force any pending transactions to complete
        const conn = window.IndexedDBCore.getConnection();
        if (conn) {
            // IndexedDB doesn't have a flush, but we can ensure transactions complete
            // by doing a small read operation
            promises.push(
                window.IndexedDBCore.count?.('config').catch(() => { })
            );
        }
    }

    // Wait for all pending operations
    await Promise.all(promises);

    console.log('[DemoController] All pending operations flushed');
}

/**
 * Add visual indicator that user is in demo mode
 */
function addDemoBadge() {
    // Add badge to header
    const headerLeft = document.querySelector('.header-left');
    if (headerLeft && !document.getElementById('demo-badge')) {
        const badge = document.createElement('span');
        badge.id = 'demo-badge';
        badge.className = 'demo-badge';
        badge.innerHTML = '🎭 Demo Mode';
        badge.title = 'You are viewing sample data. Upload your own data to see your real personality.';
        badge.style.cssText = `
            background: linear-gradient(135deg, var(--accent), var(--accent-secondary, #9b59b6));
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 600;
            margin-left: 12px;
            cursor: help;
        `;
        headerLeft.appendChild(badge);
    }

    // Add exit demo mode button
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        resetBtn.textContent = 'Exit Demo';
        resetBtn.title = 'Exit demo mode and upload your own data';
    }
}

/**
 * Setup demo-specific chat suggestions tuned to sample data
 * Note: We use data attributes and rely on existing event delegation from setupEventListeners
 * to avoid duplicate click handlers
 */
function setupDemoChatSuggestions() {
    const suggestions = document.getElementById('chat-suggestions');
    if (suggestions) {
        // Replace with demo-specific suggestions
        // The event listeners from setupEventListeners() use querySelectorAll at init time,
        // so these NEW elements need their own handlers
        suggestions.innerHTML = `
            <button class="suggestion-chip demo-chip" data-question="Tell me about my MCR obsession">
                Tell me about my MCR obsession
            </button>
            <button class="suggestion-chip demo-chip" data-question="What was my emo phase like in 2019?">
                What was my emo phase like in 2019?
            </button>
            <button class="suggestion-chip demo-chip" data-question="Why did I stop listening to Pierce The Veil?">
                Why did I stop listening to Pierce The Veil?
            </button>
            <button class="suggestion-chip demo-chip" data-question="How has my taste evolved over the years?">
                How has my taste evolved?
            </button>
        `;

        // Attach event listeners to the NEW demo-specific chips
        // These are new elements so won't have duplicate listeners
        suggestions.querySelectorAll('.demo-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Prevent any bubbling
                const question = chip.dataset.question;
                const input = document.getElementById('chat-input');
                if (input) {
                    input.value = question;
                }
                // Trigger chat send
                const sendBtn = document.getElementById('chat-send');
                if (sendBtn) {
                    sendBtn.click();
                }
            });
        });
    }
}

/**
 * Get demo data package
 * @returns {Object} Demo data package
 */
function getDemoPackage() {
    if (!_DemoData) {
        console.error('[DemoController] DemoData module not available');
        return null;
    }
    return _DemoData.getFullDemoPackage();
}

/**
 * Check if currently in demo mode
 * @returns {boolean}
 */
function isDemoMode() {
    if (!_AppState) return false;
    const demoState = _AppState.get('demo');
    return demoState?.isDemoMode || false;
}

/**
 * Get active data (demo or real) transparently
 * HNW: Components use this to access data without knowing if demo mode is active
 * @returns {{ streams: Array, patterns: Object, personality: Object, isDemoMode: boolean }}
 */
function getActiveData() {
    if (!_AppState) {
        return { streams: null, patterns: null, personality: null, isDemoMode: false };
    }

    const state = _AppState.get();
    const isDemo = state.demo?.isDemoMode || false;

    if (isDemo) {
        return {
            streams: state.demo.streams,
            patterns: state.demo.patterns,
            personality: state.demo.personality,
            isDemoMode: true
        };
    }

    return {
        streams: state.data.streams,
        patterns: state.data.patterns,
        personality: state.data.personality,
        isDemoMode: false
    };
}

/**
 * Exit demo mode
 * HNW Defensive: Clears both DemoStorage and AppState to ensure complete cleanup
 * @returns {Promise<void>}
 */
async function exitDemoMode() {
    if (!_AppState || !_ViewController) return;

    // HNW Defensive: Clear isolated demo storage first
    DemoStorage.clear();

    // Clear demo state from AppState
    _AppState.update('demo', {
        isDemoMode: false,
        streams: null,
        patterns: null,
        personality: null
    });

    // Remove demo badge
    const demoBadge = document.getElementById('demo-badge');
    if (demoBadge) {
        demoBadge.remove();
    }

    // Reset reset button
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        resetBtn.textContent = 'Reset';
        resetBtn.title = 'Clear all data and start over';
    }

    // Show upload view
    _ViewController.showUpload();

    console.log('[DemoController] Exited demo mode');
}

/**
 * Validate demo data integrity
 * @returns {boolean} True if demo data is valid
 */
function validateDemoData() {
    if (!_DemoData) return false;

    try {
        const demoPackage = _DemoData.getFullDemoPackage();
        return demoPackage &&
            Array.isArray(demoPackage.streams) &&
            demoPackage.streams.length > 0 &&
            demoPackage.patterns &&
            demoPackage.personality;
    } catch (error) {
        console.error('[DemoController] Demo data validation failed:', error);
        return false;
    }
}

// ==========================================
// Public API
// ==========================================

// ES Module export
export const DemoController = {
    init,
    loadDemoMode,
    addDemoBadge,
    setupDemoChatSuggestions,
    getDemoPackage,
    isDemoMode,
    getActiveData,
    exitDemoMode,
    validateDemoData,
    // HNW Defensive: Export DemoStorage for testing and debugging
    DemoStorage
};

// Make available globally for backwards compatibility
if (typeof window !== 'undefined') {
    window.DemoController = DemoController;
    window.DemoStorage = DemoStorage;
}

console.log('[DemoController] Controller loaded');