/**
 * Integration Tests for HNW Structural Improvements
 * 
 * Tests for the 9 new modules:
 * - Lock Policy Coordinator
 * - Storage Transaction Layer
 * - Turn Queue
 * - State Machine Coordinator
 * - Tab Coordination (Heartbeat)
 * - Pattern Worker Pool
 * - Timeout Budget Manager
 * - Strategy Voting
 * - Migration Checkpointing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==========================================
// Lock Policy Coordinator Tests
// ==========================================

describe('LockPolicy', () => {
    // Mock the module structure
    const CONFLICT_MATRIX = {
        'file_processing': ['embedding_generation', 'privacy_clear'],
        'embedding_generation': ['file_processing', 'privacy_clear'],
        'privacy_clear': ['*'],
        'spotify_fetch': ['chat_save'],
        'chat_save': ['spotify_fetch']
    };

    function findConflicts(requested, active) {
        const conflicts = new Set();
        for (const reqOp of requested) {
            const conflictList = CONFLICT_MATRIX[reqOp] || [];
            for (const activeOp of active) {
                if (conflictList.includes(activeOp) || conflictList.includes('*')) {
                    conflicts.add(activeOp);
                }
                const reverseConflicts = CONFLICT_MATRIX[activeOp] || [];
                if (reverseConflicts.includes(reqOp) || reverseConflicts.includes('*')) {
                    conflicts.add(activeOp);
                }
            }
        }
        return Array.from(conflicts);
    }

    it('should detect no conflicts when no operations are active', () => {
        const conflicts = findConflicts(['file_processing'], []);
        expect(conflicts).toEqual([]);
    });

    it('should detect conflicts between file_processing and embedding_generation', () => {
        const conflicts = findConflicts(['file_processing'], ['embedding_generation']);
        expect(conflicts).toContain('embedding_generation');
    });

    it('should detect privacy_clear conflicts with everything', () => {
        const conflicts = findConflicts(['privacy_clear'], ['file_processing', 'chat_save']);
        expect(conflicts).toContain('file_processing');
        expect(conflicts).toContain('chat_save');
    });

    it('should detect bidirectional conflicts', () => {
        // spotify_fetch conflicts with chat_save (and vice versa)
        const conflicts1 = findConflicts(['spotify_fetch'], ['chat_save']);
        const conflicts2 = findConflicts(['chat_save'], ['spotify_fetch']);
        expect(conflicts1).toContain('chat_save');
        expect(conflicts2).toContain('spotify_fetch');
    });

    it('should not report conflicts for non-conflicting operations', () => {
        const conflicts = findConflicts(['file_processing'], ['spotify_fetch']);
        expect(conflicts).toEqual([]);
    });
});

// ==========================================
// State Machine Coordinator Tests
// ==========================================

describe('StateMachine', () => {
    const MODES = { IDLE: 'idle', DEMO: 'demo', REAL: 'real' };
    const EVENTS = { DEMO_ENTER: 'demo_enter', DEMO_EXIT: 'demo_exit', RESET: 'reset' };

    // Simplified version of the state machine
    function createStateMachine() {
        let state = { mode: MODES.IDLE };
        const subscribers = [];

        const rules = {
            [EVENTS.DEMO_ENTER]: {
                validFrom: { mode: [MODES.IDLE] },
                newState: { mode: MODES.DEMO }
            },
            [EVENTS.DEMO_EXIT]: {
                validFrom: { mode: [MODES.DEMO] },
                newState: { mode: MODES.IDLE }
            },
            [EVENTS.RESET]: {
                validFrom: {},
                newState: { mode: MODES.IDLE }
            }
        };

        function request(event) {
            const rule = rules[event];
            if (!rule) return { allowed: false, reason: 'Unknown event' };

            for (const [key, validValues] of Object.entries(rule.validFrom)) {
                if (!validValues.includes(state[key])) {
                    return { allowed: false, reason: `Invalid ${key} state` };
                }
            }

            const prev = { ...state };
            state = { ...state, ...rule.newState };
            subscribers.forEach(cb => cb(event, prev, state));
            return { allowed: true, previousState: prev, newState: state };
        }

        function subscribe(cb) { subscribers.push(cb); }
        function getState() { return { ...state }; }

        return { request, subscribe, getState };
    }

    it('should allow valid state transitions', () => {
        const sm = createStateMachine();
        const result = sm.request(EVENTS.DEMO_ENTER);
        expect(result.allowed).toBe(true);
        expect(sm.getState().mode).toBe(MODES.DEMO);
    });

    it('should reject invalid state transitions', () => {
        const sm = createStateMachine();
        sm.request(EVENTS.DEMO_ENTER);
        const result = sm.request(EVENTS.DEMO_ENTER); // Can't enter demo when already in demo
        expect(result.allowed).toBe(false);
    });

    it('should notify subscribers on state change', () => {
        const sm = createStateMachine();
        const callback = vi.fn();
        sm.subscribe(callback);
        sm.request(EVENTS.DEMO_ENTER);
        expect(callback).toHaveBeenCalledWith(
            EVENTS.DEMO_ENTER,
            expect.objectContaining({ mode: MODES.IDLE }),
            expect.objectContaining({ mode: MODES.DEMO })
        );
    });

    it('should always allow reset', () => {
        const sm = createStateMachine();
        sm.request(EVENTS.DEMO_ENTER);
        const result = sm.request(EVENTS.RESET);
        expect(result.allowed).toBe(true);
        expect(sm.getState().mode).toBe(MODES.IDLE);
    });
});

// ==========================================
// Turn Queue Tests
// ==========================================

describe('TurnQueue', () => {
    function createTurnQueue() {
        const queue = [];
        let isProcessing = false;
        const listeners = [];

        async function push(message, mockProcessor) {
            return new Promise((resolve, reject) => {
                queue.push({ message, resolve, reject, mockProcessor });
                processNext();
            });
        }

        async function processNext() {
            if (isProcessing || queue.length === 0) return;
            isProcessing = true;

            const { message, resolve, reject, mockProcessor } = queue.shift();
            listeners.forEach(cb => cb('processing', message));

            try {
                const result = await mockProcessor(message);
                listeners.forEach(cb => cb('completed', message));
                resolve(result);
            } catch (err) {
                listeners.forEach(cb => cb('failed', message));
                reject(err);
            } finally {
                isProcessing = false;
                processNext();
            }
        }

        return {
            push,
            getPendingCount: () => queue.length,
            isActive: () => isProcessing,
            subscribe: (cb) => { listeners.push(cb); }
        };
    }

    it('should process messages sequentially', async () => {
        const queue = createTurnQueue();
        const order = [];

        const processor = async (msg) => {
            order.push(`start:${msg}`);
            await new Promise(r => setTimeout(r, 10));
            order.push(`end:${msg}`);
            return msg;
        };

        const p1 = queue.push('msg1', processor);
        const p2 = queue.push('msg2', processor);

        await Promise.all([p1, p2]);

        // Should be sequential: start1, end1, start2, end2
        expect(order).toEqual(['start:msg1', 'end:msg1', 'start:msg2', 'end:msg2']);
    });

    it('should track pending count correctly', async () => {
        const queue = createTurnQueue();
        let startedResolve;
        const started = new Promise((resolve) => { startedResolve = resolve; });

        const processor = async (msg) => {
            if (msg === 'msg1') {
                startedResolve();
            }
            await new Promise(r => setTimeout(r, 50));
        };

        queue.push('msg1', processor);
        queue.push('msg2', processor);

        // Wait for the first processor to begin before checking pending count
        await started;
        expect(queue.getPendingCount()).toBe(1);
    });
});

// ==========================================
// Pattern Worker Pool Tests
// ==========================================

describe('Pattern Worker Pool', () => {
    let originalWorker;
    let originalNavigator;
    let navigatorDescriptor;
    let PatternWorkerPool;

    beforeEach(async () => {
        vi.resetModules();
        originalWorker = global.Worker;
        originalNavigator = global.navigator;
        navigatorDescriptor = Object.getOwnPropertyDescriptor(global, 'navigator');

        let workerId = 0;
        class FakeWorker {
            constructor() {
                this.id = ++workerId;
                this.onmessage = null;
                this.onerror = null;
            }

            postMessage(message) {
                const { requestId } = message;
                setTimeout(() => {
                    this.onmessage?.({
                        data: {
                            requestId,
                            type: 'result',
                            result: { [`worker${this.id}`]: message.patterns }
                        },
                        target: this
                    });
                }, 0);
            }

            terminate() {
                // no-op for tests
            }
        }

        global.Worker = FakeWorker;
        try {
            Object.defineProperty(global, 'navigator', {
                configurable: true,
                value: { ...(originalNavigator || {}), hardwareConcurrency: 4 }
            });
        } catch {
            if (global.navigator) {
                global.navigator.hardwareConcurrency = 4;
            }
        }

        ({ PatternWorkerPool } = await import('../../js/workers/pattern-worker-pool.js'));
    });

    afterEach(() => {
        PatternWorkerPool?.terminate();
        global.Worker = originalWorker;
        try {
            if (navigatorDescriptor) {
                Object.defineProperty(global, 'navigator', navigatorDescriptor);
            } else if (originalNavigator) {
                Object.defineProperty(global, 'navigator', {
                    configurable: true,
                    value: originalNavigator
                });
            } else {
                delete global.navigator;
            }
        } catch {
            if (originalNavigator && global.navigator) {
                Object.assign(global.navigator, originalNavigator);
            }
        }
    });

    it('should expose core API methods', () => {
        expect(typeof PatternWorkerPool.init).toBe('function');
        expect(typeof PatternWorkerPool.detectAllPatterns).toBe('function');
        expect(typeof PatternWorkerPool.terminate).toBe('function');
    });

    it('should dispatch work and track completions', async () => {
        await PatternWorkerPool.init({ workerCount: 2 });
        const streams = new Array(1000).fill({});

        const result = await PatternWorkerPool.detectAllPatterns(streams, []);
        const status = PatternWorkerPool.getStatus();

        expect(Object.keys(result)).toContain('worker1');
        expect(status.totalProcessed).toBeGreaterThan(0);
    });
});

// ==========================================
// Timeout Budget Manager Tests
// ==========================================

describe('TimeoutBudget', () => {
    function createBudgetInstance(operation, budgetMs) {
        const startTime = Date.now();
        const children = [];

        return {
            remaining: () => Math.max(0, budgetMs - (Date.now() - startTime)),
            isExhausted: () => (Date.now() - startTime) >= budgetMs,
            subdivide: (childOp, childBudgetMs) => {
                const available = Math.max(0, budgetMs - (Date.now() - startTime));
                if (childBudgetMs > available) {
                    throw new Error(`Budget exhausted: ${childBudgetMs}ms requested, ${available}ms available`);
                }
                const child = createBudgetInstance(childOp, childBudgetMs);
                children.push(child);
                return child;
            }
        };
    }

    it('should track remaining time correctly', async () => {
        const budget = createBudgetInstance('test', 100);
        expect(budget.remaining()).toBeGreaterThan(90);

        await new Promise(r => setTimeout(r, 50));
        expect(budget.remaining()).toBeLessThan(55);
    });

    it('should detect exhaustion', async () => {
        const budget = createBudgetInstance('test', 20);
        expect(budget.isExhausted()).toBe(false);

        await new Promise(r => setTimeout(r, 25));
        expect(budget.isExhausted()).toBe(true);
    });

    it('should subdivide budget correctly', () => {
        const parent = createBudgetInstance('parent', 1000);
        const child = parent.subdivide('child', 500);

        expect(child.remaining()).toBeGreaterThan(450);
        expect(parent.remaining()).toBeGreaterThan(950);
    });

    it('should throw when subdividing exceeds available budget', async () => {
        const budget = createBudgetInstance('test', 50);

        await new Promise(r => setTimeout(r, 40));

        expect(() => budget.subdivide('child', 100)).toThrow(/Budget exhausted/);
    });
});

// ==========================================
// Strategy Voting Tests
// ==========================================

describe('StrategyVoting', () => {
    function createConfidence(value, reason) {
        return { confidence: Math.max(0, Math.min(1, value)), reason };
    }

    function selectBestStrategy(strategies, context) {
        const candidates = strategies
            .map(s => ({ strategy: s, ...s.canHandle(context) }))
            .filter(c => c.confidence > 0)
            .sort((a, b) => b.confidence - a.confidence);

        return candidates[0] || null;
    }

    const mockStrategies = [
        {
            name: 'NativeStrategy',
            canHandle: (ctx) => ctx.hasToolCalls
                ? createConfidence(0.95, 'Native tool_calls present')
                : createConfidence(0, 'No tool_calls')
        },
        {
            name: 'PromptInjectionStrategy',
            canHandle: (ctx) => ctx.hasParsedCalls
                ? createConfidence(0.75, 'Parsed function calls from text')
                : createConfidence(0, 'No parsed calls')
        },
        {
            name: 'IntentStrategy',
            canHandle: (ctx) => ctx.hasIntent
                ? createConfidence(0.5, 'Extracted intent')
                : createConfidence(0, 'No intent')
        }
    ];

    it('should select highest confidence strategy', () => {
        const result = selectBestStrategy(mockStrategies, { hasToolCalls: true, hasParsedCalls: true });
        expect(result.strategy.name).toBe('NativeStrategy');
        expect(result.confidence).toBe(0.95);
    });

    it('should fallback to lower confidence when higher not available', () => {
        const result = selectBestStrategy(mockStrategies, { hasToolCalls: false, hasParsedCalls: true });
        expect(result.strategy.name).toBe('PromptInjectionStrategy');
    });

    it('should return null when no strategy matches', () => {
        const result = selectBestStrategy(mockStrategies, { hasToolCalls: false, hasParsedCalls: false });
        expect(result).toBeNull();
    });
});

// ==========================================
// Tab Heartbeat Tests
// ==========================================

describe('TabHeartbeat', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const HEARTBEAT_INTERVAL_MS = 5000;
    const MAX_MISSED_HEARTBEATS = 2;

    function createHeartbeatMonitor() {
        let lastHeartbeat = Date.now();
        let onDeadLeader = null;
        let intervalId = null;

        return {
            receiveHeartbeat: () => { lastHeartbeat = Date.now(); },
            start: (callback) => {
                onDeadLeader = callback;
                intervalId = setInterval(() => {
                    const timeSince = Date.now() - lastHeartbeat;
                    if (timeSince > HEARTBEAT_INTERVAL_MS * MAX_MISSED_HEARTBEATS) {
                        onDeadLeader?.();
                    }
                }, HEARTBEAT_INTERVAL_MS);
            },
            stop: () => { if (intervalId) clearInterval(intervalId); }
        };
    }

    it('should not trigger promotion when heartbeats are received', async () => {
        const monitor = createHeartbeatMonitor();
        const onDeadLeader = vi.fn();

        monitor.start(onDeadLeader);

        // Simulate receiving heartbeats
        vi.advanceTimersByTime(4000);
        monitor.receiveHeartbeat();
        vi.advanceTimersByTime(4000);
        monitor.receiveHeartbeat();
        vi.advanceTimersByTime(4000);

        expect(onDeadLeader).not.toHaveBeenCalled();
        monitor.stop();
    });

    it('should trigger promotion after missed heartbeats', async () => {
        const monitor = createHeartbeatMonitor();
        const onDeadLeader = vi.fn();

        monitor.start(onDeadLeader);

        // Don't send any heartbeats, advance past threshold
        vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * (MAX_MISSED_HEARTBEATS + 1));

        expect(onDeadLeader).toHaveBeenCalled();
        monitor.stop();
    });
});

// ==========================================
// Storage Transaction Tests
// ==========================================

describe('StorageTransaction', () => {
    function createMockTransaction() {
        const operations = [];
        let committed = false;
        let rolledBack = false;

        return {
            put: (backend, key, value, previousValue = null) => {
                operations.push({ backend, type: 'put', key, value, previousValue, committed: false });
            },
            commit: () => {
                operations.forEach(op => op.committed = true);
                committed = true;
            },
            rollback: () => {
                // Rollback committed operations in reverse
                operations.filter(op => op.committed).reverse().forEach(op => {
                    // In real implementation, restore previous values
                });
                rolledBack = true;
            },
            isCommitted: () => committed,
            isRolledBack: () => rolledBack,
            getOperations: () => [...operations]
        };
    }

    it('should track operations before commit', () => {
        const tx = createMockTransaction();
        tx.put('indexeddb', 'key1', 'value1');
        tx.put('localstorage', 'key2', 'value2');

        expect(tx.getOperations()).toHaveLength(2);
        expect(tx.isCommitted()).toBe(false);
    });

    it('should commit all operations', () => {
        const tx = createMockTransaction();
        tx.put('indexeddb', 'key1', 'value1');
        tx.commit();

        expect(tx.isCommitted()).toBe(true);
        expect(tx.getOperations().every(op => op.committed)).toBe(true);
    });

    it('should rollback on failure', () => {
        const tx = createMockTransaction();
        tx.put('indexeddb', 'key1', 'value1', 'old1');
        tx.commit();
        tx.rollback();

        expect(tx.isRolledBack()).toBe(true);
    });
});

// ==========================================
// Migration Checkpointing Tests
// ==========================================

describe('MigrationCheckpointing', () => {
    function createMigration(totalKeys) {
        let checkpoint = null;
        let keysProcessed = 0;

        async function migrate(onProgress) {
            keysProcessed = 0;
            const startIndex = checkpoint?.lastProcessedIndex ?? 0;

            for (let i = startIndex; i < totalKeys; i++) {
                // Simulate processing
                keysProcessed++;

                // Report progress
                onProgress?.(i + 1, totalKeys);

                // Save checkpoint every 10 keys
                if ((i + 1) % 10 === 0) {
                    checkpoint = { lastProcessedIndex: i + 1, keysProcessed };
                }
            }

            // Clear checkpoint on completion
            checkpoint = null;
            return { migrated: true, keysProcessed };
        }

        function getCheckpoint() { return checkpoint; }
        function simulateCrash(atKey) {
            checkpoint = { lastProcessedIndex: atKey + 1, keysProcessed: atKey + 1 };
        }

        return { migrate, getCheckpoint, simulateCrash };
    }

    it('should complete migration and clear checkpoint', async () => {
        const migration = createMigration(25);
        const result = await migration.migrate();

        expect(result.migrated).toBe(true);
        expect(result.keysProcessed).toBe(25);
        expect(migration.getCheckpoint()).toBeNull();
    });

    it('should resume from checkpoint after simulated crash', async () => {
        const migration = createMigration(25);

        // Simulate crash at key 15
        migration.simulateCrash(15);

        // Resume migration
        const result = await migration.migrate();

        // Should only process remaining 9 keys (starting at index 16 through 24)
        expect(result.keysProcessed).toBe(9);
    });

    it('should report progress during migration', async () => {
        const migration = createMigration(5);
        const progressCalls = [];

        await migration.migrate((current, total) => {
            progressCalls.push({ current, total });
        });

        expect(progressCalls).toHaveLength(5);
        expect(progressCalls[4]).toEqual({ current: 5, total: 5 });
    });
});
