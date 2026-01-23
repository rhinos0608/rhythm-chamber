/**
 * Playlist Query Schemas
 *
 * Premium feature: AI-generated playlists from your listening history.
 * Free users get 1 playlist, then premium is required.
 *
 * HNW Considerations:
 * - Hierarchy: Playlist generation is a premium feature with quota
 * - Network: Integrates with PremiumQuota for usage tracking
 * - Wave: Consistent parameter patterns for all playlist types
 */

const PLAYLIST_QUERY_SCHEMAS = [
    {
        type: "function",
        function: {
            name: "create_era_playlist",
            description: "Create a playlist from a specific time period (era). Use this when the user wants to relive a specific time in their life through music. Examples: 'make a playlist from March 2023', 'songs from my breakup era', 'summer 2022 vibes'. Returns tracks and can create on Spotify.",
            parameters: {
                type: "object",
                properties: {
                    start_date: {
                        type: "string",
                        description: "Start date in YYYY-MM-DD format, or a month like 'March 2023', or a description like 'when I was going through my breakup'"
                    },
                    end_date: {
                        type: "string",
                        description: "End date in YYYY-MM-DD format (optional)"
                    },
                    limit: {
                        type: "integer",
                        description: "Number of tracks to include (default: 50, max: 100)"
                    },
                    create_on_spotify: {
                        type: "boolean",
                        description: "If true, creates the playlist directly on user's Spotify account (requires authentication)"
                    }
                },
                required: ["start_date"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "create_energy_playlist",
            description: "Create a playlist based on energy level. Use this when the user wants music for a specific mood or activity. Examples: 'workout playlist', 'chill study music', 'high energy party songs'. Returns tracks and can create on Spotify.",
            parameters: {
                type: "object",
                properties: {
                    energy: {
                        type: "string",
                        enum: ["high", "medium", "low"],
                        description: "Energy level desired"
                    },
                    limit: {
                        type: "integer",
                        description: "Number of tracks to include (default: 50, max: 100)"
                    },
                    create_on_spotify: {
                        type: "boolean",
                        description: "If true, creates the playlist directly on user's Spotify account (requires authentication)"
                    }
                },
                required: ["energy"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "create_time_machine_playlist",
            description: "Create a playlist from 'this day in history' - what the user was listening to on this date in previous years. Examples: 'what was I listening to today last year?', 'show me my musical time machine'. Returns tracks and can create on Spotify.",
            parameters: {
                type: "object",
                properties: {
                    years_back: {
                        type: "integer",
                        description: "How many years back to look (default: 3)"
                    },
                    limit: {
                        type: "integer",
                        description: "Number of tracks per year to include (default: 10, max: 20)"
                    },
                    create_on_spotify: {
                        type: "boolean",
                        description: "If true, creates the playlist directly on user's Spotify account (requires authentication)"
                    }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "discover_new_artists",
            description: "Suggest new artists based on the user's listening patterns. This analyzes artists the user discovered and enjoyed but hasn't explored deeply. Returns artist recommendations with discovery context.",
            parameters: {
                type: "object",
                properties: {
                    limit: {
                        type: "integer",
                        description: "Number of artists to suggest (default: 10, max: 25)"
                    }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "create_vibe_playlist",
            description: "Create a playlist based on a textual description of a vibe, mood, or feeling. Examples: 'songs that feel like 3 AM existential crisis', 'main character energy', 'sad but hopeful'. This uses semantic search powered by AI embeddings. Returns tracks and can create on Spotify.",
            parameters: {
                type: "object",
                properties: {
                    vibe: {
                        type: "string",
                        description: "Textual description of the desired vibe, mood, or feeling"
                    },
                    limit: {
                        type: "integer",
                        description: "Number of tracks to include (default: 30, max: 75)"
                    },
                    create_on_spotify: {
                        type: "boolean",
                        description: "If true, creates the playlist directly on user's Spotify account (requires authentication)"
                    }
                },
                required: ["vibe"]
            }
        }
    }
];

export { PLAYLIST_QUERY_SCHEMAS };
