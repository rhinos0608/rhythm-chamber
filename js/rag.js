/**
 * RAG (Retrieval-Augmented Generation) Module for Rhythm Chamber
 * 
 * Handles semantic search using embeddings and Qdrant vector storage.
 * Premium feature - requires user's own Qdrant Cloud cluster.
 */

const RAG_STORAGE_KEY = 'rhythm_chamber_rag';
const RAG_CHECKPOINT_KEY = 'rhythm_chamber_rag_checkpoint';
const COLLECTION_NAME = 'rhythm_chamber';
const EMBEDDING_MODEL = 'qwen/qwen3-embedding-8b';
const EMBEDDING_DIMENSIONS = 4096; // qwen3-embedding-8b output dimension
const API_TIMEOUT_MS = 60000; // 60 second timeout

/**
 * Get RAG configuration from localStorage
 */
function getConfig() {
    try {
        const stored = localStorage.getItem(RAG_STORAGE_KEY);
        if (!stored) return null;
        return JSON.parse(stored);
    } catch (e) {
        return null;
    }
}

/**
 * Save RAG configuration to localStorage
 */
function saveConfig(config) {
    localStorage.setItem(RAG_STORAGE_KEY, JSON.stringify({
        ...config,
        updatedAt: new Date().toISOString()
    }));
}

/**
 * Check if RAG is fully configured and ready
 */
function isConfigured() {
    const config = getConfig();
    return !!(config?.qdrantUrl && config?.qdrantApiKey && config?.embeddingsGenerated);
}

/**
 * Check if Qdrant credentials are set (but embeddings may not be generated)
 */
function hasCredentials() {
    const config = getConfig();
    return !!(config?.qdrantUrl && config?.qdrantApiKey);
}

/**
 * Check if embeddings are stale (data changed since generation)
 */
async function isStale() {
    const config = getConfig();
    if (!config?.embeddingsGenerated || !config?.dataHash) {
        return true;
    }

    const currentHash = await window.Storage?.getDataHash?.();
    return currentHash !== config.dataHash;
}

/**
 * Get checkpoint for resume
 */
function getCheckpoint() {
    try {
        const stored = localStorage.getItem(RAG_CHECKPOINT_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch (e) {
        return null;
    }
}

/**
 * Save checkpoint for resume
 */
function saveCheckpoint(data) {
    localStorage.setItem(RAG_CHECKPOINT_KEY, JSON.stringify({
        ...data,
        timestamp: Date.now()
    }));
}

/**
 * Clear checkpoint after completion
 */
function clearCheckpoint() {
    localStorage.removeItem(RAG_CHECKPOINT_KEY);
}

/**
 * Get embedding for text using OpenRouter API
 * @param {string|string[]} input - Text or array of texts to embed
 * @returns {Promise<number[]|number[][]>} Embedding vector(s)
 */
async function getEmbedding(input) {
    const apiKey = window.Settings?.getSettings?.()?.openrouter?.apiKey;

    if (!apiKey || apiKey === 'your-api-key-here') {
        throw new Error('OpenRouter API key not configured');
    }

    // Use timeout wrapper if available
    const fetchFn = window.Utils?.fetchWithTimeout || fetch;
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
        throw new Error(error.error?.message || `Embedding API error: ${response.status}`);
    }

    const data = await response.json();
    const embeddings = data.data.map(d => d.embedding);

    return Array.isArray(input) ? embeddings : embeddings[0];
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
 */
async function ensureCollection() {
    const config = getConfig();
    if (!config?.qdrantUrl || !config?.qdrantApiKey) {
        throw new Error('Qdrant credentials not configured');
    }

    // Check if collection exists
    const checkResponse = await fetch(`${config.qdrantUrl}/collections/${COLLECTION_NAME}`, {
        headers: { 'api-key': config.qdrantApiKey }
    });

    if (checkResponse.ok) {
        return true; // Collection exists
    }

    // Create collection
    const createResponse = await fetch(`${config.qdrantUrl}/collections/${COLLECTION_NAME}`, {
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
        throw new Error(error.status?.error || `Failed to create collection: ${createResponse.status}`);
    }

    return true;
}

/**
 * Upsert points to Qdrant
 * @param {Array} points - Array of { id, vector, payload } objects
 */
async function upsertPoints(points) {
    const config = getConfig();
    if (!config?.qdrantUrl || !config?.qdrantApiKey) {
        throw new Error('Qdrant credentials not configured');
    }

    const response = await fetch(`${config.qdrantUrl}/collections/${COLLECTION_NAME}/points`, {
        method: 'PUT',
        headers: {
            'api-key': config.qdrantApiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ points })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.status?.error || `Upsert failed: ${response.status}`);
    }

    return await response.json();
}

/**
 * Search for similar vectors in Qdrant
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

    // Search in Qdrant
    const response = await fetch(`${config.qdrantUrl}/collections/${COLLECTION_NAME}/points/search`, {
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
        throw new Error(error.status?.error || `Search failed: ${response.status}`);
    }

    const data = await response.json();
    return data.result || [];
}

/**
 * Generate embeddings for all streaming data chunks
 * @param {Function} onProgress - Progress callback (current, total, message)
 */
async function generateEmbeddings(onProgress = () => { }, options = {}) {
    if (!Payments.isPremium()) {
        throw new Error('Premium subscription required');
    }

    const config = getConfig();
    if (!config?.qdrantUrl || !config?.qdrantApiKey) {
        throw new Error('Please configure your Qdrant credentials first');
    }

    const { resume = false } = options;
    const checkpoint = resume ? getCheckpoint() : null;

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
    let startBatch = 0;
    if (checkpoint && checkpoint.totalChunks === totalChunks) {
        startBatch = checkpoint.lastBatch + 1;
        onProgress(checkpoint.processed, totalChunks,
            `Resuming from batch ${startBatch}... (${estimateText} remaining)`);
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

    onProgress(totalChunks, totalChunks, '✓ Embeddings generated successfully!');

    return { success: true, chunksProcessed: totalChunks };
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
 */
async function clearEmbeddings() {
    const config = getConfig();
    if (!config?.qdrantUrl || !config?.qdrantApiKey) {
        throw new Error('Qdrant credentials not configured');
    }

    // Delete collection
    const response = await fetch(`${config.qdrantUrl}/collections/${COLLECTION_NAME}`, {
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
    COLLECTION_NAME,
    EMBEDDING_MODEL
};
