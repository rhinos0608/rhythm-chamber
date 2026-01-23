/**
 * Pattern Detection Module
 * Detects behavioral patterns from listening data
 *
 * TIMEZONE HANDLING:
 * Uses UTC hours (hourUTC) when available for consistent results
 * regardless of user's current timezone or DST transitions.
 * Falls back to local hour if UTC not present (legacy data).
 *
 * PARALLEL PROCESSING:
 * Uses PatternWorkerPool for parallel pattern detection on multi-core devices.
 * Achieves 3x speedup by distributing independent pattern algorithms across workers.
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
 * 
 * Uses UTC hours for consistency across DST transitions
 * Requires minimum 100 streams in each time bucket to avoid false positives
 */
function detectTimePatterns(streams) {
    const morningArtists = new Set(); // 5am - 11am UTC
    const eveningArtists = new Set(); // 6pm - 11pm UTC

    const morningStreams = [];
    const eveningStreams = [];

    for (const stream of streams) {
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
 * 
 * CORRECTION: Uses dataset end date instead of current date to avoid false positives
 * when data ends before the "ghosted" period would normally begin.
 * 
 * Guardrail: Artists within 7 days of dataset end are NOT considered ghosted
 */
function detectGhostedArtists(streams) {
    if (!streams || streams.length === 0) {
        return { ghosted: [], hasGhosted: false, count: 0, description: null };
    }

    // Find the actual end date of the dataset
    const datasetEndDate = new Date(Math.max(...streams.map(s => new Date(s.playedAt))));

    // Use dataset end date as "now" for ghosted detection
    const now = datasetEndDate;
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    // Guardrail threshold: artists within 7 days of dataset end are "active until data ends"
    const GUARDRAIL_DAYS = 7;
    const guardrailDate = new Date(now.getTime() - GUARDRAIL_DAYS * 24 * 60 * 60 * 1000);

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
    const activeUntilEnd = [];

    for (const [artist, data] of Object.entries(artistData)) {
        // Check if artist meets ghosted criteria
        if (data.lastPlay >= guardrailDate) {
            activeUntilEnd.push({
                artist,
                totalPlays: data.plays,
                lastPlayed: data.lastPlay.toISOString().split('T')[0],
                daysSince: Math.floor((now - data.lastPlay) / (24 * 60 * 60 * 1000))
            });
        } else if (data.plays >= 100 && data.lastPlay < oneYearAgo) {
            // True ghosted artist
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
    activeUntilEnd.sort((a, b) => b.totalPlays - a.totalPlays);

    // Generate description based on what we found
    let description = null;
    if (ghosted.length > 0 && activeUntilEnd.length > 0) {
        description = `${ghosted.length} artist(s) you used to love but haven't played in over a year, plus ${activeUntilEnd.length} active until data ends`;
    } else if (ghosted.length > 0) {
        description = `${ghosted.length} artist(s) you used to love but haven't played in over a year`;
    } else if (activeUntilEnd.length > 0) {
        description = `${activeUntilEnd.length} artist(s) active until data ends (recently played)`;
    }

    return {
        ghosted: ghosted.slice(0, 5),
        activeUntilEnd: activeUntilEnd.slice(0, 5),
        hasGhosted: ghosted.length > 0,
        count: ghosted.length,
        activeCount: activeUntilEnd.length,
        description,
        datasetEndDate: datasetEndDate.toISOString().split('T')[0]
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


/**
 * Generate Spotify Wrapped-style data insights
 */
function generateDataInsights(streams) {
    if (!streams || streams.length === 0) return null;

    // 1. Basic Counts
    const totalMinutes = Math.round(streams.reduce((sum, s) => sum + s.msPlayed, 0) / 60000);
    const uniqueArtists = new Set(streams.map(s => s.artistName)).size;

    // 2. Top Artist & Percentile
    const artistPlays = {};
    const artistTime = {};
    for (const s of streams) {
        artistPlays[s.artistName] = (artistPlays[s.artistName] || 0) + 1;
        artistTime[s.artistName] = (artistTime[s.artistName] || 0) + s.msPlayed;
    }

    const sortedArtists = Object.entries(artistTime).sort((a, b) => b[1] - a[1]);
    const topArtist = sortedArtists[0];
    const topArtistName = topArtist ? topArtist[0] : 'Unknown';
    const topArtistMinutes = topArtist ? Math.round(topArtist[1] / 60000) : 0;

    // Heuristic for "Top X%" based on global Spotify listening averages
    // This is estimated for fun since we don't have global data
    let percentile = "Top 5%";
    if (topArtistMinutes > 5000) percentile = "Top 0.05%";
    else if (topArtistMinutes > 2000) percentile = "Top 0.5%";
    else if (topArtistMinutes > 1000) percentile = "Top 1%";
    else if (topArtistMinutes > 500) percentile = "Top 2%";

    // 3. Peak Listening Day
    const dayCounts = {};
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (const s of streams) {
        const day = s.dayOfWeek !== undefined ? s.dayOfWeek : new Date(s.playedAt).getDay();
        dayCounts[day] = (dayCounts[day] || 0) + 1;
    }
    const peakDayIndex = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0][0];
    const peakDay = days[peakDayIndex];

    return {
        totalMinutes,
        uniqueArtists,
        topArtist: {
            name: topArtistName,
            minutes: topArtistMinutes,
            percentile
        },
        peakDay
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

    // Create detailed insights
    const insights = generateDataInsights(streams);

    return {
        totalStreams: streams.length,
        totalHours,
        uniqueArtists,
        uniqueTracks,
        dateRange: {
            start: firstDate.toISOString().split('T')[0],
            end: lastDate.toISOString().split('T')[0],
            days: spanDays
        },
        insights // Pass insights up
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

/**
 * NEW: Detect immediate vibe from first 5 minutes of data
 * Used for instant insight in Quick Snapshot mode
 */
function detectImmediateVibe(liteData) {
    const { recentStreams, topArtists, topTracks } = liteData;

    if (!recentStreams || recentStreams.length === 0) {
        return "Upload your data to see your music personality!";
    }

    // Get first 5 minutes worth of streams (or all if less)
    const first5MinStreams = recentStreams.slice(0, 15); // Approx 15 streams for 5 mins

    // Analyze diversity
    const uniqueArtists = new Set(first5MinStreams.map(s => s.artistName)).size;
    const totalStreams = first5MinStreams.length;
    const diversityRatio = uniqueArtists / totalStreams;

    // Analyze current obsession
    const artistCounts = {};
    first5MinStreams.forEach(s => {
        artistCounts[s.artistName] = (artistCounts[s.artistName] || 0) + 1;
    });
    const sortedArtists = Object.entries(artistCounts).sort((a, b) => b[1] - a[1]);
    const topArtist = sortedArtists[0];

    // Analyze genres
    const allGenres = [];
    topArtists.shortTerm.forEach(a => allGenres.push(...(a.genres || [])));
    const genreCounts = {};
    for (const genre of allGenres) {
        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
    }
    const topGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([genre]) => genre);

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
        ? first5MinStreams.reduce((sum, s) => sum + (s.completionRate || 0), 0) / first5MinStreams.length
        : 0;
    if (avgCompletion > 0.8) {
        insight += "You're fully engaged with your music! ";
    } else if (avgCompletion < 0.5) {
        insight += "Lots of skipping - searching for the right mood. ";
    }

    return insight.trim();
}

// ==========================================
// Async Pattern Detection (Web Worker)
// ==========================================

let patternWorker = null;
let patternWorkerInitialized = false;
let patternRequestId = 0;
const pendingPatternRequests = new Map();

/**
 * Initialize pattern worker global handlers (called once)
 * NOTE: Can be called before worker is created to prevent race conditions
 */
function initPatternWorkerHandlers() {
    if (patternWorkerInitialized) return;

    // If worker exists, set up handlers immediately
    // If worker doesn't exist yet, handlers will be set up when it's created
    if (patternWorker) {
        patternWorkerInitialized = true;

        patternWorker.onmessage = (e) => {
            // Validate message format before destructuring
            if (!e.data || typeof e.data !== 'object') {
                console.warn('[Patterns] Received invalid message format');
                return;
            }

            const { type, requestId, patterns, current, total, message, error } = e.data;

            const pending = pendingPatternRequests.get(requestId);
            if (!pending) {
                console.warn('[Patterns] Received message for unknown requestId:', requestId);
                return;
            }

            switch (type) {
                case 'progress':
                    pending.onProgress(current, total, message);
                    break;

                case 'complete':
                    clearTimeout(pending.timeoutId);
                    pendingPatternRequests.delete(requestId);
                    pending.resolve(patterns);
                    if (pendingPatternRequests.size === 0) {
                        cleanupPatternWorker();
                    }
                    break;

                case 'error':
                    clearTimeout(pending.timeoutId);
                    pendingPatternRequests.delete(requestId);
                    pending.reject(new Error(error));
                    if (pendingPatternRequests.size === 0) {
                        cleanupPatternWorker();
                    }
                    break;
            }
        };

        patternWorker.onerror = (err) => {
            // On global error, reject all pending requests
            for (const [requestId, pending] of pendingPatternRequests) {
                clearTimeout(pending.timeoutId);
                pending.reject(new Error(err.message || 'Worker error'));
            }
            pendingPatternRequests.clear();
            cleanupPatternWorker();
        };
    }
}

/**
 * Detect all patterns asynchronously using Web Worker
 * Use for large datasets (100k+ streams) to avoid UI freezing
 * 
 * Uses request ID pattern to prevent race conditions when called concurrently.
 * 
 * @param {Array} streams - Streaming history
 * @param {Array} chunks - Weekly/monthly chunks
 * @param {Function} onProgress - Progress callback (current, total, message)
 * @returns {Promise<Object>} Detected patterns
 */
async function detectAllPatternsAsync(streams, chunks, onProgress = () => { }) {
    // For small datasets, use sync detection (faster, no worker overhead)
    const WORKER_THRESHOLD = 10000;
    if (streams.length < WORKER_THRESHOLD) {
        console.log('[Patterns] Using sync detection for small dataset');
        return detectAllPatterns(streams, chunks);
    }

    // Check for Web Worker support
    if (typeof Worker === 'undefined') {
        console.warn('[Patterns] Web Workers not supported, falling back to sync');
        return detectAllPatterns(streams, chunks);
    }

    // Create worker if not already created
    if (!patternWorker) {
        try {
            patternWorker = new Worker('js/workers/pattern-worker.js');

            // CRITICAL: Initialize handlers immediately after worker creation
            // This prevents race condition where worker sends messages before handlers are ready
            initPatternWorkerHandlers();
        } catch (e) {
            console.warn('[Patterns] Failed to create worker, falling back to sync:', e.message);
            return detectAllPatterns(streams, chunks);
        }
    } else if (!patternWorkerInitialized) {
        // Worker exists but handlers not initialized (edge case)
        initPatternWorkerHandlers();
    }

    // Generate unique request ID for this call
    const requestId = ++patternRequestId;

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            pendingPatternRequests.delete(requestId);
            reject(new Error('Pattern detection timed out (60s)'));
            if (pendingPatternRequests.size === 0) {
                cleanupPatternWorker();
            }
        }, 60000);

        // Store pending request
        pendingPatternRequests.set(requestId, {
            resolve,
            reject,
            onProgress,
            timeoutId
        });

        // Start detection with requestId
        onProgress(0, 8, 'Starting pattern detection...');
        patternWorker.postMessage({ type: 'detect', requestId, streams, chunks });
    });
}

/**
 * Clean up pattern worker
 */
function cleanupPatternWorker() {
    if (patternWorker) {
        patternWorker.terminate();
        patternWorker = null;
        patternWorkerInitialized = false;
    }
}

// ES Module export
export const Patterns = {
    detectComfortDiscoveryRatio,
    detectEras,
    detectTimePatterns,
    detectSocialPatterns,
    detectGhostedArtists,
    detectDiscoveryExplosions,
    detectMoodSearching,
    detectTrueFavorites,
    detectAllPatterns,
    detectAllPatternsAsync,
    cleanupPatternWorker,
    detectLitePatterns,
    detectImmediateVibe
};


console.log('[Patterns] Module loaded with async worker support');
