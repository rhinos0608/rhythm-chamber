/**
 * Parser Web Worker
 * Handles heavy parsing off the main thread
 */

const JSZIP_LOCAL_PATH = './vendor/jszip.min.js'; // Bundled locally for offline support

let jszipReadyPromise = null;

function ensureJsZipReady() {
    if (!jszipReadyPromise) {
        jszipReadyPromise = new Promise((resolve, reject) => {
            try {
                if (typeof self.JSZip === 'undefined') {
                    importScripts(JSZIP_LOCAL_PATH);
                }

                if (typeof self.JSZip === 'undefined') {
                    throw new Error('JSZip failed to load from bundled asset.');
                }

                resolve(self.JSZip);
            } catch (error) {
                reject(error);
            }
        });
    }
    return jszipReadyPromise;
}

// ==========================================
// Validation Configuration
// HNW Fix: Tight validation to prevent silent data corruption
// ==========================================

const MAX_FILE_SIZE_MB = 500;          // 500MB limit
const MAX_STREAMS = 1_000_000;         // 1M play limit
const MIN_VALID_RATIO = 0.95;          // 95% must be valid (not 50%)
const CHUNK_SIZE_MB = 10;              // NEW: Process in 10MB chunks
const MB = 1024 * 1024;                // Bytes in 1MB
const MEMORY_THRESHOLD = 0.75;         // NEW: 75% RAM usage threshold

// NEW: State for pause/resume
let isPaused = false;
let pauseResolve = null;

// HNW Wave: Sliding window backpressure state
// Prevents message queue overflow by waiting for ACKs from main thread
const MAX_PENDING_ACKS = 5;      // Max messages awaiting ACK
let pendingAcks = 0;             // Current pending ACK count
let ackId = 0;                   // Rolling ACK ID
const ackResolvers = new Map();  // ackId -> resolve function

// Cross-browser memory fallback: chunk-counting for Firefox/Safari
let processedItemCount = 0;
const PAUSE_EVERY_N_ITEMS = 50000; // Pause after every 50k items
let lastPauseTime = 0;
const MIN_PAUSE_INTERVAL_MS = 5000; // At least 5s between pauses

// Prototype pollution guard (mirrors security module subset)
const PROTOTYPE_POLLUTION_KEYS = ['__proto__', 'constructor', 'prototype'];

function sanitizeObject(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeObject);

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        if (PROTOTYPE_POLLUTION_KEYS.includes(key)) {
            console.warn('[Worker] Blocked prototype pollution key:', key);
            continue;
        }
        sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
}

function safeJsonParse(json) {
    const parsed = JSON.parse(json);
    return sanitizeObject(parsed);
}

/**
 * Pause processing for memory pressure relief
 * @param {string} reason - Why we're pausing (memory_api or chunk_count)
 * @param {number} metric - Usage metric for logging
 */
async function pauseForMemory(reason, metric) {
    console.log(`[Worker] Memory pressure detected (${reason}: ${Math.round(metric * 100)}%) - pausing...`);
    self.postMessage({ type: 'memory_warning', reason, metric });

    // Wait for resume signal from main thread
    await new Promise(resolve => {
        pauseResolve = resolve;
        isPaused = true;
    });

    console.log('[Worker] Resuming processing...');
    self.postMessage({ type: 'memory_resumed' });
}

/**
 * Cross-browser memory check with fallback strategies
 * - Chrome: Uses navigator.memory.usedJSHeapSize / jsHeapSizeLimit
 * - Firefox/Safari: Falls back to chunk-counting heuristic
 */
async function checkMemoryAndPause() {
    // Strategy 1: Chrome Memory API (preferred, more accurate)
    if (typeof navigator !== 'undefined' && navigator.memory?.usedJSHeapSize) {
        const usage = navigator.memory.usedJSHeapSize / navigator.memory.jsHeapSizeLimit;
        if (usage > MEMORY_THRESHOLD) {
            await pauseForMemory('memory_api', usage);
            return;
        }
    }

    // Strategy 2: Chunk-counting fallback for Firefox/Safari
    // Pause periodically to allow GC and prevent memory buildup
    processedItemCount++;
    if (processedItemCount >= PAUSE_EVERY_N_ITEMS) {
        const now = Date.now();
        if (now - lastPauseTime >= MIN_PAUSE_INTERVAL_MS) {
            await pauseForMemory('chunk_count', processedItemCount / PAUSE_EVERY_N_ITEMS);
            processedItemCount = 0;
            lastPauseTime = now;
        }
    }
}

/**
 * HNW Wave: Post message with backpressure control
 * Waits for ACK slot to be available before sending
 * Prevents message queue overflow when main thread is slow to process
 *
 * Returns a promise that resolves when the message is ACKed by the main thread.
 * This provides true backpressure - the worker waits for the main thread to
 * signal it's ready for more messages.
 *
 * @param {Object} message - Message to post
 * @returns {Promise<{ackId: number}>} Resolves when ACK is received
 */
async function postWithBackpressure(message) {
    // Wait if we have too many pending ACKs
    while (pendingAcks >= MAX_PENDING_ACKS) {
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Assign ACK ID and track
    const currentAckId = ++ackId;
    pendingAcks++;

    // Create promise that resolves when ACK is received
    const ackPromise = new Promise(resolve => {
        ackResolvers.set(currentAckId, resolve);
    });

    // Send message with ACK ID
    self.postMessage({ ...message, ackId: currentAckId });

    // Wait for ACK before returning (true backpressure)
    await ackPromise;

    return { ackId: currentAckId };
}

/**
 * NEW: Handle pause/resume and ACK signals from main thread
 * HNW Wave: Backpressure coordination
 */
self.addEventListener('message', (e) => {
    if (e.data.type === 'pause') {
        isPaused = true;
    } else if (e.data.type === 'resume') {
        if (pauseResolve) {
            pauseResolve();
            pauseResolve = null;
            isPaused = false;
        }
    } else if (e.data.type === 'ack') {
        // HNW: Handle ACK from main thread
        const ackIdReceived = e.data.ackId;
        const resolver = ackResolvers.get(ackIdReceived);
        if (resolver) {
            resolver();
            ackResolvers.delete(ackIdReceived);
            pendingAcks = Math.max(0, pendingAcks - 1);
        }
    }
});

/**
 * Validate a single stream entry matches Spotify schema
 * Checks for required fields and valid timestamp
 */
function validateSpotifyStream(stream) {
    // Must have timestamp
    const timestamp = stream.ts || stream.endTime;
    if (!timestamp) return false;

    // Must have track or artist (not both required, some edge cases)
    const track = stream.master_metadata_track_name || stream.trackName;
    const artist = stream.master_metadata_album_artist_name || stream.artistName;
    if (!track && !artist) return false;

    // Timestamp must be valid date
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return false;

    // Timestamp must be reasonable (between 2000 and now+1year)
    const year = date.getFullYear();
    if (year < 2000 || year > new Date().getFullYear() + 1) return false;

    return true;
}

/**
 * Validate a file before processing
 * Throws on invalid file
 */
function validateFile(file) {
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        throw new Error(
            `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB ` +
            `exceeds ${MAX_FILE_SIZE_MB}MB limit. ` +
            `Please split your data export or contact support.`
        );
    }
}

/**
 * Validate parsed streams meet quality threshold
 * Returns validation result with stats
 */
function validateStreams(streams) {
    if (streams.length === 0) {
        throw new Error('No data found in file - empty JSON array.');
    }

    if (streams.length > MAX_STREAMS) {
        throw new Error(
            `Too many streams: ${streams.length.toLocaleString()} ` +
            `exceeds limit of ${MAX_STREAMS.toLocaleString()}. ` +
            `Please use a smaller data export.`
        );
    }

    const validStreams = streams.filter(validateSpotifyStream);
    const ratio = validStreams.length / streams.length;

    if (ratio < MIN_VALID_RATIO) {
        throw new Error(
            `File does not appear to be valid Spotify data. ` +
            `Only ${(ratio * 100).toFixed(1)}% of entries match expected format ` +
            `(need ${MIN_VALID_RATIO * 100}%). ` +
            `Please ensure this is an official Spotify data export.`
        );
    }

    return {
        validStreams,
        totalCount: streams.length,
        validCount: validStreams.length,
        invalidCount: streams.length - validStreams.length,
        validRatio: ratio
    };
}

/**
 * Detect temporal overlap between new and existing streams
 * Returns overlap info for user decision (merge/replace/keep)
 */
function detectTemporalOverlap(newStreams, existingStreams) {
    if (!existingStreams || existingStreams.length === 0) {
        return { hasOverlap: false, newStreams };
    }

    // Get date ranges
    const getDateRange = (streams) => {
        const dates = streams
            .map(s => new Date(s.playedAt || s.ts || s.endTime))
            .filter(d => !isNaN(d.getTime()))
            .sort((a, b) => a - b);
        return dates.length > 0
            ? { start: dates[0], end: dates[dates.length - 1] }
            : null;
    };

    const existingRange = getDateRange(existingStreams);
    const newRange = getDateRange(newStreams);

    if (!existingRange || !newRange) {
        return { hasOverlap: false, newStreams };
    }

    // Check for temporal overlap
    const overlapStart = new Date(Math.max(existingRange.start, newRange.start));
    const overlapEnd = new Date(Math.min(existingRange.end, newRange.end));

    if (overlapStart > overlapEnd) {
        // No overlap - date ranges don't intersect
        return { hasOverlap: false, newStreams };
    }

    // Calculate overlap duration
    const overlapDays = Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24));

    // Create hash set of existing streams for deduplication
    const existingHashes = new Set();
    existingStreams.forEach(s => {
        const ts = s.playedAt || s.ts || s.endTime;
        const track = s.trackName || s.master_metadata_track_name || '';
        const artist = s.artistName || s.master_metadata_album_artist_name || '';
        existingHashes.add(`${ts}|${track}|${artist}`);
    });

    // Separate truly new vs duplicates
    const uniqueNew = [];
    const duplicates = [];

    newStreams.forEach(s => {
        const ts = s.playedAt || s.ts || s.endTime;
        const track = s.trackName || s.master_metadata_track_name || '';
        const artist = s.artistName || s.master_metadata_album_artist_name || '';
        const hash = `${ts}|${track}|${artist}`;

        if (existingHashes.has(hash)) {
            duplicates.push(s);
        } else {
            uniqueNew.push(s);
        }
    });

    return {
        hasOverlap: true,
        overlapPeriod: {
            start: overlapStart.toISOString().split('T')[0],
            end: overlapEnd.toISOString().split('T')[0],
            days: overlapDays
        },
        existingRange: {
            start: existingRange.start.toISOString().split('T')[0],
            end: existingRange.end.toISOString().split('T')[0]
        },
        newRange: {
            start: newRange.start.toISOString().split('T')[0],
            end: newRange.end.toISOString().split('T')[0]
        },
        stats: {
            totalNew: newStreams.length,
            exactDuplicates: duplicates.length,
            uniqueNew: uniqueNew.length,
            existingCount: existingStreams.length
        },
        // Pre-computed results for each strategy
        strategies: {
            merge: uniqueNew,  // Only add truly new streams (recommended)
            replace: newStreams,  // Replace everything with new data
            keep: []  // Keep existing, ignore new entirely
        }
    };
}


self.onmessage = async (e) => {
    // Validate message format before processing
    if (!e.data || typeof e.data !== 'object') {
        console.error('[Parser] Invalid message format');
        return;
    }

    // Validate required type field
    if (!e.data.type || typeof e.data.type !== 'string') {
        console.error('[Parser] Invalid message type');
        return;
    }

    const { type, file, existingStreams } = e.data;

    if (type === 'parse') {
        try {
            // Validate file size before processing
            validateFile(file);

            // Detect file type and parse
            if (file.name.endsWith('.json')) {
                await parseJsonFile(file, existingStreams);
            } else {
                await parseZipFile(file, existingStreams);
            }
        } catch (error) {
            self.postMessage({ type: 'error', error: error.message });
        }
    }
};

/**
 * Parse a direct JSON file (streaming history array)
 */
async function parseJsonFile(file, existingStreams = null) {
    postProgress('Reading JSON file...');

    const text = await file.text();
    const data = safeJsonParse(text);

    if (!Array.isArray(data)) {
        throw new Error('JSON file must contain an array of streams.');
    }

    postProgress(`Found ${data.length} streams, validating...`);
    
    // Validate streams with 95% threshold
    let validation;
    try {
        validation = validateStreams(data);
    } catch (validationError) {
        self.postMessage({ type: 'error', error: validationError.message });
        return;
    }
    
    if (validation.invalidCount > 0) {
        postProgress(`${validation.invalidCount} invalid entries filtered out`);
    }
    
    const normalized = validation.validStreams.map(stream => normalizeStream(stream, file.name));

    // Check for overlap with existing data
    if (existingStreams && existingStreams.length > 0) {
        postProgress('Checking for overlap with existing data...');
        const overlap = detectTemporalOverlap(normalized, existingStreams);

        if (overlap.hasOverlap) {
            // Send overlap info to main thread for user decision
            self.postMessage({
                type: 'overlap_detected',
                overlap: {
                    ...overlap,
                    // Don't send full strategies - too much data
                    // Main thread will re-process based on decision
                    strategies: undefined
                }
            });
            return; // Wait for user decision
        }
    }

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
            fileCount: 1,
            validationStats: {
                validRatio: validation.validRatio,
                invalidCount: validation.invalidCount
            }
        }
    });

}

/**
 * Parse a Spotify data export .zip file
 */
async function parseZipFile(file, existingStreams = null) {
    await ensureJsZipReady();
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

    // NEW: Process files in chunks to manage memory
    let allRawStreams = [];

    for (let i = 0; i < streamingFiles.length; i++) {
        const { path, entry } = streamingFiles[i];
        postProgress(`Parsing file ${i + 1}/${streamingFiles.length}...`);

        const content = await entry.async('text');
        const data = safeJsonParse(content);

        // NEW: Process in chunks if data is large
        if (data.length > 10000) {
            // Large file - process in chunks
            for (let j = 0; j < data.length; j += 10000) {
                const chunk = data.slice(j, j + 10000);
                for (const item of chunk) {
                    allRawStreams.push(item);
                }

                // Check memory and pause if needed
                await checkMemoryAndPause();

                // Send progress update
                postProgress(`Processing chunk ${Math.floor(j / 10000) + 1}/${Math.ceil(data.length / 10000)} of file ${i + 1}...`);
            }
        } else {
            for (const item of data) {
                allRawStreams.push(item);
            }
        }

        // Send partial update for incremental saving (with backpressure)
        await postWithBackpressure({
            type: 'partial',
            fileIndex: i + 1,
            totalFiles: streamingFiles.length,
            streamCount: allRawStreams.length
        });
    }

    postProgress(`Validating ${allRawStreams.length} streams...`);

    // Validate all streams with 95% threshold
    const validation = validateStreams(allRawStreams);
    if (validation.invalidCount > 0) {
        postProgress(`${validation.invalidCount} invalid entries filtered out`);
    }

    // Normalize valid streams
    let allStreams = validation.validStreams.map(stream =>
        normalizeStream(stream, 'zip')
    );

    // Check for overlap with existing data
    if (existingStreams && existingStreams.length > 0) {
        postProgress('Checking for overlap with existing data...');
        const overlap = detectTemporalOverlap(allStreams, existingStreams);

        if (overlap.hasOverlap) {
            // Send overlap info to main thread for user decision
            self.postMessage({
                type: 'overlap_detected',
                overlap: {
                    ...overlap,
                    strategies: undefined // Don't send full data over worker boundary
                }
            });
            return; // Wait for user decision
        }
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
            fileCount: streamingFiles.length,
            validationStats: {
                validRatio: validation.validRatio,
                invalidCount: validation.invalidCount
            }
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
 * Includes UTC-based time extraction for timezone-consistent analysis
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
            // Local time (legacy, for backwards compatibility)
            hour: date.getHours(),
            dayOfWeek: date.getDay(),
            // UTC time for consistent pattern detection across DST changes
            hourUTC: date.getUTCHours(),
            dayOfWeekUTC: date.getUTCDay(),
            // Timezone context for reference
            timezoneOffset: date.getTimezoneOffset(),
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
