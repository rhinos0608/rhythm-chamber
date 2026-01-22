/**
 * Pattern Detection Web Worker
 * 
 * Offloads pattern detection algorithms to a background thread to maintain
 * 60fps UI responsiveness during analysis of large datasets (100k+ streams).
 * 
 * Messages:
 *   IN:  { type: 'detect', streams: Array, chunks: Array }
 *   OUT: { type: 'progress', current: number, total: number, message: string }
 *   OUT: { type: 'complete', patterns: Object }
 *   OUT: { type: 'error', error: string }
 * 
 * @module workers/pattern-worker
 */

'use strict';

// ==========================================
// Pattern Detection Algorithms
// (Copied from patterns.js for worker isolation)
// ==========================================

/**
 * Detect comfort vs discovery ratio
 */
function detectComfortDiscoveryRatio(streams) {
    const artistPlays = {};
    streams.forEach(s => {
        const artist = s.master_metadata_album_artist_name || s.artistName || 'Unknown';
        artistPlays[artist] = (artistPlays[artist] || 0) + 1;
    });

    const artists = Object.keys(artistPlays).filter(a => a !== 'Unknown');
    const totalPlays = streams.length;
    const uniqueArtists = artists.length;
    // Guard against division by zero
    const playsPerArtist = uniqueArtists === 0 ? 0 : totalPlays / uniqueArtists;

    return {
        totalArtists: uniqueArtists,
        totalPlays: totalPlays,
        playsPerArtist: Math.round(playsPerArtist * 10) / 10,
        isComfortCurator: uniqueArtists > 0 && playsPerArtist > 50,
        isDiscoveryJunkie: uniqueArtists > 0 && playsPerArtist < 10
    };
}

/**
 * Detect eras based on weekly artist overlap
 */
function detectEras(streams, chunks) {
    if (!streams || streams.length < 100) {
        return { eras: [], eraCount: 0 };
    }

    // Group streams by week
    const byWeek = {};
    streams.forEach(s => {
        const date = new Date(s.ts || s.endTime);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekKey = weekStart.toISOString().slice(0, 10);
        if (!byWeek[weekKey]) byWeek[weekKey] = [];
        byWeek[weekKey].push(s);
    });

    const weeks = Object.keys(byWeek).sort();
    if (weeks.length < 4) return { eras: [], eraCount: 0 };

    const eras = [];
    let currentEra = { start: weeks[0], weeks: 1 };

    for (let i = 1; i < weeks.length; i++) {
        const prevArtists = new Set(
            byWeek[weeks[i - 1]].map(s => s.master_metadata_album_artist_name || s.artistName)
        );
        const currArtists = new Set(
            byWeek[weeks[i]].map(s => s.master_metadata_album_artist_name || s.artistName)
        );

        const overlap = [...prevArtists].filter(a => currArtists.has(a)).length;
        // Guard against division by zero
        const maxSize = Math.max(prevArtists.size, currArtists.size);
        const overlapRatio = maxSize === 0 ? 0 : overlap / maxSize;

        if (overlapRatio < 0.4 && currentEra.weeks >= 4) {
            currentEra.end = weeks[i - 1];
            eras.push(currentEra);
            currentEra = { start: weeks[i], weeks: 1 };
        } else {
            currentEra.weeks++;
        }
    }

    if (currentEra.weeks >= 4) {
        currentEra.end = weeks[weeks.length - 1];
        eras.push(currentEra);
    }

    return {
        eras: eras.map(e => ({
            start: e.start,
            end: e.end,
            duration: e.weeks
        })),
        eraCount: eras.length
    };
}

/**
 * Detect time of day patterns
 */
function detectTimePatterns(streams) {
    if (!streams || streams.length < 100) {
        return { morning: {}, evening: {}, hasMoodEngineerSignal: false };
    }

    const morning = {};
    const evening = {};

    streams.forEach(s => {
        const date = new Date(s.ts || s.endTime);
        // Use UTC consistently to avoid DST issues
        const hour = s.hourUTC !== undefined ? s.hourUTC : date.getUTCHours();
        const artist = s.master_metadata_album_artist_name || s.artistName || 'Unknown';

        if (hour >= 6 && hour < 12) {
            morning[artist] = (morning[artist] || 0) + 1;
        } else if (hour >= 18 || hour < 6) {
            evening[artist] = (evening[artist] || 0) + 1;
        }
    });

    const morningArtists = new Set(Object.keys(morning));
    const eveningArtists = new Set(Object.keys(evening));
    const overlap = [...morningArtists].filter(a => eveningArtists.has(a)).length;
    const overlapRatio = overlap / Math.max(morningArtists.size, eveningArtists.size, 1);

    return {
        morningTop: Object.entries(morning).sort((a, b) => b[1] - a[1]).slice(0, 5),
        eveningTop: Object.entries(evening).sort((a, b) => b[1] - a[1]).slice(0, 5),
        overlapRatio: Math.round(overlapRatio * 100),
        hasMoodEngineerSignal: overlapRatio < 0.3 && morningArtists.size >= 10 && eveningArtists.size >= 10
    };
}

/**
 * Detect weekday vs weekend patterns
 */
function detectSocialPatterns(streams) {
    if (!streams || streams.length < 100) {
        return { weekday: {}, weekend: {}, hasSocialChameleonSignal: false };
    }

    const weekday = {};
    const weekend = {};

    streams.forEach(s => {
        const date = new Date(s.ts || s.endTime);
        const day = date.getDay();
        const artist = s.master_metadata_album_artist_name || s.artistName || 'Unknown';

        if (day === 0 || day === 6) {
            weekend[artist] = (weekend[artist] || 0) + 1;
        } else {
            weekday[artist] = (weekday[artist] || 0) + 1;
        }
    });

    const weekdayArtists = new Set(Object.keys(weekday));
    const weekendArtists = new Set(Object.keys(weekend));
    const overlap = [...weekdayArtists].filter(a => weekendArtists.has(a)).length;
    const overlapRatio = overlap / Math.max(weekdayArtists.size, weekendArtists.size, 1);

    return {
        weekdayTop: Object.entries(weekday).sort((a, b) => b[1] - a[1]).slice(0, 5),
        weekendTop: Object.entries(weekend).sort((a, b) => b[1] - a[1]).slice(0, 5),
        overlapRatio: Math.round(overlapRatio * 100),
        hasSocialChameleonSignal: overlapRatio < 0.4
    };
}

/**
 * Detect ghosted artists
 */
function detectGhostedArtists(streams) {
    if (!streams || streams.length < 100) {
        return { ghosted: [], ghostedCount: 0 };
    }

    // Find dataset boundaries using iterative reduce (avoids stack overflow with large arrays)
    const maxTime = streams.reduce((max, s) => {
        const time = new Date(s.ts || s.endTime).getTime();
        return time > max ? time : max;
    }, -Infinity);
    const endDate = maxTime === -Infinity ? new Date() : new Date(maxTime);
    const oneYearAgo = new Date(endDate);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    // Guardrail: 7 days before dataset end
    const guardrailDate = new Date(endDate);
    guardrailDate.setDate(guardrailDate.getDate() - 7);

    const artistData = {};
    streams.forEach(s => {
        const artist = s.master_metadata_album_artist_name || s.artistName;
        if (!artist || artist === 'Unknown') return;

        const date = new Date(s.ts || s.endTime);
        if (!artistData[artist]) {
            artistData[artist] = { plays: 0, lastPlay: date, firstPlay: date };
        }
        artistData[artist].plays++;
        if (date > artistData[artist].lastPlay) artistData[artist].lastPlay = date;
        if (date < artistData[artist].firstPlay) artistData[artist].firstPlay = date;
    });

    const ghosted = [];
    const activeUntilEnd = [];

    Object.entries(artistData).forEach(([artist, data]) => {
        // Skip if active until near end of dataset (7-day guardrail)
        if (data.lastPlay >= guardrailDate) {
            activeUntilEnd.push(artist);
            return;
        }

        // Ghosted = 100+ plays but not played in last year of dataset
        if (data.plays >= 100 && data.lastPlay < oneYearAgo) {
            ghosted.push({
                name: artist,
                plays: data.plays,
                lastPlay: data.lastPlay.toISOString().slice(0, 10)
            });
        }
    });

    return {
        ghosted: ghosted.sort((a, b) => b.plays - a.plays).slice(0, 10),
        ghostedCount: ghosted.length,
        activeUntilEnd: activeUntilEnd.length
    };
}

/**
 * Detect discovery explosions
 */
function detectDiscoveryExplosions(streams, chunks) {
    if (!streams || streams.length < 100) {
        return { explosions: [], explosionCount: 0 };
    }

    const byMonth = {};
    const seenArtists = new Set();

    // Sort by date first
    const sorted = [...streams].sort((a, b) =>
        new Date(a.ts || a.endTime) - new Date(b.ts || b.endTime)
    );

    sorted.forEach(s => {
        const date = new Date(s.ts || s.endTime);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const artist = s.master_metadata_album_artist_name || s.artistName;

        if (!byMonth[monthKey]) {
            byMonth[monthKey] = { newArtists: 0, totalPlays: 0 };
        }

        byMonth[monthKey].totalPlays++;
        if (artist && !seenArtists.has(artist)) {
            seenArtists.add(artist);
            byMonth[monthKey].newArtists++;
        }
    });

    // Calculate baseline new artist rate
    const months = Object.keys(byMonth).sort();
    const newArtistCounts = months.map(m => byMonth[m].newArtists);
    const avgNewArtists = newArtistCounts.reduce((a, b) => a + b, 0) / newArtistCounts.length;

    const explosions = months
        .filter(m => byMonth[m].newArtists > avgNewArtists * 3)
        .map(m => ({
            month: m,
            newArtists: byMonth[m].newArtists,
            avgForPeriod: Math.round(avgNewArtists)
        }));

    return {
        explosions,
        explosionCount: explosions.length
    };
}

/**
 * Detect mood searching (5+ skips in 10 minutes)
 */
function detectMoodSearching(streams) {
    if (!streams || streams.length < 50) {
        return { sessions: 0, hasMoodSearchingSignal: false };
    }

    const sorted = [...streams].sort((a, b) =>
        new Date(a.ts || a.endTime) - new Date(b.ts || b.endTime)
    );

    let moodSearchSessions = 0;
    let windowStart = 0;
    let skipsInWindow = 0;

    for (let i = 0; i < sorted.length; i++) {
        const currTime = new Date(sorted[i].ts || sorted[i].endTime).getTime();
        const windowStartTime = new Date(sorted[windowStart].ts || sorted[windowStart].endTime).getTime();

        // Reset window if more than 10 minutes
        if (currTime - windowStartTime > 10 * 60 * 1000) {
            if (skipsInWindow >= 5) moodSearchSessions++;
            windowStart = i;
            skipsInWindow = 0;
        }

        if (sorted[i].skipped || (sorted[i].ms_played || sorted[i].msPlayed) < 30000) {
            skipsInWindow++;
        }
    }

    // Evaluate final window after loop ends
    if (skipsInWindow >= 5) {
        moodSearchSessions++;
    }

    return {
        sessions: moodSearchSessions,
        hasMoodSearchingSignal: moodSearchSessions >= 3
    };
}

/**
 * Detect true favorites
 */
function detectTrueFavorites(streams) {
    if (!streams || streams.length < 50) {
        return { favorites: [], favoritesCount: 0 };
    }

    const trackData = {};
    streams.forEach(s => {
        const track = s.master_metadata_track_name || s.trackName;
        const artist = s.master_metadata_album_artist_name || s.artistName;
        if (!track || !artist) return;

        const key = `${track}|||${artist}`;
        if (!trackData[key]) {
            trackData[key] = { plays: 0, completed: 0, skipped: 0, totalMs: 0 };
        }
        trackData[key].plays++;
        trackData[key].totalMs += s.ms_played || s.msPlayed || 0;

        if (s.skipped) {
            trackData[key].skipped++;
        } else if ((s.ms_played || s.msPlayed || 0) > 30000) {
            trackData[key].completed++;
        }
    });

    const favorites = Object.entries(trackData)
        .filter(([, data]) => data.plays >= 10 && data.completed / data.plays > 0.8)
        .map(([key, data]) => {
            const [track, artist] = key.split('|||');
            return {
                track,
                artist,
                plays: data.plays,
                completionRate: Math.round((data.completed / data.plays) * 100)
            };
        })
        .sort((a, b) => b.plays - a.plays)
        .slice(0, 10);

    return {
        favorites,
        favoritesCount: favorites.length
    };
}

/**
 * Generate data insights summary
 */
function generateDataInsights(streams) {
    if (!streams || streams.length === 0) {
        return null;
    }

    const totalMs = streams.reduce((sum, s) => sum + (s.ms_played || s.msPlayed || 0), 0);
    const totalMinutes = Math.round(totalMs / 60000);

    const artistPlays = {};
    streams.forEach(s => {
        const artist = s.master_metadata_album_artist_name || s.artistName || 'Unknown';
        artistPlays[artist] = (artistPlays[artist] || 0) + 1;
    });

    const topArtist = Object.entries(artistPlays).sort((a, b) => b[1] - a[1])[0];

    // Day of week distribution
    const dayCount = [0, 0, 0, 0, 0, 0, 0];
    streams.forEach(s => {
        const day = new Date(s.ts || s.endTime).getDay();
        dayCount[day]++;
    });
    const peakDayIndex = dayCount.indexOf(Math.max(...dayCount));
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return {
        totalMinutes,
        totalStreams: streams.length,
        topArtist: topArtist ? { name: topArtist[0], plays: topArtist[1] } : null,
        peakDay: days[peakDayIndex],
        uniqueArtists: Object.keys(artistPlays).length
    };
}

/**
 * Generate pattern summary
 */
function generatePatternSummary(streams, patterns) {
    // Use iterative reduce to find min/max timestamps (avoids stack overflow with large arrays)
    let minTime = Infinity;
    let maxTime = -Infinity;
    for (const s of streams) {
        const time = new Date(s.ts || s.endTime).getTime();
        if (time < minTime) minTime = time;
        if (time > maxTime) maxTime = time;
    }
    const startDate = minTime === Infinity ? new Date() : new Date(minTime);
    const endDate = maxTime === -Infinity ? new Date() : new Date(maxTime);

    return {
        streamCount: streams.length,
        dateRange: {
            start: startDate.toISOString().slice(0, 10),
            end: endDate.toISOString().slice(0, 10)
        },
        signals: {
            hasEras: (patterns.eras?.eraCount || 0) > 1,
            hasGhosted: (patterns.ghosted?.ghostedCount || 0) > 0,
            hasMoodEngineer: patterns.timePatterns?.hasMoodEngineerSignal || false,
            hasSocialChameleon: patterns.socialPatterns?.hasSocialChameleonSignal || false,
            hasDiscoveryExplosions: (patterns.discoveryExplosions?.explosionCount || 0) > 0
        }
    };
}

/**
 * Run all pattern detection with partial result emission
 * HNW Wave: Emits partial results after each pattern, allowing recovery if worker hangs
 *
 * @param {Array} streams - Stream data
 * @param {Array} chunks - Chunk data
 * @param {Function} onProgress - Progress callback
 * @param {Function} onPartial - Partial result callback (pattern name, result, progress %)
 */
function detectAllPatterns(streams, chunks, onProgress = null, onPartial = null) {
    const patternNames = [
        'ratio',
        'eras',
        'timePatterns',
        'socialPatterns',
        'ghosted',
        'discoveryExplosions',
        'moodSearching',
        'trueFavorites',
        'insights',
        'summary'
    ];
    const total = patternNames.length;
    let current = 0;

    const patterns = {};

    const emitPartial = (patternName, result) => {
        patterns[patternName] = result;
        current++;
        if (onPartial) {
            onPartial(patternName, result, current / total);
        }
    };

    if (onProgress) onProgress(current, total, 'Analyzing listening ratio...');
    emitPartial('ratio', detectComfortDiscoveryRatio(streams));

    if (onProgress) onProgress(current, total, 'Detecting listening eras...');
    emitPartial('eras', detectEras(streams, chunks));

    if (onProgress) onProgress(current, total, 'Analyzing time patterns...');
    emitPartial('timePatterns', detectTimePatterns(streams));

    if (onProgress) onProgress(current, total, 'Detecting social patterns...');
    emitPartial('socialPatterns', detectSocialPatterns(streams));

    if (onProgress) onProgress(current, total, 'Finding ghosted artists...');
    emitPartial('ghosted', detectGhostedArtists(streams));

    if (onProgress) onProgress(current, total, 'Detecting discovery explosions...');
    emitPartial('discoveryExplosions', detectDiscoveryExplosions(streams, chunks));

    if (onProgress) onProgress(current, total, 'Analyzing mood searching...');
    emitPartial('moodSearching', detectMoodSearching(streams));

    if (onProgress) onProgress(current, total, 'Finding true favorites...');
    emitPartial('trueFavorites', detectTrueFavorites(streams));

    if (onProgress) onProgress(current, total, 'Generating insights...');
    emitPartial('insights', generateDataInsights(streams));

    if (onProgress) onProgress(current, total, 'Generating summary...');
    emitPartial('summary', generatePatternSummary(streams, patterns));

    return patterns;
}

// ==========================================
// Worker Message Handler
// ==========================================

// Dedicated heartbeat port (set when HEARTBEAT_CHANNEL message received)
let heartbeatPort = null;

self.onmessage = function (e) {
    const { type, requestId, streams, chunks, timestamp, port } = e.data;

    // Handle heartbeat channel setup (dedicated MessageChannel)
    if (type === 'HEARTBEAT_CHANNEL') {
        // Get port from e.ports[0] (transferred port), fallback to e.data.port
        heartbeatPort = e.ports && e.ports[0] ? e.ports[0] : (e.data && e.data.port);
        heartbeatPort.onmessage = function(event) {
            if (event.data.type === 'HEARTBEAT') {
                heartbeatPort.postMessage({
                    type: 'HEARTBEAT_RESPONSE',
                    timestamp: event.data.timestamp || Date.now()
                });
            }
        };
        console.log('[PatternWorker] Dedicated heartbeat channel established');
        return;
    }

    // Handle legacy heartbeat request (fallback when MessageChannel unavailable)
    if (type === 'HEARTBEAT') {
        self.postMessage({
            type: 'HEARTBEAT_RESPONSE',
            timestamp
        });
        return;
    }

    // Handle both 'detect' (legacy) and 'DETECT_PATTERNS' (pool) message types
    if (type === 'detect' || type === 'DETECT_PATTERNS') {
        try {
            // Progress callback
            const onProgress = (current, total, message) => {
                self.postMessage({ type: 'progress', requestId, current, total, message });
            };

            // Partial result callback - emit as each pattern completes
            // HNW Wave: Allows saving work if worker is terminated
            const onPartial = (patternName, result, progressPercent) => {
                self.postMessage({
                    type: 'partial',
                    requestId,
                    pattern: patternName,
                    result,
                    progress: progressPercent
                });
            };

            const patterns = detectAllPatterns(streams, chunks, onProgress, onPartial);

            self.postMessage({ type: 'complete', requestId, patterns });
        } catch (error) {
            self.postMessage({ type: 'error', requestId, error: error.message });
        }
    }
};

console.log('[PatternWorker] Worker loaded with partial result streaming and dedicated heartbeat support');
