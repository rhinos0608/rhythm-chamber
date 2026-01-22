/**
 * Message Lifecycle Coordinator
 *
 * Manages message lifecycle: creation, mutation, deletion.
 * Coordinates with ConversationOrchestrator for context.
 *
 * HNW Compliance:
 * - Write operations (message mutation)
 * - TurnQueue serialization for deterministic ordering
 * - Dependency injection via init()
 *
 * @module services/message-lifecycle-coordinator
 */

import { TurnQueue } from './turn-queue.js';
import { TimeoutBudget } from './timeout-budget-manager.js';

// Dependencies (injected via init)
let _SessionManager = null;
let _ConversationOrchestrator = null;
let _LLMProviderRoutingService = null;
let _ToolCallHandlingService = null;
let _TokenCountingService = null;
let _FallbackResponseService = null;
let _CircuitBreaker = null;
let _ModuleRegistry = null;
let _Settings = null;
let _Config = null;
let _Functions = null;
let _WaveTelemetry = null;
let _MessageOperations = null;

// Track if we've already shown fallback notification this session
let _hasShownFallbackNotification = false;

// Track processed message hashes for deduplication
const _processedMessageHashes = new Set();

// Maximum number of hashes to keep (prevent unbounded growth)
const MAX_HASH_CACHE_SIZE = 1000;

// Timeout constants
const CHAT_API_TIMEOUT_MS = 60000;
const LOCAL_LLM_TIMEOUT_MS = 90000;
const CHAT_FUNCTION_TIMEOUT_MS = 30000;

/**
 * Generate a simple hash for message content (FNV-1a inspired)
 * Used for duplicate detection without requiring crypto APIs
 * @param {string} content - The message content to hash
 * @returns {string} Hex string hash
 */
function hashMessageContent(content) {
    if (!content || typeof content !== 'string') return '';

    let hash = 0x811c9dc5;
    for (let i = 0; i < content.length; i++) {
        hash ^= content.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
}

/**
 * Validate message content before processing
 * @param {string} message - The message to validate
 * @returns {Object} Validation result with valid flag and error message
 */
function validateMessage(message) {
    // Check for non-string input
    if (typeof message !== 'string') {
        return {
            valid: false,
            error: 'Message must be a string'
        };
    }

    // Check for empty string
    if (message.length === 0) {
        return {
            valid: false,
            error: 'Message cannot be empty'
        };
    }

    // Check for whitespace-only content
    if (message.trim().length === 0) {
        return {
            valid: false,
            error: 'Message cannot contain only whitespace'
        };
    }

    // Check for unreasonably long messages (prevent abuse/DoS)
    const MAX_MESSAGE_LENGTH = 50000; // 50k characters
    if (message.length > MAX_MESSAGE_LENGTH) {
        return {
            valid: false,
            error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)`
        };
    }

    // Check for duplicate content
    const messageHash = hashMessageContent(message);
    if (_processedMessageHashes.has(messageHash)) {
        return {
            valid: false,
            error: 'Duplicate message detected - this message was already processed'
        };
    }

    return { valid: true };
}

/**
 * Add a message hash to the processed set
 * Implements LRU-style eviction when cache is full
 * @param {string} message - The message whose hash to add
 */
function trackProcessedMessage(message) {
    const messageHash = hashMessageContent(message);
    if (messageHash) {
        // Evict oldest entry if cache is full
        if (_processedMessageHashes.size >= MAX_HASH_CACHE_SIZE) {
            const firstHash = _processedMessageHashes.values().next().value;
            _processedMessageHashes.delete(firstHash);
        }
        _processedMessageHashes.add(messageHash);
    }
}

/**
 * Clear duplicate detection cache
 * Useful for testing or when intentional re-submission is needed
 */
function clearDuplicateCache() {
    _processedMessageHashes.clear();
}

/**
 * Build user-friendly error message with provider-specific hints
 * @param {Error} error - The error that occurred
 * @param {string} provider - The provider that was being used
 * @returns {string} Formatted error message for display
 */
function buildUserErrorMessage(error, provider) {
    const providerHints = {
        ollama: 'Ensure Ollama is running (`ollama serve`)',
        lmstudio: 'Check LM Studio server is enabled',
        gemini: 'Verify your Gemini API key in Settings',
        openrouter: 'Check your OpenRouter API key in Settings'
    };

    const hint = providerHints[provider] || 'Check your provider settings';

    return `**Connection Error**\n\n${error.message}\n\n💡 **Tip:** ${hint}\n\nClick "Try Again" after fixing the issue.`;
}


/**
 * Validate LLM response structure
 * EDGE CASE FIX: Comprehensive validation to catch malformed responses
 * @param {object} response - The response from LLM provider
 * @param {string} provider - Provider name for error messages
 * @returns {{ valid: boolean, error?: string }} Validation result
 */
function validateLLMResponse(response, provider) {
    // Check response exists
    if (!response || typeof response !== 'object') {
        return { valid: false, error: `No response received from ${provider}` };
    }

    // Check choices array exists and has items
    if (!response.choices || !Array.isArray(response.choices)) {
        return { valid: false, error: `${provider} returned response without choices array` };
    }

    if (response.choices.length === 0) {
        return { valid: false, error: `${provider} returned empty choices array` };
    }

    const firstChoice = response.choices[0];

    // Check first choice has message property
    if (!firstChoice.message || typeof firstChoice.message !== 'object') {
        return { valid: false, error: `${provider} returned choice without message object` };
    }

    // Check message has role (required field)
    if (!firstChoice.message.role) {
        return { valid: false, error: `${provider} returned message without role` };
    }

    // Check for common malformed structures
    if (firstChoice.message.content !== undefined &&
        typeof firstChoice.message.content !== 'string' &&
        typeof firstChoice.message.content !== 'null') {
        return { valid: false, error: `${provider} returned message with invalid content type` };
    }

    // Validate tool_calls structure if present
    if (firstChoice.message.tool_calls) {
        if (!Array.isArray(firstChoice.message.tool_calls)) {
            return { valid: false, error: `${provider} returned non-array tool_calls` };
        }
        // Each tool call should have function.name at minimum
        for (let i = 0; i < firstChoice.message.tool_calls.length; i++) {
            const tc = firstChoice.message.tool_calls[i];
            if (!tc.function || typeof tc.function !== 'object') {
                return { valid: false, error: `${provider} returned tool_call without function object at index ${i}` };
            }
            if (!tc.function.name) {
                return { valid: false, error: `${provider} returned tool_call without function.name at index ${i}` };
            }
        }
    }

    return { valid: true };
}


/**
 * Initialize MessageLifecycleCoordinator
 */
function init(dependencies) {
    _SessionManager = dependencies.SessionManager;
    _ConversationOrchestrator = dependencies.ConversationOrchestrator;
    _LLMProviderRoutingService = dependencies.LLMProviderRoutingService;
    _ToolCallHandlingService = dependencies.ToolCallHandlingService;
    _TokenCountingService = dependencies.TokenCountingService;
    _FallbackResponseService = dependencies.FallbackResponseService;
    _CircuitBreaker = dependencies.CircuitBreaker;
    _ModuleRegistry = dependencies.ModuleRegistry;
    _Settings = dependencies.Settings;
    _Config = dependencies.Config;
    _Functions = dependencies.Functions;
    _WaveTelemetry = dependencies.WaveTelemetry;
    _MessageOperations = dependencies.MessageOperations;
    console.log('[MessageLifecycleCoordinator] Initialized');
}

/**
 * Send a message and get response
 * Supports OpenAI-style function calling for dynamic data queries
 * Includes client-side token counting to prevent context window limits
 *
 * @param {string} message - User message
 * @param {Object|string} optionsOrKey - Options object or API key string
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.bypassQueue] - Bypass turn queue for internal operations (restricted)
 * @param {boolean} [options.allowBypass] - Explicit flag to allow bypassQueue (security measure)
 */
async function sendMessage(message, optionsOrKey = null, options = {}) {
    const userContext = _ConversationOrchestrator?.getUserContext();
    if (!userContext) {
        throw new Error('Chat not initialized. Call initChat first.');
    }

    // ISSUE 2: Input validation at entry point
    const validation = validateMessage(message);
    if (!validation.valid) {
        console.warn('[MessageLifecycleCoordinator] Message validation failed:', validation.error);
        // Return error response instead of throwing to maintain graceful degradation
        return {
            content: validation.error,
            status: 'error',
            error: validation.error,
            role: 'assistant'
        };
    }

    const bypassQueue = options?.bypassQueue === true;

    // ISSUE 4: Validate bypassQueue usage - require explicit allowBypass flag
    if (bypassQueue && !options?.allowBypass) {
        console.warn('[MessageLifecycleCoordinator] bypassQueue requires allowBypass flag for security');
        // Fall through to normal queue processing
        return TurnQueue.push(message, optionsOrKey);
    }

    if (bypassQueue) {
        console.log('[MessageLifecycleCoordinator] Bypassing turn queue for internal operation (with explicit allowBypass)');
        return processMessage(message, optionsOrKey);
    } else {
        return TurnQueue.push(message, optionsOrKey);
    }
}

/**
 * Process a message (internal implementation)
 * This is the actual message processing logic that gets wrapped by TurnQueue
 *
 * ISSUE 1: Implements staging pattern - user message is only committed on successful response
 *
 * @param {string} message - User message
 * @param {Object|string} optionsOrKey - Options object or API key string
 */
async function processMessage(message, optionsOrKey = null) {
    const turnBudget = TimeoutBudget.allocate('chat_turn', 60000);

    // Flag to track if we've committed the user message to history
    let userMessageCommitted = false;

    try {
        if (_CircuitBreaker?.resetTurn) {
            _CircuitBreaker.resetTurn();
        }

        // ISSUE 1: Staging pattern - don't add user message yet
        // Will only commit after successful response
        console.log('[MessageLifecycleCoordinator] Staging user message (not committed until successful response)');

        let semanticContext = null;
        const RAG = _ModuleRegistry?.getModuleSync('RAG');
        if (RAG?.isConfigured()) {
            try {
                semanticContext = await RAG.getSemanticContext(message, 3);
                if (semanticContext) {
                    console.log('[MessageLifecycleCoordinator] Semantic context retrieved from RAG');
                }
            } catch (err) {
                console.warn('[MessageLifecycleCoordinator] RAG semantic search failed:', err.message);
            }
        }

        const conversationHistory = _SessionManager.getHistory();

        // Build messages array with staged user message (not yet in history)
        const messages = [
            { role: 'system', content: _ConversationOrchestrator.buildSystemPrompt(null, semanticContext) },
            ...conversationHistory,
            { role: 'user', content: message }  // Staged - not in history yet
        ];

        const options = (typeof optionsOrKey === 'string')
            ? { apiKey: optionsOrKey }
            : (optionsOrKey || {});

        const { apiKey, onProgress } = options;

        const settings = _Settings?.getSettings?.() || {};

        const provider = settings.llm?.provider || 'openrouter';
        console.log('[MessageLifecycleCoordinator] Using LLM provider:', provider);

        const isLocalProvider = provider === 'ollama' || provider === 'lmstudio';

        const config = _Config?.openrouter || {};

        let key = apiKey || settings.openrouter?.apiKey || config.apiKey;

        const isValidKey = key && key !== '' && key !== 'your-api-key-here';

        if (!isLocalProvider && !isValidKey) {
            const queryContext = _ConversationOrchestrator.generateQueryContext(message);
            const fallbackResponse = _FallbackResponseService.generateFallbackResponse(message, queryContext);

            // CRITICAL FIX: Add user and assistant messages atomically in a single transaction
            // This prevents race conditions where other operations could interleave between the two adds
            const messagesToAdd = [
                { role: 'user', content: message },
                { role: 'assistant', content: fallbackResponse }
            ];
            await _SessionManager.addMessagesToHistory(messagesToAdd);
            userMessageCommitted = true;
            trackProcessedMessage(message);  // Track even fallback responses

            // Show subtle fallback notification once per session
            if (!_hasShownFallbackNotification && _Settings?.showToast) {
                _Settings.showToast('Using offline response mode - add an API key for AI responses', 4000);
                _hasShownFallbackNotification = true;
            }
            return {
                content: fallbackResponse,
                status: 'success',
                role: 'assistant',
                isFallback: true
            };
        }

        const providerConfig = _LLMProviderRoutingService?.buildProviderConfig?.(provider, settings, config) || {
            provider: provider,
            model: settings.llm?.model || 'default',
            baseUrl: settings[provider]?.baseUrl || ''
        };

        const tools = _Functions?.getEnabledSchemas?.() || _Functions?.schemas || [];

        const capabilityLevel = 1;

        let useTools = tools.length > 0 && _ConversationOrchestrator.getStreamsData()?.length > 0;

        if (_TokenCountingService) {
            const tokenInfo = _TokenCountingService.calculateTokenUsage({
                systemPrompt: messages[0].content,
                messages: messages.slice(1),
                ragContext: semanticContext,
                tools: useTools ? tools : [],
                model: providerConfig.model
            });

            console.log('[MessageLifecycleCoordinator] Token count:', tokenInfo);

            if (tokenInfo.warnings.length > 0) {
                const recommended = _TokenCountingService.getRecommendedAction(tokenInfo);

                tokenInfo.warnings.forEach(warning => {
                    console.warn(`[MessageLifecycleCoordinator] Token warning [${warning.level}]: ${warning.message}`);
                });

                if (recommended.action === 'truncate') {
                    console.log('[MessageLifecycleCoordinator] Applying truncation strategy...');

                    const truncatedParams = _TokenCountingService.truncateToTarget({
                        systemPrompt: messages[0].content,
                        messages: messages.slice(1),
                        ragContext: semanticContext,
                        tools: useTools ? tools : [],
                        model: providerConfig.model
                    }, Math.floor(tokenInfo.contextWindow * 0.9));

                    const truncatedMessages = [
                        { role: 'system', content: truncatedParams.systemPrompt },
                        ...truncatedParams.messages
                    ];

                    messages.length = 0;
                    messages.push(...truncatedMessages);

                    semanticContext = truncatedParams.ragContext;
                    if (!truncatedParams.tools || truncatedParams.tools.length === 0) {
                        useTools = false;
                    }

                    if (onProgress) onProgress({
                        type: 'token_warning',
                        message: 'Context too large - conversation truncated',
                        tokenInfo: tokenInfo,
                        truncated: true
                    });
                } else if (recommended.action === 'warn_user') {
                    if (onProgress) onProgress({
                        type: 'token_warning',
                        message: recommended.message,
                        tokenInfo: tokenInfo,
                        truncated: false
                    });
                }
            }

            if (onProgress) onProgress({
                type: 'token_update',
                tokenInfo: tokenInfo
            });
        }

        try {
            if (onProgress) onProgress({ type: 'thinking' });

            let apiMessages = messages;
            let apiTools = useTools ? tools : undefined;

            if (!_LLMProviderRoutingService?.callLLM) {
                throw new Error('LLMProviderRoutingService not loaded. Ensure provider modules are included before chat initialization.');
            }

            const llmCallStart = Date.now();
            // ISSUE 5: Pass timeout signal to callLLM
            let response = await _LLMProviderRoutingService.callLLM(
                providerConfig,
                key,
                apiMessages,
                apiTools,
                isLocalProvider ? onProgress : null,
                turnBudget.signal  // Pass AbortSignal for timeout handling
            );
            const llmCallDuration = Date.now() - llmCallStart;

            const telemetryMetric = isLocalProvider ? 'local_llm_call' : 'cloud_llm_call';
            _WaveTelemetry?.record(telemetryMetric, llmCallDuration);
            console.log(`[MessageLifecycleCoordinator] LLM call completed in ${llmCallDuration}ms`);

            // EDGE CASE FIX: Comprehensive response validation
            // Only validates response.choices, missing checks for malformed structure, missing fields
            const providerName = providerConfig.provider || 'LLM';
            const validation = validateLLMResponse(response, providerName);
            if (!validation.valid) {
                console.error('[MessageLifecycleCoordinator] Invalid response from provider:', providerName, validation.error, response);
                throw new Error(`${providerName} returned an invalid response: ${validation.error}`);
            }
            let responseMessage = response.choices[0].message;

            const toolHandlingResult = await _ToolCallHandlingService.handleToolCallsWithFallback(
                responseMessage,
                providerConfig,
                key,
                onProgress,
                capabilityLevel,
                tools,
                messages,
                message
            );
            if (toolHandlingResult?.earlyReturn) {
                // Commit user message before early return
                if (!userMessageCommitted) {
                    await _SessionManager.addMessageToHistory({
                        role: 'user',
                        content: message
                    });
                    userMessageCommitted = true;
                    trackProcessedMessage(message);  // ISSUE 3: Track successful message
                }
                return toolHandlingResult.earlyReturn;
            }
            responseMessage = toolHandlingResult.responseMessage || responseMessage;

            const assistantContent = responseMessage?.content || 'I couldn\'t generate a response.';

            // CRITICAL FIX: Add user and assistant messages atomically in a single transaction
            // This prevents race conditions where other operations could interleave between the two adds
            if (!userMessageCommitted) {
                // Batch add both messages at once for atomicity
                const messagesToAdd = [
                    { role: 'user', content: message },
                    { role: 'assistant', content: assistantContent }
                ];
                await _SessionManager.addMessagesToHistory(messagesToAdd);
                userMessageCommitted = true;
                trackProcessedMessage(message);
            } else {
                // User message was already committed (e.g., during tool call handling)
                // Only add the assistant response
                await _SessionManager.addMessageToHistory({
                    role: 'assistant',
                    content: assistantContent
                });
            }

            _SessionManager.saveConversation();

            return {
                content: assistantContent,
                status: 'success',
                role: 'assistant'
            };

        } catch (error) {
            console.error('[MessageLifecycleCoordinator] Chat error:', error);

            // Build user-friendly error message with provider-specific hints
            const currentProvider = settings?.llm?.provider || 'unknown';
            const errorMessage = buildUserErrorMessage(error, currentProvider);

            // ISSUE 6: Mark error messages to exclude from LLM context
            // The 'error' flag allows filtering when building context for future turns
            await _SessionManager.addMessageToHistory({
                role: 'assistant',
                content: errorMessage,
                error: true,
                excludeFromContext: true  // Signal to exclude from LLM context
            });
            _SessionManager.saveConversation();

            // Always show error toast with actionable information
            if (_Settings?.showToast) {
                _Settings.showToast(`Error: ${error.message}`, 5000);
            }

            return {
                content: errorMessage,
                status: 'error',
                error: error.message,
                role: 'assistant'
            };
        }
    } finally {
        TimeoutBudget.release(turnBudget);
    }
}

/**
 * Regenerate the last assistant response
 */
async function regenerateLastResponse(options = null) {
    const conversationHistory = _SessionManager.getHistory();

    if (typeof _MessageOperations !== 'undefined') {
        return _MessageOperations.regenerateLastResponse(
            conversationHistory,
            sendMessage,
            options
        );
    }

    if (conversationHistory.length === 0) return null;

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

    // HIGH PRIORITY FIX: Await truncateHistory since it's now async with mutex protection
    // This prevents race condition where sendMessage starts before truncation completes
    await _SessionManager.truncateHistory(lastMsgIndex);

    return sendMessage(message, options);
}

/**
 * Delete a specific message from history
 */
async function deleteMessage(index) {
    const conversationHistory = _SessionManager.getHistory();

    if (typeof _MessageOperations !== 'undefined') {
        const result = _MessageOperations.deleteMessage(index, conversationHistory);
        _SessionManager.saveConversation();
        return result;
    }

    if (index < 0 || index >= conversationHistory.length) return false;

    // HIGH PRIORITY FIX: Await removeMessageFromHistory since it's now async with mutex protection
    await _SessionManager.removeMessageFromHistory(index);
    _SessionManager.saveConversation();
    return true;
}

/**
 * Edit a user message
 */
async function editMessage(index, newText, options = null) {
    const conversationHistory = _SessionManager.getHistory();

    if (typeof _MessageOperations !== 'undefined') {
        return _MessageOperations.editMessage(
            index,
            newText,
            conversationHistory,
            sendMessage,
            options
        );
    }

    if (index < 0 || index >= conversationHistory.length) return null;

    const msg = conversationHistory[index];
    if (msg.role !== 'user') return { error: 'Can only edit user messages' };

    // HIGH PRIORITY FIX: Await truncateHistory since it's now async with mutex protection
    await _SessionManager.truncateHistory(index);

    return sendMessage(newText, options);
}

/**
 * Clear conversation history
 */
function clearHistory() {
    _SessionManager.clearConversation();
}

/**
 * Get conversation history
 */
function getHistory() {
    return _SessionManager.getHistory();
}

export const MessageLifecycleCoordinator = {
    init,
    sendMessage,
    regenerateLastResponse,
    deleteMessage,
    editMessage,
    clearHistory,
    getHistory,
    clearDuplicateCache  // Expose for testing/intentional re-submission scenarios
};
