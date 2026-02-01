/**
 * Template Profile Schemas
 *
 * OpenAI-style function schemas for template profile operations.
 * Used for exploring curated listening profiles and AI synthesis.
 */

const TEMPLATE_QUERY_SCHEMAS = [
    {
        type: 'function',
        function: {
            name: 'get_templates_by_genre',
            description:
                'Find template profiles that primarily listen to a specific genre. Use this to explore what profiles look like for different music tastes.',
            parameters: {
                type: 'object',
                properties: {
                    genre: {
                        type: 'string',
                        description:
                            "Genre to search for (e.g., 'rock', 'jazz', 'emo', 'electronic')",
                    },
                    limit: {
                        type: 'integer',
                        description: 'Maximum number of templates to return (default: 5)',
                    },
                },
                required: ['genre'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_templates_with_pattern',
            description:
                'Find templates that exhibit a specific listening pattern. Use this to explore different listening behaviors.',
            parameters: {
                type: 'object',
                properties: {
                    pattern_type: {
                        type: 'string',
                        enum: [
                            'eras',
                            'ghosted_artists',
                            'discovery_explosions',
                            'high_repeat',
                            'time_patterns',
                            'era_transition',
                            'weekend_heavy',
                        ],
                        description: 'Type of pattern to search for',
                    },
                },
                required: ['pattern_type'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_templates_by_personality',
            description:
                'Find templates that classify as a specific personality type. Use this to see examples of each personality.',
            parameters: {
                type: 'object',
                properties: {
                    personality_type: {
                        type: 'string',
                        enum: [
                            'emotional_archaeologist',
                            'mood_engineer',
                            'discovery_junkie',
                            'comfort_curator',
                            'social_chameleon',
                        ],
                        description: 'Personality type to filter by',
                    },
                },
                required: ['personality_type'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'synthesize_profile',
            description:
                'Create a custom profile based on a natural language description. Combines patterns from existing templates.',
            parameters: {
                type: 'object',
                properties: {
                    description: {
                        type: 'string',
                        description:
                            "Natural language description of the desired profile (e.g., 'someone who discovered jazz after years of rock' or 'a night owl who listens to electronic music')",
                    },
                },
                required: ['description'],
            },
        },
    },
];

// Function names for template routing (used by functions/index.js)
const TEMPLATE_FUNCTION_NAMES = TEMPLATE_QUERY_SCHEMAS.map(s => s.function.name);

// ES Module export
export {
    TEMPLATE_QUERY_SCHEMAS as TemplateQuerySchemas,
    TEMPLATE_FUNCTION_NAMES as TemplateFunctionNames,
};

console.log('[TemplateQuerySchemas] Module loaded');
