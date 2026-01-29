/**
 * Simple Characterization Tests for Storage Facade
 *
 * Purpose: Verify basic functionality before refactoring
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock modules before importing storage
vi.mock('../../js/storage/indexeddb.js', () => ({
  IndexedDBCore: {
    initDatabaseWithRetry: vi.fn(() => Promise.resolve()),
    getConnection: vi.fn(() => ({})),
    put: vi.fn(() => Promise.resolve('key')),
    get: vi.fn(() => Promise.resolve(null)),
    getAll: vi.fn(() => Promise.resolve([])),
    clear: vi.fn(() => Promise.resolve()),
    delete: vi.fn(() => Promise.resolve()),
    count: vi.fn(() => Promise.resolve(0)),
    getAllByIndex: vi.fn(() => Promise.resolve([])),
    transaction: vi.fn(() => Promise.resolve()),
    atomicUpdate: vi.fn(() => Promise.resolve({ id: 'all', data: [] })),
    closeDatabase: vi.fn(),
    isUsingFallback: vi.fn(() => false)
  },
  STORES: {
    STREAMS: 'streams',
    CHUNKS: 'chunks',
    EMBEDDINGS: 'embeddings',
    PERSONALITY: 'personality',
    SETTINGS: 'settings',
    CHAT_SESSIONS: 'chat_sessions',
    CONFIG: 'config',
    TOKENS: 'tokens',
    MIGRATION: 'migration',
    TRANSACTION_JOURNAL: 'TRANSACTION_JOURNAL',
    TRANSACTION_COMPENSATION: 'TRANSACTION_COMPENSATION'
  }
}));

vi.mock('../../js/storage/transaction/index.js', () => ({
  StorageTransaction: {
    transaction: vi.fn()
  }
}));

vi.mock('../../js/storage/migration.js', () => ({
  StorageMigration: {
    migrateFromLocalStorage: vi.fn(() => Promise.resolve()),
    rollbackMigration: vi.fn(() => Promise.resolve()),
    getMigrationState: vi.fn(() => ({}))
  }
}));

vi.mock('../../js/storage/write-ahead-log/index.js', () => ({
  WriteAheadLog: {
    init: vi.fn(() => Promise.resolve())
  },
  WalPriority: {}
}));

vi.mock('../../js/storage/archive-service.js', () => ({
  ArchiveService: {
    archiveOldStreams: vi.fn(() => Promise.resolve({ archived: 0, kept: 0, savedBytes: 0 })),
    restoreFromArchive: vi.fn(() => Promise.resolve({ restored: 0, remaining: 0 })),
    getArchiveStats: vi.fn(() => Promise.resolve({ totalArchived: 0 })),
    clearArchive: vi.fn(() => Promise.resolve({ deleted: 0 }))
  }
}));

vi.mock('../../js/storage/quota-manager.js', () => ({
  QuotaManager: {
    init: vi.fn(() => Promise.resolve()),
    on: vi.fn()
  }
}));

vi.mock('../../js/storage/profiles.js', () => ({
  ProfileStorage: {
    init: vi.fn(),
    saveProfile: vi.fn(() => Promise.resolve()),
    getAllProfiles: vi.fn(() => Promise.resolve([])),
    getProfile: vi.fn(() => Promise.resolve(null)),
    deleteProfile: vi.fn(() => Promise.resolve()),
    getActiveProfileId: vi.fn(() => Promise.resolve(null)),
    setActiveProfile: vi.fn(() => Promise.resolve()),
    getProfileCount: vi.fn(() => Promise.resolve(0)),
    clearAllProfiles: vi.fn(() => Promise.resolve())
  }
}));

vi.mock('../../js/storage/config-api.js', () => ({
  ConfigAPI: {
    getConfig: vi.fn(() => 'value'),
    setConfig: vi.fn(),
    removeConfig: vi.fn(),
    getToken: vi.fn(() => 'token'),
    setToken: vi.fn(),
    removeToken: vi.fn()
  }
}));

vi.mock('../../js/storage/sync-strategy.js', () => ({
  SyncManager: {
    getStrategy: vi.fn(() => null)
  }
}));

vi.mock('../../js/storage/auto-repair.js', () => ({
  AutoRepairService: class {
    constructor() {
      this.getAutoRepairConfig = vi.fn(() => ({ enabled: false }));
      this.setAutoRepairConfig = vi.fn(() => ({ enabled: false }));
      this.getRepairLog = vi.fn(() => []);
      this.clearRepairLog = vi.fn();
      this._logRepair = vi.fn();
    }
  }
}));

vi.mock('../../js/security/crypto.js', () => ({
  Crypto: {
    isSecureContext: vi.fn(() => true)
  }
}));

vi.mock('../../js/services/event-bus.js', () => ({
  EventBus: {
    emit: vi.fn(() => Promise.resolve()),
    registerSchemas: vi.fn(() => Promise.resolve())
  }
}));

vi.mock('../../js/module-registry.js', () => ({
  ModuleRegistry: {
    getModule: vi.fn(() => Promise.resolve(null))
  }
}));

// Now import Storage after all mocks are set up
import { Storage, STORES } from '../../js/storage.js';

describe('Storage Facade - Simple Characterization Tests', () => {
  let IndexedDBCore, ConfigAPI, EventBus;

  beforeEach(() => {
    vi.clearAllMocks();

    // Get mocked modules
    ({ IndexedDBCore } = require('../../js/storage/indexeddb.js'));
    ({ ConfigAPI } = require('../../js/storage/config-api.js'));
    ({ EventBus } = require('../../js/services/event-bus.js'));

    // Set up default mock behaviors using vi.fn() spies
    IndexedDBCore.get = vi.fn().mockResolvedValue(null);
    IndexedDBCore.getConnection = vi.fn().mockReturnValue({});
    IndexedDBCore.isUsingFallback = vi.fn().mockReturnValue(false);
    IndexedDBCore.put = vi.fn().mockResolvedValue('key');
    IndexedDBCore.getAll = vi.fn().mockResolvedValue([]);
    IndexedDBCore.clear = vi.fn().mockResolvedValue();
    IndexedDBCore.delete = vi.fn().mockResolvedValue();
    IndexedDBCore.count = vi.fn().mockResolvedValue(0);
    IndexedDBCore.getAllByIndex = vi.fn().mockResolvedValue([]);
    IndexedDBCore.transaction = vi.fn().mockResolvedValue();
    IndexedDBCore.atomicUpdate = vi.fn().mockResolvedValue({ id: 'all', data: [] });
    IndexedDBCore.closeDatabase = vi.fn();
    IndexedDBCore.initDatabaseWithRetry = vi.fn().mockResolvedValue();

    ConfigAPI.getConfig = vi.fn().mockReturnValue('value');
    ConfigAPI.setConfig = vi.fn();
    ConfigAPI.removeConfig = vi.fn();
    ConfigAPI.getToken = vi.fn().mockReturnValue('token');
    ConfigAPI.setToken = vi.fn();
    ConfigAPI.removeToken = vi.fn();

    EventBus.emit = vi.fn().mockResolvedValue();
    EventBus.registerSchemas = vi.fn().mockResolvedValue();
  });

  describe('STORES constant', () => {
    it('should export STORES with all expected stores', () => {
      expect(STORES.STREAMS).toBe('streams');
      expect(STORES.CHUNKS).toBe('chunks');
      expect(STORES.PERSONALITY).toBe('personality');
      expect(STORES.SETTINGS).toBe('settings');
      expect(STORES.CHAT_SESSIONS).toBe('chat_sessions');
      expect(STORES.CONFIG).toBe('config');
      expect(STORES.TOKENS).toBe('tokens');
    });
  });

  describe('Storage methods exist', () => {
    it('should have init method', () => {
      expect(typeof Storage.init).toBe('function');
    });

    it('should have getStreams method', () => {
      expect(typeof Storage.getStreams).toBe('function');
    });

    it('should have saveStreams method', () => {
      expect(typeof Storage.saveStreams).toBe('function');
    });

    it('should have appendStreams method', () => {
      expect(typeof Storage.appendStreams).toBe('function');
    });

    it('should have clearStreams method', () => {
      expect(typeof Storage.clearStreams).toBe('function');
    });

    it('should have getChunks method', () => {
      expect(typeof Storage.getChunks).toBe('function');
    });

    it('should have saveChunks method', () => {
      expect(typeof Storage.saveChunks).toBe('function');
    });

    it('should have getPersonality method', () => {
      expect(typeof Storage.getPersonality).toBe('function');
    });

    it('should have savePersonality method', () => {
      expect(typeof Storage.savePersonality).toBe('function');
    });

    it('should have getSession method', () => {
      expect(typeof Storage.getSession).toBe('function');
    });

    it('should have saveSession method', () => {
      expect(typeof Storage.saveSession).toBe('function');
    });

    it('should has getAllSessions method', () => {
      expect(typeof Storage.getAllSessions).toBe('function');
    });

    it('should have deleteSession method', () => {
      expect(typeof Storage.deleteSession).toBe('function');
    });
  });

  describe('Storage basic operations', () => {
    it('should initialize successfully', async () => {
      await Storage.init();
      expect(IndexedDBCore.initDatabaseWithRetry).toHaveBeenCalled();
    });

    it('should get streams', async () => {
      IndexedDBCore.get.mockResolvedValueOnce({
        id: 'all',
        data: [{ id: '1' }]
      });

      const result = await Storage.getStreams();
      expect(result).toEqual([{ id: '1' }]);
    });

    it('should return null when no streams exist', async () => {
      IndexedDBCore.get.mockResolvedValueOnce(null);

      const result = await Storage.getStreams();
      expect(result).toBeNull();
    });

    it('should save streams', async () => {
      const streams = [{ id: '1' }];
      await Storage.saveStreams(streams);

      expect(IndexedDBCore.put).toHaveBeenCalledWith(
        'streams',
        expect.objectContaining({
          id: 'all',
          data: streams
        })
      );
    });
  });

  describe('Storage utility methods', () => {
    it('should check if ready', () => {
      expect(Storage.isReady()).toBe(true);
    });

    it('should check if initialized', () => {
      IndexedDBCore.getConnection.mockReturnValueOnce({ db: 'open' });
      expect(Storage.isInitialized()).toBe(true);
    });

    it('should return false when not initialized', () => {
      IndexedDBCore.getConnection.mockReturnValueOnce(null);
      expect(Storage.isInitialized()).toBe(false);
    });
  });

  describe('Config operations', () => {
    it('should delegate getConfig', () => {
      ConfigAPI.getConfig.mockReturnValue('test-value');

      const result = Storage.getConfig('key', 'default');
      expect(result).toBe('test-value');
      expect(ConfigAPI.getConfig).toHaveBeenCalledWith('key', 'default');
    });

    it('should delegate setConfig', () => {
      Storage.setConfig('key', 'value');
      expect(ConfigAPI.setConfig).toHaveBeenCalledWith('key', 'value');
    });
  });

  describe('Token operations', () => {
    it('should delegate getToken', () => {
      ConfigAPI.getToken.mockReturnValue('token-value');

      const result = Storage.getToken('key');
      expect(result).toBe('token-value');
    });

    it('should delegate setToken', () => {
      Storage.setToken('key', 'value');
      expect(ConfigAPI.setToken).toHaveBeenCalledWith('key', 'value');
    });
  });
});
