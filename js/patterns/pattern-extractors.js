/**
 * Pattern Extractors Module
 * Extracts features from track streaming data.
 * @module patterns/pattern-extractors
 */

/**
 * Detect comfort vs discovery ratio
 * > 50 plays per artist = comfort curator
 * < 10 plays per artist = discovery junkie
 *
 * @param {Array} streams - Array of stream objects
 * @returns {Object} Comfort/discovery analysis with ratio and classification
 */
export function detectComfortDiscoveryRatio(streams) {
    const artistPlays = {};

    for (const stream of streams) {
        if (!stream || !stream.artistName) continue;
        artistPlays[stream.artistName] = (artistPlays[stream.artistName] || 0) + 1;
    }

    const uniqueArtists = Object.keys(artistPlays).length;
    const totalPlays = streams.filter(s => s && s.artistName).length;
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
 *
 * @param {Array} streams - Array of stream objects
 * @param {Array} chunks - Array of time-based chunks (weekly/monthly)
 * @returns {Object} Era detection results with era count and list
 */
export function detectEras(streams, chunks) {
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
 * Detect ghosted artists (100+ plays → 0 plays for 1+ year)
 *
 * CORRECTION: Uses dataset end date instead of current date to avoid false positives
 * when data ends before the "ghosted" period would normally begin.
 *
 * Guardrail: Artists within 7 days of dataset end are NOT considered ghosted
 *
 * @param {Array} streams - Array of stream objects
 * @returns {Object} Ghosted artists with details and guardrail info
 */
export function detectGhostedArtists(streams) {
    if (!streams || streams.length === 0) {
        return { ghosted: [], activeUntilEnd: [], hasGhosted: false, count: 0, activeCount: 0, description: null };
    }

    // Filter streams to only those with valid timestamps
    const validStreams = streams.filter(s => s && s.playedAt && !isNaN(new Date(s.playedAt)));

    if (validStreams.length === 0) {
        return { ghosted: [], activeUntilEnd: [], hasGhosted: false, count: 0, activeCount: 0, description: null };
    }

    // Find the actual end date of the dataset
    const datasetEndDate = new Date(Math.max(...validStreams.map(s => new Date(s.playedAt))));

    // Use dataset end date as "now" for ghosted detection
    const now = datasetEndDate;
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    // Guardrail threshold: artists within 7 days of dataset end are "active until data ends"
    const GUARDRAIL_DAYS = 7;
    const guardrailDate = new Date(now.getTime() - GUARDRAIL_DAYS * 24 * 60 * 60 * 1000);

    // Build artist timelines
    const artistData = {};

    for (const stream of validStreams) {
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
        ghosted: ghosted?.slice(0, 5) || [],
        activeUntilEnd: activeUntilEnd?.slice(0, 5) || [],
        hasGhosted: ghosted.length > 0,
        count: ghosted.length,
        activeCount: activeUntilEnd.length,
        description,
        datasetEndDate: datasetEndDate.toISOString().split('T')[0]
    };
}

/**
 * Detect discovery explosions (3x normal new artist rate)
 *
 * @param {Array} streams - Array of stream objects
 * @param {Array} chunks - Array of time-based chunks (monthly)
 * @returns {Object} Discovery explosions with timing and magnitude
 */
export function detectDiscoveryExplosions(streams, chunks) {
    const monthlyChunks = chunks
        .filter(c => c.type === 'monthly')
        .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    if (monthlyChunks.length < 6) {
        return { explosions: [], hasExplosions: false };
    }

    // Track when each artist was first heard
    const artistFirstHeard = {};
    for (const stream of streams) {
        if (!stream) continue;
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
    const median = rates.length > 0
        ? rates.sort((a, b) => a - b)[Math.floor(rates.length / 2)]
        : 10;

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
        explosions: explosions?.slice(0, 3) || [],
        hasExplosions: explosions.length > 0,
        baselineRate: median,
        description: explosions.length > 0
            ? `Discovery explosion${explosions.length > 1 ? 's' : ''} detected — ${explosions[0].newArtists} new artists in ${explosions[0].month}`
            : null
    };
}
