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
import { WriteAheadLog, WalPriority } from './storage/write-ahead-log.js';
import { ArchiveService } from './storage/archive-service.js';
import { QuotaManager } from './storage/quota-manager.js';
import { IndexedDBCore, STORES as INDEXEDDB_STORES } from './storage/indexeddb.js';
import { OperationLock } from './operation-lock.js';
import { ProfileStorage } from './storage/profiles.js';
import { ConfigAPI } from './storage/config-api.js';
import { SyncManager } from './storage/sync-strategy.js';
import { Crypto } from './security/crypto.js';

// ==========================================
// Security Enforcement
// ==========================================

/**
 * Check if writes are allowed (secure context required)
 * @param {string} operation - Operation name for error message
 * @throws {Error} If not in secure context
 */
function assertWriteAllowed(operation) {
  // Check if running in secure context
  if (!Crypto.isSecureContext()) {
    throw new Error(
      `[Storage] Write blocked: not in secure context. ` +
      `Operation '${operation}' requires HTTPS or localhost.`
    );
  }
}

// ==========================================
// Privacy Controls
// ==========================================

let sessionOnlyMode = false;
let dataPersistenceConsent = true;

// ==========================================
// Auto-Repair Configuration
// ==========================================

/**
 * Auto-repair configuration for storage consistency issues
 * When enabled, automatically attempts to repair detected issues
 */
const autoRepairConfig = {
  enabled: true,
  // Maximum number of repair attempts per issue type
  maxAttempts: 3,
  // Whether to repair orphaned data (data without parent references)
  repairOrphans: true,
  // Whether to rebuild corrupted indexes
  rebuildIndexes: true,
  // Whether to recalculate inconsistent metadata
  recalcMetadata: true,
  // Whether to attempt data recovery for corrupted records
  attemptRecovery: true,
  // Backup data before repair operations
  backupBeforeRepair: true
};

/**
 * Repair log for tracking all repair actions
 */
const repairLog = [];

/**
 * Get current auto-repair configuration
 * @returns {Object} Copy of auto-repair configuration
 */
function getAutoRepairConfig() {
  return { ...autoRepairConfig };
}

/**
 * Set auto-repair configuration
 * @param {Object} config - Configuration to apply
 * @returns {Object} Updated configuration
 */
function setAutoRepairConfig(config) {
  Object.assign(autoRepairConfig, config);
  console.log('[Storage] Auto-repair config updated:', autoRepairConfig);
  EventBus.emit('storage:autorepair_config_changed', { config: getAutoRepairConfig() });
  return getAutoRepairConfig();
}

/**
 * Enable or disable auto-repair
 * @param {boolean} enabled - Whether auto-repair should be enabled
 * @returns {boolean} Current enabled state
 */
function setAutoRepairEnabled(enabled) {
  autoRepairConfig.enabled = !!enabled;
  console.log(`[Storage] Auto-repair ${enabled ? 'enabled' : 'disabled'}`);
  EventBus.emit('storage:autorepair_toggled', { enabled: autoRepairConfig.enabled });
  return autoRepairConfig.enabled;
}

/**
 * Check if auto-repair is enabled
 * @returns {boolean}
 */
function isAutoRepairEnabled() {
  return autoRepairConfig.enabled;
}

/**
 * Log a repair action
 * @param {string} issueType - Type of issue
 * @param {string} action - Action taken
 * @param {boolean} success - Whether repair succeeded
 * @param {*} details - Additional details
 */
function logRepair(issueType, action, success, details = null) {
  const entry = {
    timestamp: new Date().toISOString(),
    issueType,
    action,
    success,
    details
  };
  repairLog.push(entry);
  console.log(`[Storage] Repair ${success ? 'succeeded' : 'failed'}: ${issueType} - ${action}`);
  EventBus.emit('storage:repair_action', entry);
}

/**
 * Get repair log
 * @param {Object} options - Query options
 * @param {number} [options.limit] - Maximum entries to return
 * @param {string} [options.issueType] - Filter by issue type
 * @returns {Array} Repair log entries
 */
function getRepairLog(options = {}) {
  let filtered = [...repairLog];

  if (options.issueType) {
    filtered = filtered.filter(entry => entry.issueType === options.issueType);
  }

  if (options.limit) {
    filtered = filtered.slice(-options.limit);
  }

  return filtered;
}

/**
 * Clear repair log
 */
function clearRepairLog() {
  repairLog.length = 0;
  console.log('[Storage] Repair log cleared');
}

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

const STORES = INDEXEDDB_STORES || {
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

  async clearExpiredSessions(maxAgeMs = 30 * 24 * 60 * 60 * 1000) {
    const sessions = await this.getAllSessions();
    if (!sessions || sessions.length === 0) return { deleted: 0 };

    const cutoffDate = new Date(Date.now() - maxAgeMs);
    let deletedCount = 0;

    for (const session of sessions) {
      if (new Date(session.updatedAt) < cutoffDate) {
        await this.deleteSession(session.id);
        deletedCount++;
      }
    }

    return { deleted: deletedCount };
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

  /**
   * Repair orphaned personality data (personality without streams)
   * Archives personality data for potential recovery rather than deleting
   * @returns {Promise<{repaired: boolean, action: string}>}
   */
  async repairOrphanedPersonality() {
    try {
      const personality = await this.getPersonality();
      const streams = await this.getStreams();

      if (!personality) {
        return { repaired: false, action: 'no_personality' };
      }

      if (streams && streams.length > 0) {
        return { repaired: false, action: 'has_streams' };
      }

      // Archive personality data before clearing (for recovery)
      const backupKey = `rhythm_chamber_personality_backup_${Date.now()}`;
      try {
        localStorage.setItem(backupKey, JSON.stringify({
          personality,
          archivedAt: new Date().toISOString(),
          reason: 'orphaned_without_streams'
        }));
      } catch (e) {
        console.warn('[Storage] Could not create personality backup:', e);
      }

      // Clear orphaned personality
      await IndexedDBCore.delete(STORES.PERSONALITY, 'result');
      logRepair('orphaned_personality', 'archived_and_cleared', true);
      return { repaired: true, action: 'archived_and_cleared' };
    } catch (err) {
      logRepair('orphaned_personality', 'clear_failed', false, err.message);
      return { repaired: false, action: 'error', error: err.message };
    }
  },

  /**
   * Repair orphaned chunk data (chunks without streams)
   * Archives chunks for potential recovery rather than deleting
   * @returns {Promise<{repaired: boolean, action: string, count: number}>}
   */
  async repairOrphanedChunks() {
    try {
      const chunks = await this.getChunks();
      const streams = await this.getStreams();

      if (!chunks || chunks.length === 0) {
        return { repaired: false, action: 'no_chunks', count: 0 };
      }

      if (streams && streams.length > 0) {
        return { repaired: false, action: 'has_streams', count: chunks.length };
      }

      // Archive chunks before clearing
      const backupKey = `rhythm_chamber_chunks_backup_${Date.now()}`;
      try {
        localStorage.setItem(backupKey, JSON.stringify({
          chunks,
          chunkCount: chunks.length,
          archivedAt: new Date().toISOString(),
          reason: 'orphaned_without_streams'
        }));
      } catch (e) {
        console.warn('[Storage] Could not create chunks backup:', e);
      }

      // Clear orphaned chunks
      await IndexedDBCore.clear(STORES.CHUNKS);
      logRepair('orphaned_chunks', 'archived_and_cleared', true, { count: chunks.length });
      return { repaired: true, action: 'archived_and_cleared', count: chunks.length };
    } catch (err) {
      logRepair('orphaned_chunks', 'clear_failed', false, err.message);
      return { repaired: false, action: 'error', count: 0, error: err.message };
    }
  },

  /**
   * Repair corrupt conversation history in sessionStorage
   * Attempts to salvage valid entries before clearing
   * @returns {Promise<{repaired: boolean, action: string, salvaged: number}>}
   */
  async repairCorruptConversation() {
    try {
      const conversation = sessionStorage.getItem('rhythm_chamber_conversation');
      if (!conversation) {
        return { repaired: false, action: 'no_conversation', salvaged: 0 };
      }

      let salvaged = 0;
      let salvagedData = null;

      // Attempt to salvage partial data
      try {
        const history = JSON.parse(conversation);
        if (Array.isArray(history)) {
          // Filter to only valid entries
          const validEntries = history.filter(entry => {
            return entry && typeof entry === 'object' &&
                   (entry.role || entry.content || entry.timestamp);
          });
          salvaged = validEntries.length;

          if (salvaged > 0) {
            salvagedData = JSON.stringify(validEntries);
          }
        }
      } catch (parseErr) {
        // JSON parse failed - no salvage possible
        console.warn('[Storage] Conversation JSON parse failed, no salvage possible');
      }

      // Clear the corrupt data
      sessionStorage.removeItem('rhythm_chamber_conversation');

      // If we salvaged data, restore it
      if (salvagedData) {
        try {
          sessionStorage.setItem('rhythm_chamber_conversation', salvagedData);
          logRepair('corrupt_conversation', 'salvaged_and_restored', true, { salvaged });
          return { repaired: true, action: 'salvaged_and_restored', salvaged };
        } catch (restoreErr) {
          console.warn('[Storage] Could not restore salvaged conversation:', restoreErr);
        }
      }

      logRepair('corrupt_conversation', 'cleared', true, { salvaged });
      return { repaired: true, action: 'cleared', salvaged };
    } catch (err) {
      logRepair('corrupt_conversation', 'repair_failed', false, err.message);
      return { repaired: false, action: 'error', salvaged: 0, error: err.message };
    }
  },

  /**
   * Repair Spotify token without expiry
   * Clears expired or incomplete token data
   * @returns {Promise<{repaired: boolean, action: string}>}
   */
  async repairSpotifyToken() {
    try {
      const spotifyToken = localStorage.getItem('spotify_access_token');
      const spotifyExpiry = localStorage.getItem('spotify_token_expiry');

      if (!spotifyToken) {
        return { repaired: false, action: 'no_token' };
      }

      if (spotifyExpiry) {
        return { repaired: false, action: 'has_expiry' };
      }

      // Clear token without expiry (incomplete auth state)
      localStorage.removeItem('spotify_access_token');
      localStorage.removeItem('spotify_refresh_token');
      logRepair('spotify_token', 'cleared_incomplete_token', true);
      return { repaired: true, action: 'cleared_incomplete_token' };
    } catch (err) {
      logRepair('spotify_token', 'repair_failed', false, err.message);
      return { repaired: false, action: 'error', error: err.message };
    }
  },

  /**
   * Recalculate session metadata
   * Ensures messageCount and updatedAt fields are accurate
   * @returns {Promise<{repaired: number, errors: number}>}
   */
  async recalculateSessionMetadata() {
    try {
      const sessions = await this.getAllSessions();
      if (!sessions || sessions.length === 0) {
        return { repaired: 0, errors: 0 };
      }

      let repaired = 0;
      let errors = 0;

      for (const session of sessions) {
        try {
          let needsUpdate = false;
          const updates = {};

          // Recalculate message count if messages exist
          if (session.messages && Array.isArray(session.messages)) {
            const actualCount = session.messages.length;
            if (session.messageCount !== actualCount) {
              updates.messageCount = actualCount;
              needsUpdate = true;
            }
          }

          // Ensure updatedAt exists
          if (!session.updatedAt) {
            updates.updatedAt = session.createdAt || new Date().toISOString();
            needsUpdate = true;
          }

          // Update if changes needed
          if (needsUpdate) {
            await IndexedDBCore.put(STORES.CHAT_SESSIONS, {
              ...session,
              ...updates
            });
            repaired++;
          }
        } catch (sessionErr) {
          console.warn('[Storage] Failed to recalculate session metadata:', sessionErr);
          errors++;
        }
      }

      if (repaired > 0) {
        logRepair('session_metadata', 'recalculated', true, { repaired, errors });
      }

      return { repaired, errors };
    } catch (err) {
      logRepair('session_metadata', 'recalculation_failed', false, err.message);
      return { repaired: 0, errors: 1, error: err.message };
    }
  },

  /**
   * Rebuild missing or corrupted indexes
   * Verifies index integrity and rebuilds if needed
   * @returns {Promise<{rebuilt: Array<string>, errors: Array<string>}>}
   */
  async rebuildIndexes() {
    const results = {
      rebuilt: [],
      errors: []
    };

    if (!autoRepairConfig.rebuildIndexes) {
      return results;
    }

    try {
      const db = IndexedDBCore.getConnection();
      if (!db) {
        results.errors.push('no_database_connection');
        return results;
      }

      // Check critical indexes on chat_sessions store
      const sessionStoreNames = [STORES.CHAT_SESSIONS, 'chat_sessions'];
      let sessionStore = null;

      for (const name of sessionStoreNames) {
        if (db.objectStoreNames.contains(name)) {
          sessionStore = name;
          break;
        }
      }

      if (sessionStore) {
        try {
          const tx = db.transaction(sessionStore, 'readonly');
          const store = tx.objectStore(sessionStore);

          // Check for updatedAt index
          if (!store.indexNames.contains('updatedAt')) {
            console.warn('[Storage] Missing updatedAt index on chat_sessions');
            // Note: Cannot add index without version change
            // Record for manual intervention or version upgrade
            results.errors.push('missing_updatedAt_index_requires_version_upgrade');
          } else {
            results.rebuilt.push('updatedAt_index_verified');
          }
        } catch (indexErr) {
          results.errors.push(`index_check_failed: ${indexErr.message}`);
        }
      }

      // Check chunks store indexes
      const chunksStoreNames = [STORES.CHUNKS, 'chunks'];
      let chunksStore = null;

      for (const name of chunksStoreNames) {
        if (db.objectStoreNames.contains(name)) {
          chunksStore = name;
          break;
        }
      }

      if (chunksStore) {
        try {
          const tx = db.transaction(chunksStore, 'readonly');
          const store = tx.objectStore(chunksStore);

          // Verify expected indexes exist
          const expectedIndexes = ['type', 'startDate'];
          for (const indexName of expectedIndexes) {
            if (!store.indexNames.contains(indexName)) {
              results.errors.push(`missing_${indexName}_index`);
            } else {
              results.rebuilt.push(`${indexName}_index_verified`);
            }
          }
        } catch (indexErr) {
          results.errors.push(`chunks_index_check_failed: ${indexErr.message}`);
        }
      }

      if (results.rebuilt.length > 0) {
        logRepair('indexes', 'verified', true, { verified: results.rebuilt });
      }

      if (results.errors.length > 0) {
        logRepair('indexes', 'errors_found', false, { errors: results.errors });
      }

      return results;
    } catch (err) {
      logRepair('indexes', 'rebuild_failed', false, err.message);
      results.errors.push(err.message);
      return results;
    }
  },

  /**
   * Attempt to recover corrupted data from backup
   * @param {string} dataType - Type of data ('personality', 'chunks')
   * @returns {Promise<{recovered: boolean, action: string}>}
   */
  async recoverFromBackup(dataType) {
    try {
      // Find the most recent backup for this data type
      const backupPrefix = `rhythm_chamber_${dataType}_backup_`;
      let latestBackup = null;
      let latestTimestamp = 0;

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(backupPrefix)) {
          const timestampMatch = key.match(/(\d+)$/);
          if (timestampMatch) {
            const timestamp = parseInt(timestampMatch[1], 10);
            if (timestamp > latestTimestamp) {
              latestTimestamp = timestamp;
              latestBackup = key;
            }
          }
        }
      }

      if (!latestBackup) {
        return { recovered: false, action: 'no_backup_found' };
      }

      // Read and parse backup
      const backupData = JSON.parse(localStorage.getItem(latestBackup));
      if (!backupData || !backupData[dataType]) {
        return { recovered: false, action: 'invalid_backup' };
      }

      // Restore data
      const storeName = dataType === 'personality' ? STORES.PERSONALITY : STORES.CHUNKS;
      const idField = dataType === 'personality' ? 'result' : undefined;

      if (dataType === 'personality') {
        await IndexedDBCore.put(STORES.PERSONALITY, {
          id: 'result',
          ...backupData.personality
        });
      } else if (dataType === 'chunks' && Array.isArray(backupData.chunks)) {
        for (const chunk of backupData.chunks) {
          await IndexedDBCore.put(STORES.CHUNKS, chunk);
        }
      }

      logRepair('backup_recovery', dataType, true, { backupKey: latestBackup });
      return { recovered: true, action: 'restored_from_backup', backupKey: latestBackup };
    } catch (err) {
      logRepair('backup_recovery', dataType, false, err.message);
      return { recovered: false, action: 'error', error: err.message };
    }
  },

  /**
   * Run all auto-repair operations based on detected issues
   * @param {Object} issues - Issues detected by validateConsistency
   * @returns {Promise<Object>} Repair results
   */
  async runAutoRepair(issues = {}) {
    if (!autoRepairConfig.enabled) {
      console.log('[Storage] Auto-repair is disabled, skipping repairs');
      return { repaired: false, reason: 'disabled' };
    }

    console.log('[Storage] Running auto-repair for detected issues...');
    const results = {
      repaired: [],
      failed: [],
      skipped: []
    };

    // Repair orphaned personality
    if (issues.personalityWithoutStreams) {
      if (autoRepairConfig.repairOrphans) {
        const result = await this.repairOrphanedPersonality();
        if (result.repaired) {
          results.repaired.push('orphaned_personality');
        } else {
          results.failed.push({ type: 'orphaned_personality', reason: result.action });
        }
      } else {
        results.skipped.push('orphaned_personality');
      }
    }

    // Repair orphaned chunks
    if (issues.chunksWithoutStreams) {
      if (autoRepairConfig.repairOrphans) {
        const result = await this.repairOrphanedChunks();
        if (result.repaired) {
          results.repaired.push('orphaned_chunks');
        } else {
          results.failed.push({ type: 'orphaned_chunks', reason: result.action });
        }
      } else {
        results.skipped.push('orphaned_chunks');
      }
    }

    // Repair corrupt conversation
    if (issues.corruptConversation) {
      const result = await this.repairCorruptConversation();
      if (result.repaired) {
        results.repaired.push('corrupt_conversation');
      } else {
        results.failed.push({ type: 'corrupt_conversation', reason: result.action });
      }
    }

    // Repair Spotify token issues
    if (issues.spotifyTokenWithoutExpiry) {
      const result = await this.repairSpotifyToken();
      if (result.repaired) {
        results.repaired.push('spotify_token');
      } else {
        results.failed.push({ type: 'spotify_token', reason: result.action });
      }
    }

    // Recalculate metadata
    if (autoRepairConfig.recalcMetadata) {
      const result = await this.recalculateSessionMetadata();
      if (result.repaired > 0) {
        results.repaired.push(`session_metadata (${result.repaired} sessions)`);
      }
      if (result.errors > 0) {
        results.failed.push({ type: 'session_metadata', errors: result.errors });
      }
    }

    // Rebuild indexes
    if (autoRepairConfig.rebuildIndexes) {
      const result = await this.rebuildIndexes();
      if (result.rebuilt.length > 0) {
        results.repaired.push(`indexes_verified: ${result.rebuilt.join(', ')}`);
      }
      if (result.errors.length > 0) {
        results.failed.push({ type: 'indexes', errors: result.errors });
      }
    }

    // Emit repair completion event
    EventBus.emit('storage:autorepair_complete', results);

    return results;
  },

  async validateConsistency(options = {}) {
    const warnings = [];
    const fixes = [];
    const {
      autoRepair = null, // null = use config, true = force repair, false = no repair
      verbose = false
    } = options;

    try {
      const streams = await this.getStreams();
      const personality = await this.getPersonality();
      const chunks = await this.getChunks();

      // Track issues for potential auto-repair
      const issues = {};

      if (personality && (!streams || streams.length === 0)) {
        warnings.push('Personality data exists without streaming data');
        issues.personalityWithoutStreams = true;
      }

      if (chunks && chunks.length > 0 && (!streams || streams.length === 0)) {
        warnings.push('Chunk data exists without streaming data');
        issues.chunksWithoutStreams = true;
      }

      let corruptConversation = false;
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
        corruptConversation = true;
        issues.corruptConversation = true;
        // Don't auto-clear here - let auto-repair handle it if enabled
        if (!autoRepairConfig.enabled && autoRepair !== true) {
          sessionStorage.removeItem('rhythm_chamber_conversation');
          fixes.push('conversationCleared');
        }
      }

      const spotifyToken = localStorage.getItem('spotify_access_token');
      const spotifyExpiry = localStorage.getItem('spotify_token_expiry');
      if (spotifyToken && !spotifyExpiry) {
        warnings.push('Spotify token exists without expiry timestamp');
        issues.spotifyTokenWithoutExpiry = true;
      }

      // Determine if auto-repair should run
      const shouldRunRepair = autoRepair === true ||
        (autoRepair === null && autoRepairConfig.enabled);

      let repairResults = null;
      if (shouldRunRepair && Object.keys(issues).length > 0) {
        if (verbose) {
          console.log('[Storage] Running auto-repair for issues:', issues);
        }
        repairResults = await this.runAutoRepair(issues);

        // Re-validate after repair to check if issues were resolved
        if (repairResults.repaired.length > 0) {
          if (verbose) {
            console.log('[Storage] Repairs completed:', repairResults.repaired);
          }

          // Check if repairs resolved the issues
          const personalityAfter = await this.getPersonality();
          const streamsAfter = await this.getStreams();
          const chunksAfter = await this.getChunks();

          // Update warnings based on repair results
          if (issues.personalityWithoutStreams && !personalityAfter) {
            const warningIdx = warnings.indexOf('Personality data exists without streaming data');
            if (warningIdx !== -1) {
              warnings.splice(warningIdx, 1);
            }
            fixes.push('orphaned_personality_repaired');
          }

          if (issues.chunksWithoutStreams && (!chunksAfter || chunksAfter.length === 0)) {
            const warningIdx = warnings.indexOf('Chunk data exists without streaming data');
            if (warningIdx !== -1) {
              warnings.splice(warningIdx, 1);
            }
            fixes.push('orphaned_chunks_repaired');
          }

          if (issues.corruptConversation) {
            const warningIdx = warnings.findIndex(w => w.includes('corrupt'));
            if (warningIdx !== -1) {
              warnings.splice(warningIdx, 1);
            }
            fixes.push('corrupt_conversation_repaired');
          }
        }

        if (repairResults.failed.length > 0 && verbose) {
          console.warn('[Storage] Some repairs failed:', repairResults.failed);
        }
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
        hasPersonality: !!personality,
        issues,
        repairResults,
        autoRepairEnabled: autoRepairConfig.enabled
      };
    } catch (err) {
      console.error('[Storage] Validation error:', err);
      return {
        valid: false,
        warnings: [err.message],
        fixes: [],
        error: err.message,
        autoRepairEnabled: autoRepairConfig.enabled
      };
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
  },

  // ==========================================
  // Auto-Repair API
  // ==========================================

  /**
   * Get current auto-repair configuration
   * @returns {Object} Auto-repair configuration
   */
  getAutoRepairConfig() {
    return getAutoRepairConfig();
  },

  /**
   * Set auto-repair configuration
   * @param {Object} config - Configuration to apply
   * @returns {Object} Updated configuration
   */
  setAutoRepairConfig(config) {
    return setAutoRepairConfig(config);
  },

  /**
   * Enable or disable auto-repair
   * @param {boolean} enabled - Whether auto-repair should be enabled
   * @returns {boolean} Current enabled state
   */
  setAutoRepairEnabled(enabled) {
    return setAutoRepairEnabled(enabled);
  },

  /**
   * Check if auto-repair is enabled
   * @returns {boolean}
   */
  isAutoRepairEnabled() {
    return isAutoRepairEnabled();
  },

  /**
   * Get repair log
   * @param {Object} options - Query options
   * @returns {Array} Repair log entries
   */
  getRepairLog(options) {
    return getRepairLog(options);
  },

  /**
   * Clear repair log
   */
  clearRepairLog() {
    clearRepairLog();
  },

  /**
   * Manually trigger auto-repair for all detected issues
   * @returns {Promise<Object>} Repair results
   */
  async repairAll() {
    // First validate to detect all issues
    const validation = await this.validateConsistency({ autoRepair: false });
    const issues = validation.issues || {};

    // Add metadata recalculation and index checks to all repairs
    return await this.runAutoRepair(issues);
  },

  /**
   * Get storage health report including repair history
   * @returns {Promise<Object>} Health report
   */
  async getHealthReport() {
    const validation = await this.validateConsistency({ autoRepair: false });
    const recentRepairs = getRepairLog({ limit: 10 });
    const config = getAutoRepairConfig();

    return {
      healthy: validation.valid,
      issues: validation.warnings,
      autoRepair: {
        enabled: config.enabled,
        recentRepairs,
        repairCount: repairLog.length
      },
      storage: {
        hasData: validation.hasData,
        hasPersonality: validation.hasPersonality
      }
    };
  }
};

// Export for ES Module consumers
export { Storage, STORES };

console.log('[Storage] Facade loaded - delegates to IndexedDBCore, ConfigAPI, StorageMigration');
