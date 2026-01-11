/**
 * Pattern Detection Module
 * Detects behavioral patterns from listening data
 */

/**
 * Detect comfort vs discovery ratio
 * > 50 plays per artist = comfort curator
 * < 10 plays per artist = discovery junkie
 */
function detectComfortDiscoveryRatio(streams) {
    const artistPlays = {};

    for (const stream of streams) {
        artistPlays[stream.artistName] = (artistPlays[stream.artistName] || 0) + 1;
    }

    const uniqueArtists = Object.keys(artistPlays).length;
    const totalPlays = streams.length;
    const ratio = uniqueArtists > 0 ? totalPlays / uniqueArtists : 0;

    return {
        ratio: Math.round(ratio * 10) / 10,
        totalPlays,
        uniqueArtists,
        isComfortCurator: ratio > 50,
        isDiscoveryJunkie: ratio < 10,
        signal: ratio > 50 ? 'comfort' : ratio < 10 ? 'discovery' : 'balanced',
        description: ratio > 50
            ? `You average ${Math.round(ratio)} plays per artist — you know what you love`
            : ratio < 10
                ? `Only ${Math.round(ratio)} plays per artist — always seeking new sounds`
                : `${Math.round(ratio)} plays per artist — balanced explorer`
    };
}

/**
 * Detect distinct listening eras based on week-over-week artist overlap
 * Era = period where top artists changed <40% week-over-week
 */
function detectEras(streams, chunks) {
    const weeklyChunks = chunks
        .filter(c => c.type === 'weekly')
        .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    if (weeklyChunks.length < 4) {
        return { eras: [], hasEras: false };
    }

    const eras = [];
    let currentEra = {
        start: weeklyChunks[0].startDate,
        end: weeklyChunks[0].startDate,
        topArtists: weeklyChunks[0].topArtists || [],
        weeks: 1
    };

    for (let i = 1; i < weeklyChunks.length; i++) {
        const prev = weeklyChunks[i - 1];
        const curr = weeklyChunks[i];

        const prevArtists = new Set(prev.artists || []);
        const currArtists = new Set(curr.artists || []);

        const intersection = [...prevArtists].filter(a => currArtists.has(a));
        const overlap = prevArtists.size > 0 ? intersection.length / prevArtists.size : 1;

        if (overlap < 0.4) {
            // New era starts
            if (currentEra.weeks >= 3) {
                eras.push(currentEra);
            }
            currentEra = {
                start: curr.startDate,
                end: curr.startDate,
                topArtists: curr.topArtists || [],
                weeks: 1
            };
        } else {
            currentEra.end = curr.startDate;
            currentEra.weeks++;
        }
    }

    // Add final era
    if (currentEra.weeks >= 3) {
        eras.push(currentEra);
    }

    return {
        eras,
        hasEras: eras.length >= 3,
        eraCount: eras.length,
        description: eras.length >= 3
            ? `${eras.length} distinct listening eras detected — you mark time through sound`
            : eras.length > 0
                ? `${eras.length} listening phases found`
                : 'Consistent listening taste over time'
    };
}

/**
 * Detect time-of-day listening patterns
 * Morning vs evening overlap <30% = mood engineer signal
 */
function detectTimePatterns(streams) {
    const morningArtists = new Set(); // 5am - 11am
    const eveningArtists = new Set(); // 6pm - 11pm

    const morningStreams = [];
    const eveningStreams = [];

    for (const stream of streams) {
        const hour = stream.hour;

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

    return {
        morningArtistCount: morningArtists.size,
        eveningArtistCount: eveningArtists.size,
        overlap: Math.round(overlap * 100),
        isMoodEngineer: overlap < 0.3 && morningArtists.size > 5 && eveningArtists.size > 5,
        description: overlap < 0.3
            ? `Morning vs evening overlap: only ${Math.round(overlap * 100)}% — you use music to set your mood`
            : `${Math.round(overlap * 100)}% overlap between morning and evening listening`
    };
}

/**
 * Detect weekday vs weekend patterns
 * <40% overlap = social chameleon signal
 */
function detectSocialPatterns(streams) {
    const weekdayArtists = new Set();
    const weekendArtists = new Set();

    for (const stream of streams) {
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
 * Detect ghosted artists (100+ plays → 0 plays for 1+ year)
 */
function detectGhostedArtists(streams) {
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    // Build artist timelines
    const artistData = {};

    for (const stream of streams) {
        const artist = stream.artistName;
        const date = new Date(stream.playedAt);

        if (!artistData[artist]) {
            artistData[artist] = {
                plays: 0,
                firstPlay: date,
                lastPlay: date,
                peakMonth: null,
                peakPlays: 0
            };
        }

        artistData[artist].plays++;
        artistData[artist].lastPlay = date;

        // Track peak month
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
        artistData[artist].months = artistData[artist].months || {};
        artistData[artist].months[monthKey] = (artistData[artist].months[monthKey] || 0) + 1;
    }

    // Find ghosted artists
    const ghosted = [];

    for (const [artist, data] of Object.entries(artistData)) {
        if (data.plays >= 100 && data.lastPlay < oneYearAgo) {
            // Check for cliff decline (sudden stop vs gradual fade)
            const months = Object.entries(data.months || {}).sort((a, b) => a[0].localeCompare(b[0]));
            const lastMonths = months.slice(-3);
            const peakMonths = months.sort((a, b) => b[1] - a[1]).slice(0, 3);

            ghosted.push({
                artist,
                totalPlays: data.plays,
                lastPlayed: data.lastPlay.toISOString().split('T')[0],
                daysSince: Math.floor((now - data.lastPlay) / (24 * 60 * 60 * 1000))
            });
        }
    }

    // Sort by play count
    ghosted.sort((a, b) => b.totalPlays - a.totalPlays);

    return {
        ghosted: ghosted.slice(0, 5),
        hasGhosted: ghosted.length > 0,
        count: ghosted.length,
        description: ghosted.length > 0
            ? `${ghosted.length} artist(s) you used to love but haven't played in over a year`
            : null
    };
}

/**
 * Detect discovery explosions (3x normal new artist rate)
 */
function detectDiscoveryExplosions(streams, chunks) {
    const monthlyChunks = chunks
        .filter(c => c.type === 'monthly')
        .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    if (monthlyChunks.length < 6) {
        return { explosions: [], hasExplosions: false };
    }

    // Track when each artist was first heard
    const artistFirstHeard = {};
    for (const stream of streams) {
        const artist = stream.artistName;
        const date = stream.date;
        if (!artistFirstHeard[artist] || date < artistFirstHeard[artist]) {
            artistFirstHeard[artist] = date;
        }
    }

    // Calculate new artist rate per month
    const monthlyNewArtists = {};
    for (const [artist, firstDate] of Object.entries(artistFirstHeard)) {
        const monthKey = firstDate.substring(0, 7);
        monthlyNewArtists[monthKey] = (monthlyNewArtists[monthKey] || 0) + 1;
    }

    const rates = Object.values(monthlyNewArtists);
    const median = rates.sort((a, b) => a - b)[Math.floor(rates.length / 2)] || 10;

    const explosions = [];
    for (const [month, count] of Object.entries(monthlyNewArtists)) {
        if (count >= median * 3) {
            explosions.push({
                month,
                newArtists: count,
                multiplier: Math.round(count / median * 10) / 10
            });
        }
    }

    explosions.sort((a, b) => b.newArtists - a.newArtists);

    return {
        explosions: explosions.slice(0, 3),
        hasExplosions: explosions.length > 0,
        baselineRate: median,
        description: explosions.length > 0
            ? `Discovery explosion${explosions.length > 1 ? 's' : ''} detected — ${explosions[0].newArtists} new artists in ${explosions[0].month}`
            : null
    };
}

/**
 * Detect mood searching (5+ skips in 10 minutes)
 */
function detectMoodSearching(streams) {
    const clusters = [];

    for (let i = 0; i < streams.length - 5; i++) {
        const window = streams.slice(i, i + 6);

        const start = new Date(window[0].playedAt);
        const end = new Date(window[window.length - 1].playedAt);
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
 */
function detectTrueFavorites(streams) {
    const artistStats = {};

    for (const stream of streams) {
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

/**
 * Run all pattern detection and return summary
 */
function detectAllPatterns(streams, chunks) {
    const patterns = {
        comfortDiscovery: detectComfortDiscoveryRatio(streams),
        eras: detectEras(streams, chunks),
        timePatterns: detectTimePatterns(streams),
        socialPatterns: detectSocialPatterns(streams),
        ghostedArtists: detectGhostedArtists(streams),
        discoveryExplosions: detectDiscoveryExplosions(streams, chunks),
        moodSearching: detectMoodSearching(streams),
        trueFavorites: detectTrueFavorites(streams)
    };

    // Collect evidence descriptions
    const evidence = [];

    if (patterns.comfortDiscovery.description) {
        evidence.push(patterns.comfortDiscovery.description);
    }
    if (patterns.eras.description && patterns.eras.hasEras) {
        evidence.push(patterns.eras.description);
    }
    if (patterns.timePatterns.isMoodEngineer) {
        evidence.push(patterns.timePatterns.description);
    }
    if (patterns.socialPatterns.isSocialChameleon) {
        evidence.push(patterns.socialPatterns.description);
    }
    if (patterns.ghostedArtists.description) {
        evidence.push(patterns.ghostedArtists.description);
    }
    if (patterns.discoveryExplosions.description) {
        evidence.push(patterns.discoveryExplosions.description);
    }
    if (patterns.moodSearching.description) {
        evidence.push(patterns.moodSearching.description);
    }
    if (patterns.trueFavorites.description) {
        evidence.push(patterns.trueFavorites.description);
    }

    return {
        ...patterns,
        evidence,
        summary: generatePatternSummary(streams, patterns)
    };
}

/**
 * Generate overall stats summary
 */
function generatePatternSummary(streams, patterns) {
    const totalHours = Math.round(streams.reduce((sum, s) => sum + s.msPlayed, 0) / 3600000);
    const uniqueArtists = new Set(streams.map(s => s.artistName)).size;
    const uniqueTracks = new Set(streams.map(s => `${s.trackName}::${s.artistName}`)).size;

    const firstDate = new Date(streams[0].playedAt);
    const lastDate = new Date(streams[streams.length - 1].playedAt);
    const spanDays = Math.round((lastDate - firstDate) / (24 * 60 * 60 * 1000));

    return {
        totalStreams: streams.length,
        totalHours,
        uniqueArtists,
        uniqueTracks,
        dateRange: {
            start: firstDate.toISOString().split('T')[0],
            end: lastDate.toISOString().split('T')[0],
            days: spanDays
        }
    };
}

/**
 * Detect patterns from Spotify API data (Quick Snapshot)
 * Works with limited data: recent 50 tracks + top artists/tracks
 */
function detectLitePatterns(liteData) {
    const { recentStreams, topArtists, topTracks } = liteData;

    // 1. Diversity in recent plays
    const recentArtists = new Set(recentStreams.map(s => s.artistName));
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
    const shortTermNames = new Set(topArtists.shortTerm.map(a => a.name));
    const longTermNames = new Set(topArtists.longTerm.map(a => a.name));

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
        stableArtists: stableArtists.slice(0, 5),
        signal: stabilityRatio > 0.5 ? 'stable' : stabilityRatio < 0.2 ? 'shifting' : 'evolving',
        description: stabilityRatio > 0.5
            ? `${Math.round(stabilityRatio * 100)}% of your current favorites are all-time favorites — you know your taste`
            : stabilityRatio < 0.2
                ? `Only ${Math.round(stabilityRatio * 100)}% overlap with all-time favorites — your taste is shifting`
                : `Your taste is evolving — ${stableArtists.length} artists remain from your all-time favorites`
    };

    // 4. Rising stars (in short-term but not long-term)
    const shortTermOnly = topArtists.shortTerm
        .filter(a => !longTermNames.has(a.name))
        .slice(0, 5);

    const risingStars = {
        artists: shortTermOnly.map(a => ({ name: a.name, genres: a.genres })),
        count: shortTermOnly.length,
        hasNew: shortTermOnly.length > 3,
        description: shortTermOnly.length > 3
            ? `${shortTermOnly.length} new artists in your rotation: ${shortTermOnly.slice(0, 3).map(a => a.name).join(', ')}`
            : null
    };

    // 5. Genre consistency
    const allGenres = [];
    topArtists.shortTerm.forEach(a => allGenres.push(...(a.genres || [])));
    const genreCounts = {};
    for (const genre of allGenres) {
        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
    }
    const topGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([genre, count]) => ({ genre, count }));

    const genreProfile = {
        topGenres,
        hasGenreData: topGenres.length > 0,
        description: topGenres.length > 0
            ? `Your current sound: ${topGenres.slice(0, 3).map(g => g.genre).join(', ')}`
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
        summary: generateLiteSummary(liteData, { diversity, tasteStability, topGenres })
    };
}

/**
 * Generate summary for lite data
 */
function generateLiteSummary(liteData, patterns) {
    const { recentStreams, topArtists, topTracks, profile } = liteData;

    return {
        displayName: profile?.displayName || 'Music Lover',
        recentTrackCount: recentStreams.length,
        topArtistCount: topArtists.shortTerm.length,
        topTrackCount: topTracks.shortTerm.length,
        topArtists: topArtists.shortTerm.slice(0, 5).map(a => a.name),
        topTracks: topTracks.shortTerm.slice(0, 5).map(t => `${t.name} by ${t.artist}`),
        topGenres: patterns.topGenres.slice(0, 3).map(g => g.genre),
        diversitySignal: patterns.diversity.signal,
        stabilitySignal: patterns.tasteStability.signal,
        isLiteData: true,
        fetchedAt: liteData.fetchedAt
    };
}

// Public API
window.Patterns = {
    detectComfortDiscoveryRatio,
    detectEras,
    detectTimePatterns,
    detectSocialPatterns,
    detectGhostedArtists,
    detectDiscoveryExplosions,
    detectMoodSearching,
    detectTrueFavorites,
    detectAllPatterns,
    detectLitePatterns
};
