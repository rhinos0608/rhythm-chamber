/**
 * RAG (Retrieval-Augmented Generation) Module for Rhythm Chamber
 *
 * Handles semantic search using local browser embeddings (WASM).
 * 100% client-side with zero external dependencies.
 *
 * SECURITY FEATURES:
 * - Checkpoints encrypted with session-derived keys
 * - All processing happens locally in browser
 * - No data transmission or external API calls
 * - Incremental embedding support for efficient updates
 */

const RAG_STORAGE_KEY = 'rhythm_chamber_rag';
const RAG_CHECKPOINT_KEY = 'rhythm_chamber_rag_checkpoint';
const RAG_CHECKPOINT_CIPHER_KEY = 'rhythm_chamber_rag_checkpoint_cipher';

// Local embedding constants
const LOCAL_EMBEDDING_DIMENSIONS = 384; // all-MiniLM-L6-v2 output dimension

// Import ModuleRegistry for accessing dynamically loaded modules
import { ModuleRegistry } from './module-registry.js';
import { Patterns } from './patterns.js';
import { Storage } from './storage.js';
import { Security } from './security/index.js';
import { OperationLock } from './operation-lock.js';
import { safeJsonParse } from './utils/safe-json.js';

// EmbeddingWorker instance (lazy-loaded)
let embeddingWorker = null;

// Track pending worker requests to prevent race conditions from multiple concurrent calls
const pendingWorkerRequests = new Map();

/**
 * Get or create the EmbeddingWorker instance
 * Lazy-loads the worker to avoid blocking page load
 * @returns {Worker|null} Worker instance or null if not supported
 */
function getEmbeddingWorker() {
    if (embeddingWorker) return embeddingWorker;

    if (typeof Worker === 'undefined') {
        console.warn('[RAG] Web Workers not supported, falling back to main thread');
        return null;
    }

    try {
        embeddingWorker = new Worker('js/embedding-worker.js');
        console.log('[RAG] EmbeddingWorker initialized');

        // Set up error handler for cleanup
        embeddingWorker.onerror = (error) => {
            console.warn('[RAG] EmbeddingWorker error:', error.message);
            cleanupEmbeddingWorker();
        };

        return embeddingWorker;
    } catch (err) {
        console.warn('[RAG] Failed to create EmbeddingWorker:', err.message);
        return null;
    }
}

/**
 * Clean up the EmbeddingWorker instance
 * Should be called when worker is no longer needed or on page unload
 * @returns {boolean} True if worker was cleaned up
 */
function cleanupEmbeddingWorker() {
    if (!embeddingWorker) {
        return false;
    }

    try {
        // Reject all pending requests before cleanup
        for (const [requestId, pending] of pendingWorkerRequests.entries()) {
            clearTimeout(pending.timeoutId);
            pending.reject(new Error('Worker cleaned up before completion'));
        }
        pendingWorkerRequests.clear();

        embeddingWorker.onmessage = null;
        embeddingWorker.onerror = null;
        embeddingWorker.terminate();
        embeddingWorker = null;
        console.log('[RAG] EmbeddingWorker cleaned up');
        return true;
    } catch (err) {
        console.warn('[RAG] Error during EmbeddingWorker cleanup:', err.message);
        embeddingWorker = null;
        return false;
    }
}

/**
 * Create chunks using the worker (off-thread) or fallback to main thread
 * @param {Array} streams - Streaming data
 * @param {Function} onProgress - Progress callback (current, total, message)
 * @returns {Promise<Array>} Chunks for embedding
 */
async function createChunksWithWorker(streams, onProgress = () => { }) {
    const worker = getEmbeddingWorker();

    // Fallback to main thread if worker not available
    // Uses async version with batching to prevent UI freeze
    if (!worker) {
        onProgress(0, 100, 'Creating chunks (main thread - async fallback)...');
        return await createChunks(streams, onProgress);
    }

    // Generate unique request ID for this call
    const requestId = `chunks_${Date.now()}_${Math.random().toString(36)}`;

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            pendingWorkerRequests.delete(requestId);
            reject(new Error('Worker timed out after 120 seconds'));
        }, 120000);

        // Store the request's resolve/reject handlers
        pendingWorkerRequests.set(requestId, { resolve, reject, onProgress, timeoutId });

        // Set up message handler ONCE at module initialization to prevent race conditions
        if (!worker._chunksHandlerSetup) {
            worker.onmessage = (event) => {
                const { type, requestId: rid, current, total, message, chunks } = event.data;
                const pending = pendingWorkerRequests.get(rid);
                if (!pending) return;

                switch (type) {
                    case 'progress':
                        pending.onProgress(current, total, message);
                        break;
                    case 'complete':
                        clearTimeout(pending.timeoutId);
                        pendingWorkerRequests.delete(rid);
                        pending.resolve(chunks);
                        break;
                    case 'error':
                        clearTimeout(pending.timeoutId);
                        pendingWorkerRequests.delete(rid);
                        pending.reject(new Error(message || 'Worker error'));
                        break;
                }
            };
            worker._chunksHandlerSetup = true;
        }

        // Capture the original error handler before assigning new one
        const originalOnError = worker.onerror;

        worker.onerror = async (error) => {
            clearTimeout(timeoutId);
            console.warn('[RAG] Worker error, falling back to async main thread:', error.message);

            // CRITICAL: Disable the onmessage handler to prevent duplicate resolution
            worker.onmessage = null;

            // Fallback to async main thread version
            try {
                const chunks = await createChunks(streams, onProgress);
                // Call cleanup after successful fallback
                cleanupEmbeddingWorker();
                resolve(chunks);
            } catch (fallbackError) {
                // Call cleanup after failed fallback
                cleanupEmbeddingWorker();
                reject(fallbackError);
            }

            // Invoke the original error handler if it existed
            if (originalOnError && typeof originalOnError === 'function') {
                try {
                    originalOnError.call(worker, error);
                } catch (handlerError) {
                    console.warn('[RAG] Original error handler failed:', handlerError.message);
                }
            }
        };

        // Send streams to worker with requestId
        worker.postMessage({ type: 'createChunks', streams, requestId });
    });
}

// ==========================================
// Storage Mode Detection
// HNW Hierarchy: Local-only mode (WASM-only architecture)
// ==========================================

/**
 * Get current storage mode (always 'local' in WASM-only architecture)
 * @returns {string} Always returns 'local'
 */
function getStorageMode() {
    return 'local';
}

/**
 * Check if using local vector storage mode (always true)
 * @returns {boolean} Always returns true
 */
function isLocalMode() {
    return true;
}

/**
 * Check if local embeddings are available in this browser
 * @returns {Promise<{supported: boolean, reason?: string}>}
 */
async function checkLocalSupport() {
    // Load on-demand if not available
    let LocalEmbeddings = ModuleRegistry.getModuleSync('LocalEmbeddings');

    if (!LocalEmbeddings) {
        await ModuleRegistry.preloadModules(['LocalEmbeddings']);
        LocalEmbeddings = await ModuleRegistry.getModule('LocalEmbeddings');
    }

    if (!LocalEmbeddings?.isSupported) {
        return { supported: false, reason: 'LocalEmbeddings module not loaded' };
    }
    return await LocalEmbeddings.isSupported();
}



/**
 * Get RAG configuration
 * Uses unified storage API with localStorage fallback
 * Returns null if config doesn't exist
 */
async function getConfig() {
    try {
        // Try unified storage first (IndexedDB after migration)
        let config = {};
        if (Storage.getConfig) {
            const storedConfig = await Storage.getConfig(RAG_STORAGE_KEY);
            if (storedConfig) {
                config = storedConfig;
            }
        }

        // Fallback to localStorage (pre-migration or if IndexedDB unavailable)
        // SECURITY: Use safeJsonParse to prevent DoS from malformed JSON
        if (!config || Object.keys(config).length === 0) {
            const stored = localStorage.getItem(RAG_STORAGE_KEY);
            config = safeJsonParse(stored, {});
        }

        return Object.keys(config).length > 0 ? config : null;
    } catch (e) {
        console.error('[RAG] Failed to get config:', e);
        return null;
    }
}


/**
 * Save RAG configuration
 * Uses unified storage API with localStorage fallback
 */
async function saveConfig(config) {
    const nonSensitive = {
        embeddingsGenerated: config.embeddingsGenerated,
        chunksCount: config.chunksCount,
        generatedAt: config.generatedAt,
        dataHash: config.dataHash,
        storageMode: config.storageMode || 'local',
        updatedAt: new Date().toISOString()
    };

    // Store in unified storage (IndexedDB) FIRST - wait for completion
    if (Storage.setConfig) {
        try {
            await Storage.setConfig(RAG_STORAGE_KEY, nonSensitive);
        } catch (e) {
            console.warn('[RAG] Failed to save to unified storage:', e);
            // Continue to localStorage fallback on error
        }
    }
    // Then save to localStorage as sync fallback - AFTER IndexedDB completes
    // This ensures no race condition between the two storage operations
    try {
        localStorage.setItem(RAG_STORAGE_KEY, JSON.stringify(nonSensitive));
    } catch (e) {
        console.warn('[RAG] Failed to save to localStorage fallback:', e);
    }
}



/**
 * Get RAG configuration synchronously (for UI checks)
 * Uses localStorage directly - doesn't include encrypted credentials
 * For full config with credentials, use async getConfig()
 */
function getConfigSync() {
    try {
        const stored = localStorage.getItem(RAG_STORAGE_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch (e) {
        return null;
    }
}

/**
 * Check if RAG is fully configured and ready (SYNC version)
 * Note: Uses localStorage, so credentials may not be fully checked
 */
function isConfigured() {
    const config = getConfigSync();
    return !!(config?.embeddingsGenerated);
}

/**
 * Check if credentials are configured (SYNC version)
 * In WASM-only architecture, always returns false
 * @returns {boolean} Always returns false
 */
function hasCredentials() {
    return false;
}

/**
 * Check if embeddings are stale (data changed since generation)
 * ASYNC - needs to fetch data hash
 */
async function isStale() {
    const config = await getConfig();
    if (!config?.embeddingsGenerated || !config?.dataHash) {
        return true;
    }

    const currentHash = await Storage.getDataHash?.();
    return currentHash !== config.dataHash;
}


/**
 * Get checkpoint for resume
 * Decrypts dataHash if encrypted. Uses unified storage with fallback.
 */
async function getCheckpoint() {
    try {
        // Try unified storage first (IndexedDB)
        if (Storage.getConfig) {
            const cipher = await Storage.getConfig(RAG_CHECKPOINT_CIPHER_KEY);
            if (cipher && Security.decryptData) {
                try {
                    // Note: Uses Security.getSessionKey (legacy Encryption.getSessionKey)
                    // For new code, use Security.getSessionKeyKM for KeyManager's non-extractable key
                    const sessionKey = await Security.getSessionKey();
                    const decrypted = await Security.decryptData(cipher, sessionKey);
                    if (decrypted) {
                        return JSON.parse(decrypted);
                    }
                } catch (decryptErr) {
                    console.warn('[RAG] Checkpoint decryption failed (session changed?)');
                }
            }

            // Check for unencrypted checkpoint in unified storage
            const plainCheckpoint = await Storage.getConfig(RAG_CHECKPOINT_KEY);
            if (plainCheckpoint) {
                return plainCheckpoint;
            }
        }

        // Fallback to localStorage
        const cipher = localStorage.getItem(RAG_CHECKPOINT_CIPHER_KEY);
        if (cipher && Security.decryptData) {
            try {
                const sessionKey = await Security.getSessionKey();
                const decrypted = await Security.decryptData(cipher, sessionKey);
                if (decrypted) {
                    return JSON.parse(decrypted);
                }
            } catch (decryptErr) {
                console.warn('[RAG] Checkpoint decryption failed (session changed?)');
            }
        }

        // Fallback to legacy unencrypted checkpoint in localStorage
        const stored = localStorage.getItem(RAG_CHECKPOINT_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch (e) {
        console.error('[RAG] Failed to get checkpoint:', e);
        return null;
    }
}

/**
 * Save checkpoint for resume
 * Encrypts with session key for security. Uses unified storage with fallback.
 */
async function saveCheckpoint(data) {
    const checkpoint = {
        ...data,
        timestamp: Date.now()
    };

    // Try to encrypt checkpoint
    if (Security.encryptData && Security.getSessionKey) {
        try {
            // Note: Uses Security.getSessionKey (legacy Encryption.getSessionKey)
            // For new code, use Security.getSessionKeyKM for KeyManager's non-extractable key
            const sessionKey = await Security.getSessionKey();
            const encrypted = await Security.encryptData(
                JSON.stringify(checkpoint),
                sessionKey
            );

            // Save to unified storage (IndexedDB)
            if (Storage.setConfig) {
                await Storage.setConfig(RAG_CHECKPOINT_CIPHER_KEY, encrypted);
                await Storage.removeConfig(RAG_CHECKPOINT_KEY);
            }
            // Also save to localStorage as fallback
            localStorage.setItem(RAG_CHECKPOINT_CIPHER_KEY, encrypted);
            localStorage.removeItem(RAG_CHECKPOINT_KEY);
            return;
        } catch (encryptErr) {
            console.warn('[RAG] Checkpoint encryption failed, using plaintext fallback');
        }
    }

    // Fallback to unencrypted (if Security module not loaded)
    if (Storage.setConfig) {
        await Storage.setConfig(RAG_CHECKPOINT_KEY, checkpoint);
    }
    localStorage.setItem(RAG_CHECKPOINT_KEY, JSON.stringify(checkpoint));
}

/**
 * Clear checkpoint after completion
 * Clears from both unified storage and localStorage
 */
async function clearCheckpoint() {
    // Clear from unified storage
    if (Storage.removeConfig) {
        try {
            await Storage.removeConfig(RAG_CHECKPOINT_KEY);
            await Storage.removeConfig(RAG_CHECKPOINT_CIPHER_KEY);
        } catch (e) {
            console.warn('[RAG] Failed to clear checkpoint from unified storage:', e);
        }
    }
    // Also clear from localStorage
    localStorage.removeItem(RAG_CHECKPOINT_KEY);
    localStorage.removeItem(RAG_CHECKPOINT_CIPHER_KEY);
}

// ==========================================
// Incremental Embedding Support (Phase 3)
// ==========================================

/**
 * Get the embedding manifest - tracks what has been embedded
 * 
 * The manifest stores:
 * - embeddedMonths: Set of month keys (e.g., "2024-03") that have been embedded
 * - embeddedArtists: Set of artist names with their chunk hash
 * - lastEmbeddedDate: The most recent stream date that was embedded
 * - totalChunksEmbedded: Count of all chunks embedded so far
 * 
 * @returns {Object} The embedding manifest or default empty manifest
 */
async function getEmbeddingManifest() {
    const MANIFEST_KEY = 'rhythm_chamber_embedding_manifest';

    try {
        // Try unified storage first
        if (Storage.getConfig) {
            const manifest = await Storage.getConfig(MANIFEST_KEY);
            if (manifest) return manifest;
        }

        // Fallback to localStorage
        const stored = localStorage.getItem(MANIFEST_KEY);
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.warn('[RAG] Failed to get embedding manifest:', e);
    }

    // Default empty manifest
    return {
        embeddedMonths: [],
        embeddedArtists: [],
        lastEmbeddedDate: null,
        totalChunksEmbedded: 0,
        version: 1
    };
}

/**
 * Save the embedding manifest
 * 
 * @param {Object} manifest - The manifest to save
 */
async function saveEmbeddingManifest(manifest) {
    const MANIFEST_KEY = 'rhythm_chamber_embedding_manifest';

    manifest.updatedAt = Date.now();

    // Save to unified storage
    if (Storage.setConfig) {
        try {
            await Storage.setConfig(MANIFEST_KEY, manifest);
        } catch (e) {
            console.warn('[RAG] Failed to save manifest to unified storage:', e);
        }
    }

    // Also save to localStorage for fallback
    try {
        localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
    } catch (e) {
        console.warn('[RAG] Failed to save manifest to localStorage:', e);
    }
}

/**
 * Clear the embedding manifest (used during full re-embedding)
 */
async function clearEmbeddingManifest() {
    const MANIFEST_KEY = 'rhythm_chamber_embedding_manifest';

    if (Storage.removeConfig) {
        try {
            await Storage.removeConfig(MANIFEST_KEY);
        } catch (e) {
            console.warn('[RAG] Failed to clear manifest from unified storage:', e);
        }
    }
    localStorage.removeItem(MANIFEST_KEY);
}

/**
 * Detect new chunks that haven't been embedded yet
 * 
 * Compares current streams against the manifest to find:
 * - New months that haven't been summarized
 * - New artists that haven't been profiled
 * - Updated data for existing months (more plays)
 * 
 * @param {Array} streams - Current streaming data
 * @returns {Object} { newChunks, updatedMonths, summary }
 */
async function getNewChunks(streams) {
    const manifest = await getEmbeddingManifest();
    const embeddedMonthsSet = new Set(manifest.embeddedMonths || []);
    const embeddedArtistsSet = new Set(manifest.embeddedArtists || []);

    // Analyze current data
    const currentMonths = new Set();
    const currentArtists = new Map(); // artist -> play count
    let latestDate = null;

    streams.forEach(stream => {
        const date = new Date(stream.ts || stream.endTime);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const artist = stream.master_metadata_album_artist_name || stream.artistName || 'Unknown';

        currentMonths.add(monthKey);
        currentArtists.set(artist, (currentArtists.get(artist) || 0) + 1);

        if (!latestDate || date > latestDate) latestDate = date;
    });

    // Find new months
    const newMonths = [];
    currentMonths.forEach(month => {
        if (!embeddedMonthsSet.has(month)) {
            newMonths.push(month);
        }
    });

    // Find new artists (top 50 that haven't been embedded)
    const sortedArtists = [...currentArtists.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50);

    const newArtists = sortedArtists
        .filter(([artist]) => !embeddedArtistsSet.has(artist))
        .map(([artist, count]) => ({ artist, count }));

    // Calculate what chunks would be created from new data
    const newMonthChunksCount = newMonths.length; // 1 chunk per month
    const newArtistChunksCount = newArtists.length; // 1 chunk per artist
    const totalNewChunks = newMonthChunksCount + newArtistChunksCount;

    return {
        newMonths,
        newArtists,
        totalNewChunks,
        manifest,
        summary: {
            existingMonths: embeddedMonthsSet.size,
            existingArtists: embeddedArtistsSet.size,
            newMonthsCount: newMonths.length,
            newArtistsCount: newArtists.length,
            hasNewData: totalNewChunks > 0,
            latestDate: latestDate?.toISOString()
        }
    };
}

/**
 * Filter streams to only include data for incremental embedding
 * 
 * @param {Array} streams - All streaming data
 * @param {Object} incrementalInfo - Output from getNewChunks()
 * @returns {Array} Streams filtered to only new data
 */
function filterStreamsForIncremental(streams, incrementalInfo) {
    const { newMonths, newArtists } = incrementalInfo;
    const newMonthsSet = new Set(newMonths);
    const newArtistsSet = new Set(newArtists.map(a => a.artist));

    return streams.filter(stream => {
        const date = new Date(stream.ts || stream.endTime);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const artist = stream.master_metadata_album_artist_name || stream.artistName || 'Unknown';

        // Include if from a new month OR from a new artist
        return newMonthsSet.has(monthKey) || newArtistsSet.has(artist);
    });
}

/**
 * Update manifest after successful embedding
 * 
 * @param {Array} embeddedChunks - Chunks that were successfully embedded
 */
async function updateManifestAfterEmbedding(embeddedChunks) {
    const manifest = await getEmbeddingManifest();

    const monthsSet = new Set(manifest.embeddedMonths || []);
    const artistsSet = new Set(manifest.embeddedArtists || []);

    embeddedChunks.forEach(chunk => {
        if (chunk.type === 'monthly_summary' && chunk.metadata?.month) {
            monthsSet.add(chunk.metadata.month);
        } else if (chunk.type === 'artist_profile' && chunk.metadata?.artist) {
            artistsSet.add(chunk.metadata.artist);
        }
    });

    manifest.embeddedMonths = [...monthsSet];
    manifest.embeddedArtists = [...artistsSet];
    manifest.totalChunksEmbedded = (manifest.totalChunksEmbedded || 0) + embeddedChunks.length;
    manifest.lastEmbeddedAt = Date.now();

    await saveEmbeddingManifest(manifest);

    console.log(`[RAG] Updated manifest: ${monthsSet.size} months, ${artistsSet.size} artists embedded`);
}



/**
 * Search for similar vectors (routes to local store)
 *
 * @param {string} query - Search query text
 * @param {number} limit - Number of results to return
 * @param {AbortSignal} abortSignal - Optional abort signal for cancellation
 * @returns {Promise<Array>} Search results with payloads
 */
async function search(query, limit = 5, abortSignal = null) {
    // Check for cancellation
    if (abortSignal?.aborted) {
        throw new Error('Search cancelled');
    }

    // Always route to local mode in WASM-only architecture
    return searchLocal(query, limit);
}

/**
 * Generate embeddings for all streaming data chunks (local mode)
 * @param {Function} onProgress - Progress callback (current, total, message)
 * @param {object} options - Options including resume, mergeStrategy
 * @param {AbortSignal} abortSignal - Optional signal to cancel operation
 */
async function generateEmbeddings(onProgress = () => { }, options = {}, abortSignal = null) {
    // Always route to local mode in WASM-only architecture
    return generateLocalEmbeddings(onProgress, options, abortSignal);
}

/**
 * Create searchable chunks from streaming data
 * Groups data into meaningful segments for embedding
 * 
 * PERFORMANCE: This is an async function that yields to the event loop
 * between batches to prevent UI freezing when processing large histories
 * (100k+ streams). This is the fallback when Web Worker is unavailable.
 * 
 * @param {Array} streams - Streaming history data
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<Array>} Chunks for embedding
 */
async function createChunks(streams, onProgress = () => { }) {
    const chunks = [];
    const INITIAL_BATCH_SIZE = 1000; // Reduced from 5000 for better responsiveness
    const TARGET_PROCESSING_TIME_MS = 16; // Target 60fps (16ms budget)
    const MIN_BATCH_SIZE = 100; // Minimum batch size to avoid too much overhead
    const MAX_BATCH_SIZE = 5000; // Maximum batch size for efficiency

    let currentBatchSize = INITIAL_BATCH_SIZE;
    let adaptiveBatchSize = INITIAL_BATCH_SIZE;

    // Helper function for time-budget-aware processing
    const processWithBudget = async (items, processor, phaseName, progressMultiplier, baseProgress = 0) => {
        let processed = 0;
        const total = items.length;

        while (processed < total) {
            const batchStartTime = performance.now();
            const batchEnd = Math.min(processed + adaptiveBatchSize, total);
            const batch = items.slice(processed, batchEnd);

            // Process the batch
            batch.forEach(item => processor(item));

            const batchProcessingTime = performance.now() - batchStartTime;
            processed = batchEnd;

            // Adjust batch size based on actual processing time
            if (batchProcessingTime > TARGET_PROCESSING_TIME_MS) {
                // Processing took too long, reduce batch size
                adaptiveBatchSize = Math.max(MIN_BATCH_SIZE, Math.floor(adaptiveBatchSize * 0.7));
            } else if (batchProcessingTime < TARGET_PROCESSING_TIME_MS * 0.5) {
                // Processing was quick, could increase batch size
                adaptiveBatchSize = Math.min(MAX_BATCH_SIZE, Math.floor(adaptiveBatchSize * 1.3));
            }

            // Yield to event loop to maintain UI responsiveness
            if (processed < total) {
                onProgress(baseProgress + Math.round((processed / total) * progressMultiplier), 100, phaseName);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
    };

    // Phase 1: Group streams by month (with time-budget-aware yielding)
    const byMonth = {};
    await processWithBudget(streams, (stream) => {
        const date = new Date(stream.ts || stream.endTime);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!byMonth[monthKey]) byMonth[monthKey] = [];
        byMonth[monthKey].push(stream);
    }, 'Grouping by month...', 30);

    // Phase 2: Create monthly summary chunks
    const monthEntries = Object.entries(byMonth);
    for (let i = 0; i < monthEntries.length; i++) {
        const [month, monthStreams] = monthEntries[i];
        const artists = {};
        const tracks = {};
        let totalMs = 0;

        monthStreams.forEach(s => {
            const artist = s.master_metadata_album_artist_name || s.artistName || 'Unknown';
            const track = s.master_metadata_track_name || s.trackName || 'Unknown';
            const ms = s.ms_played || s.msPlayed || 0;

            artists[artist] = (artists[artist] || 0) + 1;
            tracks[`${track} by ${artist}`] = (tracks[`${track} by ${artist}`] || 0) + 1;
            totalMs += ms;
        });

        const topArtists = Object.entries(artists)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => `${name} (${count} plays)`);

        const topTracks = Object.entries(tracks)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => `${name} (${count} plays)`);

        const hours = Math.round(totalMs / 3600000 * 10) / 10;
        const [year, monthNum] = month.split('-');
        const monthName = new Date(year, monthNum - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        chunks.push({
            type: 'monthly_summary',
            text: `In ${monthName}, user listened for ${hours} hours with ${monthStreams.length} plays. Top artists: ${topArtists.join(', ')}. Top tracks: ${topTracks.join(', ')}.`,
            metadata: { month, plays: monthStreams.length, hours }
        });

        // Yield every 10 months
        if (i % 10 === 0 && i > 0) {
            onProgress(30 + Math.round((i / monthEntries.length) * 20), 100, 'Creating monthly summaries...');
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    // Phase 3: Group streams by artist (with time-budget-aware yielding)
    const byArtist = {};
    await processWithBudget(streams, (stream) => {
        const artist = stream.master_metadata_album_artist_name || stream.artistName || 'Unknown';
        if (!byArtist[artist]) byArtist[artist] = [];
        byArtist[artist].push(stream);
    }, 'Grouping by artist...', 20, 50);

    // Phase 4: Top 50 artists get individual chunks
    const topArtistEntries = Object.entries(byArtist)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 50);

    for (let i = 0; i < topArtistEntries.length; i++) {
        const [artist, artistStreams] = topArtistEntries[i];
        const tracks = {};
        let totalMs = 0;
        let firstListen = null;
        let lastListen = null;

        artistStreams.forEach(s => {
            const track = s.master_metadata_track_name || s.trackName || 'Unknown';
            const ms = s.ms_played || s.msPlayed || 0;
            const date = new Date(s.ts || s.endTime);

            tracks[track] = (tracks[track] || 0) + 1;
            totalMs += ms;

            if (!firstListen || date < firstListen) firstListen = date;
            if (!lastListen || date > lastListen) lastListen = date;
        });

        const topTracks = Object.entries(tracks)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => `${name} (${count})`);

        const hours = Math.round(totalMs / 3600000 * 10) / 10;

        chunks.push({
            type: 'artist_profile',
            text: `Artist: ${artist}. Total plays: ${artistStreams.length}. Listening time: ${hours} hours. First listened: ${firstListen?.toLocaleDateString()}. Last listened: ${lastListen?.toLocaleDateString()}. Top tracks: ${topTracks.join(', ')}.`,
            metadata: { artist, plays: artistStreams.length, hours }
        });

        // Yield every 10 artists
        if (i % 10 === 0 && i > 0) {
            onProgress(70 + Math.round((i / topArtistEntries.length) * 25), 100, 'Creating artist profiles...');
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    // Phase 5: Create pattern chunks for semantic search (RAG-Pattern Integration)
    onProgress(95, 100, 'Creating pattern embeddings...');
    try {
        const patternChunks = await createPatternChunks(streams);
        chunks.push(...patternChunks);
        console.log(`[RAG] Added ${patternChunks.length} pattern chunks for semantic search`);
    } catch (patternError) {
        console.warn('[RAG] Pattern chunk creation failed, continuing without:', patternError.message);
    }

    onProgress(100, 100, 'Chunks created');
    return chunks;
}

/**
 * Create searchable chunks from detected patterns
 * Phase 5: RAG-Pattern Integration - enables semantic search over listening patterns
 *
 * Note: Pattern detection yields to event loop to prevent UI blocking for large
 * streaming histories. Uses Promise wrapper for proper error handling.
 *
 * @param {Array} streams - Streaming history data
 * @returns {Promise<Array>} Pattern chunks for embedding
 */
async function createPatternChunks(streams) {
    const chunks = [];

    // Yield to event loop before heavy pattern detection
    await new Promise(resolve => setTimeout(resolve, 0));

    // Run pattern detection with proper error handling
    // Note: Patterns.detectAllPatterns is synchronous - we wrap it for error handling
    let patterns;
    try {
        patterns = Patterns.detectAllPatterns(streams, []);
    } catch (e) {
        console.warn('[RAG] Pattern detection failed:', e.message);
        patterns = {}; // Return empty patterns on failure
    }

    // Comfort/Discovery Pattern
    if (patterns.comfortDiscovery?.description) {
        chunks.push({
            type: 'pattern_result',
            text: `Listening Pattern: Comfort vs Discovery. ${patterns.comfortDiscovery.description}. ` +
                `Comfort ratio: ${(patterns.comfortDiscovery.comfortRatio * 100).toFixed(1)}%. ` +
                `Discovery ratio: ${(patterns.comfortDiscovery.discoveryRatio * 100).toFixed(1)}%.`,
            metadata: {
                patternType: 'comfort_discovery',
                comfortRatio: patterns.comfortDiscovery.comfortRatio,
                discoveryRatio: patterns.comfortDiscovery.discoveryRatio
            }
        });
    }

    // Ghosted Artists Pattern
    if (patterns.ghostedArtists?.ghosted?.length > 0) {
        const topGhosted = patterns.ghostedArtists.ghosted.slice(0, 10)
            .map(a => `${a.artist} (${a.plays} plays, gone since ${a.lastPlayed?.getFullYear() || 'unknown'})`)
            .join(', ');
        chunks.push({
            type: 'pattern_result',
            text: `Listening Pattern: Ghosted Artists. ${patterns.ghostedArtists.description}. ` +
                `Artists you used to play frequently but stopped: ${topGhosted}.`,
            metadata: {
                patternType: 'ghosted_artists',
                count: patterns.ghostedArtists.ghosted.length,
                artists: patterns.ghostedArtists.ghosted.slice(0, 10).map(a => a.artist)
            }
        });
    }

    // Era Detection Pattern
    if (patterns.eras?.hasEras && patterns.eras?.periods?.length > 0) {
        const erasText = patterns.eras.periods.slice(0, 5)
            .map(e => `${e.genre || 'Mixed'} era (${e.startMonth} to ${e.endMonth})`)
            .join(', ');
        chunks.push({
            type: 'pattern_result',
            text: `Listening Pattern: Musical Eras. ${patterns.eras.description}. ` +
                `Distinct listening eras detected: ${erasText}.`,
            metadata: {
                patternType: 'eras',
                eraCount: patterns.eras.periods.length,
                periods: patterns.eras.periods.slice(0, 5)
            }
        });
    }

    // Time Patterns (Mood Engineer)
    if (patterns.timePatterns?.isMoodEngineer) {
        chunks.push({
            type: 'pattern_result',
            text: `Listening Pattern: Time-Based Habits. ${patterns.timePatterns.description}. ` +
                `You are a Mood Engineer who strategically chooses music based on time of day.`,
            metadata: {
                patternType: 'time_patterns',
                isMoodEngineer: true,
                hourBreakdown: patterns.timePatterns.hourBreakdown || {}
            }
        });
    }

    // Social Patterns
    if (patterns.socialPatterns?.isSocialChameleon) {
        chunks.push({
            type: 'pattern_result',
            text: `Listening Pattern: Social Listening. ${patterns.socialPatterns.description}. ` +
                `Your listening habits adapt based on social context.`,
            metadata: {
                patternType: 'social_patterns',
                isSocialChameleon: true
            }
        });
    }

    // Discovery Explosions
    if (patterns.discoveryExplosions?.explosions?.length > 0) {
        const explosionsText = patterns.discoveryExplosions.explosions.slice(0, 5)
            .map(e => `${e.month} (${e.newArtistCount} new artists)`)
            .join(', ');
        chunks.push({
            type: 'pattern_result',
            text: `Listening Pattern: Discovery Explosions. ${patterns.discoveryExplosions.description}. ` +
                `Months with unusual spikes in new artist discovery: ${explosionsText}.`,
            metadata: {
                patternType: 'discovery_explosions',
                count: patterns.discoveryExplosions.explosions.length,
                months: patterns.discoveryExplosions.explosions.slice(0, 5).map(e => e.month)
            }
        });
    }

    // True Favorites
    if (patterns.trueFavorites?.favorites?.length > 0) {
        const favText = patterns.trueFavorites.favorites.slice(0, 10)
            .map(f => `${f.artist} (${f.plays} plays over ${f.months} months)`)
            .join(', ');
        chunks.push({
            type: 'pattern_result',
            text: `Listening Pattern: True Favorites. ${patterns.trueFavorites.description}. ` +
                `Artists you consistently return to month after month: ${favText}.`,
            metadata: {
                patternType: 'true_favorites',
                count: patterns.trueFavorites.favorites.length,
                artists: patterns.trueFavorites.favorites.slice(0, 10).map(f => f.artist)
            }
        });
    }

    // Mood Searching Pattern
    if (patterns.moodSearching?.description) {
        chunks.push({
            type: 'pattern_result',
            text: `Listening Pattern: Mood Searching. ${patterns.moodSearching.description}. ` +
                `You sometimes search for music to match or alter your mood.`,
            metadata: {
                patternType: 'mood_searching',
                isActive: patterns.moodSearching.isActive || false
            }
        });
    }

    // Overall summary as a searchable chunk
    if (patterns.summary) {
        chunks.push({
            type: 'pattern_summary',
            text: `Overall Listening Patterns Summary: ${patterns.summary}`,
            metadata: {
                patternType: 'summary',
                evidenceCount: patterns.evidence?.length || 0
            }
        });
    }

    return chunks;
}

/**
 * Clear all embeddings (local mode)
 */
async function clearEmbeddings() {
    // Always route to local mode in WASM-only architecture
    return clearLocalEmbeddings();
}

// ==========================================
// LOCAL MODE FUNCTIONS
// HNW Network: Completely isolated from Qdrant operations
// ==========================================

/**
 * Generate embeddings using local browser model
 * @param {Function} onProgress - Progress callback (current, total, message)
 * @param {object} options - Options
 * @param {AbortSignal} abortSignal - Optional signal to cancel operation
 * @returns {Promise<{success: boolean, chunksProcessed: number, mode: string}>}
 */
async function generateLocalEmbeddings(onProgress = () => { }, options = {}, abortSignal = null) {
    // Check for cancellation at start
    if (abortSignal?.aborted) {
        throw new Error('Embedding generation cancelled');
    }
    // Check if local embeddings are supported
    const support = await checkLocalSupport();
    if (!support.supported) {
        throw new Error(`Local embeddings not supported: ${support.reason || 'Browser incompatible'}`);
    }

    // HNW Hierarchy: Acquire operation lock
    let embeddingLockId = null;
    if (OperationLock) {
        try {
            embeddingLockId = await OperationLock.acquire('embedding_generation');
        } catch (lockError) {
            throw new Error(`Cannot generate embeddings: ${lockError.message}`);
        }
    }

    try {
        onProgress(0, 100, 'Initializing local embedding model (~22MB download on first use)...');

        // Get modules from ModuleRegistry - load on-demand if not available
        let LocalEmbeddings = ModuleRegistry.getModuleSync('LocalEmbeddings');
        let LocalVectorStore = ModuleRegistry.getModuleSync('LocalVectorStore');

        if (!LocalEmbeddings || !LocalVectorStore) {
            onProgress(0, 100, 'Loading embedding modules...');
            // Preload dependencies
            await ModuleRegistry.preloadModules(['LocalEmbeddings', 'LocalVectorStore']);
            LocalEmbeddings = await ModuleRegistry.getModule('LocalEmbeddings');
            LocalVectorStore = await ModuleRegistry.getModule('LocalVectorStore');

            if (!LocalEmbeddings || !LocalVectorStore) {
                throw new Error('Failed to load embedding modules. Check browser compatibility.');
            }
        }

        // Initialize LocalEmbeddings (downloads model if needed)
        await LocalEmbeddings.initialize((pct) => {
            // Model loading is 0-50% of progress
            onProgress(Math.round(pct / 2), 100, `Loading model... ${pct}%`);
        });

        onProgress(50, 100, 'Initializing local vector store...');

        // Initialize LocalVectorStore
        await LocalVectorStore.init();

        // Get streaming data
        const streams = await Storage.getStreams();
        if (!streams || streams.length === 0) {
            throw new Error('No streaming data found. Please upload your Spotify data first.');
        }

        // Create chunks from streaming data (uses worker to avoid UI jank)
        const chunks = await createChunksWithWorker(streams, onProgress);
        const totalChunks = chunks.length;

        console.log(`[RAG] Generating local embeddings for ${totalChunks} chunks...`);

        // Generate embeddings for each chunk
        for (let i = 0; i < chunks.length; i++) {
            // Check for cancellation at start of each iteration
            if (abortSignal?.aborted) {
                throw new Error('Embedding generation cancelled');
            }

            const chunk = chunks[i];

            try {
                const embedding = await LocalEmbeddings.getEmbedding(chunk.text);

                await LocalVectorStore.upsert(i + 1, embedding, {
                    text: chunk.text,
                    type: chunk.type,
                    metadata: chunk.metadata
                });

                // Embedding progress is 50-100%
                const progress = 50 + Math.round((i / totalChunks) * 50);
                onProgress(progress, 100, `Embedding ${i + 1}/${totalChunks}...`);

            } catch (err) {
                console.error(`[RAG] Failed to embed chunk ${i}:`, err);
                throw new Error(`Failed at chunk ${i + 1}: ${err.message}`);
            }
        }

        // Update config to mark embeddings as generated
        await saveConfig({
            embeddingsGenerated: true,
            storageMode: 'local',
            chunksCount: totalChunks,
            generatedAt: new Date().toISOString()
        });

        onProgress(100, 100, '✓ Local embeddings generated successfully!');

        console.log(`[RAG] Local embeddings complete: ${totalChunks} chunks stored`);

        return {
            success: true,
            chunksProcessed: totalChunks,
            mode: 'local',
            dimensions: LOCAL_EMBEDDING_DIMENSIONS
        };

    } finally {
        // HNW Hierarchy: Always release operation lock
        if (embeddingLockId && OperationLock) {
            OperationLock.release('embedding_generation', embeddingLockId);
        }
    }
}

/**
 * Search using local vector store
 * Uses async worker-based search for non-blocking UI during RAG queries
 * @param {string} query - Search query text
 * @param {number} limit - Number of results to return
 * @returns {Promise<Array>} Search results with payloads
 */
async function searchLocal(query, limit = 5) {
    // Get modules - load on-demand if not available
    let LocalEmbeddings = ModuleRegistry.getModuleSync('LocalEmbeddings');
    let LocalVectorStore = ModuleRegistry.getModuleSync('LocalVectorStore');

    if (!LocalEmbeddings || !LocalVectorStore) {
        // Preload dependencies
        await ModuleRegistry.preloadModules(['LocalEmbeddings', 'LocalVectorStore']);
        LocalEmbeddings = await ModuleRegistry.getModule('LocalEmbeddings');
        LocalVectorStore = await ModuleRegistry.getModule('LocalVectorStore');
    }

    if (!LocalEmbeddings) {
        throw new Error('LocalEmbeddings module not loaded. Check browser compatibility.');
    }

    if (!LocalVectorStore) {
        throw new Error('LocalVectorStore module not loaded. Check browser compatibility.');
    }

    if (!LocalEmbeddings.isReady()) {
        throw new Error('Local embeddings not initialized. Generate embeddings first.');
    }

    if (!LocalVectorStore.isReady()) {
        await LocalVectorStore.init();
    }

    // Generate embedding for query
    const queryVector = await LocalEmbeddings.getEmbedding(query);

    // Use async search for non-blocking UI (falls back to sync if worker unavailable)
    const results = await LocalVectorStore.searchAsync(queryVector, limit, 0.3);

    // Transform to match Qdrant response format
    return results.map(r => ({
        id: r.id,
        score: r.score,
        payload: r.payload
    }));
}

/**
 * Clear local embeddings
 * @returns {Promise<{success: boolean}>}
 */
async function clearLocalEmbeddings() {
    const LocalVectorStore = ModuleRegistry.getModuleSync('LocalVectorStore');

    if (!LocalVectorStore) {
        throw new Error('LocalVectorStore module not loaded. Check browser compatibility.');
    }

    await LocalVectorStore.clear();

    // Update config
    const config = await getConfig() || {};
    const newConfig = { ...config };
    delete newConfig.embeddingsGenerated;
    delete newConfig.chunksCount;
    delete newConfig.generatedAt;
    newConfig.storageMode = 'local';
    await saveConfig(newConfig);

    console.log('[RAG] Local embeddings cleared');
    return { success: true };
}


/**
 * Get semantic context for a chat query
 * Returns relevant chunks to inject into the system prompt
 */
async function getSemanticContext(query, limit = 3) {
    if (!isConfigured()) {
        return null;
    }

    try {
        const results = await search(query, limit);

        if (results.length === 0) {
            return null;
        }

        const context = results.map(r => r.payload.text).join('\n\n');
        return `SEMANTIC SEARCH RESULTS:\n${context}`;

    } catch (err) {
        console.error('Semantic search error:', err);
        return null;
    }
}

// ES Module export
export const RAG = {
    getConfig,
    getConfigSync,
    saveConfig,
    isConfigured,
    hasCredentials,
    isStale,
    getCheckpoint,
    clearCheckpoint,
    search,
    generateEmbeddings,
    clearEmbeddings,
    getSemanticContext,

    // Incremental embedding support
    getEmbeddingManifest,
    getNewChunks,
    filterStreamsForIncremental,
    clearEmbeddingManifest,

    // Local mode support (WASM-only architecture)
    isLocalMode,
    getStorageMode,
    checkLocalSupport,
    generateLocalEmbeddings,
    searchLocal,
    clearLocalEmbeddings,

    // Worker lifecycle management
    cleanupEmbeddingWorker,

    // Constants
    LOCAL_EMBEDDING_DIMENSIONS
};

// ES Module export - use ModuleRegistry for access instead of window globals
console.log('[RAG] RAG module loaded (WASM-only architecture with local embeddings)');
