/**
 * Main Application Entry Point
 * 
 * This is the single ES Module entry point for the application.
 * It handles:
 * 1. Security initialization (fail-fast if not secure)
 * 2. Import ALL modules in dependency order
 * 3. Application startup
 * 
 * @module main
 */

// ==========================================
// Security Check (MUST run first, synchronously)
// ==========================================

import { Security } from './security/index.js';
import { DEPRECATED_WINDOW_GLOBALS, setupDeprecatedWindowGlobals } from './window-globals-debug.js';

// Validate secure context immediately before ANY other imports
const securityCheck = Security.checkSecureContext();
let safeModeReason = null;

if (!securityCheck.secure) {
    // Don't throw - instead flag for Safe Mode and continue
    // This allows the "Safe Mode" UI in app.js to render
    console.warn('[Main] Security check failed, entering Safe Mode:', securityCheck.reason);
    safeModeReason = securityCheck.reason;
}

if (safeModeReason === null) {
    console.log('[Main] Security context validated');
}

// ==========================================
// Import ALL Modules (Dependency Order)
// ==========================================

// Core utilities (no dependencies)
import { Utils } from './utils.js';
import { ModuleRegistry } from './module-registry.js';

// Storage layer (foundation for everything)
import { STORAGE_KEYS } from './storage/keys.js';
import { IndexedDBCore, STORES } from './storage/indexeddb.js';
import { ConfigAPI } from './storage/config-api.js';
import { StorageMigration } from './storage/migration.js';
import { SyncStrategy } from './storage/sync-strategy.js';
import { ProfileStorage } from './storage/profiles.js';
import { Storage } from './storage.js';

// State management
import { AppState } from './state/app-state.js';

// Core analysis modules
import { Patterns } from './patterns.js';
import { Personality } from './personality.js';
import { DataQuery } from './data-query.js';
import { Prompts } from './prompts.js';
import { Parser } from './parser.js';
import { GenreEnrichment } from './genre-enrichment.js';

// Token counter
import { TokenCounter } from './token-counter.js';

// LLM Providers (lightweight)
import { ProviderInterface } from './providers/provider-interface.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import { LMStudioProvider } from './providers/lmstudio.js';

// Heavy modules are registered with ModuleRegistry for lazy loading:
// - Ollama (./ollama.js, ./providers/ollama-adapter.js)
// - RAG (./rag.js)
// - LocalVectorStore (./local-vector-store.js)
// - LocalEmbeddings (./local-embeddings.js)
// These are loaded in bootstrap() only if not in safe mode.

// Spotify
import { Spotify } from './spotify.js';
import { Settings } from './settings.js';

// Chat
import { Chat } from './chat.js';

// Cards
import { Cards } from './cards.js';

// Function calling system
import { FunctionRetry } from './functions/utils/retry.js';
import { FunctionValidation } from './functions/utils/validation.js';
import { DataQuerySchemas } from './functions/schemas/data-queries.js';
import { TemplateQuerySchemas } from './functions/schemas/template-queries.js';
import { AnalyticsQuerySchemas } from './functions/schemas/analytics-queries.js';
import { DataExecutors } from './functions/executors/data-executors.js';
import { TemplateExecutors } from './functions/executors/template-executors.js';
import { AnalyticsExecutors } from './functions/executors/analytics-executors.js';
import { Functions } from './functions/index.js';

// Services
import { TabCoordinator } from './services/tab-coordination.js';
import { SessionManager } from './services/session-manager.js';
import { MessageOperations } from './services/message-operations.js';

// Controllers
import { ChatUIController } from './controllers/chat-ui-controller.js';
import { SidebarController } from './controllers/sidebar-controller.js';
import { ViewController } from './controllers/view-controller.js';
import { FileUploadController } from './controllers/file-upload-controller.js';
import { SpotifyController } from './controllers/spotify-controller.js';
import { DemoController } from './controllers/demo-controller.js';
import { ResetController } from './controllers/reset-controller.js';

// Demo and template profiles
import { DemoData } from './demo-data.js';
import { TemplateProfileStore, TemplateProfileStoreClass } from './template-profiles.js';
import { ProfileSynthesizer, ProfileSynthesizerClass } from './profile-synthesizer.js';

// Utility modules
import { OperationLock } from './operation-lock.js';
import { Payments } from './payments.js';

// New feature modules (robustness and security enhancements)
import { QuotaMonitor } from './storage/quota-monitor.js';
import { CircuitBreaker } from './services/circuit-breaker.js';
import { SecureTokenStore } from './security/secure-token-store.js';
import { DataVersion } from './services/data-version.js';
import { FunctionCallingFallback } from './services/function-calling-fallback.js';
import { ProfileDescriptionGenerator } from './services/profile-description-generator.js';
import { LLMProviderRoutingService } from './services/llm-provider-routing-service.js';
import { TokenCountingService } from './services/token-counting-service.js';
import { ToolCallHandlingService } from './services/tool-call-handling-service.js';
import { FallbackResponseService } from './services/fallback-response-service.js';

// ==========================================
// Register ES Modules on Window (Backward Compatibility)
// app.js checks for these on window.X for dependency validation
// ==========================================

if (typeof window !== 'undefined') {
    // Core modules (required by app.js dependency checker)
    window.AppState = AppState;
    window.Storage = Storage;
    window.Chat = Chat;
    window.Spotify = Spotify;
    window.Patterns = Patterns;
    window.Personality = Personality;
    window.Security = Security;

    // Additional core modules used by app.js
    window.DataQuery = DataQuery;
    window.TokenCounter = TokenCounter;
    window.Functions = Functions;
    window.Cards = Cards;

    // Controllers
    window.ViewController = ViewController;
    window.FileUploadController = FileUploadController;
    window.SpotifyController = SpotifyController;
    window.DemoController = DemoController;
    window.ResetController = ResetController;
    window.SidebarController = SidebarController;
    window.ChatUIController = ChatUIController;

    // Services
    window.TabCoordinator = TabCoordinator;
    window.SessionManager = SessionManager;
    window.MessageOperations = MessageOperations;

    // Utility modules that need window access
    window.OperationLock = OperationLock;
    window.CircuitBreaker = CircuitBreaker;
    window.FunctionCallingFallback = FunctionCallingFallback;
    window.ProfileDescriptionGenerator = ProfileDescriptionGenerator;
    window.DataVersion = DataVersion;

    // LLM and Chat Services (required by chat.js)
    window.LLMProviderRoutingService = LLMProviderRoutingService;
    window.TokenCountingService = TokenCountingService;
    window.ToolCallHandlingService = ToolCallHandlingService;
    window.FallbackResponseService = FallbackResponseService;

    // Template/Profile modules
    window.DemoData = DemoData;
    window.TemplateProfileStore = TemplateProfileStore;
    window.ProfileSynthesizer = ProfileSynthesizer;

    setupDeprecatedWindowGlobals(window, DEPRECATED_WINDOW_GLOBALS);
}

console.log('[Main] All modules imported and registered on window');

// ==========================================
// Error UI for Security Failures
// ==========================================

/**
 * Show security error UI and block app loading
 * @param {string} reason - Why security check failed
 */
function showSecurityError(reason) {
    // Wait for DOM to be ready
    const showError = () => {
        const container = document.querySelector('.app-main') || document.body;
        container.innerHTML = `
            <div class="security-error" style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 60vh;
                text-align: center;
                padding: 2rem;
            ">
                <div style="font-size: 4rem; margin-bottom: 1rem;">🔒</div>
                <h2 style="color: var(--danger, #dc3545); margin-bottom: 1rem;">Security Check Failed</h2>
                <p style="max-width: 500px; margin-bottom: 1.5rem; color: var(--text-muted, #6c757d);">
                    ${escapeHtml(reason)}
                </p>
                <div style="
                    background: var(--bg-tertiary, #f8f9fa);
                    padding: 1rem;
                    border-radius: 8px;
                    max-width: 500px;
                    text-align: left;
                ">
                    <p style="margin-bottom: 0.5rem;"><strong>Common causes:</strong></p>
                    <ul style="margin: 0; padding-left: 1.5rem;">
                        <li>Page loaded in an iframe</li>
                        <li>Non-secure protocol (must use HTTPS, localhost, or file://)</li>
                        <li>Browser security features disabled</li>
                    </ul>
                </div>
                <button onclick="location.reload()" style="
                    margin-top: 1.5rem;
                    padding: 0.75rem 1.5rem;
                    background: var(--accent, #6f42c1);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 1rem;
                ">
                    Retry
                </button>
            </div>
        `;
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showError);
    } else {
        showError();
    }
}

/**
 * Escape HTML for safe display
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show generic loading error
 */
function showLoadingError(error) {
    const container = document.querySelector('.app-main') || document.body;
    container.innerHTML = `
        <div class="loading-error" style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            text-align: center;
            padding: 2rem;
        ">
            <div style="font-size: 4rem; margin-bottom: 1rem;">⚠️</div>
            <h2 style="margin-bottom: 1rem;">Application Loading Error</h2>
            <p style="max-width: 500px; margin-bottom: 1.5rem; color: var(--text-muted, #6c757d);">
                An error occurred while loading the application. 
                This may be due to a network issue or browser compatibility.
            </p>
            <details style="
                background: var(--bg-tertiary, #f8f9fa);
                padding: 1rem;
                border-radius: 8px;
                max-width: 500px;
                text-align: left;
                margin-bottom: 1rem;
            ">
                <summary style="cursor: pointer;">Technical Details</summary>
                <pre style="
                    margin-top: 0.5rem;
                    font-size: 0.85rem;
                    overflow-x: auto;
                    white-space: pre-wrap;
                ">${escapeHtml(error.message)}\n\n${escapeHtml(error.stack || '')}</pre>
            </details>
            <button onclick="location.reload()" style="
                padding: 0.75rem 1.5rem;
                background: var(--accent, #6f42c1);
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 1rem;
            ">
                Refresh Page
            </button>
        </div>
    `;
}

// ==========================================
// Application Bootstrap
// ==========================================

/**
 * Initialize the application after security passes
 */
async function bootstrap() {
    console.log('[Main] Bootstrapping application...');

    try {
        // Register heavy modules with ModuleRegistry for lazy loading
        // These are only loaded if not in safe mode (Full Analysis path)
        ModuleRegistry.register('Ollama', () => import('./ollama.js'), 'Ollama');
        ModuleRegistry.register('OllamaProvider', () => import('./providers/ollama-adapter.js'), 'OllamaProvider');
        ModuleRegistry.register('RAG', () => import('./rag.js'), 'RAG');
        ModuleRegistry.register('LocalVectorStore', () => import('./local-vector-store.js'), 'LocalVectorStore');
        ModuleRegistry.register('LocalEmbeddings', () => import('./local-embeddings.js'), 'LocalEmbeddings');

        if (!safeModeReason) {
            console.log('[Main] Pre-loading heavy modules...');

            // Pre-load all heavy modules via ModuleRegistry
            await ModuleRegistry.preloadModules([
                'Ollama',
                'OllamaProvider',
                'RAG',
                'LocalVectorStore',
                'LocalEmbeddings'
            ]);

            console.log('[Main] Heavy modules loaded via ModuleRegistry');

            // Pre-initialize LocalVectorStore to eagerly create worker
            // This prevents race condition and user-facing delays on first search
            const lvsModule = ModuleRegistry.getModuleSync('LocalVectorStore');
            if (lvsModule?.LocalVectorStore) {
                await lvsModule.LocalVectorStore.init();
                console.log('[Main] LocalVectorStore worker pre-initialized');
            }
        }

        // Import and initialize the application
        const { init } = await import('./app.js');
        await init({ safeModeReason });

        console.log('[Main] Application initialized successfully');
    } catch (error) {
        console.error('[Main] Failed to initialize application:', error);
        showLoadingError(error);
    }
}

// ==========================================
// Start Application
// ==========================================

// Wait for DOM then bootstrap
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}
