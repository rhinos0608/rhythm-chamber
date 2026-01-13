/**
 * Spotify Data Parser Module
 * Parses .zip exports and extracts streaming history
 */

const JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
const JSZIP_INTEGRITY = 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG';

/**
 * Parse a Spotify data export .zip file
 * @param {File} file - The .zip file
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Array>} Parsed streaming history
 */
async function parseSpotifyExport(file, onProgress = () => { }) {
    onProgress('Loading JSZip library...');

    // Dynamically load JSZip if not present
    if (typeof JSZip === 'undefined') {
        await loadScript(JSZIP_URL, {
            integrity: JSZIP_INTEGRITY,
            crossorigin: 'anonymous'
        });
    }

    onProgress('Extracting archive...');
    const zip = await JSZip.loadAsync(file);

    // Find streaming history files
    const streamingFiles = [];
    zip.forEach((relativePath, zipEntry) => {
        if (relativePath.includes('StreamingHistory') && relativePath.endsWith('.json')) {
            streamingFiles.push({ path: relativePath, entry: zipEntry });
        }
        // Also check for extended streaming history
        if (relativePath.includes('endsong') && relativePath.endsWith('.json')) {
            streamingFiles.push({ path: relativePath, entry: zipEntry });
        }
    });

    if (streamingFiles.length === 0) {
        throw new Error('No streaming history found in archive. Make sure this is a Spotify data export.');
    }

    onProgress(`Found ${streamingFiles.length} history files...`);

    // Parse all streaming history files
    let allStreams = [];

    for (let i = 0; i < streamingFiles.length; i++) {
        const { path, entry } = streamingFiles[i];
        onProgress(`Parsing ${path}...`);

        const content = await entry.async('text');
        const data = JSON.parse(content);

        // Normalize data format
        const normalized = data.map(stream => normalizeStream(stream, path));
        allStreams = allStreams.concat(normalized);
    }

    // Sort by timestamp
    allStreams.sort((a, b) => new Date(a.playedAt) - new Date(b.playedAt));

    // Remove duplicates (same song at exact same time)
    const seen = new Set();
    allStreams = allStreams.filter(stream => {
        const key = `${stream.playedAt}-${stream.trackName}-${stream.artistName}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    onProgress(`Processed ${allStreams.length} streams`);

    return allStreams;
}

/**
 * Normalize stream data from different Spotify export formats
 */
function normalizeStream(stream, filePath) {
    // Extended streaming history format (endsong files)
    if (stream.ts) {
        return {
            playedAt: stream.ts,
            trackName: stream.master_metadata_track_name || 'Unknown Track',
            artistName: stream.master_metadata_album_artist_name || 'Unknown Artist',
            albumName: stream.master_metadata_album_album_name || 'Unknown Album',
            msPlayed: stream.ms_played || 0,
            platform: stream.platform || 'unknown',
            shuffle: stream.shuffle || false,
            skipped: stream.skipped || false,
            offline: stream.offline || false,
            reason_start: stream.reason_start,
            reason_end: stream.reason_end,
            source: 'extended'
        };
    }

    // Basic streaming history format
    return {
        playedAt: stream.endTime || stream.ts,
        trackName: stream.trackName || 'Unknown Track',
        artistName: stream.artistName || 'Unknown Artist',
        albumName: stream.albumName || 'Unknown Album',
        msPlayed: stream.msPlayed || 0,
        platform: 'unknown',
        shuffle: false,
        skipped: false,
        offline: false,
        reason_start: null,
        reason_end: null,
        source: 'basic'
    };
}

/**
 * Calculate derived metrics for streams
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
 * Generate weekly and monthly listening chunks
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
        avgCompletionRate: chunk.streams.reduce((sum, s) => sum + s.completionRate, 0) / chunk.streams.length,
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

/**
 * Load a script dynamically
 */
function loadScript(src, options = {}) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        if (options.integrity) {
            script.integrity = options.integrity;
        }
        if (options.crossorigin) {
            script.crossOrigin = options.crossorigin;
        }
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Public API
window.Parser = {
    parseSpotifyExport,
    enrichStreams,
    generateChunks
};
