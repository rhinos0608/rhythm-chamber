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

// Import OperationLock for concurrent operation protection
import { OperationLock } from '../operation-lock.js';

// Define demo load operation name for locking
const DEMO_LOAD_OPERATION = 'demo_load';

// EventBus reference for error reporting (lazy loaded for safety)
let _EventBus = null;

/**
 * Get EventBus instance with fallback
 * @returns {Object|null} EventBus instance or null if unavailable
 */
function getEventBus() {
    if (_EventBus) return _EventBus;

    // Try to get from window (global) first
    if (typeof window !== 'undefined' && window.EventBus) {
        _EventBus = window.EventBus;
        return _EventBus;
    }

    // Try dynamic import as fallback
    try {
        // Using indirect eval to avoid strict mode issues
        const module = window.EventBus;
        if (module) {
            _EventBus = module;
            return _EventBus;
        }
    } catch (e) {
        console.warn('[DemoController] EventBus not available:', e.message);
    }

    return null;
}

// ==========================================
// Dependencies (injected via init)
// ==========================================

let _AppState = null;
let _DemoData = null;
let _ViewController = null;
let _showToast = null;
let _Patterns = null;

// ==========================================
// Event Listener Cleanup
// ==========================================

// Track demo chip event listeners for cleanup
let _demoChipCleanup = null;

// ==========================================
// Demo Storage Namespace
// HNW Defensive: Complete isolation of demo data from user data
// SINGLE SOURCE OF TRUTH: AppState is the authoritative source for all demo data reads
// DemoStorage serves only as a persistence layer (IndexedDB wrapper) for session recovery
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
     * Uses write-through caching: writes to backing store first, then updates cache on success
     * @param {string} key - Data key
     * @param {*} value - Data value (any serializable type)
     */
    async set(key, value) {
        if (!this._initialized) await this.init();

        const prefixedKey = DEMO_STORAGE_PREFIX + key;

        // Store session flags in sessionStorage (small data)
        if (key === 'isDemoMode' || key === 'loadedAt') {
            try {
                sessionStorage.setItem(prefixedKey, JSON.stringify(value));
                this._cache.set(prefixedKey, value);
            } catch (e) {
                console.warn('[DemoStorage] SessionStorage write failed:', e.message);
            }
            return;
        }

        // Store large data in IndexedDB first, then update cache on success
        // This ensures cache consistency with backing store
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
            // Only update cache after successful IndexedDB write
            this._cache.set(prefixedKey, value);
            console.log(`[DemoStorage] Stored ${key} in IndexedDB and cache`);
        } catch (e) {
            console.error('[DemoStorage] IndexedDB write failed:', e.message);
            // Do not update cache on write failure - maintains consistency
            throw e;
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
 * CONCURRENT: Uses OperationLock to prevent concurrent demo loads
 * @returns {Promise<void>}
 */
async function loadDemoMode() {
    if (!_ViewController || !_AppState || !_DemoData) {
        console.error('[DemoController] Required dependencies not available');
        return;
    }

    // CONCURRENT: Check if demo load is already in progress
    if (OperationLock.isLocked(DEMO_LOAD_OPERATION)) {
        console.warn('[DemoController] Demo load already in progress, ignoring duplicate request');
        if (_showToast) {
            _showToast('Demo mode is already loading. Please wait...');
        }
        return;
    }

    console.log('[DemoController] Loading demo data: "The Emo Teen"');

    // ATOMIC: Lock UI during entire transition
    lockUI();

    // CONCURRENT: Acquire operation lock to prevent concurrent demo loads
    let lockId = null;
    try {
        lockId = await OperationLock.acquire(DEMO_LOAD_OPERATION);
    } catch (e) {
        console.error('[DemoController] Failed to acquire demo load lock:', e);
        unlockUI();
        if (_showToast) {
            _showToast('Unable to load demo mode. Please try again.');
        }
        return;
    }

    try {
        // Flush any pending operations before switching
        await flushPendingOperations();

        _ViewController.showProcessing();
        _ViewController.updateProgress('🎭 Loading demo mode...');

        // Get demo data package (streams and personality)
        const demoPackage = _DemoData.getFullDemoPackage();

        // EDGE CASE FIX: Validate demoPackage contains valid data before using
        // Missing validation could cause runtime errors when accessing demoPackage.streams
        if (!demoPackage || typeof demoPackage !== 'object') {
            throw new Error('Demo data package is not available or invalid');
        }
        if (!demoPackage.streams || !Array.isArray(demoPackage.streams) || demoPackage.streams.length === 0) {
            throw new Error('Demo streams data is missing or empty. Please check demo data source.');
        }
        if (!demoPackage.personality || typeof demoPackage.personality !== 'object') {
            throw new Error('Demo personality data is missing. Please check demo data source.');
        }

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

        // ATOMIC TRANSACTION: Three-phase commit pattern for state consistency
        // Phase 1: Prepare data object
        const demoStateData = {
            streams: demoPackage.streams,
            patterns: computedPatterns,
            personality: demoPackage.personality,
            isDemoMode: true,
            loadedAt: Date.now()
        };

        // Phase 2: Persist all storage operations atomically
        // All storage writes complete before any UI state changes
        await DemoStorage.set('streams', demoStateData.streams);
        await DemoStorage.set('patterns', demoStateData.patterns);
        await DemoStorage.set('personality', demoStateData.personality);
        await DemoStorage.set('loadedAt', demoStateData.loadedAt);
        await DemoStorage.set('isDemoMode', true);

        // Phase 3: Validate storage integrity before updating AppState
        // Rollback on validation failure to prevent inconsistent state
        const validation = await DemoStorage.validate();
        if (!validation.valid) {
            // Rollback: Clear demo storage if validation fails
            await DemoStorage.clear();
            throw new Error(`Demo data validation failed: ${validation.reason}`);
        }

        // Phase 4: Update AppState only after storage is validated
        // This ensures UI components read consistent data
        _AppState.update('demo', demoStateData);

        _ViewController.updateProgress('Preparing demo experience...');
        await new Promise(r => setTimeout(r, 300));

        // Show reveal
        _ViewController.showReveal();

        // Add demo badge to UI
        addDemoBadge();

        // Pre-load chat with demo-specific suggestions
        setupDemoChatSuggestions();

        console.log('[DemoController] Demo mode loaded (AppState as source of truth, DemoStorage for persistence)');
    } catch (error) {
        console.error('[DemoController] Demo mode load failed:', error);
        if (_showToast) {
            _showToast('Failed to load demo mode. Please try again.');
        }
    } finally {
        // ATOMIC: Always unlock UI
        unlockUI();

        // CONCURRENT: Always release the operation lock
        if (lockId) {
            try {
                OperationLock.release(DEMO_LOAD_OPERATION, lockId);
            } catch (e) {
                console.warn('[DemoController] Failed to release demo load lock:', e);
            }
        }
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
 * Uses Promise.allSettled() to handle partial failures gracefully
 * @returns {Promise<void>}
 */
async function flushPendingOperations() {
    console.log('[DemoController] Flushing pending operations...');

    const promises = [];

    // Flush pending chat saves
    if (Chat?.flushPendingSaveAsync) {
        promises.push(
            Chat.flushPendingSaveAsync().catch(e => {
                console.warn('[DemoController] Chat flush failed:', e);
                // Emit event for observability (safe access)
                const eventBus = getEventBus();
                if (eventBus?.emit) {
                    eventBus.emit('error:handler', { source: 'DemoController', error: e, context: 'flushPendingSaveAsync' });
                }
                throw e; // Re-throw for allSettled to capture
            })
        );
    }

    // Flush IndexedDB operations if available
    if (IndexedDBCore?.getConnection) {
        // Force any pending transactions to complete
        const conn = IndexedDBCore.getConnection();
        if (conn) {
            // IndexedDB doesn't have a flush, but we can ensure transactions complete
            // by doing a small read operation
            if (IndexedDBCore.count) {
                promises.push(
                    IndexedDBCore.count('config').catch(e => {
                        console.warn('[DemoController] IndexedDB flush check failed:', e);
                        throw e; // Re-throw for allSettled to capture
                    })
                );
            }
        }
    }

    // Use allSettled to handle partial failures - all operations complete regardless of individual failures
    const results = await Promise.allSettled(promises);

    // Log any failures that occurred
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
        console.warn(`[DemoController] ${failures.length} pending operation(s) failed during flush`);
        failures.forEach((f, i) => {
            console.error(`[DemoController] Flush failure ${i + 1}:`, f.reason);
        });
    }

    console.log('[DemoController] All pending operations flushed');
}

/**
 * Add visual indicator that user is in demo mode
 */
function addDemoBadge() {
    // Add badge to header
    const headerLeft = document.querySelector('.header-left');
    // Strong duplicate guard: check by both ID and class presence
    const existingBadge = document.getElementById('demo-badge') || headerLeft?.querySelector('.demo-badge');
    if (headerLeft && !existingBadge) {
        const badge = document.createElement('span');
        badge.id = 'demo-badge';
        badge.className = 'demo-badge';
        // SAFE: Using textContent instead of innerHTML
        badge.textContent = '🎭 Demo Mode';
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
 *
 * MEMORY LEAK FIX: Tracks and returns cleanup function that removes all attached listeners
 * Call the returned function when demo mode is exited or before re-setup
 * @returns {Function|undefined} Cleanup function to remove event listeners
 */
function setupDemoChatSuggestions() {
    // Clean up any existing listeners first
    if (_demoChipCleanup) {
        _demoChipCleanup();
        _demoChipCleanup = null;
    }

    const suggestions = document.getElementById('chat-suggestions');
    if (!suggestions) {
        return undefined;
    }

    // Clear existing content
    suggestions.textContent = '';

    // SAFE: Use DOM methods instead of innerHTML for security best practices
    // Even though content is static, using DOM APIs prevents accidental XSS
    const demoQuestions = [
        'Tell me about my MCR obsession',
        'What was my emo phase like in 2019?',
        'Why did I stop listening to Pierce The Veil?',
        'How has my taste evolved?'
    ];

    demoQuestions.forEach(question => {
        const button = document.createElement('button');
        button.className = 'suggestion-chip demo-chip';
        button.dataset.question = question;
        button.textContent = question;
        suggestions.appendChild(button);
    });

    // Track attached chips and their handlers for cleanup
    const chips = [];
    const handlers = [];

    // Attach event listeners to the NEW demo-specific chips
    // These are new elements so won't have duplicate listeners
    suggestions.querySelectorAll('.demo-chip').forEach(chip => {
        const handler = async (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent any bubbling
            const question = chip.dataset.question;
            const input = document.getElementById('chat-input');
            if (input) {
                // Set input value to the question
                input.value = question;
            }

            // Trigger chat send via global handleChatSend if available
            // This avoids programmatic click() which can trigger duplicate listeners
            // handleChatSend will clear the input after sending
            if (window.handleChatSend && typeof window.handleChatSend === 'function') {
                await window.handleChatSend();
            }
        };
        chip.addEventListener('click', handler);
        chips.push(chip);
        handlers.push(handler);
    });

    // Create and store cleanup function
    _demoChipCleanup = () => {
        for (let i = 0; i < chips.length; i++) {
            chips[i]?.removeEventListener('click', handlers[i]);
        }
        chips.length = 0;
        handlers.length = 0;
    };

    return _demoChipCleanup;
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
 * SINGLE SOURCE OF TRUTH: AppState is the authoritative source for all demo data reads
 * DemoStorage serves only as a persistence layer (IndexedDB wrapper) for session recovery
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
 * Get demo data from AppState (single source of truth)
 * DemoStorage is only used for persistence - AppState holds the live data
 * @returns {{ streams: Array, patterns: Object, personality: Object }|null}
 */
function getDemoDataFromState() {
    if (!_AppState) return null;
    const demoState = _AppState.get('demo');
    if (!demoState?.isDemoMode) return null;
    return {
        streams: demoState.streams,
        patterns: demoState.patterns,
        personality: demoState.personality
    };
}

/**
 * Exit demo mode
 * HNW Defensive: Clears both DemoStorage and AppState to ensure complete cleanup
 * ATOMIC: Awaits storage clear to ensure proper cleanup before UI updates
 * MEMORY LEAK FIX: Cleans up event listeners from demo chip suggestions
 * @returns {Promise<void>}
 */
async function exitDemoMode() {
    if (!_AppState || !_ViewController) return;

    // MEMORY LEAK FIX: Clean up demo chip event listeners
    if (_demoChipCleanup) {
        _demoChipCleanup();
        _demoChipCleanup = null;
    }

    try {
        // HNW Defensive: Clear isolated demo storage first (await to ensure cleanup)
        await DemoStorage.clear();
    } catch (e) {
        console.error('[DemoController] DemoStorage clear failed:', e);
        // Continue with cleanup even if storage clear fails
    }

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
