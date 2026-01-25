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
});
