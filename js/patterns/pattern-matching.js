/**
 * Pattern Matching Module
 * Matches patterns to tracks using similarity algorithms and generates insights.
 * @module patterns/pattern-matching
 */

/**
 * Detect patterns from Spotify API data (Quick Snapshot)
 * Works with limited data: recent 50 tracks + top artists/tracks
 *
 * @param {Object} liteData - Object containing recentStreams, topArtists, topTracks, profile
 * @returns {Object} Lite pattern detection results with diversity, obsession, stability, etc.
 */
export function detectLitePatterns(liteData) {
    const { recentStreams, topArtists, topTracks } = liteData;

    // 1. Diversity in recent plays
    const recentArtists = new Set(recentStreams.filter(s => s != null).map(s => s.artistName));
    const diversityRatio = recentStreams.length > 0
        ? recentArtists.size / recentStreams.length
        : 0;

    const diversity = {
        uniqueArtists: recentArtists.size,
        totalPlays: recentStreams.length,
        ratio: Math.round(diversityRatio * 100),
        isHighDiversity: diversityRatio > 0.6,
        isLowDiversity: diversityRatio < 0.3,
        signal: diversityRatio > 0.6 ? 'explorer' : diversityRatio < 0.3 ? 'repeater' : 'balanced',
        description: diversityRatio > 0.6
            ? `${recentArtists.size} different artists in your last ${recentStreams.length} plays — always exploring`
            : diversityRatio < 0.3
                ? `Only ${recentArtists.size} artists in your last ${recentStreams.length} plays — deep in the favorites`
                : `Balanced mix of ${recentArtists.size} artists in recent listening`
    };

    // 2. Current obsession (most repeated artist in recent)
    const recentArtistCounts = {};
    for (const stream of recentStreams) {
        if (!stream) continue;
        recentArtistCounts[stream.artistName] = (recentArtistCounts[stream.artistName] || 0) + 1;
    }
    const sortedRecent = Object.entries(recentArtistCounts)
        .sort((a, b) => b[1] - a[1]);

    const currentObsession = sortedRecent[0] ? {
        artist: sortedRecent[0][0],
        plays: sortedRecent[0][1],
        percentage: Math.round((sortedRecent[0][1] / recentStreams.length) * 100),
        isObsessed: sortedRecent[0][1] >= 10, // 10+ plays in last 50 = obsession
        description: sortedRecent[0][1] >= 10
            ? `Currently obsessed with ${sortedRecent[0][0]} — ${sortedRecent[0][1]} plays recently`
            : `Top recent artist: ${sortedRecent[0][0]}`
    } : null;

    // 3. Taste stability (compare short-term vs long-term top artists)
    const shortTermNames = new Set((topArtists.shortTerm || []).filter(a => a != null).map(a => a.name));
    const longTermNames = new Set((topArtists.longTerm || []).filter(a => a != null).map(a => a.name));

    const stableArtists = [...shortTermNames].filter(name => longTermNames.has(name));
    const stabilityRatio = shortTermNames.size > 0
        ? stableArtists.length / shortTermNames.size
        : 0;

    const tasteStability = {
        shortTermCount: shortTermNames.size,
        longTermCount: longTermNames.size,
        stableCount: stableArtists.length,
        ratio: Math.round(stabilityRatio * 100),
        isStable: stabilityRatio > 0.5,
        isShifting: stabilityRatio < 0.2,
        stableArtists: stableArtists?.slice(0, 5) || [],
        signal: stabilityRatio > 0.5 ? 'stable' : stabilityRatio < 0.2 ? 'shifting' : 'evolving',
        description: stabilityRatio > 0.5
            ? `${Math.round(stabilityRatio * 100)}% of your current favorites are all-time favorites — you know your taste`
            : stabilityRatio < 0.2
                ? `Only ${Math.round(stabilityRatio * 100)}% overlap with all-time favorites — your taste is shifting`
                : `Your taste is evolving — ${stableArtists.length} artists remain from your all-time favorites`
    };

    // 4. Rising stars (in short-term but not long-term)
    const shortTermOnly = (topArtists.shortTerm || [])
        .filter(a => a != null && !longTermNames.has(a.name))
        ?.slice(0, 5) || [];

    const risingStars = {
        artists: shortTermOnly.map(a => ({ name: a.name, genres: a.genres })),
        count: shortTermOnly.length,
        hasNew: shortTermOnly.length > 3,
        description: shortTermOnly.length > 3
            ? `${shortTermOnly.length} new artists in your rotation: ${shortTermOnly?.slice(0, 3)?.map(a => a.name).join(', ') || ''}`
            : null
    };

    // 5. Genre consistency
    const allGenres = [];
    (topArtists.shortTerm || []).forEach(a => {
        if (!a) return;
        allGenres.push(...(a.genres || []));
    });
    const genreCounts = {};
    for (const genre of allGenres) {
        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
    }
    const topGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        ?.slice(0, 5)
        ?.map(([genre, count]) => ({ genre, count })) || [];

    const genreProfile = {
        topGenres,
        hasGenreData: topGenres.length > 0,
        description: topGenres.length > 0
            ? `Your current sound: ${topGenres?.slice(0, 3)?.map(g => g.genre).join(', ') || ''}`
            : null
    };

    // Collect all evidence
    const evidence = [];
    if (diversity.description) evidence.push(diversity.description);
    if (currentObsession?.description && currentObsession.isObsessed) evidence.push(currentObsession.description);
    if (tasteStability.description) evidence.push(tasteStability.description);
    if (risingStars.description) evidence.push(risingStars.description);
    if (genreProfile.description) evidence.push(genreProfile.description);

    return {
        diversity,
        currentObsession,
        tasteStability,
        risingStars,
        genreProfile,
        evidence,
        isLiteData: true,
        summary: generateLiteSummaryInternal(liteData, { diversity, tasteStability, topGenres })
    };
}

/**
 * Generate summary for lite data (internal helper)
 *
 * @param {Object} liteData - Object containing recentStreams, topArtists, topTracks, profile
 * @param {Object} patterns - Detected patterns for lite data
 * @returns {Object} Summary with display info and top artists/tracks/genres
 */
function generateLiteSummaryInternal(liteData, patterns) {
    const { recentStreams, topArtists, topTracks, profile } = liteData;

    return {
        displayName: profile?.displayName || 'Music Lover',
        recentTrackCount: recentStreams.length,
        topArtistCount: topArtists.shortTerm?.length || 0,
        topTrackCount: topTracks.shortTerm?.length || 0,
        topArtists: topArtists.shortTerm?.slice(0, 5)?.map(a => a?.name) || [],
        topTracks: topTracks.shortTerm?.slice(0, 5)?.map(t => `${t?.name} by ${t?.artist}`) || [],
        topGenres: patterns.topGenres?.slice(0, 3)?.map(g => g?.genre) || [],
        diversitySignal: patterns.diversity.signal,
        stabilitySignal: patterns.tasteStability.signal,
        isLiteData: true,
        fetchedAt: liteData.fetchedAt
    };
}

/**
 * Detect immediate vibe from first 5 minutes of data
 * Used for instant insight in Quick Snapshot mode
 *
 * @param {Object} liteData - Object containing recentStreams, topArtists, topTracks
 * @returns {string} Immediate insight text
 */
export function detectImmediateVibe(liteData) {
    const { recentStreams, topArtists, topTracks } = liteData;

    if (!recentStreams || recentStreams.length === 0) {
        return "Upload your data to see your music personality!";
    }

    // Get first 5 minutes worth of streams (or all if less)
    const first5MinStreams = recentStreams.slice(0, 15); // Approx 15 streams for 5 mins

    // Analyze diversity
    const uniqueArtists = new Set(first5MinStreams.filter(s => s != null).map(s => s.artistName)).size;
    const totalStreams = first5MinStreams.length;
    const diversityRatio = uniqueArtists / totalStreams;

    // Analyze current obsession
    const artistCounts = {};
    first5MinStreams.forEach(s => {
        if (!s) return;
        artistCounts[s.artistName] = (artistCounts[s.artistName] || 0) + 1;
    });
    const sortedArtists = Object.entries(artistCounts).sort((a, b) => b[1] - a[1]);
    const topArtist = sortedArtists[0];

    // Analyze genres
    const allGenres = [];
    (topArtists.shortTerm || []).forEach(a => {
        if (!a) return;
        allGenres.push(...(a.genres || []));
    });
    const genreCounts = {};
    for (const genre of allGenres) {
        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
    }
    const topGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        ?.slice(0, 3)
        ?.map(([genre]) => genre) || [];

    // Generate instant insight
    let insight = "";

    // Diversity insight
    if (diversityRatio > 0.6) {
        insight += "You're exploring new sounds - always discovering fresh artists! ";
    } else if (diversityRatio < 0.3) {
        insight += `You're deep in your favorites - ${topArtist[0]} is on repeat! `;
    } else {
        insight += "Balanced mix of familiar and new music. ";
    }

    // Genre insight
    if (topGenres.length > 0) {
        insight += `Your current vibe: ${topGenres.join(", ")}. `;
    }

    // Engagement insight
    // Guard against division by zero
    const avgCompletion = first5MinStreams.length > 0
        ? first5MinStreams.reduce((sum, s) => sum + (s?.completionRate || 0), 0) / first5MinStreams.length
        : 0;
    if (avgCompletion > 0.8) {
        insight += "You're fully engaged with your music! ";
    } else if (avgCompletion < 0.5) {
        insight += "Lots of skipping - searching for the right mood. ";
    }

    return insight.trim();
}
