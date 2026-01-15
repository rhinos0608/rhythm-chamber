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

// ==========================================
// Privacy Controls
// ==========================================

let sessionOnlyMode = false;
let dataPersistenceConsent = true;

// Event listener registry
const updateListeners = [];

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

const STORES = window.IndexedDBCore?.STORES || {
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
    await window.IndexedDBCore.initDatabase({
      onVersionChange: () => {
        if (criticalOperationInProgress) {
          console.warn('[Storage] Version change deferred - critical operation in progress');
          pendingReload = true;
        } else {
          console.log('[Storage] Database version change detected');
          window.IndexedDBCore.closeDatabase();
          window.location.reload();
        }
      },
      onBlocked: () => {
        console.warn('[Storage] Database upgrade blocked by other tabs');
      }
    });

    // Run migration
    await window.StorageMigration.migrateFromLocalStorage();

    return window.IndexedDBCore.getConnection();
  },

  // ==========================================
  // Streams
  // ==========================================

  async saveStreams(streams) {
    return queuedOperation(async () => {
      const result = await window.IndexedDBCore.put(STORES.STREAMS, {
        id: 'all',
        data: streams,
        savedAt: new Date().toISOString()
      });
      this._notifyUpdate('streams', streams.length);
      return result;
    }, true);
  },

  async getStreams() {
    const result = await window.IndexedDBCore.get(STORES.STREAMS, 'all');
    return result?.data || null;
  },

  async appendStreams(newStreams) {
    return queuedOperation(async () => {
      // Use atomic update to prevent race conditions
      const result = await window.IndexedDBCore.atomicUpdate(
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
    return queuedOperation(async () => {
      await window.IndexedDBCore.clear(STORES.STREAMS);
      this._notifyUpdate('streams', 0);
    }, true);
  },

  // ==========================================
  // Chunks
  // ==========================================

  async saveChunks(chunks) {
    return queuedOperation(async () => {
      await window.IndexedDBCore.transaction(STORES.CHUNKS, 'readwrite', (store) => {
        for (const chunk of chunks) {
          store.put(chunk);
        }
      });
    }, true);
  },

  async getChunks() {
    return window.IndexedDBCore.getAll(STORES.CHUNKS);
  },

  // ==========================================
  // Personality
  // ==========================================

  async savePersonality(personality) {
    return queuedOperation(async () => {
      return window.IndexedDBCore.put(STORES.PERSONALITY, {
        id: 'result',
        ...personality,
        savedAt: new Date().toISOString()
      });
    }, true);
  },

  async getPersonality() {
    return window.IndexedDBCore.get(STORES.PERSONALITY, 'result');
  },

  // ==========================================
  // Settings
  // ==========================================

  async saveSetting(key, value) {
    return queuedOperation(async () => {
      return window.IndexedDBCore.put(STORES.SETTINGS, { key, value });
    });
  },

  async getSetting(key) {
    const result = await window.IndexedDBCore.get(STORES.SETTINGS, key);
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
      const result = await window.IndexedDBCore.put(STORES.CHAT_SESSIONS, data);
      this._notifyUpdate('session', 1);
      return result;
    });
  },

  async getSession(id) {
    return window.IndexedDBCore.get(STORES.CHAT_SESSIONS, id);
  },

  async getAllSessions() {
    return window.IndexedDBCore.getAllByIndex(STORES.CHAT_SESSIONS, 'updatedAt', 'prev');
  },

  async deleteSession(id) {
    await window.IndexedDBCore.delete(STORES.CHAT_SESSIONS, id);
    this._notifyUpdate('session', -1);
  },

  async getSessionCount() {
    return window.IndexedDBCore.count(STORES.CHAT_SESSIONS);
  },

  async clearAllSessions() {
    await window.IndexedDBCore.clear(STORES.CHAT_SESSIONS);
    this._notifyUpdate('session', 0);
  },

  // ==========================================
  // Profiles (delegate to ProfileStorage)
  // HNW: Extracted to dedicated module for single-responsibility
  // ==========================================

  async saveProfile(profile) {
    if (!window.ProfileStorage._storage) {
      window.ProfileStorage.init(this);
    }
    await window.ProfileStorage.saveProfile(profile);
    this._notifyUpdate('profile', await this.getProfileCount());
  },

  async getAllProfiles() {
    if (!window.ProfileStorage._storage) window.ProfileStorage.init(this);
    return window.ProfileStorage.getAllProfiles();
  },

  async getProfile(id) {
    if (!window.ProfileStorage._storage) window.ProfileStorage.init(this);
    return window.ProfileStorage.getProfile(id);
  },

  async deleteProfile(id) {
    if (!window.ProfileStorage._storage) window.ProfileStorage.init(this);
    await window.ProfileStorage.deleteProfile(id);
    this._notifyUpdate('profile', await this.getProfileCount());
  },

  async getActiveProfileId() {
    if (!window.ProfileStorage._storage) window.ProfileStorage.init(this);
    return window.ProfileStorage.getActiveProfileId();
  },

  async setActiveProfile(id) {
    if (!window.ProfileStorage._storage) window.ProfileStorage.init(this);
    await window.ProfileStorage.setActiveProfile(id);
    this._notifyUpdate('activeProfile', id ? 1 : 0);
  },

  async getProfileCount() {
    if (!window.ProfileStorage._storage) window.ProfileStorage.init(this);
    return window.ProfileStorage.getProfileCount();
  },

  async clearAllProfiles() {
    if (!window.ProfileStorage._storage) window.ProfileStorage.init(this);
    await window.ProfileStorage.clearAllProfiles();
    this._notifyUpdate('profile', 0);
  },

  // ==========================================
  // Config & Tokens (delegate to ConfigAPI)
  // ==========================================

  getConfig: (key, defaultValue) => window.ConfigAPI.getConfig(key, defaultValue),
  setConfig: (key, value) => window.ConfigAPI.setConfig(key, value),
  removeConfig: (key) => window.ConfigAPI.removeConfig(key),

  getToken: (key) => window.ConfigAPI.getToken(key),
  setToken: (key, value) => window.ConfigAPI.setToken(key, value),
  removeToken: (key) => window.ConfigAPI.removeToken(key),

  // ==========================================
  // Migration (delegate to StorageMigration)
  // ==========================================

  migrateFromLocalStorage: () => window.StorageMigration.migrateFromLocalStorage(),
  rollbackMigration: () => window.StorageMigration.rollbackMigration(),
  getMigrationState: () => window.StorageMigration.getMigrationState(),

  // ==========================================
  // Clear All Data
  // ==========================================

  async clearAllData() {
    const results = {
      indexedDB: { cleared: false, stores: [] },
      localStorage: { cleared: false, keys: 0 },
      qdrant: { cleared: false, error: null }
    };

    // Acquire lock if available
    let lockId = null;
    if (window.OperationLock) {
      try {
        lockId = await window.OperationLock.acquire('privacy_clear');
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    try {
      // Clear all IndexedDB stores
      for (const storeName of Object.values(STORES)) {
        try {
          await window.IndexedDBCore.clear(storeName);
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
          key.startsWith('spotify_') ||
          key === 'qdrant_url' ||
          key === 'qdrant_api_key'
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      results.localStorage.keys = keysToRemove.length;
      results.localStorage.cleared = true;

      // Clear Qdrant embeddings
      if (window.RAG?.hasCredentials?.()) {
        try {
          await window.RAG.clearEmbeddings();
          results.qdrant.cleared = true;
        } catch (e) {
          results.qdrant.error = e.message;
        }
      } else {
        results.qdrant.cleared = true;
      }

      this._notifyUpdate('allDataCleared', 0);
      window.dispatchEvent(new CustomEvent('storage:cleared', { detail: results }));

      return { success: true, ...results };
    } finally {
      if (lockId && window.OperationLock) {
        window.OperationLock.release('privacy_clear', lockId);
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
    return !!(window.IndexedDBCore?.getConnection?.());
  },

  async clear() {
    for (const storeName of Object.values(STORES)) {
      await window.IndexedDBCore.clear(storeName);
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
  // Update Listeners
  // ==========================================

  onUpdate(callback) {
    if (typeof callback === 'function') {
      updateListeners.push(callback);
    }
  },

  offUpdate(callback) {
    const index = updateListeners.indexOf(callback);
    if (index > -1) updateListeners.splice(index, 1);
  },

  _notifyUpdate(type, count) {
    const event = { type, count, timestamp: Date.now() };
    updateListeners.forEach(cb => {
      try { cb(event); } catch (e) { console.error('[Storage] Listener error:', e); }
    });
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

    await window.IndexedDBCore.clear(STORES.STREAMS);
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
    return window.SyncManager;
  },

  /**
   * Get current sync strategy
   * @returns {SyncStrategy}
   */
  getSyncStrategy() {
    return window.SyncManager?.getStrategy() || null;
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

// Make available globally for backwards compatibility during migration
if (typeof window !== 'undefined') {
  window.Storage = Storage;
}

console.log('[Storage] Facade loaded - delegates to IndexedDBCore, ConfigAPI, StorageMigration');
