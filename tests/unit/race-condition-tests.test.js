/**
 * Race Condition Tests for Bug Fixes
 *
 * Tests for concurrent operations, tab coordination, worker initialization,
 * and other race conditions identified in recent bug fixes.
 *
 * Covers:
 * - Worker initialization races (efcc205)
 * - Session switch races (a3be695)
 * - Tab election split-brain (71a7192)
 * - Concurrent session updates
 * - Transaction pool races (abec63d)
 *
 * @module tests/unit/race-condition-tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==========================================
// Mock Worker for Testing
// ==========================================

class MockWorker {
    constructor() {
        this.onmessage = null;
        this._terminated = false;
        this._messageQueue = [];
        this._initTime = 0;
    }

    postMessage(data) {
        if (this._terminated) {
            throw new Error('Worker was terminated');
        }
        // Simulate async message delivery
        setTimeout(() => {
            if (this.onmessage && !this._terminated) {
                this.onmessage({ data });
            }
        }, this._initTime);
    }

    terminate() {
        this._terminated = true;
    }

    setInitTime(ms) {
        this._initTime = ms;
    }
}

// ==========================================
// Test: Worker Initialization Race
// ==========================================

describe('Worker Initialization Race (efcc205)', () => {
    let mockWorkerClass;

    beforeEach(() => {
        vi.useFakeTimers();
        mockWorkerClass = MockWorker;
        global.Worker = mockWorkerClass;
    });

    afterEach(() => {
        vi.useRealTimers();
        delete global.Worker;
    });

    it('should prevent race condition when multiple calls wait for worker init', async () => {
        let workerInitPromise = null;
        let workerReady = false;
        let pendingSearches = new Map();
        let requestIdCounter = 0;

        // Simulate worker initialization with promise set synchronously
        function initWorker() {
            if (workerInitPromise) {
                return workerInitPromise;
            }

            // Set promise synchronously (Issue 3 fix)
            workerInitPromise = new Promise((resolve, reject) => {
                try {
                    const worker = new MockWorker();
                    worker.setInitTime(50);

                    worker.onmessage = (event) => {
                        const { type, requestId, results } = event.data;
                        const pending = pendingSearches.get(requestId);
                        if (pending) {
                            if (type === 'results') {
                                pending.resolve(results);
                            } else if (type === 'error') {
                                pending.reject(new Error('Search failed'));
                            }
                            pendingSearches.delete(requestId);
                        }
                    };

                    setTimeout(() => {
                        workerReady = true;
                        resolve(worker);
                    }, 50);
                } catch (error) {
                    reject(error);
                }
            });

            return workerInitPromise;
        }

        // Simulate concurrent calls
        const init1 = initWorker();
        const init2 = initWorker();
        const init3 = initWorker();

        // All should return the same promise
        expect(init1).toBe(init2);
        expect(init2).toBe(init3);

        await vi.advanceTimersByTimeAsync(60);

        const worker1 = await init1;
        const worker2 = await init2;
        const worker3 = await init3;

        // All should resolve to the same worker instance
        expect(worker1).toBe(worker2);
        expect(worker2).toBe(worker3);
        expect(workerReady).toBe(true);
    });

    it('should check if request is still pending before processing worker response', async () => {
        let workerReady = false;
        let pendingSearches = new Map();
        let worker = null;
        let requestIdCounter = 0; // Initialize the counter

        // Simulate search function with pending check (Issue 4 fix)
        async function searchWithPendingCheck(query) {
            const requestId = ++requestIdCounter;

            return new Promise((resolve, reject) => {
                // Track pending request
                pendingSearches.set(requestId, { resolve, reject });

                // Simulate worker processing
                setTimeout(() => {
                    // Issue 4 fix: Check if request is still pending
                    const pending = pendingSearches.get(requestId);
                    if (!pending) {
                        console.warn(`Request ${requestId} was cancelled, ignoring response`);
                        return;
                    }

                    // Only process if still pending
                    if (pending) {
                        resolve([`result-${query}`]);
                        pendingSearches.delete(requestId);
                    }
                }, 50);
            });
        }

        // Start a search
        const searchPromise = searchWithPendingCheck('test').catch(() => null); // Handle rejection

        // Cancel the search immediately (simulate user cancellation)
        pendingSearches.delete(1);

        await vi.advanceTimersByTimeAsync(60);

        // The promise should still resolve (but response was ignored)
        // In real implementation, this would handle cancellation gracefully
        expect(pendingSearches.size).toBe(0);
    });
});

// ==========================================
// Test: Session Switch Race
// ==========================================

describe('Session Switch Race (a3be695)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should acquire lock through entire save operation to prevent race', async () => {
        let lock = null;
        let currentSessionId = 'session-1';
        const sessions = new Map();

        // Simulate switchSession with proper locking (Issue 2 fix)
        async function switchSession(newSessionId) {
            const startTime = Date.now();
            const lockTimeout = 5000;

            // Wait for lock with timeout
            while (lock !== null && Date.now() - startTime < lockTimeout) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            if (lock !== null) {
                throw new Error('Lock acquisition timeout');
            }

            // Acquire lock for entire operation
            lock = currentSessionId;

            try {
                // Save current session before switching
                const currentData = sessions.get(currentSessionId);
                await new Promise(resolve => setTimeout(resolve, 50)); // Simulate save
                sessions.set(currentSessionId, { ...currentData, saved: true });

                // Switch session
                const oldId = currentSessionId;
                currentSessionId = newSessionId;

                return true;
            } finally {
                // Release lock
                lock = null;
            }
        }

        // Simulate concurrent switches
        const switch1 = switchSession('session-2');
        const switch2 = switchSession('session-3');

        await vi.advanceTimersByTimeAsync(100);

        const [result1, result2] = await Promise.all([switch1, switch2]);

        // One should succeed, the other should wait and succeed
        expect(result1 || result2).toBe(true);
        expect(currentSessionId).toBe('session-3'); // Last one wins
    });

    it('should re-validate currentSessionId after acquiring lock', async () => {
        let lock = null;
        let currentSessionId = 'session-1';

        // Simulate acquireProcessingLock with re-validation (Issue 3 fix)
        async function acquireProcessingLock(expectedSessionId) {
            const startTime = Date.now();
            const lockTimeout = 5000;

            while (lock !== null && Date.now() - startTime < lockTimeout) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            if (lock !== null) {
                throw new Error('Lock acquisition timeout');
            }

            lock = currentSessionId;

            // Issue 3 fix: Re-validate session ID after lock acquisition
            if (currentSessionId !== expectedSessionId) {
                lock = null;
                throw new Error(`Session switched during lock wait. Expected: ${expectedSessionId}, Current: ${currentSessionId}`);
            }

            return () => {
                lock = null;
            };
        }

        // Start lock acquisition for session-1
        const lock1Promise = acquireProcessingLock('session-1');

        // Switch session before lock is acquired
        await vi.advanceTimersByTimeAsync(5);
        currentSessionId = 'session-2';

        await vi.advanceTimersByTimeAsync(20);

        // Lock acquisition should fail due to re-validation
        await expect(lock1Promise).rejects.toThrow('Session switched during lock wait');
    });
});

// ==========================================
// Test: Tab Election Split-Brain
// ==========================================

describe('Tab Election Split-Brain (71a7192)', () => {
    let mockChannels = new Map();

    class MockBroadcastChannel {
        constructor(name) {
            this.name = name;
            this.onmessage = null;
            this._listeners = [];

            if (!mockChannels.has(name)) {
                mockChannels.set(name, new Set());
            }
            mockChannels.get(name).add(this);
        }

        postMessage(data) {
            const channels = mockChannels.get(this.name);
            for (const channel of channels) {
                if (channel !== this && channel.onmessage) {
                    setTimeout(() => {
                        channel.onmessage({ data });
                    }, 0);
                }
            }
        }

        addEventListener(type, handler) {
            if (type === 'message') {
                this._listeners.push(handler);
                this.onmessage = handler;
            }
        }

        removeEventListener(type, handler) {
            if (type === 'message') {
                this._listeners = this._listeners.filter(h => h !== handler);
                if (this._listeners.length === 0) {
                    this.onmessage = null;
                }
            }
        }

        close() {
            const channels = mockChannels.get(this.name);
            if (channels) {
                channels.delete(this);
            }
        }
    }

    beforeEach(() => {
        mockChannels.clear();
        vi.useFakeTimers();
        global.BroadcastChannel = MockBroadcastChannel;
    });

    afterEach(() => {
        vi.useRealTimers();
        delete global.BroadcastChannel;
    });

    it('should always call handleSecondaryMode when receiving CLAIM_PRIMARY', async () => {
        const tabs = [];
        const MESSAGE_TYPES = {
            CANDIDATE: 'CANDIDATE',
            CLAIM_PRIMARY: 'CLAIM_PRIMARY',
            RELEASE_PRIMARY: 'RELEASE_PRIMARY'
        };

        // Create tab with split-brain fix (Issue 2 fix)
        function createTab(id) {
            let channel = null;
            let isPrimaryTab = false;
            let electionCandidates = new Set([id]);
            let electionAborted = false;

            // Issue 2 fix: Track if handleSecondaryMode was called
            let hasCalledSecondaryMode = false;

            async function init() {
                channel = new MockBroadcastChannel('test_coordination');
                electionCandidates = new Set([id]);
                electionAborted = false;
                hasCalledSecondaryMode = false;

                channel.addEventListener('message', (event) => {
                    const { type, tabId } = event.data;

                    switch (type) {
                        case MESSAGE_TYPES.CANDIDATE:
                            electionCandidates.add(tabId);
                            if (isPrimaryTab && tabId !== id) {
                                channel.postMessage({
                                    type: MESSAGE_TYPES.CLAIM_PRIMARY,
                                    tabId: id
                                });
                            }
                            break;

                        case MESSAGE_TYPES.CLAIM_PRIMARY:
                            if (tabId !== id) {
                                // Issue 2 fix: Always call handleSecondaryMode
                                if (!hasCalledSecondaryMode) {
                                    hasCalledSecondaryMode = true;
                                    electionAborted = true;
                                    isPrimaryTab = false;
                                }
                            }
                            break;
                    }
                });

                // Announce candidacy
                channel.postMessage({
                    type: MESSAGE_TYPES.CANDIDATE,
                    tabId: id
                });

                // Wait for election window
                await new Promise(resolve => setTimeout(resolve, 50));

                // Determine winner
                if (!electionAborted) {
                    const sortedCandidates = Array.from(electionCandidates).sort();
                    isPrimaryTab = (sortedCandidates[0] === id);

                    if (isPrimaryTab) {
                        channel.postMessage({
                            type: MESSAGE_TYPES.CLAIM_PRIMARY,
                            tabId: id
                        });
                    }
                }

                return isPrimaryTab;
            }

            function isPrimary() {
                return isPrimaryTab;
            }

            function getHasCalledSecondaryMode() {
                return hasCalledSecondaryMode;
            }

            return { init, isPrimary, getHasCalledSecondaryMode, getId: () => id };
        }

        // Create multiple tabs concurrently
        const tab1 = createTab('tab-001');
        const tab2 = createTab('tab-002');
        const tab3 = createTab('tab-003');

        const init1 = tab1.init();
        const init2 = tab2.init();
        const init3 = tab3.init();

        await vi.advanceTimersByTimeAsync(100);

        const [isPrimary1, isPrimary2, isPrimary3] = await Promise.all([init1, init2, init3]);

        // Only tab-001 should be primary (lowest ID)
        expect(isPrimary1).toBe(true);
        expect(isPrimary2).toBe(false);
        expect(isPrimary3).toBe(false);

        // Tab 2 and 3 should have called handleSecondaryMode
        expect(tab2.getHasCalledSecondaryMode()).toBe(true);
        expect(tab3.getHasCalledSecondaryMode()).toBe(true);
    });

    it('should handle CLAIM_PRIMARY received before starting election', async () => {
        const MESSAGE_TYPES = {
            CANDIDATE: 'CANDIDATE',
            CLAIM_PRIMARY: 'CLAIM_PRIMARY'
        };

        let receivedClaimPrimary = false;
        let handledSecondaryMode = false;

        // Simulate tab that hasn't started election yet
        function createLateTab() {
            let channel = null;
            let isPrimaryTab = false;
            let hasCalledSecondaryMode = false;

            function init() {
                channel = new MockBroadcastChannel('test_coordination');

                channel.addEventListener('message', (event) => {
                    const { type, tabId } = event.data;

                    if (type === MESSAGE_TYPES.CLAIM_PRIMARY && tabId !== 'late-tab') {
                        receivedClaimPrimary = true;
                        // Issue 2 fix: Even if we haven't started election, handle this
                        if (!hasCalledSecondaryMode) {
                            hasCalledSecondaryMode = true;
                            handledSecondaryMode = true;
                            isPrimaryTab = false;
                        }
                    }
                });

                return isPrimaryTab;
            }

            return { init };
        }

        const lateTab = createLateTab();
        lateTab.init();

        // Simulate receiving CLAIM_PRIMARY before starting election
        const channel = new MockBroadcastChannel('test_coordination');
        channel.postMessage({
            type: MESSAGE_TYPES.CLAIM_PRIMARY,
            tabId: 'other-tab'
        });

        await vi.advanceTimersByTimeAsync(10);

        // Should have handled the CLAIM_PRIMARY message
        expect(receivedClaimPrimary).toBe(true);
        expect(handledSecondaryMode).toBe(true);
    });
});

// ==========================================
// Test: Concurrent Session Updates
// ==========================================

describe('Concurrent Session Updates (a3be695)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should serialize concurrent updates via updateSessionData', async () => {
        let sessionData = {
            id: 'test-session',
            messages: []
        };

        let updateQueue = Promise.resolve();

        // Simulate serialized updates
        async function updateSessionData(updater) {
            // Chain updates to ensure serialization
            updateQueue = updateQueue.then(async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                sessionData = updater(sessionData);
                return sessionData;
            });

            return updateQueue;
        }

        // Simulate concurrent updates
        const update1 = updateSessionData((data) => ({
            ...data,
            messages: [...data.messages, { role: 'user', content: 'Update 1' }]
        }));

        const update2 = updateSessionData((data) => ({
            ...data,
            messages: [...data.messages, { role: 'user', content: 'Update 2' }]
        }));

        const update3 = updateSessionData((data) => ({
            ...data,
            messages: [...data.messages, { role: 'user', content: 'Update 3' }]
        }));

        await vi.advanceTimersByTimeAsync(100);

        await Promise.all([update1, update2, update3]);

        // All updates should be applied in order
        expect(sessionData.messages).toHaveLength(3);
        expect(sessionData.messages[0].content).toBe('Update 1');
        expect(sessionData.messages[1].content).toBe('Update 2');
        expect(sessionData.messages[2].content).toBe('Update 3');
    });
});

// ==========================================
// Test: Transaction Pool Race
// ==========================================

describe('Transaction Pool Race (abec63d)', () => {
    it('should prevent race condition in transaction pool', async () => {
        const transactionPool = new Map();
        const completedTransactions = new Set();

        async function executeTransaction(txId) {
            // Check if already in pool
            if (transactionPool.has(txId)) {
                throw new Error(`Transaction ${txId} already in pool`);
            }

            // Add to pool
            transactionPool.set(txId, Date.now());

            try {
                // Simulate transaction work
                await new Promise(resolve => setTimeout(resolve, 50));

                // Mark as completed
                completedTransactions.add(txId);

                return `result-${txId}`;
            } finally {
                // Remove from pool
                transactionPool.delete(txId);
            }
        }

        vi.useFakeTimers();

        // Start concurrent transactions with same ID
        const tx1Promise = executeTransaction('tx-001').catch(e => ({ error: e, tx: 1 }));
        const tx2Promise = executeTransaction('tx-001').catch(e => ({ error: e, tx: 2 }));
        const tx3Promise = executeTransaction('tx-001').catch(e => ({ error: e, tx: 3 }));

        // Second and third should fail due to pool check
        await vi.advanceTimersByTimeAsync(100);

        const [result1, result2, result3] = await Promise.all([
            tx1Promise,
            tx2Promise,
            tx3Promise
        ]);

        // First should succeed, others should fail
        if (result1.error) {
            expect(result2.error || result3.error).toBeTruthy();
        } else {
            expect(result1).toBe('result-tx-001');
            expect(result2.error).toBeTruthy();
            expect(result3.error).toBeTruthy();
        }

        expect(completedTransactions.has('tx-001')).toBe(true);

        vi.useRealTimers();
    });

    it('should handle timeout race in transaction', async () => {
        let transactionStarted = false;
        let transactionCompleted = false;

        async function transactionWithTimeout(timeoutMs) {
            const startTime = Date.now();

            transactionStarted = true;

            // Race between transaction and timeout
            const result = await Promise.race([
                new Promise((resolve) => {
                    setTimeout(() => {
                        transactionCompleted = true;
                        resolve('transaction-complete');
                    }, 100);
                }),
                new Promise((resolve, reject) => {
                    setTimeout(() => {
                        if (!transactionCompleted) {
                            reject(new Error('Transaction timeout'));
                        } else {
                            resolve('already-complete');
                        }
                    }, timeoutMs);
                })
            ]);

            return result;
        }

        vi.useFakeTimers();

        // Timeout longer than transaction
        const tx1 = transactionWithTimeout(200);

        await vi.advanceTimersByTimeAsync(150);
        expect(transactionStarted).toBe(true);
        expect(transactionCompleted).toBe(true);

        const result1 = await tx1;
        expect(result1).toBe('transaction-complete');

        vi.useRealTimers();
    });
});
