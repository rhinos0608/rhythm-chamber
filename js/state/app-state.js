/**
 * AppState - Centralized State Management
 * 
 * HNW-Based Design:
 * - Hierarchy: Single source of truth, explicit mutation authority
 * - Network: Subscribe pattern for loose coupling, frozen immutable state
 * - Wave: Batched async updates, predictable notification timing
 * 
 * @module AppState
 */

// ==========================================
// State Shape Definition
// ==========================================

const INITIAL_STATE = {
    // View state - current screen/stage
    view: {
        current: 'upload',  // 'upload' | 'processing' | 'reveal' | 'lite-reveal' | 'chat'
        previous: null
    },

    // Data state - processed music data
    data: {
        streams: null,      // Raw listening history
        chunks: null,       // Aggregated chunks
        patterns: null,     // Detected patterns
        personality: null,  // Classified personality
        dataHash: null      // For staleness detection
    },

    // Lite mode state - Spotify API quick snapshot
    lite: {
        isLiteMode: false,
        liteData: null,
        litePatterns: null
    },

    // UI state - visual/interaction state
    ui: {
        sidebarCollapsed: false,
        currentSessionId: null
    },

    // Operations state - background processing
    operations: {
        isProcessing: false,
        processingProgress: 0,
        processingMessage: '',
        error: null
    },

    // Demo mode state - sandboxed sample data
    // HNW: Complete isolation from main data domain to prevent cross-contamination
    demo: {
        isDemoMode: false,
        // Demo data lives here, NOT in the main 'data' domain
        streams: null,
        patterns: null,
        personality: null
    }
};

// Valid domain names for update validation
const VALID_DOMAINS = Object.keys(INITIAL_STATE);

// ==========================================
// Core State Management
// ==========================================

let _state = null;
let _subscribers = new Set();
let _pendingNotification = false;
let _debugMode = false;
let _changedDomains = new Set();

/**
 * Deep freeze an object to prevent mutations
 * HNW Hierarchy: Enforces immutability at runtime
 */
function deepFreeze(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    Object.keys(obj).forEach(key => {
        const value = obj[key];
        if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
            deepFreeze(value);
        }
    });

    return Object.freeze(obj);
}

/**
 * Deep clone an object for safe modification
 */
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => deepClone(item));
    }
    const clone = {};
    Object.keys(obj).forEach(key => {
        clone[key] = deepClone(obj[key]);
    });
    return clone;
}

/**
 * Merge changes into a domain (shallow merge at domain level)
 */
function mergeDomain(currentDomain, changes) {
    if (currentDomain === null || typeof currentDomain !== 'object') {
        return changes;
    }
    return { ...currentDomain, ...changes };
}

/**
 * Schedule async notification to subscribers
 * HNW Wave: Batched updates prevent reentrancy issues
 */
function scheduleNotification() {
    if (_pendingNotification) return;

    _pendingNotification = true;

    // Use queueMicrotask for predictable timing (after current sync code, before next event)
    queueMicrotask(() => {
        _pendingNotification = false;
        const changedArray = Array.from(_changedDomains);
        _changedDomains.clear();

        // Notify all subscribers with frozen state and changed domains
        const frozenState = deepFreeze(deepClone(_state));
        _subscribers.forEach(callback => {
            try {
                callback(frozenState, changedArray);
            } catch (err) {
                console.error('[AppState] Subscriber error:', err);
            }
        });
    });
}

// ==========================================
// Public API
// ==========================================

const AppState = {
    /**
     * Initialize state with optional initial values
     * @param {Object} initialOverrides - Override default initial values
     * @returns {Object} Frozen initial state
     */
    init(initialOverrides = {}) {
        // Create fresh state from defaults
        _state = deepClone(INITIAL_STATE);

        // Apply any overrides (for migration/testing)
        Object.keys(initialOverrides).forEach(domain => {
            if (VALID_DOMAINS.includes(domain)) {
                _state[domain] = mergeDomain(_state[domain], initialOverrides[domain]);
            }
        });

        if (_debugMode) {
            console.log('[AppState] Initialized:', deepClone(_state));
        }

        return this.get();
    },

    /**
     * Get current state (frozen snapshot)
     * HNW Hierarchy: Read-only access prevents unauthorized mutation
     * @param {string} [domain] - Optional domain to get subset
     * @returns {Object} Frozen state or domain
     */
    get(domain = null) {
        if (!_state) {
            console.warn('[AppState] State not initialized, returning defaults');
            return deepFreeze(deepClone(INITIAL_STATE));
        }

        if (domain) {
            if (!VALID_DOMAINS.includes(domain)) {
                console.error(`[AppState] Unknown domain: ${domain}`);
                return null;
            }
            return deepFreeze(deepClone(_state[domain]));
        }

        return deepFreeze(deepClone(_state));
    },

    /**
     * Update a state domain
     * HNW Hierarchy: Single mutation point with domain validation
     * @param {string} domain - Domain to update (view, data, lite, ui, operations)
     * @param {Object} changes - Properties to merge into domain
     * @returns {Object} New frozen state
     */
    update(domain, changes) {
        if (!_state) {
            console.error('[AppState] Cannot update: state not initialized');
            return null;
        }

        if (!VALID_DOMAINS.includes(domain)) {
            console.error(`[AppState] Unknown domain: ${domain}. Valid domains: ${VALID_DOMAINS.join(', ')}`);
            return this.get();
        }

        if (typeof changes !== 'object' || changes === null) {
            console.error('[AppState] Changes must be an object');
            return this.get();
        }

        // Create new state with merged domain
        const newDomain = mergeDomain(_state[domain], changes);
        _state = { ..._state, [domain]: newDomain };

        // Track changed domain for subscriber notification
        _changedDomains.add(domain);

        if (_debugMode) {
            console.log(`[AppState] update('${domain}',`, changes, ')');
            console.log('[AppState] New state:', deepClone(_state));
        }

        // Schedule async notification
        scheduleNotification();

        return this.get();
    },

    /**
     * Subscribe to state changes
     * HNW Network: Loose coupling through pub/sub pattern
     * @param {Function} callback - Called with (state, changedDomains[])
     * @returns {Function} Unsubscribe function
     */
    subscribe(callback) {
        if (typeof callback !== 'function') {
            console.error('[AppState] Subscribe callback must be a function');
            return () => { };
        }

        _subscribers.add(callback);

        if (_debugMode) {
            console.log(`[AppState] New subscriber (total: ${_subscribers.size})`);
        }

        // Return unsubscribe function
        return () => {
            _subscribers.delete(callback);
            if (_debugMode) {
                console.log(`[AppState] Unsubscribed (remaining: ${_subscribers.size})`);
            }
        };
    },

    // ==========================================
    // Domain Helpers (Type-safe shortcuts)
    // ==========================================

    /**
     * Set current view
     * @param {string} viewName - View to transition to
     */
    setView(viewName) {
        const current = _state?.view?.current;
        return this.update('view', {
            current: viewName,
            previous: current
        });
    },

    /**
     * Set personality data
     * @param {Object} personality - Personality classification result
     */
    setPersonality(personality) {
        return this.update('data', { personality });
    },

    /**
     * Set streams data with hash calculation
     * @param {Array} streams - Raw listening history
     */
    setStreams(streams) {
        // Calculate simple hash for staleness detection
        const dataHash = streams ? `${streams.length}-${Date.now()}` : null;
        return this.update('data', { streams, dataHash });
    },

    /**
     * Set chunks data
     * @param {Array} chunks - Aggregated chunks
     */
    setChunks(chunks) {
        return this.update('data', { chunks });
    },

    /**
     * Set patterns data
     * @param {Object} patterns - Detected patterns
     */
    setPatterns(patterns) {
        return this.update('data', { patterns });
    },

    /**
     * Set processing state
     * @param {boolean} isProcessing - Whether processing is active
     * @param {string} [message] - Optional progress message
     * @param {number} [progress] - Optional progress percentage (0-100)
     */
    setProcessing(isProcessing, message = '', progress = 0) {
        return this.update('operations', {
            isProcessing,
            processingMessage: message,
            processingProgress: progress,
            error: isProcessing ? null : _state?.operations?.error // Clear error when starting
        });
    },

    /**
     * Set error state
     * @param {Error|string|null} error - Error to set or null to clear
     */
    setError(error) {
        return this.update('operations', {
            error: error ? (error.message || String(error)) : null
        });
    },

    /**
     * Set lite mode data
     * @param {Object} liteData - Spotify API data
     * @param {Object} litePatterns - Patterns from lite data
     */
    setLiteMode(liteData, litePatterns) {
        return this.update('lite', {
            isLiteMode: true,
            liteData,
            litePatterns
        });
    },

    /**
     * Set sidebar collapsed state
     * @param {boolean} collapsed - Whether sidebar is collapsed
     */
    setSidebarCollapsed(collapsed) {
        return this.update('ui', { sidebarCollapsed: collapsed });
    },

    /**
     * Get active data (demo or real) transparently
     * HNW: Components use this to access data without knowing if demo mode is active
     * @returns {{ streams: Array, patterns: Object, personality: Object, isDemoMode: boolean }}
     */
    getActiveData() {
        if (!_state) return { streams: null, patterns: null, personality: null, isDemoMode: false };

        const isDemoMode = _state.demo?.isDemoMode || false;

        if (isDemoMode) {
            return {
                streams: _state.demo.streams,
                patterns: _state.demo.patterns,
                personality: _state.demo.personality,
                isDemoMode: true
            };
        }

        return {
            streams: _state.data.streams,
            patterns: _state.data.patterns,
            personality: _state.data.personality,
            isDemoMode: false
        };
    },

    /**
     * Reset state to initial values
     * Preserves UI preferences (sidebar state)
     */
    reset() {
        const preservedUI = _state?.ui || {};
        _state = deepClone(INITIAL_STATE);
        _state.ui = { ...INITIAL_STATE.ui, ...preservedUI };

        // Notify all domains changed
        VALID_DOMAINS.forEach(d => _changedDomains.add(d));
        scheduleNotification();

        if (_debugMode) {
            console.log('[AppState] Reset to initial state');
        }

        return this.get();
    },

    // ==========================================
    // Debug Helpers
    // ==========================================

    /**
     * Enable debug logging
     */
    enableDebug() {
        _debugMode = true;
        console.log('[AppState] Debug mode enabled');
    },

    /**
     * Disable debug logging
     */
    disableDebug() {
        _debugMode = false;
    },

    /**
     * Get subscriber count (for testing)
     */
    getSubscriberCount() {
        return _subscribers.size;
    }
};

// ==========================================
// Export
// ==========================================

window.AppState = AppState;
