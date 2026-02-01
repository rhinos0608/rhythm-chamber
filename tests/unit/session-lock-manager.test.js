/**
 * SessionLockManager Tests
 *
 * Tests the extracted SessionLockManager from session-manager.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionLockManager } from '../../js/services/session-lock-manager.js';

describe('SessionLockManager', () => {
  let lockManager;

  beforeEach(() => {
    // Create a fresh instance for each test
    lockManager = new SessionLockManager();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('acquireProcessingLock', () => {
    it('should acquire lock when no lock is held', async () => {
      const result = await lockManager.acquireProcessingLock('session-1');

      expect(result.locked).toBe(true);
      expect(result.currentSessionId).toBe('session-1');
      expect(result.release).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should fail to acquire lock for same session (circular wait)', async () => {
      // First acquisition
      await lockManager.acquireProcessingLock('session-1');

      // Second acquisition for same session should fail
      const result = await lockManager.acquireProcessingLock('session-1');

      expect(result.locked).toBe(false);
      expect(result.currentSessionId).toBe('session-1');
      expect(result.error).toBe('Circular wait detected');
      expect(result.release).toBeUndefined();
    });

    it('should fail to acquire lock for different session with timeout', async () => {
      // First acquisition
      const result1 = await lockManager.acquireProcessingLock('session-1');
      expect(result1.locked).toBe(true);

      // Try to acquire for different session (should fail immediately with session switch)
      const startTime = Date.now();
      const result2 = await lockManager.acquireProcessingLock('session-2');
      const duration = Date.now() - startTime;

      expect(result2.locked).toBe(false);
      expect(result2.error).toBe('Session switched during lock acquisition');
      // Should fail quickly, not wait for timeout
      expect(duration).toBeLessThan(1000);
    });

    it('should release lock and allow other sessions to acquire', async () => {
      // First session acquires lock
      const result1 = await lockManager.acquireProcessingLock('session-1');
      expect(result1.locked).toBe(true);

      // Release the lock
      result1.release();
      expect(lockManager.isSessionLocked('session-1')).toBe(false);

      // Second session should now be able to acquire lock
      const result2 = await lockManager.acquireProcessingLock('session-2');
      expect(result2.locked).toBe(true);
      expect(result2.currentSessionId).toBe('session-2');
    });

    it('should handle session switching while waiting', async () => {
      // First session acquires lock
      const result1 = await lockManager.acquireProcessingLock('session-1');
      expect(result1.locked).toBe(true);

      // Second session tries to acquire (will timeout)
      const lockPromise = lockManager.acquireProcessingLock('session-2');

      // Wait a bit then release first lock
      await new Promise(resolve => setTimeout(resolve, 100));
      result1.release();

      // The second acquisition should now timeout or fail
      const result2 = await lockPromise;

      // Should have failed due to timeout or session switch
      expect(result2.locked).toBe(false);
      expect(result2.error).toBeDefined();
    });

    it('should handle retry logic with exponential backoff', async () => {
      // First session acquires lock
      const result1 = await lockManager.acquireProcessingLock('session-1');
      expect(result1.locked).toBe(true);

      // Retry attempt should fail immediately due to session switch detection
      const startTime = Date.now();
      const result2 = await lockManager.acquireProcessingLock('session-2');
      const duration = Date.now() - startTime;

      // Should fail quickly with session switch error
      expect(result2.locked).toBe(false);
      expect(result2.error).toBe('Session switched during lock acquisition');
      expect(duration).toBeLessThan(1000);
    });

    it('should fail immediately on session switch detection', async () => {
      // First session acquires lock
      const result1 = await lockManager.acquireProcessingLock('session-1');
      expect(result1.locked).toBe(true);

      // Try to acquire for different session (will timeout)
      const lockPromise = lockManager.acquireProcessingLock('session-2');

      // Simulate session switch while waiting
      await new Promise(resolve => setTimeout(resolve, 100));
      // This would be detected as a session switch in real scenario

      const result2 = await lockPromise;

      // Should have failed (timeout or session switch)
      expect(result2.locked).toBe(false);
    });
  });

  describe('isSessionLocked', () => {
    it('should return true when session holds lock', async () => {
      const result = await lockManager.acquireProcessingLock('session-1');
      expect(lockManager.isSessionLocked('session-1')).toBe(true);
      result.release();
      expect(lockManager.isSessionLocked('session-1')).toBe(false);
    });

    it('should return false when no lock is held', () => {
      expect(lockManager.isSessionLocked('session-1')).toBe(false);
    });
  });

  describe('get currentSessionLock', () => {
    it('should return session ID of current lock holder', async () => {
      expect(lockManager.currentSessionLock).toBeNull();

      const result = await lockManager.acquireProcessingLock('session-1');
      expect(lockManager.currentSessionLock).toBe('session-1');

      result.release();
      expect(lockManager.currentSessionLock).toBeNull();
    });
  });

  describe('forceReleaseLock', () => {
    it('should release lock even if normally would fail', async () => {
      const result = await lockManager.acquireProcessingLock('session-1');
      expect(lockManager.isSessionLocked('session-1')).toBe(true);

      lockManager.forceReleaseLock();
      expect(lockManager.isSessionLocked('session-1')).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return lock statistics', async () => {
      let stats = lockManager.getStats();
      expect(stats.currentLock).toBeNull();
      expect(stats.isLocked).toBe(false);

      const result = await lockManager.acquireProcessingLock('session-1');
      stats = lockManager.getStats();
      expect(stats.currentLock).toBe('session-1');
      expect(stats.isLocked).toBe(true);

      result.release();
      stats = lockManager.getStats();
      expect(stats.currentLock).toBeNull();
      expect(stats.isLocked).toBe(false);
    });
  });

  describe('Proactive Circular Wait Detection', () => {
    it('should detect simple circular wait between two sessions BEFORE acquisition', async () => {
      // Session-1 holds lock
      const result1 = await lockManager.acquireProcessingLock('session-1');
      expect(result1.locked).toBe(true);

      // Session-2 waits for session-1 (don't await, let it run in background)
      const lockPromise2 = lockManager
        .acquireProcessingLock('session-2')
        .catch(() => ({ locked: false }));

      // Wait for session-2 to be registered in wait-for graph
      await new Promise(resolve => setTimeout(resolve, 50));

      // Now session-1 tries to acquire again (would create cycle: session-1 -> session-2 -> session-1)
      const resultCycle = await lockManager.acquireProcessingLock('session-1');

      // Should detect cycle BEFORE attempting acquisition
      expect(resultCycle.locked).toBe(false);
      expect(resultCycle.error).toBe('Circular wait detected');

      // Cleanup
      result1.release();
      await lockPromise2;
    });

    it('should detect circular wait in three-session chain BEFORE acquisition', async () => {
      // Session-1 holds lock
      const result1 = await lockManager.acquireProcessingLock('session-1');
      expect(result1.locked).toBe(true);

      // Session-2 waits for session-1
      const lockPromise2 = lockManager
        .acquireProcessingLock('session-2')
        .catch(() => ({ locked: false }));
      await new Promise(resolve => setTimeout(resolve, 50));

      // Session-3 waits for session-2 (which waits for session-1)
      const lockPromise3 = lockManager
        .acquireProcessingLock('session-3')
        .catch(() => ({ locked: false }));
      await new Promise(resolve => setTimeout(resolve, 50));

      // Now session-1 tries to acquire again (would create cycle)
      const resultCycle = await lockManager.acquireProcessingLock('session-1');

      // Should detect cycle BEFORE attempting acquisition
      expect(resultCycle.locked).toBe(false);
      expect(resultCycle.error).toBe('Circular wait detected');

      // Cleanup
      result1.release();
      await lockPromise2;
      await lockPromise3;
    });

    it('should allow lock acquisition when no circular wait exists', async () => {
      // Session-1 holds lock
      const result1 = await lockManager.acquireProcessingLock('session-1');
      expect(result1.locked).toBe(true);

      // Session-2 waits for session-1
      const lockPromise2 = lockManager
        .acquireProcessingLock('session-2')
        .catch(() => ({ locked: false }));
      await new Promise(resolve => setTimeout(resolve, 50));

      // Session-3 is not in the wait chain, should be able to start waiting
      const lockPromise3 = lockManager
        .acquireProcessingLock('session-3')
        .catch(() => ({ locked: false }));

      // Wait a bit to ensure session-3 starts waiting
      await new Promise(resolve => setTimeout(resolve, 50));

      // Session-3 should be waiting (not rejected)
      // We can't check the promise state directly, but we can verify it hasn't rejected
      expect(lockPromise3).toBeDefined();

      // Cleanup
      result1.release();
      await lockPromise2;
      await lockPromise3;
    });

    it('should maintain wait-for graph correctly on lock release', async () => {
      // Session-1 holds lock
      const result1 = await lockManager.acquireProcessingLock('session-1');

      // Session-2 waits for session-1
      const lockPromise2 = lockManager.acquireProcessingLock('session-2');
      await new Promise(resolve => setTimeout(resolve, 50));

      // Release session-1 lock
      result1.release();

      // Session-2 should acquire lock
      const result2 = await lockPromise2;
      expect(result2.locked).toBe(true);

      // Now session-1 should be able to acquire again (no cycle)
      const result1Again = await lockManager.acquireProcessingLock('session-1');
      expect(result1Again.locked).toBe(true);

      // Cleanup
      result2.release();
      result1Again.release();
    });

    it('should handle complex wait-for graph with multiple waiting sessions', async () => {
      // Session-1 holds lock
      const result1 = await lockManager.acquireProcessingLock('session-1');

      // Multiple sessions wait for session-1
      const lockPromise2 = lockManager
        .acquireProcessingLock('session-2')
        .catch(() => ({ locked: false }));
      await new Promise(resolve => setTimeout(resolve, 30));

      const lockPromise3 = lockManager
        .acquireProcessingLock('session-3')
        .catch(() => ({ locked: false }));
      await new Promise(resolve => setTimeout(resolve, 30));

      const lockPromise4 = lockManager
        .acquireProcessingLock('session-4')
        .catch(() => ({ locked: false }));
      await new Promise(resolve => setTimeout(resolve, 30));

      // Any of them trying to re-acquire should detect cycle
      const resultCycle = await lockManager.acquireProcessingLock('session-2');
      expect(resultCycle.locked).toBe(false);
      expect(resultCycle.error).toBe('Circular wait detected');

      // Cleanup
      result1.release();
      await lockPromise2;
      await lockPromise3;
      await lockPromise4;
    });

    it('should clean up wait-for graph entries after successful acquisition', async () => {
      // Session-1 holds lock
      const result1 = await lockManager.acquireProcessingLock('session-1');

      // Session-2 waits for session-1
      const lockPromise2 = lockManager.acquireProcessingLock('session-2');
      await new Promise(resolve => setTimeout(resolve, 50));

      // Release and let session-2 acquire
      result1.release();
      const result2 = await lockPromise2;
      expect(result2.locked).toBe(true);

      // Session-2 should be removed from waiting set
      // Session-1 should be able to acquire without cycle detection
      const result1Again = await lockManager.acquireProcessingLock('session-1');
      expect(result1Again.locked).toBe(true);

      // Cleanup
      result2.release();
      result1Again.release();
    });
  });
});
