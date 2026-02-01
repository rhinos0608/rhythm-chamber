/**
 * Storage Stores Public API
 *
 * Re-exports all store modules for backward compatibility.
 * This provides a unified entry point for all storage operations.
 *
 * @module storage/stores
 */

// Store Registry
export {
    STORES,
    isValidStore,
    getAllStoreNames,
    supportsTransactions,
    getStoreMetadata,
} from './registry.js';

// Streams Store
export {
    saveStreams,
    getStreams,
    appendStreams,
    clearStreams,
    hasStreams,
    getStreamCount,
    getStreamsHash,
} from './streams.js';

// Chunks Store
export {
    saveChunks,
    getChunks,
    getChunk,
    saveChunk,
    deleteChunk,
    clearChunks,
    getChunkCount,
    hasChunks,
    getChunksByStream,
} from './chunks.js';

// Sessions Store
export {
    saveSession,
    getSession,
    getAllSessions,
    deleteSession,
    getSessionCount,
    clearAllSessions,
    clearExpiredSessions,
    getSessionsByDateRange,
    searchSessions,
} from './sessions.js';

// Artifacts Store
export {
    savePersonality,
    getPersonality,
    clearPersonality,
    saveSetting,
    getSetting,
    getAllSettings,
    removeSetting,
    clearAllSettings,
    saveEmbeddings,
    getEmbeddings,
    clearEmbeddings,
    getEmbeddingCount,
    saveArtifact,
    getArtifact,
} from './artifacts.js';
