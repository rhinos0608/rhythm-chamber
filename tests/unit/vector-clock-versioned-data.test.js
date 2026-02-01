/**
 * Vector Clock and VersionedData Comprehensive Tests
 *
 * Tests for js/services/vector-clock.js
 * Covers VersionedData class and extended VectorClock methods
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VectorClock, VersionedData } from '../../js/services/vector-clock.js';

// ==========================================
// VectorClock Extended Tests
// ==========================================

describe('VectorClock Extended Methods', () => {
  describe('fromState', () => {
    it('should create VectorClock from clock state object', () => {
      const clockState = { tab1: 5, tab2: 3 };
      const vc = VectorClock.fromState(clockState, 'tab1');

      expect(vc.processId).toBe('tab1');
      expect(vc.clock).toEqual({ tab1: 5, tab2: 3 });
    });

    it('should create VectorClock with auto-generated processId when not provided', () => {
      const clockState = { tab1: 5 };
      const vc = VectorClock.fromState(clockState);

      expect(vc.processId).toBeDefined();
      expect(vc.processId).toMatch(/^tab_\d+_[a-z0-9]+$/);
      expect(vc.clock).toEqual({ tab1: 5 });
    });

    it('should handle null clock state', () => {
      const vc = VectorClock.fromState(null, 'tab1');

      expect(vc.processId).toBe('tab1');
      expect(vc.clock).toEqual({});
    });

    it('should handle undefined clock state', () => {
      const vc = VectorClock.fromState(undefined, 'tab1');

      expect(vc.processId).toBe('tab1');
      expect(vc.clock).toEqual({});
    });

    it('should handle empty clock state', () => {
      const vc = VectorClock.fromState({}, 'tab1');

      expect(vc.processId).toBe('tab1');
      expect(vc.clock).toEqual({});
    });

    it('should create a copy of the clock state (not reference)', () => {
      const clockState = { tab1: 5 };
      const vc = VectorClock.fromState(clockState, 'tab1');

      // Modify original
      clockState.tab1 = 10;

      expect(vc.clock.tab1).toBe(5); // Should not be affected
    });

    it('should handle clock state with non-numeric values gracefully', () => {
      const clockState = { tab1: 'invalid', tab2: 3 };
      const vc = VectorClock.fromState(clockState, 'tab1');

      expect(vc.clock).toEqual({ tab1: 'invalid', tab2: 3 });
    });
  });

  describe('peek', () => {
    it('should return current clock state without incrementing', () => {
      const vc = new VectorClock('tab1');
      vc.tick();
      vc.tick();

      const peeked = vc.peek();

      expect(peeked).toEqual({ tab1: 2 });
      expect(vc.clock.tab1).toBe(2); // Should not change
    });

    it('should return a copy of the clock state', () => {
      const vc = new VectorClock('tab1');
      vc.tick();

      const peeked = vc.peek();
      peeked.tab1 = 999;

      expect(vc.clock.tab1).toBe(1); // Original should not be affected
    });

    it('should return empty object for new clock', () => {
      const vc = new VectorClock('tab1');

      const peeked = vc.peek();

      expect(peeked).toEqual({});
    });

    it('should return clock with multiple processes', () => {
      const vc = new VectorClock('tab1');
      vc.clock = { tab1: 3, tab2: 2, tab3: 1 };

      const peeked = vc.peek();

      expect(peeked).toEqual({ tab1: 3, tab2: 2, tab3: 1 });
    });
  });

  describe('getSum', () => {
    it('should return sum of all replica counts', () => {
      const vc = new VectorClock('tab1');
      vc.clock = { tab1: 3, tab2: 2, tab3: 1 };

      const sum = vc.getSum();

      expect(sum).toBe(6);
    });

    it('should return 0 for empty clock', () => {
      const vc = new VectorClock('tab1');

      const sum = vc.getSum();

      expect(sum).toBe(0);
    });

    it('should return correct sum after ticks', () => {
      const vc = new VectorClock('tab1');
      vc.tick();
      vc.tick();
      vc.tick();

      const sum = vc.getSum();

      expect(sum).toBe(3);
    });

    it('should return correct sum after merge', () => {
      const vc = new VectorClock('tab1');
      vc.tick(); // tab1: 1
      vc.merge({ tab2: 5, tab3: 3 }); // tab1: 2, tab2: 5, tab3: 3

      const sum = vc.getSum();

      expect(sum).toBe(10);
    });

    it('should handle clock with zero values', () => {
      const vc = new VectorClock('tab1');
      vc.clock = { tab1: 0, tab2: 5 };

      const sum = vc.getSum();

      expect(sum).toBe(5);
    });

    it('should handle large numbers', () => {
      const vc = new VectorClock('tab1');
      vc.clock = { tab1: 1000000, tab2: 2000000 };

      const sum = vc.getSum();

      expect(sum).toBe(3000000);
    });
  });

  describe('generateProcessId', () => {
    it('should generate unique process IDs', () => {
      const vc1 = new VectorClock();
      const vc2 = new VectorClock();

      expect(vc1.processId).not.toBe(vc2.processId);
    });

    it('should generate IDs with correct format', () => {
      const vc = new VectorClock();

      expect(vc.processId).toMatch(/^tab_\d+_[a-z0-9]{9}$/);
    });
  });
});

// ==========================================
// VersionedData Tests
// ==========================================

describe('VersionedData', () => {
  describe('constructor', () => {
    it('should create VersionedData with data and auto-generated clock', () => {
      const data = { name: 'test', value: 42 };
      const vd = new VersionedData(data);

      expect(vd.data).toEqual(data);
      expect(vd.clock).toBeInstanceOf(VectorClock);
      expect(vd.timestamp).toBeDefined();
      expect(typeof vd.timestamp).toBe('number');
    });

    it('should create VersionedData with provided clock', () => {
      const data = { name: 'test' };
      const clock = new VectorClock('custom-tab');
      clock.tick();

      const vd = new VersionedData(data, clock);

      expect(vd.data).toEqual(data);
      expect(vd.clock).toBe(clock);
      expect(vd.clock.processId).toBe('custom-tab');
    });

    it('should handle null data', () => {
      const vd = new VersionedData(null);

      expect(vd.data).toBeNull();
      expect(vd.clock).toBeInstanceOf(VectorClock);
    });

    it('should handle undefined data', () => {
      const vd = new VersionedData(undefined);

      expect(vd.data).toBeUndefined();
      expect(vd.clock).toBeInstanceOf(VectorClock);
    });

    it('should handle primitive data types', () => {
      const stringVd = new VersionedData('hello');
      const numberVd = new VersionedData(42);
      const boolVd = new VersionedData(true);

      expect(stringVd.data).toBe('hello');
      expect(numberVd.data).toBe(42);
      expect(boolVd.data).toBe(true);
    });

    it('should handle array data', () => {
      const data = [1, 2, 3];
      const vd = new VersionedData(data);

      expect(vd.data).toEqual(data);
    });

    it('should set timestamp to current time', () => {
      const before = Date.now();
      const vd = new VersionedData('test');
      const after = Date.now();

      expect(vd.timestamp).toBeGreaterThanOrEqual(before);
      expect(vd.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('update', () => {
    it('should update data and tick clock', () => {
      const vd = new VersionedData('initial');
      const initialClock = { ...vd.clock.clock };

      vd.update('updated');

      expect(vd.data).toBe('updated');
      expect(vd.clock.getSum()).toBeGreaterThan(
        Object.values(initialClock).reduce((a, b) => a + b, 0)
      );
    });

    it('should update timestamp', async () => {
      const vd = new VersionedData('initial');
      const initialTimestamp = vd.timestamp;

      await new Promise((resolve) => setTimeout(resolve, 10));
      vd.update('updated');

      expect(vd.timestamp).toBeGreaterThan(initialTimestamp);
    });

    it('should return this for chaining', () => {
      const vd = new VersionedData('initial');

      const result = vd.update('updated');

      expect(result).toBe(vd);
    });

    it('should allow multiple updates', () => {
      const vd = new VersionedData(0);

      vd.update(1).update(2).update(3);

      expect(vd.data).toBe(3);
      expect(vd.clock.getSum()).toBe(3);
    });

    it('should handle updating to null', () => {
      const vd = new VersionedData('initial');

      vd.update(null);

      expect(vd.data).toBeNull();
    });

    it('should handle updating to undefined', () => {
      const vd = new VersionedData('initial');

      vd.update(undefined);

      expect(vd.data).toBeUndefined();
    });

    it('should handle updating with complex objects', () => {
      const vd = new VersionedData({ count: 0 });
      const newData = { count: 5, items: [1, 2, 3] };

      vd.update(newData);

      expect(vd.data).toEqual(newData);
    });
  });

  describe('mergeWith', () => {
    it('should return this as winner when other is null', () => {
      const vd = new VersionedData('data');
      vd.clock.tick();

      const result = vd.mergeWith(null);

      expect(result.winner).toBe(vd);
      expect(result.conflict).toBe(false);
    });

    it('should return this as winner when other has no clock', () => {
      const vd = new VersionedData('data');
      vd.clock.tick();

      const result = vd.mergeWith({ data: 'other', clock: null });

      expect(result.winner).toBe(vd);
      expect(result.conflict).toBe(false);
    });

    it('should return this as winner when this is after other', () => {
      // Use same processId to establish causal ordering
      const sharedClock = new VectorClock('shared');
      sharedClock.tick();
      sharedClock.tick(); // { shared: 2 }

      const vd1 = new VersionedData('data1', sharedClock.clone());

      const vd2Clock = new VectorClock('shared');
      vd2Clock.clock = { shared: 1 }; // { shared: 1 }
      const vd2 = new VersionedData('data2', vd2Clock);

      const result = vd1.mergeWith(vd2);

      expect(result.winner).toBe(vd1);
      expect(result.conflict).toBe(false);
      expect(vd1.data).toBe('data1'); // Data should remain unchanged
    });

    it('should adopt other data when this is before other', () => {
      // Use same processId to establish causal ordering
      const vd1Clock = new VectorClock('shared');
      vd1Clock.clock = { shared: 1 }; // { shared: 1 }
      const vd1 = new VersionedData('data1', vd1Clock);

      const vd2Clock = new VectorClock('shared');
      vd2Clock.clock = { shared: 2 }; // { shared: 2 }
      const vd2 = new VersionedData('data2', vd2Clock);
      vd2.timestamp = 1234567890;

      const result = vd1.mergeWith(vd2);

      expect(result.winner).toBe(vd1);
      expect(result.conflict).toBe(false);
      expect(vd1.data).toBe('data2'); // Data should be updated
      expect(vd1.timestamp).toBe(1234567890);
    });

    it('should return this as winner when clocks are equal', () => {
      const clock = new VectorClock('shared');
      clock.tick();

      const vd1 = new VersionedData('data1', clock.clone());
      const vd2 = new VersionedData('data2', clock.clone());

      const result = vd1.mergeWith(vd2);

      expect(result.winner).toBe(vd1);
      expect(result.conflict).toBe(false);
    });

    it('should detect concurrent updates as conflict', () => {
      // Simulate concurrent updates from different tabs
      const vd1 = new VersionedData('data1');
      vd1.clock.processId = 'tab1';
      vd1.clock.tick(); // { tab1: 1 }

      const vd2 = new VersionedData('data2');
      vd2.clock.processId = 'tab2';
      vd2.clock.tick(); // { tab2: 1 }

      // These are concurrent because neither happened before the other
      const result = vd1.mergeWith(vd2);

      expect(result.conflict).toBe(true);
      expect(result.winner).toBeNull();
      expect(result.ours).toBe('data1');
      expect(result.theirs).toBe('data2');
    });

    it('should merge clocks after conflict detection', () => {
      const vd1 = new VersionedData('data1');
      vd1.clock.processId = 'tab1';
      vd1.clock.tick();
      vd1.clock.tick(); // { tab1: 2 }

      const vd2 = new VersionedData('data2');
      vd2.clock.processId = 'tab2';
      vd2.clock.tick(); // { tab2: 1 }

      vd1.mergeWith(vd2);

      // Clock should have merged both tabs
      expect(vd1.clock.clock.tab1).toBe(3); // 2 + 1 for merge event
      expect(vd1.clock.clock.tab2).toBe(1);
    });

    it('should merge clocks when this wins', () => {
      const vd1 = new VersionedData('data1');
      vd1.clock.processId = 'tab1';
      vd1.clock.tick();
      vd1.clock.tick(); // { tab1: 2 }

      const vd2 = new VersionedData('data2');
      vd2.clock.processId = 'tab2';
      vd2.clock.tick(); // { tab2: 1 }

      vd1.mergeWith(vd2);

      expect(vd1.clock.clock.tab1).toBe(3); // 2 + 1 for merge
      expect(vd1.clock.clock.tab2).toBe(1);
    });

    it('should merge clocks when other wins', () => {
      const vd1 = new VersionedData('data1');
      vd1.clock.processId = 'tab1';
      vd1.clock.tick(); // { tab1: 1 }

      const vd2 = new VersionedData('data2');
      vd2.clock.processId = 'tab2';
      vd2.clock.tick();
      vd2.clock.tick(); // { tab2: 2 }

      vd1.mergeWith(vd2);

      expect(vd1.clock.clock.tab1).toBe(2); // 1 + 1 for merge
      expect(vd1.clock.clock.tab2).toBe(2);
    });
  });

  describe('toJSON', () => {
    it('should serialize VersionedData correctly', () => {
      const clock = new VectorClock('tab1');
      clock.tick();

      const vd = new VersionedData({ name: 'test' }, clock);

      const json = vd.toJSON();

      expect(json.data).toEqual({ name: 'test' });
      expect(json.clock).toEqual({ tab1: 1 });
      expect(json.processId).toBe('tab1');
      expect(json.timestamp).toBe(vd.timestamp);
    });

    it('should handle primitive data', () => {
      const vd = new VersionedData(42);

      const json = vd.toJSON();

      expect(json.data).toBe(42);
    });

    it('should handle null data', () => {
      const vd = new VersionedData(null);

      const json = vd.toJSON();

      expect(json.data).toBeNull();
    });

    it('should include empty clock for new instance', () => {
      const vd = new VersionedData('test');

      const json = vd.toJSON();

      expect(json.clock).toEqual({});
    });
  });

  describe('fromJSON', () => {
    it('should deserialize VersionedData correctly', () => {
      const json = {
        data: { name: 'test', value: 42 },
        clock: { tab1: 3, tab2: 2 },
        processId: 'tab1',
        timestamp: 1234567890,
      };

      const vd = VersionedData.fromJSON(json);

      expect(vd.data).toEqual({ name: 'test', value: 42 });
      expect(vd.clock.clock).toEqual({ tab1: 3, tab2: 2 });
      expect(vd.clock.processId).toBe('tab1');
      expect(vd.timestamp).toBe(1234567890);
    });

    it('should handle null input', () => {
      const vd = VersionedData.fromJSON(null);

      expect(vd.data).toBeNull();
      expect(vd.clock).toBeInstanceOf(VectorClock);
    });

    it('should handle undefined input', () => {
      const vd = VersionedData.fromJSON(undefined);

      expect(vd.data).toBeNull();
      expect(vd.clock).toBeInstanceOf(VectorClock);
    });

    it('should use current timestamp when not provided', () => {
      const before = Date.now();
      const vd = VersionedData.fromJSON({ data: 'test', clock: {} });
      const after = Date.now();

      expect(vd.timestamp).toBeGreaterThanOrEqual(before);
      expect(vd.timestamp).toBeLessThanOrEqual(after);
    });

    it('should handle primitive data', () => {
      const vd = VersionedData.fromJSON({
        data: 'hello',
        clock: { tab1: 1 },
        processId: 'tab1',
        timestamp: 1000,
      });

      expect(vd.data).toBe('hello');
    });

    it('should handle array data', () => {
      const vd = VersionedData.fromJSON({
        data: [1, 2, 3],
        clock: { tab1: 1 },
        processId: 'tab1',
        timestamp: 1000,
      });

      expect(vd.data).toEqual([1, 2, 3]);
    });

    it('should handle empty clock object', () => {
      const vd = VersionedData.fromJSON({
        data: 'test',
        clock: {},
        processId: 'tab1',
        timestamp: 1000,
      });

      expect(vd.clock.clock).toEqual({});
    });

    it('should handle missing processId', () => {
      const vd = VersionedData.fromJSON({
        data: 'test',
        clock: { tab1: 1 },
        timestamp: 1000,
      });

      // VectorClock.fromState generates a processId when not provided
      expect(vd.clock.processId).toBeDefined();
      expect(vd.clock.processId).toMatch(/^tab_\d+_[a-z0-9]+$/);
      expect(vd.clock.clock).toEqual({ tab1: 1 });
    });
  });
});

// ==========================================
// Concurrent Conflict Resolution Scenarios
// ==========================================

describe('Concurrent Conflict Resolution Scenarios', () => {
  it('should detect conflict in multi-tab scenario with independent changes', () => {
    // Tab A makes changes
    const tabA = new VersionedData('state-A');
    tabA.clock.processId = 'tabA';
    tabA.clock.tick();
    tabA.clock.tick(); // { tabA: 2 }

    // Tab B makes independent changes (concurrent)
    const tabB = new VersionedData('state-B');
    tabB.clock.processId = 'tabB';
    tabB.clock.tick();
    tabB.clock.tick(); // { tabB: 2 }

    // When they try to merge, conflict should be detected
    const result = tabA.mergeWith(tabB);

    expect(result.conflict).toBe(true);
    expect(result.winner).toBeNull();
    expect(result.ours).toBe('state-A');
    expect(result.theirs).toBe('state-B');
  });

  it('should resolve conflict when one tab has seen the other', () => {
    // Tab A makes changes
    const tabA = new VersionedData('state-A');
    tabA.clock.processId = 'tabA';
    tabA.clock.tick(); // { tabA: 1 }

    // Tab B receives Tab A's state and makes more changes
    const tabB = new VersionedData('state-B');
    tabB.clock.processId = 'tabB';
    tabB.clock.merge(tabA.clock.toJSON()); // { tabA: 1, tabB: 1 }
    tabB.clock.tick(); // { tabA: 1, tabB: 2 }
    tabB.data = 'state-B';

    // Tab B is now strictly after Tab A
    const result = tabA.mergeWith(tabB);

    expect(result.conflict).toBe(false);
    expect(result.winner).toBe(tabA);
    expect(tabA.data).toBe('state-B'); // Tab A adopts Tab B's data
  });

  it('should handle chain of updates with eventual consistency', () => {
    // Tab A: A1 -> A2
    const tabA = new VersionedData('A1');
    tabA.clock.processId = 'tabA';
    tabA.clock.tick();
    tabA.update('A2'); // { tabA: 2 }

    // Tab B receives A's state, updates: A2 -> B1
    const tabB = new VersionedData('A2');
    tabB.clock.processId = 'tabB';
    tabB.clock = VectorClock.fromState(tabA.clock.toJSON(), 'tabB');
    tabB.update('B1'); // { tabA: 2, tabB: 1 }

    // Tab A makes another update without seeing B: A2 -> A3
    tabA.update('A3'); // { tabA: 3 }

    // Now merge - these are concurrent
    const result = tabA.mergeWith(tabB);

    expect(result.conflict).toBe(true);
    expect(result.ours).toBe('A3');
    expect(result.theirs).toBe('B1');
  });

  it('should handle three-way conflict scenario', () => {
    // Three tabs make independent changes
    const tabA = new VersionedData('A');
    tabA.clock.processId = 'tabA';
    tabA.clock.tick();

    const tabB = new VersionedData('B');
    tabB.clock.processId = 'tabB';
    tabB.clock.tick();

    const tabC = new VersionedData('C');
    tabC.clock.processId = 'tabC';
    tabC.clock.tick();

    // A merges with B (conflict)
    const resultAB = tabA.mergeWith(tabB);
    expect(resultAB.conflict).toBe(true);

    // Now A's clock has both tabA and tabB
    // A resolves conflict and updates
    tabA.data = 'A-resolved';
    tabA.clock.tick();

    // A merges with C (still concurrent with C)
    const resultAC = tabA.mergeWith(tabC);
    expect(resultAC.conflict).toBe(true);
  });

  it('should maintain causality through multiple merges', () => {
    const vd = new VersionedData('initial');
    vd.clock.processId = 'main';

    // Simulate receiving updates from different sources
    const update1 = new VersionedData('update1');
    update1.clock.processId = 'source1';
    update1.clock.tick();

    const update2 = new VersionedData('update2');
    update2.clock.processId = 'source2';
    update2.clock.tick();

    // Merge first update
    vd.mergeWith(update1);
    expect(vd.data).toBe('update1');

    // Merge second update (concurrent with first)
    const result = vd.mergeWith(update2);
    expect(result.conflict).toBe(true);

    // Clock should have all three processes
    expect(vd.clock.clock.main).toBeDefined();
    expect(vd.clock.clock.source1).toBeDefined();
    expect(vd.clock.clock.source2).toBeDefined();
  });

  it('should handle rapid concurrent updates', () => {
    const base = new VersionedData('base');
    base.clock.processId = 'base';
    base.clock.tick();

    // Create 5 concurrent updates
    const updates = [];
    for (let i = 0; i < 5; i++) {
      const update = new VersionedData(`update-${i}`);
      update.clock.processId = `tab-${i}`;
      update.clock.tick();
      updates.push(update);
    }

    // Merge all into base
    let conflictCount = 0;
    for (const update of updates) {
      const result = base.mergeWith(update);
      if (result.conflict) {
        conflictCount++;
      }
    }

    // All should be conflicts since they're concurrent
    expect(conflictCount).toBe(5);

    // Clock should have all processes
    expect(Object.keys(base.clock.clock).length).toBe(6); // base + 5 tabs
  });

  it('should preserve data integrity through serialization round-trip', () => {
    const original = new VersionedData({ count: 5, items: ['a', 'b'] });
    original.clock.processId = 'tab1';
    original.clock.tick();
    original.clock.tick();

    // Serialize
    const json = original.toJSON();

    // Deserialize
    const restored = VersionedData.fromJSON(json);

    expect(restored.data).toEqual(original.data);
    expect(restored.clock.clock).toEqual(original.clock.clock);
    expect(restored.clock.processId).toBe(original.clock.processId);
    expect(restored.timestamp).toBe(original.timestamp);
  });

  it('should handle merge after round-trip serialization', () => {
    // Create and serialize original
    const original = new VersionedData('original');
    original.clock.processId = 'tab1';
    original.clock.tick();

    const json = original.toJSON();
    const restored = VersionedData.fromJSON(json);

    // Create concurrent update
    const concurrent = new VersionedData('concurrent');
    concurrent.clock.processId = 'tab2';
    concurrent.clock.tick();

    // Merge should still detect conflict
    const result = restored.mergeWith(concurrent);

    expect(result.conflict).toBe(true);
    expect(result.ours).toBe('original');
    expect(result.theirs).toBe('concurrent');
  });
});

// ==========================================
// Edge Cases and Error Handling
// ==========================================

describe('Edge Cases and Error Handling', () => {
  describe('VectorClock edge cases', () => {
    it('should handle merge with empty object', () => {
      const vc = new VectorClock('tab1');
      vc.tick();

      const result = vc.merge({});

      expect(vc.clock.tab1).toBe(2); // Incremented for merge event
    });

    it('should handle merge with clock containing non-numeric values', () => {
      const vc = new VectorClock('tab1');
      vc.tick();

      vc.merge({ tab1: 'invalid', tab2: 5 });

      expect(vc.clock.tab1).toBe(2); // Should treat invalid as 0 and increment
      expect(vc.clock.tab2).toBe(5);
    });

    it('should handle compare with empty clock', () => {
      const vc1 = new VectorClock('tab1');
      vc1.tick();

      const vc2 = new VectorClock('tab2');

      const result = vc1.compare(vc2.toJSON());
      expect(result).toBe('after');
    });

    it('should handle getSum with negative values (edge case)', () => {
      const vc = new VectorClock('tab1');
      vc.clock = { tab1: -5, tab2: 3 };

      expect(vc.getSum()).toBe(-2);
    });
  });

  describe('VersionedData edge cases', () => {
    it('should handle deeply nested data structures', () => {
      const nested = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
        },
      };

      const vd = new VersionedData(nested);
      const json = vd.toJSON();
      const restored = VersionedData.fromJSON(json);

      expect(restored.data.level1.level2.level3.value).toBe('deep');
    });

    it('should handle circular reference in data (JSON.stringify should throw)', () => {
      const data = { name: 'test' };
      data.self = data; // Circular reference

      const vd = new VersionedData(data);

      // toJSON returns the data object, but JSON.stringify will throw on circular refs
      const jsonData = vd.toJSON();
      expect(() => JSON.stringify(jsonData)).toThrow(TypeError);
    });

    it('should handle very large data values', () => {
      const largeArray = new Array(10000).fill('x');
      const vd = new VersionedData(largeArray);

      expect(vd.data.length).toBe(10000);

      const json = vd.toJSON();
      expect(json.data.length).toBe(10000);
    });

    it('should handle special characters in data', () => {
      const special = {
        text: 'Hello\nWorld\t!',
        emoji: '🎵🎶',
        unicode: '中文测试',
      };

      const vd = new VersionedData(special);
      const json = vd.toJSON();
      const restored = VersionedData.fromJSON(json);

      expect(restored.data).toEqual(special);
    });

    it('should handle merge with VersionedData having undefined data', () => {
      // Use same processId to establish causal ordering
      const vd1Clock = new VectorClock('shared');
      vd1Clock.clock = { shared: 1 };
      const vd1 = new VersionedData('defined', vd1Clock);

      const vd2Clock = new VectorClock('shared');
      vd2Clock.clock = { shared: 2 }; // vd2 is after vd1
      const vd2 = new VersionedData(undefined, vd2Clock);

      const result = vd1.mergeWith(vd2);

      expect(result.conflict).toBe(false);
      expect(vd1.data).toBeUndefined();
    });

    it('should handle multiple sequential merges without conflicts', () => {
      const main = new VersionedData('v0');
      main.clock.processId = 'main';
      main.clock.tick();

      // Sequential updates from same source
      for (let i = 1; i <= 5; i++) {
        const update = new VersionedData(`v${i}`);
        update.clock.processId = 'source';
        // Each update builds on previous
        update.clock = VectorClock.fromState(main.clock.toJSON(), 'source');
        update.clock.tick();

        const result = main.mergeWith(update);
        expect(result.conflict).toBe(false);
        expect(main.data).toBe(`v${i}`);
      }
    });

    it('should handle fromJSON with partial data', () => {
      const partial = {
        data: 'test',
        // Missing clock, processId, timestamp
      };

      const vd = VersionedData.fromJSON(partial);

      expect(vd.data).toBe('test');
      expect(vd.clock).toBeInstanceOf(VectorClock);
      expect(vd.timestamp).toBeDefined();
    });

    it('should handle fromJSON with null clock', () => {
      const withNullClock = {
        data: 'test',
        clock: null,
        processId: 'tab1',
        timestamp: 1000,
      };

      const vd = VersionedData.fromJSON(withNullClock);

      expect(vd.data).toBe('test');
      expect(vd.clock).toBeInstanceOf(VectorClock);
    });
  });
});

// ==========================================
// Integration Tests
// ==========================================

describe('Integration Tests', () => {
  it('should simulate real-world session state synchronization', () => {
    // Simulate two tabs with shared session state
    const tabA = {
      session: new VersionedData({ user: 'Alice', count: 0 }),
    };
    tabA.session.clock.processId = 'tabA';

    const tabB = {
      session: new VersionedData({ user: 'Alice', count: 0 }),
    };
    tabB.session.clock.processId = 'tabB';

    // Tab A makes an update
    tabA.session.update({ user: 'Alice', count: 1 });

    // Tab B makes an independent update (concurrent)
    tabB.session.update({ user: 'Alice', count: 1 });

    // When they sync, conflict should be detected
    const result = tabA.session.mergeWith(tabB.session);

    expect(result.conflict).toBe(true);
    expect(result.ours.count).toBe(1);
    expect(result.theirs.count).toBe(1);

    // Application would need to resolve this conflict
    // (e.g., by taking the max count or merging changes)
  });

  it('should handle vector clock as a Lamport timestamp alternative', () => {
    // Use vector clock for simple ordering
    const events = [];

    for (let i = 0; i < 5; i++) {
      const vc = new VectorClock('process');
      vc.clock = { process: i + 1 };
      events.push({ id: i, clock: vc.toJSON() });
    }

    // Verify ordering
    for (let i = 1; i < events.length; i++) {
      const prev = new VectorClock('process');
      prev.clock = events[i - 1].clock;

      const curr = new VectorClock('process');
      curr.clock = events[i].clock;

      expect(prev.happenedBefore(curr.toJSON())).toBe(true);
    }
  });

  it('should support custom conflict resolution strategies', () => {
    // Create a conflict
    const vd1 = new VersionedData({ value: 10, source: 'A' });
    vd1.clock.processId = 'tabA';
    vd1.clock.tick();

    const vd2 = new VersionedData({ value: 20, source: 'B' });
    vd2.clock.processId = 'tabB';
    vd2.clock.tick();

    const result = vd1.mergeWith(vd2);

    expect(result.conflict).toBe(true);

    // Custom resolution: take max value
    if (result.conflict) {
      const resolvedValue =
        result.ours.value > result.theirs.value ? result.ours : result.theirs;
      vd1.data = resolvedValue;
      vd1.update(resolvedValue); // Tick clock to mark resolution
    }

    expect(vd1.data.value).toBe(20);
  });
});
