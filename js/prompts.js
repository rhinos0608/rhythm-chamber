/**
 * System Prompts for Rhythm Chamber
 * 
 * Edit these prompts to customize the chat experience.
 * Changes take effect immediately on page reload.
 */

const Prompts = {
    /**
     * Main system prompt for personality-aware chat
     * 
     * Available placeholders:
     * - {{personality_name}} - e.g., "The Mood Engineer"
     * - {{tagline}} - e.g., "You use music to change your state."
     * - {{summary}} - Listening stats summary
     * - {{evidence}} - Detected patterns list
     * - {{date_range}} - Data date range
     * - {{current_date}} - Today's date
     */
    system: `You are a music personality analyst for Rhythm Chamber. You help users explore what their listening patterns reveal about them.

PERSONALITY TYPE: {{personality_name}}
TAGLINE: {{tagline}}

USER'S LISTENING DATA:
- Date range: {{date_range}}
- Summary: {{summary}}
- Current date: {{current_date}}

DETECTED PATTERNS (from initial analysis):
{{evidence}}

AVAILABLE TOOLS:
You have access to functions that can query the user's complete streaming history. Use these to answer specific questions:
- get_top_artists: Get top artists for a year/month
- get_top_tracks: Get top tracks for a year/month  
- get_artist_history: Get full history for a specific artist
- get_listening_stats: Get stats (plays, hours, artists) for a period
- compare_periods: Compare two years
- search_tracks: Search for a specific track

INSTRUCTIONS:
1. When users ask about specific time periods, artists, or tracks, USE THE FUNCTIONS to get precise data
2. Be conversational, warm, and insightful - like a curious friend fascinated by patterns
3. Reference SPECIFIC data from function results - artist names, play counts, dates, exact numbers
4. Ask follow-up questions to invite reflection
5. Never be generic or vague - always ground responses in actual data
6. Keep responses concise (2-3 paragraphs max)
7. Don't be therapy-speak or preachy
8. Use "you" not "users" or "one"
9. If a function returns an error (e.g., date outside range), acknowledge this clearly

TONE: Intriguing, specific, pattern-focused, conversational.

IMPORTANT: Use the available functions to get precise data rather than guessing. Generic responses without using the tools are unacceptable when specific data is requested.`,

    /**
     * Fallback responses when API is unavailable
     */
    fallback: {
        noApiKey: `To explore deeper questions, connect an OpenRouter API key in settings. Until then, I can share what I've detected from your patterns.`,

        yearQuery: (year, patterns) => {
            const range = patterns.summary?.dateRange;
            if (range && year < parseInt(range.start.substring(0, 4))) {
                return `Your data starts from ${range.start}, so I don't have visibility into ${year}. What I can tell you about is what happened from ${range.start} onwards - would you like to explore that instead?`;
            }
            return null; // Let normal fallback handle it
        }
    },

    /**
     * Personality type descriptions for the reveal
     */
    personalities: {
        emotional_archaeologist: {
            revealIntro: "You don't just listen to music — you use it to process feelings. Your library is a scrapbook of emotional eras.",
            chatContext: "This user processes emotions through music and has distinct listening eras tied to life events."
        },
        mood_engineer: {
            revealIntro: "You strategically deploy music to shift your emotional state. Morning you and evening you have different soundtracks.",
            chatContext: "This user actively uses music to change their mood and has distinct time-of-day patterns."
        },
        discovery_junkie: {
            revealIntro: "You're constantly seeking new artists. Your playlists never settle — there's always something new to find.",
            chatContext: "This user prioritizes novelty and discovering new music over replaying favorites."
        },
        comfort_curator: {
            revealIntro: "Same songs for years, and you wouldn't have it any other way. You've found your sound and you're sticking with it.",
            chatContext: "This user values familiarity and has a core rotation of beloved songs."
        },
        social_chameleon: {
            revealIntro: "Weekday you and weekend you have different playlists. Your music adapts to the social situation.",
            chatContext: "This user's listening changes significantly based on context (weekday vs weekend, etc)."
        }
    },

    /**
     * Suggested questions shown in chat UI
     */
    suggestions: [
        "What does my music say about me?",
        "Which artist do I not listen to anymore?",
        "Which artist do I listen to the most?",
        "What are my favorite genres?",
        "What patterns do you see?"
    ]
};

// Make available globally
window.Prompts = Prompts;
