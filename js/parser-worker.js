/**
 * Parser Web Worker
 * Handles heavy parsing off the main thread
 */

// Import JSZip dynamically
importScripts('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');

self.onmessage = async (e) => {
    const { type, file } = e.data;

    if (type === 'parse') {
        try {
            // Detect file type
            if (file.name.endsWith('.json')) {
                await parseJsonFile(file);
            } else {
                await parseZipFile(file);
            }
        } catch (error) {
            self.postMessage({ type: 'error', error: error.message });
        }
    }
};

/**
 * Parse a direct JSON file (streaming history array)
 */
async function parseJsonFile(file) {
    postProgress('Reading JSON file...');

    const text = await file.text();
    const data = JSON.parse(text);

    if (!Array.isArray(data)) {
        throw new Error('JSON file must contain an array of streams.');
    }

    postProgress(`Found ${data.length} streams...`);

    const normalized = data.map(stream => normalizeStream(stream, file.name));

    postProgress('Sorting and deduplicating...');
    normalized.sort((a, b) => new Date(a.playedAt) - new Date(b.playedAt));

    const seen = new Set();
    const deduped = normalized.filter(stream => {
        const key = `${stream.playedAt}-${stream.trackName}-${stream.artistName}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    postProgress('Enriching stream data...');
    const enriched = enrichStreams(deduped);

    postProgress('Generating chunks...');
    const chunks = generateChunks(enriched);

    self.postMessage({
        type: 'complete',
        streams: enriched,
        chunks,
        stats: {
            totalStreams: enriched.length,
            fileCount: 1
        }
    });
}

/**
 * Parse a Spotify data export .zip file
 */
async function parseZipFile(file) {
    postProgress('Extracting archive...');

    const zip = await JSZip.loadAsync(file);

    // Find streaming history files
    const streamingFiles = [];
    zip.forEach((relativePath, zipEntry) => {
        if (relativePath.includes('StreamingHistory') && relativePath.endsWith('.json')) {
            streamingFiles.push({ path: relativePath, entry: zipEntry });
        }
        if (relativePath.includes('endsong') && relativePath.endsWith('.json')) {
            streamingFiles.push({ path: relativePath, entry: zipEntry });
        }
    });

    if (streamingFiles.length === 0) {
        throw new Error('No streaming history found in archive.');
    }

    postProgress(`Found ${streamingFiles.length} history files...`);

    // Parse all streaming history files
    let allStreams = [];

    for (let i = 0; i < streamingFiles.length; i++) {
        const { path, entry } = streamingFiles[i];
        postProgress(`Parsing file ${i + 1}/${streamingFiles.length}...`);

        const content = await entry.async('text');
        const data = JSON.parse(content);

        const normalized = data.map(stream => normalizeStream(stream, path));
        allStreams = allStreams.concat(normalized);
    }

    postProgress('Sorting and deduplicating...');

    // Sort by timestamp
    allStreams.sort((a, b) => new Date(a.playedAt) - new Date(b.playedAt));

    // Remove duplicates
    const seen = new Set();
    allStreams = allStreams.filter(stream => {
        const key = `${stream.playedAt}-${stream.trackName}-${stream.artistName}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    postProgress('Enriching stream data...');
    const enriched = enrichStreams(allStreams);

    postProgress('Generating chunks...');
    const chunks = generateChunks(enriched);

    self.postMessage({
        type: 'complete',
        streams: enriched,
        chunks,
        stats: {
            totalStreams: enriched.length,
            fileCount: streamingFiles.length
        }
    });
}

function postProgress(message) {
    self.postMessage({ type: 'progress', message });
}

/**
 * Normalize stream data from different Spotify export formats
 */
function normalizeStream(stream, filePath) {
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
    const trackDurations = {};

    for (const stream of streams) {
        const key = `${stream.trackName}::${stream.artistName}`;
        if (!trackDurations[key] || stream.msPlayed > trackDurations[key]) {
            trackDurations[key] = stream.msPlayed;
        }
    }

    return streams.map(stream => {
        const key = `${stream.trackName}::${stream.artistName}`;
        const estimatedDuration = trackDurations[key] || stream.msPlayed;
        const completionRate = estimatedDuration > 0
            ? Math.min(stream.msPlayed / estimatedDuration, 1)
            : 0;

        let playType = 'full';
        if (stream.msPlayed < 30000) playType = 'skip';
        else if (completionRate < 0.5) playType = 'partial';
        else if (completionRate < 0.9) playType = 'most';

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

    const processChunk = (chunk) => ({
        id: chunk.id,
        type: chunk.type,
        startDate: chunk.startDate,
        streamCount: chunk.streams.length,
        uniqueArtists: chunk.artists.size,
        uniqueTracks: chunk.tracks.size,
        totalMs: chunk.totalMs,
        topArtists: getTopN(chunk.streams, 'artistName', 5),
        topTracks: getTopN(chunk.streams, s => `${s.trackName} - ${s.artistName}`, 5),
        avgCompletionRate: chunk.streams.reduce((sum, s) => sum + s.completionRate, 0) / chunk.streams.length,
        artists: [...chunk.artists],
        tracks: [...chunk.tracks]
    });

    return [
        ...Object.values(weeklyChunks).map(processChunk),
        ...Object.values(monthlyChunks).map(processChunk)
    ];
}

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

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}
