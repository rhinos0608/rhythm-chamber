/**
 * Mutex.isLocked() tests
 *
 * Tests the fix for the isLocked() bug where it incorrectly compared
 * this._lock !== Promise.resolve() (always true because Promise.resolve()
 * creates a new promise each time).
 *
 * The fix uses _lockCount to track lock state.
 */

import { describe, it, expect } from 'vitest';
import { Mutex } from '../../js/utils/concurrency/mutex.js';

describe('Mutex.isLocked()', () => {
  it('returns false when mutex is not locked', () => {
    const mutex = new Mutex();

    expect(mutex.isLocked()).toBe(false);
  });

  it('returns true while mutex is locked', async () => {
    const mutex = new Mutex();
    let locked = false;
    let canProceed = Promise.resolve();
    const proceedSignal = { resolve: null };

    // Create a promise that controls when the lock operation completes
    canProceed = new Promise(resolve => {
      proceedSignal.resolve = resolve;
    });

    // Start a lock operation but don't await it yet
    const lockPromise = mutex.runExclusive(async () => {
      locked = true;
      // Check that we're locked while inside
      expect(mutex.isLocked()).toBe(true);
      // Wait for signal before completing
      await canProceed;
      locked = false;
    });

    // Use a microtask to ensure the lock has been acquired
    // This is deterministic - await Promise.resolve() schedules in the microtask queue
    await Promise.resolve();
    await Promise.resolve();

    // Should be locked while operation is in progress
    expect(mutex.isLocked()).toBe(true);
    expect(locked).toBe(true);

    // Signal the lock to proceed
    proceedSignal.resolve();

    // Wait for lock to release
    await lockPromise;

    // Should be unlocked after operation completes
    expect(mutex.isLocked()).toBe(false);
    expect(locked).toBe(false);
  });

  it('returns false after lock is released', async () => {
    const mutex = new Mutex();

    // Execute and wait for completion
    await mutex.runExclusive(async () => {
      // Do something
    });

    // Should be unlocked after completion
    expect(mutex.isLocked()).toBe(false);
  });

  it('handles sequential operations correctly', async () => {
    const mutex = new Mutex();
    const results = [];

    // First operation
    await mutex.runExclusive(async () => {
      results.push('first');
      expect(mutex.isLocked()).toBe(true);
    });

    // Should be unlocked between operations
    expect(mutex.isLocked()).toBe(false);

    // Second operation
    await mutex.runExclusive(async () => {
      results.push('second');
      expect(mutex.isLocked()).toBe(true);
    });

    // Should be unlocked after all operations
    expect(mutex.isLocked()).toBe(false);
    expect(results).toEqual(['first', 'second']);
  });

  it('handles rapid sequential lock/unlock cycles', async () => {
    const mutex = new Mutex();
    const iterations = 10;

    for (let i = 0; i < iterations; i++) {
      await mutex.runExclusive(async () => {
        expect(mutex.isLocked()).toBe(true);
      });
      expect(mutex.isLocked()).toBe(false);
    }

    // Final state should be unlocked
    expect(mutex.isLocked()).toBe(false);
  });
});
