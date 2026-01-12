/**
 * RAG (Retrieval-Augmented Generation) Module for Rhythm Chamber
 * 
 * Handles semantic search using embeddings and Qdrant vector storage.
 * Premium feature - requires user's own Qdrant Cloud cluster.
 * 
 * SECURITY FEATURES:
 * - Credentials obfuscated in localStorage (not plaintext)
 * - Checkpoints encrypted with session-derived keys
 * - Collection namespace isolation per user
 * - Rate limiting on embedding generation
 * - Anomaly detection for failed API attempts
 */

const RAG_STORAGE_KEY = 'rhythm_chamber_rag';
const RAG_CREDENTIAL_KEY = 'qdrant_credentials'; // Key for encrypted storage
const RAG_CHECKPOINT_KEY = 'rhythm_chamber_rag_checkpoint';
const RAG_CHECKPOINT_CIPHER_KEY = 'rhythm_chamber_rag_checkpoint_cipher';
const COLLECTION_NAME_BASE = 'rhythm_chamber';
const EMBEDDING_MODEL = 'qwen/qwen3-embedding-8b';
const EMBEDDING_DIMENSIONS = 4096; // qwen3-embedding-8b output dimension
const API_TIMEOUT_MS = 60000; // 60 second timeout
const EMBEDDING_RATE_LIMIT = 5; // Max 5 embedding batches per minute

/**
 * Get collection name for Qdrant
 * 
 * SIMPLIFIED (Phase 2): User owns their own Qdrant instance,
 * so namespace isolation is unnecessary. The collection name is now
 * just the base name without per-user hashing.
 * 
 * This removes the dependency on Security.getUserNamespace() which
 * was designed for shared cluster scenarios.
 */
function getCollectionName() {
    return COLLECTION_NAME_BASE;
}


/**
 * Get RAG configuration
 * Credentials are encrypted with AES-GCM, not just obfuscated
 * Uses unified storage API with localStorage fallback
 * Returns null if decryption fails (session changed, re-auth needed)
 */
async function getConfig() {
    try {
        // Try unified storage first (IndexedDB after migration)
        let config = {};
        if (window.Storage?.getConfig) {
            const storedConfig = await window.Storage.getConfig(RAG_STORAGE_KEY);
            if (storedConfig) {
                config = storedConfig;
            }
        }

        // Fallback to localStorage (pre-migration or if IndexedDB unavailable)
        if (!config || Object.keys(config).length === 0) {
            const stored = localStorage.getItem(RAG_STORAGE_KEY);
            config = stored ? JSON.parse(stored) : {};
        }

        // Get encrypted credentials using Security module
        if (window.Security?.getEncryptedCredentials) {
            const creds = await window.Security.getEncryptedCredentials(RAG_CREDENTIAL_KEY);
            if (creds) {
                config.qdrantUrl = creds.qdrantUrl;
                config.qdrantApiKey = creds.qdrantApiKey;
            }
        }

        // Fallback: Check for legacy unencrypted storage (migration path)
        if (!config.qdrantApiKey) {
            const ls = localStorage.getItem(RAG_STORAGE_KEY);
            if (ls) {
                const legacy = JSON.parse(ls);
                if (legacy.qdrantApiKey) {
                    console.warn('[RAG] Found legacy unencrypted credentials - will encrypt on next save');
                    config.qdrantUrl = legacy.qdrantUrl;
                    config.qdrantApiKey = legacy.qdrantApiKey;
                }
            }
        }

        return Object.keys(config).length > 0 ? config : null;
    } catch (e) {
        console.error('[RAG] Failed to get config:', e);
        return null;
    }
}


/**
 * Save RAG configuration
 * Credentials are encrypted with AES-GCM for real security
 * Uses unified storage API with localStorage fallback
 */
async function saveConfig(config) {
    // Separate sensitive credentials from non-sensitive config
    const nonSensitive = {
        embeddingsGenerated: config.embeddingsGenerated,
        chunksCount: config.chunksCount,
        generatedAt: config.generatedAt,
        dataHash: config.dataHash,
        updatedAt: new Date().toISOString(),
        // Flag for sync checks - indicates credentials have been saved
        hasCredentials: !!(config.qdrantUrl && config.qdrantApiKey)
    };

    // Store non-sensitive in unified storage (IndexedDB)
    if (window.Storage?.setConfig) {
        try {
            await window.Storage.setConfig(RAG_STORAGE_KEY, nonSensitive);
        } catch (e) {
            console.warn('[RAG] Failed to save to unified storage:', e);
        }
    }
    // Also save to localStorage as sync fallback
    localStorage.setItem(RAG_STORAGE_KEY, JSON.stringify(nonSensitive));

    // Encrypt and store credentials if Security module available
    if (config.qdrantUrl || config.qdrantApiKey) {
        if (window.Security?.storeEncryptedCredentials) {
            await window.Security.storeEncryptedCredentials(RAG_CREDENTIAL_KEY, {
                qdrantUrl: config.qdrantUrl,
                qdrantApiKey: config.qdrantApiKey
            });
            console.log('[RAG] Credentials encrypted with AES-GCM');
        } else {
            // Fallback warning - credentials not properly secured
            console.warn('[RAG] Security module not available - credentials stored unencrypted!');
            const legacy = JSON.parse(localStorage.getItem(RAG_STORAGE_KEY) || '{}');
            legacy.qdrantUrl = config.qdrantUrl;
            legacy.qdrantApiKey = config.qdrantApiKey;
            localStorage.setItem(RAG_STORAGE_KEY, JSON.stringify(legacy));
        }
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
 * Check if Qdrant credentials are set (SYNC version)
 * Note: Checks localStorage flag, not actual encrypted credentials
 */
function hasCredentials() {
    const config = getConfigSync();
    // Check if we have the flag that indicates credentials were saved
    return !!(config?.hasCredentials || (config?.qdrantUrl && config?.qdrantApiKey));
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

    const currentHash = await window.Storage?.getDataHash?.();
    return currentHash !== config.dataHash;
}


/**
 * Get checkpoint for resume
 * Decrypts dataHash if encrypted. Uses unified storage with fallback.
 */
async function getCheckpoint() {
    try {
        // Try unified storage first (IndexedDB)
        if (window.Storage?.getConfig) {
            const cipher = await window.Storage.getConfig(RAG_CHECKPOINT_CIPHER_KEY);
            if (cipher && window.Security?.decryptData) {
                try {
                    const sessionKey = await window.Security.getSessionKey();
                    const decrypted = await window.Security.decryptData(cipher, sessionKey);
                    if (decrypted) {
                        return JSON.parse(decrypted);
                    }
                } catch (decryptErr) {
                    console.warn('[RAG] Checkpoint decryption failed (session changed?)');
                }
            }

            // Check for unencrypted checkpoint in unified storage
            const plainCheckpoint = await window.Storage.getConfig(RAG_CHECKPOINT_KEY);
            if (plainCheckpoint) {
                return plainCheckpoint;
            }
        }

        // Fallback to localStorage
        const cipher = localStorage.getItem(RAG_CHECKPOINT_CIPHER_KEY);
        if (cipher && window.Security?.decryptData) {
            try {
                const sessionKey = await window.Security.getSessionKey();
                const decrypted = await window.Security.decryptData(cipher, sessionKey);
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
    if (window.Security?.encryptData && window.Security?.getSessionKey) {
        try {
            const sessionKey = await window.Security.getSessionKey();
            const encrypted = await window.Security.encryptData(
                JSON.stringify(checkpoint),
                sessionKey
            );

            // Save to unified storage (IndexedDB)
            if (window.Storage?.setConfig) {
                await window.Storage.setConfig(RAG_CHECKPOINT_CIPHER_KEY, encrypted);
                await window.Storage.removeConfig(RAG_CHECKPOINT_KEY);
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
    if (window.Storage?.setConfig) {
        await window.Storage.setConfig(RAG_CHECKPOINT_KEY, checkpoint);
    }
    localStorage.setItem(RAG_CHECKPOINT_KEY, JSON.stringify(checkpoint));
}

/**
 * Clear checkpoint after completion
 * Clears from both unified storage and localStorage
 */
async function clearCheckpoint() {
    // Clear from unified storage
    if (window.Storage?.removeConfig) {
        try {
            await window.Storage.removeConfig(RAG_CHECKPOINT_KEY);
            await window.Storage.removeConfig(RAG_CHECKPOINT_CIPHER_KEY);
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
        if (window.Storage?.getConfig) {
            const manifest = await window.Storage.getConfig(MANIFEST_KEY);
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
    if (window.Storage?.setConfig) {
        try {
            await window.Storage.setConfig(MANIFEST_KEY, manifest);
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

    if (window.Storage?.removeConfig) {
        try {
            await window.Storage.removeConfig(MANIFEST_KEY);
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
 * Get embedding for text using OpenRouter API
 * Includes rate limiting and anomaly detection
 * 
 * @param {string|string[]} input - Text or array of texts to embed
 * @returns {Promise<number[]|number[][]>} Embedding vector(s)
 */
async function getEmbedding(input) {
    // Security: Check for suspicious activity
    if (window.Security?.checkSuspiciousActivity) {
        const suspicious = await window.Security.checkSuspiciousActivity('embedding');
        if (suspicious.blocked) {
            throw new Error(suspicious.message);
        }
    }

    // Security: Rate limiting
    if (window.Security?.isRateLimited?.('embedding', EMBEDDING_RATE_LIMIT)) {
        throw new Error('Rate limited: Please wait before generating more embeddings');
    }

    const apiKey = window.Settings?.getSettings?.()?.openrouter?.apiKey;

    if (!apiKey || apiKey === 'your-api-key-here') {
        throw new Error('OpenRouter API key not configured');
    }

    // Use timeout wrapper if available
    const fetchFn = window.Utils?.fetchWithTimeout || fetch;

    try {
        const response = await fetchFn('https://openrouter.ai/api/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Rhythm Chamber'
            },
            body: JSON.stringify({
                model: EMBEDDING_MODEL,
                input: Array.isArray(input) ? input : [input]
            })
        }, API_TIMEOUT_MS);

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            const errorMsg = error.error?.message || `Embedding API error: ${response.status}`;

            // Record failed attempt for anomaly detection
            await window.Security?.recordFailedAttempt?.('embedding', errorMsg);

            throw new Error(errorMsg);
        }

        const data = await response.json();
        const embeddings = data.data.map(d => d.embedding);

        return Array.isArray(input) ? embeddings : embeddings[0];

    } catch (err) {
        // Record network/auth failures
        if (err.message.includes('401') || err.message.includes('403')) {
            await window.Security?.recordFailedAttempt?.('embedding', err.message);
        }
        throw err;
    }
}

/**
 * Test connection to Qdrant cluster
 */
async function testConnection() {
    const config = getConfig();
    if (!config?.qdrantUrl || !config?.qdrantApiKey) {
        throw new Error('Qdrant credentials not configured');
    }

    const response = await fetch(`${config.qdrantUrl}/collections`, {
        headers: {
            'api-key': config.qdrantApiKey
        }
    });

    if (!response.ok) {
        throw new Error(`Qdrant connection failed: ${response.status}`);
    }

    return await response.json();
}

/**
 * Create collection in Qdrant if it doesn't exist
 * Uses namespace-isolated collection name
 */
async function ensureCollection() {
    const config = getConfig();
    if (!config?.qdrantUrl || !config?.qdrantApiKey) {
        throw new Error('Qdrant credentials not configured');
    }

    // Get namespace-isolated collection name
    const collectionName = await getCollectionName();
    console.log(`[RAG] Using collection: ${collectionName}`);

    // Check if collection exists
    const checkResponse = await fetch(`${config.qdrantUrl}/collections/${collectionName}`, {
        headers: { 'api-key': config.qdrantApiKey }
    });

    if (checkResponse.ok) {
        return true; // Collection exists
    }

    // Create collection
    const createResponse = await fetch(`${config.qdrantUrl}/collections/${collectionName}`, {
        method: 'PUT',
        headers: {
            'api-key': config.qdrantApiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            vectors: {
                size: EMBEDDING_DIMENSIONS,
                distance: 'Cosine'
            }
        })
    });

    if (!createResponse.ok) {
        const error = await createResponse.json().catch(() => ({}));
        await window.Security?.recordFailedAttempt?.('qdrant', `Create collection failed: ${createResponse.status}`);
        throw new Error(error.status?.error || `Failed to create collection: ${createResponse.status}`);
    }

    return true;
}

/**
 * Upsert points to Qdrant
 * Uses namespace-isolated collection
 * @param {Array} points - Array of { id, vector, payload } objects
 */
async function upsertPoints(points) {
    const config = getConfig();
    if (!config?.qdrantUrl || !config?.qdrantApiKey) {
        throw new Error('Qdrant credentials not configured');
    }

    const collectionName = await getCollectionName();

    const response = await fetch(`${config.qdrantUrl}/collections/${collectionName}/points`, {
        method: 'PUT',
        headers: {
            'api-key': config.qdrantApiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ points })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        await window.Security?.recordFailedAttempt?.('qdrant', `Upsert failed: ${response.status}`);
        throw new Error(error.status?.error || `Upsert failed: ${response.status}`);
    }

    return await response.json();
}

/**
 * Search for similar vectors in Qdrant
 * Uses namespace-isolated collection
 * @param {string} query - Search query text
 * @param {number} limit - Number of results to return
 * @returns {Promise<Array>} Search results with payloads
 */
async function search(query, limit = 5) {
    const config = getConfig();
    if (!config?.qdrantUrl || !config?.qdrantApiKey) {
        throw new Error('Qdrant credentials not configured');
    }

    // Get embedding for query
    const queryVector = await getEmbedding(query);

    const collectionName = await getCollectionName();

    // Search in Qdrant
    const response = await fetch(`${config.qdrantUrl}/collections/${collectionName}/points/search`, {
        method: 'POST',
        headers: {
            'api-key': config.qdrantApiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            vector: queryVector,
            limit: limit,
            with_payload: true
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        await window.Security?.recordFailedAttempt?.('qdrant', `Search failed: ${response.status}`);
        throw new Error(error.status?.error || `Search failed: ${response.status}`);
    }

    const data = await response.json();
    return data.result || [];
}

/**
 * Generate embeddings for all streaming data chunks
 * @param {Function} onProgress - Progress callback (current, total, message)
 * @param {object} options - Options including resume, mergeStrategy
 */
async function generateEmbeddings(onProgress = () => { }, options = {}) {
    const config = getConfig();
    if (!config?.qdrantUrl || !config?.qdrantApiKey) {
        throw new Error('Please configure your Qdrant credentials first');
    }

    // SECURITY: Start background token refresh for long operation
    if (window.Spotify?.startBackgroundRefresh) {
        window.Spotify.startBackgroundRefresh();
    }

    const { resume = false, mergeStrategy = null } = options;
    const checkpoint = resume ? getCheckpoint() : null;

    try {
        // Get streaming data
        const streams = await Storage.getStreams();
        if (!streams || streams.length === 0) {
            throw new Error('No streaming data found. Please upload your Spotify data first.');
        }

        // Calculate data hash for staleness detection
        const dataHash = await window.Storage?.getDataHash?.() || 'unknown';

        onProgress(0, 100, 'Preparing data...');

        // Create chunks from streaming data
        const chunks = createChunks(streams);
        const totalChunks = chunks.length;

        // Calculate time estimate (roughly 0.3s per chunk with batching)
        const estimatedSeconds = Math.ceil(totalChunks * 0.03); // ~30ms per chunk in batch
        const estimateText = window.Utils?.formatDuration?.(estimatedSeconds) || `~${estimatedSeconds}s`;

        // Determine starting point
        // HNW Fix: Enhanced checkpoint validation with merge capability
        let startBatch = 0;
        if (checkpoint && checkpoint.totalChunks === totalChunks) {
            // Critical: Validate that checkpoint was created for the same data
            if (checkpoint.dataHash && checkpoint.dataHash !== dataHash) {
                console.warn('[RAG] Checkpoint data hash mismatch - data has changed since checkpoint');

                // Handle based on merge strategy
                if (mergeStrategy === 'merge') {
                    // Continue from checkpoint, process new chunks after
                    startBatch = checkpoint.lastBatch + 1;
                    onProgress(checkpoint.processed, totalChunks,
                        `Merging: resuming from batch ${startBatch}... (${estimateText} remaining)`);
                } else if (mergeStrategy === 'restart') {
                    clearCheckpoint();
                    onProgress(0, totalChunks, `Starting fresh... (Est: ${estimateText})`);
                } else {
                    // No strategy specified - return options for UI to prompt user
                    return {
                        action: 'prompt_merge',
                        options: [
                            {
                                strategy: 'merge',
                                label: 'Keep previous progress + add new data',
                                description: `Resume from batch ${checkpoint.lastBatch + 1}, then process new chunks`
                            },
                            {
                                strategy: 'restart',
                                label: 'Start fresh',
                                description: 'Discard previous progress and reprocess all data'
                            }
                        ],
                        checkpoint
                    };
                }
            } else {
                startBatch = checkpoint.lastBatch + 1;
                onProgress(checkpoint.processed, totalChunks,
                    `Resuming from batch ${startBatch}... (${estimateText} remaining)`);
            }
        } else {
            onProgress(0, totalChunks, `Processing ${totalChunks} chunks... (Est: ${estimateText})`);
        }

        // Ensure collection exists
        await ensureCollection();

        // Process in batches to avoid rate limits
        const BATCH_SIZE = 10;
        let processed = checkpoint?.processed || 0;

        for (let i = startBatch * BATCH_SIZE; i < chunks.length; i += BATCH_SIZE) {
            const batchIndex = Math.floor(i / BATCH_SIZE);
            const batch = chunks.slice(i, i + BATCH_SIZE);
            const texts = batch.map(c => c.text);

            try {
                // Get embeddings for batch
                const embeddings = await getEmbedding(texts);

                // Prepare points for Qdrant
                const points = batch.map((chunk, idx) => ({
                    id: i + idx + 1, // Qdrant requires positive integers
                    vector: embeddings[idx],
                    payload: {
                        text: chunk.text,
                        type: chunk.type,
                        metadata: chunk.metadata
                    }
                }));

                // Upsert to Qdrant
                await upsertPoints(points);

                processed += batch.length;

                // Save checkpoint after each batch
                saveCheckpoint({
                    lastBatch: batchIndex,
                    processed,
                    totalChunks,
                    dataHash
                });

                onProgress(processed, totalChunks, `Processed ${processed}/${totalChunks} chunks...`);

            } catch (err) {
                console.error('Batch processing error:', err);
                // Save checkpoint so user can resume
                saveCheckpoint({
                    lastBatch: batchIndex - 1,
                    processed,
                    totalChunks,
                    dataHash,
                    error: err.message
                });
                throw new Error(`Failed at batch ${batchIndex}: ${err.message}. You can resume from Settings.`);
            }

            // Small delay to avoid rate limits
            if (i + BATCH_SIZE < chunks.length) {
                await new Promise(r => setTimeout(r, 200));
            }
        }

        // Clear checkpoint and mark complete
        clearCheckpoint();

        // Mark embeddings as generated with data hash
        saveConfig({
            ...config,
            embeddingsGenerated: true,
            chunksCount: totalChunks,
            generatedAt: new Date().toISOString(),
            dataHash: dataHash
        });

        // Update embedding manifest for incremental support (Phase 3)
        await updateManifestAfterEmbedding(chunks);

        onProgress(totalChunks, totalChunks, '✓ Embeddings generated successfully!');

        return { success: true, chunksProcessed: totalChunks };


    } finally {
        // SECURITY: Always stop background refresh when done
        if (window.Spotify?.stopBackgroundRefresh) {
            window.Spotify.stopBackgroundRefresh();
        }
    }
}

/**
 * Create searchable chunks from streaming data
 * Groups data into meaningful segments for embedding
 */
function createChunks(streams) {
    const chunks = [];

    // Group streams by month
    const byMonth = {};
    streams.forEach(stream => {
        const date = new Date(stream.ts || stream.endTime);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!byMonth[monthKey]) byMonth[monthKey] = [];
        byMonth[monthKey].push(stream);
    });

    // Create monthly summary chunks
    Object.entries(byMonth).forEach(([month, monthStreams]) => {
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
    });

    // Create artist-focused chunks
    const byArtist = {};
    streams.forEach(stream => {
        const artist = stream.master_metadata_album_artist_name || stream.artistName || 'Unknown';
        if (!byArtist[artist]) byArtist[artist] = [];
        byArtist[artist].push(stream);
    });

    // Top 50 artists get individual chunks
    const topArtistEntries = Object.entries(byArtist)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 50);

    topArtistEntries.forEach(([artist, artistStreams]) => {
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
    });

    return chunks;
}

/**
 * Clear all embeddings from Qdrant
 * Uses namespace-isolated collection
 */
async function clearEmbeddings() {
    const config = getConfig();
    if (!config?.qdrantUrl || !config?.qdrantApiKey) {
        throw new Error('Qdrant credentials not configured');
    }

    const collectionName = await getCollectionName();

    // Delete collection
    const response = await fetch(`${config.qdrantUrl}/collections/${collectionName}`, {
        method: 'DELETE',
        headers: { 'api-key': config.qdrantApiKey }
    });

    if (!response.ok && response.status !== 404) {
        throw new Error(`Failed to clear embeddings: ${response.status}`);
    }

    // Update config
    const newConfig = { ...config };
    delete newConfig.embeddingsGenerated;
    delete newConfig.chunksCount;
    delete newConfig.generatedAt;
    saveConfig(newConfig);

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

// Public API
window.RAG = {
    getConfig,
    getConfigSync,  // Sync version for UI checks
    saveConfig,
    isConfigured,
    hasCredentials,
    isStale,
    getCheckpoint,
    clearCheckpoint,
    getEmbedding,
    testConnection,
    ensureCollection,
    search,
    generateEmbeddings,
    clearEmbeddings,
    getSemanticContext,
    getCollectionName,

    // Incremental embedding support (Phase 3)
    getEmbeddingManifest,
    getNewChunks,
    filterStreamsForIncremental,
    clearEmbeddingManifest,

    // Constants
    COLLECTION_NAME: COLLECTION_NAME_BASE,
    EMBEDDING_MODEL
};


console.log('[RAG] RAG module loaded with incremental embedding support');
