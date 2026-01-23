/**
 * Artifact Query Schemas
 * 
 * OpenAI-style function schemas for visualization-producing queries.
 * These functions return both narrative text AND an ArtifactSpec for rendering.
 * 
 * Design Philosophy:
 * - Artifacts are scoped to specific questions/time ranges
 * - AI must narratively introduce each artifact (explains why)
 * - Never produces persistent dashboards - only conversation-scoped visuals
 * 
 * @module functions/schemas/artifact-queries
 */

const ARTIFACT_QUERY_SCHEMAS = [
    {
        type: "function",
        function: {
            name: "visualize_trend",
            description: "Create a line chart showing how a listening metric changes over time. Use this when the user wants to SEE a trend, pattern, or change over time. Always explain what the chart shows.",
            parameters: {
                type: "object",
                properties: {
                    metric: {
                        type: "string",
                        enum: ["plays", "hours", "unique_artists", "unique_tracks", "avg_session_length"],
                        description: "Which metric to plot over time"
                    },
                    time_range: {
                        type: "object",
                        properties: {
                            start_year: { type: "integer", description: "Start year (e.g., 2020)" },
                            end_year: { type: "integer", description: "End year (e.g., 2024)" },
                            start_month: { type: "integer", description: "Optional start month (1-12)" },
                            end_month: { type: "integer", description: "Optional end month (1-12)" }
                        },
                        required: ["start_year", "end_year"]
                    },
                    granularity: {
                        type: "string",
                        enum: ["day", "week", "month", "quarter", "year"],
                        description: "Time granularity for data points (default: month)"
                    },
                    filter_artist: {
                        type: "string",
                        description: "Optional: filter to specific artist"
                    },
                    annotations: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                date: { type: "string", description: "Date for annotation (YYYY-MM)" },
                                label: { type: "string", description: "Annotation text" }
                            }
                        },
                        description: "Optional: highlight specific points on the chart"
                    }
                },
                required: ["metric", "time_range"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "visualize_comparison",
            description: "Create a bar chart comparing metrics across categories (artists, time periods, genres). Use when the user wants to COMPARE things visually. Always explain the comparison.",
            parameters: {
                type: "object",
                properties: {
                    comparison_type: {
                        type: "string",
                        enum: ["top_artists", "top_tracks", "period_comparison", "artist_plays"],
                        description: "Type of comparison to visualize"
                    },
                    metric: {
                        type: "string",
                        enum: ["plays", "hours", "tracks", "sessions"],
                        description: "Metric to compare (default: plays)"
                    },
                    year: {
                        type: "integer",
                        description: "Year for the comparison (required for top_artists, top_tracks)"
                    },
                    periods: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                label: { type: "string" },
                                year: { type: "integer" },
                                month: { type: "integer" }
                            }
                        },
                        description: "Periods to compare (for period_comparison type)"
                    },
                    limit: {
                        type: "integer",
                        description: "Number of items to show (default: 10, max: 20)"
                    }
                },
                required: ["comparison_type"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "show_listening_timeline",
            description: "Create a timeline visualization showing key moments in listening history. Use for showing when artists were discovered, significant changes, or listening milestones.",
            parameters: {
                type: "object",
                properties: {
                    timeline_type: {
                        type: "string",
                        enum: ["artist_journey", "discovery_timeline", "era_transitions", "milestones"],
                        description: "Type of timeline to show"
                    },
                    artist_name: {
                        type: "string",
                        description: "Artist to focus on (for artist_journey type)"
                    },
                    time_range: {
                        type: "object",
                        properties: {
                            start_year: { type: "integer" },
                            end_year: { type: "integer" }
                        },
                        description: "Optional time range filter"
                    },
                    limit: {
                        type: "integer",
                        description: "Maximum events to show (default: 10, max: 15)"
                    }
                },
                required: ["timeline_type"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "show_listening_heatmap",
            description: "Create a calendar-style heatmap showing listening intensity over time. Use to show patterns like 'which days did I listen most' or 'show my listening activity'.",
            parameters: {
                type: "object",
                properties: {
                    year: {
                        type: "integer",
                        description: "Year to show (default: most recent year with data)"
                    },
                    metric: {
                        type: "string",
                        enum: ["plays", "hours", "unique_artists"],
                        description: "Metric to visualize (default: plays)"
                    }
                },
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "show_data_table",
            description: "Create a formatted data table for detailed information. Use when a list/table is clearer than a chart, like top tracks with play counts and artists.",
            parameters: {
                type: "object",
                properties: {
                    table_type: {
                        type: "string",
                        enum: ["top_tracks_detailed", "top_artists_detailed", "listening_by_month", "artist_tracks"],
                        description: "Type of table to display"
                    },
                    year: {
                        type: "integer",
                        description: "Year to query"
                    },
                    month: {
                        type: "integer",
                        description: "Optional month (1-12)"
                    },
                    artist_name: {
                        type: "string",
                        description: "Artist name (for artist_tracks type)"
                    },
                    limit: {
                        type: "integer",
                        description: "Rows to show (default: 10, max: 25)"
                    }
                },
                required: ["table_type"]
            }
        }
    }
];

// ES Module export
export { ARTIFACT_QUERY_SCHEMAS as ArtifactQuerySchemas };

console.log('[ArtifactQuerySchemas] Module loaded');
