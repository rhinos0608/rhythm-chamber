/**
 * Chunks Store Module
 *
 * Handles CRUD operations for text chunks used in RAG (Retrieval-Augmented Generation).
 * Chunks are pieces of streaming history that have been processed for semantic search.
 *
 * @module storage/stores/chunks
 */

import { IndexedDBCore } from '../indexeddb.js';
import { queuedOperation } from '../operations/queue.js';
import { STORES } from './registry.js';

/**
 * Save multiple chunks to storage
 * Uses transaction for atomic batch insert
 * @param {Array} chunks - Array of chunk objects
 * @returns {Promise<void>}
 */
export async function saveChunks(chunks) {
    return queuedOperation(async () => {
        await IndexedDBCore.transaction(STORES.CHUNKS, 'readwrite', (store) => {
            for (const chunk of chunks) {
                store.put(chunk);
            }
        });
    }, true);
}

/**
 * Get all chunks from storage
 * @returns {Promise<Array>} Array of all chunks
 */
export async function getChunks() {
    return IndexedDBCore.getAll(STORES.CHUNKS);
}

/**
 * Get a single chunk by ID
 * @param {string|number} chunkId - Chunk ID
 * @returns {Promise<Object|null>} Chunk object or null
 */
export async function getChunk(chunkId) {
    return IndexedDBCore.get(STORES.CHUNKS, chunkId);
}

/**
 * Save a single chunk
 * @param {Object} chunk - Chunk object
 * @returns {Promise<IDBValidKey>} Storage key
 */
export async function saveChunk(chunk) {
    return queuedOperation(async () => {
        return IndexedDBCore.put(STORES.CHUNKS, chunk);
    });
}

/**
 * Delete a chunk by ID
 * @param {string|number} chunkId - Chunk ID
 * @returns {Promise<void>}
 */
export async function deleteChunk(chunkId) {
    return IndexedDBCore.delete(STORES.CHUNKS, chunkId);
}

/**
 * Clear all chunks from storage
 * @returns {Promise<void>}
 */
export async function clearChunks() {
    return queuedOperation(async () => {
        await IndexedDBCore.clear(STORES.CHUNKS);
    }, true);
}

/**
 * Get chunk count
 * @returns {Promise<number>} Number of chunks
 */
export async function getChunkCount() {
    return IndexedDBCore.count(STORES.CHUNKS);
}

/**
 * Check if chunks exist in storage
 * @returns {Promise<boolean>} True if chunks exist and are non-empty
 */
export async function hasChunks() {
    const count = await getChunkCount();
    return count > 0;
}

/**
 * Get chunks by stream ID (if chunks have streamId property)
 * Uses IndexedDB index for efficient filtering (V7 migration)
 * @param {string} streamId - Stream ID to filter by
 * @returns {Promise<Array>} Array of chunks for the stream
 */
export async function getChunksByStream(streamId) {
    // Use indexed query for better performance
    // Requires V7 migration which adds streamId index
    const db = await IndexedDBCore.getConnection();
    const tx = db.transaction(['CHUNKS'], 'readonly');
    const store = tx.objectStore('CHUNKS');
    const index = store.index('streamId');
    const request = index.getAll(streamId);

    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
            // Fallback to full scan for databases without the index
            // This maintains backward compatibility with older databases
            console.warn('[Chunks] Index query failed, falling back to full scan:', request.error?.message);
            getChunks().then(chunks => {
                resolve(chunks.filter(chunk => chunk.streamId === streamId));
            }).catch(reject);
        };
    });
}
