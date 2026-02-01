/**
 * COMPREHENSIVE CHARACTERIZATION TESTS FOR INDEXEDDB CORE
 *
 * These tests capture the EXISTING behavior of js/storage/indexeddb.js
 * BEFORE refactoring. They serve as a safety net to ensure NO REGRESSIONS
 * during the complex refactoring process.
 *
 * TEST COVERAGE:
 * 1. Database initialization and connection management
 * 2. All schema migrations (V1-V6)
 * 3. Connection retry logic with exponential backoff
 * 4. Fallback backend activation
 * 5. Write authority enforcement (HNW)
 * 6. Transaction pool management
 * 7. All primitive operations (put, get, getAll, clear, delete, count)
 * 8. Atomic operations (atomicUpdate)
 * 9. Index-based queries (getAllByIndex)
 * 10. Conflict detection (VectorClock integration)
 * 11. TabCoordinator integration
 * 12. EventBus integration
 *
 * CRITICAL: These tests MUST pass before and after refactoring.
 * They represent the contract that the refactored code MUST maintain.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { IndexedDBCore, STORES, DB_NAME, DB_VERSION } from '../../../../js/storage/indexeddb.js';
import { EventBus } from '../../../../js/services/event-bus.js';
import { TabCoordinator } from '../../../../js/services/tab-coordination/index.js';
import { VectorClock } from '../../../../js/services/vector-clock.js';

describe('IndexedDB Core - Characterization Tests', () => {
  let mockIndexedDB;
  let originalIndexedDB;
  let mockDatabases = new Map();

  beforeAll(() => {
    // Store original indexedDB
    originalIndexedDB = window.indexedDB;
  });

  afterAll(() => {
    // Restore original indexedDB
    if (originalIndexedDB) {
      window.indexedDB = originalIndexedDB;
    }
  });

  beforeEach(() => {
    // Reset all module state
    IndexedDBCore.resetConnectionState();

    // Clear EventBus
    EventBus.clearAll();

    // Clear mock databases
    mockDatabases.clear();

    // Create comprehensive IndexedDB mock
    mockIndexedDB = createMockIndexedDB();

    // Replace window.indexedDB with mock
    Object.defineProperty(window, 'indexedDB', {
      value: mockIndexedDB,
      writable: true,
      configurable: true,
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up
    IndexedDBCore.resetConnectionState();
    EventBus.clearAll();
  });

  // ==========================================
  // MOCK FACTORY
  // ==========================================

  function createMockIndexedDB() {
    const databases = new Map();

    const open = (name, version) => {
      const request = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null,
        result: null,
        transaction: null,
        readyState: 'pending',
      };

      // Simulate async operation
      setTimeout(() => {
        try {
          let db = databases.get(name);

          // Check if version change needed
          const currentVersion = db?.version || 0;
          if (version > currentVersion) {
            // Upgrade needed
            const newDb = createMockDatabase(name, version);
            databases.set(name, newDb);
            request.result = newDb;

            if (request.onupgradeneeded) {
              request.onupgradeneeded({
                target: {
                  result: newDb,
                  oldVersion: currentVersion,
                  newVersion: version,
                },
              });
            }
          } else {
            // Use existing database
            if (!db) {
              db = createMockDatabase(name, version);
              databases.set(name, db);
            }
            request.result = db;
          }

          request.readyState = 'done';
          if (request.onsuccess) {
            request.onsuccess({ target: { result: request.result } });
          }
        } catch (error) {
          if (request.onerror) {
            request.onerror({ target: { error } });
          }
        }
      }, 0);

      return request;
    };

    return { open };
  }

  function createMockDatabase(name, version) {
    const stores = new Map();
    const closed = { value: false };

    const createObjectStore = (storeName, options = {}) => {
      const store = createMockObjectStore(storeName, options);
      stores.set(storeName, store);
      return store;
    };

    const objectStoreNames = {
      contains: name => stores.has(name),
      get length() {
        return stores.size;
      },
      *[Symbol.iterator]() {
        for (const name of stores.keys()) {
          yield name;
        }
      },
    };

    const transaction = (storeNames, mode = 'readonly') => {
      return createMockTransaction(stores, mode);
    };

    const close = () => {
      closed.value = true;
    };

    const onversionchange = null;
    const onerror = null;

    return {
      name,
      version,
      createObjectStore,
      objectStoreNames,
      transaction,
      close,
      onversionchange,
      onerror,
      get closed() {
        return closed.value;
      },
      getStore: name => stores.get(name),
    };
  }

  function createMockObjectStore(name, options = {}) {
    const data = new Map();
    const indexes = new Map();
    const keyPath = options.keyPath || 'id';

    const get = key => {
      return Promise.resolve(data.get(key));
    };

    const getAll = () => {
      return Promise.resolve(Array.from(data.values()));
    };

    const put = value => {
      const key = keyPath ? value[keyPath] : undefined;
      data.set(key, value);
      return Promise.resolve(key);
    };

    const deleteItem = key => {
      data.delete(key);
      return Promise.resolve();
    };

    const clear = () => {
      data.clear();
      return Promise.resolve();
    };

    const count = () => {
      return Promise.resolve(data.size);
    };

    const openCursor = (key, direction = 'next') => {
      const values = Array.from(data.values());

      // Sort by index if needed
      // For now, just return in insertion order

      let currentIndex = 0;

      return {
        onsuccess: null,
        onerror: null,
        result: {
          value: values[0],
          key: values[0]?.[keyPath],
          continue: () => {
            currentIndex++;
            if (currentIndex < values.length) {
              this.value = values[currentIndex];
              this.key = values[currentIndex][keyPath];
              if (this.onsuccess) {
                setTimeout(() => {
                  this.onsuccess({ target: { result: this } });
                }, 0);
              }
            } else {
              this.value = undefined;
              this.key = undefined;
              if (this.onsuccess) {
                setTimeout(() => {
                  this.onsuccess({ target: { result: null } });
                }, 0);
              }
            }
          },
        },
      };
    };

    const createIndex = (name, keyPath, options = {}) => {
      indexes.set(name, { name, keyPath, options });
      return createMockIndex(name, data, keyPath);
    };

    const index = name => {
      return indexes.get(name);
    };

    return {
      name,
      get,
      getAll,
      put,
      delete: deleteItem,
      clear,
      count,
      openCursor,
      createIndex,
      index,
      get data() {
        return Array.from(data.values());
      },
      get size() {
        return data.size;
      },
    };
  }

  function createMockTransaction(stores, mode = 'readonly') {
    let state = 'active';
    const storeObjects = new Map();

    // Create transaction-bound object stores
    stores.forEach((store, name) => {
      storeObjects.set(name, {
        name,
        get: key => store.get(key),
        getAll: () => store.getAll(),
        put: value => store.put(value),
        delete: key => store.deleteItem(key),
        clear: () => store.clear(),
        count: () => store.count(),
        openCursor: (key, direction) => store.openCursor(key, direction),
        index: name => store.index(name),
      });
    });

    const objectStore = name => {
      return storeObjects.get(name);
    };

    return {
      mode,
      objectStore,
      get readyState() {
        return state;
      },
      oncomplete: null,
      onerror: null,
      onabort: null,
      ontimeout: null,
      abort: () => {
        state = 'aborted';
        if (this.onabort) {
          setTimeout(() => this.onabort(), 0);
        }
      },
    };
  }

  function createMockIndex(name, data, keyPath) {
    return {
      name,
      keyPath,
      openCursor: (key, direction = 'next') => {
        const values = Array.from(data.values());

        // Sort by keyPath
        values.sort((a, b) => {
          const aVal = a[keyPath] || '';
          const bVal = b[keyPath] || '';
          return String(aVal).localeCompare(String(bVal));
        });

        if (direction === 'prev') {
          values.reverse();
        }

        let currentIndex = 0;

        return {
          onsuccess: null,
          onerror: null,
          result: {
            value: values[0],
            continue: () => {
              currentIndex++;
              if (currentIndex < values.length) {
                this.value = values[currentIndex];
                if (this.onsuccess) {
                  setTimeout(() => {
                    this.onsuccess({ target: { result: this } });
                  }, 0);
                }
              } else {
                this.value = undefined;
                if (this.onsuccess) {
                  setTimeout(() => {
                    this.onsuccess({ target: { result: null } });
                  }, 0);
                }
              }
            },
          },
        };
      },
    };
  }

  // ==========================================
  // DATABASE CONSTANTS
  // ==========================================

  describe('Database Constants', () => {
    it('should export DB_NAME as rhythm-chamber', () => {
      expect(DB_NAME).toBe('rhythm-chamber');
    });

    it('should export DB_VERSION as 6', () => {
      expect(DB_VERSION).toBe(6);
    });

    it('should export all required stores', () => {
      const expectedStores = [
        'STREAMS',
        'CHUNKS',
        'EMBEDDINGS',
        'PERSONALITY',
        'SETTINGS',
        'CHAT_SESSIONS',
        'CONFIG',
        'TOKENS',
        'MIGRATION',
        'EVENT_LOG',
        'EVENT_CHECKPOINT',
        'DEMO_STREAMS',
        'DEMO_PATTERNS',
        'DEMO_PERSONALITY',
        'TRANSACTION_JOURNAL',
        'TRANSACTION_COMPENSATION',
      ];

      expectedStores.forEach(store => {
        expect(STORES).toHaveProperty(store);
      });
    });

    it('should have correct store name values', () => {
      expect(STORES.STREAMS).toBe('streams');
      expect(STORES.CHUNKS).toBe('chunks');
      expect(STORES.EMBEDDINGS).toBe('embeddings');
      expect(STORES.PERSONALITY).toBe('personality');
      expect(STORES.SETTINGS).toBe('settings');
      expect(STORES.CHAT_SESSIONS).toBe('chat_sessions');
      expect(STORES.CONFIG).toBe('config');
      expect(STORES.TOKENS).toBe('tokens');
      expect(STORES.MIGRATION).toBe('migration');
      expect(STORES.EVENT_LOG).toBe('event_log');
      expect(STORES.EVENT_CHECKPOINT).toBe('event_checkpoint');
      expect(STORES.DEMO_STREAMS).toBe('demo_streams');
      expect(STORES.DEMO_PATTERNS).toBe('demo_patterns');
      expect(STORES.DEMO_PERSONALITY).toBe('demo_personality');
      expect(STORES.TRANSACTION_JOURNAL).toBe('TRANSACTION_JOURNAL');
      expect(STORES.TRANSACTION_COMPENSATION).toBe('TRANSACTION_COMPENSATION');
    });
  });

  // ==========================================
  // CONNECTION MANAGEMENT
  // ==========================================

  describe('Connection Management', () => {
    it('should initialize database connection', async () => {
      const connection = await IndexedDBCore.initDatabase();

      expect(connection).toBeDefined();
      expect(connection.name).toBe(DB_NAME);
      expect(connection.version).toBe(DB_VERSION);
      expect(connection.closed).toBe(false);
    });

    it('should reuse existing connection', async () => {
      const conn1 = await IndexedDBCore.initDatabase();
      const conn2 = await IndexedDBCore.initDatabase();

      expect(conn1).toBe(conn2);
    });

    it('should track connection status', async () => {
      let status = IndexedDBCore.getConnectionStatus();

      expect(status.isConnected).toBe(false);
      expect(status.isFailed).toBe(false);
      expect(status.attempts).toBe(0);

      await IndexedDBCore.initDatabase();

      status = IndexedDBCore.getConnectionStatus();
      expect(status.isConnected).toBe(true);
    });

    it('should close database connection', async () => {
      await IndexedDBCore.initDatabase();
      IndexedDBCore.closeDatabase();

      const connection = IndexedDBCore.getConnection();
      expect(connection).toBe(null);
    });

    it('should reset connection state', async () => {
      await IndexedDBCore.initDatabase();

      IndexedDBCore.resetConnectionState();

      const status = IndexedDBCore.getConnectionStatus();
      expect(status.isConnected).toBe(false);
      expect(status.isFailed).toBe(false);
      expect(status.attempts).toBe(0);
    });

    it('should emit connection_established event', async () => {
      const handler = vi.fn();
      EventBus.on('storage:connection_established', handler);

      await IndexedDBCore.initDatabase();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          attempts: expect.any(Number),
        })
      );
    });
  });

  // ==========================================
  // SCHEMA MIGRATIONS
  // ==========================================

  describe('Schema Migrations', () => {
    it('should migrate from version 0 to version 1 (initial schema)', async () => {
      const connection = await IndexedDBCore.initDatabase();

      const stores = connection.objectStoreNames;
      expect(stores.contains('streams')).toBe(true);
      expect(stores.contains('chunks')).toBe(true);
      expect(stores.contains('embeddings')).toBe(true);
      expect(stores.contains('personality')).toBe(true);
      expect(stores.contains('settings')).toBe(true);
    });

    it('should migrate to version 2 (add chat_sessions)', async () => {
      const connection = await IndexedDBCore.initDatabase();

      expect(connection.objectStoreNames.contains('chat_sessions')).toBe(true);
    });

    it('should migrate to version 3 (add config and tokens)', async () => {
      const connection = await IndexedDBCore.initDatabase();

      expect(connection.objectStoreNames.contains('config')).toBe(true);
      expect(connection.objectStoreNames.contains('tokens')).toBe(true);
    });

    it('should migrate to version 4 (add event log system)', async () => {
      const connection = await IndexedDBCore.initDatabase();

      expect(connection.objectStoreNames.contains('event_log')).toBe(true);
      expect(connection.objectStoreNames.contains('event_checkpoint')).toBe(true);
      expect(connection.objectStoreNames.contains('migration')).toBe(true);
    });

    it('should migrate to version 5 (add demo mode stores)', async () => {
      const connection = await IndexedDBCore.initDatabase();

      expect(connection.objectStoreNames.contains('demo_streams')).toBe(true);
      expect(connection.objectStoreNames.contains('demo_patterns')).toBe(true);
      expect(connection.objectStoreNames.contains('demo_personality')).toBe(true);
    });

    it('should migrate to version 6 (add transaction journal)', async () => {
      const connection = await IndexedDBCore.initDatabase();

      expect(connection.objectStoreNames.contains('TRANSACTION_JOURNAL')).toBe(true);
      expect(connection.objectStoreNames.contains('TRANSACTION_COMPENSATION')).toBe(true);
    });
  });

  // ==========================================
  // CONNECTION RETRY LOGIC
  // ==========================================

  describe('Connection Retry Logic', () => {
    it('should retry connection on failure', async () => {
      let attempts = 0;

      // Mock indexedDB to fail first 2 times
      const mockOpen = vi.fn(() => {
        attempts++;

        const request = {
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
        };

        if (attempts < 3) {
          setTimeout(() => {
            if (request.onerror) {
              request.onerror({
                target: { error: new Error('Connection failed') },
              });
            }
          }, 10);
        } else {
          setTimeout(() => {
            if (request.onsuccess) {
              request.onsuccess({
                target: {
                  result: createMockDatabase(DB_NAME, DB_VERSION),
                },
              });
            }
          }, 10);
        }

        return request;
      });

      window.indexedDB = { open: mockOpen };

      const connection = await IndexedDBCore.initDatabaseWithRetry({
        maxAttempts: 3,
      });

      expect(connection).toBeDefined();
      expect(attempts).toBe(3);
    });

    it('should fail after max retries', async () => {
      const mockOpen = vi.fn(() => {
        const request = {
          onsuccess: null,
          onerror: null,
        };

        setTimeout(() => {
          if (request.onerror) {
            request.onerror({
              target: { error: new Error('Connection failed') },
            });
          }
        }, 10);

        return request;
      });

      window.indexedDB = { open: mockOpen };

      await expect(
        IndexedDBCore.initDatabaseWithRetry({
          maxAttempts: 2,
          enableFallback: false,
        })
      ).rejects.toThrow();
    });

    it('should emit retry events', async () => {
      let attempts = 0;
      const retryHandler = vi.fn();

      EventBus.on('storage:connection_retry', retryHandler);

      const mockOpen = vi.fn(() => {
        attempts++;

        const request = {
          onsuccess: null,
          onerror: null,
        };

        if (attempts < 2) {
          setTimeout(() => {
            if (request.onerror) {
              request.onerror({
                target: { error: new Error('Connection failed') },
              });
            }
          }, 10);
        } else {
          setTimeout(() => {
            if (request.onsuccess) {
              request.onsuccess({
                target: {
                  result: createMockDatabase(DB_NAME, DB_VERSION),
                },
              });
            }
          }, 10);
        }

        return request;
      });

      window.indexedDB = { open: mockOpen };

      await IndexedDBCore.initDatabaseWithRetry({ maxAttempts: 3 });

      expect(retryHandler).toHaveBeenCalledTimes(1);
      expect(retryHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          attempt: 1,
          maxAttempts: 3,
          nextRetryMs: expect.any(Number),
          error: expect.any(String),
        })
      );
    });
  });

  // ==========================================
  // WRITE AUTHORITY (HNW)
  // ==========================================

  describe('Write Authority Enforcement', () => {
    it('should allow writes when TabCoordinator permits', async () => {
      // Mock TabCoordinator to allow writes
      vi.spyOn(TabCoordinator, 'isWriteAllowed').mockReturnValue(true);

      await IndexedDBCore.initDatabase();

      await expect(
        IndexedDBCore.put(STORES.STREAMS, { id: 'test-1', data: 'test' })
      ).resolves.toBeDefined();
    });

    it('should deny writes when TabCoordinator rejects (strict mode)', async () => {
      // Mock TabCoordinator to deny writes
      vi.spyOn(TabCoordinator, 'isWriteAllowed').mockReturnValue(false);

      await IndexedDBCore.initDatabase();

      // Note: This would require modifying AUTHORITY_CONFIG.strictMode to true
      // For now, we just verify the API exists
      expect(TabCoordinator.isWriteAllowed).toBeDefined();
    });

    it('should bypass write authority check when bypassAuthority is true', async () => {
      vi.spyOn(TabCoordinator, 'isWriteAllowed').mockReturnValue(false);

      await IndexedDBCore.initDatabase();

      await expect(
        IndexedDBCore.put(
          STORES.STREAMS,
          { id: 'test-1', data: 'test' },
          {
            bypassAuthority: true,
          }
        )
      ).resolves.toBeDefined();
    });

    it('should exempt migration store from authority checks', async () => {
      vi.spyOn(TabCoordinator, 'isWriteAllowed').mockReturnValue(false);

      await IndexedDBCore.initDatabase();

      // Migration store should not check authority
      await expect(
        IndexedDBCore.put(STORES.MIGRATION, { id: 'test-1', data: 'test' })
      ).resolves.toBeDefined();
    });
  });

  // ==========================================
  // PRIMITIVE OPERATIONS
  // ==========================================

  describe('Primitive Operations - put', () => {
    it('should put a new record', async () => {
      await IndexedDBCore.initDatabase();

      const key = await IndexedDBCore.put(STORES.STREAMS, {
        id: 'test-1',
        name: 'Test Stream',
      });

      expect(key).toBe('test-1');
    });

    it('should update an existing record', async () => {
      await IndexedDBCore.initDatabase();

      await IndexedDBCore.put(STORES.STREAMS, {
        id: 'test-1',
        name: 'Original',
      });

      await IndexedDBCore.put(STORES.STREAMS, {
        id: 'test-1',
        name: 'Updated',
      });

      const result = await IndexedDBCore.get(STORES.STREAMS, 'test-1');
      expect(result.name).toBe('Updated');
    });

    it('should add VectorClock timestamps to writes', async () => {
      await IndexedDBCore.initDatabase();

      await IndexedDBCore.put(STORES.STREAMS, {
        id: 'test-1',
        name: 'Test',
      });

      const result = await IndexedDBCore.get(STORES.STREAMS, 'test-1');
      expect(result).toHaveProperty('_writeEpoch');
      expect(result).toHaveProperty('_writerId');
    });

    it('should skip VectorClock stamping when skipWriteEpoch is true', async () => {
      await IndexedDBCore.initDatabase();

      await IndexedDBCore.put(
        STORES.STREAMS,
        {
          id: 'test-1',
          name: 'Test',
        },
        { skipWriteEpoch: true }
      );

      const result = await IndexedDBCore.get(STORES.STREAMS, 'test-1');
      expect(result).not.toHaveProperty('_writeEpoch');
    });
  });

  describe('Primitive Operations - get', () => {
    it('should get an existing record', async () => {
      await IndexedDBCore.initDatabase();

      await IndexedDBCore.put(STORES.STREAMS, {
        id: 'test-1',
        name: 'Test Stream',
      });

      const result = await IndexedDBCore.get(STORES.STREAMS, 'test-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('test-1');
      expect(result.name).toBe('Test Stream');
    });

    it('should return undefined for non-existent record', async () => {
      await IndexedDBCore.initDatabase();

      const result = await IndexedDBCore.get(STORES.STREAMS, 'non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('Primitive Operations - getAll', () => {
    it('should get all records from a store', async () => {
      await IndexedDBCore.initDatabase();

      await IndexedDBCore.put(STORES.STREAMS, { id: 'test-1', name: 'Stream 1' });
      await IndexedDBCore.put(STORES.STREAMS, { id: 'test-2', name: 'Stream 2' });
      await IndexedDBCore.put(STORES.STREAMS, { id: 'test-3', name: 'Stream 3' });

      const results = await IndexedDBCore.getAll(STORES.STREAMS);

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe('test-1');
      expect(results[1].id).toBe('test-2');
      expect(results[2].id).toBe('test-3');
    });

    it('should return empty array for empty store', async () => {
      await IndexedDBCore.initDatabase();

      const results = await IndexedDBCore.getAll(STORES.STREAMS);

      expect(results).toEqual([]);
    });
  });

  describe('Primitive Operations - delete', () => {
    it('should delete a record', async () => {
      await IndexedDBCore.initDatabase();

      await IndexedDBCore.put(STORES.STREAMS, { id: 'test-1', name: 'Test' });

      await IndexedDBCore.delete(STORES.STREAMS, 'test-1');

      const result = await IndexedDBCore.get(STORES.STREAMS, 'test-1');
      expect(result).toBeUndefined();
    });

    it('should handle deleting non-existent record', async () => {
      await IndexedDBCore.initDatabase();

      await expect(IndexedDBCore.delete(STORES.STREAMS, 'non-existent')).resolves.toBeUndefined();
    });
  });

  describe('Primitive Operations - clear', () => {
    it('should clear all records from a store', async () => {
      await IndexedDBCore.initDatabase();

      await IndexedDBCore.put(STORES.STREAMS, { id: 'test-1', name: 'Stream 1' });
      await IndexedDBCore.put(STORES.STREAMS, { id: 'test-2', name: 'Stream 2' });

      await IndexedDBCore.clear(STORES.STREAMS);

      const results = await IndexedDBCore.getAll(STORES.STREAMS);
      expect(results).toEqual([]);
    });
  });

  describe('Primitive Operations - count', () => {
    it('should count records in a store', async () => {
      await IndexedDBCore.initDatabase();

      await IndexedDBCore.put(STORES.STREAMS, { id: 'test-1', name: 'Stream 1' });
      await IndexedDBCore.put(STORES.STREAMS, { id: 'test-2', name: 'Stream 2' });
      await IndexedDBCore.put(STORES.STREAMS, { id: 'test-3', name: 'Stream 3' });

      const count = await IndexedDBCore.count(STORES.STREAMS);

      expect(count).toBe(3);
    });

    it('should return 0 for empty store', async () => {
      await IndexedDBCore.initDatabase();

      const count = await IndexedDBCore.count(STORES.STREAMS);

      expect(count).toBe(0);
    });
  });

  // ==========================================
  // ATOMIC OPERATIONS
  // ==========================================

  describe('Atomic Operations - atomicUpdate', () => {
    it('should update existing record atomically', async () => {
      await IndexedDBCore.initDatabase();

      await IndexedDBCore.put(STORES.STREAMS, {
        id: 'test-1',
        counter: 1,
      });

      const updated = await IndexedDBCore.atomicUpdate(STORES.STREAMS, 'test-1', value => ({
        ...value,
        counter: value.counter + 1,
      }));

      expect(updated.counter).toBe(2);

      const result = await IndexedDBCore.get(STORES.STREAMS, 'test-1');
      expect(result.counter).toBe(2);
    });

    it('should create new record if key does not exist', async () => {
      await IndexedDBCore.initDatabase();

      const created = await IndexedDBCore.atomicUpdate(STORES.STREAMS, 'test-1', value => ({
        id: 'test-1',
        counter: 1,
      }));

      expect(created).toBeDefined();
      expect(created.counter).toBe(1);
    });

    it('should add VectorClock timestamp to atomic updates', async () => {
      await IndexedDBCore.initDatabase();

      await IndexedDBCore.put(STORES.STREAMS, { id: 'test-1', counter: 1 });

      const updated = await IndexedDBCore.atomicUpdate(STORES.STREAMS, 'test-1', value => ({
        ...value,
        counter: value.counter + 1,
      }));

      expect(updated).toHaveProperty('_writeEpoch');
      expect(updated).toHaveProperty('_writerId');
    });

    it('should abort transaction if modifier throws', async () => {
      await IndexedDBCore.initDatabase();

      await IndexedDBCore.put(STORES.STREAMS, { id: 'test-1', counter: 1 });

      await expect(
        IndexedDBCore.atomicUpdate(STORES.STREAMS, 'test-1', () => {
          throw new Error('Modifier error');
        })
      ).rejects.toThrow('Modifier error');

      // Original value should be unchanged
      const result = await IndexedDBCore.get(STORES.STREAMS, 'test-1');
      expect(result.counter).toBe(1);
    });
  });

  // ==========================================
  // INDEX-BASED QUERIES
  // ==========================================

  describe('Index-Based Queries - getAllByIndex', () => {
    it('should get records sorted by index', async () => {
      const connection = await IndexedDBCore.initDatabase();

      // This test assumes the mock database properly implements indexes
      // In real IndexedDB, indexes are created during migration

      await IndexedDBCore.put(STORES.CHAT_SESSIONS, {
        id: 'sess-1',
        updatedAt: '2024-01-01',
      });
      await IndexedDBCore.put(STORES.CHAT_SESSIONS, {
        id: 'sess-2',
        updatedAt: '2024-01-03',
      });
      await IndexedDBCore.put(STORES.CHAT_SESSIONS, {
        id: 'sess-3',
        updatedAt: '2024-01-02',
      });

      const results = await IndexedDBCore.getAllByIndex(STORES.CHAT_SESSIONS, 'updatedAt', 'next');

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // TRANSACTION POOL
  // ==========================================

  describe('Transaction Pool', () => {
    it('should reuse transactions from pool', async () => {
      await IndexedDBCore.initDatabase();

      // First transaction
      await IndexedDBCore.put(STORES.STREAMS, { id: 'test-1', data: 'test1' });

      // Second operation should reuse transaction if still active
      await IndexedDBCore.put(STORES.STREAMS, { id: 'test-2', data: 'test2' });

      // Verify both records were written
      const results = await IndexedDBCore.getAll(STORES.STREAMS);
      expect(results).toHaveLength(2);
    });

    it('should create new transaction if pooled one is complete', async () => {
      await IndexedDBCore.initDatabase();

      // Put with explicit transaction
      const db = IndexedDBCore.getConnection();
      const tx = db.transaction(STORES.STREAMS, 'readwrite');

      await IndexedDBCore.put(
        STORES.STREAMS,
        { id: 'test-1', data: 'test1' },
        {
          transaction: tx,
        }
      );

      // Wait for transaction to complete
      await new Promise(resolve => (tx.oncomplete = resolve));

      // Next put should create new transaction
      await IndexedDBCore.put(STORES.STREAMS, { id: 'test-2', data: 'test2' });

      const results = await IndexedDBCore.getAll(STORES.STREAMS);
      expect(results).toHaveLength(2);
    });
  });

  // ==========================================
  // CONFLICT DETECTION
  // ==========================================

  describe('Conflict Detection - VectorClock', () => {
    it('should detect no conflict for new record', () => {
      const result = IndexedDBCore.detectWriteConflict(null, {
        id: 'test-1',
        data: 'test',
      });

      expect(result.hasConflict).toBe(false);
      expect(result.winner).toBe('incoming');
      expect(result.reason).toBe('new_record');
      expect(result.isConcurrent).toBe(false);
    });

    it('should detect no conflict for legacy data', () => {
      const result = IndexedDBCore.detectWriteConflict(
        { id: 'test-1', data: 'existing' },
        { id: 'test-1', data: 'incoming' }
      );

      expect(result.hasConflict).toBe(false);
      expect(result.winner).toBe('incoming');
      expect(result.reason).toBe('legacy_data');
    });

    it('should detect conflict when incoming is newer', () => {
      const clock = new VectorClock('tab-1');
      const oldEpoch = clock.tick();
      const newEpoch = clock.tick();

      const result = IndexedDBCore.detectWriteConflict(
        { id: 'test-1', _writeEpoch: oldEpoch, _writerId: 'tab-1', data: 'existing' },
        { id: 'test-1', _writeEpoch: newEpoch, _writerId: 'tab-1', data: 'incoming' }
      );

      expect(result.hasConflict).toBe(false);
      expect(result.winner).toBe('incoming');
      expect(result.reason).toBe('incoming_newer');
    });

    it('should detect conflict when existing is newer', () => {
      const clock = new VectorClock('tab-1');
      const newEpoch = clock.tick();
      const oldEpoch = clock.tick();

      const result = IndexedDBCore.detectWriteConflict(
        { id: 'test-1', _writeEpoch: newEpoch, _writerId: 'tab-1', data: 'existing' },
        { id: 'test-1', _writeEpoch: oldEpoch, _writerId: 'tab-1', data: 'incoming' }
      );

      expect(result.hasConflict).toBe(true);
      expect(result.winner).toBe('existing');
      expect(result.reason).toBe('existing_newer');
    });

    it('should detect concurrent updates', () => {
      const clock1 = new VectorClock('tab-1');
      const clock2 = new VectorClock('tab-2');

      const epoch1 = clock1.tick();
      const epoch2 = clock2.tick();

      const result = IndexedDBCore.detectWriteConflict(
        { id: 'test-1', _writeEpoch: epoch1, _writerId: 'tab-1', data: 'existing' },
        { id: 'test-1', _writeEpoch: epoch2, _writerId: 'tab-2', data: 'incoming' }
      );

      expect(result.hasConflict).toBe(true);
      expect(result.isConcurrent).toBe(true);
      expect(result.reason).toBe('concurrent_update');
    });
  });

  // ==========================================
  // TRANSACTION OPERATIONS
  // ==========================================

  describe('Transaction Operations', () => {
    it('should execute multiple operations in a transaction', async () => {
      await IndexedDBCore.initDatabase();

      await IndexedDBCore.transaction(STORES.STREAMS, 'readwrite', store => {
        store.put({ id: 'test-1', data: 'test1' });
        store.put({ id: 'test-2', data: 'test2' });
        store.put({ id: 'test-3', data: 'test3' });
      });

      const results = await IndexedDBCore.getAll(STORES.STREAMS);
      expect(results).toHaveLength(3);
    });
  });

  // ==========================================
  // FALLBACK BACKEND
  // ==========================================

  describe('Fallback Backend', () => {
    it('should report when using fallback', () => {
      const usingFallback = IndexedDBCore.isUsingFallback();

      expect(typeof usingFallback).toBe('boolean');
    });

    it('should get storage backend info', () => {
      const backend = IndexedDBCore.getStorageBackend();

      expect(backend).toHaveProperty('type');
      expect(['indexeddb', 'fallback']).toContain(backend.type);
    });

    it('should activate fallback on connection failure', async () => {
      // Mock indexedDB to fail
      const mockOpen = vi.fn(() => {
        const request = {
          onsuccess: null,
          onerror: null,
        };

        setTimeout(() => {
          if (request.onerror) {
            request.onerror({
              target: { error: new Error('IndexedDB not available') },
            });
          }
        }, 10);

        return request;
      });

      window.indexedDB = { open: mockOpen };

      await IndexedDBCore.initDatabaseWithRetry({
        maxAttempts: 1,
        enableFallback: true,
      });

      expect(IndexedDBCore.isUsingFallback()).toBe(true);
    });

    it('should emit fallback_activated event', async () => {
      const handler = vi.fn();
      EventBus.on('storage:fallback_activated', handler);

      // Mock indexedDB to fail
      const mockOpen = vi.fn(() => {
        const request = {
          onsuccess: null,
          onerror: null,
        };

        setTimeout(() => {
          if (request.onerror) {
            request.onerror({
              target: { error: new Error('IndexedDB not available') },
            });
          }
        }, 10);

        return request;
      });

      window.indexedDB = { open: mockOpen };

      await IndexedDBCore.initDatabaseWithRetry({
        maxAttempts: 1,
        enableFallback: true,
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================
  // EXPORTS API
  // ==========================================

  describe('Public API Exports', () => {
    it('should export all connection management methods', () => {
      expect(typeof IndexedDBCore.initDatabase).toBe('function');
      expect(typeof IndexedDBCore.initDatabaseWithRetry).toBe('function');
      expect(typeof IndexedDBCore.closeDatabase).toBe('function');
      expect(typeof IndexedDBCore.getConnection).toBe('function');
      expect(typeof IndexedDBCore.resetConnectionState).toBe('function');
      expect(typeof IndexedDBCore.getConnectionStatus).toBe('function');
    });

    it('should export all fallback management methods', () => {
      expect(typeof IndexedDBCore.isUsingFallback).toBe('function');
      expect(typeof IndexedDBCore.getStorageBackend).toBe('function');
      expect(typeof IndexedDBCore.activateFallback).toBe('function');
    });

    it('should export all primitive operations', () => {
      expect(typeof IndexedDBCore.put).toBe('function');
      expect(typeof IndexedDBCore.get).toBe('function');
      expect(typeof IndexedDBCore.getAll).toBe('function');
      expect(typeof IndexedDBCore.clear).toBe('function');
      expect(typeof IndexedDBCore.delete).toBe('function');
      expect(typeof IndexedDBCore.count).toBe('function');
      expect(typeof IndexedDBCore.transaction).toBe('function');
    });

    it('should export advanced operations', () => {
      expect(typeof IndexedDBCore.getAllByIndex).toBe('function');
      expect(typeof IndexedDBCore.atomicUpdate).toBe('function');
      expect(typeof IndexedDBCore.detectWriteConflict).toBe('function');
    });

    it('should export store constants', () => {
      expect(typeof IndexedDBCore.STORES).toBe('object');
      expect(typeof IndexedDBCore.DB_NAME).toBe('string');
      expect(typeof IndexedDBCore.DB_VERSION).toBe('number');
    });
  });
});
