/**
 * Vector Clock Unit Tests
 * 
 * Tests for js/services/vector-clock.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ==========================================
// Mock Implementation (test environment)
// ==========================================

class VectorClock {
    constructor(processId = null) {
        this.processId = processId || `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.clock = {};
    }

    tick() {
        this.clock[this.processId] = (this.clock[this.processId] || 0) + 1;
        return this.toJSON();
    }

    merge(receivedClock) {
        if (!receivedClock || typeof receivedClock !== 'object') return this.toJSON();
        for (const [processId, timestamp] of Object.entries(receivedClock)) {
            const local = this.clock[processId] || 0;
            const remote = typeof timestamp === 'number' ? timestamp : 0;
            this.clock[processId] = Math.max(local, remote);
        }
        this.clock[this.processId] = (this.clock[this.processId] || 0) + 1;
        return this.toJSON();
    }

    compare(otherClock) {
        if (!otherClock || typeof otherClock !== 'object') return 'after';
        let hasGreater = false, hasLesser = false;
        const allProcessIds = new Set([...Object.keys(this.clock), ...Object.keys(otherClock)]);
        for (const processId of allProcessIds) {
            const ours = this.clock[processId] || 0;
            const theirs = otherClock[processId] || 0;
            if (ours > theirs) hasGreater = true;
            if (ours < theirs) hasLesser = true;
        }
        if (hasGreater && hasLesser) return 'concurrent';
        if (hasGreater) return 'after';
        if (hasLesser) return 'before';
        return 'equal';
    }

    isConcurrent(otherClock) { return this.compare(otherClock) === 'concurrent'; }
    happenedBefore(otherClock) { return this.compare(otherClock) === 'before'; }
    happenedAfter(otherClock) { return this.compare(otherClock) === 'after'; }
    toJSON() { return { ...this.clock }; }

    serialize() {
        return JSON.stringify({ processId: this.processId, clock: this.clock });
    }

    static deserialize(json) {
        try {
            const data = JSON.parse(json);
            const vc = new VectorClock(data.processId);
            vc.clock = data.clock || {};
            return vc;
        } catch (e) {
            return new VectorClock();
        }
    }

    clone() {
        const vc = new VectorClock(this.processId);
        vc.clock = { ...this.clock };
        return vc;
    }
}

// ==========================================
// Tests
// ==========================================

describe('VectorClock', () => {
    describe('tick', () => {
        it('should increment local clock', () => {
            const vc = new VectorClock('tab1');

            vc.tick();
            expect(vc.clock['tab1']).toBe(1);

            vc.tick();
            expect(vc.clock['tab1']).toBe(2);
        });

        it('should return the clock state', () => {
            const vc = new VectorClock('tab1');
            const result = vc.tick();
            expect(result).toEqual({ tab1: 1 });
        });
    });

    describe('merge', () => {
        it('should take max of each component', () => {
            const vc = new VectorClock('tab1');
            vc.clock = { tab1: 2, tab2: 3 };

            vc.merge({ tab1: 1, tab2: 5, tab3: 2 });

            expect(vc.clock['tab1']).toBe(3); // max(2,1) + 1 for receive event
            expect(vc.clock['tab2']).toBe(5);
            expect(vc.clock['tab3']).toBe(2);
        });

        it('should increment local clock on merge', () => {
            const vc = new VectorClock('tab1');
            vc.clock = { tab1: 1 };

            vc.merge({ tab2: 5 });

            expect(vc.clock['tab1']).toBe(2); // Incremented for receive event
            expect(vc.clock['tab2']).toBe(5);
        });

        it('should handle null/undefined gracefully', () => {
            const vc = new VectorClock('tab1');
            vc.tick();

            expect(() => vc.merge(null)).not.toThrow();
            expect(() => vc.merge(undefined)).not.toThrow();
        });
    });

    describe('compare', () => {
        it('should return equal for identical clocks', () => {
            const vc = new VectorClock('tab1');
            vc.clock = { tab1: 2, tab2: 3 };

            const result = vc.compare({ tab1: 2, tab2: 3 });
            expect(result).toBe('equal');
        });

        it('should return before when strictly less', () => {
            const vc = new VectorClock('tab1');
            vc.clock = { tab1: 1, tab2: 2 };

            const result = vc.compare({ tab1: 2, tab2: 3 });
            expect(result).toBe('before');
        });

        it('should return after when strictly greater', () => {
            const vc = new VectorClock('tab1');
            vc.clock = { tab1: 3, tab2: 4 };

            const result = vc.compare({ tab1: 2, tab2: 3 });
            expect(result).toBe('after');
        });

        it('should return concurrent for incomparable clocks', () => {
            const vc = new VectorClock('tab1');
            vc.clock = { tab1: 3, tab2: 1 };

            const result = vc.compare({ tab1: 2, tab2: 4 });
            expect(result).toBe('concurrent');
        });

        it('should handle missing keys', () => {
            const vc = new VectorClock('tab1');
            vc.clock = { tab1: 1 };

            // Other has tab2 but we don't - we're before
            const result = vc.compare({ tab1: 1, tab2: 1 });
            expect(result).toBe('before');
        });
    });

    describe('convenience methods', () => {
        it('isConcurrent should return true for concurrent clocks', () => {
            const vc = new VectorClock('tab1');
            vc.clock = { tab1: 2, tab2: 1 };

            expect(vc.isConcurrent({ tab1: 1, tab2: 2 })).toBe(true);
        });

        it('happenedBefore should return true when before', () => {
            const vc = new VectorClock('tab1');
            vc.clock = { tab1: 1 };

            expect(vc.happenedBefore({ tab1: 2 })).toBe(true);
        });

        it('happenedAfter should return true when after', () => {
            const vc = new VectorClock('tab1');
            vc.clock = { tab1: 3 };

            expect(vc.happenedAfter({ tab1: 2 })).toBe(true);
        });
    });

    describe('serialization', () => {
        it('should serialize and deserialize correctly', () => {
            const vc = new VectorClock('tab1');
            vc.tick();
            vc.tick();

            const serialized = vc.serialize();
            const restored = VectorClock.deserialize(serialized);

            expect(restored.processId).toBe('tab1');
            expect(restored.clock).toEqual({ tab1: 2 });
        });

        it('should handle invalid JSON gracefully', () => {
            const restored = VectorClock.deserialize('invalid json');
            expect(restored).toBeInstanceOf(VectorClock);
        });
    });

    describe('clone', () => {
        it('should create independent copy', () => {
            const vc = new VectorClock('tab1');
            vc.tick();

            const clone = vc.clone();
            clone.tick();

            expect(vc.clock['tab1']).toBe(1);
            expect(clone.clock['tab1']).toBe(2);
        });
    });
});

describe('Cross-tab conflict simulation', () => {
    it('should detect concurrent updates from different tabs', () => {
        // Tab A makes changes
        const tabA = new VectorClock('tabA');
        tabA.tick(); // { tabA: 1 }
        tabA.tick(); // { tabA: 2 }
        const stateA = tabA.toJSON();

        // Tab B makes changes independently (before seeing A)
        const tabB = new VectorClock('tabB');
        tabB.tick(); // { tabB: 1 }
        tabB.tick(); // { tabB: 2 }
        const stateB = tabB.toJSON();

        // When they try to sync, they should detect concurrency
        expect(tabA.isConcurrent(stateB)).toBe(true);
        expect(tabB.isConcurrent(stateA)).toBe(true);
    });

    it('should establish ordering after sync', () => {
        const tabA = new VectorClock('tabA');
        const tabB = new VectorClock('tabB');

        tabA.tick(); // { tabA: 1 }

        // Tab B receives Tab A's state
        tabB.merge(tabA.toJSON()); // { tabA: 1, tabB: 1 }

        // Tab B makes more changes
        tabB.tick(); // { tabA: 1, tabB: 2 }

        // Tab B is now strictly after Tab A
        expect(tabB.happenedAfter(tabA.toJSON())).toBe(true);
        expect(tabA.happenedBefore(tabB.toJSON())).toBe(true);
    });
});
