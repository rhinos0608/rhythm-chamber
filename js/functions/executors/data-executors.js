/**
 * Core Data Query Executors
 * 
 * Execution logic for core data query functions.
 * Uses validation and retry utilities for HNW compliance.
 */

// ==========================================
// Core Data Query Executors
// ==========================================

function executeGetTopArtists(args, streams) {
    const validation = window.FunctionValidation;
    const { year, month, quarter, season, limit = 10, sort_by = 'plays' } = args;

    // Validate limit
    const limitResult = validation.validateLimit(limit, 50);
    const normalizedLimit = limitResult.normalizedValue;

    // Parse date range (handles quarter/season)
    const dateRange = validation.parseDateRange({ year, month, quarter, season });
    if (dateRange.error) {
        return { error: dateRange.error };
    }

    // Filter streams by date range
    let filtered = streams;
    if (dateRange.startDate && dateRange.endDate) {
        filtered = streams.filter(s => {
            const streamDate = new Date(s.date);
            return streamDate >= dateRange.startDate && streamDate <= dateRange.endDate;
        });
    } else {
        // Fall back to year/month filtering
        const result = window.DataQuery.getTopArtistsForPeriod(streams, {
            year,
            month,
            limit: normalizedLimit
        });

        if (!result.found) {
            return {
                error: `No data found for ${validation.formatPeriodLabel({ year, month })}. ` +
                    `The user's data may not include this period.`
            };
        }

        return {
            period: result.period,
            total_plays: result.totalPlays,
            unique_artists: result.uniqueArtists,
            top_artists: result.topArtists.map((a, i) => ({
                rank: i + 1,
                name: a.name,
                plays: a.plays
            }))
        };
    }

    if (filtered.length === 0) {
        return {
            error: `No data found for ${validation.formatPeriodLabel({ year, month, quarter, season })}.`
        };
    }

    // Aggregate by artist
    const artistData = {};
    for (const stream of filtered) {
        const name = stream.artistName;
        if (!artistData[name]) {
            artistData[name] = { name, plays: 0, minutes: 0 };
        }
        artistData[name].plays += 1;
        artistData[name].minutes += (stream.msPlayed || 0) / 60000;
    }

    // Sort by chosen metric
    const sorted = Object.values(artistData)
        .sort((a, b) => sort_by === 'time' ? b.minutes - a.minutes : b.plays - a.plays)
        .slice(0, normalizedLimit);

    return {
        period: validation.formatPeriodLabel({ year, month, quarter, season }),
        total_plays: filtered.length,
        unique_artists: Object.keys(artistData).length,
        sorted_by: sort_by,
        top_artists: sorted.map((a, i) => ({
            rank: i + 1,
            name: a.name,
            plays: a.plays,
            minutes: Math.round(a.minutes)
        }))
    };
}

function executeGetTopTracks(args, streams) {
    const validation = window.FunctionValidation;
    const { year, month, quarter, season, limit = 10, sort_by = 'plays' } = args;

    const limitResult = validation.validateLimit(limit, 50);
    const normalizedLimit = limitResult.normalizedValue;

    const dateRange = validation.parseDateRange({ year, month, quarter, season });
    if (dateRange.error) {
        return { error: dateRange.error };
    }

    let filtered = streams;
    if (dateRange.startDate && dateRange.endDate) {
        filtered = streams.filter(s => {
            const streamDate = new Date(s.date);
            return streamDate >= dateRange.startDate && streamDate <= dateRange.endDate;
        });
    } else {
        const result = window.DataQuery.getTopTracksForPeriod(streams, {
            year,
            month,
            limit: normalizedLimit
        });

        if (!result.found) {
            return {
                error: `No data found for ${validation.formatPeriodLabel({ year, month })}.`
            };
        }

        return {
            period: result.period,
            total_plays: result.totalPlays,
            total_hours: result.totalHours,
            top_tracks: result.topTracks.map((t, i) => ({
                rank: i + 1,
                name: t.name,
                artist: t.artist,
                plays: t.plays
            }))
        };
    }

    if (filtered.length === 0) {
        return {
            error: `No data found for ${validation.formatPeriodLabel({ year, month, quarter, season })}.`
        };
    }

    // Aggregate by track
    const trackData = {};
    for (const stream of filtered) {
        const key = `${stream.trackName}::${stream.artistName}`;
        if (!trackData[key]) {
            trackData[key] = {
                name: stream.trackName,
                artist: stream.artistName,
                plays: 0,
                minutes: 0
            };
        }
        trackData[key].plays += 1;
        trackData[key].minutes += (stream.msPlayed || 0) / 60000;
    }

    const sorted = Object.values(trackData)
        .sort((a, b) => sort_by === 'time' ? b.minutes - a.minutes : b.plays - a.plays)
        .slice(0, normalizedLimit);

    const totalMs = filtered.reduce((sum, s) => sum + (s.msPlayed || 0), 0);

    return {
        period: validation.formatPeriodLabel({ year, month, quarter, season }),
        total_plays: filtered.length,
        total_hours: Math.round(totalMs / 3600000),
        sorted_by: sort_by,
        top_tracks: sorted.map((t, i) => ({
            rank: i + 1,
            name: t.name,
            artist: t.artist,
            plays: t.plays,
            minutes: Math.round(t.minutes)
        }))
    };
}

function executeGetArtistHistory(args, streams) {
    const { artist_name } = args;
    const result = window.DataQuery.findPeakListeningPeriod(streams, artist_name);

    if (!result.found) {
        return {
            error: `No plays found for "${artist_name}". ` +
                `The artist may not be in the user's listening history, or the name might be spelled differently.`
        };
    }

    return {
        artist: result.artistName,
        total_plays: result.totalPlays,
        first_listen: result.firstListen,
        last_listen: result.lastListen,
        peak_period: result.peakPeriod,
        peak_plays: result.peakPlays,
        monthly_breakdown: result.monthlyBreakdown
    };
}

function executeGetListeningStats(args, streams) {
    const validation = window.FunctionValidation;
    const { year, month, quarter, season } = args;

    const dateRange = validation.parseDateRange({ year, month, quarter, season });
    if (dateRange.error) {
        return { error: dateRange.error };
    }

    let filtered = streams;
    if (dateRange.startDate && dateRange.endDate) {
        filtered = streams.filter(s => {
            const streamDate = new Date(s.date);
            return streamDate >= dateRange.startDate && streamDate <= dateRange.endDate;
        });
    } else if (year || month) {
        const result = window.DataQuery.queryByTimePeriod(streams, { year, month });
        if (!result.found) {
            return { error: `No data found for ${validation.formatPeriodLabel({ year, month })}.` };
        }

        return {
            period: validation.formatPeriodLabel({ year, month }),
            total_plays: result.totalPlays,
            total_hours: result.totalHours,
            unique_artists: result.uniqueArtists,
            unique_tracks: result.uniqueTracks,
            date_range: result.dateRange,
            top_artists: result.topArtists.slice(0, 5).map(a => ({ name: a.name, plays: a.plays })),
            top_tracks: result.topTracks.slice(0, 5).map(t => ({ name: t.name, artist: t.artist, plays: t.plays }))
        };
    }

    if (filtered.length === 0) {
        return { error: "No streaming data available for this period." };
    }

    const totalMs = filtered.reduce((sum, s) => sum + (s.msPlayed || 0), 0);
    const uniqueArtists = new Set(filtered.map(s => s.artistName)).size;
    const uniqueTracks = new Set(filtered.map(s => `${s.trackName}::${s.artistName}`)).size;

    // Get top items
    const artistCounts = {};
    const trackCounts = {};
    for (const s of filtered) {
        artistCounts[s.artistName] = (artistCounts[s.artistName] || 0) + 1;
        const trackKey = `${s.trackName}::${s.artistName}`;
        if (!trackCounts[trackKey]) {
            trackCounts[trackKey] = { name: s.trackName, artist: s.artistName, plays: 0 };
        }
        trackCounts[trackKey].plays += 1;
    }

    const topArtists = Object.entries(artistCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, plays]) => ({ name, plays }));

    const topTracks = Object.values(trackCounts)
        .sort((a, b) => b.plays - a.plays)
        .slice(0, 5);

    const dates = filtered.map(s => s.date).sort();

    return {
        period: validation.formatPeriodLabel({ year, month, quarter, season }) || "All time",
        total_plays: filtered.length,
        total_hours: Math.round(totalMs / 3600000),
        unique_artists: uniqueArtists,
        unique_tracks: uniqueTracks,
        date_range: { start: dates[0], end: dates[dates.length - 1] },
        top_artists: topArtists,
        top_tracks: topTracks
    };
}

function executeComparePeriods(args, streams) {
    const { year1, year2 } = args;
    const result = window.DataQuery.comparePeriods(
        streams,
        { year: year1 },
        { year: year2 }
    );

    if (!result.found) {
        return {
            error: `Could not compare ${year1} and ${year2}. ` +
                `One or both years may not be in the user's data.`
        };
    }

    return {
        period1: {
            year: year1,
            total_hours: result.period1.totalHours,
            unique_artists: result.period1.uniqueArtists,
            total_plays: result.period1.totalPlays
        },
        period2: {
            year: year2,
            total_hours: result.period2.totalHours,
            unique_artists: result.period2.uniqueArtists,
            total_plays: result.period2.totalPlays
        },
        hours_change: result.hoursChange,
        diversity_change: result.diversityChange,
        new_artists_in_year2: result.newArtists.map(a => a.name),
        dropped_from_year1: result.droppedArtists.map(a => a.name)
    };
}

function executeSearchTracks(args, streams) {
    const { track_name } = args;
    const result = window.DataQuery.queryByTrack(streams, track_name);

    if (!result.found) {
        return {
            error: `No plays found for track "${track_name}". ` +
                `The track may not be in the user's listening history, or the name might be spelled differently.`
        };
    }

    return {
        track: track_name,
        artists: result.artists,
        total_plays: result.totalPlays,
        total_hours: result.totalHours,
        first_listen: result.firstListen,
        last_listen: result.lastListen
    };
}

// ==========================================
// Executor Registry
// ==========================================

// ES Module export
export const DataExecutors = {
    get_top_artists: executeGetTopArtists,
    get_top_tracks: executeGetTopTracks,
    get_artist_history: executeGetArtistHistory,
    get_listening_stats: executeGetListeningStats,
    compare_periods: executeComparePeriods,
    search_tracks: executeSearchTracks
};

// Keep window global for backwards compatibility
if (typeof window !== 'undefined') {
    window.DataExecutors = DataExecutors;
}

console.log('[DataExecutors] Module loaded');

