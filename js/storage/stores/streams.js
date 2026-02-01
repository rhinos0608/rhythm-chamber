/**
 * Streams Store Module
 *
 * Handles CRUD operations for Spotify streaming history.
 * All streams are stored under a single 'all' key.
 *
 * @module storage/stores/streams
 */

import { IndexedDBCore } from '../indexeddb.js';
import { assertWriteAllowed } from '../security.js';
import { queuedOperation } from '../operations/queue.js';
import { STORES } from './registry.js';

/**
 * Save all streams to storage
 * @param {Array} streams - Array of stream objects
 * @returns {Promise<IDBValidKey>} Storage key
 */
export async function saveStreams(streams) {
    assertWriteAllowed('saveStreams');
    return queuedOperation(async () => {
        const result = await IndexedDBCore.put(STORES.STREAMS, {
            id: 'all',
            data: streams,
            savedAt: new Date().toISOString(),
        });
        return result;
    }, true);
}

/**
 * Get all streams from storage
 * @returns {Promise<Array|null>} Streams array or null if not found
 */
export async function getStreams() {
    const result = await IndexedDBCore.get(STORES.STREAMS, 'all');
    return result?.data || null;
}

/**
 * Append new streams to existing ones using atomic update
 * @param {Array} newStreams - New streams to append
 * @returns {Promise<Object>} Updated streams document
 */
export async function appendStreams(newStreams) {
    assertWriteAllowed('appendStreams');
    return queuedOperation(async () => {
        const result = await IndexedDBCore.atomicUpdate(STORES.STREAMS, 'all', currentValue => {
            const existing = currentValue?.data || [];
            const merged = [...existing, ...newStreams];
            return {
                id: 'all',
                data: merged,
                savedAt: new Date().toISOString(),
            };
        });
        return result;
    }, true);
}

/**
 * Clear all streams from storage
 * @returns {Promise<void>}
 */
export async function clearStreams() {
    assertWriteAllowed('clearStreams');
    return queuedOperation(async () => {
        await IndexedDBCore.clear(STORES.STREAMS);
    }, true);
}

/**
 * Check if streams exist in storage
 * @returns {Promise<boolean>} True if streams exist and are non-empty
 */
export async function hasStreams() {
    const streams = await getStreams();
    return streams !== null && streams.length > 0;
}

/**
 * Get stream count
 * @returns {Promise<number>} Number of streams
 */
export async function getStreamCount() {
    const streams = await getStreams();
    return streams ? streams.length : 0;
}

/**
 * Get data hash for streams (count + timestamp range)
 * Useful for detecting changes without loading full data
 * @returns {Promise<string|null>} Hash string or null if no streams
 */
export async function getStreamsHash() {
    const streams = await getStreams();
    if (!streams || streams.length === 0) return null;

    const count = streams.length;
    const firstTs = streams[0]?.ts || '';
    const lastTs = streams[streams.length - 1]?.ts || '';
    return `${count}-${firstTs.slice(0, 10)}-${lastTs.slice(0, 10)}`;
}
