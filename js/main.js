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
// Logging Configuration (MUST run first)
// ==========================================
// Configure the centralized logger before any other imports to ensure
// all logging is properly filtered. This prevents sensitive data exposure
// and ensures appropriate log levels for development vs production.

import { configureLogger, LOG_LEVELS, createLogger } from './utils/logger.js';

// Detect development environment
const isDevelopment = typeof window !== 'undefined' && (
  window.location?.hostname === 'localhost' ||
  window.location?.hostname === '127.0.0.1' ||
  window.location?.protocol === 'file:'
);

// Configure logger based on environment
// - Development: DEBUG level (verbose logging for debugging)
// - Production: INFO level (only important state changes and above)
configureLogger({
  level: isDevelopment ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO,
  releaseStage: isDevelopment ? 'development' : 'production'
});

// Create module-specific logger
const logger = createLogger('Main');

// ==========================================
// Security Check (MUST run first, synchronously)
// ==========================================

import { Crypto } from './security/crypto.js';
import { ConfigLoader } from './services/config-loader.js';

// Validate secure context immediately before ANY other imports
const isSecure = Crypto.checkSecureContext();
let safeModeReason = null;

if (!isSecure) {
    // Don't throw - instead flag for Safe Mode and continue
    // This allows the "Safe Mode" UI in app.js to render
    logger.warn('Security check failed, entering Safe Mode: not running in secure context');
    safeModeReason = 'not-secure-context';
}

if (safeModeReason === null) {
    logger.debug('Security context validated');
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
import { GeminiProvider } from './providers/gemini.js';

// Heavy modules are registered with ModuleRegistry for lazy loading:
// - Ollama (./ollama.js, ./providers/ollama-adapter.js)
// - RAG (./rag.js)
// - LocalVectorStore (./local-vector-store.js)
// - LocalEmbeddings (./local-embeddings.js)
// These are loaded in bootstrap() only if not in safe mode.

// Spotify
import { Spotify } from './spotify.js';
// Settings lazy-loaded on first use (84KB savings)
// import { Settings } from './settings.js';

// Chat
import { Chat } from './chat.js';
import { ConversationOrchestrator } from './services/conversation-orchestrator.js';
import { MessageLifecycleCoordinator } from './services/message-lifecycle-coordinator.js';

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
import { WorkerCoordinator } from './services/worker-coordinator.js';
import { EventBus } from './services/event-bus.js';
import { EventLogStore } from './storage/event-log-store.js';

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
import { Pricing } from './pricing.js';

// Premium controller (lazy import - only loaded when needed for upgrade modals)

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
import { ErrorBoundary, installGlobalErrorHandler } from './services/error-boundary.js';

// ==========================================
// ES Module Architecture (Migration Complete)
// ==========================================
// All modules are accessed via ES imports. ModuleRegistry is used for
// lazy-loaded modules (Ollama, RAG, LocalVectorStore, LocalEmbeddings).
// Note: window.Config is still set by ConfigLoader for backward compatibility.
// window.SidebarController is exposed for inline onclick handlers.

logger.debug('All modules imported via ES modules');


// ==========================================
// Error UI for Security Failures
// ==========================================

/**
 * Show security error UI and block app loading
 * Uses DOM element creation instead of innerHTML for XSS safety
 * @param {string} reason - Why security check failed
 */
function showSecurityError(reason) {
    // EDGE CASE FIX: Prevent race condition with DOM ready state
    // If DOM is already loaded and content exists, we need to be more careful
    // about clearing content to avoid removing valid content in Safe Mode

    const showError = () => {
        const container = document.querySelector('.app-main') || document.body;
        const existingSecurityError = container.querySelector('.security-error');

        // Return early if security error already exists to prevent duplicates
        if (existingSecurityError) {
            return;
        }

        container.innerHTML = ''; // Clear existing content

        // Create container div
        const errorDiv = document.createElement('div');
        errorDiv.className = 'security-error';
        errorDiv.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            text-align: center;
            padding: 2rem;
        `;

        // Icon
        const icon = document.createElement('div');
        icon.style.cssText = 'font-size: 4rem; margin-bottom: 1rem;';
        icon.textContent = '🔒';
        errorDiv.appendChild(icon);

        // Title
        const title = document.createElement('h2');
        title.style.cssText = 'color: var(--danger, #dc3545); margin-bottom: 1rem;';
        title.textContent = 'Security Check Failed';
        errorDiv.appendChild(title);

        // Message
        const message = document.createElement('p');
        message.style.cssText = 'max-width: 500px; margin-bottom: 1.5rem; color: var(--text-muted, #6c757d);';
        message.textContent = reason;
        errorDiv.appendChild(message);

        // Common causes box
        const causesBox = document.createElement('div');
        causesBox.style.cssText = `
            background: var(--bg-tertiary, #f8f9fa);
            padding: 1rem;
            border-radius: 8px;
            max-width: 500px;
            text-align: left;
        `;

        const causesTitle = document.createElement('p');
        causesTitle.style.marginBottom = '0.5rem';
        // SAFE: Using textContent with styled element instead of innerHTML
        causesTitle.textContent = 'Common causes:';
        causesTitle.style.fontWeight = 'bold';
        causesBox.appendChild(causesTitle);

        const causesList = document.createElement('ul');
        causesList.style.cssText = 'margin: 0; padding-left: 1.5rem;';
        ['Page loaded in an iframe', 'Non-secure protocol (must use HTTPS, localhost, or file://)', 'Browser security features disabled'].forEach(cause => {
            const li = document.createElement('li');
            li.textContent = cause;
            causesList.appendChild(li);
        });
        causesBox.appendChild(causesList);
        errorDiv.appendChild(causesBox);

        // Retry button - using addEventListener instead of onclick
        const retryBtn = document.createElement('button');
        retryBtn.style.cssText = `
            margin-top: 1.5rem;
            padding: 0.75rem 1.5rem;
            background: var(--accent, #6f42c1);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1rem;
        `;
        retryBtn.textContent = 'Retry';
        retryBtn.addEventListener('click', () => location.reload());
        errorDiv.appendChild(retryBtn);

        container.appendChild(errorDiv);
    };

    // EDGE CASE FIX: Use requestAnimationFrame to ensure DOM is fully ready
    // This prevents a flash of incorrect content when security check fails
    // after DOM is loaded but before styles are applied
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            requestAnimationFrame(showError);
        });
    } else {
        // DOM is ready, but use requestAnimationFrame to ensure
        // we're rendering at the right time in the frame cycle
        requestAnimationFrame(showError);
    }
}

/**
 * Show generic loading error
 * Uses DOM element creation instead of innerHTML for XSS safety
 */
function showLoadingError(error) {
    const container = document.querySelector('.app-main') || document.body;
    container.innerHTML = ''; // Clear existing content

    // Create container div
    const errorDiv = document.createElement('div');
    errorDiv.className = 'loading-error';
    errorDiv.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 60vh;
        text-align: center;
        padding: 2rem;
    `;

    // Icon
    const icon = document.createElement('div');
    icon.style.cssText = 'font-size: 4rem; margin-bottom: 1rem;';
    icon.textContent = '⚠️';
    errorDiv.appendChild(icon);

    // Title
    const title = document.createElement('h2');
    title.style.marginBottom = '1rem';
    title.textContent = 'Application Loading Error';
    errorDiv.appendChild(title);

    // Message
    const message = document.createElement('p');
    message.style.cssText = 'max-width: 500px; margin-bottom: 1.5rem; color: var(--text-muted, #6c757d);';
    message.textContent = 'An error occurred while loading the application. This may be due to a network issue or browser compatibility.';
    errorDiv.appendChild(message);

    // Details panel
    const details = document.createElement('details');
    details.style.cssText = `
        background: var(--bg-tertiary, #f8f9fa);
        padding: 1rem;
        border-radius: 8px;
        max-width: 500px;
        text-align: left;
        margin-bottom: 1rem;
    `;

    const summary = document.createElement('summary');
    summary.style.cursor = 'pointer';
    summary.textContent = 'Technical Details';
    details.appendChild(summary);

    const pre = document.createElement('pre');
    pre.style.cssText = `
        margin-top: 0.5rem;
        font-size: 0.85rem;
        overflow-x: auto;
        white-space: pre-wrap;
    `;
    pre.textContent = `${error.message}\n\n${error.stack || ''}`;
    details.appendChild(pre);

    errorDiv.appendChild(details);

    // Refresh button - using addEventListener instead of onclick
    const refreshBtn = document.createElement('button');
    refreshBtn.style.cssText = `
        padding: 0.75rem 1.5rem;
        background: var(--accent, #6f42c1);
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 1rem;
    `;
    refreshBtn.textContent = 'Refresh Page';
    refreshBtn.addEventListener('click', () => location.reload());
    errorDiv.appendChild(refreshBtn);

    container.appendChild(errorDiv);
}

// ==========================================
// Application Bootstrap
// ==========================================

/**
 * Initialize the application after security passes
 */
/**
 * Flag to track if heavy modules have been loaded
 * Prevents duplicate loading attempts
 */
let heavyModulesLoaded = false;
let heavyModulesLoading = null;

/**
 * Load heavy RAG/Vector modules on user intent
 * Called when user clicks "Start Analysis" or enters Chat tab
 * This defers expensive module loading until actually needed
 *
 * @returns {Promise<boolean>} True if modules loaded successfully
 */
async function loadHeavyModulesOnIntent() {
    // Already loaded
    if (heavyModulesLoaded) {
        return true;
    }

    // Loading in progress - wait for it
    if (heavyModulesLoading) {
        return heavyModulesLoading;
    }

    // Can't load in safe mode
    if (safeModeReason) {
        logger.warn('Cannot load heavy modules in Safe Mode');
        return false;
    }

    logger.debug('Loading heavy modules on user intent...');

    // EDGE CASE FIX: Add timeout to prevent indefinite hanging
    // If module loading takes too long, we should fail gracefully
    const MODULE_LOAD_TIMEOUT = 30000; // 30 seconds

    heavyModulesLoading = (async () => {
        try {
            // Create a timeout promise for ModuleRegistry preload
            const preloadTimeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Module loading timeout')), MODULE_LOAD_TIMEOUT)
            );

            // Load all heavy modules via ModuleRegistry with timeout
            await Promise.race([
                ModuleRegistry.preloadModules([
                    'Ollama',
                    'OllamaProvider',
                    'RAG',
                    'LocalVectorStore',
                    'LocalEmbeddings'
                ]),
                preloadTimeoutPromise
            ]);

            logger.debug('Heavy modules loaded via ModuleRegistry');

            // Initialize LocalVectorStore worker with a fresh timeout promise
            const lvsModule = ModuleRegistry.getModuleSync('LocalVectorStore');
            if (lvsModule?.LocalVectorStore) {
                const initTimeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Module loading timeout')), MODULE_LOAD_TIMEOUT)
                );
                await Promise.race([
                    lvsModule.LocalVectorStore.init(),
                    initTimeoutPromise
                ]);
                logger.debug('LocalVectorStore worker initialized');
            }

            heavyModulesLoaded = true;
            return true;
        } catch (error) {
            logger.error('Failed to load heavy modules:', error);
            heavyModulesLoading = null; // Allow retry

            // Show user-friendly error message for timeout
            if (error.message === 'Module loading timeout') {
                logger.warn('[Main] Module loading timed out after 30 seconds');
                // Could show a toast here if needed
            }

            return false;
        }
    })();

    return heavyModulesLoading;
}


/**
 * Initialize the application after security passes
 */
async function bootstrap() {
    logger.info('Bootstrapping application...');

    try {
        // Load configuration with retry logic (replaces fragile <script src="config.js">)
        logger.debug('Loading configuration...');
        await ConfigLoader.load();

        // Install window.Config proxy for backward compatibility
        ConfigLoader.installWindowProxy();

        const configStatus = ConfigLoader.getLoadStatus();
        if (configStatus.failed) {
            logger.warn('Config load failed, using defaults:', configStatus.error);
        } else {
            logger.debug('Configuration loaded successfully');
        }

        // ==========================================
        // Security initialization
        // ==========================================
        // Crypto module is self-initializing - no explicit init needed.
        // Session keys are derived on-demand using Web Crypto API.

        let securityReport = null;

        if (!safeModeReason) {
            // Security is ready - Crypto module doesn't need explicit initialization
            logger.debug('Crypto module ready (self-initializing)');
            securityReport = {
                overallState: 'ready',
                warnings: []
            };
        } else {
            logger.debug('Security check bypassed due to Safe Mode:', safeModeReason);
        }

        // Install global error handlers for fallback error handling
        installGlobalErrorHandler();

        // Initialize WorkerCoordinator for centralized worker lifecycle management
        // This sets up beforeunload handlers for automatic cleanup
        WorkerCoordinator.init();
        logger.debug('WorkerCoordinator initialized');

        // Register heavy modules with ModuleRegistry for lazy loading
        // These are NOT preloaded at startup - loaded on user intent instead
        ModuleRegistry.register('Ollama', () => import('./ollama.js'), 'Ollama');
        ModuleRegistry.register('OllamaProvider', () => import('./providers/ollama-adapter.js'), 'OllamaProvider');
        ModuleRegistry.register('RAG', () => import('./rag.js'), 'RAG');
        ModuleRegistry.register('LocalVectorStore', () => import('./local-vector-store.js'), 'LocalVectorStore');
        ModuleRegistry.register('LocalEmbeddings', () => import('./local-embeddings.js'), 'LocalEmbeddings');
        ModuleRegistry.register('StorageDegradationManager', () => import('./services/storage-degradation-manager.js'), 'default');

        // Heavy modules are now loaded on-demand when user shows intent
        // (clicks "Start Analysis" or enters Chat tab)
        // See loadHeavyModulesOnIntent() above
        logger.debug('Heavy modules registered for on-demand loading');

        // Import and initialize the application
        const { init } = await import('./app.js');
        await init({ safeModeReason, securityReport });

        logger.info('Application initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize application:', error);
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
