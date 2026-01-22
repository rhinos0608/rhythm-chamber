/**
 * Main Application Controller
 * 
 * Refactored to use HNW modular architecture.
 * Delegates to services and controllers instead of being a God object.
 * 
 * @module app
 */

// ==========================================
// ES Module Imports (No more window.X dependencies!)
// ==========================================

// Security (must be first for fail-fast behavior)
import { Security, SecurityChecklist } from './security/index.js';

// Core utilities
import { ModuleRegistry } from './module-registry.js';
import { Container } from './ioc-container.js';
import { escapeHtml } from './utils/html-escape.js';
import { Utils } from './utils.js';

// State management
import { AppState } from './state/app-state.js';

// Storage layer
import { Storage } from './storage.js';

// Core analysis modules
import { Patterns } from './patterns.js';
import { Personality } from './personality.js';
import { DataQuery } from './data-query.js';
import { Prompts } from './prompts.js';

// Token counter
import { TokenCounter } from './token-counter.js';

// Functions system
import { Functions } from './functions/index.js';

// Cards
import { Cards } from './cards.js';

// Spotify
import { Spotify } from './spotify.js';
// Settings lazy-loaded on first use (84KB savings)
// import { Settings } from './settings.js';

// Chat
import { Chat } from './chat.js';

// Controllers
import { ViewController } from './controllers/view-controller.js';
import { FileUploadController } from './controllers/file-upload-controller.js';
import { SpotifyController } from './controllers/spotify-controller.js';
import { DemoController } from './controllers/demo-controller.js';
import { ResetController } from './controllers/reset-controller.js';
import { SidebarController } from './controllers/sidebar-controller.js';
import { ChatUIController } from './controllers/chat-ui-controller.js';

// Services
import { TabCoordinator } from './services/tab-coordination.js';
import { SessionManager } from './services/session-manager.js';
import { MessageOperations } from './services/message-operations.js';
import { EventBus } from './services/event-bus.js';
import { EventLogStore } from './storage/event-log-store.js';

// Utility modules
import { OperationLock } from './operation-lock.js';
import { CircuitBreaker } from './services/circuit-breaker.js';
import { FunctionCallingFallback } from './services/function-calling-fallback.js';
import { DataVersion } from './services/data-version.js';

// Demo and template data
import { DemoData } from './demo-data.js';
import { TemplateProfileStore } from './template-profiles.js';
import { ProfileSynthesizer } from './profile-synthesizer.js';

// ==========================================
// State Management
// ==========================================

// NOTE: AppState initialization moved into init() function to prevent race conditions
// This ensures Safe Mode check completes before any storage operations


// ==========================================
// Dependency Checking (HNW Hierarchy: Early-fail pattern)
// ==========================================

/**
 * Critical dependencies that must be loaded and initialized
 * Now uses ES imports instead of window.X checks for proper module resolution
 * Maps dependency name to { check: fn, required: boolean }
 */
const CRITICAL_DEPENDENCIES = {
    // Core modules (required) - use imported ES modules directly
    'AppState': { check: () => AppState?.isReady?.() ?? (AppState && typeof AppState.init === 'function'), required: true },
    'Storage': { check: () => Storage?.isReady?.() ?? (Storage && typeof Storage.init === 'function'), required: true },
    'Chat': { check: () => Chat?.isReady?.() ?? (Chat && typeof Chat.sendMessage === 'function'), required: true },
    'Spotify': { check: () => Spotify && typeof Spotify.isConfigured === 'function', required: true },
    'Patterns': { check: () => Patterns && typeof Patterns.detectAllPatterns === 'function', required: true },
    'Personality': { check: () => Personality && typeof Personality.classifyPersonality === 'function', required: true },

    // Services (required) - using imported modules
    'TabCoordinator': { check: () => TabCoordinator && typeof TabCoordinator.init === 'function', required: true },
    'SessionManager': { check: () => SessionManager && typeof SessionManager.init === 'function', required: true },
    'MessageOperations': { check: () => MessageOperations && typeof MessageOperations.init === 'function', required: true },

    // Controllers (required) - using imported modules
    'ViewController': { check: () => ViewController && typeof ViewController.showChat === 'function', required: true },
    'FileUploadController': { check: () => FileUploadController && typeof FileUploadController.init === 'function', required: true },
    'SpotifyController': { check: () => SpotifyController && typeof SpotifyController.init === 'function', required: true },
    'DemoController': { check: () => DemoController && typeof DemoController.init === 'function', required: true },
    'ResetController': { check: () => ResetController && typeof ResetController.init === 'function', required: true },
    'SidebarController': { check: () => SidebarController && typeof SidebarController.init === 'function', required: true },
    'ChatUIController': { check: () => ChatUIController && typeof ChatUIController.addMessage === 'function', required: true },

    // Security (required for token binding) - using imported module
    'Security': { check: () => Security && typeof Security.checkSecureContext === 'function', required: true },

    // Optional modules (not required but useful) - use ModuleRegistry for dynamically loaded modules
    'RAG': { check: () => ModuleRegistry.isLoaded('RAG'), required: false },
    'LocalVectorStore': { check: () => ModuleRegistry.isLoaded('LocalVectorStore'), required: false },
    'LocalEmbeddings': { check: () => ModuleRegistry.isLoaded('LocalEmbeddings'), required: false },

    // Security checklist (optional - only shows on first run)
    'SecurityChecklist': { check: () => SecurityChecklist && typeof SecurityChecklist.init === 'function', required: false },

    // Settings module lazy-loaded on first use (84KB savings)
    // 'Settings': { check: () => Settings && typeof Settings.showSettingsModal === 'function', required: true }
};

/**
 * Verify all critical dependencies are loaded and properly initialized
 * Checks both existence AND initialization state (not just window.X exists)
 * Also detects Security fallback mode for "fail-closed" security
 * @returns {{valid: boolean, safeMode: boolean, loaded: string[], missing: string[], optional: string[]}}
 */
function checkDependencies() {
    const loaded = [];
    const missing = [];
    const optional = [];
    let safeMode = false;

    for (const [name, { check, required }] of Object.entries(CRITICAL_DEPENDENCIES)) {
        try {
            const isLoaded = check();
            if (isLoaded) {
                loaded.push(name);
            } else if (required) {
                missing.push(name);
            } else {
                optional.push(name);
            }
        } catch (e) {
            // Check threw an error - module is broken
            console.error(`[App] Dependency check failed for ${name}:`, e);
            if (required) {
                missing.push(`${name} (error: ${e.message})`);
            } else {
                optional.push(`${name} (error)`);
            }
        }
    }

    // HNW Security: Detect Security fallback mode (fail-closed architecture)
    // If Security is using fallback stubs, data encryption is NOT available
    if (Security._isFallback || Security.isFallbackMode()) {
        console.warn('[App] Security module in FALLBACK mode - Safe Mode activated');
        safeMode = true;
    }

    const valid = missing.length === 0;

    if (!valid) {
        console.error('[App] Missing critical dependencies:', missing);
    }
    if (optional.length > 0) {
        console.warn('[App] Optional dependencies not loaded:', optional);
    }

    return { valid, safeMode, loaded, missing, optional };
}

/**
 * Show detailed loading error UI with diagnostic information
 * @param {string[]} missing - Names of missing dependencies
 * @param {string[]} optional - Names of optional dependencies not loaded
 */
function showLoadingError(missing, optional = []) {
    const container = document.querySelector('.app-main');
    if (!container) return;

    // Generate dependency status list
    const statusHtml = Object.entries(CRITICAL_DEPENDENCIES)
        .map(([name, { required }]) => {
            // Escape dependency names to prevent XSS from manipulated constants
            const escapedName = escapeHtml(name);
            if (missing.includes(name) || missing.some(m => m.startsWith(name))) {
                return `<li class="dep-missing">❌ ${escapedName} ${required ? '(required)' : '(optional)'}</li>`;
            } else if (optional.includes(name)) {
                return `<li class="dep-optional">⚠️ ${escapedName} (optional, not loaded)</li>`;
            } else {
                return `<li class="dep-loaded">✅ ${escapedName}</li>`;
            }
        })
        .join('');

    // Generate error report for clipboard
    const errorReport = {
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        missing,
        optional,
        online: navigator.onLine,
        connection: navigator.connection ? {
            type: navigator.connection.effectiveType,
            downlink: navigator.connection.downlink,
            rtt: navigator.connection.rtt
        } : 'unavailable'
    };

    container.innerHTML = `
        <div class="loading-error">
            <div class="error-icon">⚠️</div>
            <h2>Application Loading Error</h2>
            <p class="error-message">
                Some required modules failed to load. This often happens on slow or unstable network connections.
            </p>
            
            <details class="diagnostics-details">
                <summary>Show Diagnostics</summary>
                <ul class="dependency-status">
                    ${statusHtml}
                </ul>
                <p class="network-status">
                    Network: ${navigator.onLine ? '🟢 Online' : '🔴 Offline'}
                    ${navigator.connection ? ` | ${navigator.connection.effectiveType}` : ''}
                </p>
            </details>

            <div class="error-actions">
                <button class="btn btn-primary" data-action="refresh-page">
                    Refresh Page
                </button>
                <button class="btn btn-secondary" data-action="copy-error-report">
                    Copy Error Report
                </button>
            </div>
            
            <p class="error-help">
                If this persists, please 
                <a href="https://github.com/rhythm-chamber/issues" target="_blank">report the issue</a> 
                with the error report.
            </p>
        </div>
    `;

    // Make copyErrorReport available for event delegation
    window.copyErrorReport = function () {
        const reportText = JSON.stringify(errorReport, null, 2);
        navigator.clipboard.writeText(reportText).then(() => {
            showToast('Error report copied to clipboard');
        }).catch((err) => {
            // Fallback: show in alert
            console.warn('[App] Failed to copy to clipboard:', err);
            alert('Copy this error report:\n\n' + reportText);
        });
    };
}

// ==========================================
// Controller Initialization
// ==========================================

/**
 * Show Safe Mode warning banner when Security modules are in fallback mode
 * This implements "fail-closed" security - users are warned that encryption is unavailable
 */
function showSafeModeWarning() {
    console.warn('[App] Displaying Safe Mode warning banner');

    // Check if banner already exists
    if (document.querySelector('.safe-mode-banner')) return;

    const banner = document.createElement('div');
    banner.className = 'safe-mode-banner';
    banner.setAttribute('role', 'alert');
    // SAFE: Static HTML with no user input - this is an internal system message
    banner.innerHTML = `
        <span class="icon">⚠️</span>
        <span class="text">
            <strong>Safe Mode:</strong> Security modules failed to load.
            Data will not be encrypted. Sensitive features are disabled.
        </span>
        <button data-action="refresh-page">Retry</button>
    `;

    document.body.prepend(banner);
    document.body.classList.add('has-safe-mode-banner');

    // Store in AppState for other modules to check - use 'operations' domain for safe mode
    // This consolidates safe mode state management in a single location
    if (AppState?.update) {
        AppState.update('operations', { safeMode: true });
    }
}

// ==========================================
// Safe Mode Guards
// ==========================================

/**
 * Check if app is in Safe Mode (security modules failed)
 * Reads from AppState operations domain as single source of truth
 * @returns {boolean}
 */
function isInSafeMode() {
    return !!(AppState?.get?.('operations')?.safeMode);
}

/**
 * Set safe mode state explicitly
 * Used by external security checks to signal safe mode activation
 * @param {boolean} safeMode - Whether safe mode is active
 */
function setSafeMode(safeMode) {
    if (AppState?.update) {
        AppState.update('operations', { safeMode: !!safeMode });
    }
}

// ==========================================
// Authority UI Feedback (HNW)
// ==========================================

/**
 * Update UI to reflect current tab authority status
 * HNW Hierarchy: Visual feedback for read-only mode
 * Coordinates with AppState for single source of truth
 *
 * @param {Object} authority - Authority status from TabCoordinator
 */
function updateAuthorityUI(authority) {
    const indicator = document.getElementById('authority-indicator');
    const banner = document.getElementById('read-only-banner');
    const chatInput = document.getElementById('chat-input');

    if (!indicator) {
        console.log('[App] Authority indicator element not found');
        return;
    }

    // Defensive check for null/undefined authority
    if (!authority || typeof authority.level === 'undefined') {
        console.warn('[App] updateAuthorityUI received invalid authority:', authority);
        return;
    }

    const isPrimary = authority.level === 'primary';
    const isReadOnly = !isPrimary;

    // Update AppState for consistency with other components
    // This ensures any component can check authority via AppState
    if (AppState?.update) {
        AppState.update('ui', {
            authorityLevel: authority.level,
            isReadOnlyMode: isReadOnly
        });
    }

    // Update indicator
    const statusText = indicator.querySelector('.status-text');
    if (isPrimary) {
        indicator.classList.remove('secondary');
        indicator.classList.add('primary');
        if (statusText) statusText.textContent = 'Primary';
        indicator.title = 'Full access - You can make changes';

        // Remove read-only mode from body
        document.body.classList.remove('read-only-mode');
        if (banner) banner.classList.remove('active');

        // Restore chat input placeholder
        if (chatInput) {
            const originalPlaceholder = chatInput.dataset.originalPlaceholder;
            if (originalPlaceholder) {
                chatInput.placeholder = originalPlaceholder;
            } else {
                chatInput.placeholder = 'Ask about your music...';
            }
        }
    } else {
        indicator.classList.remove('primary');
        indicator.classList.add('secondary');
        if (statusText) statusText.textContent = 'Read-only';
        indicator.title = 'Read-only mode - Close other tabs to enable editing';

        // Add read-only mode to body
        document.body.classList.add('read-only-mode');
        if (banner) banner.classList.add('active');

        // Update chat input placeholder for read-only mode
        if (chatInput) {
            // Save original placeholder if not already saved
            if (!chatInput.dataset.originalPlaceholder) {
                chatInput.dataset.originalPlaceholder = chatInput.placeholder;
            }
            chatInput.placeholder = 'Read-only mode - close other tabs to enable chat';
        }
    }

    console.log(`[App] Authority UI updated: ${authority.level}`);
}

// ==========================================
// Controller Initialization (continued)
// ==========================================

/**
 * Register all services and controllers with the IoC container
 * This centralizes dependency management and eliminates manual injection
 */
function registerContainerServices() {
    console.log('[App] Registering services with IoC container...');

    // Register core services as singletons (ES modules are already singletons)
    Container.registerInstance('Storage', Storage);
    Container.registerInstance('AppState', AppState);
    Container.registerInstance('Spotify', Spotify);
    Container.registerInstance('Chat', Chat);
    Container.registerInstance('Patterns', Patterns);
    Container.registerInstance('Personality', Personality);
    Container.registerInstance('DataQuery', DataQuery);
    Container.registerInstance('TokenCounter', TokenCounter);
    Container.registerInstance('Functions', Functions);
    Container.registerInstance('Prompts', Prompts);
    Container.registerInstance('Cards', Cards);
    Container.registerInstance('OperationLock', OperationLock);
    Container.registerInstance('CircuitBreaker', CircuitBreaker);
    Container.registerInstance('FunctionCallingFallback', FunctionCallingFallback);
    Container.registerInstance('DataVersion', DataVersion);
    Container.registerInstance('TabCoordinator', TabCoordinator);
    Container.registerInstance('SessionManager', SessionManager);
    Container.registerInstance('EventBus', EventBus);
    Container.registerInstance('EventLogStore', EventLogStore);
    Container.registerInstance('Utils', Utils);
    Container.registerInstance('ViewController', ViewController);

    // Register demo data
    Container.registerInstance('DemoData', DemoData);
    Container.registerInstance('TemplateProfileStore', TemplateProfileStore);
    Container.registerInstance('ProfileSynthesizer', ProfileSynthesizer);

    // Register controllers
    Container.registerInstance('FileUploadController', FileUploadController);
    Container.registerInstance('SpotifyController', SpotifyController);
    Container.registerInstance('DemoController', DemoController);
    Container.registerInstance('ResetController', ResetController);
    Container.registerInstance('SidebarController', SidebarController);
    Container.registerInstance('ChatUIController', ChatUIController);
    Container.registerInstance('MessageOperations', MessageOperations);

    // Register utility functions (wrapping in objects for container compatibility)
    Container.registerInstance('showToast', showToast);

    console.log('[App] Services registered with IoC container');
}

/**
 * Initialize all controllers using the IoC container
 * Dependencies are auto-wired based on declared requirements
 */
async function initializeControllers() {
    console.log('[App] Initializing controllers via IoC container...');

    // Ensure services are registered
    if (!Container.has('Storage')) {
        registerContainerServices();
    }

    // Dependency mapping for each controller
    // Centralized configuration makes it easy to see what each controller needs
    const controllerDependencies = {
        FileUploadController: [
            'Storage', 'AppState', 'OperationLock', 'Patterns',
            'Personality', 'ViewController', 'showToast'
        ],
        SpotifyController: [
            'Storage', 'AppState', 'Spotify', 'Patterns',
            'Personality', 'ViewController', 'showToast'
        ],
        DemoController: [
            'AppState', 'DemoData', 'ViewController',
            'Patterns', 'showToast'
        ],
        ResetController: [
            'Storage', 'AppState', 'Spotify', 'Chat',
            'OperationLock', 'ViewController', 'showToast',
            'FileUploadController'
        ],
        // MessageOperations initialized WITHOUT heavy modules
        // RAG will be loaded on-demand when Chat features are accessed
        MessageOperations: [
            'DataQuery', 'TokenCounter', 'Functions'
        ]
    };

    // Initialize each controller with its dependencies
    for (const [controllerName, depNames] of Object.entries(controllerDependencies)) {
        try {
            Container.initController(controllerName, depNames);
            console.log(`[App] Initialized ${controllerName}`);
        } catch (error) {
            console.error(`[App] Failed to initialize ${controllerName}:`, error);
            // Re-throw to fail fast on critical initialization errors
            throw error;
        }
    }

    console.log('[App] All controllers initialized via IoC container');
}

// ==========================================
// Initialization
// ==========================================

/**
 * Initialize the application
 * @param {Object} options - Initialization options
 * @param {string|null} options.safeModeReason - If set, security check failed with this reason
 * @param {Object|null} options.securityReport - SecurityCoordinator initialization report
 */
async function init(options = {}) {
    console.log('[App] Initializing with HNW modular architecture...');

    // HNW Security: Check for Safe Mode from main.js security check
    // This is the primary safe mode trigger (security context failed)
    const safeModeFromMain = options.safeModeReason;
    const securityReport = options.securityReport;
    
    if (safeModeFromMain) {
        console.warn('[App] Safe Mode activated from main.js:', safeModeFromMain);
        showSafeModeWarning();
        // Continue with limited functionality
    }
    
    // Log security report if available
    if (securityReport) {
        console.log('[App] Security report:', {
            state: securityReport.overallState,
            keyManagerReady: securityReport.keyManagerReady,
            encryptionReady: securityReport.encryptionReady,
            tokenBindingReady: securityReport.tokenBindingReady,
            initTime: securityReport.totalInitTime?.toFixed(1) + 'ms'
        });
    }

    // CRITICAL: Initialize AppState IMMEDIATELY after security check
    // BEFORE any other initialization to ensure state is available to all modules
    // This prevents race conditions where modules try to access state before it's ready
    // EDGE CASE FIX: Await init() to ensure async initialization completes
    await AppState.init();

    // Verify AppState is ready before proceeding
    if (!AppState.isReady()) {
        console.error('[App] AppState failed to initialize properly');
        showLoadingError(['AppState initialization failed'], []);
        return;
    }

    // HNW Hierarchy: Early-fail if critical dependencies are missing
    // This catches script loading failures on spotty mobile networks
    const depCheck = checkDependencies();
    if (!depCheck.valid) {
        console.error('[App] Critical dependencies missing, showing error UI');
        showLoadingError(depCheck.missing, depCheck.optional);
        return; // Abort initialization
    }
    console.log(`[App] All ${depCheck.loaded.length} critical dependencies loaded`);

    // HNW Security: Check for Safe Mode (fail-closed architecture)
    // If Security is in fallback, show warning and continue with limited functionality
    if (depCheck.safeMode && !safeModeFromMain) {
        // Only show warning if not already shown from main.js
        showSafeModeWarning();
    }

    // Initialize cross-tab coordination AFTER AppState is ready
    // TabCoordinator depends on AppState for authority tracking
    // Also wait for Security to be ready to prevent initialization race condition
    await Security.waitForReady(10000);
    const isPrimary = await TabCoordinator.init();
    if (!isPrimary) {
        console.log('[App] Secondary tab detected - write operations disabled');
    }

    // HNW: Subscribe to authority changes for visual feedback
    if (typeof TabCoordinator.onAuthorityChange === 'function') {
        TabCoordinator.onAuthorityChange((authority) => {
            updateAuthorityUI(authority);
        });
    }

    // Initialize unified storage
    await Storage.init();

    // Initialize Event Log Store for event replay system
    try {
        await EventLogStore.initEventLogStores();
        console.log('[App] Event Log Store initialized');
    } catch (error) {
        console.error('[App] Failed to initialize Event Log Store:', error);
        // HIGH: Notify user of event replay system failure (may affect multi-tab sync)
        showToast('Event replay unavailable. Some features may be limited.', 'warning', 4000);
        // Continue without event replay - non-critical feature
    }

    // Enable event logging for replay coordination
    try {
        EventBus.enableEventLog(true);
        console.log('[App] Event logging enabled');
    } catch (error) {
        console.error('[App] Failed to enable event logging:', error);
        // HIGH: Notify user of EventBus logging failure (affects debugging/coordination)
        showToast('Event logging unavailable. Session coordination may be affected.', 'warning', 4000);
        // Continue without event logging - non-critical feature
    }

    // Validate storage consistency on startup
    const validation = await Storage.validateConsistency();
    if (!validation.valid) {
        console.warn('[App] Storage inconsistencies detected:', validation.warnings);
        if (validation.fixes.includes('clearConversation')) {
            sessionStorage.removeItem('rhythm_chamber_conversation');
            console.log('[App] Cleared orphaned conversation history');
        }
    }

    // Initialize session manager
    await SessionManager.init();

    // Initialize all controllers with dependencies
    await initializeControllers();

    // Check for OAuth callbacks or special modes
    const urlParams = new URLSearchParams(window.location.search);

    // VALIDATION: Validate URL parameters before processing
    // Whitelist of allowed modes
    const allowedModes = ['demo', 'spotify'];

    // Spotify OAuth callback - validate code format
    if (urlParams.has('code')) {
        const code = urlParams.get('code');
        // Basic validation: OAuth codes should be alphanumeric and reasonably long
        if (code && /^[A-Za-z0-9_-]{10,}$/.test(code)) {
            await SpotifyController.handleSpotifyCallback(code);
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
        } else {
            console.warn('[App] Invalid OAuth code format, ignoring');
        }
    }

    // Spotify auth cancelled
    if (urlParams.has('error')) {
        const error = urlParams.get('error');
        // Sanitize error string to prevent log injection
        if (error && error.length < 100) {
            console.log('Spotify auth cancelled:', error.replace(/[<>"']/g, ''));
        }
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Spotify Quick Snapshot mode
    const mode = urlParams.get('mode');
    if (mode === 'spotify' && allowedModes.includes(mode)) {
        window.history.replaceState({}, document.title, window.location.pathname);
        if (Spotify.isConfigured()) {
            setupEventListeners();
            setupSpotifyButton();
            // MEDIUM FIX: Ensure SidebarController is initialized before returning
            await SidebarController.init();
            await SpotifyController.handleSpotifyConnect();
            return;
        }
    }

    // Demo mode - validate against whitelist
    if (mode === 'demo' && allowedModes.includes(mode)) {
        console.log('[App] Demo mode activated');
        window.history.replaceState({}, document.title, window.location.pathname);

        await DemoController.loadDemoMode();

        setupEventListeners();
        setupSpotifyButton();
        await SidebarController.init();
        return;
    }

    // Warn about unexpected mode parameter
    if (mode && !allowedModes.includes(mode)) {
        console.warn(`[App] Unexpected mode parameter: ${mode}`);
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Check for existing data
    const existingData = await Storage.getPersonality();
    if (existingData) {
        // Load into AppState
        AppState.update('data', {
            personality: existingData,
            streams: await Storage.getStreams(),
            chunks: await Storage.getChunks()
        });

        const state = AppState.get('data');
        if (state.streams) {
            AppState.update('data', {
                patterns: Patterns.detectAllPatterns(state.streams, state.chunks)
            });

            // HNW Fix: Initialize Chat with loaded data (ensures chat has context on reload)
            const streams = state.streams;

            // HNW Guard: Handle empty streams array case
            if (!streams || streams.length === 0) {
                console.warn('[App] No streams available, skipping Chat initialization');
                showReveal();
                return; // Exit early - no valid data to initialize Chat with
            }

            // HNW Fix: Filter out null/undefined artist names before counting unique artists
            const validArtistNames = streams
                .map(s => s.master_metadata_album_artist_name)
                .filter(Boolean); // Remove null/undefined entries
            const summary = {
                dateRange: {
                    start: streams[0]?.ts?.split('T')[0] || 'Unknown',
                    end: streams[streams.length - 1]?.ts?.split('T')[0] || 'Unknown'
                },
                totalHours: Math.round(streams.reduce((acc, s) => acc + (s.ms_played || 0), 0) / 3600000),
                uniqueArtists: new Set(validArtistNames).size
            };
            await Chat.initChat(
                existingData,
                AppState.get('data').patterns,
                summary,
                streams
            );

            showReveal();
        }
    }

    // Setup event listeners and UI
    setupEventListeners();
    setupSpotifyButton();

    // Initialize sidebar controller
    await SidebarController.init();

    // Show security checklist on first run (after other UI is ready)
    // Use imported SecurityChecklist symbol for consistency
    // TIMING FIX: Use requestIdleCallback instead of arbitrary setTimeout
    // Falls back to setTimeout if requestIdleCallback is not available
    if (SecurityChecklist && typeof SecurityChecklist.init === 'function') {
        const initSecurityChecklist = () => {
            try {
                SecurityChecklist.init();
            } catch (e) {
                console.error('[App] SecurityChecklist init failed:', e);
            }
        };

        if (typeof requestIdleCallback !== 'undefined') {
            // Use requestIdleCallback for non-blocking initialization
            requestIdleCallback(initSecurityChecklist, { timeout: 2000 });
        } else {
            // Fallback for browsers without requestIdleCallback
            setTimeout(initSecurityChecklist, 100);
        }
    }

    // NOTE: Prototype pollution protection moved to window.onload handler
    // to ensure all scripts (including async/deferred) have finished loading

    console.log('[App] Initialization complete');
}

/**
 * Setup Spotify connect button state
 */
function setupSpotifyButton() {
    const spotifyConnectBtn = document.getElementById('spotify-connect-btn');
    if (!spotifyConnectBtn) return;

    if (Spotify.isConfigured()) {
        spotifyConnectBtn.disabled = false;
        spotifyConnectBtn.title = '';
    } else {
        spotifyConnectBtn.disabled = true;
        spotifyConnectBtn.title = 'Spotify not configured. Add Client ID to config.js';
    }
}

/**
 * Setup event listeners
 * Note: Idempotent - safe to call multiple times, will only register listeners once
 * MEMORY LEAK FIX: Tracks all listeners for proper cleanup via teardownEventListeners()
 */
// Guard flag to prevent duplicate event listener registration
let eventListenersSetup = false;
// Track cleanup functions for all registered event listeners
let _eventListenerCleanup = [];

function setupEventListeners() {
    // Prevent duplicate event listener registration
    if (eventListenersSetup) {
        console.warn('[App] Event listeners already registered, skipping setupEventListeners()');
        return;
    }
    eventListenersSetup = true;
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const resetBtn = document.getElementById('reset-btn');
    const spotifyConnectBtn = document.getElementById('spotify-connect-btn');

    // Helper to track event listener for cleanup
    const trackListener = (element, event, handler, options) => {
        if (element) {
            element.addEventListener(event, handler, options);
            _eventListenerCleanup.push(() => element.removeEventListener(event, handler, options));
        }
    };

    // File upload
    if (uploadZone && fileInput) {
        const uploadZoneClickHandler = (e) => {
            if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.upload-alternatives')) {
                return;
            }
            fileInput.click();
        };
        trackListener(uploadZone, 'click', uploadZoneClickHandler);

        const throttledDragOver = Utils.throttle(handleDragOver, 50);
        trackListener(uploadZone, 'dragover', throttledDragOver);

        const throttledDragLeave = Utils.throttle(handleDragLeave, 50);
        trackListener(uploadZone, 'dragleave', throttledDragLeave);

        trackListener(uploadZone, 'drop', handleDrop);
        trackListener(fileInput, 'change', handleFileSelect);
    }

    // Spotify connect
    if (spotifyConnectBtn) {
        const spotifyClickHandler = (e) => {
            e.stopPropagation();
            handleSpotifyConnect();
        };
        trackListener(spotifyConnectBtn, 'click', spotifyClickHandler);
    }

    // Reset
    if (resetBtn) {
        trackListener(resetBtn, 'click', handleReset);
    }

    // Reveal actions
    trackListener(document.getElementById('explore-chat-btn'), 'click', showChat);
    trackListener(document.getElementById('share-card-btn'), 'click', handleShare);
    trackListener(document.getElementById('lite-explore-chat-btn'), 'click', showChat);
    trackListener(document.getElementById('lite-share-card-btn'), 'click', handleShare);
    trackListener(document.getElementById('lite-upload-full-btn'), 'click', showUpload);

    // Chat
    trackListener(document.getElementById('chat-send'), 'click', handleChatSend);

    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        const chatInputKeypressHandler = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleChatSend();
            }
        };
        trackListener(chatInput, 'keypress', chatInputKeypressHandler);
    }

    // Suggestion chips (exclude demo chips which have their own handlers)
    document.querySelectorAll('.suggestion-chip:not(.demo-chip)').forEach(chip => {
        const chipClickHandler = () => {
            const input = document.getElementById('chat-input');
            if (input) {
                input.value = chip.dataset.question;
                handleChatSend();
            }
        };
        trackListener(chip, 'click', chipClickHandler);
    });

    // ==========================================
    // Event Delegation for data-action buttons
    // (HNW: Replaces inline onclick handlers for ES module compatibility)
    // ==========================================
    document.addEventListener('click', (e) => {
        const actionEl = e.target.closest('[data-action]');
        if (!actionEl) return;

        const action = actionEl.dataset.action;
        console.log(`[App] Action triggered: ${action}`);

        // HNW Fix: Defensive handlers that check for function existence to prevent ReferenceError
        // Settings is lazy-loaded on first use (84KB savings)
        const handlers = {
            // Header actions (Settings module - lazy-loaded on demand)
            'show-settings': async () => {
                try {
                    // Dynamic import of settings module (84KB savings on initial load)
                    const { Settings: LazySettings } = await import('./settings.js');
                    if (typeof LazySettings?.showSettingsModal === 'function') {
                        await LazySettings.showSettingsModal();
                    } else {
                        console.error('[App] Settings.showSettingsModal not available');
                    }
                } catch (err) {
                    console.error('[App] Failed to load settings module:', err);
                    if (window.showToast) {
                        window.showToast('Failed to load settings. Please try again.', 3000);
                    }
                }
            },
            'show-tools': async () => {
                try {
                    // Reuse the already-loaded Settings if cached by module system
                    const { Settings: LazySettings } = await import('./settings.js');
                    if (typeof LazySettings?.showToolsModal === 'function') {
                        LazySettings.showToolsModal();
                    } else {
                        console.error('[App] Settings.showToolsModal not available');
                    }
                } catch (err) {
                    console.error('[App] Failed to load settings module:', err);
                    if (window.showToast) {
                        window.showToast('Failed to load settings. Please try again.', 3000);
                    }
                }
            },
            'show-privacy-dashboard': () => {
                if (typeof showPrivacyDashboard === 'function') {
                    showPrivacyDashboard();
                } else {
                    console.error('[App] showPrivacyDashboard not available');
                }
            },
            'trigger-file-select': () => {
                const fileInput = document.getElementById('file-input');
                if (fileInput) {
                    fileInput.click();
                } else {
                    console.error('[App] file-input not found for trigger-file-select');
                }
            },

            // Reset modal
            'hide-reset-modal': hideResetConfirmModal,
            'execute-reset': executeReset,

            // Delete chat modal (from SidebarController via window)
            'hide-delete-modal': () => {
                if (typeof window.hideDeleteChatModal === 'function') {
                    window.hideDeleteChatModal();
                } else if (typeof window.SidebarController?.hideDeleteChatModal === 'function') {
                    window.SidebarController.hideDeleteChatModal();
                } else {
                    // Fallback: try to hide modal directly
                    const modal = document.getElementById('delete-chat-modal');
                    if (modal) modal.style.display = 'none';
                }
            },
            'confirm-delete-chat': async () => {
                if (typeof window.confirmDeleteChat === 'function') {
                    await window.confirmDeleteChat();
                } else if (typeof window.SidebarController?.confirmDeleteChat === 'function') {
                    await window.SidebarController.confirmDeleteChat();
                } else {
                    console.error('[App] confirmDeleteChat not available');
                }
            },

            // Multi-tab modal
            'close-multi-tab-modal': () => {
                const modal = document.getElementById('multi-tab-modal');
                if (modal) modal.style.display = 'none';
            },

            // Privacy dashboard modal
            'clear-sensitive-data': () => {
                if (typeof clearSensitiveData === 'function') {
                    clearSensitiveData();
                } else {
                    console.error('[App] clearSensitiveData not available');
                }
            },
            'close-privacy-modal': () => {
                const modal = document.getElementById('privacy-dashboard-modal');
                if (modal) modal.style.display = 'none';
            },

            // Error page actions
            'refresh-page': () => {
                location.reload();
            },
            'copy-error-report': () => {
                if (typeof window.copyErrorReport === 'function') {
                    window.copyErrorReport();
                } else {
                    console.error('[App] copyErrorReport not available');
                }
            }
        };

        const handler = handlers[action];
        if (handler) {
            // HNW Fix: Properly await async handlers so errors propagate
            // Some handlers like 'confirm-delete-chat' are async
            Promise.resolve(handler()).catch(err => {
                console.error(`[App] Handler '${action}' failed:`, err);
                EventBus.emit('handler:failed', { action, error: err });
            });
        } else {
            console.warn(`[App] Unknown action: ${action}`);
        }
    });

    // ==========================================
    // HNW Wave: Pattern Worker Failure Notification
    // ==========================================
    // Subscribe to worker failure events for user-friendly notification
    if (typeof EventBus !== 'undefined' && typeof EventBus.on === 'function') {
        EventBus.on('pattern:worker_failure', (data) => {
            console.warn('[App] Pattern worker failure detected:', data);
            const patterns = data.affectedPatterns?.join(', ') || 'pattern analysis';
            showToast(`⚠️ ${patterns} unavailable - Try refreshing the page`, 6000);
        });
        console.log('[App] Subscribed to pattern:worker_failure events');

        // Error Notification Bridge - Subscribe to all error events
        EventBus.on('error:critical', (data) => {
            console.error('[App] Critical error:', data);
            showToast(`⚠️ ${data.message || 'Critical error occurred'}`, 5000);
        });

        EventBus.on('storage:error', (data) => {
            console.error('[App] Storage error:', data);
            showToast(`⚠️ Storage error: ${data.error || 'Unknown error'}`, 4000);
        });

        EventBus.on('chat:error', (data) => {
            console.error('[App] Chat error:', data);
            // Only show non-recoverable errors to users
            if (!data.recoverable) {
                showToast(`⚠️ Chat error: ${data.error || 'Unable to send message'}`, 4000);
            }
        });

        EventBus.on('embedding:error', (data) => {
            console.error('[App] Embedding error:', data);
            showToast(`⚠️ Embedding error: ${data.error || 'Unknown error'}`, 4000);
        });

        console.log('[App] Error notification bridge initialized');
    }
}

/**
 * Teardown event listeners
 * MEMORY LEAK FIX: Removes all tracked event listeners to prevent memory leaks
 * Call this before page unload or when resetting the application state
 */
function teardownEventListeners() {
    // Execute all cleanup functions
    for (const cleanup of _eventListenerCleanup) {
        try {
            cleanup();
        } catch (e) {
            console.warn('[App] Error during event listener cleanup:', e);
        }
    }
    // Clear the cleanup array
    _eventListenerCleanup = [];
    // Reset the setup flag so listeners can be registered again if needed
    eventListenersSetup = false;
    console.log('[App] Event listeners torn down');
}

// ==========================================
// Drag and Drop Handlers
// ==========================================

function handleDragOver(e) {
    e.preventDefault();
    const uploadZone = document.getElementById('upload-zone');
    if (uploadZone) uploadZone.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    const uploadZone = document.getElementById('upload-zone');
    if (uploadZone) uploadZone.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    const uploadZone = document.getElementById('upload-zone');
    if (uploadZone) uploadZone.classList.remove('drag-over');

    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.zip') || file?.name.endsWith('.json')) {
        processFile(file);
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) processFile(file);
}

// ==========================================
// Spotify OAuth Flow
// ==========================================

/**
 * Initiate Spotify OAuth
 */
async function handleSpotifyConnect() {
    await SpotifyController.handleSpotifyConnect();
}

/**
 * Handle Spotify OAuth callback
 */
async function handleSpotifyCallback(code) {
    await SpotifyController.handleSpotifyCallback(code);
}

// ==========================================
// File Upload Processing
// ==========================================

/**
 * Process uploaded file
 */
async function processFile(file) {
    await FileUploadController.handleFileUpload(file);
}

// ==========================================
// Chat Handler
// ==========================================

// Guard flag to prevent duplicate submissions
let isSending = false;

async function handleChatSend() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');

    // Prevent concurrent submissions - CRITICAL: Set flag immediately after check
    // BEFORE any async operations or DOM queries to prevent race condition
    if (isSending) {
        console.warn('[App] Message already sending, ignoring duplicate submission');
        return;
    }

    // Set sending flag IMMEDIATELY to prevent race condition
    // This must happen before any async operations or message validation
    isSending = true;

    const message = input.value.trim();

    // Edge case: Provide feedback for empty/whitespace-only messages
    if (!message) {
        showToast('Please enter a message to send', 2000);
        isSending = false;
        return;
    }
    input.value = '';
    if (sendBtn) sendBtn.disabled = true;
    if (input) input.disabled = true;

    try {
        // Add user message via ChatUIController
        ChatUIController.addMessage(message, 'user');

        // Hide suggestions
        const suggestions = document.getElementById('chat-suggestions');
        if (suggestions) suggestions.style.display = 'none';

        // Get response
        await processMessageResponse((options) => Chat.sendMessage(message, options));
    } finally {
        // Always restore UI state, even on error
        isSending = false;
        if (sendBtn) sendBtn.disabled = false;
        if (input) input.disabled = false;
        // Refocus input for next message
        if (input && document.activeElement !== input) {
            input.focus();
        }
    }
}

/**
 * Process the response from Chat module with progress updates
 */
async function processMessageResponse(actionFn) {
    // Create loading placeholder via ChatUIController
    const loadingId = ChatUIController.addLoadingMessage();

    const onProgress = (state) => {
        ChatUIController.updateLoadingMessage(loadingId, state);
    };

    try {
        const response = await actionFn({ onProgress });
        const loadingEl = document.getElementById(loadingId);

        if (!response) {
            ChatUIController.removeMessageElement(loadingId);
            ChatUIController.addMessage('No response generated. Please try again.', 'assistant', true);
            return;
        }

        if (response.error && !response.content) {
            ChatUIController.removeMessageElement(loadingId);
            ChatUIController.addMessage(response.error, 'assistant', true);
            return;
        }

        const wasStreaming = loadingEl?.dataset?.streaming === 'true';

        if (wasStreaming) {
            ChatUIController.finalizeStreamedMessage(loadingEl, response.content);
        } else {
            ChatUIController.removeMessageElement(loadingId);
            // Treat both errors and fallbacks as error messages (show retry button)
            const isErrorOrFallback = response.status === 'error' || response.isFallback;
            if (isErrorOrFallback) {
                ChatUIController.addMessage(response.content, 'assistant', true);
            } else {
                ChatUIController.addMessage(response.content, 'assistant');
            }
        }
    } catch (err) {
        ChatUIController.removeMessageElement(loadingId);
        ChatUIController.addMessage(`Error: ${err.message}`, 'assistant', true);
    }
}

// ==========================================
// Share Handler
// ==========================================

async function handleShare() {
    const personality = AppState.get('data').personality || AppState.get('demo').personality;
    await Cards.shareCard(personality);
}

// ==========================================
// Reset Handler
// ==========================================

function handleReset() {
    ResetController.handleReset();
}

function showResetConfirmModal() {
    ResetController.showResetConfirmModal();
}

function hideResetConfirmModal() {
    ResetController.hideResetConfirmModal();
}

async function executeReset() {
    await ResetController.executeReset();
}

async function waitForWorkersAbort(abortController, timeoutMs) {
    return ResetController.waitForWorkersAbort(abortController, timeoutMs);
}

// ==========================================
// Privacy Dashboard
// ==========================================

/**
 * Show toast notification with optional type variant
 * @param {string} message - The message to display
 * @param {number|string} durationOrType - Duration in ms, or type ('success', 'error', 'warning', 'info')
 * @param {string} explicitType - Explicit type if first param is duration
 */
function showToast(message, durationOrType = 3000, explicitType = null) {
    let duration = 3000;
    let type = 'info';

    // Parse arguments: can be (message, duration) or (message, type) or (message, duration, type)
    if (typeof durationOrType === 'string') {
        type = durationOrType;
    } else if (typeof durationOrType === 'number') {
        duration = durationOrType;
    }
    if (explicitType) {
        type = explicitType;
    }

    // Validate type
    const validTypes = ['success', 'error', 'warning', 'info'];
    if (!validTypes.includes(type)) {
        type = 'info';
    }

    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.className = 'toast-notification';
        document.body.appendChild(toast);
    }

    // Remove existing type classes and add new one
    toast.classList.remove('toast-success', 'toast-error', 'toast-warning', 'toast-info');
    toast.classList.add(`toast-${type}`);

    // Add icon based on type
    const icons = {
        success: '',
        error: '',
        warning: '',
        info: ''
    };
    toast.textContent = icons[type] + message;
    toast.classList.add('show');

    // Clear any existing timeout
    if (toast._hideTimeout) {
        clearTimeout(toast._hideTimeout);
    }

    toast._hideTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

async function showPrivacyDashboard() {
    await ResetController.showPrivacyDashboard();
}

async function clearSensitiveData() {
    await ResetController.clearSensitiveData();
}

// ==========================================
// View Transitions (Delegated to ViewController)
// ==========================================

function showUpload() {
    ViewController.showUpload();
}

function showProcessing(message) {
    ViewController.showProcessing(message);
}

function showReveal() {
    ViewController.showReveal();
}

function showLiteReveal() {
    ViewController.showLiteReveal();
}

function showChat() {
    ViewController.showChat();
}

// ==========================================
// Global Exports
// ==========================================

// HIGH FIX: Minimize window global pollution - event delegation handles most actions
// Only export functions that are required by external modules or demo functionality
// processMessageResponse is required by ChatUIController for regenerate/edit flows
// showToast is required by session-manager, sidebar-controller, chat-ui-controller, error-boundary
// handleChatSend is required by demo-controller for programmatic chat sends
// copyErrorReport is required for the error page's copy button
if (typeof window !== 'undefined') {
    // Note: executeReset, hideResetConfirmModal, showPrivacyDashboard, clearSensitiveData
    // are handled by event delegation via data-action attributes - no window export needed
    window.processMessageResponse = processMessageResponse;
    window.handleChatSend = handleChatSend;
    window.showToast = showToast;
    // copyErrorReport is already defined in showLoadingError() for error page use
}

// ==========================================
// ES Module Export
// ==========================================

// Export init for main.js bootstrap (ES Module pattern)
// main.js handles DOMContentLoaded and calls init() after security checks
export { init };

// ==========================================
// Prototype Pollution Protection (window.onload)
// ==========================================
// This MUST happen after ALL resources load, including:
// - Deferred scripts
// - Third-party libraries  
// - Polyfills
// - Analytics scripts
// Using window.onload ensures all resources are finished before freezing prototypes

window.addEventListener('load', () => {
    if (Security.enablePrototypePollutionProtection) {
        Security.enablePrototypePollutionProtection();
        console.log('[App] Prototype pollution protection enabled (window.onload - after all resources loaded)');
    }
});
