/**
 * Core Data Query Schemas
 * 
 * OpenAI-style function schemas for querying streaming data.
 * These are the original functions from functions.js, now modularized.
 */

const DATA_QUERY_SCHEMAS = [
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
                    quarter: {
                        type: "string",
                        enum: ["Q1", "Q2", "Q3", "Q4"],
                        description: "Optional quarter (Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec)"
                    },
                    season: {
                        type: "string",
                        enum: ["spring", "summer", "fall", "winter"],
                        description: "Optional season to query"
                    },
                    limit: {
                        type: "integer",
                        description: "Number of artists to return (default: 10, max: 50)"
                    },
                    sort_by: {
                        type: "string",
                        enum: ["plays", "time"],
                        description: "Sort by play count or total time listened (default: plays)"
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
                    quarter: {
                        type: "string",
                        enum: ["Q1", "Q2", "Q3", "Q4"],
                        description: "Optional quarter (Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec)"
                    },
                    season: {
                        type: "string",
                        enum: ["spring", "summer", "fall", "winter"],
                        description: "Optional season to query"
                    },
                    limit: {
                        type: "integer",
                        description: "Number of tracks to return (default: 10, max: 50)"
                    },
                    sort_by: {
                        type: "string",
                        enum: ["plays", "time"],
                        description: "Sort by play count or total time listened (default: plays)"
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
                    },
                    quarter: {
                        type: "string",
                        enum: ["Q1", "Q2", "Q3", "Q4"],
                        description: "Optional quarter to query"
                    },
                    season: {
                        type: "string",
                        enum: ["spring", "summer", "fall", "winter"],
                        description: "Optional season to query"
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

// ES Module export
export { DATA_QUERY_SCHEMAS as DataQuerySchemas };

// Keep window global for backwards compatibility
if (typeof window !== 'undefined') {
    window.DataQuerySchemas = DATA_QUERY_SCHEMAS;
}

console.log('[DataQuerySchemas] Module loaded');

