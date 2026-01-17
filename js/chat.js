/**
 * Chat Integration Module
 *
 * ARCHITECTURE (HNW Compliant):
 * - Chat orchestration: API calls, prompt building, function calling
 * - Session state: DELEGATED to SessionManager (js/services/session-manager.js)
 * - Message operations: DELEGATED to MessageOperations (js/services/message-operations.js)
 * - LLM calls: DELEGATED to ProviderInterface (js/providers/provider-interface.js)
 * - Tool strategies: DELEGATED to ToolStrategies (js/services/tool-strategies/)
 * - Token counting: DELEGATED to TokenCountingService (js/services/token-counting-service.js)
 * - Tool call handling: DELEGATED to ToolCallHandlingService (js/services/tool-call-handling-service.js)
 * - LLM provider routing: DELEGATED to LLMProviderRoutingService (js/services/llm-provider-routing-service.js)
 * - Fallback responses: DELEGATED to FallbackResponseService (js/services/fallback-response-service.js)
 * - Turn serialization: DELEGATED to TurnQueue (js/services/turn-queue.js)
 *
 * System prompts are defined in prompts.js for easy editing
 * Data queries are handled by data-query.js
 */

// Tool Strategy imports (ToolStrategy pattern for function calling)
import { NativeToolStrategy } from './services/tool-strategies/native-strategy.js';
import { PromptInjectionStrategy } from './services/tool-strategies/prompt-injection-strategy.js';
import { IntentExtractionStrategy } from './services/tool-strategies/intent-extraction-strategy.js';
import { ModuleRegistry } from './module-registry.js';

// Turn serialization import
import { TurnQueue } from './services/turn-queue.js';

// Timeout budget import
import { TimeoutBudget } from './services/timeout-budget-manager.js';

// Wave telemetry import for LLM call timing
import { WaveTelemetry } from './services/wave-telemetry.js';

// Session Manager import
import { SessionManager } from './services/session-manager.js';

// Token Counter import
import { TokenCounter } from './token-counter.js';

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
    SessionManager.setUserContext(personality);
    await SessionManager.init();

    // Register for storage updates to refresh data
    if (window.Storage?.onUpdate) {
        window.Storage.onUpdate(handleStorageUpdate);
    }

    // Initialize MessageOperations with dependencies
    if (window.MessageOperations?.init) {
        window.MessageOperations.init({
            DataQuery: window.DataQuery,
            RAG: ModuleRegistry.getModuleSync('RAG'), // Use registry instead of window global
            TokenCounter: window.TokenCounter
        });
        window.MessageOperations.setUserContext(userContext);
        window.MessageOperations.setStreamsData(streams);
    }

    // Initialize TokenCountingService with dependencies
    if (window.TokenCountingService?.init) {
        window.TokenCountingService.init({
            TokenCounter: window.TokenCounter
        });
    }

    // Initialize ToolCallHandlingService with dependencies
    if (window.ToolCallHandlingService?.init) {
        // Pass a wrapper function for callLLM that routes through LLMProviderRoutingService
        const callLLMWrapper = (...args) => {
            if (window.LLMProviderRoutingService?.callLLM) {
                return window.LLMProviderRoutingService.callLLM(...args);
            }
            throw new Error('LLMProviderRoutingService not available');
        };

        window.ToolCallHandlingService.init({
            CircuitBreaker: window.CircuitBreaker,
            Functions: window.Functions,
            SessionManager: SessionManager,
            FunctionCallingFallback: window.FunctionCallingFallback,
            buildSystemPrompt: buildSystemPrompt,
            callLLM: callLLMWrapper,
            streamsData: streamsData,
            timeoutMs: CHAT_FUNCTION_TIMEOUT_MS
        });
    }

    // Initialize LLMProviderRoutingService with dependencies
    if (window.LLMProviderRoutingService?.init) {
        window.LLMProviderRoutingService.init({
            ProviderInterface: window.ProviderInterface,
            Settings: window.Settings,
            Config: window.Config
        });
    }

    // Initialize FallbackResponseService with dependencies
    if (window.FallbackResponseService?.init) {
        window.FallbackResponseService.init({
            MessageOperations: window.MessageOperations,
            userContext: userContext
        });
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
        // Update ToolCallHandlingService with new data
        if (window.ToolCallHandlingService?.setStreamsData) {
            window.ToolCallHandlingService.setStreamsData(streamsData);
        }
    }
}

/**
 * Save conversation to IndexedDB (debounced)
 * Delegates to SessionManager
 */
function saveConversation() {
    SessionManager.saveConversation();
}

/**
 * Flush pending save asynchronously
 * Delegates to SessionManager
 */
async function flushPendingSaveAsync() {
    return SessionManager.flushPendingSaveAsync();
}

/**
 * Emergency synchronous backup to localStorage
 * Delegates to SessionManager
 */
function emergencyBackupSync() {
    SessionManager.emergencyBackupSync();
}

/**
 * Recover emergency backup on load
 * Delegates to SessionManager (called automatically in SessionManager.init())
 */
async function recoverEmergencyBackup() {
    return SessionManager.recoverEmergencyBackup();
}

/**
 * Save current session to IndexedDB immediately
 * Delegates to SessionManager
 */
async function saveCurrentSession() {
    return SessionManager.saveCurrentSession();
}

/**
 * Create a new session
 * Delegates to SessionManager
 */
async function createNewSession(initialMessages = []) {
    return SessionManager.createNewSession(initialMessages);
}

/**
 * Load a session by ID
 * Delegates to SessionManager
 */
async function loadSession(sessionId) {
    return SessionManager.loadSession(sessionId);
}

/**
 * Switch to a different session
 * Delegates to SessionManager
 */
async function switchSession(sessionId) {
    return SessionManager.switchSession(sessionId);
}

/**
 * Get all sessions for sidebar display
 * Delegates to SessionManager
 */
async function listSessions() {
    return SessionManager.listSessions();
}

/**
 * Delete a session by ID
 * Delegates to SessionManager
 */
async function deleteSessionById(sessionId) {
    return SessionManager.deleteSessionById(sessionId);
}

/**
 * Rename a session
 * Delegates to SessionManager
 */
async function renameSession(sessionId, newTitle) {
    return SessionManager.renameSession(sessionId, newTitle);
}

/**
 * Get current session ID
 * Delegates to SessionManager
 */
function getCurrentSessionId() {
    return SessionManager.getCurrentSessionId();
}

/**
 * Register a listener for session updates
 * Delegates to SessionManager
 */
function onSessionUpdate(callback) {
    // NOTE: SessionManager no longer supports onSessionUpdate - use EventBus instead
    // This is kept for backwards compatibility but does nothing
    console.warn('[Chat] onSessionUpdate is deprecated. Use EventBus.on("session:*", callback) instead.');
}

/**
 * Clear conversation history and create new session
 * Delegates to SessionManager
 */
function clearConversation() {
    SessionManager.clearConversation();
}

/**
 * Build system prompt with user data
 * Enforces strict token limits to prevent truncation of base system instructions
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

    // Calculate base system prompt tokens
    const basePromptTokens = TokenCounter.countTokens(prompt);
    const contextWindow = TokenCounter.getContextWindow();

    // Reserve 50% of context window for base system prompt (ensures it's never truncated)
    const basePromptBudget = Math.floor(contextWindow * 0.5);
    const remainingBudget = contextWindow - basePromptBudget;

    // Log base prompt usage for debugging
    if (basePromptTokens > basePromptBudget) {
        console.warn(`[Chat] Base system prompt (${basePromptTokens} tokens) exceeds budget (${basePromptBudget} tokens). This may cause truncation.`);
    }

    // Append semantic context from RAG if available (higher priority)
    // Enforce strict token limits on semantic context
    if (semanticContext) {
        const semanticTokens = TokenCounter.countTokens(semanticContext);
        const currentTotalTokens = basePromptTokens + semanticTokens;

        if (currentTotalTokens > contextWindow) {
            // Semantic context would exceed budget, need to truncate
            const availableTokens = Math.max(0, contextWindow - basePromptTokens);
            const truncationRatio = availableTokens / semanticTokens;

            if (truncationRatio < 0.5) {
                // Semantic context would be more than 50% truncated, skip it entirely
                console.warn(`[Chat] Semantic context too large (${semanticTokens} tokens), would require ${Math.round((1 - truncationRatio) * 100)}% truncation. Skipping semantic context.`);
            } else {
                // Partially truncate semantic context
                const charsToKeep = Math.floor(semanticContext.length * truncationRatio);
                const truncatedContext = semanticContext.substring(0, charsToKeep);
                prompt += `\n\n${truncatedContext}...`;
                console.log(`[Chat] Semantic context truncated from ${semanticTokens} to ${TokenCounter.countTokens(truncatedContext)} tokens to fit within budget.`);
            }
        } else {
            // Full semantic context fits
            prompt += `\n\n${semanticContext}`;
        }
    }

    // Append query context if available (fallback)
    // Only append if we still have budget after semantic context
    if (queryContext) {
        const currentTokens = TokenCounter.countTokens(prompt);
        const queryTokens = TokenCounter.countTokens(queryContext);

        if (currentTokens + queryTokens > contextWindow * 0.9) {
            // Query context would push us over 90% of context window, skip it
            console.warn(`[Chat] Query context (${queryTokens} tokens) would exceed 90% context window. Skipping query context.`);
        } else {
            prompt += `\n\nRELEVANT DATA FOR THIS QUERY:\n${queryContext}`;
        }
    }

    // Final token count check
    const finalTokens = TokenCounter.countTokens(prompt);
    if (finalTokens > contextWindow) {
        console.error(`[Chat] Final system prompt (${finalTokens} tokens) exceeds context window (${contextWindow}). This should not happen.`);
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
 *
 * @param {string} message - User message
 * @param {Object|string} optionsOrKey - Options object or API key string
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.bypassQueue] - Bypass turn queue for internal operations
 */
async function sendMessage(message, optionsOrKey = null, options = {}) {
    if (!userContext) {
        throw new Error('Chat not initialized. Call initChat first.');
    }

    // Check if we should bypass the turn queue (for internal operations)
    const bypassQueue = options?.bypassQueue === true;

    // Wrap the actual message processing in TurnQueue for serialization
    if (bypassQueue) {
        // Bypass queue for internal operations (e.g., system messages, auto-responses)
        console.log('[Chat] Bypassing turn queue for internal operation');
        return processMessage(message, optionsOrKey);
    } else {
        // Use TurnQueue to serialize user message processing
        return TurnQueue.push(message, optionsOrKey);
    }
}

/**
 * Process a message (internal implementation)
 * This is the actual message processing logic that gets wrapped by TurnQueue
 *
 * @param {string} message - User message
 * @param {Object|string} optionsOrKey - Options object or API key string
 */
async function processMessage(message, optionsOrKey = null) {
    // Allocate timeout budget for the entire turn (60 seconds)
    // This budget will be subdivided for function calls
    const turnBudget = TimeoutBudget.allocate('chat_turn', 60000);

    try {
        // Reset circuit breaker for this turn (moved from handleToolCalls to ensure
        // reset happens for every message, not just those with tool calls)
        if (window.CircuitBreaker?.resetTurn) {
            window.CircuitBreaker.resetTurn();
        }

        // Add user message to history via SessionManager
        SessionManager.addMessageToHistory({
            role: 'user',
            content: message
        });

        // Try to get semantic context from RAG if configured
        let semanticContext = null;
        const RAG = ModuleRegistry.getModuleSync('RAG'); // Use registry instead of window global
        if (RAG?.isConfigured()) {
            try {
                semanticContext = await RAG.getSemanticContext(message, 3);
                if (semanticContext) {
                    console.log('[Chat] Semantic context retrieved from RAG');
                }
            } catch (err) {
                console.warn('[Chat] RAG semantic search failed:', err.message);
            }
        }

        // Get current history from SessionManager
        const conversationHistory = SessionManager.getHistory();

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
            const fallbackResponse = window.FallbackResponseService.generateFallbackResponse(message, queryContext);
            SessionManager.addMessageToHistory({
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

        // Build provider-specific config (guard against missing service)
        const providerConfig = window.LLMProviderRoutingService?.buildProviderConfig?.(provider, settings, config) || {
            provider: provider,
            model: settings.llm?.model || 'default',
            baseUrl: settings[provider]?.baseUrl || ''
        };

        // ==========================================
        // FUNCTION CALLING - ALWAYS TRY NATIVE FIRST
        // ==========================================
        // No capability checking - we always try native function calling first.
        // If it fails, the tool handling service will retry with fallback approaches.

        // Get function schemas if available (filtered by user's enabled tools setting)
        const tools = window.Functions?.getEnabledSchemas?.() || window.Functions?.schemas || [];

        // Always use Level 1 (native) - fallbacks handled by ToolCallHandlingService
        const capabilityLevel = 1;

        // ==========================================
        // TOKEN COUNTING & CONTEXT WINDOW MANAGEMENT
        // ==========================================
        let useTools = tools.length > 0 && streamsData && streamsData.length > 0;

        // Calculate token usage before making API call using TokenCountingService
        if (window.TokenCountingService) {
            const tokenInfo = window.TokenCountingService.calculateTokenUsage({
                systemPrompt: messages[0].content,
                messages: messages.slice(1), // Exclude system prompt
                ragContext: semanticContext,
                tools: useTools ? tools : [],
                model: providerConfig.model
            });

            console.log('[Chat] Token count:', tokenInfo);

            // Check for warnings and apply strategies
            if (tokenInfo.warnings.length > 0) {
                const recommended = window.TokenCountingService.getRecommendedAction(tokenInfo);

                // Log warnings
                tokenInfo.warnings.forEach(warning => {
                    console.warn(`[Chat] Token warning [${warning.level}]: ${warning.message}`);
                });

                // Apply truncation strategy if needed
                if (recommended.action === 'truncate') {
                    console.log('[Chat] Applying truncation strategy...');

                    // Truncate the request parameters
                    const truncatedParams = window.TokenCountingService.truncateToTarget({
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

            // Prepare messages for API call
            let apiMessages = messages;
            let apiTools = useTools ? tools : undefined;

            // Initial API call - routes to correct provider, pass onProgress for local streaming
            // Guard: Check if LLMProviderRoutingService is available
            if (!window.LLMProviderRoutingService?.callLLM) {
                throw new Error('LLMProviderRoutingService not loaded. Ensure provider modules are included before chat initialization.');
            }

            // Track LLM call duration for WaveTelemetry
            const llmCallStart = Date.now();
            let response = await window.LLMProviderRoutingService.callLLM(providerConfig, key, apiMessages, apiTools, isLocalProvider ? onProgress : null);
            const llmCallDuration = Date.now() - llmCallStart;

            // Record to WaveTelemetry for timing analysis
            const telemetryMetric = isLocalProvider ? 'local_llm_call' : 'cloud_llm_call';
            WaveTelemetry.record(telemetryMetric, llmCallDuration);
            console.log(`[Chat] LLM call completed in ${llmCallDuration}ms`);

            // HNW Fix: Validate response structure before accessing choices
            if (!response || !response.choices || response.choices.length === 0) {
                const providerName = providerConfig.provider || 'LLM';
                console.error('[Chat] Invalid response from provider:', providerName, response);
                throw new Error(`${providerName} returned an invalid response. Check if the server is running and the model is loaded.`);
            }
            let responseMessage = response.choices[0].message;

            // Handle function calling with fallback support
            const toolHandlingResult = await window.ToolCallHandlingService.handleToolCallsWithFallback(
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
            SessionManager.addMessageToHistory({
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
            const fallbackResponse = window.FallbackResponseService.generateFallbackResponse(message, queryContext);

            // Add fallback to history but mark as error context if needed
            SessionManager.addMessageToHistory({
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
    } finally {
        // Release the timeout budget
        TimeoutBudget.release(turnBudget);
    }
}

/**
 * Regenerate the last assistant response
 * DELEGATES to MessageOperations
 */
async function regenerateLastResponse(options = null) {
    // Get history from SessionManager
    const conversationHistory = SessionManager.getHistory();

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
    SessionManager.truncateHistory(lastMsgIndex);

    // Re-send
    return sendMessage(message, options);
}

/**
 * Delete a specific message index from history
 * DELEGATES to MessageOperations
 */
function deleteMessage(index) {
    const conversationHistory = SessionManager.getHistory();

    if (typeof window.MessageOperations !== 'undefined') {
        const result = window.MessageOperations.deleteMessage(index, conversationHistory);
        saveConversation();
        return result;
    }

    // Fallback if MessageOperations not available
    if (index < 0 || index >= conversationHistory.length) return false;

    SessionManager.removeMessageFromHistory(index);
    saveConversation();
    return true;
}

/**
 * Edit a user message
 * DELEGATES to MessageOperations
 */
async function editMessage(index, newText, options = null) {
    const conversationHistory = SessionManager.getHistory();

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
    SessionManager.truncateHistory(index);

    // Send new message (this will add it to history and generate response)
    return sendMessage(newText, options);
}

/**
 * Clear conversation history (also clears session storage)
 * Delegates to SessionManager
 */
function clearHistory() {
    SessionManager.clearConversation();
}

/**
 * Get conversation history
 * Delegates to SessionManager
 */
function getHistory() {
    return SessionManager.getHistory();
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

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
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

console.log('[Chat] Module loaded');
