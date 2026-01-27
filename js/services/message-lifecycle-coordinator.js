/**
 * Message Lifecycle Coordinator
 *
 * Manages message lifecycle: creation, mutation, deletion.
 * Coordinates with ConversationOrchestrator for context.
 *
 * REFACTORED: Now acts as a lightweight orchestrator that delegates to focused services:
 * - MessageValidator: validation and duplicate detection
 * - LLMApiOrchestrator: LLM API calls and provider configuration
 * - StreamProcessor: streaming response handling
 * - MessageErrorHandler: error formatting and validation
 * - MessageOperations: regenerate, edit, delete operations
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
import { EventBus } from './event-bus.js';
import { MessageValidator } from './message-validator.js';
import { MessageErrorHandler } from './message-error-handler.js';
import { LLMApiOrchestrator } from './llm-api-orchestrator.js';
import { StreamProcessor } from './stream-processor.js';
import { ErrorBoundary } from './error-boundary.js';

// ==========================================
// Event Schemas (decentralized registration)
// ==========================================

/**
 * Chat event schemas
 * Registered with EventBus during initialization for decentralized schema management
 */
const CHAT_EVENT_SCHEMAS = {
    'chat:message_sent': {
        description: 'User message sent',
        payload: { messageId: 'string?', content: 'string' }
    },
    'chat:response_received': {
        description: 'Assistant response received',
        payload: { messageId: 'string?', content: 'string' }
    },
    'chat:error': {
        description: 'Chat error occurred',
        payload: { error: 'string', recoverable: 'boolean' }
    }
};

// Dependencies (injected via init)
let _SessionManager = null;
let _ConversationOrchestrator = null;
let _ToolCallHandlingService = null;
let _FallbackResponseService = null;
let _CircuitBreaker = null;
let _ModuleRegistry = null;
let _Settings = null;
let _Config = null;
let _Functions = null;
let _MessageOperations = null;
let _WaveTelemetry = null;

// Initialization state flag
let _isInitialized = false;

// Initialization error tracking
let _initializationErrors = [];

// Helper function to get message hash for regeneration
function getMessageHash(message) {
    return MessageValidator.hashMessageContent(message);
}

/**
 * Check if service is initialized
 * @returns {boolean} True if initialized
 */
function isInitialized() {
    return _isInitialized;
}

/**
 * Get initialization errors if any
 * @returns {Array<string>} Array of initialization error messages
 */
function getInitializationErrors() {
    return [..._initializationErrors];
}

/**
 * Require initialization or throw error
 * @throws {Error} If service not initialized
 */
function requireInitialized() {
    if (!_isInitialized) {
        const errorMsg = _initializationErrors.length > 0
            ? `[MessageLifecycleCoordinator] Service not properly initialized. Errors: ${_initializationErrors.join(', ')}`
            : '[MessageLifecycleCoordinator] Service not initialized. Call init() first.';
        throw new Error(errorMsg);
    }
}

/**
 * Initialize MessageLifecycleCoordinator
 * Initializes coordinator and all delegated services with error handling
 */
function init(dependencies) {
    // Reset initialization state to allow re-initialization
    _isInitialized = false;
    _initializationErrors = [];
    let initializationSuccess = true;

    try {
        // Register chat event schemas with EventBus (decentralized schema management)
        try {
            EventBus.registerSchemas(CHAT_EVENT_SCHEMAS);
        } catch (error) {
            _initializationErrors.push(`EventBus registration failed: ${error.message}`);
            console.error('[MessageLifecycleCoordinator] EventBus registration error:', error);
            initializationSuccess = false;
        }

        // Store core dependencies
        _SessionManager = dependencies.SessionManager;
        _ConversationOrchestrator = dependencies.ConversationOrchestrator;
        _ToolCallHandlingService = dependencies.ToolCallHandlingService;
        _FallbackResponseService = dependencies.FallbackResponseService;
        _CircuitBreaker = dependencies.CircuitBreaker;
        _ModuleRegistry = dependencies.ModuleRegistry;
        _Settings = dependencies.Settings;
        _Config = dependencies.Config;
        _Functions = dependencies.Functions;
        _MessageOperations = dependencies.MessageOperations;
        _WaveTelemetry = dependencies.WaveTelemetry;

        // Validate required dependencies
        const requiredDeps = ['SessionManager', 'ConversationOrchestrator', 'ToolCallHandlingService',
                             'FallbackResponseService', 'Settings', 'Config', 'Functions'];
        for (const dep of requiredDeps) {
            if (!dependencies[dep]) {
                _initializationErrors.push(`Missing required dependency: ${dep}`);
                initializationSuccess = false;
            }
        }

        // Initialize MessageValidator (for consistency)
        try {
            MessageValidator.init();
        } catch (error) {
            _initializationErrors.push(`MessageValidator initialization failed: ${error.message}`);
            console.error('[MessageLifecycleCoordinator] MessageValidator initialization error:', error);
            initializationSuccess = false;
        }

        // Initialize LLMApiOrchestrator with error handling
        try {
            LLMApiOrchestrator.init({
                LLMProviderRoutingService: dependencies.LLMProviderRoutingService,
                TokenCountingService: dependencies.TokenCountingService,
                Config: _Config,
                Settings: _Settings,
                WaveTelemetry: dependencies.WaveTelemetry
            });
        } catch (error) {
            _initializationErrors.push(`LLMApiOrchestrator initialization failed: ${error.message}`);
            console.error('[MessageLifecycleCoordinator] LLMApiOrchestrator initialization error:', error);
            initializationSuccess = false;
        }

        // Initialize StreamProcessor with error handling
        try {
            StreamProcessor.init({
                Settings: _Settings
            });
        } catch (error) {
            _initializationErrors.push(`StreamProcessor initialization failed: ${error.message}`);
            console.error('[MessageLifecycleCoordinator] StreamProcessor initialization error:', error);
            initializationSuccess = false;
        }

        // Only mark as initialized if all services succeeded
        if (initializationSuccess && _initializationErrors.length === 0) {
            _isInitialized = true;
            console.log('[MessageLifecycleCoordinator] Successfully initialized with delegated services');
        } else {
            console.error('[MessageLifecycleCoordinator] Initialization completed with errors:',
                         _initializationErrors);
            console.warn('[MessageLifecycleCoordinator] Service may not function correctly due to initialization failures');
        }
    } catch (error) {
        _initializationErrors.push(`Critical initialization error: ${error.message}`);
        console.error('[MessageLifecycleCoordinator] Critical initialization error:', error);
        initializationSuccess = false;
    }
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
    // CRITICAL FIX: Check initialization before processing
    requireInitialized();

    const userContext = _ConversationOrchestrator?.getUserContext();
    if (!userContext) {
        throw new Error('Chat not initialized. Call initChat first.');
    }

    // Normalize optionsOrKey into options early for validation
    // This ensures flags like isRegeneration are available for duplicate check
    if (!options || Object.keys(options).length === 0) {
        options = (typeof optionsOrKey === 'string')
            ? { apiKey: optionsOrKey }
            : (optionsOrKey || {});
    } else {
        // Merge optionsOrKey into options if both are provided
        if (optionsOrKey && typeof optionsOrKey !== 'string') {
            options = { ...optionsOrKey, ...options };
        }
    }

    // ISSUE 2: Input validation at entry point
    const validation = MessageValidator.validateMessage(message, { skipDuplicateCheck: options?.isRegeneration });
    if (!validation.valid) {
        console.warn('[MessageLifecycleCoordinator] Message validation failed:', validation.error);
        // Return error response instead of throwing to maintain graceful degradation
        return MessageErrorHandler.buildErrorResponse(validation.error, new Error(validation.error));
    }

    const bypassQueue = options?.bypassQueue === true;

    // SECURITY: Validate bypassQueue usage - require explicit allowBypass flag
    // Hardened security: throw error instead of warning to prevent silent bypass
    if (bypassQueue && !options?.allowBypass) {
        throw new Error('[MessageLifecycleCoordinator] Security violation: bypassQueue requires explicit allowBypass flag. Queue bypass is restricted to authorized internal operations only.');
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
            semanticContext = await ErrorBoundary.wrap(
                async () => RAG.getSemanticContext(message, 3),
                {
                    context: 'ragSemanticSearch',
                    fallback: null,
                    rethrow: false,
                    onError: (err) => {
                        console.warn('[MessageLifecycleCoordinator] RAG semantic search failed:', err.message);
                    }
                }
            );
            if (semanticContext) {
                console.log('[MessageLifecycleCoordinator] Semantic context retrieved from RAG');
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

        const config = _Config?.openrouter || {};

        // Use LLMApiOrchestrator for provider configuration and API key management
        const providerConfig = LLMApiOrchestrator.buildProviderConfig(provider, settings, config);
        const key = LLMApiOrchestrator.getApiKey(provider, apiKey, settings, config);

        // Handle fallback when no API key is available
        if (LLMApiOrchestrator.shouldUseFallback(provider, key)) {
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

            // Show subtle fallback notification once per session
            LLMApiOrchestrator.showFallbackNotification(_Settings?.showToast);

            return {
                content: fallbackResponse,
                status: 'success',
                role: 'assistant',
                isFallback: true
            };
        }

        const tools = _Functions?.getEnabledSchemas?.() || _Functions?.schemas || [];

        const capabilityLevel = 1;

        let useTools = tools.length > 0 && _ConversationOrchestrator.getStreamsData()?.length > 0;

        // Use LLMApiOrchestrator for token counting and truncation
        const tokenInfo = LLMApiOrchestrator.calculateTokenUsage({
            systemPrompt: messages[0].content,
            messages: messages.slice(1),
            ragContext: semanticContext,
            tools: useTools ? tools : [],
            model: providerConfig.model
        });

        console.log('[MessageLifecycleCoordinator] Token count:', tokenInfo);

        if (tokenInfo.warnings.length > 0) {
            const recommended = LLMApiOrchestrator.getRecommendedTokenAction(tokenInfo);

            tokenInfo.warnings.forEach(warning => {
                console.warn(`[MessageLifecycleCoordinator] Token warning [${warning.level}]: ${warning.message}`);
            });

            if (recommended.action === 'truncate') {
                console.log('[MessageLifecycleCoordinator] Applying truncation strategy...');

                const truncatedParams = LLMApiOrchestrator.truncateToTarget({
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

                StreamProcessor.notifyProgress(onProgress, StreamProcessor.createTokenWarningEvent(
                    'Context too large - conversation truncated',
                    tokenInfo,
                    true
                ));
            } else if (recommended.action === 'warn_user') {
                StreamProcessor.notifyProgress(onProgress, StreamProcessor.createTokenWarningEvent(
                    recommended.message,
                    tokenInfo,
                    false
                ));
            }
        }

        StreamProcessor.notifyProgress(onProgress, StreamProcessor.createTokenUpdateEvent(tokenInfo));

        try {
            StreamProcessor.notifyProgress(onProgress, StreamProcessor.createThinkingEvent());

            let apiMessages = messages;
            let apiTools = useTools ? tools : undefined;

            // Wrap LLM API call with error boundary for graceful failure
            let response = await ErrorBoundary.wrap(
                async () => LLMApiOrchestrator.callLLM(
                    providerConfig,
                    key,
                    apiMessages,
                    apiTools,
                    LLMApiOrchestrator.isLocalProvider(provider) ? onProgress : null,
                    turnBudget.signal
                ),
                {
                    context: 'llmApiCall',
                    telemetry: _WaveTelemetry,
                    onError: (error) => {
                        // Log detailed error for debugging
                        console.error('[MessageLifecycleCoordinator] LLM API call failed:', {
                            provider: providerConfig.provider,
                            model: providerConfig.model,
                            error: error.message,
                            timestamp: new Date().toISOString()
                        });
                        // Emit event for UI notification
                        EventBus.emit('chat:error', {
                            error: error.message,
                            recoverable: true,
                            context: 'llm_api_call'
                        });
                    }
                }
            );

            // Use MessageErrorHandler for response validation
            const providerName = providerConfig.provider || 'LLM';
            const validation = MessageErrorHandler.validateLLMResponse(response, providerName);
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

            // DIAGNOSTIC: Log tool handling result
            console.log('[MessageLifecycleCoordinator] Tool handling result:', {
                hasResponseMessage: !!toolHandlingResult?.responseMessage,
                hasEarlyReturn: !!toolHandlingResult?.earlyReturn,
                earlyReturnStatus: toolHandlingResult?.earlyReturn?.status,
                hadFunctionErrors: toolHandlingResult?.hadFunctionErrors
            });

            if (toolHandlingResult?.earlyReturn) {
                const earlyReturnContent = MessageErrorHandler.getEarlyReturnAssistantMessage(toolHandlingResult.earlyReturn);
                const messagesToAdd = [{ role: 'user', content: message }];

                if (earlyReturnContent) {
                    messagesToAdd.push({ role: 'assistant', content: earlyReturnContent });
                }

                if (!userMessageCommitted) {
                    // FIX Issue 3: Wrap addMessagesToHistory in try/catch
                    // If commit fails, handle gracefully and don't proceed to saveConversation
                    try {
                        if (messagesToAdd.length > 1) {
                            await _SessionManager.addMessagesToHistory(messagesToAdd);
                            MessageValidator.trackProcessedMessage(message);
                        } else {
                            await _SessionManager.addMessageToHistory(messagesToAdd[0]);
                            MessageValidator.trackProcessedMessage(message);
                        }
                        userMessageCommitted = true;
                    } catch (commitError) {
                        console.error('[MessageLifecycleCoordinator] Failed to commit messages to history:', commitError);
                        // Return early return without saving - messages weren't committed
                        return {
                            ...toolHandlingResult.earlyReturn,
                            error: 'Failed to save message to history',
                            status: 'error'
                        };
                    }
                }

                _SessionManager.saveConversation();

                return toolHandlingResult.earlyReturn;
            }

            // DIAGNOSTIC: Check if responseMessage is null after tool handling
            if (!toolHandlingResult?.responseMessage) {
                console.error('[MessageLifecycleCoordinator] Tool handling returned null responseMessage!', {
                    originalResponseMessage: responseMessage,
                    toolHandlingResult
                });
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
                MessageValidator.trackProcessedMessage(message);
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

            // Use MessageErrorHandler for error formatting
            const currentProvider = settings?.llm?.provider || 'unknown';
            const errorMessage = MessageErrorHandler.buildUserErrorMessage(error, currentProvider);

            // ISSUE 6: Mark error messages to exclude from LLM context
            // The 'error' flag allows filtering when building context for future turns
            if (!userMessageCommitted) {
                const errorMessagesToAdd = MessageErrorHandler.buildErrorMessagesArray(message, errorMessage);
                await _SessionManager.addMessagesToHistory(errorMessagesToAdd);
                userMessageCommitted = true;
            } else {
                await _SessionManager.addMessageToHistory({
                    role: 'assistant',
                    content: errorMessage,
                    error: true,
                    excludeFromContext: true
                });
            }
            _SessionManager.saveConversation();

            // Always show error toast with actionable information
            StreamProcessor.showErrorToast(`Error: ${error.message}`, 5000);

            return MessageErrorHandler.buildErrorResponse(errorMessage, error);
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

    // FIX Issue 2: Clear the hash of the message we're about to regenerate
    // When history is truncated, the old message's hash is still in processed hashes.
    // This would cause sendMessage to fail with "duplicate message detected" error.
    MessageValidator.removeProcessedHash(message);

    // HIGH PRIORITY FIX: Await truncateHistory since it's now async with mutex protection
    // This prevents race condition where sendMessage starts before truncation completes
    await _SessionManager.truncateHistory(lastMsgIndex);

    return sendMessage(message, { ...(options || {}), isRegeneration: true });
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

    return sendMessage(newText, { ...(options || {}), isRegeneration: true });
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
    isInitialized,
    getInitializationErrors,
    sendMessage,
    regenerateLastResponse,
    deleteMessage,
    editMessage,
    clearHistory,
    getHistory,
    clearDuplicateCache: MessageValidator.clearDuplicateCache  // Expose for testing/intentional re-submission scenarios
};
