import { describe, it, expect, beforeEach, vi } from 'vitest';

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

function createMockIndexedDBCore() {
    const data = new Map();

    const getStore = (storeName) => {
        if (!data.has(storeName)) data.set(storeName, new Map());
        return data.get(storeName);
    };

    return {
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
        getStore,
        getConnection: () => true
    };
}

let StorageTransaction;
let Storage;
let StorageMigration;

beforeEach(async () => {
    vi.resetModules();

    globalThis.window = globalThis;
    globalThis.localStorage = createMockLocalStorage();
    globalThis.IndexedDBCore = createMockIndexedDBCore();
    window.IndexedDBCore = globalThis.IndexedDBCore;
    window.ConfigAPI = {
        getConfig: vi.fn(),
        setConfig: vi.fn(),
        removeConfig: vi.fn(),
        getToken: vi.fn(),
        setToken: vi.fn(),
        removeToken: vi.fn()
    };
    window.ProfileStorage = { init: vi.fn(), _storage: {}, saveProfile: vi.fn(), getAllProfiles: vi.fn(), getProfile: vi.fn(), deleteProfile: vi.fn(), getActiveProfileId: vi.fn(), setActiveProfile: vi.fn(), getProfileCount: vi.fn(), clearAllProfiles: vi.fn() };

    StorageMigration = (await import('../../js/storage/migration.js')).StorageMigration;
    vi.spyOn(StorageMigration, 'migrateFromLocalStorage').mockResolvedValue();
    vi.spyOn(StorageMigration, 'rollbackMigration').mockResolvedValue();
    vi.spyOn(StorageMigration, 'getMigrationState').mockResolvedValue(null);

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

        const stored = await window.IndexedDBCore.get(STORES.TEST, '1');
        expect(stored.value).toBe(123);
        expect(window.localStorage.getItem('k1')).toBe('v1');
    });

    it('rolls back committed operations on failure', async () => {
        // Make put throw on second indexeddb operation
        const originalPut = window.IndexedDBCore.put;
        window.IndexedDBCore.put = vi.fn(async (store, value) => {
            if (value.id === 'fail') {
                throw new Error('simulated failure');
            }
            return originalPut(store, value);
        });

        await expect(StorageTransaction.transaction(async (tx) => {
            await tx.put('indexeddb', STORES.TEST, { id: 'ok', value: 1 });
            await tx.put('indexeddb', STORES.TEST, { id: 'fail', value: 2 });
        })).rejects.toThrow('simulated failure');

        // Verify rollback removed committed data
        const storedOk = await window.IndexedDBCore.get(STORES.TEST, 'ok');
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
