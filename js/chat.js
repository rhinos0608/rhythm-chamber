/**
 * Chat Integration Module
 * Handles conversation with OpenRouter API
 * 
 * System prompts are defined in prompts.js for easy editing
 * Data queries are handled by data-query.js
 */

const CONVERSATION_STORAGE_KEY = 'rhythm_chamber_conversation';  // Legacy, for migration
const CURRENT_SESSION_KEY = 'rhythm_chamber_current_session';
const EMERGENCY_BACKUP_KEY = 'rhythm_chamber_emergency_backup';  // Sync backup for beforeunload

// HNW Fix: Timeout constants to prevent cascade failures
const CHAT_API_TIMEOUT_MS = 60000;           // 60 second timeout for cloud API calls
const LOCAL_LLM_TIMEOUT_MS = 90000;          // 90 second timeout for local LLM providers
const CHAT_FUNCTION_TIMEOUT_MS = 30000;      // 30 second timeout for function execution
const AUTO_SAVE_DELAY_MS = 2000;         // Debounce session saves
const EMERGENCY_BACKUP_MAX_AGE_MS = 3600000;  // 1 hour max age for emergency backups

let conversationHistory = [];
let userContext = null;
let streamsData = null;  // Actual streaming data for queries

// Session management state
let currentSessionId = null;
let currentSessionCreatedAt = null;  // HNW Fix: Preserve createdAt across saves
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

    // Recover any emergency backup from previous session (tab closed mid-save)
    await recoverEmergencyBackup();

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
 * Uses unified Storage API with localStorage fallback
 */
async function loadOrCreateSession() {
    // Try unified storage first for current session ID
    let savedSessionId = null;
    if (window.Storage?.getConfig) {
        savedSessionId = await window.Storage.getConfig(CURRENT_SESSION_KEY);
    }
    // Fallback to localStorage
    if (!savedSessionId) {
        savedSessionId = localStorage.getItem(CURRENT_SESSION_KEY);
    }

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
 * Flush pending save asynchronously - use when we have time (visibilitychange)
 * This has time to complete because tab is going hidden, not closing
 */
async function flushPendingSaveAsync() {
    if (autoSaveTimeoutId) {
        clearTimeout(autoSaveTimeoutId);
        autoSaveTimeoutId = null;
    }
    if (currentSessionId && conversationHistory.length > 0) {
        try {
            await saveCurrentSession();
            console.log('[Chat] Session flushed on visibility change');
        } catch (e) {
            console.error('[Chat] Flush save failed:', e);
        }
    }
}

/**
 * Emergency synchronous backup to localStorage - use when tab is closing
 * beforeunload requires sync completion; async saves will be abandoned
 * Next load will detect this and migrate to IndexedDB
 */
function emergencyBackupSync() {
    if (!currentSessionId || conversationHistory.length === 0) return;

    const backup = {
        sessionId: currentSessionId,
        createdAt: currentSessionCreatedAt,
        messages: conversationHistory.slice(-100),
        timestamp: Date.now()
    };

    try {
        localStorage.setItem(EMERGENCY_BACKUP_KEY, JSON.stringify(backup));
        console.log('[Chat] Emergency backup saved to localStorage');
    } catch (e) {
        // localStorage might be full or unavailable
        console.error('[Chat] Emergency backup failed:', e);
    }
}

/**
 * Recover emergency backup on load - called during initChat()
 * If we have a backup newer than what's in IndexedDB, restore it
 */
async function recoverEmergencyBackup() {
    const backupStr = localStorage.getItem(EMERGENCY_BACKUP_KEY);
    if (!backupStr) return false;

    try {
        const backup = JSON.parse(backupStr);

        // Only recover if backup is recent (< 1 hour old)
        if (Date.now() - backup.timestamp > EMERGENCY_BACKUP_MAX_AGE_MS) {
            console.log('[Chat] Emergency backup too old, discarding');
            localStorage.removeItem(EMERGENCY_BACKUP_KEY);
            return false;
        }

        // Check if session exists with fewer messages
        const existing = await window.Storage?.getSession?.(backup.sessionId);
        if (existing) {
            const existingCount = existing.messages?.length || 0;
            const backupCount = backup.messages?.length || 0;

            if (backupCount > existingCount) {
                // Backup has more messages - update existing session
                existing.messages = backup.messages;
                existing.createdAt = backup.createdAt || existing.createdAt;
                await window.Storage.saveSession(existing);
                console.log('[Chat] Recovered', backupCount - existingCount, 'messages from emergency backup');
            }
        } else if (backup.messages && backup.messages.length > 0) {
            // Session doesn't exist, create it from backup
            await window.Storage?.saveSession?.({
                id: backup.sessionId,
                title: 'Recovered Chat',
                createdAt: backup.createdAt || new Date().toISOString(),
                messages: backup.messages
            });
            console.log('[Chat] Created new session from emergency backup');
        }

        localStorage.removeItem(EMERGENCY_BACKUP_KEY);
        return true;
    } catch (e) {
        console.error('[Chat] Emergency backup recovery failed:', e);
        localStorage.removeItem(EMERGENCY_BACKUP_KEY);
        return false;
    }
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
            createdAt: currentSessionCreatedAt,  // HNW Fix: Preserve original createdAt
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
    currentSessionCreatedAt = new Date().toISOString();  // HNW Fix: Set createdAt for new session
    conversationHistory = [...initialMessages];

    // Save current session ID to unified storage and localStorage
    if (window.Storage?.setConfig) {
        window.Storage.setConfig(CURRENT_SESSION_KEY, currentSessionId).catch(e =>
            console.warn('[Chat] Failed to save session ID to unified storage:', e)
        );
    }
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
        currentSessionCreatedAt = session.createdAt;  // HNW Fix: Preserve createdAt from loaded session
        conversationHistory = session.messages || [];

        // Save current session ID to unified storage and localStorage
        if (window.Storage?.setConfig) {
            window.Storage.setConfig(CURRENT_SESSION_KEY, currentSessionId).catch(e =>
                console.warn('[Chat] Failed to save session ID to unified storage:', e)
            );
        }
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

    // Format data insights
    // Prioritize the formatted string from personality module, fallback to summary stats
    const dataInsights = personality.dataInsights
        || (summary ? `${summary.totalHours} hours of music, ${summary.uniqueArtists} artists` : 'No data available');

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
        .replace('{{data_insights}}', dataInsights)
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
 * DELEGATES to MessageOperations
 */
function generateQueryContext(message) {
    if (typeof window.MessageOperations !== 'undefined') {
        return window.MessageOperations.generateQueryContext(message);
    }

    // Fallback if MessageOperations not available
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
 * Now includes client-side token counting to prevent context window limits
 */
async function sendMessage(message, optionsOrKey = null) {
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

    // Handle legacy apiKey argument or options object
    const options = (typeof optionsOrKey === 'string')
        ? { apiKey: optionsOrKey }
        : (optionsOrKey || {});

    const { apiKey, onProgress } = options;

    // Get the merged settings (config.js as base, localStorage overrides)
    const settings = window.Settings?.getSettings?.() || {};

    // Determine which LLM provider to use
    const provider = settings.llm?.provider || 'openrouter';
    console.log('[Chat] Using LLM provider:', provider);

    // For local providers (Ollama, LM Studio), no API key or openrouter config needed
    const isLocalProvider = provider === 'ollama' || provider === 'lmstudio';

    // Get configuration - only strictly required for OpenRouter
    const config = window.Config?.openrouter || {};

    // Get API key priority: parameter > merged settings > raw config
    // The merged settings already handle the placeholder check
    let key = apiKey || settings.openrouter?.apiKey || config.apiKey;

    // Check if key is valid (not empty and not the placeholder)
    const isValidKey = key && key !== '' && key !== 'your-api-key-here';

    // For cloud providers, require API key; for local, check availability
    if (!isLocalProvider && !isValidKey) {
        // Return a helpful message if no API key configured
        const queryContext = generateQueryContext(message);
        const fallbackResponse = generateFallbackResponse(message, queryContext);
        conversationHistory.push({
            role: 'assistant',
            content: fallbackResponse
        });
        return {
            content: fallbackResponse,
            status: 'success', // Treat fallback as success for now to show message
            role: 'assistant',
            isFallback: true
        };
    }

    // Build provider-specific config
    const providerConfig = buildProviderConfig(provider, settings, config);

    // ==========================================
    // TOKEN COUNTING & CONTEXT WINDOW MANAGEMENT
    // ==========================================

    // Get function schemas if available
    const tools = window.Functions?.schemas || [];
    let useTools = tools.length > 0 && streamsData && streamsData.length > 0;

    // Calculate token usage before making API call
    if (window.TokenCounter) {
        const tokenInfo = window.TokenCounter.calculateRequestTokens({
            systemPrompt: messages[0].content,
            messages: messages.slice(1), // Exclude system prompt
            ragContext: semanticContext,
            tools: useTools ? tools : [],
            model: providerConfig.model
        });

        console.log('[Chat] Token count:', tokenInfo);

        // Check for warnings and apply strategies
        if (tokenInfo.warnings.length > 0) {
            const recommended = window.TokenCounter.getRecommendedAction(tokenInfo);

            // Log warnings
            tokenInfo.warnings.forEach(warning => {
                console.warn(`[Chat] Token warning [${warning.level}]: ${warning.message}`);
            });

            // Apply truncation strategy if needed
            if (recommended.action === 'truncate') {
                console.log('[Chat] Applying truncation strategy...');

                // Truncate the request parameters
                const truncatedParams = window.TokenCounter.truncateToTarget({
                    systemPrompt: messages[0].content,
                    messages: messages.slice(1),
                    ragContext: semanticContext,
                    tools: useTools ? tools : [],
                    model: providerConfig.model
                }, Math.floor(tokenInfo.contextWindow * 0.9)); // Target 90% of context window

                // Rebuild messages array with truncated content
                const truncatedMessages = [
                    { role: 'system', content: truncatedParams.systemPrompt },
                    ...truncatedParams.messages
                ];

                // Update messages array for the API call
                messages.length = 0;
                messages.push(...truncatedMessages);

                // Update semantic context and tools
                semanticContext = truncatedParams.ragContext;
                if (!truncatedParams.tools || truncatedParams.tools.length === 0) {
                    // Disable tools if they were removed during truncation
                    useTools = false;
                }

                // Notify UI about truncation
                if (onProgress) onProgress({
                    type: 'token_warning',
                    message: 'Context too large - conversation truncated',
                    tokenInfo: tokenInfo,
                    truncated: true
                });
            } else if (recommended.action === 'warn_user') {
                // Just warn the user but proceed
                if (onProgress) onProgress({
                    type: 'token_warning',
                    message: recommended.message,
                    tokenInfo: tokenInfo,
                    truncated: false
                });
            }
        }

        // Always pass token info to UI for monitoring
        if (onProgress) onProgress({
            type: 'token_update',
            tokenInfo: tokenInfo
        });
    }

    try {
        // Notify UI: Thinking/Sending request
        if (onProgress) onProgress({ type: 'thinking' });

        // Initial API call - routes to correct provider, pass onProgress for local streaming
        let response = await callLLM(providerConfig, key, messages, useTools ? tools : undefined, isLocalProvider ? onProgress : null);

        // HNW Fix: Validate response structure before accessing choices
        if (!response || !response.choices || response.choices.length === 0) {
            const providerName = providerConfig.provider || 'LLM';
            console.error('[Chat] Invalid response from provider:', providerName, response);
            throw new Error(`${providerName} returned an invalid response. Check if the server is running and the model is loaded.`);
        }
        let responseMessage = response.choices[0].message;

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

                // Notify UI: Tool start
                if (onProgress) onProgress({ type: 'tool_start', tool: functionName });

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

                    // Notify UI: Tool error (optional state update)
                    if (onProgress) onProgress({ type: 'tool_end', tool: functionName }); // Reset UI state

                    // Return error status to allow UI to show retry
                    return {
                        status: 'error',
                        content: `Function call '${functionName}' failed: ${funcError.message}. Please try again or select a different model.`,
                        role: 'assistant',
                        isFunctionError: true
                    };
                }

                console.log(`[Chat] Function result:`, result);

                // Notify UI: Tool end
                if (onProgress) onProgress({ type: 'tool_end', tool: functionName, result });

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

            // Notify UI: Thinking again (processing tool results)
            if (onProgress) onProgress({ type: 'thinking' });

            response = await callLLM(providerConfig, key, followUpMessages, undefined);
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

// ==========================================
// LLM Provider Routing (Delegated to Provider Modules)
// ==========================================

/**
 * Build provider-specific configuration
 * Delegates to ProviderInterface module
 * @param {string} provider - Provider name (openrouter, ollama, lmstudio)
 * @param {object} settings - User settings
 * @param {object} baseConfig - Base config from config.js
 * @returns {object} Provider-specific config
 */
function buildProviderConfig(provider, settings, baseConfig) {
    // Delegate to provider interface if available
    if (window.ProviderInterface?.buildProviderConfig) {
        return window.ProviderInterface.buildProviderConfig(provider, settings, baseConfig);
    }

    // Fallback for backward compatibility
    switch (provider) {
        case 'ollama':
            return {
                provider: 'ollama',
                endpoint: settings.llm?.ollamaEndpoint || 'http://localhost:11434',
                model: settings.ollama?.model || 'llama3.2',
                temperature: settings.ollama?.temperature ?? settings.openrouter?.temperature ?? 0.7,
                topP: settings.ollama?.topP ?? 0.9,
                maxTokens: settings.ollama?.maxTokens || 2000
            };

        case 'lmstudio':
            return {
                provider: 'lmstudio',
                endpoint: settings.llm?.lmstudioEndpoint || 'http://localhost:1234/v1',
                model: settings.lmstudio?.model || 'local-model',
                temperature: settings.lmstudio?.temperature ?? settings.openrouter?.temperature ?? 0.7,
                topP: settings.lmstudio?.topP ?? 0.9,
                maxTokens: settings.lmstudio?.maxTokens || 2000
            };

        case 'openrouter':
        default:
            return {
                provider: 'openrouter',
                ...baseConfig,
                ...(settings.openrouter || {}),
                model: settings.openrouter?.model || baseConfig.model,
                temperature: settings.openrouter?.temperature ?? 0.7,
                topP: settings.openrouter?.topP ?? 0.9,
                maxTokens: settings.openrouter?.maxTokens || 4500,
                frequencyPenalty: settings.openrouter?.frequencyPenalty ?? 0,
                presencePenalty: settings.openrouter?.presencePenalty ?? 0
            };
    }
}

/**
 * Unified LLM call routing - routes to appropriate provider
 * Delegates to provider modules when available
 * @param {object} config - Provider config from buildProviderConfig
 * @param {string} apiKey - API key (for OpenRouter)
 * @param {Array} messages - Chat messages
 * @param {Array} tools - Function calling tools (optional)
 * @param {function} onProgress - Progress callback for streaming (optional)
 * @returns {Promise<object>} Response in OpenAI-compatible format
 */
async function callLLM(config, apiKey, messages, tools, onProgress = null) {
    // Try to use ProviderInterface for unified routing
    if (window.ProviderInterface?.callProvider) {
        try {
            return await window.ProviderInterface.callProvider(config, apiKey, messages, tools, onProgress);
        } catch (err) {
            // If provider module fails, fall through to legacy handling
            console.warn('[Chat] Provider module error, using fallback:', err.message);
        }
    }

    // Legacy fallback - direct provider calls
    switch (config.provider) {
        case 'ollama':
            return await callOllamaLegacy(config, messages, tools, onProgress);

        case 'lmstudio':
            return await callLMStudioLegacy(config, messages, tools, onProgress);

        case 'openrouter':
        default:
            return await callOpenRouterLegacy(apiKey, config, messages, tools);
    }
}

// ==========================================
// Legacy Provider Functions (Fallbacks)
// These are retained for backward compatibility if provider modules fail to load
// ==========================================

async function callOllamaLegacy(config, messages, tools, onProgress = null) {
    if (!window.Ollama) {
        throw new Error('Ollama module not loaded');
    }

    const available = await window.Ollama.isAvailable();
    if (!available) {
        throw new Error('Ollama server not running. Start with: ollama serve');
    }

    const useStreaming = typeof onProgress === 'function';

    return await window.Ollama.chatCompletion(messages, {
        ...config,
        stream: useStreaming,
        onToken: useStreaming ? (token, thinking) => {
            onProgress({ type: 'token', token, thinking });
        } : null
    }, tools);
}

async function callLMStudioLegacy(config, messages, tools, onProgress = null) {
    const useStreaming = typeof onProgress === 'function';

    const body = {
        model: config.model,
        messages,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        top_p: config.topP,
        stream: useStreaming
    };

    if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LOCAL_LLM_TIMEOUT_MS);

    try {
        const response = await fetch(`${config.endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`LM Studio error: ${response.status}`);
        }

        if (useStreaming) {
            return await handleStreamingResponseLegacy(response, onProgress);
        }

        return response.json();
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new Error(`LM Studio request timed out after ${LOCAL_LLM_TIMEOUT_MS / 1000} seconds`);
        }
        throw err;
    }
}

async function handleStreamingResponseLegacy(response, onProgress) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let fullContent = '';
    let thinkingContent = '';
    let inThinking = false;
    let lastMessage = null;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta;

                    if (delta?.content) {
                        const token = delta.content;

                        if (token.includes('</think>')) {
                            inThinking = true;
                            const parts = token.split('<think>');
                            if (parts[0]) {
                                fullContent += parts[0];
                                onProgress({ type: 'token', token: parts[0] });
                            }
                            thinkingContent += parts[1] || '';
                            continue;
                        }

                        if (token.includes('</think>')) {
                            inThinking = false;
                            const parts = token.split('</think>');
                            thinkingContent += parts[0] || '';
                            onProgress({ type: 'thinking', content: thinkingContent });
                            thinkingContent = '';
                            if (parts[1]) {
                                fullContent += parts[1];
                                onProgress({ type: 'token', token: parts[1] });
                            }
                            continue;
                        }

                        if (inThinking) {
                            thinkingContent += token;
                        } else {
                            fullContent += token;
                            onProgress({ type: 'token', token });
                        }
                    }

                    lastMessage = parsed;
                } catch (e) {
                    // Ignore parse errors
                }
            }
        }
    }

    return {
        choices: [{
            message: { role: 'assistant', content: fullContent },
            finish_reason: 'stop'
        }],
        model: lastMessage?.model,
        thinking: thinkingContent || undefined
    };
}

async function callOpenRouterLegacy(apiKey, config, messages, tools) {
    const body = {
        model: config.model,
        messages,
        max_tokens: config.maxTokens,
        temperature: config.temperature
    };

    if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
    }

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
 * DELEGATES to MessageOperations
 */
async function regenerateLastResponse(options = null) {
    if (typeof window.MessageOperations !== 'undefined') {
        return window.MessageOperations.regenerateLastResponse(
            conversationHistory,
            sendMessage,
            options
        );
    }

    // Fallback if MessageOperations not available
    if (conversationHistory.length === 0) return null;

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
    return sendMessage(message, options);
}

/**
 * Delete a specific message index from history
 * DELEGATES to MessageOperations
 */
function deleteMessage(index) {
    if (typeof window.MessageOperations !== 'undefined') {
        return window.MessageOperations.deleteMessage(index, conversationHistory);
    }

    // Fallback if MessageOperations not available
    if (index < 0 || index >= conversationHistory.length) return false;

    conversationHistory.splice(index, 1);
    saveConversation();
    return true;
}

/**
 * Edit a user message
 * DELEGATES to MessageOperations
 */
async function editMessage(index, newText, options = null) {
    if (typeof window.MessageOperations !== 'undefined') {
        return window.MessageOperations.editMessage(
            index,
            newText,
            conversationHistory,
            sendMessage,
            options
        );
    }

    // Fallback if MessageOperations not available
    if (index < 0 || index >= conversationHistory.length) return null;

    const msg = conversationHistory[index];
    if (msg.role !== 'user') return { error: 'Can only edit user messages' };

    // Truncate history to remove this message and everything after it
    conversationHistory = conversationHistory.slice(0, index);

    // Send new message (this will add it to history and generate response)
    return sendMessage(newText, options);
}

/**
 * Generate a fallback response when API is unavailable
 * DELEGATES to MessageOperations
 */
function generateFallbackResponse(message, queryContext) {
    if (typeof window.MessageOperations !== 'undefined') {
        return window.MessageOperations.generateFallbackResponse(message, queryContext);
    }

    // Fallback if MessageOperations not available
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
    const currentProvider = window.Settings?.getSettings?.()?.llm?.provider || 'openrouter';
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

// ==========================================
// Session Persistence Event Handlers
// HNW Fix: Correct sync/async strategy for tab close
// ==========================================

if (typeof window !== 'undefined') {
    // Async save when tab goes hidden (mobile switch, minimize, tab switch)
    // visibilitychange gives us time for async operations
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            flushPendingSaveAsync();
        }
    });

    // Sync backup when tab is actually closing
    // beforeunload requires synchronous completion - async saves will be abandoned
    window.addEventListener('beforeunload', emergencyBackupSync);

    // Also handle pagehide for mobile Safari compatibility
    window.addEventListener('pagehide', emergencyBackupSync);
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
    onSessionUpdate,
    // Exposed for testing
    emergencyBackupSync,
    recoverEmergencyBackup
};
