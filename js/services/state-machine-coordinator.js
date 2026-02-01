/**
 * State Machine Coordinator
 *
 * Centralizes cross-controller state transitions. Controllers request
 * state changes through a unified API, and the coordinator validates
 * and broadcasts changes.
 *
 * HNW Hierarchy: Provides single source of truth for application state,
 * preventing conflicting state changes from multiple controllers.
 *
 * @module services/state-machine-coordinator
 */

// ==========================================
// State Definitions
// ==========================================

/**
 * Application modes
 */
const MODES = {
    IDLE: 'idle',
    DEMO: 'demo',
    REAL: 'real',
};

/**
 * Upload states
 */
const UPLOAD_STATES = {
    IDLE: 'idle',
    PROCESSING: 'processing',
    COMPLETE: 'complete',
    ERROR: 'error',
};

/**
 * Chat states
 */
const CHAT_STATES = {
    DISABLED: 'disabled',
    ENABLED: 'enabled',
    BUSY: 'busy',
};

/**
 * Spotify auth states
 */
const SPOTIFY_STATES = {
    IDLE: 'idle',
    AUTHENTICATING: 'authenticating',
    AUTHENTICATED: 'authenticated',
    ERROR: 'error',
};

/**
 * All possible events
 */
const EVENTS = {
    // Demo mode
    DEMO_ENTER: 'demo_enter',
    DEMO_EXIT: 'demo_exit',

    // Upload
    UPLOAD_START: 'upload_start',
    UPLOAD_COMPLETE: 'upload_complete',
    UPLOAD_ERROR: 'upload_error',

    // Chat
    CHAT_ENABLE: 'chat_enable',
    CHAT_DISABLE: 'chat_disable',
    CHAT_BUSY: 'chat_busy',
    CHAT_IDLE: 'chat_idle',

    // Spotify
    SPOTIFY_AUTH_START: 'spotify_auth_start',
    SPOTIFY_AUTH_COMPLETE: 'spotify_auth_complete',
    SPOTIFY_AUTH_ERROR: 'spotify_auth_error',
    SPOTIFY_LOGOUT: 'spotify_logout',

    // Reset
    RESET: 'reset',
};

// ==========================================
// State Machine
// ==========================================

/**
 * Current application state
 */
let currentState = {
    mode: MODES.IDLE,
    upload: UPLOAD_STATES.IDLE,
    chat: CHAT_STATES.DISABLED,
    spotify: SPOTIFY_STATES.IDLE,
    lastTransition: null,
    transitionHistory: [],
};

/**
 * State subscribers
 */
const subscribers = [];

/**
 * Transition rules: which events are valid from which states
 */
const TRANSITION_RULES = {
    [EVENTS.DEMO_ENTER]: {
        validFrom: { mode: [MODES.IDLE] },
        newState: { mode: MODES.DEMO },
    },
    [EVENTS.DEMO_EXIT]: {
        validFrom: { mode: [MODES.DEMO] },
        newState: { mode: MODES.IDLE },
    },
    [EVENTS.UPLOAD_START]: {
        validFrom: { upload: [UPLOAD_STATES.IDLE, UPLOAD_STATES.COMPLETE, UPLOAD_STATES.ERROR] },
        newState: { upload: UPLOAD_STATES.PROCESSING },
    },
    [EVENTS.UPLOAD_COMPLETE]: {
        validFrom: { upload: [UPLOAD_STATES.PROCESSING] },
        newState: { upload: UPLOAD_STATES.COMPLETE, mode: MODES.REAL },
    },
    [EVENTS.UPLOAD_ERROR]: {
        validFrom: { upload: [UPLOAD_STATES.PROCESSING] },
        newState: { upload: UPLOAD_STATES.ERROR },
    },
    [EVENTS.CHAT_ENABLE]: {
        validFrom: { chat: [CHAT_STATES.DISABLED] },
        newState: { chat: CHAT_STATES.ENABLED },
    },
    [EVENTS.CHAT_DISABLE]: {
        validFrom: { chat: [CHAT_STATES.ENABLED, CHAT_STATES.BUSY] },
        newState: { chat: CHAT_STATES.DISABLED },
    },
    [EVENTS.CHAT_BUSY]: {
        validFrom: { chat: [CHAT_STATES.ENABLED] },
        newState: { chat: CHAT_STATES.BUSY },
    },
    [EVENTS.CHAT_IDLE]: {
        validFrom: { chat: [CHAT_STATES.BUSY] },
        newState: { chat: CHAT_STATES.ENABLED },
    },
    [EVENTS.SPOTIFY_AUTH_START]: {
        validFrom: { spotify: [SPOTIFY_STATES.IDLE, SPOTIFY_STATES.ERROR] },
        newState: { spotify: SPOTIFY_STATES.AUTHENTICATING },
    },
    [EVENTS.SPOTIFY_AUTH_COMPLETE]: {
        validFrom: { spotify: [SPOTIFY_STATES.AUTHENTICATING] },
        newState: { spotify: SPOTIFY_STATES.AUTHENTICATED },
    },
    [EVENTS.SPOTIFY_AUTH_ERROR]: {
        validFrom: { spotify: [SPOTIFY_STATES.AUTHENTICATING] },
        newState: { spotify: SPOTIFY_STATES.ERROR },
    },
    [EVENTS.SPOTIFY_LOGOUT]: {
        validFrom: { spotify: [SPOTIFY_STATES.AUTHENTICATED] },
        newState: { spotify: SPOTIFY_STATES.IDLE },
    },
    [EVENTS.RESET]: {
        validFrom: {}, // Always valid
        newState: {
            mode: MODES.IDLE,
            upload: UPLOAD_STATES.IDLE,
            chat: CHAT_STATES.DISABLED,
            spotify: SPOTIFY_STATES.IDLE,
            transitionHistory: [], // Clear history on reset
        },
    },
};

// ==========================================
// Core Functions
// ==========================================

/**
 * Request a state transition
 *
 * @param {string} event - Event to trigger
 * @param {Object} [metadata] - Additional context for the transition
 * @returns {{
 *   allowed: boolean,
 *   previousState: Object,
 *   newState: Object,
 *   reason?: string
 * }}
 */
function request(event, metadata = {}) {
    const rule = TRANSITION_RULES[event];

    if (!rule) {
        return {
            allowed: false,
            previousState: { ...currentState },
            newState: { ...currentState },
            reason: `Unknown event: ${event}`,
        };
    }

    // Check if transition is valid from current state
    const validationResult = validateTransition(event, rule);

    if (!validationResult.valid) {
        console.warn(`[StateMachine] Rejected event ${event}: ${validationResult.reason}`);
        return {
            allowed: false,
            previousState: { ...currentState },
            newState: { ...currentState },
            reason: validationResult.reason,
        };
    }

    // Capture previous state
    const previousState = { ...currentState };

    // Apply new state
    currentState = {
        ...currentState,
        ...rule.newState,
        lastTransition: {
            event,
            timestamp: Date.now(),
            metadata,
        },
    };

    // Track history (keep last 20 transitions)
    currentState.transitionHistory = [
        ...previousState.transitionHistory.slice(-19),
        currentState.lastTransition,
    ];

    console.log(
        `[StateMachine] Transition ${event}: ${JSON.stringify(previousState)} → ${JSON.stringify(currentState)}`
    );

    // CRITICAL: Create return snapshot BEFORE notifying subscribers
    // This prevents race conditions where subscribers might modify state
    // before the return value is fully constructed
    const returnSnapshot = {
        allowed: true,
        previousState,
        newState: { ...currentState },
        reason: 'Transition successful',
    };

    // Notify subscribers AFTER return value is fully constructed
    notifySubscribers(event, previousState, currentState, metadata);

    return returnSnapshot;
}

/**
 * Validate if a transition is allowed
 *
 * @param {string} event - Event to validate
 * @param {Object} rule - Transition rule
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateTransition(event, rule) {
    const { validFrom } = rule;

    // Empty validFrom means always valid (like RESET)
    if (Object.keys(validFrom).length === 0) {
        return { valid: true };
    }

    // Check each state requirement
    for (const [stateKey, validValues] of Object.entries(validFrom)) {
        const currentValue = currentState[stateKey];

        if (!validValues.includes(currentValue)) {
            return {
                valid: false,
                reason: `Invalid ${stateKey} state: ${currentValue}, expected one of: ${validValues.join(', ')}`,
            };
        }
    }

    return { valid: true };
}

/**
 * Get current state
 *
 * @returns {Object}
 */
function getState() {
    return { ...currentState };
}

/**
 * Check if a specific state matches
 *
 * @param {Object} query - State to check (partial match)
 * @returns {boolean}
 */
function is(query) {
    for (const [key, value] of Object.entries(query)) {
        if (currentState[key] !== value) {
            return false;
        }
    }
    return true;
}

/**
 * Subscribe to state changes
 *
 * @param {function(string, Object, Object, Object): void} callback - (event, previousState, newState, metadata)
 * @returns {function(): void} Unsubscribe function
 */
function subscribe(callback) {
    subscribers.push(callback);

    return () => {
        const index = subscribers.indexOf(callback);
        if (index > -1) {
            subscribers.splice(index, 1);
        }
    };
}

/**
 * Notify all subscribers of state change
 *
 * @param {string} event - Event that triggered the change
 * @param {Object} previousState - State before transition
 * @param {Object} newState - State after transition
 * @param {Object} metadata - Additional context
 */
function notifySubscribers(event, previousState, newState, metadata) {
    const snapshot = [...subscribers];

    for (const subscriber of snapshot) {
        try {
            subscriber(event, previousState, newState, metadata);
        } catch (err) {
            console.error('[StateMachine] Subscriber error:', err);
        }
    }
}

/**
 * Get transition history
 *
 * @returns {Array}
 */
function getHistory() {
    return [...currentState.transitionHistory];
}

/**
 * Check if an event would be valid (without executing)
 *
 * @param {string} event - Event to check
 * @returns {boolean}
 */
function canRequest(event) {
    const rule = TRANSITION_RULES[event];
    if (!rule) return false;

    return validateTransition(event, rule).valid;
}

/**
 * Force set state (for recovery/testing only)
 *
 * @param {Object} newState - State to set
 */
function forceState(newState) {
    console.warn('[StateMachine] Force setting state - use with caution');
    currentState = {
        ...currentState,
        ...newState,
        lastTransition: {
            event: 'FORCE_SET',
            timestamp: Date.now(),
            metadata: { forced: true },
        },
    };
}

/**
 * Reset to initial state
 */
function reset() {
    return request(EVENTS.RESET);
}

// ==========================================
// Public API
// ==========================================

const StateMachine = {
    // Core operations
    request,
    getState,
    is,
    canRequest,

    // Subscription
    subscribe,

    // History
    getHistory,

    // Recovery
    forceState,
    reset,

    // Constants
    MODES,
    UPLOAD_STATES,
    CHAT_STATES,
    SPOTIFY_STATES,
    EVENTS,
};

// ES Module export
export { StateMachine };

console.log('[StateMachine] State Machine Coordinator loaded');
