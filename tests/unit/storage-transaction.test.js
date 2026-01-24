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
