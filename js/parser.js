/**
 * Spotify Data Parser Facade
 * 
 * This module acts as a facade that delegates all parsing work to a Web Worker.
 * The actual parsing logic lives in js/parser-worker.js.
 * 
 * @module parser
 */

'use strict';

// ==========================================
// Worker Management
// ==========================================

let workerInstance = null;

/**
 * Get or create the parser worker instance
 * @returns {Worker}
 */
function getWorker() {
    if (!workerInstance) {
        workerInstance = new Worker('js/parser-worker.js');
    }
    return workerInstance;
}

/**
 * Terminate the worker to free resources
 */
function terminateWorker() {
    if (workerInstance) {
        workerInstance.terminate();
        workerInstance = null;
    }
}

// ==========================================
// Public API
// ==========================================

/**
 * Parse a Spotify data export file (.zip or .json)
 * Delegates to Web Worker for off-main-thread processing.
 * 
 * @param {File} file - The .zip or .json file
 * @param {Function} onProgress - Progress callback (message: string)
 * @param {Array} existingStreams - Optional existing streams for overlap detection
 * @returns {Promise<{streams: Array, chunks: Array, stats: Object}>}
 */
async function parseSpotifyExport(file, onProgress = () => { }, existingStreams = null) {
    return new Promise((resolve, reject) => {
        const worker = getWorker();

        // Set up message handler
        const messageHandler = (e) => {
            const { type, message, streams, chunks, stats, error, overlap } = e.data;

            switch (type) {
                case 'progress':
                    onProgress(message);
                    // Send ACK for backpressure
                    if (e.data.ackId) {
                        worker.postMessage({ type: 'ack', ackId: e.data.ackId });
                    }
                    break;

                case 'partial':
                    // Incremental save notification
                    onProgress(`Processing file ${e.data.fileIndex}/${e.data.totalFiles}...`);
                    // Send ACK for backpressure
                    if (e.data.ackId) {
                        worker.postMessage({ type: 'ack', ackId: e.data.ackId });
                    }
                    break;

                case 'memory_warning':
                    console.warn('[Parser] Memory pressure in worker:', e.data.reason);
                    onProgress('Memory pressure detected, pausing...');
                    // Auto-resume after a brief pause to allow GC
                    setTimeout(() => {
                        worker.postMessage({ type: 'resume' });
                    }, 1000);
                    break;

                case 'memory_resumed':
                    onProgress('Resuming processing...');
                    break;

                case 'overlap_detected':
                    // For now, auto-merge (use unique new streams)
                    // In future, could surface this to UI for user decision
                    console.log('[Parser] Overlap detected:', overlap);
                    onProgress(`Overlap detected: ${overlap.stats.exactDuplicates} duplicates, ${overlap.stats.uniqueNew} new`);
                    // Re-parse with merge strategy by not passing existingStreams
                    worker.postMessage({ type: 'parse', file, existingStreams: null });
                    break;

                case 'complete':
                    worker.removeEventListener('message', messageHandler);
                    worker.removeEventListener('error', errorHandler);
                    resolve({ streams, chunks, stats });
                    break;

                case 'error':
                    worker.removeEventListener('message', messageHandler);
                    worker.removeEventListener('error', errorHandler);
                    reject(new Error(error));
                    break;
            }
        };

        const errorHandler = (error) => {
            worker.removeEventListener('message', messageHandler);
            worker.removeEventListener('error', errorHandler);
            reject(new Error(`Worker error: ${error.message}`));
        };

        worker.addEventListener('message', messageHandler);
        worker.addEventListener('error', errorHandler);

        // Start parsing
        worker.postMessage({ type: 'parse', file, existingStreams });
    });
}

/**
 * Enrich streams with derived metrics.
 * NOTE: This is primarily done in the worker. This function is provided
 * for backwards compatibility if needed for post-processing.
 * 
 * @param {Array} streams - Parsed streams
 * @returns {Array} Enriched streams
 */
function enrichStreams(streams) {
    // Build track duration estimates (max observed play time)
    const trackDurations = {};

    for (const stream of streams) {
        const key = `${stream.trackName}::${stream.artistName}`;
        if (!trackDurations[key] || stream.msPlayed > trackDurations[key]) {
            trackDurations[key] = stream.msPlayed;
        }
    }

    // Add completion rate and derived metrics
    return streams.map(stream => {
        const key = `${stream.trackName}::${stream.artistName}`;
        const estimatedDuration = trackDurations[key] || stream.msPlayed;
        const completionRate = estimatedDuration > 0
            ? Math.min(stream.msPlayed / estimatedDuration, 1)
            : 0;

        // Determine play type
        let playType = 'full';
        if (stream.msPlayed < 30000) playType = 'skip';
        else if (completionRate < 0.5) playType = 'partial';
        else if (completionRate < 0.9) playType = 'most';

        // Parse date components
        const date = new Date(stream.playedAt);

        return {
            ...stream,
            estimatedDuration,
            completionRate,
            playType,
            hour: date.getHours(),
            dayOfWeek: date.getDay(),
            month: date.getMonth(),
            year: date.getFullYear(),
            date: date.toISOString().split('T')[0]
        };
    });
}

/**
 * Generate weekly and monthly listening chunks.
 * NOTE: This is primarily done in the worker. This function is provided
 * for backwards compatibility if needed for post-processing.
 * 
 * @param {Array} streams - Enriched streams
 * @returns {Array} Weekly and monthly chunks
 */
function generateChunks(streams) {
    const weeklyChunks = {};
    const monthlyChunks = {};

    for (const stream of streams) {
        // Weekly key (ISO week)
        const weekStart = getWeekStart(new Date(stream.playedAt));
        const weekKey = weekStart.toISOString().split('T')[0];

        if (!weeklyChunks[weekKey]) {
            weeklyChunks[weekKey] = {
                id: `week-${weekKey}`,
                type: 'weekly',
                startDate: weekKey,
                streams: [],
                artists: new Set(),
                tracks: new Set(),
                totalMs: 0
            };
        }

        weeklyChunks[weekKey].streams.push(stream);
        weeklyChunks[weekKey].artists.add(stream.artistName);
        weeklyChunks[weekKey].tracks.add(`${stream.trackName}::${stream.artistName}`);
        weeklyChunks[weekKey].totalMs += stream.msPlayed;

        // Monthly key
        const monthKey = `${stream.year}-${String(stream.month + 1).padStart(2, '0')}`;

        if (!monthlyChunks[monthKey]) {
            monthlyChunks[monthKey] = {
                id: `month-${monthKey}`,
                type: 'monthly',
                startDate: `${monthKey}-01`,
                streams: [],
                artists: new Set(),
                tracks: new Set(),
                totalMs: 0
            };
        }

        monthlyChunks[monthKey].streams.push(stream);
        monthlyChunks[monthKey].artists.add(stream.artistName);
        monthlyChunks[monthKey].tracks.add(`${stream.trackName}::${stream.artistName}`);
        monthlyChunks[monthKey].totalMs += stream.msPlayed;
    }

    // Convert Sets to counts and generate summaries
    const processChunk = (chunk) => ({
        ...chunk,
        streamCount: chunk.streams.length,
        uniqueArtists: chunk.artists.size,
        uniqueTracks: chunk.tracks.size,
        topArtists: getTopN(chunk.streams, 'artistName', 5),
        topTracks: getTopN(chunk.streams, s => `${s.trackName} - ${s.artistName}`, 5),
        avgCompletionRate: chunk.streams.length > 0
            ? chunk.streams.reduce((sum, s) => sum + s.completionRate, 0) / chunk.streams.length
            : 0,
        artists: [...chunk.artists],
        tracks: [...chunk.tracks],
        summary: generateChunkSummary(chunk)
    });

    return [
        ...Object.values(weeklyChunks).map(processChunk),
        ...Object.values(monthlyChunks).map(processChunk)
    ];
}

/**
 * Generate a text summary for a chunk (for embedding)
 */
function generateChunkSummary(chunk) {
    const topArtists = getTopN(chunk.streams, 'artistName', 3);
    const period = chunk.type === 'weekly' ? 'week' : 'month';
    const hours = Math.round(chunk.totalMs / 3600000);

    return `During the ${period} of ${chunk.startDate}, listened to ${hours} hours of music. ` +
        `Top artists: ${topArtists.join(', ')}. ` +
        `${chunk.artists.size} unique artists, ${chunk.tracks.size} unique tracks.`;
}

/**
 * Get top N items by frequency
 */
function getTopN(items, keyFn, n) {
    const counts = {};
    const getKey = typeof keyFn === 'function' ? keyFn : item => item[keyFn];

    for (const item of items) {
        const key = getKey(item);
        counts[key] = (counts[key] || 0) + 1;
    }

    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([key]) => key);
}

/**
 * Get the Monday of the week for a given date
 */
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

// ==========================================
// ES Module Export
// ==========================================

export const Parser = {
    parseSpotifyExport,
    enrichStreams,
    generateChunks,
    terminateWorker
};


console.log('[Parser] Facade module loaded (delegates to parser-worker.js)');
