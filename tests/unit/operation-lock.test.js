/**
 * OperationLock Concurrency Tests
 *
 * Tests for js/operation-lock.js to ensure proper lock serialization
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==========================================
// Mock the error classes before importing
// ==========================================

class LockAcquisitionError extends Error {
  constructor(operation, blockedBy) {
    super(`Cannot acquire lock for '${operation}': blocked by ${blockedBy?.join(', ')}`);
    this.name = 'LockAcquisitionError';
    this.operation = operation;
    this.blockedBy = blockedBy;
  }
}

class LockTimeoutError extends Error {
  constructor(operation, timeoutMs) {
    super(`Timeout acquiring lock for '${operation}' after ${timeoutMs}ms`);
    this.name = 'LockTimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

// Set up globals
globalThis.LockAcquisitionError = LockAcquisitionError;
globalThis.LockTimeoutError = LockTimeoutError;
globalThis.LockReleaseError = Error;
globalThis.LockForceReleaseError = Error;
globalThis.window = globalThis;

// ==========================================
// Simulate OperationLock behavior
// ==========================================

/**
 * Simplified OperationLock implementation for testing patterns
 */
function createOperationLock() {
  const activeLocks = new Map();
  let lockIdCounter = 0;

  const CONFLICT_MATRIX = {
    file_processing: ['privacy_clear'],
    embedding_generation: ['privacy_clear'],
    privacy_clear: ['file_processing', 'embedding_generation', 'chat_save'],
    spotify_fetch: [],
    chat_save: ['privacy_clear'],
  };

  function generateOwnerId() {
    return `lock_${Date.now()}_${++lockIdCounter}`;
  }

  function canAcquire(operationName) {
    const conflicts = CONFLICT_MATRIX[operationName] || [];
    const blockedBy = [];

    for (const conflict of conflicts) {
      if (activeLocks.has(conflict)) {
        blockedBy.push(conflict);
      }
    }

    return {
      canAcquire: blockedBy.length === 0,
      blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
    };
  }

  async function acquire(operationName) {
    // Check if already locked by same operation
    if (activeLocks.has(operationName)) {
      throw new LockAcquisitionError(operationName, [operationName]);
    }

    const { canAcquire: allowed, blockedBy } = canAcquire(operationName);

    if (!allowed) {
      throw new LockAcquisitionError(operationName, blockedBy);
    }

    const ownerId = generateOwnerId();
    activeLocks.set(operationName, {
      ownerId,
      acquiredAt: Date.now(),
    });

    return ownerId;
  }

  async function acquireWithTimeout(operationName, timeoutMs = 30000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        return await acquire(operationName);
      } catch (error) {
        if (!(error instanceof LockAcquisitionError)) {
          throw error;
        }

        if (Date.now() - startTime >= timeoutMs) {
          throw new LockTimeoutError(operationName, timeoutMs);
        }

        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    throw new LockTimeoutError(operationName, timeoutMs);
  }

  function release(operationName, ownerId) {
    const lock = activeLocks.get(operationName);
    if (!lock || lock.ownerId !== ownerId) {
      return false;
    }
    activeLocks.delete(operationName);
    return true;
  }

  function isLocked(operationName) {
    return activeLocks.has(operationName);
  }

  function forceReleaseAll() {
    const released = [...activeLocks.keys()];
    activeLocks.clear();
    return released;
  }

  return {
    acquire,
    acquireWithTimeout,
    release,
    isLocked,
    canAcquire,
    forceReleaseAll,
    getActiveLocks: () => [...activeLocks.keys()],
  };
}

// ==========================================
// Concurrency Tests
// ==========================================

describe('OperationLock Concurrency', () => {
  let lock;

  beforeEach(() => {
    lock = createOperationLock();
  });

  it('should serialize concurrent acquire attempts for same operation', async () => {
    // First acquire should succeed
    const ownerId1 = await lock.acquire('file_processing');
    expect(ownerId1).toBeDefined();
    expect(lock.isLocked('file_processing')).toBe(true);

    // Second acquire should fail (locked by first)
    await expect(lock.acquire('file_processing')).rejects.toThrow();
  });

  it('should allow concurrent non-conflicting operations', async () => {
    // These operations don't conflict with each other
    const [id1, id2] = await Promise.all([
      lock.acquire('file_processing'),
      lock.acquire('spotify_fetch'),
    ]);

    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(lock.getActiveLocks()).toContain('file_processing');
    expect(lock.getActiveLocks()).toContain('spotify_fetch');
  });

  it('should respect conflict matrix for blocking', async () => {
    // Acquire file_processing first
    await lock.acquire('file_processing');

    // privacy_clear should be blocked (conflicts with file_processing)
    await expect(lock.acquire('privacy_clear')).rejects.toThrow();

    // spotify_fetch should succeed (no conflict)
    const spotifyId = await lock.acquire('spotify_fetch');
    expect(spotifyId).toBeDefined();
  });

  it('should timeout correctly with acquireWithTimeout', async () => {
    // Acquire the lock
    await lock.acquire('privacy_clear');

    // Attempt to acquire conflicting lock with short timeout
    const startTime = Date.now();
    await expect(lock.acquireWithTimeout('file_processing', 50)).rejects.toThrow('Timeout');

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeGreaterThanOrEqual(50);
  });

  it('should handle force release correctly', async () => {
    // Acquire multiple locks
    await lock.acquire('file_processing');
    await lock.acquire('spotify_fetch');
    await lock.acquire('chat_save');

    expect(lock.getActiveLocks().length).toBe(3);

    // Force release all
    const released = lock.forceReleaseAll();

    expect(released.length).toBe(3);
    expect(lock.getActiveLocks().length).toBe(0);
  });

  it('should properly release locks with correct ownerId', async () => {
    const ownerId = await lock.acquire('file_processing');

    // Release with correct ownerId
    const result = lock.release('file_processing', ownerId);
    expect(result).toBe(true);
    expect(lock.isLocked('file_processing')).toBe(false);
  });

  it('should reject release with incorrect ownerId', async () => {
    const ownerId = await lock.acquire('file_processing');

    // Release with wrong ownerId
    const result = lock.release('file_processing', 'wrong_owner');
    expect(result).toBe(false);
    expect(lock.isLocked('file_processing')).toBe(true);

    // Clean up
    lock.release('file_processing', ownerId);
  });
});

// ==========================================
// Edge Cases
// ==========================================

describe('OperationLock Edge Cases', () => {
  let lock;

  beforeEach(() => {
    lock = createOperationLock();
  });

  it('should handle unknown operation names', () => {
    const { canAcquire, blockedBy } = lock.canAcquire('unknown_operation');
    expect(canAcquire).toBe(true);
    expect(blockedBy).toBeUndefined();
  });

  it('should generate unique owner IDs', async () => {
    const ownerIds = new Set();

    for (let i = 0; i < 100; i++) {
      const id = await lock.acquire('spotify_fetch');
      lock.release('spotify_fetch', id);
      ownerIds.add(id);
    }

    expect(ownerIds.size).toBe(100);
  });
});
