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
        currentSessionId: null,
        authorityLevel: 'primary',  // 'primary' | 'secondary' for multi-tab coordination
        isReadOnlyMode: false,
        resetButton: {
            visible: false  // Reset button visibility state
        }
    },

    // Operations state - background processing
    operations: {
        isProcessing: false,
        processingProgress: 0,
        processingMessage: '',
        error: null,
        safeMode: false  // Security modules in fallback mode
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

// ==========================================
// Freeze Configuration
// ==========================================

/**
 * Development detection - checks if we're in development mode
 * Uses multiple heuristics for reliability across different environments
 */
const isDevelopment = (() => {
    // Check for explicit NODE_ENV (most reliable in build systems)
    if (typeof process !== 'undefined' && process.env) {
        return process.env.NODE_ENV === 'development';
    }
    // Check for build-time global (common pattern)
    if (typeof __DEV__ !== 'undefined') {
        return __DEV__;
    }
    // Check for common development indicators
    if (typeof window !== 'undefined') {
        // Check localhost URL
        if (window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname === '') {
            return true;
        }
        // Check for devtools
        if (window.__DEVTOOLS__ || window.devTools) {
            return true;
        }
    }
    // Default to production for safety (better to miss dev optimizations than miss prod optimizations)
    return false;
})();

/**
 * Configuration flag controlling deep freeze behavior
 * - Development: Full deep freeze to catch mutations
 * - Production: Selective freeze for performance
 */
const ENABLE_DEEP_FREEZE = isDevelopment;

/**
 * Domains that contain large data structures and should use shallow freeze in production
 */
const LARGE_DATA_DOMAINS = ['data', 'demo'];

/**
 * Shallow freeze - only freezes the top level of an object
 * Much faster than deepFreeze for large structures (arrays with 100k+ items)
 * Still prevents direct property assignment/deletion on the frozen object
 *
 * @param {*} obj - Object to freeze
 * @returns {*} The frozen object (or primitive as-is)
 */
function shallowFreeze(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    return Object.freeze(obj);
}

/**
 * Deep freeze an object to prevent mutations
 * HNW Hierarchy: Enforces immutability at runtime
 *
 * In production: Uses selective strategy - shallow freeze for large data domains
 * In development: Full deep freeze to catch mutations everywhere
 *
 * @param {*} obj - Object to freeze
 * @param {string} [domain] - Optional domain name for selective freezing
 * @returns {*} The frozen object
 */
function deepFreeze(obj, domain = null) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    // In production, use shallow freeze for large data domains
    if (!ENABLE_DEEP_FREEZE && domain && LARGE_DATA_DOMAINS.includes(domain)) {
        return shallowFreeze(obj);
    }

    // Recursively freeze all nested objects
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

        // Clone state, then apply selective freezing based on domain
        const clonedState = deepClone(_state);

        // Freeze each domain with appropriate strategy
        VALID_DOMAINS.forEach(domain => {
            if (clonedState[domain] && typeof clonedState[domain] === 'object') {
                // Pass domain for selective freeze strategy in production
                clonedState[domain] = deepFreeze(clonedState[domain], domain);
            }
        });

        // Freeze the root state object
        const frozenState = Object.freeze(clonedState);

        // FIX Issue #4: Improved subscriber error handling with better logging
        // Each subscriber is isolated - errors in one don't affect others
        // Note: changedArray is immutable and consistent for all subscribers
        let subscriberIndex = 0;
        const totalSubscribers = _subscribers.size;
        const errors = [];

        _subscribers.forEach(callback => {
            subscriberIndex++;
            try {
                // Pass frozen state and changed domains (both immutable)
                callback(frozenState, changedArray);
            } catch (err) {
                // FIX Issue #4: Enhanced error logging with subscriber context
                const errorInfo = {
                    subscriberIndex,
                    totalSubscribers,
                    changedDomains: changedArray,
                    errorMessage: err.message || String(err),
                    errorStack: err.stack
                };
                errors.push(errorInfo);
                console.error('[AppState] Subscriber error:', errorInfo);
                console.error('[AppState] Subscriber error stack:', err);
            }
        });

        // FIX Issue #4: Log summary if any errors occurred
        if (errors.length > 0) {
            console.warn(`[AppState] ${errors.length}/${totalSubscribers} subscriber(s) threw errors during notification for domains: ${changedArray.join(', ')}`);
        }
    });
}

// ==========================================
// Public API
// ==========================================

const AppState = {
    /**
     * Check if state has been initialized
     * HNW Hierarchy: Verification method for initialization status
     * @returns {boolean} True if state is initialized and ready
     */
    isReady() {
        return _state !== null;
    },

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
            const cloned = deepClone(INITIAL_STATE);
            // Freeze each domain selectively
            VALID_DOMAINS.forEach(d => {
                if (cloned[d] && typeof cloned[d] === 'object') {
                    cloned[d] = deepFreeze(cloned[d], d);
                }
            });
            return Object.freeze(cloned);
        }

        if (domain) {
            if (!VALID_DOMAINS.includes(domain)) {
                console.error(`[AppState] Unknown domain: ${domain}`);
                return null;
            }
            // Pass domain for selective freeze strategy
            return deepFreeze(deepClone(_state[domain]), domain);
        }

        // Clone state, then apply selective freezing based on domain
        const clonedState = deepClone(_state);
        VALID_DOMAINS.forEach(d => {
            if (clonedState[d] && typeof clonedState[d] === 'object') {
                clonedState[d] = deepFreeze(clonedState[d], d);
            }
        });
        return Object.freeze(clonedState);
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
     * Set reset button visibility
     * @param {boolean} visible - Whether reset button should be visible
     */
    setResetButton(visible) {
        return this.update('ui', { resetButton: { visible } });
    },

    /**
     * Get active data (demo or real) transparently
     * HNW: Components use this to access data without knowing if demo mode is active
     * CRITICAL FIX for High Issue #11: Returns deep cloned data to prevent state mutation
     *
     * Previous implementation returned direct references to state objects, allowing
     * callers to mutate state through getters. This version deep clones all returned
     * data to ensure immutability.
     *
     * @returns {{ streams: Array, patterns: Object, personality: Object, isDemoMode: boolean }}
     */
    getActiveData() {
        if (!_state) return { streams: null, patterns: null, personality: null, isDemoMode: false };

        const isDemoMode = _state.demo?.isDemoMode || false;

        if (isDemoMode) {
            // CRITICAL FIX: Deep clone to prevent mutation through getter
            return {
                streams: deepClone(_state.demo.streams),
                patterns: deepClone(_state.demo.patterns),
                personality: deepClone(_state.demo.personality),
                isDemoMode: true
            };
        }

        // CRITICAL FIX: Deep clone to prevent mutation through getter
        return {
            streams: deepClone(_state.data.streams),
            patterns: deepClone(_state.data.patterns),
            personality: deepClone(_state.data.personality),
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
    },

    /**
     * Get freeze configuration (for debugging/monitoring)
     * @returns {{ isDevelopment: boolean, deepFreezeEnabled: boolean, largeDataDomains: string[] }}
     */
    getFreezeConfig() {
        return {
            isDevelopment,
            deepFreezeEnabled: ENABLE_DEEP_FREEZE,
            largeDataDomains: [...LARGE_DATA_DOMAINS]
        };
    }
};

// ==========================================
// Export
// ==========================================

// ES Module export
export { AppState, INITIAL_STATE, VALID_DOMAINS };

console.log('[AppState] Centralized state management module loaded');

