/**
 * Message Operations Service
 *
 * Handles chat message operations: regeneration, deletion, editing, and query context generation.
 * Extracted from chat.js to separate message concerns from chat orchestration.
 *
 * @module services/message-operations
 */

'use strict';

import { Settings } from '../settings.js';
import { DataVersion } from './data-version.js';

// ==========================================
// Dependencies (injected via init)
// ==========================================

let _DataQuery = null;
let _TokenCounter = null;
let _Functions = null;
let _RAG = null;

// ==========================================
// State Management
// ==========================================

let userContext = null;
let streamsData = null;

// ==========================================
// Core Functions
// ==========================================

/**
 * Initialize MessageOperations with dependencies
 * @param {Object} dependencies - Required dependencies
 */
function init(dependencies) {
    _DataQuery = dependencies.DataQuery;
    _TokenCounter = dependencies.TokenCounter;
    _Functions = dependencies.Functions;
    _RAG = dependencies.RAG;

    console.log('[MessageOperations] Initialized with dependencies');
}

/**
 * Set user context for message operations
 * @param {Object} context - User context with personality, patterns, summary
 */
function setUserContext(context) {
    userContext = context;
}

/**
 * Set streams data for query operations
 * @param {Array} streams - Streaming history data
 */
function setStreamsData(streams) {
    streamsData = streams;
}

/**
 * Regenerate the last assistant response
 * Removes the last assistant message and re-sends the last user message
 * Handles function call sequences: user -> assistant(tool_calls) -> tool -> assistant
 * 
 * @param {Array} conversationHistory - Current conversation history
 * @param {Function} sendMessageFn - Function to call for sending message
 * @param {Object} options - Options for sendMessage
 * @returns {Promise<Object>} Response object
 */
async function regenerateLastResponse(conversationHistory, sendMessageFn, options = null) {
    if (conversationHistory.length === 0) return null;

    // Check for stale data context before regeneration
    // The user may have uploaded new data since this message was generated
    const lastAssistantMsg = conversationHistory.slice().reverse().find(m => m.role === 'assistant');
    if (lastAssistantMsg && DataVersion.checkRegenerationContext) {
        const staleCheck = DataVersion.checkRegenerationContext(lastAssistantMsg);
        if (staleCheck.shouldWarn) {
            console.warn('[MessageOperations] Regenerating with stale data context:', staleCheck.message);
            // Notify caller via callback if provided
            if (options?.onStaleData) {
                options.onStaleData(staleCheck.message);
            }
        }
    }

    // Remove messages from the end until we find the user message
    // This handles both simple exchanges AND function call sequences:
    // - Simple: user -> assistant
    // - With tools: user -> assistant(tool_calls) -> tool* -> assistant
    while (conversationHistory.length > 0) {
        const lastMsg = conversationHistory[conversationHistory.length - 1];

        if (lastMsg.role === 'user') {
            // Found the user message - stop removing
            break;
        }

        // Remove assistant, tool, or any other message type
        conversationHistory.pop();
    }

    // Check if we have a user message to regenerate from
    const lastUserMsg = conversationHistory[conversationHistory.length - 1];
    if (!lastUserMsg || lastUserMsg.role !== 'user') {
        return { error: 'No user message found to regenerate response for.' };
    }

    // Get the last user message content
    const message = lastUserMsg.content;

    // Remove the user message too because sendMessage will add it back
    conversationHistory.pop();

    // Re-send
    return sendMessageFn(message, options);
}

/**
 * Delete a specific message index from history
 * Note: Deleting a message changes the context for subsequent messages
 * 
 * @param {number} index - Index of message to delete
 * @param {Array} conversationHistory - Current conversation history
 * @returns {boolean} Success status
 */
function deleteMessage(index, conversationHistory) {
    if (index < 0 || index >= conversationHistory.length) return false;

    conversationHistory.splice(index, 1);
    return true;
}

/**
 * Edit a user message
 * Truncates history to that point, updates message, and regenerates response
 * 
 * @param {number} index - Index of message to edit
 * @param {string} newText - New message text
 * @param {Array} conversationHistory - Current conversation history
 * @param {Function} sendMessageFn - Function to call for sending message
 * @param {Object} options - Options for sendMessage
 * @returns {Promise<Object>} Response object
 */
async function editMessage(index, newText, conversationHistory, sendMessageFn, options = null) {
    if (index < 0 || index >= conversationHistory.length) return null;

    const msg = conversationHistory[index];
    if (msg.role !== 'user') return { error: 'Can only edit user messages' };

    // Truncate history to remove this message and everything after it
    conversationHistory.length = index;

    // Send new message (this will add it to history and generate response)
    return sendMessageFn(newText, options);
}

/**
 * Analyze user message and generate relevant data context
 * 
 * @param {string} message - User message
 * @returns {string|null} Query context or null
 */
function generateQueryContext(message) {
    if (!streamsData || !_DataQuery) {
        return null;
    }

    const contextParts = [];

    // Check for date/time period queries
    const dateParams = _DataQuery.parseDateQuery(message);
    if (dateParams) {
        const periodData = _DataQuery.queryByTimePeriod(streamsData, dateParams);
        if (periodData.found) {
            const period = dateParams.month
                ? `${getMonthName(dateParams.month)} ${dateParams.year}`
                : `${dateParams.year}`;

            contextParts.push(`DATA FOR ${period.toUpperCase()}:`);
            contextParts.push(`- Total plays: ${periodData.totalPlays}`);
            contextParts.push(`- Listening time: ${periodData.totalHours} hours`);
            contextParts.push(`- Unique artists: ${periodData.uniqueArtists}`);
            contextParts.push(`- Unique tracks: ${periodData.uniqueTracks}`);

            if (periodData.topArtists.length > 0) {
                contextParts.push(`\nTop Artists:`);
                periodData.topArtists.slice(0, 5).forEach((a, i) => {
                    contextParts.push(`  ${i + 1}. ${a.name} (${a.plays} plays)`);
                });
            }

            if (periodData.topTracks.length > 0) {
                contextParts.push(`\nTop Tracks:`);
                periodData.topTracks.slice(0, 5).forEach((t, i) => {
                    contextParts.push(`  ${i + 1}. "${t.name}" by ${t.artist} (${t.plays} plays)`);
                });
            }
        } else {
            contextParts.push(`Note: No streaming data found for this period.`);
        }
    }

    // Check for artist queries
    const artistPatterns = [
        /(?:about|listening to|played|play|heard)\s+([A-Za-z][A-Za-z\s&.']+?)(?:\s+in|\s+during|\?|$)/i,
        /(?:when did i|did i listen to|did i play)\s+([A-Za-z][A-Za-z\s&.']+?)(?:\s+in|\?|$)/i,
        /([A-Za-z][A-Za-z\s&.']+?)\s+(?:plays?|streams?|listening)/i
    ];

    for (const pattern of artistPatterns) {
        const match = message.match(pattern);
        if (match) {
            const artistName = match[1].trim();
            if (artistName.length > 2 && !isCommonWord(artistName)) {
                const artistData = _DataQuery.findPeakListeningPeriod(streamsData, artistName);
                if (artistData.found) {
                    contextParts.push(`\nDATA FOR ARTIST "${artistData.artistName}":`);
                    contextParts.push(`- Total plays: ${artistData.totalPlays}`);
                    contextParts.push(`- First listened: ${artistData.firstListen}`);
                    contextParts.push(`- Last listened: ${artistData.lastListen}`);
                    contextParts.push(`- Peak period: ${artistData.peakPeriod} (${artistData.peakPlays} plays)`);

                    if (artistData.monthlyBreakdown.length > 1) {
                        contextParts.push(`\nMonthly breakdown:`);
                        artistData.monthlyBreakdown.forEach(m => {
                            contextParts.push(`  - ${m.period}: ${m.plays} plays`);
                        });
                    }
                }
            }
        }
    }

    // Check for comparison queries
    if (message.toLowerCase().includes('compare') || message.toLowerCase().includes('vs') ||
        message.toLowerCase().includes('versus') || message.toLowerCase().includes('different')) {
        const years = message.match(/20\d{2}/g);
        if (years && years.length >= 2) {
            const comparison = _DataQuery.comparePeriods(
                streamsData,
                { year: parseInt(years[0]) },
                { year: parseInt(years[1]) }
            );
            if (comparison.found) {
                contextParts.push(`\nCOMPARISON ${years[0]} vs ${years[1]}:`);
                contextParts.push(`${years[0]}: ${comparison.period1.totalHours}h, ${comparison.period1.uniqueArtists} artists`);
                contextParts.push(`${years[1]}: ${comparison.period2.totalHours}h, ${comparison.period2.uniqueArtists} artists`);

                if (comparison.newArtists.length > 0) {
                    contextParts.push(`\nNew in ${years[1]}: ${comparison.newArtists.map(a => a.name).join(', ')}`);
                }
                if (comparison.droppedArtists.length > 0) {
                    contextParts.push(`Dropped from ${years[0]}: ${comparison.droppedArtists.map(a => a.name).join(', ')}`);
                }
            }
        }
    }

    // Check for "most" queries (most listened, favorite, top)
    if (/\b(most|favorite|top|biggest)\b/i.test(message)) {
        // Already covered by evidence, but add overall stats if asking about all time
        if (/\b(all.?time|ever|overall|total)\b/i.test(message)) {
            const overall = _DataQuery.queryByTimePeriod(streamsData, {});
            if (overall.found) {
                contextParts.push(`\nOVERALL TOP ARTISTS:`);
                overall.topArtists.slice(0, 10).forEach((a, i) => {
                    contextParts.push(`  ${i + 1}. ${a.name} (${a.plays} plays)`);
                });
            }
        }
    }

    return contextParts.length > 0 ? contextParts.join('\n') : null;
}

/**
 * Generate a fallback response when API is unavailable
 * Now uses query context to provide data-driven answers
 * 
 * @param {string} message - User message
 * @param {string|null} queryContext - Query context from generateQueryContext
 * @returns {string} Fallback response
 */
function generateFallbackResponse(message, queryContext) {
    if (!userContext) {
        return "I'm unable to process your request at the moment. Please try again later.";
    }

    const { personality, patterns } = userContext;
    const lowerMessage = message.toLowerCase();

    // If we have query context, use it to build a response
    if (queryContext) {
        // Parse the context to extract key info
        const lines = queryContext.split('\n').filter(l => l.trim());

        // Check for time period data
        if (queryContext.includes('DATA FOR')) {
            const topArtistMatch = queryContext.match(/1\. ([^\(]+) \((\d+) plays\)/);
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
    if (lowerMessage.includes('2020') || lowerMessage.includes('2021') ||
        lowerMessage.includes('2022') || lowerMessage.includes('2023')) {
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
        return `I can see some artists you've moved on from, but the full picture needs the chat API. Your personality type suggests you process music emotionally, so these changes might be meaningful.`;
    }

    if (lowerMessage.includes('favorite') || lowerMessage.includes('love')) {
        if (patterns.trueFavorites && patterns.trueFavorites.topByPlays) {
            const top = patterns.trueFavorites.topByPlays;
            return `By play count, it's ${top.artist} with ${top.plays} plays. But pure plays don't tell the whole story — completion rate matters too. ${personality.name}s like you often have a complex relationship with their "favorites."`;
        }
    }

    // Default response - provider-aware messaging
    const currentProvider = Settings?.getSettings?.()?.llm?.provider || 'openrouter';
    const providerHint = currentProvider === 'openrouter'
        ? 'connect an OpenRouter API key in settings'
        : currentProvider === 'lmstudio'
            ? 'ensure LM Studio is running with a model loaded'
            : currentProvider === 'ollama'
                ? 'ensure Ollama is running (ollama serve)'
                : 'configure an LLM provider in settings';

    return `As ${personality.name}, ${personality.tagline.toLowerCase()} ${personality.allEvidence?.[0] || ''}\n\nTo explore deeper questions, ${providerHint}. Until then, I can tell you about your patterns: ${patterns.summary?.totalHours || 'many'} hours of music across ${patterns.summary?.uniqueArtists || 'many'} artists.`;
}

/**
 * Get semantic context from RAG if configured
 * 
 * @param {string} message - User message
 * @param {number} limit - Number of context chunks to retrieve
 * @returns {Promise<string|null>} Semantic context or null
 */
async function getSemanticContext(message, limit = 3) {
    if (!_RAG || !_RAG.isConfigured()) {
        return null;
    }

    try {
        const context = await _RAG.getSemanticContext(message, limit);
        return context;
    } catch (error) {
        console.warn('[MessageOperations] RAG semantic search failed:', error.message);
        return null;
    }
}

/**
 * Calculate token usage for a request
 * 
 * @param {Object} params - Token calculation parameters
 * @returns {Object} Token info
 */
function calculateTokenUsage(params) {
    if (!_TokenCounter) {
        return {
            total: 0,
            contextWindow: 4000,
            usagePercent: 0,
            warnings: []
        };
    }

    return _TokenCounter.calculateRequestTokens(params);
}

/**
 * Get recommended action based on token usage
 * 
 * @param {Object} tokenInfo - Token information
 * @returns {Object} Recommended action
 */
function getRecommendedTokenAction(tokenInfo) {
    if (!_TokenCounter) {
        return { action: 'proceed', message: 'No token counter available' };
    }

    return _TokenCounter.getRecommendedAction(tokenInfo);
}

/**
 * Truncate request to target token count
 * 
 * @param {Object} params - Parameters to truncate
 * @param {number} targetTokens - Target token count
 * @returns {Object} Truncated parameters
 */
function truncateToTarget(params, targetTokens) {
    if (!_TokenCounter) {
        return params; // No truncation possible
    }

    return _TokenCounter.truncateToTarget(params, targetTokens);
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Check if a word is too common to be an artist name
 */
function isCommonWord(word) {
    const commonWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'was', 'were', 'been', 'have', 'has',
        'did', 'does', 'do', 'is', 'are', 'am', 'what', 'when', 'where',
        'who', 'why', 'how', 'this', 'that', 'these', 'those', 'my', 'your',
        'music', 'listening', 'listen', 'played', 'play', 'heard', 'hear'
    ]);
    return commonWords.has(word.toLowerCase());
}

/**
 * Get month name from number
 */
function getMonthName(monthNum) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    return months[monthNum - 1] || 'Unknown';
}

// ==========================================
// Public API
// ==========================================

const MessageOperations = {
    init,
    setUserContext,
    setStreamsData,
    regenerateLastResponse,
    deleteMessage,
    editMessage,
    generateQueryContext,
    generateFallbackResponse,
    getSemanticContext,
    calculateTokenUsage,
    getRecommendedTokenAction,
    truncateToTarget
};

// ES Module export
export { MessageOperations };

console.log('[MessageOperations] Service loaded');