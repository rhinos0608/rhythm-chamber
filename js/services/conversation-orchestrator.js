/**
 * Conversation Orchestrator
 *
 * Manages conversation context and prompt generation.
 * Provides read-only access to conversation state.
 *
 * HNW Compliance:
 * - Read-only operations (no message mutation)
 * - State isolation (owns userContext and streamsData)
 * - Dependency injection via init()
 *
 * @module services/conversation-orchestrator
 */

import { TokenCounter } from '../token-counter.js';

// Dependencies (injected via init)
let _TokenCounter = null;
let _DataQuery = null;
let _RAG = null;

// State
let userContext = null;
let streamsData = null;

/**
 * Initialize ConversationOrchestrator
 */
function init(dependencies) {
    _TokenCounter = dependencies.TokenCounter;
    _DataQuery = dependencies.DataQuery;
    _RAG = dependencies.RAG;
    console.log('[ConversationOrchestrator] Initialized');
}

/**
 * Build system prompt with user data
 * Enforces strict token limits to prevent truncation of base system instructions
 */
function buildSystemPrompt(queryContext = null, semanticContext = null) {
    const template = window.Prompts?.system;
    if (!template || !userContext) return '';

    const { personality, patterns, summary } = userContext;

    const dateRange = summary?.dateRange
        ? `${summary.dateRange.start} to ${summary.dateRange.end}`
        : 'Unknown';

    const dataInsights = personality.dataInsights
        || (summary ? `${summary.totalHours} hours of music, ${summary.uniqueArtists} artists` : 'No data available');

    const evidenceItems = personality.allEvidence || [];
    const evidenceText = evidenceItems.length > 0
        ? '• ' + evidenceItems.join('\n• ')
        : 'No specific patterns detected';

    const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    let prompt = template
        .replace('{{personality_name}}', personality.name)
        .replace('{{tagline}}', personality.tagline)
        .replace('{{data_insights}}', dataInsights)
        .replace('{{date_range}}', dateRange)
        .replace('{{current_date}}', currentDate)
        .replace('{{evidence}}', evidenceText);

    const basePromptTokens = _TokenCounter.countTokens(prompt);
    const contextWindow = _TokenCounter.getContextWindow();

    const basePromptBudget = Math.floor(contextWindow * 0.5);
    const remainingBudget = contextWindow - basePromptBudget;

    if (basePromptTokens > basePromptBudget) {
        console.warn(`[ConversationOrchestrator] Base system prompt (${basePromptTokens} tokens) exceeds budget (${basePromptBudget} tokens). This may cause truncation.`);
    }

    if (semanticContext) {
        const semanticTokens = _TokenCounter.countTokens(semanticContext);
        const currentTotalTokens = basePromptTokens + semanticTokens;

        if (currentTotalTokens > contextWindow) {
            const availableTokens = Math.max(0, contextWindow - basePromptTokens);
            const truncationRatio = availableTokens / semanticTokens;

            if (truncationRatio < 0.5) {
                console.warn(`[ConversationOrchestrator] Semantic context too large (${semanticTokens} tokens), would require ${Math.round((1 - truncationRatio) * 100)}% truncation. Skipping semantic context.`);
            } else {
                const charsToKeep = Math.floor(semanticContext.length * truncationRatio);
                const truncatedContext = semanticContext.substring(0, charsToKeep);
                prompt += `\n\n${truncatedContext}...`;
                console.log(`[ConversationOrchestrator] Semantic context truncated from ${semanticTokens} to ${_TokenCounter.countTokens(truncatedContext)} tokens to fit within budget.`);
            }
        } else {
            prompt += `\n\n${semanticContext}`;
        }
    }

    if (queryContext) {
        const currentTokens = _TokenCounter.countTokens(prompt);
        const queryTokens = _TokenCounter.countTokens(queryContext);

        if (currentTokens + queryTokens > contextWindow * 0.9) {
            console.warn(`[ConversationOrchestrator] Query context (${queryTokens} tokens) would exceed 90% context window. Skipping query context.`);
        } else {
            prompt += `\n\nRELEVANT DATA FOR THIS QUERY:\n${queryContext}`;
        }
    }

    const finalTokens = _TokenCounter.countTokens(prompt);
    if (finalTokens > contextWindow) {
        console.error(`[ConversationOrchestrator] Final system prompt (${finalTokens} tokens) exceeds context window (${contextWindow}). This should not happen.`);
    }

    return prompt;
}

/**
 * Generate query context from user message
 */
function generateQueryContext(message) {
    if (!streamsData || !_DataQuery) {
        return null;
    }

    const contextParts = [];

    const dateParams = _DataQuery.parseDateQuery(message);
    if (dateParams) {
        const periodData = _DataQuery.queryByTimePeriod(streamsData, dateParams);
        if (periodData.found) {
            const period = dateParams.month
                ? `${getMonthName(dateParams.month)} ${dateParams.year}`
                : `${dateParams.year}`;

            contextParts.push(`DATA FOR ${period.toUpperCase():`);
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

    if (/\b(most|favorite|top|biggest)\b/i.test(message)) {
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

function getMonthName(monthNum) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    return months[monthNum - 1] || 'Unknown';
}

function getUserContext() {
    return userContext;
}

function setUserContext(context) {
    userContext = context;
}

function getStreamsData() {
    return streamsData;
}

function setStreamsData(streams) {
    streamsData = streams;
}

export const ConversationOrchestrator = {
    init,
    buildSystemPrompt,
    generateQueryContext,
    getUserContext,
    setUserContext,
    getStreamsData,
    setStreamsData
};
