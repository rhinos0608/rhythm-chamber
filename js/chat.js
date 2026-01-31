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

import { createLogger } from './utils/logger.js';

const logger = createLogger('Chat');

// Tool Strategy imports (ToolStrategy pattern for function calling)
import { NativeToolStrategy } from './services/tool-strategies/native-strategy.js';
import { PromptInjectionStrategy } from './services/tool-strategies/prompt-injection-strategy.js';
import { IntentExtractionStrategy } from './services/tool-strategies/intent-extraction-strategy.js';
import { ModuleRegistry } from './module-registry.js';
import { ConfigLoader } from './services/config-loader.js';

// Turn serialization import
import { TurnQueue } from './services/turn-queue.js';

// Timeout budget import
import { TimeoutBudget } from './services/timeout-budget-manager.js';

// Wave telemetry import for LLM call timing
import { WaveTelemetry } from './services/wave-telemetry.js';

// Services that were previously accessed via window - now imported directly
import { LLMProviderRoutingService } from './services/llm-provider-routing-service.js';
import { TokenCountingService } from './services/token-counting-service.js';
import { ToolCallHandlingService } from './services/tool-call-handling-service.js';
import { FallbackResponseService } from './services/fallback-response-service.js';
import { CircuitBreaker } from './services/circuit-breaker.js';
import { FunctionCallingFallback } from './services/function-calling-fallback.js';

// Functions module
import { Functions } from './functions/index.js';

// Message operations for backward compatibility
import { MessageOperations } from './services/message-operations.js';

// Session Manager import
import { SessionManager } from './services/session-manager.js';

// Token Counter import
import { TokenCounter } from './token-counter.js';

// Prompts import
import { Prompts } from './prompts.js';

// Storage import
import { Storage } from './storage.js';

// Phase 4 modules: Analysis & Processing
import { Patterns } from './patterns.js';
import { Personality } from './personality.js';
import { Parser } from './parser.js';
import { DataQuery } from './data-query.js';

// Provider imports
import { ProviderInterface } from './providers/provider-interface.js';
import { Settings } from './settings.js';

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
    if (Storage.onUpdate) {
        Storage.onUpdate(handleStorageUpdate);
    }

    // Initialize ConversationOrchestrator
    if (ConversationOrchestrator?.init) {
        // RAG is optional - loads on-demand if not available (graceful degradation for semantic search)
        const RAG = ModuleRegistry.getModuleSync('RAG') || null;
        ConversationOrchestrator.init({
            TokenCounter: TokenCounter,
            DataQuery: DataQuery,
            RAG: RAG,
            Prompts: Prompts
        });
        ConversationOrchestrator.setUserContext(userContext);
        ConversationOrchestrator.setStreamsData(streams);
    }

    // Initialize MessageOperations with dependencies (for backward compatibility)
    // Note: MessageOperations now delegates to ConversationOrchestrator for state access
    if (MessageOperations?.init) {
        // RAG is optional - loads on-demand if not available (graceful degradation for semantic search)
        const RAG = ModuleRegistry.getModuleSync('RAG') || null;
        MessageOperations.init({
            DataQuery: DataQuery,
            RAG: RAG,
            TokenCounter: TokenCounter,
            ConversationOrchestrator: ConversationOrchestrator
        });
        // MessageOperations now gets state from ConversationOrchestrator
        // No need to duplicate state here
    }

    // Initialize TokenCountingService with dependencies
    if (TokenCountingService?.init) {
        TokenCountingService.init({
            TokenCounter: TokenCounter
        });
    }

    // Initialize ToolCallHandlingService with dependencies
    if (ToolCallHandlingService?.init) {
        const callLLMWrapper = (...args) => {
            if (LLMProviderRoutingService?.callLLM) {
                return LLMProviderRoutingService.callLLM(...args);
            }
            throw new Error('LLMProviderRoutingService not available');
        };

        ToolCallHandlingService.init({
            CircuitBreaker: CircuitBreaker,
            Functions: Functions,
            SessionManager: SessionManager,
            FunctionCallingFallback: FunctionCallingFallback,
            buildSystemPrompt: (...args) => ConversationOrchestrator?.buildSystemPrompt(...args),
            callLLM: callLLMWrapper,
            ConversationOrchestrator: ConversationOrchestrator,
            timeoutMs: CHAT_FUNCTION_TIMEOUT_MS
        });
    }

    // Initialize LLMProviderRoutingService with dependencies
    if (LLMProviderRoutingService?.init) {
        LLMProviderRoutingService.init({
            ProviderInterface: ProviderInterface,
            Settings: Settings,
            Config: ConfigLoader.getAll()
        });
    }

    // Initialize FallbackResponseService with dependencies
    if (FallbackResponseService?.init) {
        FallbackResponseService.init({
            MessageOperations: MessageOperations,
            userContext: userContext
        });
    }

    // Initialize MessageLifecycleCoordinator
    if (MessageLifecycleCoordinator?.init) {
        MessageLifecycleCoordinator.init({
            SessionManager: SessionManager,
            ConversationOrchestrator: ConversationOrchestrator,
            LLMProviderRoutingService: LLMProviderRoutingService,
            ToolCallHandlingService: ToolCallHandlingService,
            TokenCountingService: TokenCountingService,
            FallbackResponseService: FallbackResponseService,
            CircuitBreaker: CircuitBreaker,
            ModuleRegistry: ModuleRegistry,
            Settings: Settings,
            Config: ConfigLoader.getAll(),
            Functions: Functions,
            WaveTelemetry: WaveTelemetry,
            MessageOperations: MessageOperations
        });
    }

    return ConversationOrchestrator?.buildSystemPrompt() || '';
}

/**
 * Handle storage updates (new data uploaded)
 * Uses ConversationOrchestrator as single source of truth to prevent race conditions
 */
async function handleStorageUpdate(event) {
    if (event.type === 'streams' && event.count > 0) {
        logger.debug('Data updated, refreshing streams...');
        const streamsData = await Storage.getStreams();

        // Update ConversationOrchestrator as single source of truth
        // ToolCallHandlingService now retrieves streams data from ConversationOrchestrator
        if (ConversationOrchestrator?.setStreamsData) {
            ConversationOrchestrator.setStreamsData(streamsData);
        }

        logger.debug('Storage update completed - ConversationOrchestrator is source of truth');
    }
}

/**
 * Save conversation to IndexedDB (debounced)
 * Delegates to SessionManager
 * @returns {Promise<void>}
 */
async function saveConversation() {
    await SessionManager.saveConversation();
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
 * @returns {void}
 */
function emergencyBackupSync() {
    return SessionManager.emergencyBackupSync();
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
 * FIX: Now properly subscribes to all session events via EventBus
 * @param {Function} callback - Function to call on session updates
 * @returns {Function} Unsubscribe function
 */
function onSessionUpdate(callback) {
    // Subscribe to all session-related events
    const sessionEvents = ['session:created', 'session:loaded', 'session:switched', 'session:deleted', 'session:updated'];
    const unsubscribers = sessionEvents.map(eventType => EventBus.on(eventType, callback));

    // Return combined unsubscribe function
    return () => {
        unsubscribers.forEach(unsub => {
            try {
                unsub();
            } catch (e) {
                logger.warn('[Chat] Error unsubscribing from session event:', e);
            }
        });
    };
}

/**
 * Clear conversation history and create new session
 * Delegates to SessionManager
 * @returns {Promise<void>}
 */
async function clearConversation() {
    await SessionManager.clearConversation();
}


// ==========================================
// Session Persistence Event Handlers
// HNW Fix: Correct sync/async strategy for tab close
// NOTE: Event listeners are registered in session-manager.js to prevent duplicates
// The functions below delegate to SessionManager implementations
// ==========================================

// Only register event listeners if SessionManager hasn't already done so
// This prevents duplicate registration since SessionManager is imported before this code runs
if (typeof window !== 'undefined' && typeof document !== 'undefined' && !SessionManager.eventListenersRegistered) {
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
    if (typeof coordinator.isInitialized === 'function' && !coordinator.isInitialized()) {
        throw new Error('Chat not initialized. Call initChat first.');
    }
    return coordinator;
}

// ES Module export
export const Chat = {
    initChat,
    sendMessage: async (...args) => {
        const coordinator = requireCoordinator('MessageLifecycleCoordinator', MessageLifecycleCoordinator);
        return coordinator.sendMessage(...args);
    },
    regenerateLastResponse: async (...args) => {
        const coordinator = requireCoordinator('MessageLifecycleCoordinator', MessageLifecycleCoordinator);
        return coordinator.regenerateLastResponse(...args);
    },
    deleteMessage: async (...args) => {
        const coordinator = requireCoordinator('MessageLifecycleCoordinator', MessageLifecycleCoordinator);
        return coordinator.deleteMessage(...args);
    },
    editMessage: async (...args) => {
        const coordinator = requireCoordinator('MessageLifecycleCoordinator', MessageLifecycleCoordinator);
        return coordinator.editMessage(...args);
    },
    clearHistory: async (...args) => {
        const coordinator = requireCoordinator('MessageLifecycleCoordinator', MessageLifecycleCoordinator);
        return coordinator.clearHistory(...args);
    },
    clearConversation,
    getHistory: async (...args) => {
        const coordinator = requireCoordinator('MessageLifecycleCoordinator', MessageLifecycleCoordinator);
        return coordinator.getHistory(...args);
    },
    setStreamsData: (...args) => {
        const coordinator = requireCoordinator('ConversationOrchestrator', ConversationOrchestrator);
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

logger.info('Module loaded');
