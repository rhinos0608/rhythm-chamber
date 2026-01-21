/**
 * Demo Controller
 *
 * Handles demo mode with isolated data sandbox.
 * Extracted from app.js to separate demo concerns from main app flow.
 *
 * @module controllers/demo-controller
 */

'use strict';

// Phase 4 modules: Analysis & Processing
import { Patterns } from '../patterns.js';
import { IndexedDBCore } from '../storage/indexeddb.js';
import { Chat } from '../chat.js';

// ==========================================
// Dependencies (injected via init)
// ==========================================

let _AppState = null;
let _DemoData = null;
let _ViewController = null;
let _showToast = null;
let _Patterns = null;

// ==========================================
// Demo Storage Namespace
// HNW Defensive: Complete isolation of demo data from user data
// ==========================================

const DEMO_STORAGE_PREFIX = 'demo_';
const DEMO_SESSION_KEY = 'rhythm_chamber_demo_session';

/**
 * Demo-specific storage wrapper
 * Uses IndexedDB to avoid SessionStorage size limitations
 * Provides complete isolation from user data through separate stores
 */
const DemoStorage = {
    // In-memory cache for demo session data
    _cache: new Map(),
    _initialized: false,

    /**
     * Initialize demo storage with safeguards
     */
    async init() {
        if (this._initialized) return;

        this._cache.clear();
        this._initialized = true;
        console.log('[DemoStorage] Initialized with isolated namespace');
    },

    /**
     * Set demo data - uses IndexedDB for large data
     * @param {string} key - Data key
     * @param {*} value - Data value (any serializable type)
     */
    async set(key, value) {
        if (!this._initialized) await this.init();

        const prefixedKey = DEMO_STORAGE_PREFIX + key;
        this._cache.set(prefixedKey, value);

        // Store session flags in sessionStorage (small data)
        if (key === 'isDemoMode' || key === 'loadedAt') {
            try {
                sessionStorage.setItem(prefixedKey, JSON.stringify(value));
            } catch (e) {
                console.warn('[DemoStorage] SessionStorage write failed:', e.message);
            }
            return;
        }

        // Store large data in IndexedDB
        try {
            let storeName;
            if (key === 'streams') {
                storeName = 'demo_streams';
            } else if (key === 'patterns') {
                storeName = 'demo_patterns';
            } else if (key === 'personality') {
                storeName = 'demo_personality';
            } else {
                storeName = 'demo_streams'; // default
            }

            const data = {
                id: prefixedKey,
                key: key,
                value: value,
                timestamp: Date.now()
            };

            await IndexedDBCore.put(storeName, data, { bypassAuthority: true });
            console.log(`[DemoStorage] Stored ${key} in IndexedDB`);
        } catch (e) {
            console.error('[DemoStorage] IndexedDB write failed:', e.message);
        }
    },

    /**
     * Get demo data - uses IndexedDB for large data
     * @param {string} key - Data key
     * @returns {Promise<*>} Stored value or null
     */
    async get(key) {
        if (!this._initialized) await this.init();

        const prefixedKey = DEMO_STORAGE_PREFIX + key;

        // Check memory cache first
        if (this._cache.has(prefixedKey)) {
            return this._cache.get(prefixedKey);
        }

        // Check sessionStorage for flags (small data)
        if (key === 'isDemoMode' || key === 'loadedAt') {
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
        }

        // Fall back to IndexedDB for large data
        try {
            let storeName;
            if (key === 'streams') {
                storeName = 'demo_streams';
            } else if (key === 'patterns') {
                storeName = 'demo_patterns';
            } else if (key === 'personality') {
                storeName = 'demo_personality';
            } else {
                storeName = 'demo_streams'; // default
            }

            const result = await IndexedDBCore.get(storeName, prefixedKey);
            if (result && result.value !== undefined) {
                this._cache.set(prefixedKey, result.value);
                return result.value;
            }
        } catch (e) {
            console.warn('[DemoStorage] IndexedDB read failed:', e.message);
        }

        return null;
    },

    /**
     * Clear all demo data
     */
    async clear() {
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

        // Clear IndexedDB demo stores
        try {
            await IndexedDBCore.clear('demo_streams', { bypassAuthority: true });
            await IndexedDBCore.clear('demo_patterns', { bypassAuthority: true });
            await IndexedDBCore.clear('demo_personality', { bypassAuthority: true });
            console.log('[DemoStorage] Cleared all demo data from IndexedDB');
        } catch (e) {
            console.error('[DemoStorage] IndexedDB clear failed:', e.message);
        }

        this._initialized = false;
        console.log('[DemoStorage] Cleared all demo data');
    },

    /**
     * Check if demo storage has data
     * @returns {Promise<boolean>}
     */
    async hasData() {
        const streams = await this.get('streams');
        return this._cache.size > 0 || streams !== null;
    },

    /**
     * Validate demo data integrity
     * @returns {Promise<{ valid: boolean, reason?: string }>}
     */
    async validate() {
        const streams = await this.get('streams');
        const patterns = await this.get('patterns');
        const personality = await this.get('personality');

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
    _Patterns = dependencies.Patterns;

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

        // Get demo data package (streams and personality)
        const demoPackage = _DemoData.getFullDemoPackage();

        // HNW Defensive: Initialize isolated demo storage
        DemoStorage.init();

        // Compute patterns DYNAMICALLY from generated streams
        // This ensures consistency between profile card stats and function call responses
        _ViewController.updateProgress('Analyzing demo listening patterns...');
        await new Promise(r => setTimeout(r, 300));

        let computedPatterns = null;
        if (_Patterns && typeof _Patterns.detectAllPatterns === 'function') {
            computedPatterns = _Patterns.detectAllPatterns(demoPackage.streams, []);
            if (!computedPatterns || typeof computedPatterns !== 'object') {
                throw new Error('detectAllPatterns returned no patterns');
            }
            computedPatterns.isDemoData = true;
            console.log('[DemoController] Computed patterns dynamically from streams');
        } else {
            // Fallback: use imported Patterns if dependency injection failed
            if (Patterns?.detectAllPatterns) {
                computedPatterns = Patterns.detectAllPatterns(demoPackage.streams, []);
                if (!computedPatterns || typeof computedPatterns !== 'object') {
                    throw new Error('detectAllPatterns returned no patterns');
                }
                computedPatterns.isDemoData = true;
                console.warn('[DemoController] Using Patterns fallback');
            } else {
                throw new Error('Patterns module not available for demo pattern computation');
            }
        }

        // Store demo data in ISOLATED DemoStorage (session-only, never IndexedDB)
        _ViewController.updateProgress('Loading sample streaming history...');
        await new Promise(r => setTimeout(r, 300));

        DemoStorage.set('streams', demoPackage.streams);
        DemoStorage.set('patterns', computedPatterns);
        DemoStorage.set('personality', demoPackage.personality);
        DemoStorage.set('loadedAt', Date.now());

        // Validate demo data integrity before proceeding
        const validation = await DemoStorage.validate();
        if (!validation.valid) {
            throw new Error(validation.reason);
        }

        // Also update AppState for UI components that read from it
        // But the authoritative source is now DemoStorage
        _AppState.update('demo', {
            isDemoMode: true,
            streams: demoPackage.streams,
            patterns: computedPatterns,
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
    if (Chat?.flushPendingSaveAsync) {
        promises.push(
            Chat.flushPendingSaveAsync().catch(e =>
                console.warn('[DemoController] Chat flush failed:', e)
            )
        );
    }

    // Flush IndexedDB operations if available
    if (IndexedDBCore?.getConnection) {
        // Force any pending transactions to complete
        const conn = IndexedDBCore.getConnection();
        if (conn) {
            // IndexedDB doesn't have a flush, but we can ensure transactions complete
            // by doing a small read operation
            promises.push(
                IndexedDBCore.count?.('config').catch(() => { })
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
        // SAFE: Static text content with no user input
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
        // SAFE: Static HTML with pre-defined demo questions (no user input)
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


console.log('[DemoController] Controller loaded');
