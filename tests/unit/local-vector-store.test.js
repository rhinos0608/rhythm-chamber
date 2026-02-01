/**
 * LocalVectorStore Concurrency Tests
 *
 * Tests for race condition prevention in js/local-vector-store.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Worker since vitest runs in Node.js
class MockWorker {
  constructor() {
    this.onmessage = null;
    this.onerror = null;
    this.postMessage = vi.fn();
    this.terminate = vi.fn();
  }
}

// Stub global Worker
const originalWorker = globalThis.Worker;
beforeEach(() => {
  globalThis.Worker = MockWorker;
});
afterEach(() => {
  globalThis.Worker = originalWorker;
});

// ==========================================
// Import after mocks are set up
// ==========================================

// Note: We can't directly import LocalVectorStore because it uses IndexedDB
// Instead, we test the patterns by creating isolated functions

// ==========================================
// Race Condition Pattern Tests
// ==========================================

describe('Promise-based Initialization Pattern', () => {
  /**
   * Simulates the race condition fix pattern used in LocalVectorStore
   */
  function createWorkerWithRaceFix() {
    let worker = null;
    let initPromise = null;
    let ready = false;

    async function initAsync() {
      if (worker && ready) return worker;
      if (initPromise) return initPromise;

      initPromise = new Promise(resolve => {
        const w = new MockWorker();
        worker = w;
        ready = true;
        resolve(w);
      });

      return initPromise;
    }

    return { initAsync, getWorker: () => worker, isReady: () => ready };
  }

  it('should initialize worker only once despite concurrent calls', async () => {
    const { initAsync } = createWorkerWithRaceFix();

    // Simulate concurrent initialization attempts
    const [result1, result2, result3] = await Promise.all([initAsync(), initAsync(), initAsync()]);

    // All should return the same worker instance
    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
    expect(result1).toBeInstanceOf(MockWorker);
  });

  it('should return existing worker after initialization', async () => {
    const { initAsync, getWorker } = createWorkerWithRaceFix();

    // First call initializes
    const worker1 = await initAsync();

    // Subsequent calls return same instance
    const worker2 = await initAsync();
    const worker3 = await initAsync();

    expect(getWorker()).toBe(worker1);
    expect(worker2).toBe(worker1);
    expect(worker3).toBe(worker1);
  });

  it('should track ready state correctly', async () => {
    const { initAsync, isReady } = createWorkerWithRaceFix();

    expect(isReady()).toBe(false);

    await initAsync();

    expect(isReady()).toBe(true);
  });
});

// ==========================================
// Pending Searches Pattern Tests
// ==========================================

describe('Pending Searches Map Pattern', () => {
  it('should correlate requests with responses correctly', () => {
    const pendingSearches = new Map();
    let counter = 0;

    function generateId() {
      return `search-${++counter}-${Date.now()}`;
    }

    // Simulate 3 concurrent searches
    const id1 = generateId();
    const id2 = generateId();
    const id3 = generateId();

    const promise1 = new Promise(resolve => pendingSearches.set(id1, { resolve }));
    const promise2 = new Promise(resolve => pendingSearches.set(id2, { resolve }));
    const promise3 = new Promise(resolve => pendingSearches.set(id3, { resolve }));

    expect(pendingSearches.size).toBe(3);
    expect(pendingSearches.has(id1)).toBe(true);
    expect(pendingSearches.has(id2)).toBe(true);
    expect(pendingSearches.has(id3)).toBe(true);

    // Simulate resolving out of order
    pendingSearches.get(id2).resolve('result2');
    pendingSearches.delete(id2);

    expect(pendingSearches.size).toBe(2);
    expect(pendingSearches.has(id2)).toBe(false);
  });

  it('should handle unknown request IDs gracefully', () => {
    const pendingSearches = new Map();
    const unknownId = 'unknown-123';

    const pending = pendingSearches.get(unknownId);

    expect(pending).toBeUndefined();
  });
});

// ==========================================
// Worker Error Recovery Tests
// ==========================================

describe('Worker Error Recovery Pattern', () => {
  it('should clear pending searches on worker crash', () => {
    const pendingSearches = new Map();
    let workerReady = true;
    let initPromise = {};

    // Simulate 2 pending searches
    pendingSearches.set('search-1', { resolve: vi.fn(), reject: vi.fn() });
    pendingSearches.set('search-2', { resolve: vi.fn(), reject: vi.fn() });

    expect(pendingSearches.size).toBe(2);

    // Simulate worker crash recovery
    function handleWorkerError() {
      for (const [id, pending] of pendingSearches) {
        pending.reject(new Error('Worker crashed'));
      }
      pendingSearches.clear();
      workerReady = false;
      initPromise = null;
    }

    handleWorkerError();

    expect(pendingSearches.size).toBe(0);
    expect(workerReady).toBe(false);
    expect(initPromise).toBeNull();
  });

  it('should allow retry after crash by resetting initPromise', async () => {
    let initPromise = null;
    let crashCount = 0;

    async function initWithRetry() {
      if (initPromise) return initPromise;

      initPromise = new Promise((resolve, reject) => {
        if (crashCount < 1) {
          crashCount++;
          // Simulate worker crash - reset promise and reject
          setTimeout(() => {
            initPromise = null;
          }, 0);
          reject(new Error('Simulated crash'));
        } else {
          resolve(new MockWorker());
        }
      });

      return initPromise;
    }

    // First attempt fails
    let firstError = null;
    try {
      await initWithRetry();
    } catch (e) {
      firstError = e;
    }
    expect(firstError?.message).toBe('Simulated crash');

    // Wait for promise reset
    await new Promise(r => setTimeout(r, 10));

    // Retry succeeds
    const worker = await initWithRetry();
    expect(worker).toBeInstanceOf(MockWorker);
  });
});

// ==========================================
// Timeout Fallback Tests
// ==========================================

describe('Timeout Fallback Pattern', () => {
  it('should fallback to sync after timeout', async () => {
    vi.useFakeTimers();

    let fallbackCalled = false;
    const syncFallback = () => {
      fallbackCalled = true;
      return [];
    };

    // Simulate timeout scenario
    const promise = new Promise(resolve => {
      const timeout = setTimeout(() => {
        resolve(syncFallback());
      }, 30000);
    });

    // Fast-forward time
    vi.advanceTimersByTime(30001);

    const result = await promise;

    expect(fallbackCalled).toBe(true);
    expect(result).toEqual([]);

    vi.useRealTimers();
  });
});
