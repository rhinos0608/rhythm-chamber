/**
 * Lamport Clock
 * 
 * Logical clock implementation for distributed systems.
 * Eliminates clock skew issues in cross-tab leader election.
 * 
 * HNW Network: Provides happened-before ordering guarantees
 * across tabs without relying on wall-clock time.
 * 
 * @module services/lamport-clock
 */

// ==========================================
// State
// ==========================================

/** @type {number} */
let counter = 0;

/** @type {string} */
let localId = '';

// ==========================================
// Core Functions
// ==========================================

/**
 * Initialize the clock with a local identifier
 * @param {string} [id] - Local identifier (auto-generated if not provided)
 */
function init(id = null) {
    counter = 0;
    localId = id || crypto.randomUUID();
    console.log(`[LamportClock] Initialized with id: ${localId.substring(0, 8)}...`);
}

/**
 * Increment and return the current timestamp
 * @returns {number}
 */
function tick() {
    return ++counter;
}

/**
 * Update clock based on received timestamp
 * Implements Lamport's rule: counter = max(local, received) + 1
 * @param {number} receivedTimestamp - Timestamp from another process
 * @returns {number} Updated local timestamp
 */
function update(receivedTimestamp) {
    // Input validation: ensure receivedTimestamp is a finite numeric value
    if (!Number.isFinite(receivedTimestamp)) {
        throw new TypeError(`LamportClock.update() received invalid timestamp: ${receivedTimestamp}. Expected a finite number.`);
    }
    counter = Math.max(counter, receivedTimestamp) + 1;
    return counter;
}

/**
 * Get current timestamp without incrementing
 * @returns {number}
 */
function current() {
    return counter;
}

/**
 * Get local identifier
 * @returns {string}
 */
function getId() {
    return localId;
}

/**
 * Create a timestamped message
 * @param {Object} data - Message data
 * @returns {Object} Message with timestamp and id
 */
function stamp(data) {
    return {
        ...data,
        lamportTimestamp: tick(),
        senderId: localId
    };
}

/**
 * Process a received message and update clock
 * @param {Object} message - Received message with lamportTimestamp
 * @returns {number} Updated local timestamp
 */
function receive(message) {
    if (typeof message?.lamportTimestamp === 'number') {
        return update(message.lamportTimestamp);
    }
    return tick(); // No timestamp, just increment
}

/**
 * Compare two timestamped messages
 * Returns negative if a < b, positive if a > b, zero if equal
 * 
 * @param {Object} a - First message with lamportTimestamp and senderId
 * @param {Object} b - Second message with lamportTimestamp and senderId
 * @returns {number}
 */
function compare(a, b) {
    // First compare timestamps
    const timestampDiff = (a.lamportTimestamp || 0) - (b.lamportTimestamp || 0);
    if (timestampDiff !== 0) {
        return timestampDiff;
    }

    // Tie-breaker: lexicographic comparison of sender IDs
    const idA = a.senderId || a.tabId || '';
    const idB = b.senderId || b.tabId || '';
    return idA.localeCompare(idB);
}

/**
 * Determine if message a happened-before message b
 * @param {Object} a - First message
 * @param {Object} b - Second message
 * @returns {boolean}
 */
function happenedBefore(a, b) {
    return compare(a, b) < 0;
}

/**
 * Sort an array of timestamped messages
 * @param {Array<Object>} messages - Messages to sort
 * @returns {Array<Object>} Sorted messages (mutates original)
 */
function sort(messages) {
    return messages.sort(compare);
}

/**
 * Get the minimum (earliest) message from an array
 * @param {Array<Object>} messages - Messages to compare
 * @returns {Object|null}
 */
function min(messages) {
    if (!messages || messages.length === 0) return null;
    return messages.reduce((earliest, current) => {
        return compare(current, earliest) < 0 ? current : earliest;
    });
}

/**
 * Get clock status for debugging
 * @returns {Object}
 */
function getStatus() {
    return {
        counter,
        localId: localId.substring(0, 8) + '...',
        fullId: localId
    };
}

/**
 * Reset clock (for testing)
 */
function reset() {
    counter = 0;
    localId = '';
}

// ==========================================
// Public API
// ==========================================

export const LamportClock = {
    // Lifecycle
    init,
    reset,

    // Core operations
    tick,
    update,
    current,
    getId,

    // Message utilities
    stamp,
    receive,

    // Comparison
    compare,
    happenedBefore,
    sort,
    min,

    // Diagnostics
    getStatus
};


console.log('[LamportClock] Logical clock loaded');
