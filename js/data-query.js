/**
 * Data Query Module for Rhythm Chamber
 * 
 * Provides query utilities for the chat to access actual streaming data.
 * This enables the AI to answer specific questions about listening history.
 */

/**
 * Query streaming data by time period
 * @param {Array} streams - All streams
 * @param {Object} options - Query options
 * @returns {Object} Query results with summary and sample data
 */
function queryByTimePeriod(streams, { year, month, startDate, endDate }) {
    let filtered = streams;

    // Filter by year
    if (year) {
        filtered = filtered.filter(s => s.year === parseInt(year));
    }

    // Filter by month (1-indexed for user convenience)
    if (month) {
        filtered = filtered.filter(s => s.month === parseInt(month) - 1);
    }

    // Filter by date range
    if (startDate) {
        filtered = filtered.filter(s => s.date >= startDate);
    }
    if (endDate) {
        filtered = filtered.filter(s => s.date <= endDate);
    }

    if (filtered.length === 0) {
        return { found: false, message: 'No streams found for this period.' };
    }

    return summarizeStreams(filtered);
}

/**
 * Query streaming data by artist
 * @param {Array} streams - All streams
 * @param {string} artistName - Artist to search (case-insensitive partial match)
 * @returns {Object} Query results
 */
function queryByArtist(streams, artistName) {
    const searchTerm = artistName.toLowerCase();
    const filtered = streams.filter(s =>
        s.artistName.toLowerCase().includes(searchTerm)
    );

    if (filtered.length === 0) {
        return { found: false, message: `No streams found for "${artistName}".` };
    }

    const result = summarizeStreams(filtered);

    // Add artist-specific insights
    result.firstListen = filtered[0]?.date;
    result.lastListen = filtered[filtered.length - 1]?.date;
    result.topTracks = getTopItems(filtered, 'trackName', 5);

    return result;
}

/**
 * Query streaming data by track
 * @param {Array} streams - All streams
 * @param {string} trackName - Track to search (case-insensitive partial match)
 * @returns {Object} Query results
 */
function queryByTrack(streams, trackName) {
    const searchTerm = trackName.toLowerCase();
    const filtered = streams.filter(s =>
        s.trackName.toLowerCase().includes(searchTerm)
    );

    if (filtered.length === 0) {
        return { found: false, message: `No streams found for track "${trackName}".` };
    }

    const result = summarizeStreams(filtered);
    result.artists = [...new Set(filtered.map(s => s.artistName))];
    result.firstListen = filtered[0]?.date;
    result.lastListen = filtered[filtered.length - 1]?.date;

    return result;
}

/**
 * Get top artists for a time period
 */
function getTopArtistsForPeriod(streams, { year, month, limit = 10 }) {
    const results = queryByTimePeriod(streams, { year, month });
    if (!results.found) return results;

    return {
        found: true,
        period: month ? `${getMonthName(month)} ${year}` : `${year}`,
        topArtists: results.topArtists.slice(0, limit),
        totalPlays: results.totalPlays,
        uniqueArtists: results.uniqueArtists
    };
}

/**
 * Get top tracks for a time period
 */
function getTopTracksForPeriod(streams, { year, month, limit = 10 }) {
    const results = queryByTimePeriod(streams, { year, month });
    if (!results.found) return results;

    return {
        found: true,
        period: month ? `${getMonthName(month)} ${year}` : `${year}`,
        topTracks: results.topTracks.slice(0, limit),
        totalPlays: results.totalPlays,
        totalHours: results.totalHours
    };
}

/**
 * Get listening stats comparison between two periods
 */
function comparePeriods(streams, period1, period2) {
    const data1 = queryByTimePeriod(streams, period1);
    const data2 = queryByTimePeriod(streams, period2);

    if (!data1.found || !data2.found) {
        return {
            found: false,
            message: 'Could not compare - one or both periods have no data.'
        };
    }

    // Find artists that appear in one but not the other
    const artists1 = new Set(data1.topArtists.map(a => a.name));
    const artists2 = new Set(data2.topArtists.map(a => a.name));

    const newIn2 = data2.topArtists.filter(a => !artists1.has(a.name));
    const goneFrom1 = data1.topArtists.filter(a => !artists2.has(a.name));

    return {
        found: true,
        period1: { ...data1, label: formatPeriodLabel(period1) },
        period2: { ...data2, label: formatPeriodLabel(period2) },
        newArtists: newIn2.slice(0, 5),
        droppedArtists: goneFrom1.slice(0, 5),
        hoursChange: data2.totalHours - data1.totalHours,
        diversityChange: data2.uniqueArtists - data1.uniqueArtists
    };
}

/**
 * Search for when an artist was most listened to
 */
function findPeakListeningPeriod(streams, artistName) {
    const searchTerm = artistName.toLowerCase();
    const artistStreams = streams.filter(s =>
        s.artistName.toLowerCase().includes(searchTerm)
    );

    if (artistStreams.length === 0) {
        return { found: false, message: `No streams found for "${artistName}".` };
    }

    // Group by month
    const byMonth = {};
    for (const stream of artistStreams) {
        const key = `${stream.year}-${String(stream.month + 1).padStart(2, '0')}`;
        byMonth[key] = (byMonth[key] || 0) + 1;
    }

    // Find peak month
    const peak = Object.entries(byMonth)
        .sort((a, b) => b[1] - a[1])[0];

    const [peakYear, peakMonth] = peak[0].split('-');

    return {
        found: true,
        artistName: artistStreams[0].artistName, // Get exact case
        totalPlays: artistStreams.length,
        peakPeriod: `${getMonthName(parseInt(peakMonth))} ${peakYear}`,
        peakPlays: peak[1],
        firstListen: artistStreams[0].date,
        lastListen: artistStreams[artistStreams.length - 1].date,
        monthlyBreakdown: Object.entries(byMonth)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([period, plays]) => ({ period, plays }))
    };
}

// ==========================================
// Helper Functions
// ==========================================

function summarizeStreams(streams) {
    const totalMs = streams.reduce((sum, s) => sum + s.msPlayed, 0);
    const topArtists = getTopItems(streams, 'artistName', 10);
    const topTracks = getTopItemsWithArtist(streams, 10);
    const uniqueArtists = new Set(streams.map(s => s.artistName)).size;
    const uniqueTracks = new Set(streams.map(s => `${s.trackName}::${s.artistName}`)).size;

    // Date range
    const dates = streams.map(s => s.date).sort();

    return {
        found: true,
        totalPlays: streams.length,
        totalHours: Math.round(totalMs / 3600000),
        uniqueArtists,
        uniqueTracks,
        topArtists,
        topTracks,
        dateRange: {
            start: dates[0],
            end: dates[dates.length - 1]
        }
    };
}

function getTopItems(streams, field, limit) {
    const counts = {};
    for (const stream of streams) {
        const value = stream[field];
        counts[value] = (counts[value] || 0) + 1;
    }

    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([name, plays]) => ({ name, plays }));
}

function getTopItemsWithArtist(streams, limit) {
    const counts = {};
    const trackArtist = {};

    for (const stream of streams) {
        const key = stream.trackName;
        counts[key] = (counts[key] || 0) + 1;
        trackArtist[key] = stream.artistName;
    }

    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([name, plays]) => ({
            name,
            artist: trackArtist[name],
            plays
        }));
}

function getMonthName(monthNum) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    return months[monthNum - 1] || 'Unknown';
}

function formatPeriodLabel({ year, month }) {
    if (month) {
        return `${getMonthName(month)} ${year}`;
    }
    return `${year}`;
}

/**
 * Parse a natural language date query into structured params
 * Examples: "March 2023", "2022", "last month", "summer 2021"
 */
function parseDateQuery(query) {
    const monthNames = {
        'january': 1, 'jan': 1,
        'february': 2, 'feb': 2,
        'march': 3, 'mar': 3,
        'april': 4, 'apr': 4,
        'may': 5,
        'june': 6, 'jun': 6,
        'july': 7, 'jul': 7,
        'august': 8, 'aug': 8,
        'september': 9, 'sep': 9, 'sept': 9,
        'october': 10, 'oct': 10,
        'november': 11, 'nov': 11,
        'december': 12, 'dec': 12
    };

    const lowerQuery = query.toLowerCase();

    // Check for "month year" pattern
    for (const [monthName, monthNum] of Object.entries(monthNames)) {
        if (lowerQuery.includes(monthName)) {
            const yearMatch = lowerQuery.match(/20\d{2}/);
            if (yearMatch) {
                return { year: parseInt(yearMatch[0]), month: monthNum };
            }
        }
    }

    // Check for year only
    const yearMatch = lowerQuery.match(/20\d{2}/);
    if (yearMatch) {
        return { year: parseInt(yearMatch[0]) };
    }

    return null;
}

/**
 * Detect artist or track mentions in a query
 */
function extractEntityFromQuery(query, streams) {
    // Get all known artists and tracks
    const artists = new Set(streams.map(s => s.artistName.toLowerCase()));
    const tracks = new Set(streams.map(s => s.trackName.toLowerCase()));

    const lowerQuery = query.toLowerCase();

    // Check for artist mentions
    for (const artist of artists) {
        if (lowerQuery.includes(artist)) {
            return { type: 'artist', value: artist };
        }
    }

    // Check for track mentions
    for (const track of tracks) {
        if (lowerQuery.includes(track)) {
            return { type: 'track', value: track };
        }
    }

    return null;
}

// ==========================================
// Public API
// ==========================================

window.DataQuery = {
    queryByTimePeriod,
    queryByArtist,
    queryByTrack,
    getTopArtistsForPeriod,
    getTopTracksForPeriod,
    comparePeriods,
    findPeakListeningPeriod,
    parseDateQuery,
    extractEntityFromQuery
};
