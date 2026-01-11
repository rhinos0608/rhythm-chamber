/**
 * IndexedDB Storage Module
 * Handles all local data persistence
 */

const DB_NAME = 'rhythm-chamber';
const DB_VERSION = 1;

const STORES = {
  STREAMS: 'streams',
  CHUNKS: 'chunks',
  EMBEDDINGS: 'embeddings',
  PERSONALITY: 'personality',
  SETTINGS: 'settings'
};

let db = null;

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
    return put(STORES.STREAMS, { id: 'all', data: streams, savedAt: new Date().toISOString() });
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
    return this.saveStreams(merged);
  },

  /**
   * Clear only streams (for fresh parsing)
   */
  async clearStreams() {
    return clear(STORES.STREAMS);
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

  // Utility
  clear: clearAll,

  async hasData() {
    const streams = await this.getStreams();
    return streams !== null && streams.length > 0;
  }
};

// Make available globally
window.Storage = Storage;
