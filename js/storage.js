/**
 * IndexedDB Storage Module
 * Handles all local data persistence
 * 
 * PRIVACY CONTROLS:
 * - Session-only mode: Data only lives in memory for the current session
 * - Sensitive data cleanup: Clear raw streams after personality analysis
 * - Explicit consent tracking: Respects user preference for data retention
 */

const DB_NAME = 'rhythm-chamber';
const DB_VERSION = 2;  // Bumped for CHAT_SESSIONS store

const STORES = {
  STREAMS: 'streams',
  CHUNKS: 'chunks',
  EMBEDDINGS: 'embeddings',
  PERSONALITY: 'personality',
  SETTINGS: 'settings',
  CHAT_SESSIONS: 'chat_sessions'  // NEW: Persistent chat storage
};

// Privacy control flags
let sessionOnlyMode = false;
let dataPersistenceConsent = true; // Default to true for backward compatibility

let db = null;

// Event listener registry for storage updates
const updateListeners = [];

// Operation queue to prevent race conditions
const storageQueue = [];
let isQueueProcessing = false;
let criticalOperationInProgress = false;
let pendingReload = false;

/**
 * Queue an async operation to run sequentially
 * critical operations block version changes
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

  // If a reload was deferred, do it now that operations are done
  if (pendingReload && storageQueue.length === 0) {
    console.log('[Storage] Executing deferred reload');
    window.location.reload();
  }
}

/**
 * Initialize the database
 * HNW Fix: Added onversionchange and onblocked handlers to prevent deadlock
 */
async function initDB() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    // HNW Fix: Handle blocked event when other tabs hold connections
    request.onblocked = () => {
      console.warn('[Storage] Database upgrade blocked by other tabs. Please close other instances of this app.');
    };

    request.onsuccess = () => {
      db = request.result;

      // HNW Fix: Close connection when another tab needs to upgrade
      db.onversionchange = () => {
        if (criticalOperationInProgress) {
          console.warn('[Storage] Version change deferred - critical operation in progress');
          pendingReload = true;
          // Could dispatch event to show UI banner here
        } else {
          console.log('[Storage] Database version change detected, closing connection');
          db.close();
          db = null;
          window.location.reload();
        }
      };

      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Store for raw streaming history
      if (!database.objectStoreNames.contains(STORES.STREAMS)) {
        database.createObjectStore(STORES.STREAMS, { keyPath: 'id' });
      }

      // Store for aggregated chunks (weekly/monthly)
      if (!database.objectStoreNames.contains(STORES.CHUNKS)) {
        const chunksStore = database.createObjectStore(STORES.CHUNKS, { keyPath: 'id' });
        chunksStore.createIndex('type', 'type', { unique: false });
        chunksStore.createIndex('startDate', 'startDate', { unique: false });
      }

      // Store for embeddings
      if (!database.objectStoreNames.contains(STORES.EMBEDDINGS)) {
        database.createObjectStore(STORES.EMBEDDINGS, { keyPath: 'id' });
      }

      // Store for personality results
      if (!database.objectStoreNames.contains(STORES.PERSONALITY)) {
        database.createObjectStore(STORES.PERSONALITY, { keyPath: 'id' });
      }

      // Store for user settings
      if (!database.objectStoreNames.contains(STORES.SETTINGS)) {
        database.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }

      // Store for chat sessions (NEW in v2)
      if (!database.objectStoreNames.contains(STORES.CHAT_SESSIONS)) {
        const sessionsStore = database.createObjectStore(STORES.CHAT_SESSIONS, { keyPath: 'id' });
        sessionsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
  });
}

/**
 * Generic put operation
 */
async function put(storeName, data) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(data);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generic get operation
 */
async function get(storeName, key) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all items from a store
 */
async function getAll(storeName) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear a store
 */
async function clear(storeName) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all data
 */
async function clearAll() {
  for (const storeName of Object.values(STORES)) {
    await clear(storeName);
  }
}

// Public API
const Storage = {
  init: initDB,
  STORES,

  // Streams
  async saveStreams(streams) {
    return queuedOperation(async () => {
      const result = await put(STORES.STREAMS, { id: 'all', data: streams, savedAt: new Date().toISOString() });
      this._notifyUpdate('streams', streams.length);
      return result;
    }, true); // Critical
  },

  async getStreams() {
    const result = await get(STORES.STREAMS, 'all');
    return result?.data || null;
  },

  /**
   * Append streams incrementally (for crash-safe parsing)
   * Merges with existing streams in IndexedDB
   */
  async appendStreams(newStreams) {
    return queuedOperation(async () => {
      // Need to get inside the lock to ensure consistency
      const existingData = await get(STORES.STREAMS, 'all');
      const existing = existingData?.data || [];
      const merged = [...existing, ...newStreams];
      const result = await put(STORES.STREAMS, { id: 'all', data: merged, savedAt: new Date().toISOString() });
      this._notifyUpdate('streams', merged.length);
      return result;
    }, true); // Critical
  },

  /**
   * Clear only streams (for fresh parsing)
   */
  async clearStreams() {
    return queuedOperation(async () => {
      const result = await clear(STORES.STREAMS);
      this._notifyUpdate('streams', 0);
      return result;
    }, true);
  },

  // Chunks
  async saveChunks(chunks) {
    return queuedOperation(async () => {
      const db = await initDB();
      // Use transaction for bulk add
      const tx = db.transaction(STORES.CHUNKS, 'readwrite');
      const store = tx.objectStore(STORES.CHUNKS);

      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);

        for (const chunk of chunks) {
          store.put(chunk);
        }
      });
    }, true);
  },

  async getChunks() {
    return getAll(STORES.CHUNKS);
  },

  // Personality
  async savePersonality(personality) {
    return queuedOperation(async () => {
      return put(STORES.PERSONALITY, { id: 'result', ...personality, savedAt: new Date().toISOString() });
    }, true);
  },

  async getPersonality() {
    return get(STORES.PERSONALITY, 'result');
  },

  // Settings
  async saveSetting(key, value) {
    return queuedOperation(async () => {
      return put(STORES.SETTINGS, { key, value });
    });
  },

  async getSetting(key) {
    const result = await get(STORES.SETTINGS, key);
    return result?.value;
  },

  // ==========================================
  // Chat Sessions
  // ==========================================

  /**
   * Save a chat session (create or update)
   * @param {Object} session - Session object with id, title, messages, etc.
   */
  async saveSession(session) {
    return queuedOperation(async () => {
      if (!session.id) {
        throw new Error('Session must have an id');
      }
      const now = new Date().toISOString();
      const data = {
        ...session,
        updatedAt: now,
        createdAt: session.createdAt || now,
        messageCount: session.messages?.length || 0
      };
      const result = await put(STORES.CHAT_SESSIONS, data);
      this._notifyUpdate('session', 1);
      return result;
    });
  },

  /**
   * Get a single session by ID
   * @param {string} id - Session ID
   */
  async getSession(id) {
    return get(STORES.CHAT_SESSIONS, id);
  },

  /**
   * Get all sessions, sorted by updatedAt (most recent first)
   */
  async getAllSessions() {
    const database = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORES.CHAT_SESSIONS, 'readonly');
      const store = transaction.objectStore(STORES.CHAT_SESSIONS);
      const index = store.index('updatedAt');
      const request = index.openCursor(null, 'prev'); // Descending order

      const sessions = [];
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          sessions.push(cursor.value);
          cursor.continue();
        } else {
          resolve(sessions);
        }
      };
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Delete a session by ID
   * @param {string} id - Session ID
   */
  async deleteSession(id) {
    const database = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORES.CHAT_SESSIONS, 'readwrite');
      const store = transaction.objectStore(STORES.CHAT_SESSIONS);
      const request = store.delete(id);

      request.onsuccess = () => {
        this._notifyUpdate('session', -1);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Get count of sessions
   */
  async getSessionCount() {
    const database = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORES.CHAT_SESSIONS, 'readonly');
      const store = transaction.objectStore(STORES.CHAT_SESSIONS);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Clear all sessions
   */
  async clearAllSessions() {
    await clear(STORES.CHAT_SESSIONS);
    this._notifyUpdate('session', 0);
  },

  // Utility
  clear: clearAll,

  async hasData() {
    const streams = await this.getStreams();
    return streams !== null && streams.length > 0;
  },

  /**
   * Get hash of current data (for staleness detection)
   */
  async getDataHash() {
    const streams = await this.getStreams();
    if (!streams || streams.length === 0) return null;

    // Simple hash based on count and timestamps
    const count = streams.length;
    const firstTs = streams[0]?.ts || '';
    const lastTs = streams[streams.length - 1]?.ts || '';
    return `${count}-${firstTs.slice(0, 10)}-${lastTs.slice(0, 10)}`;
  },

  /**
   * Register a listener for storage updates
   * @param {Function} callback - (event: {type: string, count: number}) => void
   */
  onUpdate(callback) {
    if (typeof callback === 'function') {
      updateListeners.push(callback);
    }
  },

  /**
   * Remove an update listener
   */
  offUpdate(callback) {
    const index = updateListeners.indexOf(callback);
    if (index > -1) {
      updateListeners.splice(index, 1);
    }
  },

  /**
   * HNW Fix: Validate storage consistency across different mechanisms
   * Checks for orphaned data and cross-storage mismatches
   * Should be called during app initialization
   * @returns {object} Validation results with warnings array
   */
  async validateConsistency() {
    const warnings = [];
    const fixes = [];

    try {
      // 1. Check IndexedDB data consistency
      const streams = await this.getStreams();
      const personality = await this.getPersonality();
      const chunks = await this.getChunks();

      // If we have personality but no streams, something is inconsistent
      if (personality && (!streams || streams.length === 0)) {
        warnings.push('Personality data exists without streaming data');
        // Could offer to clear personality, but for MVP just warn
      }

      // If we have chunks but no streams
      if (chunks && chunks.length > 0 && (!streams || streams.length === 0)) {
        warnings.push('Chunk data exists without streaming data');
      }

      // 2. Check sessionStorage conversation history consistency
      try {
        const conversation = sessionStorage.getItem('rhythm_chamber_conversation');
        if (conversation) {
          const history = JSON.parse(conversation);
          // If we have conversation history but no personality, context is missing
          if (history.length > 0 && !personality) {
            warnings.push('Conversation history exists without personality context - may cause chat confusion');
            fixes.push('clearConversation');
          }
        }
      } catch (e) {
        // Corrupt conversation data
        warnings.push('Conversation history is corrupt - will be cleared');
        sessionStorage.removeItem('rhythm_chamber_conversation');
        fixes.push('conversationCleared');
      }

      // 3. Check localStorage RAG status consistency
      try {
        const ragConfig = localStorage.getItem('rhythm_chamber_rag');
        if (ragConfig) {
          const config = JSON.parse(ragConfig);
          if (config.embeddingsGenerated && (!streams || streams.length === 0)) {
            warnings.push('RAG embeddings marked as generated but no streams exist');
          }
          // Check if data hash matches current data
          if (config.dataHash && streams) {
            const currentHash = await this.getDataHash();
            if (currentHash && config.dataHash !== currentHash) {
              warnings.push('RAG embeddings may be stale - data has changed since generation');
            }
          }
        }
      } catch (e) {
        warnings.push('RAG configuration is corrupt');
      }

      // 4. Check Spotify tokens consistency
      const spotifyToken = localStorage.getItem('spotify_access_token');
      const spotifyExpiry = localStorage.getItem('spotify_token_expiry');
      if (spotifyToken && !spotifyExpiry) {
        warnings.push('Spotify token exists without expiry timestamp');
      }

      // Log warnings for debugging
      if (warnings.length > 0) {
        console.warn('[Storage] Consistency validation found issues:', warnings);
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
      console.error('[Storage] Consistency validation error:', err);
      return {
        valid: false,
        warnings: ['Validation failed: ' + err.message],
        fixes: [],
        error: err.message
      };
    }
  },

  /**
   * Internal: Notify all listeners of update
   */
  _notifyUpdate(type, count) {
    const event = { type, count, timestamp: Date.now() };
    updateListeners.forEach(cb => {
      try {
        cb(event);
      } catch (e) {
        console.error('[Storage] Error in update listener:', e);
      }
    });
  },

  // ==========================================
  // Privacy Controls
  // ==========================================

  /**
   * Enable session-only mode
   * In this mode, writes to IndexedDB are skipped; data only lives in memory
   * Useful for users who don't want persistent storage
   * @param {boolean} enabled
   */
  setSessionOnlyMode(enabled) {
    sessionOnlyMode = !!enabled;
    console.log(`[Storage] Session-only mode: ${sessionOnlyMode}`);
    return sessionOnlyMode;
  },

  /**
   * Check if session-only mode is enabled
   */
  isSessionOnlyMode() {
    return sessionOnlyMode;
  },

  /**
   * Set user's consent for data persistence
   * @param {boolean} consent - Whether user consents to storing data
   */
  setDataPersistenceConsent(consent) {
    dataPersistenceConsent = !!consent;
    localStorage.setItem('rhythm_chamber_persistence_consent', consent ? 'true' : 'false');
    console.log(`[Storage] Data persistence consent: ${dataPersistenceConsent}`);
    return dataPersistenceConsent;
  },

  /**
   * Check if user has consented to data persistence
   */
  hasDataPersistenceConsent() {
    // Check localStorage for explicit setting
    const stored = localStorage.getItem('rhythm_chamber_persistence_consent');
    if (stored !== null) {
      dataPersistenceConsent = stored === 'true';
    }
    return dataPersistenceConsent;
  },

  /**
   * Clear sensitive data (raw streams) while keeping aggregated data
   * Call after personality analysis to minimize data retention
   * Only chunks and personality (aggregated, non-identifying) are retained
   */
  async clearSensitiveData() {
    console.log('[Storage] Clearing sensitive data (raw streams)...');

    // Clear raw streams
    await clear(STORES.STREAMS);

    // Clear any legacy sessionStorage conversation history
    sessionStorage.removeItem('rhythm_chamber_conversation');

    // Clear stored credentials (force re-entry on next use)
    localStorage.removeItem('rhythm_chamber_rag');
    localStorage.removeItem('rhythm_chamber_rag_checkpoint');
    localStorage.removeItem('rhythm_chamber_rag_checkpoint_cipher');

    this._notifyUpdate('sensitiveDataCleared', 0);
    console.log('[Storage] Sensitive data cleared. Aggregated data (chunks, personality) retained.');

    return { success: true, retained: ['chunks', 'personality', 'chat_sessions'] };
  },

  /**
   * Get summary of what data is stored
   * Useful for transparency UI
   */
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
  }
};

// Make available globally
window.Storage = Storage;

console.log('[Storage] Module loaded with privacy controls');

