/**
 * Artifacts Store Module
 *
 * Handles CRUD operations for analysis artifacts (personality, embeddings, etc.).
 * Artifacts are processed results from raw streaming data.
 *
 * @module storage/stores/artifacts
 */

import { IndexedDBCore } from '../indexeddb.js';
import { queuedOperation } from '../operations/queue.js';
import { STORES } from './registry.js';

// ==========================================
// Personality Artifacts
// ==========================================

/**
 * Save personality analysis result
 * @param {Object} personality - Personality analysis data
 * @returns {Promise<IDBValidKey>} Storage key
 */
export async function savePersonality(personality) {
    return queuedOperation(async () => {
        return IndexedDBCore.put(STORES.PERSONALITY, {
            id: 'result',
            ...personality,
            savedAt: new Date().toISOString(),
        });
    }, true);
}

/**
 * Get personality analysis result
 * @returns {Promise<Object|null>} Personality data or null
 */
export async function getPersonality() {
    return IndexedDBCore.get(STORES.PERSONALITY, 'result');
}

/**
 * Delete personality analysis result
 * @returns {Promise<void>}
 */
export async function clearPersonality() {
    await IndexedDBCore.delete(STORES.PERSONALITY, 'result');
}

// ==========================================
// Settings Artifacts
// ==========================================

/**
 * Save a single setting
 * @param {string} key - Setting key
 * @param {*} value - Setting value
 * @returns {Promise<IDBValidKey>} Storage key
 */
export async function saveSetting(key, value) {
    return queuedOperation(async () => {
        return IndexedDBCore.put(STORES.SETTINGS, { key, value });
    });
}

/**
 * Get a single setting
 * @param {string} key - Setting key
 * @returns {Promise<*>} Setting value or undefined
 */
export async function getSetting(key) {
    const result = await IndexedDBCore.get(STORES.SETTINGS, key);
    return result?.value;
}

/**
 * Get all settings
 * @returns {Promise<Array>} Array of setting objects {key, value}
 */
export async function getAllSettings() {
    return IndexedDBCore.getAll(STORES.SETTINGS);
}

/**
 * Delete a setting
 * @param {string} key - Setting key
 * @returns {Promise<void>}
 */
export async function removeSetting(key) {
    await IndexedDBCore.delete(STORES.SETTINGS, key);
}

/**
 * Clear all settings
 * @returns {Promise<void>}
 */
export async function clearAllSettings() {
    await IndexedDBCore.clear(STORES.SETTINGS);
}

// ==========================================
// Embeddings Artifacts
// ==========================================

/**
 * Save embeddings (used by RAG system)
 * @param {Array} embeddings - Array of embedding vectors
 * @returns {Promise<void>}
 */
export async function saveEmbeddings(embeddings) {
    return queuedOperation(async () => {
        await IndexedDBCore.transaction(STORES.EMBEDDINGS, 'readwrite', store => {
            for (const embedding of embeddings) {
                store.put(embedding);
            }
        });
    }, true);
}

/**
 * Get all embeddings
 * @returns {Promise<Array>} Array of embeddings
 */
export async function getEmbeddings() {
    return IndexedDBCore.getAll(STORES.EMBEDDINGS);
}

/**
 * Clear all embeddings
 * @returns {Promise<void>}
 */
export async function clearEmbeddings() {
    await IndexedDBCore.clear(STORES.EMBEDDINGS);
}

/**
 * Get embedding count
 * @returns {Promise<number>} Number of embeddings
 */
export async function getEmbeddingCount() {
    return IndexedDBCore.count(STORES.EMBEDDINGS);
}

// ==========================================
// Generic Artifact Operations
// ==========================================

/**
 * Save any artifact by type
 * @param {string} type - Artifact type (personality, etc.)
 * @param {Object} artifact - Artifact data
 * @returns {Promise<IDBValidKey>} Storage key
 */
export async function saveArtifact(type, artifact) {
    const storeMap = {
        personality: STORES.PERSONALITY,
        embeddings: STORES.EMBEDDINGS,
    };

    const storeName = storeMap[type];
    if (!storeName) {
        throw new Error(`Unknown artifact type: ${type}`);
    }

    return queuedOperation(async () => {
        return IndexedDBCore.put(storeName, artifact);
    }, true);
}

/**
 * Get any artifact by type
 * @param {string} type - Artifact type
 * @param {string|number} id - Artifact ID (default: 'result' for personality)
 * @returns {Promise<Object|null>} Artifact data or null
 */
export async function getArtifact(type, id = 'result') {
    const storeMap = {
        personality: STORES.PERSONALITY,
        embeddings: STORES.EMBEDDINGS,
    };

    const storeName = storeMap[type];
    if (!storeName) {
        throw new Error(`Unknown artifact type: ${type}`);
    }

    return IndexedDBCore.get(storeName, id);
}
