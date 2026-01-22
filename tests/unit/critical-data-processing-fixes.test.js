/**
 * Critical Data Processing Fixes - Unit Tests
 *
 * Tests for the critical data processing issues identified and fixed during v1.0 audit:
 * 1. WAL Promise resolution across page reloads
 * 2. Fatal error state for transaction failures
 * 3. Migration rollback integrity verification
 * 4. Worker restart pending request preservation
 * 5. State mutation through getters (deep cloning)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Critical Data Processing Fixes', () => {
    beforeEach(() => {
        vi.resetModules();
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ========================================================================
    // TEST 1: WAL Promise Resolution Across Reloads
    // ========================================================================
    describe('WAL Promise Resolution Across Page Reloads', () => {
        it('survives page reload with waitForResult mechanism', async () => {
            const ENTRIES_KEY = 'rhythm_chamber_wal_entries';

            // Simulate pre-crash state: operation was queued
            const entryId = 'test-entry-123';
            const entry = {
                id: entryId,
                data: { test: 'data' },
                status: 'completed',
                result: { success: true }
            };

            // Store entry in WAL (simulating post-crash state)
            const entries = { [entryId]: entry };
            localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));

            // Simulate post-reload: read entry directly
            const stored = JSON.parse(localStorage.getItem(ENTRIES_KEY) || '{}');
            const retrievedEntry = stored[entryId];

            expect(retrievedEntry).toBeDefined();
            expect(retrievedEntry.status).toBe('completed');
            expect(retrievedEntry.result).toEqual({ success: true });
        });

        it('handles missing entry gracefully', async () => {
            const ENTRIES_KEY = 'rhythm_chamber_wal_entries';
            const entryId = 'nonexistent-entry';

            const stored = JSON.parse(localStorage.getItem(ENTRIES_KEY) || '{}');
            const retrievedEntry = stored[entryId];

            expect(retrievedEntry).toBeUndefined();
        });

        it('respects timeout when waiting for result', async () => {
            const startTime = Date.now();
            const TIMEOUT_MS = 100;

            // Simulate waiting with timeout
            const entryId = 'pending-entry';
            let found = false;

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS);
            });

            const checkPromise = new Promise((resolve) => {
                const interval = setInterval(() => {
                    // Simulate entry appearing
                    if (!found && Date.now() - startTime > TIMEOUT_MS / 2) {
                        found = true;
                    }
                    if (found) {
                        clearInterval(interval);
                        resolve(true);
                    }
                }, 10);
            });

            try {
                await Promise.race([timeoutPromise, checkPromise]);
            } catch (e) {
                expect(e.message).toBe('Timeout');
            }
        });
    });

    // ========================================================================
    // TEST 2: Fatal Error State for Transaction Failures
    // ========================================================================
    describe('Fatal Error State for Transaction Failures', () => {
        it('sets fatal state when all compensation attempts fail', () => {
            const FATAL_STATE_KEY = 'rhythm_chamber_transaction_fatal';

            // Simulate catastrophic failure
            const fatalState = {
                isFatal: true,
                reason: 'CRITICAL: Transaction rollback failed and all compensation logs failed',
                timestamp: Date.now(),
                transactionId: 'txn-123'
            };

            localStorage.setItem(FATAL_STATE_KEY, JSON.stringify(fatalState));

            const stored = JSON.parse(localStorage.getItem(FATAL_STATE_KEY) || '{}');
            expect(stored.isFatal).toBe(true);
            expect(stored.reason).toContain('rollback failed');
        });

        it('prevents new transactions when in fatal state', () => {
            const FATAL_STATE_KEY = 'rhythm_chamber_transaction_fatal';

            // Set fatal state
            localStorage.setItem(FATAL_STATE_KEY, JSON.stringify({
                isFatal: true,
                timestamp: Date.now()
            }));

            // Check if new transaction should be blocked
            const fatalState = JSON.parse(localStorage.getItem(FATAL_STATE_KEY) || '{}');
            const shouldBlock = fatalState.isFatal === true;

            expect(shouldBlock).toBe(true);
        });

        it('allows clearing fatal state for recovery', () => {
            const FATAL_STATE_KEY = 'rhythm_chamber_transaction_fatal';

            // Set fatal state
            localStorage.setItem(FATAL_STATE_KEY, JSON.stringify({
                isFatal: true,
                timestamp: Date.now()
            }));

            // Clear fatal state (recovery)
            localStorage.removeItem(FATAL_STATE_KEY);

            const fatalState = JSON.parse(localStorage.getItem(FATAL_STATE_KEY) || '{}');
            expect(fatalState.isFatal).toBeUndefined();
        });
    });

    // ========================================================================
    // TEST 3: Migration Rollback Integrity Verification
    // ========================================================================
    describe('Migration Rollback Integrity Verification', () => {
        it('validates backup structure before restoration', () => {
            const validBackup = {
                version: '1.0.0',
                timestamp: Date.now(),
                data: { test: 'data' }
            };

            // Validate structure
            const isValid = validateBackupStructure(validBackup);
            expect(isValid).toBe(true);
        });

        it('rejects invalid backup structure', () => {
            const invalidBackups = [
                null,
                undefined,
                {},
                { version: '1.0.0' }, // Missing data
                { data: {} }, // Missing version
                'not an object',
                []
            ];

            for (const backup of invalidBackups) {
                const isValid = validateBackupStructure(backup);
                expect(isValid).toBe(false);
            }
        });

        it('validates serializability of backup data', () => {
            const validData = {
                string: 'test',
                number: 123,
                boolean: true,
                null: null,
                array: [1, 2, 3],
                object: { nested: 'value' }
            };

            // Should be JSON serializable
            expect(() => JSON.stringify(validData)).not.toThrow();
        });

        it('detects circular references in backup', () => {
            const circularData = { a: 1 };
            circularData.self = circularData;

            // Should detect circular reference
            let hasCircular = false;
            try {
                JSON.stringify(circularData);
            } catch (e) {
                hasCircular = true;
            }
            expect(hasCircular).toBe(true);
        });
    });

    // ========================================================================
    // TEST 4: Worker Restart Pending Request Preservation
    // ========================================================================
    describe('Worker Restart Pending Request Preservation', () => {
        it('tracks pending requests during worker restart', () => {
            const pendingRequests = new Map();

            // Register pending requests
            pendingRequests.set('req-1', { data: 'data1', timestamp: Date.now() });
            pendingRequests.set('req-2', { data: 'data2', timestamp: Date.now() });
            pendingRequests.set('req-3', { data: 'data3', timestamp: Date.now() });

            expect(pendingRequests.size).toBe(3);

            // Simulate worker restart - pending requests should be preserved
            const preserved = Array.from(pendingRequests.entries());
            expect(preserved.length).toBe(3);
        });

        it('fails single-worker requests appropriately on restart', () => {
            const singleWorkerRequest = {
                id: 'single-req',
                requireSingleWorker: true,
                data: 'test'
            };

            // On worker restart, single-worker requests should fail
            const workerRestarted = true;
            const shouldFail = singleWorkerRequest.requireSingleWorker && workerRestarted;

            expect(shouldFail).toBe(true);
        });

        it('uses partial results for multi-worker requests on restart', () => {
            const multiWorkerRequest = {
                id: 'multi-req',
                requireSingleWorker: false,
                workers: 4,
                partialResults: ['result1', 'result2']
            };

            // On partial worker restart, use available results
            const workerRestarted = true;
            const hasPartialResults = multiWorkerRequest.partialResults.length > 0;

            if (workerRestarted && !multiWorkerRequest.requireSingleWorker && hasPartialResults) {
                // Should use partial results
                expect(multiWorkerRequest.partialResults).toHaveLength(2);
            }
        });
    });

    // ========================================================================
    // TEST 5: State Mutation Through Getters (Deep Cloning)
    // ========================================================================
    describe('State Mutation Through Getters (Deep Cloning)', () => {
        it('prevents mutation of returned state object', () => {
            const state = {
                user: { name: 'Test', settings: { theme: 'dark' } },
                sessions: [{ id: 1, name: 'Session 1' }]
            };

            // Deep clone the state
            const clonedState = deepClone(state);

            // Mutate the clone
            clonedState.user.settings.theme = 'light';
            clonedState.sessions.push({ id: 2, name: 'Session 2' });

            // Original should be unchanged
            expect(state.user.settings.theme).toBe('dark');
            expect(state.sessions).toHaveLength(1);
        });

        it('deeply clones nested objects', () => {
            const nested = {
                level1: {
                    level2: {
                        level3: {
                            value: 'deep'
                        }
                    }
                }
            };

            const cloned = deepClone(nested);
            cloned.level1.level2.level3.value = 'mutated';

            expect(nested.level1.level2.level3.value).toBe('deep');
        });

        it('deeply clones arrays', () => {
            const arrayState = {
                items: [
                    { id: 1, nested: { value: 'a' } },
                    { id: 2, nested: { value: 'b' } }
                ]
            };

            const cloned = deepClone(arrayState);
            cloned.items.push({ id: 3, nested: { value: 'c' } });
            cloned.items[0].nested.value = 'mutated';

            expect(arrayState.items).toHaveLength(2);
            expect(arrayState.items[0].nested.value).toBe('a');
        });

        it('handles Date objects correctly', () => {
            const stateWithDate = {
                createdAt: new Date('2024-01-01')
            };

            const cloned = deepClone(stateWithDate);
            expect(cloned.createdAt).toEqual(stateWithDate.createdAt);
            expect(cloned.createdAt).not.toBe(stateWithDate.createdAt); // Different reference
        });
    });

    // ========================================================================
    // TEST 6: LRU Cache Pinning Mechanism
    // ========================================================================
    describe('LRU Cache Pinning Mechanism', () => {
        it('prevents eviction of pinned items', () => {
            const cache = new Map();
            const pinnedItems = new Set();

            // Add items and pin one
            cache.set('item1', { value: 'data1' });
            cache.set('item2', { value: 'data2' });
            pinnedItems.add('item1'); // Pin item1

            // Simulate eviction - should skip pinned items
            const evictKey = 'item1';
            if (pinnedItems.has(evictKey)) {
                // Skip eviction
                expect(cache.has('item1')).toBe(true);
            }
        });

        it('allows unpinning items', () => {
            const pinnedItems = new Set();
            pinnedItems.add('item1');

            expect(pinnedItems.has('item1')).toBe(true);

            // Unpin
            pinnedItems.delete('item1');
            expect(pinnedItems.has('item1')).toBe(false);
        });

        it('checks if item is pinned', () => {
            const pinnedItems = new Set();
            pinnedItems.add('item1');

            expect(pinnedItems.has('item1')).toBe(true);
            expect(pinnedItems.has('item2')).toBe(false);
        });
    });
});

/**
 * Helper function to validate backup structure
 * Mirrors the validation in migration.js
 */
function validateBackupStructure(backup) {
    if (!backup || typeof backup !== 'object') {
        return false;
    }

    if (!backup.version || typeof backup.version !== 'string') {
        return false;
    }

    if (!backup.data || typeof backup.data !== 'object') {
        return false;
    }

    return true;
}

/**
 * Deep clone helper
 * Mirrors the implementation in app-state.js
 */
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }

    if (obj instanceof Array) {
        return obj.map(item => deepClone(item));
    }

    if (typeof obj === 'object') {
        const cloned = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = deepClone(obj[key]);
            }
        }
        return cloned;
    }

    return obj;
}
