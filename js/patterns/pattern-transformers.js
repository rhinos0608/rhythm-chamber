/**
 * Pattern Transformers Module
 * Transforms and normalizes pattern data into human-readable insights and summaries.
 * @module patterns/pattern-transformers
 */

/**
 * Generate Spotify Wrapped-style data insights
 *
 * @param {Array} streams - Array of stream objects
 * @returns {Object|null} Data insights with top artist, listening time, and peak day
 */
export function generateDataInsights(streams) {
    if (!streams || streams.length === 0) return null;

    // 1. Basic Counts
    const totalMinutes = Math.round(streams.reduce((sum, s) => sum + (s?.msPlayed || 0), 0) / 60000);
    const uniqueArtists = new Set(streams.filter(s => s != null).map(s => s.artistName)).size;

    // 2. Top Artist & Percentile
    const artistPlays = {};
    const artistTime = {};
    for (const s of streams) {
        if (!s) continue;
        artistPlays[s.artistName] = (artistPlays[s.artistName] || 0) + 1;
        artistTime[s.artistName] = (artistTime[s.artistName] || 0) + (s.msPlayed || 0);
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
        if (!s) continue;
        const day = s.dayOfWeek !== undefined ? s.dayOfWeek : new Date(s.playedAt).getDay();
        dayCounts[day] = (dayCounts[day] || 0) + 1;
    }
    const dayEntries = Object.entries(dayCounts).sort((a, b) => b[1] - a[1]);
    const peakDayIndex = dayEntries.length > 0 ? dayEntries[0][0] : 0;
    const peakDay = days[peakDayIndex] || 'Unknown';

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
 *
 * @param {Array} streams - Array of stream objects
 * @param {Object} patterns - Detected patterns object
 * @returns {Object} Summary with total streams, hours, unique artists/tracks, date range
 */
export function generatePatternSummary(streams, patterns) {
    const totalHours = Math.round(streams.reduce((sum, s) => sum + (s?.msPlayed || 0), 0) / 3600000);
    const uniqueArtists = new Set(streams.filter(s => s != null).map(s => s.artistName)).size;
    const uniqueTracks = new Set(streams.filter(s => s != null).map(s => `${s.trackName}::${s.artistName}`)).size;

    const firstDate = streams.length > 0 ? new Date(streams[0].playedAt) : new Date();
    const lastDate = streams.length > 0 ? new Date(streams[streams.length - 1].playedAt) : new Date();
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
 * Generate summary for lite data (limited Spotify API data)
 *
 * @param {Object} liteData - Object containing recentStreams, topArtists, topTracks, profile
 * @param {Object} patterns - Detected patterns for lite data
 * @returns {Object} Summary with display info and top artists/tracks/genres
 */
export function generateLiteSummary(liteData, patterns) {
    const { recentStreams, topArtists, topTracks, profile } = liteData;

    return {
        displayName: profile?.displayName || 'Music Lover',
        recentTrackCount: recentStreams?.length || 0,
        topArtistCount: topArtists.shortTerm?.length || 0,
        topTrackCount: topTracks.shortTerm?.length || 0,
        topArtists: topArtists.shortTerm?.slice(0, 5)?.map(a => a?.name) || [],
        topTracks: topTracks.shortTerm?.slice(0, 5)?.map(t => `${t?.name} by ${t?.artist}`) || [],
        topGenres: patterns.topGenres?.slice(0, 3)?.map(g => g?.genre) || [],
        diversitySignal: patterns.diversity?.signal,
        stabilitySignal: patterns.tasteStability?.signal,
        isLiteData: true,
        fetchedAt: liteData.fetchedAt
    };
}
