/**
 * Pattern Validators Module
 * Validates and categorizes behavioral patterns with rule-based analysis.
 * @module patterns/pattern-validators
 */

/**
 * Detect time-of-day listening patterns
 * Morning vs evening overlap <30% = mood engineer signal
 *
 * Uses UTC hours for consistency across DST transitions
 * Requires minimum 100 streams in each time bucket to avoid false positives
 *
 * @param {Array} streams - Array of stream objects
 * @returns {Object} Time pattern analysis with mood engineer detection
 */
export function detectTimePatterns(streams) {
    const morningArtists = new Set(); // 5am - 11am UTC
    const eveningArtists = new Set(); // 6pm - 11pm UTC

    const morningStreams = [];
    const eveningStreams = [];

    for (const stream of streams) {
        if (!stream) continue;
        // Use UTC hour for DST-resistant analysis; fallback to local for legacy data
        const hour = stream.hourUTC ?? stream.hour;

        if (hour >= 5 && hour < 12) {
            morningArtists.add(stream.artistName);
            morningStreams.push(stream);
        } else if (hour >= 18 && hour < 24) {
            eveningArtists.add(stream.artistName);
            eveningStreams.push(stream);
        }
    }

    const intersection = [...morningArtists].filter(a => eveningArtists.has(a));
    const overlap = morningArtists.size > 0
        ? intersection.length / morningArtists.size
        : 0;

    // Require minimum 100 streams in each bucket to avoid false positives from sparse data
    const MIN_STREAMS_THRESHOLD = 100;
    const hasEnoughData = morningStreams.length >= MIN_STREAMS_THRESHOLD &&
        eveningStreams.length >= MIN_STREAMS_THRESHOLD;

    return {
        morningArtistCount: morningArtists.size,
        eveningArtistCount: eveningArtists.size,
        morningStreamCount: morningStreams.length,
        eveningStreamCount: eveningStreams.length,
        overlap: Math.round(overlap * 100),
        // Only flag as mood engineer if we have enough data to be confident
        isMoodEngineer: hasEnoughData && overlap < 0.3 && morningArtists.size > 5 && eveningArtists.size > 5,
        hasEnoughData,
        description: !hasEnoughData
            ? `Need more listening data for time pattern analysis`
            : overlap < 0.3
                ? `Morning vs evening overlap: only ${Math.round(overlap * 100)}% — you use music to set your mood`
                : `${Math.round(overlap * 100)}% overlap between morning and evening listening`
    };
}

/**
 * Detect weekday vs weekend patterns
 * <40% overlap = social chameleon signal
 *
 * @param {Array} streams - Array of stream objects
 * @returns {Object} Social pattern analysis with chameleon detection
 */
export function detectSocialPatterns(streams) {
    const weekdayArtists = new Set();
    const weekendArtists = new Set();

    for (const stream of streams) {
        if (!stream) continue;
        const day = stream.dayOfWeek;

        if (day === 0 || day === 6) {
            weekendArtists.add(stream.artistName);
        } else {
            weekdayArtists.add(stream.artistName);
        }
    }

    const intersection = [...weekdayArtists].filter(a => weekendArtists.has(a));
    const overlap = weekdayArtists.size > 0
        ? intersection.length / weekdayArtists.size
        : 0;

    return {
        weekdayArtistCount: weekdayArtists.size,
        weekendArtistCount: weekendArtists.size,
        overlap: Math.round(overlap * 100),
        isSocialChameleon: overlap < 0.4 && weekdayArtists.size > 10 && weekendArtists.size > 10,
        description: overlap < 0.4
            ? `Weekday ≠ weekend: only ${Math.round(overlap * 100)}% overlap — your music shifts by context`
            : `${Math.round(overlap * 100)}% overlap between weekday and weekend listening`
    };
}

/**
 * Detect mood searching (5+ skips in 10 minutes)
 *
 * @param {Array} streams - Array of stream objects
 * @returns {Object} Mood searching analysis with cluster information
 */
export function detectMoodSearching(streams) {
    const clusters = [];

    if (!streams || streams.length < 6) {
        return {
            clusters,
            count: 0,
            hasMoodSearching: false,
            description: null
        };
    }

    for (let i = 0; i < streams.length - 5; i++) {
        const window = streams.slice(i, i + 6);

        const start = new Date(window[0]?.playedAt || Date.now());
        const end = new Date(window[window.length - 1]?.playedAt || Date.now());
        const spanMinutes = (end - start) / 60000;

        if (spanMinutes <= 10) {
            const skips = window.filter(s => s.playType === 'skip' || s.msPlayed < 30000).length;

            if (skips >= 5) {
                clusters.push({
                    timestamp: window[0].playedAt,
                    date: window[0].date,
                    skips,
                    spanMinutes: Math.round(spanMinutes)
                });
                i += 5; // Skip ahead to avoid overlapping clusters
            }
        }
    }

    return {
        clusters,
        count: clusters.length,
        hasMoodSearching: clusters.length >= 10,
        description: clusters.length >= 10
            ? `${clusters.length} moments of rapid skipping detected — searching for the right feeling`
            : clusters.length > 0
                ? `${clusters.length} skip clusters found`
                : null
    };
}

/**
 * Detect true favorites (high engagement, not just high plays)
 *
 * @param {Array} streams - Array of stream objects
 * @returns {Object} True favorites analysis with engagement metrics
 */
export function detectTrueFavorites(streams) {
    const artistStats = {};

    for (const stream of streams) {
        if (!stream) continue;
        const artist = stream.artistName;

        if (!artistStats[artist]) {
            artistStats[artist] = {
                plays: 0,
                totalCompletion: 0,
                fullPlays: 0
            };
        }

        artistStats[artist].plays++;
        artistStats[artist].totalCompletion += stream.completionRate || 0;
        if (stream.playType === 'full' || stream.completionRate > 0.9) {
            artistStats[artist].fullPlays++;
        }
    }

    // Calculate average completion rate
    const artistEngagement = Object.entries(artistStats)
        .filter(([_, stats]) => stats.plays >= 20)
        .map(([artist, stats]) => ({
            artist,
            plays: stats.plays,
            avgCompletion: stats.totalCompletion / stats.plays,
            fullPlayRate: stats.fullPlays / stats.plays
        }))
        .sort((a, b) => b.avgCompletion - a.avgCompletion);

    const topByPlays = Object.entries(artistStats)
        .sort((a, b) => b[1].plays - a[1].plays)[0];

    const topByEngagement = artistEngagement[0];

    const mismatch = topByPlays && topByEngagement &&
        topByPlays[0] !== topByEngagement.artist;

    return {
        topByPlays: topByPlays ? { artist: topByPlays[0], plays: topByPlays[1].plays } : null,
        topByEngagement,
        hasMismatch: mismatch,
        description: mismatch
            ? `You play ${topByPlays[0]} the most, but you're more engaged with ${topByEngagement.artist}`
            : null
    };
}
