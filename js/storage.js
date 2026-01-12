/**
 * IndexedDB Storage Module
 * Handles all local data persistence
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

let db = null;

// Event listener registry for storage updates
const updateListeners = [];

/**
 * Initialize the database
 */
async function initDB() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      db = request.result;
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
    const result = await put(STORES.STREAMS, { id: 'all', data: streams, savedAt: new Date().toISOString() });
    // Notify listeners of update
    this._notifyUpdate('streams', streams.length);
    return result;
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
    const existing = await this.getStreams() || [];
    const merged = [...existing, ...newStreams];
    const result = await put(STORES.STREAMS, { id: 'all', data: merged, savedAt: new Date().toISOString() });
    // Notify listeners of update
    this._notifyUpdate('streams', merged.length);
    return result;
  },

  /**
   * Clear only streams (for fresh parsing)
   */
  async clearStreams() {
    const result = await clear(STORES.STREAMS);
    this._notifyUpdate('streams', 0);
    return result;
  },

  // Chunks
  async saveChunks(chunks) {
    for (const chunk of chunks) {
      await put(STORES.CHUNKS, chunk);
    }
  },

  async getChunks() {
    return getAll(STORES.CHUNKS);
  },

  // Personality
  async savePersonality(personality) {
    return put(STORES.PERSONALITY, { id: 'result', ...personality, savedAt: new Date().toISOString() });
  },

  async getPersonality() {
    return get(STORES.PERSONALITY, 'result');
  },

  // Settings
  async saveSetting(key, value) {
    return put(STORES.SETTINGS, { key, value });
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
  }
};

// Make available globally
window.Storage = Storage;
