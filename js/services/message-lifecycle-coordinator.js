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

// Timeout constants
const CHAT_API_TIMEOUT_MS = 60000;
const LOCAL_LLM_TIMEOUT_MS = 90000;
const CHAT_FUNCTION_TIMEOUT_MS = 30000;

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
 * @param {boolean} [options.bypassQueue] - Bypass turn queue for internal operations
 */
async function sendMessage(message, optionsOrKey = null, options = {}) {
    const userContext = _ConversationOrchestrator?.getUserContext();
    if (!userContext) {
        throw new Error('Chat not initialized. Call initChat first.');
    }

    const bypassQueue = options?.bypassQueue === true;

    if (bypassQueue) {
        console.log('[MessageLifecycleCoordinator] Bypassing turn queue for internal operation');
        return processMessage(message, optionsOrKey);
    } else {
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
    const turnBudget = TimeoutBudget.allocate('chat_turn', 60000);

    try {
        if (_CircuitBreaker?.resetTurn) {
            _CircuitBreaker.resetTurn();
        }

        _SessionManager.addMessageToHistory({
            role: 'user',
            content: message
        });

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

        const messages = [
            { role: 'system', content: _ConversationOrchestrator.buildSystemPrompt(null, semanticContext) },
            ...conversationHistory
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
            _SessionManager.addMessageToHistory({
                role: 'assistant',
                content: fallbackResponse
            });
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
            let response = await _LLMProviderRoutingService.callLLM(providerConfig, key, apiMessages, apiTools, isLocalProvider ? onProgress : null);
            const llmCallDuration = Date.now() - llmCallStart;

            const telemetryMetric = isLocalProvider ? 'local_llm_call' : 'cloud_llm_call';
            _WaveTelemetry?.record(telemetryMetric, llmCallDuration);
            console.log(`[MessageLifecycleCoordinator] LLM call completed in ${llmCallDuration}ms`);

            if (!response || !response.choices || response.choices.length === 0) {
                const providerName = providerConfig.provider || 'LLM';
                console.error('[MessageLifecycleCoordinator] Invalid response from provider:', providerName, response);
                throw new Error(`${providerName} returned an invalid response. Check if the server is running and the model is loaded.`);
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
                return toolHandlingResult.earlyReturn;
            }
            responseMessage = toolHandlingResult.responseMessage || responseMessage;

            const assistantContent = responseMessage?.content || 'I couldn\'t generate a response.';

            _SessionManager.addMessageToHistory({
                role: 'assistant',
                content: assistantContent
            });

            _SessionManager.saveConversation();

            return {
                content: assistantContent,
                status: 'success',
                role: 'assistant'
            };

        } catch (error) {
            console.error('[MessageLifecycleCoordinator] Chat error:', error);

            const queryContext = _ConversationOrchestrator.generateQueryContext(message);
            const fallbackResponse = _FallbackResponseService.generateFallbackResponse(message, queryContext);

            _SessionManager.addMessageToHistory({
                role: 'assistant',
                content: fallbackResponse,
                error: true
            });
            _SessionManager.saveConversation();

            return {
                content: fallbackResponse,
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

    if (typeof window.MessageOperations !== 'undefined') {
        return window.MessageOperations.regenerateLastResponse(
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

    _SessionManager.truncateHistory(lastMsgIndex);

    return sendMessage(message, options);
}

/**
 * Delete a specific message from history
 */
function deleteMessage(index) {
    const conversationHistory = _SessionManager.getHistory();

    if (typeof window.MessageOperations !== 'undefined') {
        const result = window.MessageOperations.deleteMessage(index, conversationHistory);
        _SessionManager.saveConversation();
        return result;
    }

    if (index < 0 || index >= conversationHistory.length) return false;

    _SessionManager.removeMessageFromHistory(index);
    _SessionManager.saveConversation();
    return true;
}

/**
 * Edit a user message
 */
async function editMessage(index, newText, options = null) {
    const conversationHistory = _SessionManager.getHistory();

    if (typeof window.MessageOperations !== 'undefined') {
        return window.MessageOperations.editMessage(
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

    _SessionManager.truncateHistory(index);

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
    getHistory
};
