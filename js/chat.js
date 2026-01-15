/**
 * Chat Integration Module
 * 
 * ARCHITECTURE (HNW Compliant):
 * - Chat orchestration: API calls, prompt building, function calling
 * - Session state: DELEGATED to SessionManager (js/services/session-manager.js)
 * - Message operations: DELEGATED to MessageOperations (js/services/message-operations.js)
 * - LLM calls: DELEGATED to ProviderInterface (js/providers/provider-interface.js)
 * 
 * System prompts are defined in prompts.js for easy editing
 * Data queries are handled by data-query.js
 */

// HNW Fix: Timeout constants to prevent cascade failures
const CHAT_API_TIMEOUT_MS = 60000;           // 60 second timeout for cloud API calls
const LOCAL_LLM_TIMEOUT_MS = 90000;          // 90 second timeout for local LLM providers
const CHAT_FUNCTION_TIMEOUT_MS = 30000;      // 30 second timeout for function execution

// Chat-specific state (session state managed by SessionManager)
// Chat-specific state (session state managed by SessionManager)
let userContext = null;
let streamsData = null;  // Actual streaming data for queries

// ==========================================
// DELEGATING TO SessionManager:
// All session operations (create, load, save, switch, delete)
// are handled by SessionManager. Chat.js only manages chat-specific
// state (userContext, streamsData) and orchestrates API calls.
// ==========================================

/**
 * Initialize chat with user context and streams data
 * Delegates session management to SessionManager
 */
async function initChat(personality, patterns, summary, streams = null) {
    userContext = {
        personality,
        patterns,
        summary
    };

    // Store streams for data queries
    streamsData = streams;

    // Initialize SessionManager (handles emergency backup recovery)
    if (window.SessionManager) {
        window.SessionManager.setUserContext(personality);
        await window.SessionManager.init();
    }

    // Register for storage updates to refresh data
    if (window.Storage?.onUpdate) {
        window.Storage.onUpdate(handleStorageUpdate);
    }

    // Initialize MessageOperations with dependencies
    if (window.MessageOperations?.init) {
        window.MessageOperations.init({
            DataQuery: window.DataQuery,
            RAG: window.RAG,
            TokenCounter: window.TokenCounter
        });
        window.MessageOperations.setUserContext(userContext);
        window.MessageOperations.setStreamsData(streams);
    }

    return buildSystemPrompt();
}

/**
 * Handle storage updates (new data uploaded)
 */
async function handleStorageUpdate(event) {
    if (event.type === 'streams' && event.count > 0) {
        console.log('[Chat] Data updated, refreshing streams...');
        streamsData = await window.Storage.getStreams();
        // Update MessageOperations with new data
        if (window.MessageOperations?.setStreamsData) {
            window.MessageOperations.setStreamsData(streamsData);
        }
    }
}

/**
 * Save conversation to IndexedDB (debounced)
 * Delegates to SessionManager
 */
function saveConversation() {
    if (window.SessionManager?.saveConversation) {
        window.SessionManager.saveConversation();
    }
}

/**
 * Flush pending save asynchronously
 * Delegates to SessionManager
 */
async function flushPendingSaveAsync() {
    if (window.SessionManager?.flushPendingSaveAsync) {
        return window.SessionManager.flushPendingSaveAsync();
    }
}

/**
 * Emergency synchronous backup to localStorage
 * Delegates to SessionManager
 */
function emergencyBackupSync() {
    if (window.SessionManager?.emergencyBackupSync) {
        window.SessionManager.emergencyBackupSync();
    }
}

/**
 * Recover emergency backup on load
 * Delegates to SessionManager (called automatically in SessionManager.init())
 */
async function recoverEmergencyBackup() {
    if (window.SessionManager?.recoverEmergencyBackup) {
        return window.SessionManager.recoverEmergencyBackup();
    }
    return false;
}

/**
 * Save current session to IndexedDB immediately
 * Delegates to SessionManager
 */
async function saveCurrentSession() {
    if (window.SessionManager?.saveCurrentSession) {
        return window.SessionManager.saveCurrentSession();
    }
}

/**
 * Create a new session
 * Delegates to SessionManager
 */
async function createNewSession(initialMessages = []) {
    if (window.SessionManager?.createNewSession) {
        return window.SessionManager.createNewSession(initialMessages);
    }
}

/**
 * Load a session by ID
 * Delegates to SessionManager
 */
async function loadSession(sessionId) {
    if (window.SessionManager?.loadSession) {
        return window.SessionManager.loadSession(sessionId);
    }
    return null;
}

/**
 * Switch to a different session
 * Delegates to SessionManager
 */
async function switchSession(sessionId) {
    if (window.SessionManager?.switchSession) {
        return window.SessionManager.switchSession(sessionId);
    }
    return false;
}

/**
 * Get all sessions for sidebar display
 * Delegates to SessionManager
 */
async function listSessions() {
    if (window.SessionManager?.listSessions) {
        return window.SessionManager.listSessions();
    }
    return [];
}

/**
 * Delete a session by ID
 * Delegates to SessionManager
 */
async function deleteSessionById(sessionId) {
    if (window.SessionManager?.deleteSessionById) {
        return window.SessionManager.deleteSessionById(sessionId);
    }
    return false;
}

/**
 * Rename a session
 * Delegates to SessionManager
 */
async function renameSession(sessionId, newTitle) {
    if (window.SessionManager?.renameSession) {
        return window.SessionManager.renameSession(sessionId, newTitle);
    }
    return false;
}

/**
 * Get current session ID
 * Delegates to SessionManager
 */
function getCurrentSessionId() {
    if (window.SessionManager?.getCurrentSessionId) {
        return window.SessionManager.getCurrentSessionId();
    }
    return null;
}

/**
 * Register a listener for session updates
 * Delegates to SessionManager
 */
function onSessionUpdate(callback) {
    if (window.SessionManager?.onSessionUpdate) {
        window.SessionManager.onSessionUpdate(callback);
    }
}

/**
 * Clear conversation history and create new session
 * Delegates to SessionManager
 */
function clearConversation() {
    if (window.SessionManager?.clearConversation) {
        window.SessionManager.clearConversation();
    }
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

    // Reset circuit breaker for this turn (moved from handleToolCalls to ensure
    // reset happens for every message, not just those with tool calls)
    if (window.CircuitBreaker?.resetTurn) {
        window.CircuitBreaker.resetTurn();
    }

    // Add user message to history via SessionManager
    if (window.SessionManager?.addMessageToHistory) {
        window.SessionManager.addMessageToHistory({
            role: 'user',
            content: message
        });
    }

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

    // Get current history from SessionManager
    const conversationHistory = window.SessionManager?.getHistory?.() || [];

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
        if (window.SessionManager?.addMessageToHistory) {
            window.SessionManager.addMessageToHistory({
                role: 'assistant',
                content: fallbackResponse
            });
        }
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
    // FUNCTION CALLING CAPABILITY DETECTION
    // ==========================================

    // Get function schemas if available (filtered by user's enabled tools setting)
    const tools = window.Functions?.getEnabledSchemas?.() || window.Functions?.schemas || [];

    // Detect function calling capability level
    let capabilityLevel = 1; // Default to native
    let fallbackInfo = null;
    if (window.FunctionCallingFallback && tools.length > 0) {
        fallbackInfo = window.FunctionCallingFallback.detectCapabilityLevel(
            providerConfig.provider,
            providerConfig.model
        );
        capabilityLevel = fallbackInfo.level;
        console.log(`[Chat] Function calling capability: Level ${capabilityLevel} - ${fallbackInfo.reason}`);
    }

    // ==========================================
    // TOKEN COUNTING & CONTEXT WINDOW MANAGEMENT
    // ==========================================
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

        // Prepare messages based on capability level
        let apiMessages = messages;
        let apiTools = useTools ? tools : undefined;

        // Level 2: Use prompt injection instead of native tools
        if (capabilityLevel === 2 && useTools && window.FunctionCallingFallback) {
            apiMessages = window.FunctionCallingFallback.buildLevel2Request(messages, tools);
            apiTools = undefined; // Don't send tools - they're in the prompt
            console.log('[Chat] Using Level 2 prompt injection for function calling');
            if (onProgress) onProgress({ type: 'fallback_mode', level: 2 });
        }

        // Initial API call - routes to correct provider, pass onProgress for local streaming
        let response = await callLLM(providerConfig, key, apiMessages, apiTools, isLocalProvider ? onProgress : null);

        // HNW Fix: Validate response structure before accessing choices
        if (!response || !response.choices || response.choices.length === 0) {
            const providerName = providerConfig.provider || 'LLM';
            console.error('[Chat] Invalid response from provider:', providerName, response);
            throw new Error(`${providerName} returned an invalid response. Check if the server is running and the model is loaded.`);
        }
        let responseMessage = response.choices[0].message;

        // Handle function calling with fallback support
        const toolHandlingResult = await handleToolCallsWithFallback(
            responseMessage,
            providerConfig,
            key,
            onProgress,
            capabilityLevel,
            tools,
            messages,
            message // original user message for Level 4
        );
        if (toolHandlingResult?.earlyReturn) {
            return toolHandlingResult.earlyReturn;
        }
        responseMessage = toolHandlingResult.responseMessage || responseMessage;

        const assistantContent = responseMessage?.content || 'I couldn\'t generate a response.';

        // Add final response to history
        if (window.SessionManager?.addMessageToHistory) {
            window.SessionManager.addMessageToHistory({
                role: 'assistant',
                content: assistantContent
            });
        }

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
        if (window.SessionManager?.addMessageToHistory) {
            window.SessionManager.addMessageToHistory({
                role: 'assistant',
                content: fallbackResponse,
                error: true
            });
        }
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
// Tool Call Handling
// ==========================================

/**
 * Execute LLM-requested tool calls and return the follow-up response message.
 * If a tool fails, returns an early result for the caller to surface.
 * 
 * CIRCUIT BREAKER: Max 5 function calls per turn, 30s timeout per function.
 */
async function handleToolCalls(responseMessage, providerConfig, key, onProgress) {
    if (!responseMessage?.tool_calls || responseMessage.tool_calls.length === 0) {
        return { responseMessage };
    }

    // Note: CircuitBreaker.resetTurn() is now called at the start of sendMessage()
    // to ensure reset happens for all messages, not just those with tool calls

    console.log('[Chat] LLM requested tool calls:', responseMessage.tool_calls.map(tc => tc.function.name));

    // Add assistant's tool call message to conversation
    if (window.SessionManager?.addMessageToHistory) {
        window.SessionManager.addMessageToHistory({
            role: 'assistant',
            content: responseMessage.content || null,
            tool_calls: responseMessage.tool_calls
        });
    }

    // Execute each function call and add results
    // HNW Fix: Add timeout to prevent indefinite hangs
    // CIRCUIT BREAKER: Enforces max 5 calls per turn
    for (const toolCall of responseMessage.tool_calls) {
        // Check circuit breaker before each call
        if (window.CircuitBreaker?.check) {
            const breakerCheck = window.CircuitBreaker.check();
            if (!breakerCheck.allowed) {
                console.warn(`[Chat] Circuit breaker tripped: ${breakerCheck.reason}`);
                if (onProgress) onProgress({ type: 'circuit_breaker_trip', reason: breakerCheck.reason });
                return {
                    earlyReturn: {
                        status: 'error',
                        content: window.CircuitBreaker.getErrorMessage(breakerCheck.reason),
                        role: 'assistant',
                        isCircuitBreakerError: true
                    }
                };
            }
            // Record this call
            window.CircuitBreaker.recordCall();
        }

        const functionName = toolCall.function.name;
        const rawArgs = toolCall.function.arguments || '{}';
        let args;

        try {
            args = rawArgs ? JSON.parse(rawArgs) : {};
        } catch (parseError) {
            console.warn(`[Chat] Invalid tool call arguments for ${functionName}:`, rawArgs);

            if (onProgress) onProgress({ type: 'tool_end', tool: functionName, error: true });

            return {
                earlyReturn: {
                    status: 'error',
                    content: buildToolCodeOnlyError(functionName, rawArgs),
                    role: 'assistant',
                    isFunctionError: true
                }
            };
        }

        console.log(`[Chat] Executing function: ${functionName}`, args);

        // Notify UI: Tool start
        if (onProgress) onProgress({ type: 'tool_start', tool: functionName });

        // Execute the function with AbortController for true cancellation
        // This enables proper cleanup when timeout occurs, rather than just ignoring the result
        let result;
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
            abortController.abort();
        }, CHAT_FUNCTION_TIMEOUT_MS);

        try {
            result = await window.Functions.execute(functionName, args, streamsData, {
                signal: abortController.signal
            });
            clearTimeout(timeoutId);

            // Check if aborted while executing
            if (result?.aborted) {
                throw new Error(`Function ${functionName} timed out after ${CHAT_FUNCTION_TIMEOUT_MS}ms`);
            }
        } catch (funcError) {
            clearTimeout(timeoutId);
            console.error(`[Chat] Function execution failed:`, funcError);

            // Notify UI: Tool error (optional state update)
            if (onProgress) onProgress({ type: 'tool_end', tool: functionName, error: true }); // Reset UI state

            // Return error status to allow UI to show retry
            return {
                earlyReturn: {
                    status: 'error',
                    content: `Function call '${functionName}' failed: ${funcError.message}. Please try again or select a different model.`,
                    role: 'assistant',
                    isFunctionError: true
                }
            };
        }

        console.log(`[Chat] Function result:`, result);

        // Note: isCodeLikeToolArguments check removed here. The JSON parse failure
        // check above (line ~765) already catches malformed tool arguments including code.
        // Checking rawArgs again after successful execution creates false positives.

        // Notify UI: Tool end
        if (onProgress) onProgress({ type: 'tool_end', tool: functionName, result });

        // Add tool result to conversation
        if (window.SessionManager?.addMessageToHistory) {
            window.SessionManager.addMessageToHistory({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(result)
            });
        }
    }

    // Get updated history for follow-up call
    const updatedHistory = window.SessionManager?.getHistory?.() || [];

    // Make follow-up call with function results
    const followUpMessages = [
        { role: 'system', content: buildSystemPrompt() },
        ...updatedHistory
    ];

    // Notify UI: Thinking again (processing tool results)
    if (onProgress) onProgress({ type: 'thinking' });

    const response = await callLLM(providerConfig, key, followUpMessages, undefined);
    return { responseMessage: response.choices[0]?.message };
}

/**
 * Heuristic check for when the model returns code instead of JSON args
 */
function isCodeLikeToolArguments(rawArgs = '') {
    const trimmed = String(rawArgs || '').trim();

    if (!trimmed) {
        return false;
    }

    // Look for code-like patterns (backticks, declarations, arrows, function calls)
    const codePattern = /```|function\s|\bconst\b|\blet\b|\bvar\b|=>|return\s|;|\n/;

    if (codePattern.test(trimmed)) {
        return true;
    }

    // Simple function call shape like fn(...)
    return /^[A-Za-z_$][\w$]*\s*\(/.test(trimmed);
}

/**
 * Build a user-facing error message when tool calls look like code-only responses
 */
function buildToolCodeOnlyError(functionName, rawArgs) {
    const codeHint = isCodeLikeToolArguments(rawArgs);
    if (codeHint) {
        return `The AI tried to call '${functionName}' but only shared code for the call instead of executing it. Ask it to run the tool directly (no code blocks) or try again.`;
    }
    return `Function call '${functionName}' failed because the tool arguments were invalid. Please try again or select a different model.`;
}

// ==========================================
// Tool Call Handling with Fallback Support
// ==========================================

/**
 * Handle tool calls with fallback support for models without native function calling.
 * 
 * Fallback Levels:
 * 1. Native: Use native tool_calls from response
 * 2. Prompt Injection: Parse <function_call> tags from text response
 * 3. Regex Parsing: Extract function calls from structured text patterns
 * 4. Direct Query: Extract intent from user message and execute function directly
 * 
 * @param {object} responseMessage - LLM response message
 * @param {object} providerConfig - Provider configuration
 * @param {string} key - API key
 * @param {function} onProgress - Progress callback
 * @param {number} capabilityLevel - Detected capability level (1-4)
 * @param {Array} tools - Available function tools
 * @param {Array} messages - Original messages array
 * @param {string} userMessage - Original user message (for Level 4)
 * @returns {Promise<{responseMessage?: object, earlyReturn?: object}>}
 */
async function handleToolCallsWithFallback(
    responseMessage,
    providerConfig,
    key,
    onProgress,
    capabilityLevel,
    tools,
    messages,
    userMessage
) {
    // Level 1: Native function calling - use existing handler
    if (capabilityLevel === 1 && responseMessage?.tool_calls?.length > 0) {
        console.log('[Chat] Level 1: Processing native tool calls');
        return handleToolCalls(responseMessage, providerConfig, key, onProgress);
    }

    // Levels 2/3: Try to parse function calls from text response
    if (capabilityLevel >= 2 && window.FunctionCallingFallback) {
        const content = responseMessage?.content || '';
        const parsedCalls = window.FunctionCallingFallback.parseFunctionCallsFromText(content);

        if (parsedCalls.length > 0) {
            console.log(`[Chat] Level ${capabilityLevel}: Parsed ${parsedCalls.length} function calls from text`);

            // Notify UI about fallback parsing
            if (onProgress) {
                onProgress({ type: 'fallback_parsing', level: capabilityLevel, calls: parsedCalls.length });
            }

            // Circuit breaker reset for fallback path
            if (window.CircuitBreaker?.resetTurn) {
                window.CircuitBreaker.resetTurn();
            }

            // Execute each parsed function call with circuit breaker check before each
            // (mirrors handleToolCalls behavior - check+record immediately before execution)
            const results = [];
            for (const call of parsedCalls) {
                // Check circuit breaker BEFORE executing each call
                if (window.CircuitBreaker?.check) {
                    const breakerCheck = window.CircuitBreaker.check();
                    if (!breakerCheck.allowed) {
                        console.warn(`[Chat] Circuit breaker tripped in fallback path: ${breakerCheck.reason}`);
                        if (onProgress) onProgress({ type: 'circuit_breaker_trip', reason: breakerCheck.reason });
                        return {
                            earlyReturn: {
                                status: 'error',
                                content: window.CircuitBreaker.getErrorMessage(breakerCheck.reason),
                                role: 'assistant',
                                isCircuitBreakerError: true
                            }
                        };
                    }
                    // Record immediately before execution
                    window.CircuitBreaker.recordCall();
                }

                // Notify UI: Tool start
                if (onProgress) onProgress({ type: 'tool_start', tool: call.name });

                // Execute with timeout protection
                let result;
                try {
                    result = await Promise.race([
                        window.Functions?.execute?.(call.name, call.arguments, streamsData) ?? Promise.resolve({ error: 'Functions module not available' }),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error(`Function ${call.name} timed out after ${CHAT_FUNCTION_TIMEOUT_MS}ms`)), CHAT_FUNCTION_TIMEOUT_MS)
                        )
                    ]);
                } catch (execError) {
                    console.error(`[Chat] Fallback function execution failed for ${call.name}:`, execError);
                    if (onProgress) onProgress({ type: 'tool_end', tool: call.name, error: true });
                    return {
                        earlyReturn: {
                            status: 'error',
                            content: `Function '${call.name}' failed: ${execError.message}. Please try again or select a different model.`,
                            role: 'assistant',
                            isFunctionError: true
                        }
                    };
                }

                // Notify UI: Tool end
                if (onProgress) onProgress({ type: 'tool_end', tool: call.name, result });
                results.push({ name: call.name, result });
            }

            // Build follow-up message with results
            const resultsMessage = window.FunctionCallingFallback.buildFunctionResultsMessage(results);

            // Add results to conversation history
            if (window.SessionManager?.addMessageToHistory) {
                window.SessionManager.addMessageToHistory({
                    role: 'assistant',
                    content: content // Original response with function calls
                });
                window.SessionManager.addMessageToHistory({
                    role: 'user',
                    content: resultsMessage,
                    isSystem: true // Mark as system-generated
                });
            }

            // Make follow-up call with function results
            const followUpMessages = [
                { role: 'system', content: buildSystemPrompt() },
                ...(window.SessionManager?.getHistory?.() || [])
            ];

            if (onProgress) onProgress({ type: 'thinking' });

            try {
                const followUpResponse = await callLLM(providerConfig, key, followUpMessages, undefined);
                return { responseMessage: followUpResponse.choices[0]?.message };
            } catch (error) {
                console.error('[Chat] Follow-up call failed:', error);
                // Return results directly if follow-up fails
                const directResponse = results.map(r =>
                    `${r.name}: ${JSON.stringify(r.result, null, 2)}`
                ).join('\n\n');
                return {
                    responseMessage: {
                        role: 'assistant',
                        content: `I found this data for you:\n\n${directResponse}`
                    }
                };
            }
        }

        // Level 4: Extract intent from user message and execute directly
        if (capabilityLevel >= 4 || (parsedCalls.length === 0 && userMessage)) {
            const intent = window.FunctionCallingFallback.extractQueryIntent(userMessage);

            if (intent) {
                console.log(`[Chat] Level 4: Extracted intent "${intent.function}" from user message`);

                if (onProgress) {
                    onProgress({ type: 'fallback_intent', level: 4, function: intent.function });
                    onProgress({ type: 'tool_start', tool: intent.function });
                }

                // Execute the extracted function with timeout protection
                let results;
                try {
                    results = await Promise.race([
                        window.FunctionCallingFallback.executeFunctionCalls([intent], streamsData),
                        new Promise((_, reject) =>
                            setTimeout(
                                () => reject(new Error(`Fallback function calls timed out after ${CHAT_FUNCTION_TIMEOUT_MS}ms`)),
                                CHAT_FUNCTION_TIMEOUT_MS
                            )
                        )
                    ]);
                } catch (timeoutError) {
                    console.error('[Chat] Fallback function execution failed:', timeoutError);
                    if (onProgress) onProgress({ type: 'tool_end', tool: intent.function, error: true });
                    return {
                        earlyReturn: {
                            status: 'error',
                            content: `Function calls timed out: ${timeoutError.message}. Please try again or select a different model.`,
                            role: 'assistant',
                            isFunctionError: true
                        }
                    };
                }
                const result = results[0];

                if (onProgress) {
                    onProgress({ type: 'tool_end', tool: intent.function, result: result?.result });
                }

                if (result && !result.result?.error) {
                    // Inject results into the response for a data-grounded answer
                    const resultsMessage = window.FunctionCallingFallback.buildFunctionResultsMessage(results);

                    // Make a new call with the data context
                    const enrichedMessages = [
                        { role: 'system', content: buildSystemPrompt() },
                        ...(window.SessionManager?.getHistory?.() || []),
                        { role: 'user', content: resultsMessage, isSystem: true }
                    ];

                    if (onProgress) onProgress({ type: 'thinking' });

                    try {
                        const enrichedResponse = await callLLM(providerConfig, key, enrichedMessages, undefined);
                        return { responseMessage: enrichedResponse.choices[0]?.message };
                    } catch (error) {
                        console.error('[Chat] Enriched response failed:', error);
                        // Return the original response with data context added
                        const dataContext = JSON.stringify(result.result, null, 2);
                        return {
                            responseMessage: {
                                role: 'assistant',
                                content: `${responseMessage?.content || ''}\n\n**Data from your listening history:**\n\`\`\`json\n${dataContext}\n\`\`\``
                            }
                        };
                    }
                }
            }
        }
    }

    // Check if we still have native tool_calls (Level 1 fallback for OpenRouter with unknown models)
    if (responseMessage?.tool_calls?.length > 0) {
        console.log('[Chat] Native tool calls found in response');
        return handleToolCalls(responseMessage, providerConfig, key, onProgress);
    }

    // No function calls to handle
    return { responseMessage };
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
 * Call the LLM provider
 * Delegates to ProviderInterface for unified provider routing
 * 
 * @param {object} config - Provider config from buildProviderConfig
 * @param {string} apiKey - API key (for OpenRouter)
 * @param {Array} messages - Chat messages
 * @param {Array} tools - Function calling tools (optional)
 * @param {function} onProgress - Progress callback for streaming (optional)
 * @returns {Promise<object>} Response in OpenAI-compatible format
 */
async function callLLM(config, apiKey, messages, tools, onProgress = null) {
    if (!window.ProviderInterface?.callProvider) {
        throw new Error('ProviderInterface not loaded. Ensure provider modules are included before chat.js.');
    }

    return window.ProviderInterface.callProvider(config, apiKey, messages, tools, onProgress);
}

/**
 * Regenerate the last assistant response
 * DELEGATES to MessageOperations
 */
async function regenerateLastResponse(options = null) {
    // Get history from SessionManager
    const conversationHistory = window.SessionManager?.getHistory?.() || [];

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
    // Use SessionManager's truncate method
    let lastMsgIndex = conversationHistory.length - 1;
    while (lastMsgIndex >= 0) {
        const lastMsg = conversationHistory[lastMsgIndex];
        if (lastMsg.role === 'user') break;
        lastMsgIndex--;
    }

    if (lastMsgIndex < 0) {
        return { error: 'No user message found to regenerate response for.' };
    }

    const lastUserMsg = conversationHistory[lastMsgIndex];
    const message = lastUserMsg.content;

    // Truncate history to just before the user message
    if (window.SessionManager?.truncateHistory) {
        window.SessionManager.truncateHistory(lastMsgIndex);
    }

    // Re-send
    return sendMessage(message, options);
}

/**
 * Delete a specific message index from history
 * DELEGATES to MessageOperations
 */
function deleteMessage(index) {
    const conversationHistory = window.SessionManager?.getHistory?.() || [];

    if (typeof window.MessageOperations !== 'undefined') {
        const result = window.MessageOperations.deleteMessage(index, conversationHistory);
        saveConversation();
        return result;
    }

    // Fallback if MessageOperations not available
    if (index < 0 || index >= conversationHistory.length) return false;

    if (window.SessionManager?.removeMessageFromHistory) {
        window.SessionManager.removeMessageFromHistory(index);
    }
    saveConversation();
    return true;
}

/**
 * Edit a user message
 * DELEGATES to MessageOperations
 */
async function editMessage(index, newText, options = null) {
    const conversationHistory = window.SessionManager?.getHistory?.() || [];

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
    if (window.SessionManager?.truncateHistory) {
        window.SessionManager.truncateHistory(index);
    }

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
 * Delegates to SessionManager
 */
function clearHistory() {
    if (window.SessionManager?.clearConversation) {
        window.SessionManager.clearConversation();
    }
}

/**
 * Get conversation history
 * Delegates to SessionManager
 */
function getHistory() {
    return window.SessionManager?.getHistory?.() || [];
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

// ES Module export
export const Chat = {
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

// Keep window global for backwards compatibility
if (typeof window !== 'undefined') {
    window.Chat = Chat;
}

console.log('[Chat] Module loaded');
