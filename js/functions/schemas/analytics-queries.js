/**
 * Analytics Query Schemas
 * 
 * NEW stats.fm and Spotify Wrapped-style function schemas.
 * These provide deeper analytics beyond basic top artists/tracks.
 * 
 * HNW Considerations:
 * - Hierarchy: Each function has single responsibility
 * - Network: Clear input/output contracts
 * - Wave: Consistent parameter patterns across functions
 */

const ANALYTICS_QUERY_SCHEMAS = [
    // ==========================================
    // Stats.fm-Style Functions
    // ==========================================
    {
        type: "function",
        function: {
            name: "get_bottom_tracks",
            description: "Get the user's LEAST played tracks for a specific time period. Use this when the user asks about songs they barely listened to, almost forgot, or discovered but didn't stick with.",
            parameters: {
                type: "object",
                properties: {
                    year: {
                        type: "integer",
                        description: "The year to query"
                    },
                    month: {
                        type: "integer",
                        description: "Optional month (1-12)"
                    },
                    quarter: {
                        type: "string",
                        enum: ["Q1", "Q2", "Q3", "Q4"],
                        description: "Optional quarter"
                    },
                    limit: {
                        type: "integer",
                        description: "Number of tracks to return (default: 10, max: 50)"
                    },
                    min_plays: {
                        type: "integer",
                        description: "Minimum plays to include (default: 1, filters out single plays if set higher)"
                    }
                },
                required: ["year"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_bottom_artists",
            description: "Get the user's LEAST played artists for a specific time period. Use this when the user asks about artists they tried but didn't stick with, or nearly forgot.",
            parameters: {
                type: "object",
                properties: {
                    year: {
                        type: "integer",
                        description: "The year to query"
                    },
                    month: {
                        type: "integer",
                        description: "Optional month (1-12)"
                    },
                    quarter: {
                        type: "string",
                        enum: ["Q1", "Q2", "Q3", "Q4"],
                        description: "Optional quarter"
                    },
                    limit: {
                        type: "integer",
                        description: "Number of artists to return (default: 10, max: 50)"
                    },
                    min_plays: {
                        type: "integer",
                        description: "Minimum plays to include (default: 1)"
                    }
                },
                required: ["year"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_listening_clock",
            description: "Get a 24-hour breakdown of listening habits. Shows which hours the user listens most. Use this when asking about time-of-day patterns, morning vs evening listening, or peak listening hours.",
            parameters: {
                type: "object",
                properties: {
                    year: {
                        type: "integer",
                        description: "Optional year to filter"
                    },
                    month: {
                        type: "integer",
                        description: "Optional month (1-12)"
                    },
                    group_by: {
                        type: "string",
                        enum: ["hour", "period"],
                        description: "Group by individual hours (0-23) or periods (morning/afternoon/evening/night). Default: period"
                    }
                },
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_listening_streaks",
            description: "Get the user's listening streak data - consecutive days with at least one play. Use this when asking about consistency, dedication, or daily listening habits.",
            parameters: {
                type: "object",
                properties: {
                    year: {
                        type: "integer",
                        description: "Optional year to filter"
                    },
                    min_streak_days: {
                        type: "integer",
                        description: "Minimum streak length to report (default: 3)"
                    }
                },
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_time_by_artist",
            description: "Get artists sorted by TOTAL TIME listened (minutes) instead of play count. Use this when the user wants to know who they spent the most time with, or for more accurate 'top artist' rankings.",
            parameters: {
                type: "object",
                properties: {
                    year: {
                        type: "integer",
                        description: "The year to query"
                    },
                    month: {
                        type: "integer",
                        description: "Optional month (1-12)"
                    },
                    quarter: {
                        type: "string",
                        enum: ["Q1", "Q2", "Q3", "Q4"],
                        description: "Optional quarter"
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
            name: "get_platform_stats",
            description: "Get breakdown of listening by platform (iOS, Android, desktop, web). Use this when asking about device habits or multi-device usage.",
            parameters: {
                type: "object",
                properties: {
                    year: {
                        type: "integer",
                        description: "Optional year to filter"
                    }
                },
                required: []
            }
        }
    },

    // ==========================================
    // Spotify Wrapped-Style Functions
    // ==========================================
    {
        type: "function",
        function: {
            name: "get_discovery_stats",
            description: "Get statistics about new artist discovery. Shows how many new artists were found in each period and when discovery peaks happened. Use this when asking about musical exploration or finding new music.",
            parameters: {
                type: "object",
                properties: {
                    year: {
                        type: "integer",
                        description: "The year to analyze"
                    },
                    breakdown: {
                        type: "string",
                        enum: ["monthly", "quarterly", "yearly"],
                        description: "How to break down the discovery data (default: monthly)"
                    }
                },
                required: ["year"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_skip_patterns",
            description: "Analyze skip behavior - which songs/artists get skipped most often. Use this when asking about songs the user doesn't like, skip habits, or completion rates.",
            parameters: {
                type: "object",
                properties: {
                    year: {
                        type: "integer",
                        description: "Optional year to filter"
                    },
                    type: {
                        type: "string",
                        enum: ["tracks", "artists"],
                        description: "Analyze skips by track or by artist (default: tracks)"
                    },
                    limit: {
                        type: "integer",
                        description: "Number of results to return (default: 10)"
                    }
                },
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_shuffle_habits",
            description: "Analyze shuffle vs intentional listening. Shows what percentage of listening is on shuffle and which artists/tracks are most listened to intentionally. Use this when asking about how the user discovers or chooses music.",
            parameters: {
                type: "object",
                properties: {
                    year: {
                        type: "integer",
                        description: "Optional year to filter"
                    },
                    breakdown: {
                        type: "string",
                        enum: ["overall", "by_artist", "by_time"],
                        description: "How to break down shuffle data (default: overall)"
                    }
                },
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_peak_listening_day",
            description: "Find the user's busiest listening day of the week. Shows average plays/minutes for each day. Use this when asking about weekly patterns or when the user listens most.",
            parameters: {
                type: "object",
                properties: {
                    year: {
                        type: "integer",
                        description: "Optional year to filter"
                    },
                    metric: {
                        type: "string",
                        enum: ["plays", "minutes"],
                        description: "Measure by play count or total minutes (default: plays)"
                    }
                },
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_completion_rate",
            description: "Analyze how often the user completes songs vs skipping early. Shows overall completion rate and breakdown by artist/track. Use this when asking about listening engagement or favorite vs background music.",
            parameters: {
                type: "object",
                properties: {
                    year: {
                        type: "integer",
                        description: "Optional year to filter"
                    },
                    threshold: {
                        type: "number",
                        description: "What percentage counts as 'completed' (default: 0.8 = 80%)"
                    },
                    breakdown: {
                        type: "string",
                        enum: ["overall", "by_artist", "by_track"],
                        description: "How to break down completion data (default: overall)"
                    }
                },
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_offline_listening",
            description: "Analyze offline listening patterns - what music the user downloads for offline play. Use this when asking about travel music, commute habits, or favorite offline tracks.",
            parameters: {
                type: "object",
                properties: {
                    year: {
                        type: "integer",
                        description: "Optional year to filter"
                    },
                    limit: {
                        type: "integer",
                        description: "Number of results to return (default: 10)"
                    }
                },
                required: []
            }
        }
    }
];

// ES Module export
export { ANALYTICS_QUERY_SCHEMAS as AnalyticsQuerySchemas };

console.log('[AnalyticsQuerySchemas] Module loaded');

