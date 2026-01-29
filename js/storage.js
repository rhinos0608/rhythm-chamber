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

import { StorageTransaction } from './storage/transaction/index.js';
import { StorageMigration } from './storage/migration.js';
import { ModuleRegistry } from './module-registry.js';
import { EventBus } from './services/event-bus.js';
import { WriteAheadLog, WalPriority } from './storage/write-ahead-log/index.js';
import { ArchiveService } from './storage/archive-service.js';
import { QuotaManager } from './storage/quota-manager.js';
import { IndexedDBCore, STORES as INDEXEDDB_STORES } from './storage/indexeddb.js';
import { OperationLock } from './operation-lock.js';
import { ProfileStorage } from './storage/profiles.js';
import { ConfigAPI } from './storage/config-api.js';
import { SyncManager } from './storage/sync-strategy.js';
import { Crypto } from './security/crypto.js';
import { STORAGE_EVENT_SCHEMAS } from './storage/storage-event-schemas.js';
import { AutoRepairService } from './storage/auto-repair.js';

// Import extracted store modules
import * as Stores from './storage/stores/index.js';
import {
    queuedOperation,
    isCriticalOperationInProgress,
    setPendingReload as setQueuePendingReload,
    isReloadPending
} from './storage/operations/queue.js';
import { assertWriteAllowed } from './storage/stores/streams.js';

// ==========================================
// Privacy Controls
// ==========================================

let sessionOnlyMode = false;
let dataPersistenceConsent = true;

// ==========================================
// Service Instantiation
// ==========================================

const autoRepairService = new AutoRepairService(EventBus, IndexedDBCore);

// ==========================================
// Auto-Repair Configuration
// ==========================================

/**
 * Get current auto-repair configuration
 * @returns {Object} Copy of auto-repair configuration
 */
function getAutoRepairConfig() {
  return autoRepairService.getAutoRepairConfig();
}

/**
 * Set auto-repair configuration
 * @param {Object} config - Configuration to apply
 * @returns {Object} Updated configuration
 */
function setAutoRepairConfig(config) {
  console.log('[Storage] Auto-repair config updated:', config);
  const updated = autoRepairService.setAutoRepairConfig(config);
  EventBus.emit('storage:autorepair_config_changed', { config: updated });
  return updated;
}

/**
 * Enable or disable auto-repair
 * @param {boolean} enabled - Whether auto-repair should be enabled
 * @returns {boolean} Current enabled state
 */
function setAutoRepairEnabled(enabled) {
  const config = autoRepairService.getAutoRepairConfig();
  config.enabled = !!enabled;
  console.log(`[Storage] Auto-repair ${enabled ? 'enabled' : 'disabled'}`);
  autoRepairService.setAutoRepairConfig(config);
  EventBus.emit('storage:autorepair_toggled', { enabled: config.enabled });
  return config.enabled;
}

/**
 * Check if auto-repair is enabled
 * @returns {boolean}
 */
function isAutoRepairEnabled() {
  const config = autoRepairService.getAutoRepairConfig();
  return config.enabled;
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
  autoRepairService._logRepair(action, entry);
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
  let filtered = autoRepairService.getRepairLog();

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
  autoRepairService.clearRepairLog();
  console.log('[Storage] Repair log cleared');
}

// ==========================================
// Pending Reload Management
// ==========================================

/**
 * Set pending reload flag (delegates to operation queue)
 */
function setPendingReload() {
  setQueuePendingReload(true);
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
  MIGRATION: 'migration',
  TRANSACTION_JOURNAL: 'TRANSACTION_JOURNAL',
  TRANSACTION_COMPENSATION: 'TRANSACTION_COMPENSATION'
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
    return queuedOperation(async () => {
      // Register storage event schemas with EventBus (decentralized schema management)
      EventBus.registerSchemas(STORAGE_EVENT_SCHEMAS);

      // Initialize IndexedDB
      await IndexedDBCore.initDatabaseWithRetry({
        onVersionChange: () => {
          if (isCriticalOperationInProgress()) {
            console.warn('[Storage] Version change deferred - critical operation in progress');
            setQueuePendingReload(true);
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
    }, true);
  },

  // ==========================================
  // Streams (delegated to stores/streams.js)
  // ==========================================

  async saveStreams(streams) {
    const result = await Stores.saveStreams(streams);
    this._notifyUpdate('streams', streams.length);
    return result;
  },

  getStreams: () => Stores.getStreams(),

  async appendStreams(newStreams) {
    const result = await Stores.appendStreams(newStreams);
    this._notifyUpdate('streams', result.data.length);
    return result;
  },

  async clearStreams() {
    await Stores.clearStreams();
    this._notifyUpdate('streams', 0);
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
  // Chunks (delegated to stores/chunks.js)
  // ==========================================

  saveChunks: (chunks) => Stores.saveChunks(chunks),
  getChunks: () => Stores.getChunks(),

  // ==========================================
  // Personality & Settings (delegated to stores/artifacts.js)
  // ==========================================

  savePersonality: (personality) => Stores.savePersonality(personality),
  getPersonality: () => Stores.getPersonality(),
  saveSetting: (key, value) => Stores.saveSetting(key, value),
  getSetting: (key) => Stores.getSetting(key),

  // ==========================================
  // Chat Sessions (delegated to stores/sessions.js)
  // ==========================================

  async saveSession(session) {
    const result = await Stores.saveSession(session);
    this._notifyUpdate('session', 1);
    return result;
  },

  getSession: (id) => Stores.getSession(id),
  getAllSessions: () => Stores.getAllSessions(),

  async deleteSession(id) {
    await Stores.deleteSession(id);
    this._notifyUpdate('session', -1);
  },

  getSessionCount: () => Stores.getSessionCount(),

  async clearAllSessions() {
    await Stores.clearAllSessions();
    this._notifyUpdate('session', 0);
  },

  clearExpiredSessions: (maxAgeMs) => Stores.clearExpiredSessions(maxAgeMs),

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
    return !!(IndexedDBCore?.getConnection?.()) && !IndexedDBCore?.isUsingFallback?.();
  },

  async clear() {
    for (const storeName of Object.values(STORES)) {
      await IndexedDBCore.clear(storeName);
    }
  },

  async hasData() {
    return Stores.hasStreams();
  },

  async getDataHash() {
    return Stores.getStreamsHash();
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
    const streams = await Stores.getStreams();
    const chunks = await Stores.getChunks();
    const personality = await Stores.getPersonality();
    const sessionCount = await Stores.getSessionCount();

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

  async repairOrphanedPersonality() {
    return { repaired: false, action: 'disabled' };
  },

  async repairOrphanedChunks() {
    return { repaired: false, action: 'disabled', count: 0 };
  },

  async repairCorruptConversation() {
    return { repaired: false, action: 'disabled', salvaged: 0 };
  },

  async repairSpotifyToken() {
    return { repaired: false, action: 'disabled' };
  },

  async recalculateSessionMetadata() {
    return { repaired: 0, errors: 0 };
  },

  async rebuildIndexes() {
    return { rebuilt: [], errors: [] };
  },

  async recoverFromBackup(dataType) {
    return { recovered: false, action: 'disabled', dataType };
  },

  async runAutoRepair(issues = {}) {
    const config = autoRepairService.getAutoRepairConfig();
    if (!config.enabled) {
      return { repaired: false, reason: 'disabled', issues };
    }
    return { repaired: false, reason: 'not_implemented', issues };
  },

  async validateConsistency(options = {}) {
    const warnings = [];
    const fixes = [];
    try {
      const streams = await Stores.getStreams();
      const personality = await Stores.getPersonality();
      const chunks = await Stores.getChunks();

      const issues = {};
      if (personality && (!streams || streams.length === 0)) {
        warnings.push('Personality data exists without streaming data');
        issues.personalityWithoutStreams = true;
      }
      if (chunks && chunks.length > 0 && (!streams || streams.length === 0)) {
        warnings.push('Chunk data exists without streaming data');
        issues.chunksWithoutStreams = true;
      }

      const config = autoRepairService.getAutoRepairConfig();
      return {
        valid: warnings.length === 0,
        warnings,
        fixes,
        hasData: !!(streams && streams.length > 0),
        hasPersonality: !!personality,
        issues,
        repairResults: null,
        autoRepairEnabled: config.enabled
      };
    } catch (err) {
      const config = autoRepairService.getAutoRepairConfig();
      return {
        valid: false,
        warnings: [err.message],
        fixes,
        error: err.message,
        autoRepairEnabled: config.enabled
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
    const repairLog = getRepairLog({ limit: 10 });
    const config = getAutoRepairConfig();

    return {
      healthy: validation.valid,
      issues: validation.warnings,
      autoRepair: {
        enabled: config.enabled,
        recentRepairs: repairLog,
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
