/**
 * Chat Integration Module
 * Handles conversation with OpenRouter API
 * 
 * System prompts are defined in prompts.js for easy editing
 * Data queries are handled by data-query.js
 */

const CONVERSATION_STORAGE_KEY = 'rhythm_chamber_conversation';  // Legacy, for migration
const CURRENT_SESSION_KEY = 'rhythm_chamber_current_session';

// HNW Fix: Timeout constants to prevent cascade failures
const CHAT_API_TIMEOUT_MS = 60000;       // 60 second timeout for API calls
const CHAT_FUNCTION_TIMEOUT_MS = 30000;  // 30 second timeout for function execution
const AUTO_SAVE_DELAY_MS = 2000;         // Debounce session saves

let conversationHistory = [];
let userContext = null;
let streamsData = null;  // Actual streaming data for queries

// Session management state
let currentSessionId = null;
let autoSaveTimeoutId = null;
let sessionUpdateListeners = [];

/**
 * Generate a UUID for session IDs
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Initialize chat with user context and streams data
 * Now supports persistent session storage
 */
async function initChat(personality, patterns, summary, streams = null) {
    userContext = {
        personality,
        patterns,
        summary
    };

    // Store streams for data queries
    streamsData = streams;

    // Try to load current session or create new one
    await loadOrCreateSession();

    // Register for storage updates to refresh data
    if (window.Storage?.onUpdate) {
        window.Storage.onUpdate(handleStorageUpdate);
    }

    return buildSystemPrompt();
}

/**
 * Load existing session or create a new one
 */
async function loadOrCreateSession() {
    // Check for saved current session ID
    const savedSessionId = localStorage.getItem(CURRENT_SESSION_KEY);

    if (savedSessionId) {
        const session = await loadSession(savedSessionId);
        if (session) {
            return session;
        }
    }

    // Migrate from legacy sessionStorage if exists
    try {
        const legacyData = sessionStorage.getItem(CONVERSATION_STORAGE_KEY);
        if (legacyData) {
            const history = JSON.parse(legacyData);
            if (history.length > 0) {
                console.log('[Chat] Migrating legacy conversation to session storage');
                await createNewSession(history);
                sessionStorage.removeItem(CONVERSATION_STORAGE_KEY);
                return;
            }
        }
    } catch (e) {
        console.warn('[Chat] Legacy migration failed:', e);
    }

    // No saved session, create new
    await createNewSession();
}

/**
 * Handle storage updates (new data uploaded)
 */
async function handleStorageUpdate(event) {
    if (event.type === 'streams' && event.count > 0) {
        console.log('[Chat] Data updated, refreshing streams...');
        streamsData = await window.Storage.getStreams();
    }
}

/**
 * Save conversation to IndexedDB (debounced)
 */
function saveConversation() {
    // Cancel any pending save
    if (autoSaveTimeoutId) {
        clearTimeout(autoSaveTimeoutId);
    }

    // Debounce the save
    autoSaveTimeoutId = setTimeout(async () => {
        await saveCurrentSession();
        autoSaveTimeoutId = null;
    }, AUTO_SAVE_DELAY_MS);
}

/**
 * Save current session to IndexedDB immediately
 */
async function saveCurrentSession() {
    if (!currentSessionId || !window.Storage?.saveSession) {
        return;
    }

    try {
        const session = {
            id: currentSessionId,
            title: generateSessionTitle(),
            messages: conversationHistory.slice(-100), // Limit to 100 messages
            metadata: {
                personalityName: userContext?.personality?.name || 'Unknown',
                personalityEmoji: userContext?.personality?.emoji || '🎵',
                isLiteMode: false
            }
        };

        await window.Storage.saveSession(session);
        console.log('[Chat] Session saved:', currentSessionId);
        notifySessionUpdate();
    } catch (e) {
        console.error('[Chat] Failed to save session:', e);
    }
}

/**
 * Generate a title for the session based on first user message
 */
function generateSessionTitle() {
    const firstUserMsg = conversationHistory.find(m => m.role === 'user');
    if (firstUserMsg?.content) {
        const title = firstUserMsg.content.slice(0, 50);
        return title.length < firstUserMsg.content.length ? title + '...' : title;
    }
    return 'New Chat';
}

/**
 * Create a new session
 * @param {Array} initialMessages - Optional initial messages (for migration)
 */
async function createNewSession(initialMessages = []) {
    // Flush any pending saves for previous session
    if (autoSaveTimeoutId) {
        clearTimeout(autoSaveTimeoutId);
        await saveCurrentSession();
    }

    currentSessionId = generateUUID();
    conversationHistory = [...initialMessages];

    localStorage.setItem(CURRENT_SESSION_KEY, currentSessionId);

    // Save immediately if we have messages
    if (initialMessages.length > 0) {
        await saveCurrentSession();
    }

    console.log('[Chat] Created new session:', currentSessionId);
    notifySessionUpdate();
    return currentSessionId;
}

/**
 * Load a session by ID
 * @param {string} sessionId - Session ID to load
 * @returns {Object|null} Session object or null if not found/invalid
 */
async function loadSession(sessionId) {
    if (!window.Storage?.getSession) {
        console.warn('[Chat] Storage not available');
        return null;
    }

    try {
        const session = await window.Storage.getSession(sessionId);

        if (!session) {
            console.warn(`[Chat] Session ${sessionId} not found`);
            return null;
        }

        // Validate session structure (HNW defensive)
        if (!validateSession(session)) {
            console.warn(`[Chat] Session ${sessionId} is corrupted`);
            return null;
        }

        currentSessionId = session.id;
        conversationHistory = session.messages || [];
        localStorage.setItem(CURRENT_SESSION_KEY, currentSessionId);

        console.log('[Chat] Loaded session:', sessionId, 'with', conversationHistory.length, 'messages');
        return session;
    } catch (e) {
        console.error('[Chat] Failed to load session:', e);
        return null;
    }
}

/**
 * Validate session structure (HNW defensive programming)
 */
function validateSession(session) {
    return session
        && typeof session.id === 'string'
        && Array.isArray(session.messages)
        && typeof session.createdAt === 'string';
}

/**
 * Switch to a different session
 * @param {string} sessionId - Session ID to switch to
 */
async function switchSession(sessionId) {
    // Save current session first
    if (currentSessionId && autoSaveTimeoutId) {
        clearTimeout(autoSaveTimeoutId);
        await saveCurrentSession();
    }

    const session = await loadSession(sessionId);
    if (session) {
        notifySessionUpdate();
        return true;
    }
    return false;
}

/**
 * Get all sessions for sidebar display
 */
async function listSessions() {
    if (!window.Storage?.getAllSessions) {
        return [];
    }
    try {
        return await window.Storage.getAllSessions();
    } catch (e) {
        console.error('[Chat] Failed to list sessions:', e);
        return [];
    }
}

/**
 * Delete a session by ID
 * @param {string} sessionId - Session ID to delete
 */
async function deleteSessionById(sessionId) {
    if (!window.Storage?.deleteSession) {
        return false;
    }

    try {
        await window.Storage.deleteSession(sessionId);

        // If we deleted the current session, create a new one
        if (sessionId === currentSessionId) {
            await createNewSession();
        }

        notifySessionUpdate();
        return true;
    } catch (e) {
        console.error('[Chat] Failed to delete session:', e);
        return false;
    }
}

/**
 * Rename a session
 * @param {string} sessionId - Session ID to rename
 * @param {string} newTitle - New title
 */
async function renameSession(sessionId, newTitle) {
    if (!window.Storage?.getSession || !window.Storage?.saveSession) {
        return false;
    }

    try {
        const session = await window.Storage.getSession(sessionId);
        if (session) {
            session.title = newTitle;
            await window.Storage.saveSession(session);
            notifySessionUpdate();
            return true;
        }
        return false;
    } catch (e) {
        console.error('[Chat] Failed to rename session:', e);
        return false;
    }
}

/**
 * Get current session ID
 */
function getCurrentSessionId() {
    return currentSessionId;
}

/**
 * Register a listener for session updates
 */
function onSessionUpdate(callback) {
    if (typeof callback === 'function') {
        sessionUpdateListeners.push(callback);
    }
}

/**
 * Notify all session update listeners
 */
function notifySessionUpdate() {
    sessionUpdateListeners.forEach(cb => {
        try {
            cb({ sessionId: currentSessionId });
        } catch (e) {
            console.error('[Chat] Error in session update listener:', e);
        }
    });
}

/**
 * Clear conversation history and create new session
 */
function clearConversation() {
    conversationHistory = [];
    createNewSession();
}

/**
 * Build system prompt with user data
 */
function buildSystemPrompt(queryContext = null, semanticContext = null) {
    const template = window.Prompts?.system;
    if (!template || !userContext) return '';

    const { personality, patterns, summary } = userContext;

    // Format date range
    const dateRange = summary?.dateRange
        ? `${summary.dateRange.start} to ${summary.dateRange.end}`
        : 'Unknown';

    // Format summary
    const summaryText = summary
        ? `${summary.totalHours} hours of music, ${summary.uniqueArtists} artists, ${summary.uniqueTracks} tracks`
        : 'Summary not available';

    // Format evidence with more detail
    const evidenceItems = personality.allEvidence || [];
    const evidenceText = evidenceItems.length > 0
        ? '• ' + evidenceItems.join('\n• ')
        : 'No specific patterns detected';

    // Get current date
    const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    let prompt = template
        .replace('{{personality_name}}', personality.name)
        .replace('{{tagline}}', personality.tagline)
        .replace('{{summary}}', summaryText)
        .replace('{{date_range}}', dateRange)
        .replace('{{current_date}}', currentDate)
        .replace('{{evidence}}', evidenceText);

    // Append semantic context from RAG if available (higher priority)
    if (semanticContext) {
        prompt += `\n\n${semanticContext}`;
    }

    // Append query context if available (fallback)
    if (queryContext) {
        prompt += `\n\nRELEVANT DATA FOR THIS QUERY:\n${queryContext}`;
    }

    return prompt;
}

/**
 * Analyze user message and generate relevant data context
 */
function generateQueryContext(message) {
    if (!streamsData || !window.DataQuery) {
        return null;
    }

    const contextParts = [];

    // Check for date/time period queries
    const dateParams = window.DataQuery.parseDateQuery(message);
    if (dateParams) {
        const periodData = window.DataQuery.queryByTimePeriod(streamsData, dateParams);
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
                const artistData = window.DataQuery.findPeakListeningPeriod(streamsData, artistName);
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
            const comparison = window.DataQuery.comparePeriods(
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
            const overall = window.DataQuery.queryByTimePeriod(streamsData, {});
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

/**
 * Send a message and get response
 * Supports OpenAI-style function calling for dynamic data queries
 */
async function sendMessage(message, apiKey = null) {
    if (!userContext) {
        throw new Error('Chat not initialized. Call initChat first.');
    }

    // Add user message to history
    conversationHistory.push({
        role: 'user',
        content: message
    });

    // Try to get semantic context from RAG if configured
    let semanticContext = null;
    if (window.RAG?.isConfigured()) {
        try {
            semanticContext = await window.RAG.getSemanticContext(message, 3);
            if (semanticContext) {
                console.log('[Chat] Semantic context retrieved from RAG');
            }
        } catch (err) {
            console.warn('[Chat] RAG semantic search failed:', err.message);
        }
    }

    // Build messages array with system prompt (includes semantic context if available)
    const messages = [
        { role: 'system', content: buildSystemPrompt(null, semanticContext) },
        ...conversationHistory
    ];

    // Get configuration - use Settings.getSettings() to properly merge config.js + localStorage
    const config = window.Config?.openrouter;
    if (!config) {
        throw new Error('Config not loaded. Make sure js/config.js exists.');
    }

    // Get the merged settings (config.js as base, localStorage overrides)
    const settings = window.Settings?.getSettings?.() || {};

    // Get API key priority: parameter > merged settings > raw config
    // The merged settings already handle the placeholder check
    let key = apiKey || settings.openrouter?.apiKey || config.apiKey;

    // Check if key is valid (not empty and not the placeholder)
    const isValidKey = key && key !== '' && key !== 'your-api-key-here';

    if (!isValidKey) {
        // Return a helpful message if no API key configured
        const queryContext = generateQueryContext(message);
        const fallbackResponse = generateFallbackResponse(message, queryContext);
        conversationHistory.push({
            role: 'assistant',
            content: fallbackResponse
        });
        return fallbackResponse;
    }

    // Merge static config (has apiUrl) with user settings (has model/tokens)
    const finalConfig = {
        ...config,
        ...(settings.openrouter || {})
    };

    try {
        // Get function schemas if available
        const tools = window.Functions?.schemas || [];
        const useTools = tools.length > 0 && streamsData && streamsData.length > 0;

        // Initial API call
        let response = await callOpenRouter(key, finalConfig, messages, useTools ? tools : undefined);
        let responseMessage = response.choices[0]?.message;

        // Handle function calls (tool calls)
        if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
            console.log('[Chat] LLM requested tool calls:', responseMessage.tool_calls.map(tc => tc.function.name));

            // Add assistant's tool call message to conversation
            conversationHistory.push({
                role: 'assistant',
                content: responseMessage.content || null,
                tool_calls: responseMessage.tool_calls
            });

            // Execute each function call and add results
            // HNW Fix: Add timeout to prevent indefinite hangs
            for (const toolCall of responseMessage.tool_calls) {
                const functionName = toolCall.function.name;
                const args = JSON.parse(toolCall.function.arguments || '{}');

                console.log(`[Chat] Executing function: ${functionName}`, args);

                // Execute the function with timeout protection
                let result;
                try {
                    result = await Promise.race([
                        Promise.resolve(window.Functions.execute(functionName, args, streamsData)),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error(`Function ${functionName} timed out after ${CHAT_FUNCTION_TIMEOUT_MS}ms`)), CHAT_FUNCTION_TIMEOUT_MS)
                        )
                    ]);
                } catch (funcError) {
                    console.error(`[Chat] Function execution failed:`, funcError);
                    result = { error: funcError.message };
                }

                console.log(`[Chat] Function result:`, result);

                // Add tool result to conversation
                conversationHistory.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(result)
                });
            }

            // Make follow-up call with function results
            const followUpMessages = [
                { role: 'system', content: buildSystemPrompt() },
                ...conversationHistory
            ];

            response = await callOpenRouter(key, finalConfig, followUpMessages, undefined);
            responseMessage = response.choices[0]?.message;
        }

        const assistantContent = responseMessage?.content || 'I couldn\'t generate a response.';

        // Add final response to history
        conversationHistory.push({
            role: 'assistant',
            content: assistantContent
        });

        // Save conversation to session storage
        saveConversation();

        return {
            content: assistantContent,
            status: 'success',
            role: 'assistant'
        };

    } catch (error) {
        console.error('Chat error:', error);

        const queryContext = generateQueryContext(message);
        const fallbackResponse = generateFallbackResponse(message, queryContext);

        // Add fallback to history but mark as error context if needed
        conversationHistory.push({
            role: 'assistant',
            content: fallbackResponse,
            error: true
        });
        saveConversation();

        return {
            content: fallbackResponse,
            status: 'error',
            error: error.message,
            role: 'assistant'
        };
    }
}

/**
 * Make an API call to OpenRouter
 * HNW Fix: Added timeout protection to prevent cascade failures
 */
async function callOpenRouter(apiKey, config, messages, tools) {
    const body = {
        model: config.model,
        messages,
        max_tokens: config.maxTokens,
        temperature: config.temperature
    };

    // Add tools if provided
    if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
    }

    // Use timeout wrapper if available, otherwise basic fetch with AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CHAT_API_TIMEOUT_MS);

    try {
        const response = await fetch(config.apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': config.app?.url || window.location.origin,
                'X-Title': config.app?.name || 'Rhythm Chamber'
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Chat] API error:', response.status, errorText);
            throw new Error(`API error: ${response.status}`);
        }

        return response.json();
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new Error(`API request timed out after ${CHAT_API_TIMEOUT_MS / 1000} seconds`);
        }
        throw err;
    }
}

/**
 * Regenerate the last assistant response
 * Removes the last assistant message and re-sends the last user message
 */
async function regenerateLastResponse() {
    if (conversationHistory.length === 0) return null;

    // Check if last message was assistant
    const lastMsg = conversationHistory[conversationHistory.length - 1];
    if (lastMsg.role === 'assistant') {
        conversationHistory.pop(); // Remove assistant message
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
    return sendMessage(message);
}

/**
 * Delete a specific message index from history
 * Note: Deleting a message changes the context for subsequent messages
 */
function deleteMessage(index) {
    if (index < 0 || index >= conversationHistory.length) return false;

    conversationHistory.splice(index, 1);
    saveConversation();
    return true;
}

/**
 * Edit a user message
 * Truncates history to that point, updates message, and regenerates response
 */
async function editMessage(index, newText) {
    if (index < 0 || index >= conversationHistory.length) return null;

    const msg = conversationHistory[index];
    if (msg.role !== 'user') return { error: 'Can only edit user messages' };

    // Truncate history to remove this message and everything after it
    conversationHistory = conversationHistory.slice(0, index);

    // Send new message (this will add it to history and generate response)
    return sendMessage(newText);
}

/**
 * Generate a fallback response when API is unavailable
 * Now uses query context to provide data-driven answers
 */
function generateFallbackResponse(message, queryContext) {
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

    // Default response
    return `As ${personality.name}, ${personality.tagline.toLowerCase()} ${personality.allEvidence?.[0] || ''}\n\nTo explore deeper questions, connect an OpenRouter API key in settings. Until then, I can tell you about your patterns: ${patterns.summary?.totalHours || 'many'} hours of music across ${patterns.summary?.uniqueArtists || 'many'} artists.`;
}

/**
 * Clear conversation history (also clears session storage)
 */
function clearHistory() {
    conversationHistory = [];
    sessionStorage.removeItem(CONVERSATION_STORAGE_KEY);
}

/**
 * Get conversation history
 */
function getHistory() {
    return [...conversationHistory];
}

/**
 * Set streams data after initialization (for compatibility)
 */
function setStreamsData(streams) {
    streamsData = streams;
}

// Public API
window.Chat = {
    initChat,
    sendMessage,
    regenerateLastResponse,
    deleteMessage,
    editMessage,
    clearHistory,
    clearConversation,
    getHistory,
    setStreamsData,
    // Session management
    createNewSession,
    loadSession,
    switchSession,
    listSessions,
    deleteSessionById,
    renameSession,
    getCurrentSessionId,
    onSessionUpdate
};
