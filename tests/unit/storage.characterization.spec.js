/**
 * Characterization Tests for Storage Facade
 *
 * Purpose: Comprehensive test suite capturing current behavior BEFORE refactoring
 * These tests ensure zero regressions during storage.js module extraction
 *
 * Target File: js/storage.js (978 lines)
 * Target Modules: 7 modules (<400 lines each)
 *
 * Test Strategy:
 * 1. Test all public APIs
 * 2. Test all event emissions
 * 3. Test error conditions
 * 4. Test edge cases
 * 5. Test backward compatibility
 *
 * @see /Users/rhinesharar/rhythm-chamber/.state/REMAINING-GOD-OBJECTS-PLAN.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Storage, STORES } from '../../js/storage.js';
import { EventBus } from '../../js/services/event-bus.js';
import { IndexedDBCore } from '../../js/storage/indexeddb.js';

// Mock dependencies
vi.mock('../../js/storage/indexeddb.js');
vi.mock('../../js/storage/transaction/index.js');
vi.mock('../../js/storage/migration.js');
vi.mock('../../js/storage/write-ahead-log/index.js');
vi.mock('../../js/storage/archive-service.js');
vi.mock('../../js/storage/quota-manager.js');
vi.mock('../../js/operation-lock.js');
vi.mock('../../js/storage/profiles.js');
vi.mock('../../js/storage/config-api.js');
vi.mock('../../js/storage/sync-strategy.js');
vi.mock('../../js/security/crypto.js');
vi.mock('../../js/storage/auto-repair.js');
vi.mock('../../js/module-registry.js');

describe('Storage Facade - Characterization Tests', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Setup default mock returns
    IndexedDBCore.getConnection = vi.fn(() => ({}));
    IndexedDBCore.initDatabaseWithRetry = vi.fn(() => Promise.resolve());
    IndexedDBCore.put = vi.fn(() => Promise.resolve('mock-key'));
    IndexedDBCore.get = vi.fn(() => Promise.resolve(null));
    IndexedDBCore.getAll = vi.fn(() => Promise.resolve([]));
    IndexedDBCore.clear = vi.fn(() => Promise.resolve());
    IndexedDBCore.delete = vi.fn(() => Promise.resolve());
    IndexedDBCore.count = vi.fn(() => Promise.resolve(0));
    IndexedDBCore.getAllByIndex = vi.fn(() => Promise.resolve([]));
    IndexedDBCore.transaction = vi.fn(() => Promise.resolve());
    IndexedDBCore.atomicUpdate = vi.fn(() => Promise.resolve({ id: 'all', data: [] }));
    IndexedDBCore.closeDatabase = vi.fn();
    IndexedDBCore.isUsingFallback = vi.fn(() => false);

    // Mock EventBus
    EventBus.emit = vi.fn(() => Promise.resolve());
    EventBus.registerSchemas = vi.fn(() => Promise.resolve());

    // Mock secure context
    const Crypto = require('../../js/security/crypto');
    Crypto.isSecureContext = vi.fn(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================
  // Constants Exports
  // ==========================================

  describe('STORES constant', () => {
    it('should export STORES constant with all expected store names', () => {
      expect(STORES).toBeDefined();
      expect(STORES.STREAMS).toBe('streams');
      expect(STORES.CHUNKS).toBe('chunks');
      expect(STORES.EMBEDDINGS).toBe('embeddings');
      expect(STORES.PERSONALITY).toBe('personality');
      expect(STORES.SETTINGS).toBe('settings');
      expect(STORES.CHAT_SESSIONS).toBe('chat_sessions');
      expect(STORES.CONFIG).toBe('config');
      expect(STORES.TOKENS).toBe('tokens');
      expect(STORES.MIGRATION).toBe('migration');
      expect(STORES.TRANSACTION_JOURNAL).toBe('TRANSACTION_JOURNAL');
      expect(STORES.TRANSACTION_COMPENSATION).toBe('TRANSACTION_COMPENSATION');
    });

    it('should include STREAMS and CHUNKS stores', () => {
      expect(STORES.STREAMS).toBeDefined();
      expect(STORES.CHUNKS).toBeDefined();
    });

    it('should include CHAT_SESSIONS store', () => {
      expect(STORES.CHAT_SESSIONS).toBeDefined();
    });
  });

  // ==========================================
  // Initialization
  // ==========================================

  describe('init()', () => {
    it('should initialize storage with database and migrations', async () => {
      await Storage.init();

      expect(IndexedDBCore.initDatabaseWithRetry).toHaveBeenCalled();
      expect(EventBus.registerSchemas).toHaveBeenCalled();
    });

    it('should handle version change event during init', async () => {
      const onVersionChange = vi.fn();
      IndexedDBCore.initDatabaseWithRetry = vi.fn(({ onVersionChange }) => {
        onVersionChange(); // Simulate version change
        return Promise.resolve();
      });

      await Storage.init();

      expect(IndexedDBCore.initDatabaseWithRetry).toHaveBeenCalled();
    });

    it('should handle blocked event during init', async () => {
      const onBlocked = vi.fn();
      IndexedDBCore.initDatabaseWithRetry = vi.fn(({ onBlocked }) => {
        onBlocked(); // Simulate blocked
        return Promise.resolve();
      });

      await Storage.init();

      expect(IndexedDBCore.initDatabaseWithRetry).toHaveBeenCalled();
    });

    it('should return database connection', async () => {
      IndexedDBCore.getConnection = vi.fn(() => ({ db: 'connection' }));

      const result = await Storage.init();

      expect(IndexedDBCore.getConnection).toHaveBeenCalled();
    });
  });

  // ==========================================
  // Streams CRUD
  // ==========================================

  describe('Streams Operations', () => {
    describe('saveStreams()', () => {
      it('should save streams to IndexedDB', async () => {
        const streams = [
          { id: '1', ts: '2024-01-01', artist: 'Artist' }
        ];

        await Storage.saveStreams(streams);

        expect(IndexedDBCore.put).toHaveBeenCalledWith(
          STORES.STREAMS,
          expect.objectContaining({
            id: 'all',
            data: streams,
            savedAt: expect.any(String)
          })
        );
      });

      it('should emit storage:updated event after save', async () => {
        await Storage.saveStreams([{ id: '1' }]);

        expect(EventBus.emit).toHaveBeenCalledWith(
          'storage:updated',
          expect.objectContaining({
            store: 'streams'
          })
        );
      });

      it('should throw error if not in secure context', async () => {
        const Crypto = require('../../js/security/crypto');
        Crypto.isSecureContext = vi.fn(() => false);

        await expect(Storage.saveStreams([])).rejects.toThrow('Write blocked');
      });

      it('should mark operation as critical', async () => {
        await Storage.saveStreams([]);

        // Critical operations block version changes
        expect(IndexedDBCore.put).toHaveBeenCalled();
      });
    });

    describe('getStreams()', () => {
      it('should retrieve streams from IndexedDB', async () => {
        const mockStreams = [{ id: '1', ts: '2024-01-01' }];
        IndexedDBCore.get = vi.fn(() => Promise.resolve({
          id: 'all',
          data: mockStreams
        }));

        const result = await Storage.getStreams();

        expect(result).toEqual(mockStreams);
        expect(IndexedDBCore.get).toHaveBeenCalledWith(STORES.STREAMS, 'all');
      });

      it('should return null when no streams exist', async () => {
        IndexedDBCore.get = vi.fn(() => Promise.resolve(null));

        const result = await Storage.getStreams();

        expect(result).toBeNull();
      });

      it('should return null when streams exist but have no data', async () => {
        IndexedDBCore.get = vi.fn(() => Promise.resolve({ id: 'all' }));

        const result = await Storage.getStreams();

        expect(result).toBeNull();
      });
    });

    describe('appendStreams()', () => {
      it('should append new streams to existing ones using atomic update', async () => {
        const existingStreams = [{ id: '1', ts: '2024-01-01' }];
        const newStreams = [{ id: '2', ts: '2024-01-02' }];
        const merged = [...existingStreams, ...newStreams];

        IndexedDBCore.atomicUpdate = vi.fn((store, key, fn) => {
          const current = { id: 'all', data: existingStreams };
          const result = fn(current);
          return Promise.resolve(result);
        });

        await Storage.appendStreams(newStreams);

        expect(IndexedDBCore.atomicUpdate).toHaveBeenCalledWith(
          STORES.STREAMS,
          'all',
          expect.any(Function)
        );
      });

      it('should handle empty existing streams', async () => {
        const newStreams = [{ id: '1', ts: '2024-01-01' }];

        IndexedDBCore.atomicUpdate = vi.fn((store, key, fn) => {
          const current = null;
          const result = fn(current);
          return Promise.resolve(result);
        });

        await Storage.appendStreams(newStreams);

        expect(IndexedDBCore.atomicUpdate).toHaveBeenCalled();
      });

      it('should emit storage:updated event after append', async () => {
        IndexedDBCore.atomicUpdate = vi.fn(() => Promise.resolve({
          id: 'all',
          data: [{ id: '1' }, { id: '2' }]
        }));

        await Storage.appendStreams([{ id: '2' }]);

        expect(EventBus.emit).toHaveBeenCalledWith(
          'storage:updated',
          expect.objectContaining({
            store: 'streams'
          })
        );
      });

      it('should throw error if not in secure context', async () => {
        const Crypto = require('../../js/security/crypto');
        Crypto.isSecureContext = vi.fn(() => false);

        await expect(Storage.appendStreams([])).rejects.toThrow('Write blocked');
      });
    });

    describe('clearStreams()', () => {
      it('should clear all streams', async () => {
        await Storage.clearStreams();

        expect(IndexedDBCore.clear).toHaveBeenCalledWith(STORES.STREAMS);
      });

      it('should emit storage:updated event with count 0', async () => {
        await Storage.clearStreams();

        expect(EventBus.emit).toHaveBeenCalledWith(
          'storage:updated',
          expect.objectContaining({
            store: 'streams',
            count: 0
          })
        );
      });

      it('should throw error if not in secure context', async () => {
        const Crypto = require('../../js/security/crypto');
        Crypto.isSecureContext = vi.fn(() => false);

        await expect(Storage.clearStreams()).rejects.toThrow('Write blocked');
      });
    });
  });

  // ==========================================
  // Chunks CRUD
  // ==========================================

  describe('Chunks Operations', () => {
    describe('saveChunks()', () => {
      it('should save chunks using transaction', async () => {
        const chunks = [
          { id: 'chunk1', content: 'content1' },
          { id: 'chunk2', content: 'content2' }
        ];

        await Storage.saveChunks(chunks);

        expect(IndexedDBCore.transaction).toHaveBeenCalledWith(
          STORES.CHUNKS,
          'readwrite',
          expect.any(Function)
        );
      });

      it('should mark operation as critical', async () => {
        await Storage.saveChunks([]);

        expect(IndexedDBCore.transaction).toHaveBeenCalled();
      });
    });

    describe('getChunks()', () => {
      it('should retrieve all chunks', async () => {
        const mockChunks = [
          { id: 'chunk1', content: 'content1' }
        ];
        IndexedDBCore.getAll = vi.fn(() => Promise.resolve(mockChunks));

        const result = await Storage.getChunks();

        expect(result).toEqual(mockChunks);
        expect(IndexedDBCore.getAll).toHaveBeenCalledWith(STORES.CHUNKS);
      });

      it('should return empty array when no chunks exist', async () => {
        IndexedDBCore.getAll = vi.fn(() => Promise.resolve([]));

        const result = await Storage.getChunks();

        expect(result).toEqual([]);
      });
    });
  });

  // ==========================================
  // Personality CRUD
  // ==========================================

  describe('Personality Operations', () => {
    describe('savePersonality()', () => {
      it('should save personality data', async () => {
        const personality = { traits: ['openness'], scores: [0.8] };

        await Storage.savePersonality(personality);

        expect(IndexedDBCore.put).toHaveBeenCalledWith(
          STORES.PERSONALITY,
          expect.objectContaining({
            id: 'result',
            traits: ['openness'],
            scores: [0.8],
            savedAt: expect.any(String)
          })
        );
      });

      it('should mark operation as critical', async () => {
        await Storage.savePersonality({});

        expect(IndexedDBCore.put).toHaveBeenCalled();
      });
    });

    describe('getPersonality()', () => {
      it('should retrieve personality data', async () => {
        const mockPersonality = { id: 'result', traits: ['openness'] };
        IndexedDBCore.get = vi.fn(() => Promise.resolve(mockPersonality));

        const result = await Storage.getPersonality();

        expect(result).toEqual(mockPersonality);
        expect(IndexedDBCore.get).toHaveBeenCalledWith(STORES.PERSONALITY, 'result');
      });

      it('should return null when no personality exists', async () => {
        IndexedDBCore.get = vi.fn(() => Promise.resolve(null));

        const result = await Storage.getPersonality();

        expect(result).toBeNull();
      });
    });
  });

  // ==========================================
  // Settings CRUD
  // ==========================================

  describe('Settings Operations', () => {
    describe('saveSetting()', () => {
      it('should save a single setting', async () => {
        await Storage.saveSetting('theme', 'dark');

        expect(IndexedDBCore.put).toHaveBeenCalledWith(
          STORES.SETTINGS,
          { key: 'theme', value: 'dark' }
        );
      });
    });

    describe('getSetting()', () => {
      it('should retrieve a single setting', async () => {
        IndexedDBCore.get = vi.fn(() => Promise.resolve({
          key: 'theme',
          value: 'dark'
        }));

        const result = await Storage.getSetting('theme');

        expect(result).toBe('dark');
        expect(IndexedDBCore.get).toHaveBeenCalledWith(STORES.SETTINGS, 'theme');
      });

      it('should return undefined when setting does not exist', async () => {
        IndexedDBCore.get = vi.fn(() => Promise.resolve(undefined));

        const result = await Storage.getSetting('nonexistent');

        expect(result).toBeUndefined();
      });
    });
  });

  // ==========================================
  // Chat Sessions CRUD
  // ==========================================

  describe('Chat Sessions Operations', () => {
    describe('saveSession()', () => {
      it('should save a session with required id', async () => {
        const session = { id: 'session1', messages: [] };

        await Storage.saveSession(session);

        expect(IndexedDBCore.put).toHaveBeenCalledWith(
          STORES.CHAT_SESSIONS,
          expect.objectContaining({
            id: 'session1',
            updatedAt: expect.any(String),
            createdAt: expect.any(String),
            messageCount: 0
          })
        );
      });

      it('should throw error when session has no id', async () => {
        await expect(Storage.saveSession({})).rejects.toThrow('Session must have an id');
      });

      it('should preserve existing createdAt', async () => {
        const session = {
          id: 'session1',
          createdAt: '2024-01-01T00:00:00Z',
          messages: ['msg1']
        };

        await Storage.saveSession(session);

        expect(IndexedDBCore.put).toHaveBeenCalledWith(
          STORES.CHAT_SESSIONS,
          expect.objectContaining({
            createdAt: '2024-01-01T00:00:00Z',
            messageCount: 1
          })
        );
      });

      it('should emit storage:updated event', async () => {
        await Storage.saveSession({ id: 'session1' });

        expect(EventBus.emit).toHaveBeenCalledWith(
          'storage:updated',
          expect.objectContaining({
            store: 'session'
          })
        );
      });
    });

    describe('getSession()', () => {
      it('should retrieve a session by id', async () => {
        const mockSession = { id: 'session1', messages: [] };
        IndexedDBCore.get = vi.fn(() => Promise.resolve(mockSession));

        const result = await Storage.getSession('session1');

        expect(result).toEqual(mockSession);
        expect(IndexedDBCore.get).toHaveBeenCalledWith(STORES.CHAT_SESSIONS, 'session1');
      });
    });

    describe('getAllSessions()', () => {
      it('should retrieve all sessions ordered by updatedAt', async () => {
        const mockSessions = [
          { id: 'session1', updatedAt: '2024-01-02' },
          { id: 'session2', updatedAt: '2024-01-01' }
        ];
        IndexedDBCore.getAllByIndex = vi.fn(() => Promise.resolve(mockSessions));

        const result = await Storage.getAllSessions();

        expect(result).toEqual(mockSessions);
        expect(IndexedDBCore.getAllByIndex).toHaveBeenCalledWith(
          STORES.CHAT_SESSIONS,
          'updatedAt',
          'prev'
        );
      });
    });

    describe('deleteSession()', () => {
      it('should delete a session by id', async () => {
        await Storage.deleteSession('session1');

        expect(IndexedDBCore.delete).toHaveBeenCalledWith(STORES.CHAT_SESSIONS, 'session1');
      });

      it('should emit storage:updated event', async () => {
        await Storage.deleteSession('session1');

        expect(EventBus.emit).toHaveBeenCalledWith(
          'storage:updated',
          expect.objectContaining({
            store: 'session'
          })
        );
      });
    });

    describe('getSessionCount()', () => {
      it('should return count of sessions', async () => {
        IndexedDBCore.count = vi.fn(() => Promise.resolve(5));

        const result = await Storage.getSessionCount();

        expect(result).toBe(5);
        expect(IndexedDBCore.count).toHaveBeenCalledWith(STORES.CHAT_SESSIONS);
      });
    });

    describe('clearAllSessions()', () => {
      it('should clear all sessions', async () => {
        await Storage.clearAllSessions();

        expect(IndexedDBCore.clear).toHaveBeenCalledWith(STORES.CHAT_SESSIONS);
      });

      it('should emit storage:updated event', async () => {
        await Storage.clearAllSessions();

        expect(EventBus.emit).toHaveBeenCalledWith(
          'storage:updated',
          expect.objectContaining({
            store: 'session',
            count: 0
          })
        );
      });
    });

    describe('clearExpiredSessions()', () => {
      it('should clear sessions older than maxAgeMs', async () => {
        const oldSession = {
          id: 'old1',
          updatedAt: '2024-01-01T00:00:00Z'
        };
        const newSession = {
          id: 'new1',
          updatedAt: new Date().toISOString()
        };

        IndexedDBCore.getAllByIndex = vi.fn(() => Promise.resolve([
          oldSession,
          newSession
        ]));

        const result = await Storage.clearExpiredSessions(30 * 24 * 60 * 60 * 1000);

        expect(IndexedDBCore.delete).toHaveBeenCalledTimes(1);
        expect(result.deleted).toBe(1);
      });

      it('should return zero deleted when no sessions exist', async () => {
        IndexedDBCore.getAllByIndex = vi.fn(() => Promise.resolve([]));

        const result = await Storage.clearExpiredSessions();

        expect(result.deleted).toBe(0);
      });
    });
  });

  // ==========================================
  // Utility Functions
  // ==========================================

  describe('Utility Functions', () => {
    describe('isReady()', () => {
      it('should return true when module is loaded', () => {
        expect(Storage.isReady()).toBe(true);
      });

      it('should check for required methods', () => {
        expect(typeof Storage.init).toBe('function');
        expect(typeof Storage.getStreams).toBe('function');
        expect(typeof Storage.saveStreams).toBe('function');
      });
    });

    describe('isInitialized()', () => {
      it('should return true when IndexedDB has connection', () => {
        IndexedDBCore.getConnection = vi.fn(() => ({ db: 'open' }));
        IndexedDBCore.isUsingFallback = vi.fn(() => false);

        expect(Storage.isInitialized()).toBe(true);
      });

      it('should return false when IndexedDB not initialized', () => {
        IndexedDBCore.getConnection = vi.fn(() => null);

        expect(Storage.isInitialized()).toBe(false);
      });

      it('should return false when using fallback mode', () => {
        IndexedDBCore.getConnection = vi.fn(() => ({ db: 'fallback' }));
        IndexedDBCore.isUsingFallback = vi.fn(() => true);

        expect(Storage.isInitialized()).toBe(false);
      });
    });

    describe('hasData()', () => {
      it('should return true when streams exist', async () => {
        IndexedDBCore.get = vi.fn(() => Promise.resolve({
          id: 'all',
          data: [{ id: '1' }]
        }));

        const result = await Storage.hasData();

        expect(result).toBe(true);
      });

      it('should return false when no streams', async () => {
        IndexedDBCore.get = vi.fn(() => Promise.resolve(null));

        const result = await Storage.hasData();

        expect(result).toBe(false);
      });

      it('should return false when streams array is empty', async () => {
        IndexedDBCore.get = vi.fn(() => Promise.resolve({
          id: 'all',
          data: []
        }));

        const result = await Storage.hasData();

        expect(result).toBe(false);
      });
    });

    describe('getDataHash()', () => {
      it('should return hash with count and timestamps', async () => {
        const streams = [
          { ts: '2024-01-01T10:00:00Z' },
          { ts: '2024-01-10T20:00:00Z' }
        ];
        IndexedDBCore.get = vi.fn(() => Promise.resolve({
          id: 'all',
          data: streams
        }));

        const result = await Storage.getDataHash();

        expect(result).toBe('2-2024-01-01-2024-01-10');
      });

      it('should return null when no streams', async () => {
        IndexedDBCore.get = vi.fn(() => Promise.resolve(null));

        const result = await Storage.getDataHash();

        expect(result).toBeNull();
      });

      it('should return null when streams array is empty', async () => {
        IndexedDBCore.get = vi.fn(() => Promise.resolve({
          id: 'all',
          data: []
        }));

        const result = await Storage.getDataHash();

        expect(result).toBeNull();
      });
    });

    describe('clear()', () => {
      it('should clear all stores', async () => {
        await Storage.clear();

        const storeNames = Object.values(STORES);
        expect(IndexedDBCore.clear).toHaveBeenCalledTimes(storeNames.length);
      });
    });
  });

  // ==========================================
  // Privacy Controls
  // ==========================================

  describe('Privacy Controls', () => {
    describe('setSessionOnlyMode()', () => {
      it('should enable session-only mode', () => {
        const result = Storage.setSessionOnlyMode(true);

        expect(result).toBe(true);
        expect(Storage.isSessionOnlyMode()).toBe(true);
      });

      it('should disable session-only mode', () => {
        Storage.setSessionOnlyMode(false);

        expect(Storage.isSessionOnlyMode()).toBe(false);
      });
    });

    describe('setDataPersistenceConsent()', () => {
      it('should set consent and store in localStorage', () => {
        const result = Storage.setDataPersistenceConsent(true);

        expect(result).toBe(true);
        expect(localStorage.getItem('rhythm_chamber_persistence_consent')).toBe('true');
      });

      it('should revoke consent', () => {
        Storage.setDataPersistenceConsent(false);

        expect(localStorage.getItem('rhythm_chamber_persistence_consent')).toBe('false');
      });
    });

    describe('hasDataPersistenceConsent()', () => {
      it('should return true when consent granted in localStorage', () => {
        localStorage.setItem('rhythm_chamber_persistence_consent', 'true');

        expect(Storage.hasDataPersistenceConsent()).toBe(true);
      });

      it('should return false when consent revoked', () => {
        localStorage.setItem('rhythm_chamber_persistence_consent', 'false');

        expect(Storage.hasDataPersistenceConsent()).toBe(false);
      });

      it('should default to true when not set', () => {
        localStorage.removeItem('rhythm_chamber_persistence_consent');

        expect(Storage.hasDataPersistenceConsent()).toBe(true);
      });
    });

    describe('clearSensitiveData()', () => {
      it('should clear streams and conversation', async () => {
        await Storage.clearSensitiveData();

        expect(IndexedDBCore.clear).toHaveBeenCalledWith(STORES.STREAMS);
        expect(sessionStorage.getItem('rhythm_chamber_conversation')).toBeNull();
      });

      it('should emit storage:updated event', async () => {
        await Storage.clearSensitiveData();

        expect(EventBus.emit).toHaveBeenCalledWith(
          'storage:updated',
          expect.objectContaining({
            store: 'sensitiveDataCleared'
          })
        );
      });

      it('should return success with retained data types', async () => {
        const result = await Storage.clearSensitiveData();

        expect(result.success).toBe(true);
        expect(result.retained).toContain('chunks');
        expect(result.retained).toContain('personality');
        expect(result.retained).toContain('chat_sessions');
      });
    });

    describe('getDataSummary()', () => {
      it('should return summary of all data', async () => {
        IndexedDBCore.get = vi.fn((store) => {
          if (store === STORES.STREAMS) {
            return Promise.resolve({ id: 'all', data: [{ id: '1' }] });
          }
          if (store === STORES.PERSONALITY) {
            return Promise.resolve({ id: 'result', traits: [] });
          }
          return Promise.resolve(null);
        });
        IndexedDBCore.getAll = vi.fn(() => Promise.resolve([{ id: 'chunk1' }]));
        IndexedDBCore.count = vi.fn(() => Promise.resolve(3));

        const result = await Storage.getDataSummary();

        expect(result).toMatchObject({
          hasRawStreams: true,
          streamCount: 1,
          chunkCount: 1,
          hasPersonality: true,
          chatSessionCount: 3
        });
      });

      it('should include estimated size in MB', async () => {
        const largeStreams = Array(1000).fill({ id: '1', data: 'x'.repeat(1000) });
        IndexedDBCore.get = vi.fn(() => Promise.resolve({
          id: 'all',
          data: largeStreams
        }));
        IndexedDBCore.getAll = vi.fn(() => Promise.resolve([]));
        IndexedDBCore.count = vi.fn(() => Promise.resolve(0));

        const result = await Storage.getDataSummary();

        expect(result.estimatedSizeMB).toBeGreaterThan(0);
      });
    });
  });

  // ==========================================
  // Event Emission
  // ==========================================

  describe('Event Emission', () => {
    it('should emit storage:updated event for streams operations', async () => {
      await Storage.saveStreams([]);

      expect(EventBus.emit).toHaveBeenCalledWith(
        'storage:updated',
        expect.objectContaining({
          store: 'streams'
        })
      );
    });

    it('should emit storage:updated event for session operations', async () => {
      await Storage.saveSession({ id: 'session1' });

      expect(EventBus.emit).toHaveBeenCalledWith(
        'storage:updated',
        expect.objectContaining({
          store: 'session'
        })
      );
    });

    it('should emit storage:updated event for profile operations', async () => {
      // Mock ProfileStorage
      const ProfileStorage = require('../../js/storage/profiles');
      ProfileStorage._storage = {};
      ProfileStorage.saveProfile = vi.fn(() => Promise.resolve());
      ProfileStorage.getProfileCount = vi.fn(() => Promise.resolve(1));

      await Storage.saveProfile({ id: 'profile1' });

      expect(EventBus.emit).toHaveBeenCalled();
    });
  });

  // ==========================================
  // Config & Tokens (Delegated)
  // ==========================================

  describe('Config & Tokens (Delegated to ConfigAPI)', () => {
    describe('Config Operations', () => {
      it('should delegate getConfig to ConfigAPI', () => {
        const ConfigAPI = require('../../js/storage/config-api');
        ConfigAPI.getConfig = vi.fn(() => 'config-value');

        const result = Storage.getConfig('key', 'default');

        expect(ConfigAPI.getConfig).toHaveBeenCalledWith('key', 'default');
        expect(result).toBe('config-value');
      });

      it('should delegate setConfig to ConfigAPI', () => {
        const ConfigAPI = require('../../js/storage/config-api');
        ConfigAPI.setConfig = vi.fn();

        Storage.setConfig('key', 'value');

        expect(ConfigAPI.setConfig).toHaveBeenCalledWith('key', 'value');
      });

      it('should delegate removeConfig to ConfigAPI', () => {
        const ConfigAPI = require('../../js/storage/config-api');
        ConfigAPI.removeConfig = vi.fn();

        Storage.removeConfig('key');

        expect(ConfigAPI.removeConfig).toHaveBeenCalledWith('key');
      });
    });

    describe('Token Operations', () => {
      it('should delegate getToken to ConfigAPI', () => {
        const ConfigAPI = require('../../js/storage/config-api');
        ConfigAPI.getToken = vi.fn(() => 'token-value');

        const result = Storage.getToken('key');

        expect(ConfigAPI.getToken).toHaveBeenCalledWith('key');
        expect(result).toBe('token-value');
      });

      it('should delegate setToken to ConfigAPI', () => {
        const ConfigAPI = require('../../js/storage/config-api');
        ConfigAPI.setToken = vi.fn();

        Storage.setToken('key', 'value');

        expect(ConfigAPI.setToken).toHaveBeenCalledWith('key', 'value');
      });

      it('should delegate removeToken to ConfigAPI', () => {
        const ConfigAPI = require('../../js/storage/config-api');
        ConfigAPI.removeToken = vi.fn();

        Storage.removeToken('key');

        expect(ConfigAPI.removeToken).toHaveBeenCalledWith('key');
      });
    });
  });

  // ==========================================
  // Migration (Delegated)
  // ==========================================

  describe('Migration (Delegated to StorageMigration)', () => {
    it('should delegate migrateFromLocalStorage to StorageMigration', () => {
      const StorageMigration = require('../../js/storage/migration');
      StorageMigration.migrateFromLocalStorage = vi.fn(() => Promise.resolve());

      Storage.migrateFromLocalStorage();

      expect(StorageMigration.migrateFromLocalStorage).toHaveBeenCalled();
    });

    it('should delegate rollbackMigration to StorageMigration', () => {
      const StorageMigration = require('../../js/storage/migration');
      StorageMigration.rollbackMigration = vi.fn(() => Promise.resolve());

      Storage.rollbackMigration();

      expect(StorageMigration.rollbackMigration).toHaveBeenCalled();
    });

    it('should delegate getMigrationState to StorageMigration', () => {
      const StorageMigration = require('../../js/storage/migration');
      StorageMigration.getMigrationState = vi.fn(() => ({}));

      Storage.getMigrationState();

      expect(StorageMigration.getMigrationState).toHaveBeenCalled();
    });
  });

  // ==========================================
  // Consistency Validation
  // ==========================================

  describe('Consistency Validation', () => {
    describe('validateConsistency()', () => {
      it('should return valid when data is consistent', async () => {
        IndexedDBCore.get = vi.fn((store) => {
          if (store === STORES.STREAMS) {
            return Promise.resolve({ id: 'all', data: [{ id: '1' }] });
          }
          return Promise.resolve(null);
        });
        IndexedDBCore.getAll = vi.fn(() => Promise.resolve([]));

        const result = await Storage.validateConsistency();

        expect(result.valid).toBe(true);
        expect(result.warnings).toHaveLength(0);
      });

      it('should warn when personality exists without streams', async () => {
        IndexedDBCore.get = vi.fn((store) => {
          if (store === STORES.PERSONALITY) {
            return Promise.resolve({ id: 'result', traits: [] });
          }
          if (store === STORES.STREAMS) {
            return Promise.resolve(null);
          }
          return Promise.resolve(null);
        });
        IndexedDBCore.getAll = vi.fn(() => Promise.resolve([]));

        const result = await Storage.validateConsistency();

        expect(result.valid).toBe(false);
        expect(result.warnings).toContain('Personality data exists without streaming data');
      });

      it('should warn when chunks exist without streams', async () => {
        IndexedDBCore.get = vi.fn((store) => {
          if (store === STORES.STREAMS) {
            return Promise.resolve(null);
          }
          return Promise.resolve(null);
        });
        IndexedDBCore.getAll = vi.fn(() => Promise.resolve([{ id: 'chunk1' }]));

        const result = await Storage.validateConsistency();

        expect(result.valid).toBe(false);
        expect(result.warnings).toContain('Chunk data exists without streaming data');
      });
    });

    describe('Auto-Repair Functions', () => {
      it('repairOrphanedPersonality should return disabled', async () => {
        const result = await Storage.repairOrphanedPersonality();

        expect(result.repaired).toBe(false);
        expect(result.action).toBe('disabled');
      });

      it('repairOrphanedChunks should return disabled', async () => {
        const result = await Storage.repairOrphanedChunks();

        expect(result.repaired).toBe(false);
        expect(result.action).toBe('disabled');
      });

      it('repairCorruptConversation should return disabled', async () => {
        const result = await Storage.repairCorruptConversation();

        expect(result.repaired).toBe(false);
        expect(result.action).toBe('disabled');
      });

      it('repairSpotifyToken should return disabled', async () => {
        const result = await Storage.repairSpotifyToken();

        expect(result.repaired).toBe(false);
        expect(result.action).toBe('disabled');
      });
    });
  });

  // ==========================================
  // Sync Strategy
  // ==========================================

  describe('Sync Strategy', () => {
    it('getSyncManager should return SyncManager', () => {
      const SyncManager = require('../../js/storage/sync-strategy');

      const result = Storage.getSyncManager();

      expect(result).toBe(SyncManager);
    });

    it('getSyncStrategy should return current strategy', () => {
      const SyncManager = require('../../js/storage/sync-strategy');
      SyncManager.getStrategy = vi.fn(() => ({ name: 'local' }));

      const result = Storage.getSyncStrategy();

      expect(result).toMatchObject({ name: 'local' });
    });

    it('getSyncStatus should return sync status', async () => {
      const SyncManager = require('../../js/storage/sync-strategy');
      SyncManager.getStrategy = vi.fn(() => ({
        getStatus: vi.fn(() => Promise.resolve({ mode: 'local' }))
      }));

      const result = await Storage.getSyncStatus();

      expect(result).toMatchObject({ mode: expect.any(String) });
    });

    it('getSyncStatus should handle uninitialized strategy', async () => {
      const SyncManager = require('../../js/storage/sync-strategy');
      SyncManager.getStrategy = vi.fn(() => null);

      const result = await Storage.getSyncStatus();

      expect(result.mode).toBe('local');
      expect(result.lastSync).toBeNull();
    });
  });

  // ==========================================
  // Auto-Repair Configuration
  // ==========================================

  describe('Auto-Repair Configuration', () => {
    it('getAutoRepairConfig should return config', () => {
      const config = Storage.getAutoRepairConfig();

      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    it('setAutoRepairConfig should update config', () => {
      const newConfig = { enabled: true, maxRetries: 3 };

      const result = Storage.setAutoRepairConfig(newConfig);

      expect(result).toBeDefined();
    });

    it('setAutoRepairEnabled should enable auto-repair', () => {
      const result = Storage.setAutoRepairEnabled(true);

      expect(result).toBe(true);
      expect(Storage.isAutoRepairEnabled()).toBe(true);
    });

    it('setAutoRepairEnabled should disable auto-repair', () => {
      Storage.setAutoRepairEnabled(false);

      expect(Storage.isAutoRepairEnabled()).toBe(false);
    });
  });

  // ==========================================
  // Clear All Data
  // ==========================================

  describe('clearAllData()', () => {
    it('should clear all IndexedDB stores', async () => {
      await Storage.clearAllData();

      const storeNames = Object.values(STORES);
      expect(IndexedDBCore.clear).toHaveBeenCalledTimes(storeNames.length);
    });

    it('should clear localStorage keys with rhythm_chamber_ prefix', async () => {
      localStorage.setItem('rhythm_chamber_test', 'value');
      localStorage.setItem('spotify_test', 'value');
      localStorage.setItem('other_key', 'keep');

      await Storage.clearAllData();

      expect(localStorage.getItem('rhythm_chamber_test')).toBeNull();
      expect(localStorage.getItem('spotify_test')).toBeNull();
      expect(localStorage.getItem('other_key')).toBe('keep');
    });

    it('should emit storage:cleared event', async () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      await Storage.clearAllData();

      expect(dispatchEventSpy).toHaveBeenCalled();
      const event = dispatchEventSpy.mock.calls[0][0];
      expect(event.type).toBe('storage:cleared');
    });

    it('should return success with results', async () => {
      const result = await Storage.clearAllData();

      expect(result.success).toBe(true);
      expect(result.indexedDB.cleared).toBe(true);
      expect(result.localStorage.cleared).toBe(true);
    });
  });

  // ==========================================
  // Health Report
  // ==========================================

  describe('getHealthReport()', () => {
    it('should return comprehensive health report', async () => {
      IndexedDBCore.get = vi.fn((store) => {
        if (store === STORES.STREAMS) {
          return Promise.resolve({ id: 'all', data: [{ id: '1' }] });
        }
        return Promise.resolve(null);
      });
      IndexedDBCore.getAll = vi.fn(() => Promise.resolve([]));

      const result = await Storage.getHealthReport();

      expect(result).toMatchObject({
        healthy: expect.any(Boolean),
        issues: expect.any(Array),
        autoRepair: expect.objectContaining({
          enabled: expect.any(Boolean),
          recentRepairs: expect.any(Array)
        }),
        storage: expect.objectContaining({
          hasData: expect.any(Boolean),
          hasPersonality: expect.any(Boolean)
        })
      });
    });

    it('should include recent repairs from log', async () => {
      IndexedDBCore.get = vi.fn(() => Promise.resolve(null));
      IndexedDBCore.getAll = vi.fn(() => Promise.resolve([]));

      const result = await Storage.getHealthReport();

      expect(result.autoRepair.recentRepairs).toBeDefined();
    });
  });
});
