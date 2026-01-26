import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the IndexedDBCore module before importing transaction.js
vi.mock('../../js/storage/indexeddb.js', () => {
    const STORES = {
        STREAMS: 'streams',
        CHUNKS: 'chunks',
        EMBEDDINGS: 'embeddings',
        PERSONALITY: 'personality',
        SETTINGS: 'settings',
        CHAT_SESSIONS: 'chat_sessions',
        CONFIG: 'config',
        TOKENS: 'tokens',
        MIGRATION: 'migration',
        TEST: 'test'
    };

    // In-memory storage for the mock
    const mockData = new Map();

    const getStore = (storeName) => {
        if (!mockData.has(storeName)) mockData.set(storeName, new Map());
        return mockData.get(storeName);
    };

    const mockIndexedDBCore = {
        STORES,
        async get(store, key) {
            const s = getStore(store);
            return s.get(key) ?? null;
        },
        async put(store, value) {
            const s = getStore(store);
            const key = value?.id;
            if (!key) throw new Error('Missing id');
            s.set(key, value);
            return value;
        },
        async delete(store, key) {
            const s = getStore(store);
            s.delete(key);
        },
        async clear(store) {
            const s = getStore(store);
            s.clear();
        },
        async getAll(store) {
            const s = getStore(store);
            return Array.from(s.values());
        },
        getConnection: () => true,
        getConnectionStatus: () => ({ isConnected: true, isFailed: false, attempts: 0 }),
        _getMockData: () => mockData, // For test inspection
        _clearMockData: () => mockData.clear()
    };

    return {
        IndexedDBCore: mockIndexedDBCore,
        STORES,
        DB_NAME: 'rhythm-chamber',
        DB_VERSION: 6
    };
});

// Mock other dependencies
vi.mock('../../js/services/event-bus.js', () => ({
    EventBus: {
        emit: vi.fn(),
        on: vi.fn(),
        clearAll: vi.fn()
    }
}));

vi.mock('../../js/security/secure-token-store.js', () => ({
    SecureTokenStore: null
}));

vi.mock('../../js/storage/migration.js', () => ({
    StorageMigration: {
        migrateFromLocalStorage: vi.fn().mockResolvedValue(),
        rollbackMigration: vi.fn().mockResolvedValue(),
        getMigrationState: vi.fn().mockResolvedValue(null)
    }
}));

const STORES = {
    STREAMS: 'streams',
    CHUNKS: 'chunks',
    EMBEDDINGS: 'embeddings',
    PERSONALITY: 'personality',
    SETTINGS: 'settings',
    CHAT_SESSIONS: 'chat_sessions',
    CONFIG: 'config',
    TOKENS: 'tokens',
    MIGRATION: 'migration',
    TEST: 'test'
};

function createMockLocalStorage() {
    const store = new Map();
    return {
        get length() {
            return store.size;
        },
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
        clear: () => store.clear(),
        key: (index) => Array.from(store.keys())[index] || null,
        _store: store
    };
}

let StorageTransaction;
let Storage;
let mockIndexedDBCore;

beforeEach(async () => {
    vi.resetModules();

    globalThis.window = globalThis;
    globalThis.localStorage = createMockLocalStorage();
    window.localStorage = globalThis.localStorage;

    window.ConfigAPI = {
        getConfig: vi.fn(),
        setConfig: vi.fn(),
        removeConfig: vi.fn(),
        getToken: vi.fn(),
        setToken: vi.fn(),
        removeToken: vi.fn()
    };
    window.ProfileStorage = {
        init: vi.fn(),
        _storage: {},
        saveProfile: vi.fn(),
        getAllProfiles: vi.fn(),
        getProfile: vi.fn(),
        deleteProfile: vi.fn(),
        getActiveProfileId: vi.fn(),
        setActiveProfile: vi.fn(),
        getProfileCount: vi.fn(),
        clearAllProfiles: vi.fn()
    };

    // Import the mocked IndexedDBCore
    const indexeddbModule = await import('../../js/storage/indexeddb.js');
    mockIndexedDBCore = indexeddbModule.IndexedDBCore;

    // Clear mock data before each test
    mockIndexedDBCore._clearMockData();

    // Import modules after mocks are set up
    StorageTransaction = (await import('../../js/storage/transaction.js')).StorageTransaction;
    Storage = (await import('../../js/storage.js')).Storage;
});

describe('StorageTransaction.transaction', () => {
    it('commits operations across backends atomically', async () => {
        const result = await StorageTransaction.transaction(async (tx) => {
            await tx.put('indexeddb', STORES.TEST, { id: '1', value: 123 });
            await tx.put('localstorage', 'k1', 'v1');
        });

        expect(result.success).toBe(true);
        expect(result.operationsCommitted).toBe(2);

        const stored = await mockIndexedDBCore.get(STORES.TEST, '1');
        expect(stored).not.toBeNull();
        expect(stored.value).toBe(123);
        expect(window.localStorage.getItem('k1')).toBe('v1');
    });

    it('rolls back committed operations on failure', async () => {
        // Make put throw on second indexeddb operation
        const originalPut = mockIndexedDBCore.put;
        mockIndexedDBCore.put = vi.fn(async (store, value) => {
            if (value.id === 'fail') {
                throw new Error('simulated failure');
            }
            return originalPut.call(mockIndexedDBCore, store, value);
        });

        // The transaction throws a PARTIAL_COMMIT error when some operations succeed
        await expect(StorageTransaction.transaction(async (tx) => {
            await tx.put('indexeddb', STORES.TEST, { id: 'ok', value: 1 });
            await tx.put('indexeddb', STORES.TEST, { id: 'fail', value: 2 });
        })).rejects.toThrow();

        // Verify rollback removed committed data
        const storedOk = await mockIndexedDBCore.get(STORES.TEST, 'ok');
        expect(storedOk).toBeNull();
    });
});

describe('Storage.beginTransaction', () => {
    it('delegates to StorageTransaction.transaction', async () => {
        const spy = vi.spyOn(StorageTransaction, 'transaction');

        await Storage.beginTransaction(async (tx) => {
            await tx.put('localstorage', 'k2', 'v2');
        });

        expect(spy).toHaveBeenCalledTimes(1);
        expect(window.localStorage.getItem('k2')).toBe('v2');
    });
});

describe('CRITICAL FIX: Fatal State Recovery (Issue #1)', () => {
    it('blocks transactions when in fatal state', async () => {
        // Manually set fatal state
        const { clearFatalState } = StorageTransaction;
        StorageTransaction.FATAL_STATE = {
            isFatal: true,
            reason: 'Test fatal state',
            timestamp: Date.now(),
            transactionId: 'test-txn-123',
            compensationLogCount: 2
        };

        // Attempt to start a new transaction
        await expect(StorageTransaction.transaction(async (tx) => {
            await tx.put('localstorage', 'k1', 'v1');
        })).rejects.toThrow('System in fatal error state');

        // Clear fatal state
        clearFatalState('Test cleanup');

        // Verify transactions work again
        const result = await StorageTransaction.transaction(async (tx) => {
            await tx.put('localstorage', 'k1', 'v1');
        });
        expect(result.success).toBe(true);
    });

    it('provides fatal state details', async () => {
        // Manually set fatal state
        StorageTransaction.FATAL_STATE = {
            isFatal: true,
            reason: 'Test fatal state',
            timestamp: Date.now(),
            transactionId: 'test-txn-456',
            compensationLogCount: 3
        };

        const fatalState = StorageTransaction.getFatalState();
        expect(fatalState).not.toBeNull();
        expect(fatalState.isFatal).toBe(true);
        expect(fatalState.reason).toBe('Test fatal state');
        expect(fatalState.transactionId).toBe('test-txn-456');
        expect(fatalState.compensationLogCount).toBe(3);

        // Cleanup
        StorageTransaction.clearFatalState('Test cleanup');
    });

    it('clears fatal state and emits event', async () => {
        const { EventBus } = await import('../../js/services/event-bus.js');

        // Manually set fatal state
        StorageTransaction.FATAL_STATE = {
            isFatal: true,
            reason: 'Test fatal state',
            timestamp: Date.now(),
            transactionId: 'test-txn-789',
            compensationLogCount: 1
        };

        // Clear fatal state
        StorageTransaction.clearFatalState('Manual recovery test');

        // Verify state cleared
        expect(StorageTransaction.isFatalState()).toBe(false);
        expect(StorageTransaction.getFatalState()).toBeNull();

        // Verify event emitted
        expect(EventBus.emit).toHaveBeenCalledWith(
            'transaction:fatal_cleared',
            expect.objectContaining({
                reason: 'Manual recovery test',
                timestamp: expect.any(Number)
            })
        );
    });
});

describe('CRITICAL FIX: Compensation Log Multi-Level Fallback (Issue #2)', () => {
    it('stores compensation logs in localStorage when IndexedDB fails', async () => {
        // Mock IndexedDB to fail
        const originalPut = mockIndexedDBCore.put;
        mockIndexedDBCore.put = vi.fn(() => {
            throw new Error('IndexedDB quota exceeded');
        });

        // Mock localStorage to work
        const lsSetItemSpy = vi.spyOn(window.localStorage, 'setItem');

        // Create a transaction that will fail rollback
        const originalLocalStorageRemoveItem = window.localStorage.removeItem;
        const removeItemSpy = vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
            throw new Error('Rollback failure for testing');
        });

        try {
            await StorageTransaction.transaction(async (tx) => {
                await tx.put('localstorage', 'test_key', 'test_value');
                // This will fail rollback
                window.localStorage.removeItem = () => {
                    throw new Error('Simulated rollback failure');
                };
            });
        } catch (error) {
            // Expected to fail
        } finally {
            removeItemSpy.mockRestore();
        }

        // Verify localStorage was used as fallback
        expect(lsSetItemSpy).toHaveBeenCalledWith(
            '_transaction_compensation_logs',
            expect.any(String)
        );

        // Verify compensation logs exist in localStorage
        const lsLogs = JSON.parse(window.localStorage.getItem('_transaction_compensation_logs') || '[]');
        expect(lsLogs.length).toBeGreaterThan(0);

        // Restore IndexedDB
        mockIndexedDBCore.put = originalPut;

        // Cleanup
        window.localStorage.removeItem('_transaction_compensation_logs');
    });

    it('falls back to in-memory storage when both IndexedDB and localStorage fail', async () => {
        // Mock both IndexedDB and localStorage to fail
        const originalPut = mockIndexedDBCore.put;
        mockIndexedDBCore.put = vi.fn(() => {
            throw new Error('IndexedDB quota exceeded');
        });

        const lsSetItemSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
            throw new Error('localStorage quota exceeded');
        });

        try {
            await StorageTransaction.transaction(async (tx) => {
                await tx.put('localstorage', 'test_key_mem', 'test_value');
                window.localStorage.removeItem = () => {
                    throw new Error('Simulated rollback failure');
                };
            });
        } catch (error) {
            // Expected to fail
        }

        // Verify in-memory compensation logs exist
        const memoryLogs = StorageTransaction.getAllInMemoryCompensationLogs();
        expect(memoryLogs.length).toBeGreaterThan(0);

        // Verify the log has the expected structure
        const log = memoryLogs[0];
        expect(log.storage).toBe('memory');
        expect(log.resolved).toBe(false);
        expect(log.entries).toBeDefined();

        // Restore functions
        mockIndexedDBCore.put = originalPut;
        lsSetItemSpy.mockRestore();

        // Cleanup
        StorageTransaction.clearInMemoryCompensationLog(log.id);
    });

    it('retrieves compensation logs from all storage levels', async () => {
        // Add logs to different storage levels
        const transactionId1 = 'test-txn-ls-' + Date.now();
        const transactionId2 = 'test-txn-mem-' + Date.now();

        // Add to localStorage
        const lsLogs = [{
            id: transactionId1,
            entries: [{ operation: 'test1' }],
            timestamp: Date.now(),
            resolved: false
        }];
        window.localStorage.setItem('_transaction_compensation_logs', JSON.stringify(lsLogs));

        // Add to memory
        StorageTransaction.addInMemoryCompensationLog(transactionId2, [{ operation: 'test2' }]);

        // Retrieve all logs
        const allLogs = await StorageTransaction.getCompensationLogs();

        // Verify both logs are present
        expect(allLogs.length).toBeGreaterThanOrEqual(2);

        const log1 = allLogs.find(l => l.id === transactionId1);
        const log2 = allLogs.find(l => l.id === transactionId2);

        expect(log1).toBeDefined();
        expect(log2).toBeDefined();

        // Cleanup
        window.localStorage.removeItem('_transaction_compensation_logs');
        StorageTransaction.clearInMemoryCompensationLog(transactionId2);
    });

    it('resolves compensation logs across all storage levels', async () => {
        const transactionId1 = 'test-resolve-ls-' + Date.now();
        const transactionId2 = 'test-resolve-mem-' + Date.now();

        // Add logs to both localStorage and memory
        const lsLogs = [{
            id: transactionId1,
            entries: [{ operation: 'test' }],
            timestamp: Date.now(),
            resolved: false
        }];
        window.localStorage.setItem('_transaction_compensation_logs', JSON.stringify(lsLogs));
        StorageTransaction.addInMemoryCompensationLog(transactionId2, [{ operation: 'test' }]);

        // Resolve both logs
        const resolved1 = await StorageTransaction.resolveCompensationLog(transactionId1);
        const resolved2 = await StorageTransaction.resolveCompensationLog(transactionId2);

        expect(resolved1).toBe(true);
        expect(resolved2).toBe(true);

        // Verify they are marked as resolved
        const allLogs = await StorageTransaction.getCompensationLogs();
        const log1 = allLogs.find(l => l.id === transactionId1);
        const log2 = allLogs.find(l => l.id === transactionId2);

        expect(log1?.resolved).toBe(true);
        expect(log2?.resolved).toBe(true);

        // Cleanup
        window.localStorage.removeItem('_transaction_compensation_logs');
        StorageTransaction.clearInMemoryCompensationLog(transactionId2);
    });

    it('clears resolved compensation logs from all storage levels', async () => {
        const transactionId1 = 'test-clear-ls-' + Date.now();
        const transactionId2 = 'test-clear-mem-' + Date.now();

        // Add logs
        const lsLogs = [{
            id: transactionId1,
            entries: [{ operation: 'test' }],
            timestamp: Date.now(),
            resolved: true
        }];
        window.localStorage.setItem('_transaction_compensation_logs', JSON.stringify(lsLogs));
        StorageTransaction.addInMemoryCompensationLog(transactionId2, [{ operation: 'test' }]);

        // Mark memory log as resolved
        await StorageTransaction.resolveCompensationLog(transactionId2);

        // Clear resolved logs
        const clearedCount = await StorageTransaction.clearResolvedCompensationLogs();

        expect(clearedCount).toBeGreaterThan(0);

        // Verify they are cleared
        const allLogs = await StorageTransaction.getCompensationLogs();
        expect(allLogs.find(l => l.id === transactionId1 && l.resolved === true)).toBeUndefined();

        // Cleanup
        window.localStorage.removeItem('_transaction_compensation_logs');
    });

    it('prevents unbounded growth of in-memory compensation logs', async () => {
        // Add more than MAX_MEMORY_LOGS (100) entries
        for (let i = 0; i < 105; i++) {
            StorageTransaction.addInMemoryCompensationLog(`test-txn-${i}`, [{ operation: `test${i}` }]);
        }

        // Verify we don't exceed the limit
        const memoryLogs = StorageTransaction.getAllInMemoryCompensationLogs();
        expect(memoryLogs.length).toBeLessThanOrEqual(100);

        // Cleanup
        for (const log of memoryLogs) {
            StorageTransaction.clearInMemoryCompensationLog(log.id);
        }
    });
});
