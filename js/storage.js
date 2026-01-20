/**
 * Storage Facade
 * 
 * Thin wrapper that exposes the unified Storage API by combining:
 * - storage/indexeddb.js - Core IndexedDB operations
 * - storage/config-api.js - Unified config/token storage  
 * - storage/migration.js - localStorage → IndexedDB migration
 * 
 * @module storage
 */

import { StorageTransaction } from './storage/transaction.js';
import { StorageMigration } from './storage/migration.js';
import { ModuleRegistry } from './module-registry.js';
import { EventBus } from './services/event-bus.js';
import { SafeMode } from './security/safe-mode.js';
import { WriteAheadLog, WalPriority } from './storage/write-ahead-log.js';
import { ArchiveService } from './storage/archive-service.js';
import { QuotaManager } from './storage/quota-manager.js';
import { IndexedDBCore } from './storage/indexeddb.js';
import { OperationLock } from './operation-lock.js';
import { ProfileStorage } from './storage/profiles.js';
import { ConfigAPI } from './storage/config-api.js';
import { SyncManager } from './storage/sync-strategy.js';

// ==========================================
// HNW Hierarchy: Safe Mode Enforcement
// ==========================================

/**
 * Check if writes are blocked by Safe Mode
 * @param {string} operation - Operation name for error message
 * @throws {Error} If Safe Mode is active and encryption is unavailable
 */
function assertWriteAllowed(operation) {
  // Only block if encryption is required but unavailable
  // This implements fail-closed behavior for security-sensitive operations
  if (!SafeMode.canEncrypt()) {
    const status = SafeMode.getSafeModeStatus();
    if (status.isSafeMode) {
      // Defensively handle failedModules to prevent errors if undefined or not an array
      const failedModules = Array.isArray(status.failedModules)
        ? status.failedModules.map(m => m?.name || 'unknown').join(', ')
        : 'unknown';

      throw new Error(
        `[Storage] Write blocked: Safe Mode active. ` +
        `Operation '${operation}' requires security capabilities. ` +
        `Failed modules: ${failedModules}`
      );
    }
  }
}

// ==========================================
// Privacy Controls
// ==========================================

let sessionOnlyMode = false;
let dataPersistenceConsent = true;

// Operation queue for critical operations
const storageQueue = [];
let isQueueProcessing = false;
let criticalOperationInProgress = false;
let pendingReload = false;

/**
 * Queue an async operation to run sequentially
 * @param {Function} fn - Async function to queue
 * @param {boolean} isCritical - Block version changes during critical ops
 * @returns {Promise<*>}
 */
async function queuedOperation(fn, isCritical = false) {
  return new Promise((resolve, reject) => {
    storageQueue.push({ fn, resolve, reject, isCritical });
    processQueue();
  });
}

async function processQueue() {
  if (isQueueProcessing || storageQueue.length === 0) return;
  isQueueProcessing = true;

  while (storageQueue.length > 0) {
    const { fn, resolve, reject, isCritical } = storageQueue.shift();
    if (isCritical) criticalOperationInProgress = true;

    try {
      const result = await fn();
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      if (isCritical) criticalOperationInProgress = false;
    }
  }

  isQueueProcessing = false;

  if (pendingReload && storageQueue.length === 0) {
    console.log('[Storage] Executing deferred reload');
    window.location.reload();
  }
}

// ==========================================
// Store Constants (for backward compatibility)
// ==========================================

const STORES = IndexedDBCore?.STORES || {
  STREAMS: 'streams',
  CHUNKS: 'chunks',
  EMBEDDINGS: 'embeddings',
  PERSONALITY: 'personality',
  SETTINGS: 'settings',
  CHAT_SESSIONS: 'chat_sessions',
  CONFIG: 'config',
  TOKENS: 'tokens',
  MIGRATION: 'migration'
};

// ==========================================
// Public API - Storage Facade
// ==========================================

const Storage = {
  STORES,

  /**
   * Initialize storage and run migrations
   */
  async init() {
    // Initialize IndexedDB
    await IndexedDBCore.initDatabase({
      onVersionChange: () => {
        if (criticalOperationInProgress) {
          console.warn('[Storage] Version change deferred - critical operation in progress');
          pendingReload = true;
        } else {
          console.log('[Storage] Database version change detected');
          IndexedDBCore.closeDatabase();
          window.location.reload();
        }
      },
      onBlocked: () => {
        console.warn('[Storage] Database upgrade blocked by other tabs');
      }
    });

    // Run migration
    await StorageMigration.migrateFromLocalStorage();

    // HNW Wave: Initialize Write-Ahead Log for Safe Mode
    await WriteAheadLog.init();

    // HNW Wave: Initialize QuotaManager and register cleanup handler
    await QuotaManager.init();
    QuotaManager.on('threshold_exceeded', async (usage) => {
      if (usage.percent > 90) {
        console.log(`[Storage] Quota threshold exceeded (${usage.percent.toFixed(1)}%), triggering auto-archive`);
        try {
          const result = await ArchiveService.archiveOldStreams();
          console.log(`[Storage] Auto-archive complete: ${result.archived} streams archived, saved ${(result.savedBytes / 1024 / 1024).toFixed(2)}MB`);
        } catch (error) {
          console.error('[Storage] Auto-archive failed:', error);
        }
      }
    });

    return IndexedDBCore.getConnection();
  },

  // ==========================================
  // Streams
  // ==========================================

  async saveStreams(streams) {
    assertWriteAllowed('saveStreams');
    return queuedOperation(async () => {
      const result = await IndexedDBCore.put(STORES.STREAMS, {
        id: 'all',
        data: streams,
        savedAt: new Date().toISOString()
      });
      this._notifyUpdate('streams', streams.length);
      return result;
    }, true);
  },

  async getStreams() {
    const result = await IndexedDBCore.get(STORES.STREAMS, 'all');
    return result?.data || null;
  },

  async appendStreams(newStreams) {
    assertWriteAllowed('appendStreams');
    return queuedOperation(async () => {
      // Use atomic update to prevent race conditions
      const result = await IndexedDBCore.atomicUpdate(
        STORES.STREAMS,
        'all',
        (currentValue) => {
          const existing = currentValue?.data || [];
          const merged = [...existing, ...newStreams];
          return {
            id: 'all',
            data: merged,
            savedAt: new Date().toISOString()
          };
        }
      );
      this._notifyUpdate('streams', result.data.length);
      return result;
    }, true);
  },

  async clearStreams() {
    assertWriteAllowed('clearStreams');
    return queuedOperation(async () => {
      await IndexedDBCore.clear(STORES.STREAMS);
      this._notifyUpdate('streams', 0);
    }, true);
  },

  // ==========================================
  // Stream Archival (Quota Management)
  // ==========================================

  /**
   * Archive streams older than cutoff date for quota management
   * Streams are moved to archive store for optional restoration (not deleted)
   * @param {Object} [options] - Archive options
   * @param {Date|number} [options.cutoffDate] - Archive before this date (default: 1 year ago)
   * @param {boolean} [options.dryRun=false] - Preview without archiving
   * @returns {Promise<{archived: number, kept: number, savedBytes: number}>}
   */
  async archiveOldStreams(options = {}) {
    assertWriteAllowed('archiveOldStreams');
    return ArchiveService.archiveOldStreams(options);
  },

  /**
   * Restore archived streams back to main storage
   * @param {Object} [options] - Restore options
   * @param {Date|number} [options.afterDate] - Only restore after this date
   * @param {boolean} [options.clearArchive=true] - Clear archive after
   * @returns {Promise<{restored: number, remaining: number}>}
   */
  async restoreFromArchive(options = {}) {
    assertWriteAllowed('restoreFromArchive');
    return ArchiveService.restoreFromArchive(options);
  },

  /**
   * Get archive statistics
   * @returns {Promise<{totalArchived: number, oldestDate: string, sizeBytes: number}>}
   */
  getArchiveStats() {
    return ArchiveService.getArchiveStats();
  },

  /**
   * Clear archive permanently
   * @returns {Promise<{deleted: number}>}
   */
  async clearArchive() {
    assertWriteAllowed('clearArchive');
    return ArchiveService.clearArchive();
  },

  // ==========================================
  // Chunks
  // ==========================================

  async saveChunks(chunks) {
    return queuedOperation(async () => {
      await IndexedDBCore.transaction(STORES.CHUNKS, 'readwrite', (store) => {
        for (const chunk of chunks) {
          store.put(chunk);
        }
      });
    }, true);
  },

  async getChunks() {
    return IndexedDBCore.getAll(STORES.CHUNKS);
  },

  // ==========================================
  // Personality
  // ==========================================

  async savePersonality(personality) {
    return queuedOperation(async () => {
      return IndexedDBCore.put(STORES.PERSONALITY, {
        id: 'result',
        ...personality,
        savedAt: new Date().toISOString()
      });
    }, true);
  },

  async getPersonality() {
    return IndexedDBCore.get(STORES.PERSONALITY, 'result');
  },

  // ==========================================
  // Settings
  // ==========================================

  async saveSetting(key, value) {
    return queuedOperation(async () => {
      return IndexedDBCore.put(STORES.SETTINGS, { key, value });
    });
  },

  async getSetting(key) {
    const result = await IndexedDBCore.get(STORES.SETTINGS, key);
    return result?.value;
  },

  // ==========================================
  // Chat Sessions
  // ==========================================

  async saveSession(session) {
    return queuedOperation(async () => {
      if (!session.id) throw new Error('Session must have an id');

      const now = new Date().toISOString();
      const data = {
        ...session,
        updatedAt: now,
        createdAt: session.createdAt || now,
        messageCount: session.messages?.length || 0
      };
      const result = await IndexedDBCore.put(STORES.CHAT_SESSIONS, data);
      this._notifyUpdate('session', 1);
      return result;
    });
  },

  async getSession(id) {
    return IndexedDBCore.get(STORES.CHAT_SESSIONS, id);
  },

  async getAllSessions() {
    return IndexedDBCore.getAllByIndex(STORES.CHAT_SESSIONS, 'updatedAt', 'prev');
  },

  async deleteSession(id) {
    await IndexedDBCore.delete(STORES.CHAT_SESSIONS, id);
    this._notifyUpdate('session', -1);
  },

  async getSessionCount() {
    return IndexedDBCore.count(STORES.CHAT_SESSIONS);
  },

  async clearAllSessions() {
    await IndexedDBCore.clear(STORES.CHAT_SESSIONS);
    this._notifyUpdate('session', 0);
  },

  // ==========================================
  // Profiles (delegate to ProfileStorage)
  // HNW: Extracted to dedicated module for single-responsibility
  // ==========================================

  async saveProfile(profile) {
    if (!ProfileStorage._storage) {
      ProfileStorage.init(this);
    }
    await ProfileStorage.saveProfile(profile);
    this._notifyUpdate('profile', await this.getProfileCount());
  },

  async getAllProfiles() {
    if (!ProfileStorage._storage) ProfileStorage.init(this);
    return ProfileStorage.getAllProfiles();
  },

  async getProfile(id) {
    if (!ProfileStorage._storage) ProfileStorage.init(this);
    return ProfileStorage.getProfile(id);
  },

  async deleteProfile(id) {
    if (!ProfileStorage._storage) ProfileStorage.init(this);
    await ProfileStorage.deleteProfile(id);
    this._notifyUpdate('profile', await this.getProfileCount());
  },

  async getActiveProfileId() {
    if (!ProfileStorage._storage) ProfileStorage.init(this);
    return ProfileStorage.getActiveProfileId();
  },

  async setActiveProfile(id) {
    if (!ProfileStorage._storage) ProfileStorage.init(this);
    await ProfileStorage.setActiveProfile(id);
    this._notifyUpdate('activeProfile', id ? 1 : 0);
  },

  async getProfileCount() {
    if (!ProfileStorage._storage) ProfileStorage.init(this);
    return ProfileStorage.getProfileCount();
  },

  async clearAllProfiles() {
    if (!ProfileStorage._storage) ProfileStorage.init(this);
    await ProfileStorage.clearAllProfiles();
    this._notifyUpdate('profile', 0);
  },

  // ==========================================
  // Config & Tokens (delegate to ConfigAPI)
  // ==========================================

  getConfig: (key, defaultValue) => ConfigAPI.getConfig(key, defaultValue),
  setConfig: (key, value) => ConfigAPI.setConfig(key, value),
  removeConfig: (key) => ConfigAPI.removeConfig(key),

  getToken: (key) => ConfigAPI.getToken(key),
  setToken: (key, value) => ConfigAPI.setToken(key, value),
  removeToken: (key) => ConfigAPI.removeToken(key),

  // ==========================================
  // Transactions (multi-backend atomic operations)
  // ==========================================

  /**
   * Begin an atomic transaction across storage backends (IndexedDB + localStorage).
   * Delegates to StorageTransaction.transaction for commit/rollback semantics.
   *
   * @param {function(import('./storage/transaction.js').TransactionContext): Promise<void>} callback
   * @returns {Promise<{success: boolean, operationsCommitted: number}>}
   */
  async beginTransaction(callback) {
    if (!StorageTransaction?.transaction) {
      throw new Error('StorageTransaction not available');
    }
    return StorageTransaction.transaction(callback);
  },

  // ==========================================
  // Migration (delegate to StorageMigration)
  // ==========================================

  migrateFromLocalStorage: () => StorageMigration.migrateFromLocalStorage(),
  rollbackMigration: () => StorageMigration.rollbackMigration(),
  getMigrationState: () => StorageMigration.getMigrationState(),

  // ==========================================
  // Clear All Data
  // ==========================================

  async clearAllData() {
    const results = {
      indexedDB: { cleared: false, stores: [] },
      localStorage: { cleared: false, keys: 0 }
    };

    // Acquire lock if available
    let lockId = null;
    if (OperationLock) {
      try {
        lockId = await OperationLock.acquire('privacy_clear');
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    try {
      // Clear all IndexedDB stores
      for (const storeName of Object.values(STORES)) {
        try {
          await IndexedDBCore.clear(storeName);
          results.indexedDB.stores.push(storeName);
        } catch (e) {
          console.warn(`[Storage] Failed to clear store ${storeName}:`, e);
        }
      }
      results.indexedDB.cleared = results.indexedDB.stores.length > 0;

      // Clear localStorage
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('rhythm_chamber_') ||
          key.startsWith('spotify_')
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      results.localStorage.keys = keysToRemove.length;
      results.localStorage.cleared = true;

      // Clear local embeddings
      const RAG = ModuleRegistry?.getModule
        ? await ModuleRegistry.getModule('RAG')
        : null;

      if (RAG?.clearEmbeddings) {
        try {
          await RAG.clearEmbeddings();
        } catch (e) {
          console.warn('[Storage] Failed to clear embeddings:', e);
        }
      }

      this._notifyUpdate('allDataCleared', 0);
      window.dispatchEvent(new CustomEvent('storage:cleared', { detail: results }));

      return { success: true, ...results };
    } finally {
      if (lockId && OperationLock) {
        OperationLock.release('privacy_clear', lockId);
      }
    }
  },

  // ==========================================
  // Utility
  // ==========================================

  /**
   * Check if Storage is ready for use
   * Note: Returns true if module is loaded with required methods.
   * Use isInitialized() to check if database connection is established.
   * @returns {boolean} True if Storage module is loaded and has required methods
   */
  isReady() {
    // Check if module has required methods (don't require DB connection yet)
    return typeof this.init === 'function' &&
      typeof this.getStreams === 'function' &&
      typeof this.saveStreams === 'function';
  },

  /**
   * Check if Storage has an active database connection
   * @returns {boolean} True if IndexedDB is initialized
   */
  isInitialized() {
    return !!(IndexedDBCore?.getConnection?.());
  },

  async clear() {
    for (const storeName of Object.values(STORES)) {
      await IndexedDBCore.clear(storeName);
    }
  },

  async hasData() {
    const streams = await this.getStreams();
    return streams !== null && streams.length > 0;
  },

  async getDataHash() {
    const streams = await this.getStreams();
    if (!streams || streams.length === 0) return null;

    const count = streams.length;
    const firstTs = streams[0]?.ts || '';
    const lastTs = streams[streams.length - 1]?.ts || '';
    return `${count}-${firstTs.slice(0, 10)}-${lastTs.slice(0, 10)}`;
  },

  // ==========================================
  // Event Emission (via EventBus)
  // ==========================================

  _notifyUpdate(type, count) {
    // Emit via centralized EventBus - no legacy listeners
    EventBus.emit('storage:updated', { store: type, count });
  },

  // ==========================================
  // Privacy Controls
  // ==========================================

  setSessionOnlyMode(enabled) {
    sessionOnlyMode = !!enabled;
    console.log(`[Storage] Session-only mode: ${sessionOnlyMode}`);
    return sessionOnlyMode;
  },

  isSessionOnlyMode() {
    return sessionOnlyMode;
  },

  setDataPersistenceConsent(consent) {
    dataPersistenceConsent = !!consent;
    localStorage.setItem('rhythm_chamber_persistence_consent', consent ? 'true' : 'false');
    console.log(`[Storage] Data persistence consent: ${dataPersistenceConsent}`);
    return dataPersistenceConsent;
  },

  hasDataPersistenceConsent() {
    const stored = localStorage.getItem('rhythm_chamber_persistence_consent');
    if (stored !== null) {
      dataPersistenceConsent = stored === 'true';
    }
    return dataPersistenceConsent;
  },

  async clearSensitiveData() {
    console.log('[Storage] Clearing sensitive data (raw streams)...');

    await IndexedDBCore.clear(STORES.STREAMS);
    sessionStorage.removeItem('rhythm_chamber_conversation');

    await this.removeConfig('rhythm_chamber_rag');
    await this.removeConfig('rhythm_chamber_rag_checkpoint');
    await this.removeConfig('rhythm_chamber_rag_checkpoint_cipher');

    this._notifyUpdate('sensitiveDataCleared', 0);
    console.log('[Storage] Sensitive data cleared.');

    return { success: true, retained: ['chunks', 'personality', 'chat_sessions'] };
  },

  async getDataSummary() {
    const streams = await this.getStreams();
    const chunks = await this.getChunks();
    const personality = await this.getPersonality();
    const sessionCount = await this.getSessionCount();

    return {
      hasRawStreams: !!(streams && streams.length > 0),
      streamCount: streams?.length || 0,
      chunkCount: chunks?.length || 0,
      hasPersonality: !!personality,
      chatSessionCount: sessionCount,
      sessionOnlyMode,
      persistenceConsent: dataPersistenceConsent,
      estimatedSizeMB: streams ? Math.round(JSON.stringify(streams).length / 1024 / 1024 * 100) / 100 : 0
    };
  },

  // ==========================================
  // Consistency Validation
  // ==========================================

  async validateConsistency() {
    const warnings = [];
    const fixes = [];

    try {
      const streams = await this.getStreams();
      const personality = await this.getPersonality();
      const chunks = await this.getChunks();

      if (personality && (!streams || streams.length === 0)) {
        warnings.push('Personality data exists without streaming data');
      }

      if (chunks && chunks.length > 0 && (!streams || streams.length === 0)) {
        warnings.push('Chunk data exists without streaming data');
      }

      try {
        const conversation = sessionStorage.getItem('rhythm_chamber_conversation');
        if (conversation) {
          const history = JSON.parse(conversation);
          if (history.length > 0 && !personality) {
            warnings.push('Conversation history exists without personality context');
            fixes.push('clearConversation');
          }
        }
      } catch (e) {
        warnings.push('Conversation history is corrupt - will be cleared');
        sessionStorage.removeItem('rhythm_chamber_conversation');
        fixes.push('conversationCleared');
      }

      const spotifyToken = localStorage.getItem('spotify_access_token');
      const spotifyExpiry = localStorage.getItem('spotify_token_expiry');
      if (spotifyToken && !spotifyExpiry) {
        warnings.push('Spotify token exists without expiry timestamp');
      }

      if (warnings.length > 0) {
        console.warn('[Storage] Consistency issues:', warnings);
      } else {
        console.log('[Storage] Consistency validation passed');
      }

      return {
        valid: warnings.length === 0,
        warnings,
        fixes,
        hasData: streams && streams.length > 0,
        hasPersonality: !!personality
      };
    } catch (err) {
      console.error('[Storage] Validation error:', err);
      return { valid: false, warnings: [err.message], fixes: [], error: err.message };
    }
  },

  // ==========================================
  // Sync Strategy (Phase 2 Preparation)
  // ==========================================

  /**
   * Get the sync manager for strategy selection
   * Currently only LocalOnlySync is available
   * @returns {SyncManager}
   */
  getSyncManager() {
    return SyncManager;
  },

  /**
   * Get current sync strategy
   * @returns {SyncStrategy}
   */
  getSyncStrategy() {
    return SyncManager.getStrategy() || null;
  },

  /**
   * Get sync status
   * @returns {Promise<object>}
   */
  async getSyncStatus() {
    const strategy = this.getSyncStrategy();
    if (!strategy) {
      return {
        mode: 'local',
        lastSync: null,
        pending: false,
        message: 'Sync strategy not initialized'
      };
    }
    return strategy.getStatus();
  }
};

// Export for ES Module consumers
export { Storage, STORES };

console.log('[Storage] Facade loaded - delegates to IndexedDBCore, ConfigAPI, StorageMigration');
