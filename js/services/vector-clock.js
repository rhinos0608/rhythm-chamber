/**
 * Vector Clock Module
 * 
 * Provides causal ordering and conflict detection for distributed state
 * across multiple browser tabs or concurrent operations.
 * 
 * HNW Considerations:
 * - Hierarchy: Single source of truth for version ordering
 * - Network: Enables conflict detection across tabs
 * - Wave: Tracks temporal causality of state changes
 * 
 * @module services/vector-clock
 */

'use strict';

// ==========================================
// Vector Clock Implementation
// ==========================================

/**
 * Vector Clock for tracking causal ordering
 * 
 * A vector clock tracks a mapping of process/tab IDs to their logical timestamps.
 * This allows detection of concurrent updates that may require conflict resolution.
 */
export class VectorClock {
    /**
     * Create a new VectorClock
     * @param {string} [processId] - ID of the current process/tab
     */
    constructor(processId = null) {
        this.processId = processId || this.generateProcessId();
        this.clock = {};
    }

    /**
     * Generate a unique process ID
     * @returns {string}
     */
    generateProcessId() {
        return `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Increment the local clock (for local events)
     * @returns {Object} The updated clock state
     */
    tick() {
        this.clock[this.processId] = (this.clock[this.processId] || 0) + 1;
        return this.toJSON();
    }

    /**
     * Update local clock on receiving a message from another process
     * @param {Object} receivedClock - The clock from the received message
     * @returns {Object} The updated clock state
     */
    merge(receivedClock) {
        if (!receivedClock || typeof receivedClock !== 'object') {
            return this.toJSON();
        }

        // Take the max of each component
        for (const [processId, timestamp] of Object.entries(receivedClock)) {
            const local = this.clock[processId] || 0;
            const remote = typeof timestamp === 'number' ? timestamp : 0;
            this.clock[processId] = Math.max(local, remote);
        }

        // Increment our own clock (receiving is an event)
        this.clock[this.processId] = (this.clock[this.processId] || 0) + 1;

        return this.toJSON();
    }

    /**
     * Compare this clock to another clock
     * @param {Object} otherClock - Clock to compare against
     * @returns {'before'|'after'|'concurrent'|'equal'} Causal relationship
     */
    compare(otherClock) {
        if (!otherClock || typeof otherClock !== 'object') {
            return 'after';  // Assume we're after if other is invalid
        }

        let hasGreater = false;
        let hasLesser = false;

        // Get all unique process IDs
        const allProcessIds = new Set([
            ...Object.keys(this.clock),
            ...Object.keys(otherClock)
        ]);

        for (const processId of allProcessIds) {
            const ours = this.clock[processId] || 0;
            const theirs = otherClock[processId] || 0;

            if (ours > theirs) hasGreater = true;
            if (ours < theirs) hasLesser = true;
        }

        if (hasGreater && hasLesser) {
            return 'concurrent';  // Neither strictly before nor after
        } else if (hasGreater) {
            return 'after';  // We happened strictly after
        } else if (hasLesser) {
            return 'before';  // We happened strictly before
        } else {
            return 'equal';  // Clocks are identical
        }
    }

    /**
     * Check if two clocks are concurrent (potential conflict)
     * @param {Object} otherClock - Clock to compare against
     * @returns {boolean} True if clocks are concurrent
     */
    isConcurrent(otherClock) {
        return this.compare(otherClock) === 'concurrent';
    }

    /**
     * Check if this clock is strictly before another
     * @param {Object} otherClock - Clock to compare against
     * @returns {boolean} True if this happened before other
     */
    happenedBefore(otherClock) {
        return this.compare(otherClock) === 'before';
    }

    /**
     * Check if this clock is strictly after another
     * @param {Object} otherClock - Clock to compare against
     * @returns {boolean} True if this happened after other
     */
    happenedAfter(otherClock) {
        return this.compare(otherClock) === 'after';
    }

    /**
     * Get the current clock state as a plain object
     * @returns {Object} Current clock state
     */
    toJSON() {
        return { ...this.clock };
    }

    /**
     * Serialize the clock to a string
     * @returns {string} JSON string representation
     */
    serialize() {
        return JSON.stringify({
            processId: this.processId,
            clock: this.clock
        });
    }

    /**
     * Create a VectorClock from a serialized string
     * @param {string} json - Serialized clock
     * @returns {VectorClock} New VectorClock instance
     */
    static deserialize(json) {
        try {
            const data = JSON.parse(json);
            const vc = new VectorClock(data.processId);
            vc.clock = data.clock || {};
            return vc;
        } catch (e) {
            console.warn('[VectorClock] Failed to deserialize:', e);
            return new VectorClock();
        }
    }

    /**
     * Create a VectorClock from a clock state object
     * @param {Object} clockState - Clock state to import
     * @param {string} [processId] - Process ID (optional)
     * @returns {VectorClock} New VectorClock instance
     */
    static fromState(clockState, processId = null) {
        const vc = new VectorClock(processId);
        if (clockState && typeof clockState === 'object') {
            vc.clock = { ...clockState };
        }
        return vc;
    }

    /**
     * Create a copy of this clock
     * @returns {VectorClock} New VectorClock with same state
     */
    clone() {
        const vc = new VectorClock(this.processId);
        vc.clock = { ...this.clock };
        return vc;
    }

    /**
     * Get the total of all logical timestamps (for ordering heuristic)
     * @returns {number}
     */
    getSum() {
        return Object.values(this.clock).reduce((sum, val) => sum + val, 0);
    }
}

// ==========================================
// Versioned Data Wrapper
// ==========================================

/**
 * Wraps data with vector clock versioning
 */
export class VersionedData {
    /**
     * @param {*} data - The data to version
     * @param {VectorClock} [clock] - Optional existing clock
     */
    constructor(data, clock = null) {
        this.data = data;
        this.clock = clock || new VectorClock();
        this.timestamp = Date.now();
    }

    /**
     * Update the data with a new version
     * @param {*} newData - New data value
     * @returns {VersionedData} This instance for chaining
     */
    update(newData) {
        this.data = newData;
        this.clock.tick();
        this.timestamp = Date.now();
        return this;
    }

    /**
     * Merge with another versioned data instance
     * Returns the winning data (or null if conflict)
     * @param {VersionedData} other - Other versioned data
     * @returns {{ winner: VersionedData|null, conflict: boolean }}
     */
    mergeWith(other) {
        if (!other || !other.clock) {
            return { winner: this, conflict: false };
        }

        const comparison = this.clock.compare(other.clock.toJSON());

        switch (comparison) {
            case 'after':
            case 'equal':
                // Our data wins
                this.clock.merge(other.clock.toJSON());
                return { winner: this, conflict: false };

            case 'before':
                // Their data wins
                this.clock.merge(other.clock.toJSON());
                this.data = other.data;
                this.timestamp = other.timestamp;
                return { winner: this, conflict: false };

            case 'concurrent':
                // Conflict - merge clocks but flag for resolution
                this.clock.merge(other.clock.toJSON());
                return { winner: null, conflict: true, ours: this.data, theirs: other.data };
        }
    }

    /**
     * Serialize for storage/transmission
     * @returns {Object}
     */
    toJSON() {
        return {
            data: this.data,
            clock: this.clock.toJSON(),
            processId: this.clock.processId,
            timestamp: this.timestamp
        };
    }

    /**
     * Deserialize from storage/transmission
     * @param {Object} json - Serialized versioned data
     * @returns {VersionedData}
     */
    static fromJSON(json) {
        if (!json) return new VersionedData(null);

        const vd = new VersionedData(json.data);
        vd.clock = VectorClock.fromState(json.clock, json.processId);
        vd.timestamp = json.timestamp || Date.now();
        return vd;
    }
}

// ==========================================
// Public API
// ==========================================

export const VectorClockModule = {
    VectorClock,
    VersionedData
};

// Keep window global for backwards compatibility
if (typeof window !== 'undefined') {
    window.VectorClock = VectorClock;
    window.VersionedData = VersionedData;
    window.VectorClockModule = VectorClockModule;
}

console.log('[VectorClock] Module loaded');
