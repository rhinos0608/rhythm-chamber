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

// New coordinator imports
import { ConversationOrchestrator } from './services/conversation-orchestrator.js';
import { MessageLifecycleCoordinator } from './services/message-lifecycle-coordinator.js';

// HNW Fix: Timeout constants to prevent cascade failures
const CHAT_API_TIMEOUT_MS = 60000;           // 60 second timeout for cloud API calls
const LOCAL_LLM_TIMEOUT_MS = 90000;          // 90 second timeout for local LLM providers
const CHAT_FUNCTION_TIMEOUT_MS = 30000;      // 30 second timeout for function execution

// Chat-specific state is now managed by ConversationOrchestrator
// userContext and streamsData are owned by ConversationOrchestrator

// ==========================================
// DELEGATING TO SessionManager:
// All session operations (create, load, save, switch, delete)
// are handled by SessionManager.
//
// DELEGATING TO ConversationOrchestrator:
// Context generation (system prompts, query context) is handled
// by ConversationOrchestrator.
//
// DELEGATING TO MessageLifecycleCoordinator:
// Message lifecycle operations (send, edit, delete, regenerate)
// are handled by MessageLifecycleCoordinator.
//
// Chat.js only provides the public API facade and orchestrates
// initialization and service wiring.
// ==========================================

/**
 * Initialize chat with user context and streams data
 * Delegates session management to SessionManager
 * Initializes new coordinator services
 */
async function initChat(personality, patterns, summary, streams = null) {
    const userContext = {
        personality,
        patterns,
        summary
    };

    // Initialize SessionManager (handles emergency backup recovery)
    SessionManager.setUserContext(personality);
    await SessionManager.init();

    // Register for storage updates to refresh data
    if (window.Storage?.onUpdate) {
        window.Storage.onUpdate(handleStorageUpdate);
    }

    // Initialize ConversationOrchestrator
    if (window.ConversationOrchestrator?.init) {
        window.ConversationOrchestrator.init({
            TokenCounter: window.TokenCounter,
            DataQuery: window.DataQuery,
            RAG: ModuleRegistry.getModuleSync('RAG'),
            Prompts: window.Prompts
        });
        window.ConversationOrchestrator.setUserContext(userContext);
        window.ConversationOrchestrator.setStreamsData(streams);
    }

    // Initialize MessageOperations with dependencies (for backward compatibility)
    // Note: MessageOperations now delegates to ConversationOrchestrator for state access
    if (window.MessageOperations?.init) {
        window.MessageOperations.init({
            DataQuery: window.DataQuery,
            RAG: ModuleRegistry.getModuleSync('RAG'),
            TokenCounter: window.TokenCounter,
            ConversationOrchestrator: window.ConversationOrchestrator
        });
        // MessageOperations now gets state from ConversationOrchestrator
        // No need to duplicate state here
    }

    // Initialize TokenCountingService with dependencies
    if (window.TokenCountingService?.init) {
        window.TokenCountingService.init({
            TokenCounter: window.TokenCounter
        });
    }

    // Initialize ToolCallHandlingService with dependencies
    if (window.ToolCallHandlingService?.init) {
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
            buildSystemPrompt: (...args) => window.ConversationOrchestrator?.buildSystemPrompt(...args),
            callLLM: callLLMWrapper,
            streamsData: streams,
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

    // Initialize MessageLifecycleCoordinator
    if (window.MessageLifecycleCoordinator?.init) {
        window.MessageLifecycleCoordinator.init({
            SessionManager: SessionManager,
            ConversationOrchestrator: window.ConversationOrchestrator,
            LLMProviderRoutingService: window.LLMProviderRoutingService,
            ToolCallHandlingService: window.ToolCallHandlingService,
            TokenCountingService: window.TokenCountingService,
            FallbackResponseService: window.FallbackResponseService,
            CircuitBreaker: window.CircuitBreaker,
            ModuleRegistry: ModuleRegistry,
            Settings: window.Settings,
            Config: window.Config,
            Functions: window.Functions,
            WaveTelemetry: window.WaveTelemetry
        });
    }

    return window.ConversationOrchestrator?.buildSystemPrompt() || '';
}

/**
 * Handle storage updates (new data uploaded)
 * Uses ConversationOrchestrator as single source of truth to prevent race conditions
 */
async function handleStorageUpdate(event) {
    if (event.type === 'streams' && event.count > 0) {
        console.log('[Chat] Data updated, refreshing streams...');
        const streamsData = await window.Storage.getStreams();

        // Update ConversationOrchestrator as single source of truth
        if (window.ConversationOrchestrator?.setStreamsData) {
            window.ConversationOrchestrator.setStreamsData(streamsData);
        }

        // ToolCallHandlingService still needs direct update for backward compatibility
        // TODO: Refactor ToolCallHandlingService to use ConversationOrchestrator in future
        if (window.ToolCallHandlingService?.setStreamsData) {
            window.ToolCallHandlingService.setStreamsData(streamsData);
        }

        // MessageOperations now delegates to ConversationOrchestrator, no update needed
        console.log('[Chat] Storage update completed - ConversationOrchestrator is source of truth');
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

// Helper function to ensure coordinator availability
function requireCoordinator(coordinatorName, coordinator) {
    if (!coordinator) {
        throw new Error(`${coordinatorName} is not initialized. Ensure chat.initChat() has been called successfully.`);
    }
    return coordinator;
}

// ES Module export
export const Chat = {
    initChat,
    sendMessage: (...args) => {
        const coordinator = requireCoordinator('MessageLifecycleCoordinator', window.MessageLifecycleCoordinator);
        return coordinator.sendMessage(...args);
    },
    regenerateLastResponse: (...args) => {
        const coordinator = requireCoordinator('MessageLifecycleCoordinator', window.MessageLifecycleCoordinator);
        return coordinator.regenerateLastResponse(...args);
    },
    deleteMessage: (...args) => {
        const coordinator = requireCoordinator('MessageLifecycleCoordinator', window.MessageLifecycleCoordinator);
        return coordinator.deleteMessage(...args);
    },
    editMessage: (...args) => {
        const coordinator = requireCoordinator('MessageLifecycleCoordinator', window.MessageLifecycleCoordinator);
        return coordinator.editMessage(...args);
    },
    clearHistory: (...args) => {
        const coordinator = requireCoordinator('MessageLifecycleCoordinator', window.MessageLifecycleCoordinator);
        return coordinator.clearHistory(...args);
    },
    clearConversation,
    getHistory: (...args) => {
        const coordinator = requireCoordinator('MessageLifecycleCoordinator', window.MessageLifecycleCoordinator);
        return coordinator.getHistory(...args);
    },
    setStreamsData: (...args) => {
        const coordinator = requireCoordinator('ConversationOrchestrator', window.ConversationOrchestrator);
        return coordinator.setStreamsData(...args);
    },
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
