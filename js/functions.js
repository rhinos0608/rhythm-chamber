/**
 * Function Calling Module for Rhythm Chamber
 * 
 * Defines OpenAI-style function schemas that the LLM can invoke
 * to query the user's streaming data dynamically.
 */

/**
 * Function schemas in OpenAI/OpenRouter format
 * These are passed to the LLM so it knows what tools are available
 */
const FUNCTION_SCHEMAS = [
    {
        type: "function",
        function: {
            name: "get_top_artists",
            description: "Get the user's most-played artists for a specific time period. Use this when the user asks about their top artists, favorite artists, or most listened artists.",
            parameters: {
                type: "object",
                properties: {
                    year: {
                        type: "integer",
                        description: "The year to query (e.g., 2020, 2021, 2023)"
                    },
                    month: {
                        type: "integer",
                        description: "Optional month (1-12). If omitted, returns data for the entire year."
                    },
                    limit: {
                        type: "integer",
                        description: "Number of artists to return (default: 10, max: 50)"
                    }
                },
                required: ["year"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_top_tracks",
            description: "Get the user's most-played tracks/songs for a specific time period. Use this when the user asks about their top songs, favorite tracks, or most listened tracks.",
            parameters: {
                type: "object",
                properties: {
                    year: {
                        type: "integer",
                        description: "The year to query (e.g., 2020, 2021, 2023)"
                    },
                    month: {
                        type: "integer",
                        description: "Optional month (1-12). If omitted, returns data for the entire year."
                    },
                    limit: {
                        type: "integer",
                        description: "Number of tracks to return (default: 10, max: 50)"
                    }
                },
                required: ["year"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_artist_history",
            description: "Get the user's complete listening history for a specific artist. Shows when they first listened, peak period, monthly breakdown, and total plays. Use this when the user asks about a specific artist.",
            parameters: {
                type: "object",
                properties: {
                    artist_name: {
                        type: "string",
                        description: "The artist name to search for (case-insensitive, partial match supported)"
                    }
                },
                required: ["artist_name"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_listening_stats",
            description: "Get overall listening statistics for a time period including total plays, hours listened, unique artists, and unique tracks. Use this for general stats questions.",
            parameters: {
                type: "object",
                properties: {
                    year: {
                        type: "integer",
                        description: "The year to query. If omitted, returns all-time stats."
                    },
                    month: {
                        type: "integer",
                        description: "Optional month (1-12). If omitted, returns data for the entire year."
                    }
                },
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "compare_periods",
            description: "Compare listening habits between two years. Shows what changed: new artists discovered, artists dropped, hours change. Use this when user asks to compare years or asks about changes over time.",
            parameters: {
                type: "object",
                properties: {
                    year1: {
                        type: "integer",
                        description: "The first year to compare"
                    },
                    year2: {
                        type: "integer",
                        description: "The second year to compare"
                    }
                },
                required: ["year1", "year2"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "search_tracks",
            description: "Search for a specific track/song in the user's listening history. Shows play count, which artists performed it, and when it was listened to.",
            parameters: {
                type: "object",
                properties: {
                    track_name: {
                        type: "string",
                        description: "The track/song name to search for (case-insensitive, partial match supported)"
                    }
                },
                required: ["track_name"]
            }
        }
    }
];

// ==========================================
// Retry Configuration
// HNW Fix: Retry at executor layer, not API layer
// Transient failures occur here (large dataset processing, rate limits)
// ==========================================

const MAX_FUNCTION_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;

/**
 * Check if error is transient (worth retrying)
 */
function isTransientError(err) {
    const msg = (err.message || '').toLowerCase();
    return msg.includes('timeout') ||
        msg.includes('rate limit') ||
        msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('network') ||
        msg.includes('fetch') ||
        err.name === 'AbortError';
}

/**
 * Exponential backoff delay with jitter
 */
async function backoffDelay(attempt) {
    const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
    const jitter = Math.random() * 100; // Prevent thundering herd
    await new Promise(r => setTimeout(r, delay + jitter));
}

/**
 * Execute a function call against the user's streaming data
 * Includes retry logic with exponential backoff for transient errors
 * 
 * @param {string} functionName - Name of the function to execute
 * @param {Object} args - Arguments passed by the LLM
 * @param {Array} streams - User's streaming data
 * @returns {Object} Result to send back to the LLM
 */
async function executeFunction(functionName, args, streams) {
    if (!streams || streams.length === 0) {
        return { error: "No streaming data available. User needs to upload their Spotify data first." };
    }

    if (!window.DataQuery) {
        return { error: "DataQuery module not loaded." };
    }

    const functionMap = {
        get_top_artists: executeGetTopArtists,
        get_top_tracks: executeGetTopTracks,
        get_artist_history: executeGetArtistHistory,
        get_listening_stats: executeGetListeningStats,
        compare_periods: executeComparePeriods,
        search_tracks: executeSearchTracks
    };

    const fn = functionMap[functionName];
    if (!fn) {
        return { error: `Unknown function: ${functionName}` };
    }

    let lastError;
    for (let attempt = 0; attempt <= MAX_FUNCTION_RETRIES; attempt++) {
        try {
            return await Promise.resolve(fn(args, streams));
        } catch (err) {
            lastError = err;
            console.warn(`[Functions] Attempt ${attempt + 1}/${MAX_FUNCTION_RETRIES + 1} for ${functionName} failed:`, err.message);

            if (isTransientError(err) && attempt < MAX_FUNCTION_RETRIES) {
                await backoffDelay(attempt);
                continue;
            }
            break;
        }
    }

    console.error(`[Functions] ${functionName} failed after ${MAX_FUNCTION_RETRIES + 1} attempts:`, lastError);
    return { error: `Failed to execute ${functionName}: ${lastError.message}` };
}


// ==========================================
// Function Executors
// ==========================================

function executeGetTopArtists(args, streams) {
    const { year, month, limit = 10 } = args;
    const result = window.DataQuery.getTopArtistsForPeriod(streams, {
        year,
        month,
        limit: Math.min(limit, 50)
    });

    if (!result.found) {
        return {
            error: `No data found for ${month ? `${getMonthName(month)} ${year}` : year}. ` +
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

function executeGetTopTracks(args, streams) {
    const { year, month, limit = 10 } = args;
    const result = window.DataQuery.getTopTracksForPeriod(streams, {
        year,
        month,
        limit: Math.min(limit, 50)
    });

    if (!result.found) {
        return {
            error: `No data found for ${month ? `${getMonthName(month)} ${year}` : year}. ` +
                `The user's data may not include this period.`
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
    const { year, month } = args;
    const result = window.DataQuery.queryByTimePeriod(streams, { year, month });

    if (!result.found) {
        if (year) {
            return {
                error: `No data found for ${month ? `${getMonthName(month)} ${year}` : year}. ` +
                    `The user's data may not include this period.`
            };
        }
        return { error: "No streaming data available." };
    }

    return {
        period: year ? (month ? `${getMonthName(month)} ${year}` : `${year}`) : "All time",
        total_plays: result.totalPlays,
        total_hours: result.totalHours,
        unique_artists: result.uniqueArtists,
        unique_tracks: result.uniqueTracks,
        date_range: result.dateRange,
        top_artists: result.topArtists.slice(0, 5).map(a => ({ name: a.name, plays: a.plays })),
        top_tracks: result.topTracks.slice(0, 5).map(t => ({ name: t.name, artist: t.artist, plays: t.plays }))
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
// Helpers
// ==========================================

function getMonthName(monthNum) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    return months[monthNum - 1] || 'Unknown';
}

// ==========================================
// Public API
// ==========================================

window.Functions = {
    schemas: FUNCTION_SCHEMAS,
    execute: executeFunction
};
