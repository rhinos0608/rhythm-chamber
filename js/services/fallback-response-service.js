/**
 * Fallback Response Service
 *
 * Generates fallback responses when API is unavailable.
 * Extracted from chat.js to separate fallback concerns from chat orchestration.
 *
 * @module services/fallback-response-service
 */

'use strict';

import { Settings } from '../settings.js';

// ==========================================
// Dependencies (injected via init)
// ==========================================

let _MessageOperations = null;
let _userContext = null;

// ==========================================
// Core Functions
// ==========================================

/**
 * Initialize FallbackResponseService with dependencies
 * @param {Object} dependencies - Required dependencies
 */
function init(dependencies) {
    _MessageOperations = dependencies.MessageOperations;
    _userContext = dependencies.userContext;

    console.log('[FallbackResponseService] Initialized with dependencies');
}

/**
 * Set user context (can be called after init to update)
 * @param {Object} context - User context with personality, patterns, summary
 */
function setUserContext(context) {
    _userContext = context;
}

/**
 * Generate a fallback response when API is unavailable
 *
 * @param {string} message - User message
 * @param {string|null} queryContext - Query context from generateQueryContext
 * @returns {string} Fallback response
 */
function generateFallbackResponse(message, queryContext) {
    // Delegate to MessageOperations if available (truthy check since initialized to null)
    if (_MessageOperations) {
        return _MessageOperations.generateFallbackResponse(message, queryContext);
    }

    // Guard: Return safe default if userContext not initialized
    if (!_userContext || !_userContext.personality) {
        return "I'm unable to process your request right now. Please try again after the chat is fully initialized.";
    }

    // Fallback if MessageOperations not available
    const { personality, patterns } = _userContext;
    const lowerMessage = message.toLowerCase();

    // If we have query context, use it to build a response
    if (queryContext) {
        // Parse the context to extract key info
        const lines = queryContext.split('\n').filter(l => l.trim());

        // Check for time period data
        if (queryContext.includes('DATA FOR')) {
            const topArtistMatch = queryContext.match(/1\. ([^(]+) \((\d+) plays\)/);
            const hoursMatch = queryContext.match(/Listening time: (\d+) hours/);
            const periodMatch = queryContext.match(/DATA FOR ([^:]+):/);

            if (periodMatch && topArtistMatch) {
                const period = periodMatch[1];
                const topArtist = topArtistMatch[1].trim();
                const plays = topArtistMatch[2];
                const hours = hoursMatch ? hoursMatch[1] : 'many';

                return `In ${period}, you listened to ${hours} hours of music. Your top artist was ${topArtist} with ${plays} plays. As ${personality.name}, this kind of deep listening is typical of how you engage with music.\n\nWant to explore what else was happening in that period?`;
            }
        }

        // Check for artist data
        if (queryContext.includes('DATA FOR ARTIST')) {
            const artistMatch = queryContext.match(/DATA FOR ARTIST "([^"]+)":/);
            const playsMatch = queryContext.match(/Total plays: (\d+)/);
            const peakMatch = queryContext.match(/Peak period: ([^(]+)/);

            if (artistMatch && playsMatch) {
                const artist = artistMatch[1];
                const plays = playsMatch[1];
                const peak = peakMatch ? peakMatch[1].trim() : null;

                let response = `You've played ${artist} ${plays} times total.`;
                if (peak) {
                    response += ` Your peak listening period was ${peak}.`;
                }
                response += `\n\nThis fits your ${personality.name} profile — ${personality.tagline.toLowerCase()}`;
                return response;
            }
        }
    }

    // Existing fallback logic for common patterns
    if (
        lowerMessage.includes('2020') ||
        lowerMessage.includes('2021') ||
        lowerMessage.includes('2022') ||
        lowerMessage.includes('2023')
    ) {
        const year = message.match(/20\d{2}/)?.[0];
        if (patterns.eras && patterns.eras.eras.length > 0) {
            const era = patterns.eras.eras.find(e => e.start.includes(year));
            if (era) {
                return `During ${era.start}, you were really into ${era.topArtists.slice(0, 3).join(', ')}. That lasted about ${era.weeks} weeks. Want to know what shifted after that?`;
            }
        }
        return `Looking at ${year}... I can see your listening patterns, but to really explore this I'd need the chat API connected. Your data shows ${patterns.summary?.uniqueArtists || 'many'} unique artists during this period.`;
    }

    if (lowerMessage.includes('ghost') || lowerMessage.includes('stop')) {
        if (patterns.ghostedArtists && patterns.ghostedArtists.ghosted.length > 0) {
            const ghost = patterns.ghostedArtists.ghosted[0];
            return `${ghost.artist} stands out — you played them ${ghost.totalPlays} times, then just... stopped ${ghost.daysSince} days ago. That's a significant shift. Something changed?`;
        }
        return "I can see some artists you've moved on from, but the full picture needs the chat API. Your personality type suggests you process music emotionally, so these changes might be meaningful.";
    }

    if (lowerMessage.includes('favorite') || lowerMessage.includes('love')) {
        if (patterns.trueFavorites && patterns.trueFavorites.topByPlays) {
            const top = patterns.trueFavorites.topByPlays;
            return `By play count, it's ${top.artist} with ${top.plays} plays. But pure plays don't tell the whole story — completion rate matters too. ${personality.name}s like you often have a complex relationship with their "favorites."`;
        }
    }

    // Default response - provider-aware messaging
    const currentProvider = Settings?.getSettings?.()?.llm?.provider || 'openrouter';
    const providerHint =
        currentProvider === 'openrouter'
            ? 'connect an OpenRouter API key in settings'
            : currentProvider === 'lmstudio'
                ? 'ensure LM Studio is running with a model loaded'
                : currentProvider === 'ollama'
                    ? 'ensure Ollama is running (ollama serve)'
                    : 'configure an LLM provider in settings';

    return `As ${personality.name}, ${personality.tagline.toLowerCase()} ${personality.allEvidence?.[0] || ''}\n\nTo explore deeper questions, ${providerHint}. Until then, I can tell you about your patterns: ${patterns.summary?.totalHours || 'many'} hours of music across ${patterns.summary?.uniqueArtists || 'many'} artists.`;
}

// ==========================================
// Public API
// ==========================================

const FallbackResponseService = {
    // Lifecycle
    init,
    setUserContext,

    // Core operations
    generateFallbackResponse,
};

// ES Module export
export { FallbackResponseService };

console.log('[FallbackResponseService] Service loaded');
