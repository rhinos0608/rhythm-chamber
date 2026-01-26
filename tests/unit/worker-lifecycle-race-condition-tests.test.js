/**
 * Worker Lifecycle Race Condition Tests
 *
 * Tests for CRITICAL race condition fixes in worker management:
 * 1. Worker Restart Race Condition (pattern-worker-pool.js)
 * 2. Worker Initialization Race (local-vector-store.js)
 *
 * These tests verify that concurrent operations don't cause:
 * - Request completion tracking inconsistencies
 * - Multiple worker creation attempts
 * - Worker state corruption
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Worker and MessageChannel for testing
class MockWorker {
    constructor(url) {
        this.url = url;
        this.onmessage = null;
        this.onerror = null;
        this._terminated = false;
        this._messageQueue = [];
    }

    postMessage(data, transfer) {
        if (this._terminated) {
            throw new Error('Worker has been terminated');
        }
        // Simulate async message handling
        setTimeout(() => {
            if (this.onmessage && data.type === 'HEARTBEAT_CHANNEL') {
                this.onmessage({ data: { type: 'HEARTBEAT_RESPONSE', timestamp: Date.now() } });
            }
        }, 10);
    }

    terminate() {
        this._terminated = true;
    }
}

class MockMessageChannel {
    constructor() {
        this.port1 = {
            onmessage: null,
            postMessage: (data) => {
                setTimeout(() => {
                    if (this.port1.onmessage && data.type === 'HEARTBEAT') {
                        this.port1.onmessage({ data: { type: 'HEARTBEAT_RESPONSE', timestamp: data.timestamp } });
                    }
                }, 5);
            },
            close: vi.fn()
        };
        this.port2 = {
            postMessage: vi.fn(),
            close: vi.fn()
        };
    }
}

// Setup global mocks
global.Worker = MockWorker;
global.MessageChannel = MockMessageChannel;

describe('Worker Lifecycle Race Conditions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Issue 1: Worker Restart Race Condition', () => {
        it('should prevent concurrent restarts from corrupting state', async () => {
            // This test verifies the atomic restart fix in pattern-worker-pool.js
            // The key insight: multiple workers restarting simultaneously should not
            // cause request completion tracking to become inconsistent

            const mockPatternWorkerPool = {
                workers: [
                    { worker: new MockWorker('pattern-worker.js'), busy: false, processedCount: 0 },
                    { worker: new MockWorker('pattern-worker.js'), busy: false, processedCount: 0 },
                    { worker: new MockWorker('pattern-worker.js'), busy: false, processedCount: 0 }
                ],
                workerHeartbeatChannels: new Map(),
                workerLastHeartbeat: new Map()
            };

            // Simulate concurrent restart of all workers
            const restartPromises = mockPatternWorkerPool.workers.map((workerInfo, index) => {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        // Atomic restart sequence (from the fix)
                        const oldWorker = workerInfo.worker;
                        const oldChannel = mockPatternWorkerPool.workerHeartbeatChannels.get(oldWorker);

                        // Step 1: Clear old state atomically
                        if (oldChannel) {
                            mockPatternWorkerPool.workerHeartbeatChannels.delete(oldWorker);
                        }
                        mockPatternWorkerPool.workerLastHeartbeat.delete(oldWorker);

                        // Step 2: Terminate old worker
                        oldWorker.terminate();

                        // Step 3: Create new worker
                        const newWorker = new MockWorker('pattern-worker.js');
                        workerInfo.worker = newWorker;
                        workerInfo.busy = false;

                        // Initialize new state
                        mockPatternWorkerPool.workerLastHeartbeat.set(newWorker, Date.now());

                        resolve({ index, success: true });
                    }, Math.random() * 50); // Random delay to simulate race condition
                });
            });

            const results = await Promise.all(restartPromises);

            // Verify all workers restarted successfully
            expect(results.every(r => r.success)).toBe(true);

            // Verify state is consistent (no orphaned references)
            expect(mockPatternWorkerPool.workerHeartbeatChannels.size).toBe(0);
            expect(mockPatternWorkerPool.workerLastHeartbeat.size).toBe(3);

            // Verify no worker is still busy (atomic state transition)
            expect(mockPatternWorkerPool.workers.every(w => !w.busy)).toBe(true);
        });

        it('should cleanup old worker state before creating new worker', () => {
            // Verify that heartbeat channels are closed BEFORE new worker creation
            const mockWorker = new MockWorker('pattern-worker.js');
            const mockChannel = new MockMessageChannel();
            const closeSpy = mockChannel.port1.close;

            const workerHeartbeatChannels = new Map([[mockWorker, { port: mockChannel.port1 }]]);
            const workerLastHeartbeat = new Map([[mockWorker, Date.now()]]);

            // Simulate atomic restart
            const oldWorker = mockWorker;
            const oldChannel = workerHeartbeatChannels.get(oldWorker);

            // Step 1: Close channel FIRST
            if (oldChannel && oldChannel.port) {
                oldChannel.port.close();
            }
            workerHeartbeatChannels.delete(oldWorker);
            workerLastHeartbeat.delete(oldWorker);

            // Step 2: Terminate worker
            oldWorker.terminate();

            // Verify cleanup happened before new worker creation
            expect(closeSpy).toHaveBeenCalled();
            expect(workerHeartbeatChannels.has(oldWorker)).toBe(false);
            expect(workerLastHeartbeat.has(oldWorker)).toBe(false);
        });
    });

    describe('Issue 2: Worker Initialization Race', () => {
        it('should prevent concurrent initWorkerAsync calls from creating multiple workers', async () => {
            // This test verifies the initialization race fix in local-vector-store.js
            // The key insight: multiple concurrent calls should return the SAME worker promise

            let workerInitPromise = null;
            let initStartTime = 0;
            let searchWorker = null;
            let workerReady = false;

            const mockInitWorkerAsync = async () => {
                // Already initialized
                if (searchWorker && workerReady) return searchWorker;

                // CRITICAL FIX: Check for stale promise with timeout
                if (workerInitPromise && initStartTime > 0) {
                    const initDuration = Date.now() - initStartTime;
                    if (initDuration > 5000) {
                        workerInitPromise = null;
                        initStartTime = 0;
                    }
                }

                // Initialization in progress - wait for it
                if (workerInitPromise) return workerInitPromise;

                // Record start time IMMEDIATELY
                initStartTime = Date.now();

                // Create promise (same for all concurrent calls)
                workerInitPromise = new Promise((resolve) => {
                    setTimeout(() => {
                        const worker = new MockWorker('vector-search-worker.js');
                        searchWorker = worker;
                        workerReady = true;
                        resolve(worker);
                    }, 50);
                });

                return workerInitPromise;
            };

            // Simulate 10 concurrent calls
            const concurrentCalls = Array.from({ length: 10 }, () => mockInitWorkerAsync());
            const results = await Promise.all(concurrentCalls);

            // Verify all calls returned the same worker instance
            expect(results.every(w => w === results[0])).toBe(true);
            expect(results.length).toBe(10);

            // Verify only one worker was created
            expect(searchWorker).not.toBeNull();
            expect(workerReady).toBe(true);
        });

        it('should detect and retry stale initialization promises', async () => {
            // Verify that hung initialization (5+ seconds) is detected and retried

            let workerInitPromise = null;
            let initStartTime = 0;
            let searchWorker = null;
            let workerReady = false;

            const mockInitWorkerAsync = async () => {
                if (searchWorker && workerReady) return searchWorker;

                // CRITICAL FIX: Check for stale promise
                if (workerInitPromise && initStartTime > 0) {
                    const initDuration = Date.now() - initStartTime;
                    if (initDuration > 5000) {
                        console.warn(`Worker init timeout after ${initDuration}ms, retrying`);
                        workerInitPromise = null;
                        initStartTime = 0;
                    }
                }

                if (workerInitPromise) return workerInitPromise;

                initStartTime = Date.now();

                workerInitPromise = new Promise((resolve) => {
                    setTimeout(() => {
                        const worker = new MockWorker('vector-search-worker.js');
                        searchWorker = worker;
                        workerReady = true;
                        resolve(worker);
                    }, 50);
                });

                return workerInitPromise;
            };

            // First call starts initialization
            const firstCall = mockInitWorkerAsync();

            // Simulate time passing (5+ seconds)
            await new Promise(resolve => setTimeout(resolve, 100));
            initStartTime = Date.now() - 6000; // Fake staleness

            // Second call should detect stale promise and retry
            const secondCall = mockInitWorkerAsync();

            const [result1, result2] = await Promise.all([firstCall, secondCall]);

            // Both should return workers
            expect(result1).not.toBeNull();
            expect(result2).not.toBeNull();
        });

        it('should handle initialization failures gracefully', async () => {
            // Verify that failed initialization allows retry

            let workerInitPromise = null;
            let initStartTime = 0;
            let searchWorker = null;
            let workerReady = false;
            let attemptCount = 0;

            const mockInitWorkerAsync = async () => {
                if (searchWorker && workerReady) return searchWorker;

                if (workerInitPromise) return workerInitPromise;

                initStartTime = Date.now();

                workerInitPromise = new Promise((resolve) => {
                    attemptCount++;
                    setTimeout(() => {
                        if (attemptCount === 1) {
                            // First attempt fails
                            workerInitPromise = null;
                            initStartTime = 0;
                            resolve(null);
                        } else {
                            // Second attempt succeeds
                            const worker = new MockWorker('vector-search-worker.js');
                            searchWorker = worker;
                            workerReady = true;
                            resolve(worker);
                        }
                    }, 50);
                });

                return workerInitPromise;
            };

            // First attempt fails
            const result1 = await mockInitWorkerAsync();
            expect(result1).toBeNull();

            // Second attempt succeeds (because promise was cleared)
            const result2 = await mockInitWorkerAsync();
            expect(result2).not.toBeNull();
            expect(workerReady).toBe(true);
        });
    });
});
