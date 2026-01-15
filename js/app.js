/**
 * Main Application Controller
 * 
 * Refactored to use HNW modular architecture.
 * Delegates to services and controllers instead of being a God object.
 * 
 * @module app
 */

// ==========================================
// Dependencies
// ==========================================

// Import modules (loaded in order via script tags in HTML)
// Services
// - TabCoordinator (cross-tab coordination)
// - SessionManager (session lifecycle)
// - MessageOperations (message operations)
// - OperationLock (operation locking)
// Controllers
// - FileUploadController (file processing)
// - SpotifyController (Spotify OAuth)
// - DemoController (demo mode)
// - ResetController (reset operations)
// - ChatUIController (chat UI)
// - SidebarController (sidebar)
// - ViewController (view transitions)
// State
// - AppState (centralized state)
// Storage
// - Storage (unified storage API)
// Core
// - Patterns (pattern detection)
// - Personality (personality classification)
// - Chat (chat orchestration)
// - Spotify (Spotify API)
// - DemoData (demo data)
// - Cards (share cards)
import { SecurityChecklist } from './security.js';
// - SecurityChecklist (first-run security checklist)

// ==========================================
// State Management
// ==========================================

// Initialize centralized state
AppState.init();

// ==========================================
// Dependency Checking (HNW Hierarchy: Early-fail pattern)
// ==========================================

/**
 * Critical dependencies that must be loaded and initialized
 * Maps dependency name to { check: fn, required: boolean }
 */
const CRITICAL_DEPENDENCIES = {
    // Core modules (required)
    'AppState': { check: () => window.AppState && typeof window.AppState.init === 'function', required: true },
    'Storage': { check: () => window.Storage && typeof window.Storage.init === 'function', required: true },
    'Chat': { check: () => window.Chat && typeof window.Chat.sendMessage === 'function', required: true },
    'Spotify': { check: () => window.Spotify && typeof window.Spotify.isConfigured === 'function', required: true },
    'Patterns': { check: () => window.Patterns && typeof window.Patterns.detectAllPatterns === 'function', required: true },
    'Personality': { check: () => window.Personality && typeof window.Personality.classifyPersonality === 'function', required: true },

    // Services (required)
    'TabCoordinator': { check: () => window.TabCoordinator && typeof window.TabCoordinator.init === 'function', required: true },
    'SessionManager': { check: () => window.SessionManager && typeof window.SessionManager.init === 'function', required: true },
    'MessageOperations': { check: () => window.MessageOperations && typeof window.MessageOperations.init === 'function', required: true },

    // Controllers (required)
    'ViewController': { check: () => window.ViewController && typeof window.ViewController.showChat === 'function', required: true },
    'FileUploadController': { check: () => window.FileUploadController && typeof window.FileUploadController.init === 'function', required: true },
    'SpotifyController': { check: () => window.SpotifyController && typeof window.SpotifyController.init === 'function', required: true },
    'DemoController': { check: () => window.DemoController && typeof window.DemoController.init === 'function', required: true },
    'ResetController': { check: () => window.ResetController && typeof window.ResetController.init === 'function', required: true },
    'SidebarController': { check: () => window.SidebarController && typeof window.SidebarController.init === 'function', required: true },
    'ChatUIController': { check: () => window.ChatUIController && typeof window.ChatUIController.addMessage === 'function', required: true },

    // Security (required for token binding)
    'Security': { check: () => window.Security && typeof window.Security.checkSecureContext === 'function', required: true },

    // Optional modules (not required but useful)
    'RAG': { check: () => window.RAG && typeof window.RAG.search === 'function', required: false },
    'LocalVectorStore': { check: () => window.LocalVectorStore && typeof window.LocalVectorStore.init === 'function', required: false },
    'LocalEmbeddings': { check: () => window.LocalEmbeddings && typeof window.LocalEmbeddings.initialize === 'function', required: false },

    // Security checklist (optional - only shows on first run)
    // Uses imported SecurityChecklist symbol, not window global
    'SecurityChecklist': { check: () => SecurityChecklist && typeof SecurityChecklist.init === 'function', required: false }
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
    if (window.Security?._isFallback || window.Security?.isFallbackMode?.()) {
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
            if (missing.includes(name) || missing.some(m => m.startsWith(name))) {
                return `<li class="dep-missing">❌ ${name} ${required ? '(required)' : '(optional)'}</li>`;
            } else if (optional.includes(name)) {
                return `<li class="dep-optional">⚠️ ${name} (optional, not loaded)</li>`;
            } else {
                return `<li class="dep-loaded">✅ ${name}</li>`;
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
                <button class="btn btn-primary" onclick="location.reload()">
                    Refresh Page
                </button>
                <button class="btn btn-secondary" onclick="copyErrorReport()">
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

    // Add copy function to window
    window.copyErrorReport = function () {
        const reportText = JSON.stringify(errorReport, null, 2);
        navigator.clipboard.writeText(reportText).then(() => {
            showToast('Error report copied to clipboard');
        }).catch(() => {
            // Fallback: show in alert
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
    banner.innerHTML = `
        <span class="icon">⚠️</span>
        <span class="text">
            <strong>Safe Mode:</strong> Security modules failed to load. 
            Data will not be encrypted. Sensitive features are disabled.
        </span>
        <button onclick="location.reload()">Retry</button>
    `;

    document.body.prepend(banner);
    document.body.classList.add('has-safe-mode-banner');

    // Store in AppState for other modules to check
    if (window.AppState?.update) {
        AppState.update('app', { safeMode: true });
    }
}

// ==========================================
// Safe Mode Guards
// ==========================================

/**
 * Check if app is in Safe Mode (security modules failed)
 * @returns {boolean}
 */
function isInSafeMode() {
    return !!(window.AppState?.get?.('app')?.safeMode);
}

// Make available globally for other modules
if (typeof window !== 'undefined') {
    window.isInSafeMode = isInSafeMode;
}

// ==========================================
// Controller Initialization (continued)
// ==========================================

/**
 * Initialize all controllers with their dependencies
 */
async function initializeControllers() {
    console.log('[App] Initializing controllers...');

    // Initialize FileUploadController
    FileUploadController.init({
        Storage,
        AppState,
        OperationLock: window.OperationLock,
        Patterns,
        Personality,
        ViewController,
        showToast
    });

    // Initialize SpotifyController
    SpotifyController.init({
        Storage,
        AppState,
        Spotify,
        Patterns,
        Personality,
        ViewController,
        showToast
    });

    // Initialize DemoController
    DemoController.init({
        AppState,
        DemoData,
        ViewController,
        showToast
    });

    // Initialize ResetController
    ResetController.init({
        Storage,
        AppState,
        Spotify,
        Chat: window.Chat,
        OperationLock: window.OperationLock,
        ViewController,
        showToast
    });

    // Initialize MessageOperations
    MessageOperations.init({
        DataQuery: window.DataQuery,
        TokenCounter: window.TokenCounter,
        Functions: window.Functions,
        RAG: window.RAG
    });

    console.log('[App] Controllers initialized');
}

// ==========================================
// Initialization
// ==========================================

/**
 * Initialize the application
 * @param {Object} options - Initialization options
 * @param {string|null} options.safeModeReason - If set, security check failed with this reason
 */
async function init(options = {}) {
    console.log('[App] Initializing with HNW modular architecture...');

    // HNW Security: Check for Safe Mode from main.js security check
    // This is the primary safe mode trigger (security context failed)
    const safeModeFromMain = options.safeModeReason;
    if (safeModeFromMain) {
        console.warn('[App] Safe Mode activated from main.js:', safeModeFromMain);
        showSafeModeWarning();
        // Continue with limited functionality
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

    // Initialize cross-tab coordination first (prevents race conditions)
    const isPrimary = await TabCoordinator.init();
    if (!isPrimary) {
        console.log('[App] Secondary tab detected - write operations disabled');
    }

    // Initialize unified storage
    await Storage.init();

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

    // Spotify OAuth callback
    if (urlParams.has('code')) {
        await SpotifyController.handleSpotifyCallback(urlParams.get('code'));
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }

    // Spotify auth cancelled
    if (urlParams.has('error')) {
        console.log('Spotify auth cancelled:', urlParams.get('error'));
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Spotify Quick Snapshot mode
    if (urlParams.get('mode') === 'spotify') {
        window.history.replaceState({}, document.title, window.location.pathname);
        if (Spotify.isConfigured()) {
            setupEventListeners();
            setupSpotifyButton();
            await SpotifyController.handleSpotifyConnect();
            return;
        }
    }

    // Demo mode
    if (urlParams.get('mode') === 'demo') {
        console.log('[App] Demo mode activated');
        window.history.replaceState({}, document.title, window.location.pathname);

        await DemoController.loadDemoMode();

        setupEventListeners();
        setupSpotifyButton();
        await SidebarController.init();
        return;
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
    if (SecurityChecklist && typeof SecurityChecklist.init === 'function') {
        setTimeout(() => {
            SecurityChecklist.init();
        }, 1000);
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
 */
function setupEventListeners() {
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const resetBtn = document.getElementById('reset-btn');
    const spotifyConnectBtn = document.getElementById('spotify-connect-btn');

    // File upload
    if (uploadZone && fileInput) {
        uploadZone.addEventListener('click', (e) => {
            if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.upload-alternatives')) {
                return;
            }
            fileInput.click();
        });
        uploadZone.addEventListener('dragover', handleDragOver);
        uploadZone.addEventListener('dragleave', handleDragLeave);
        uploadZone.addEventListener('drop', handleDrop);
        fileInput.addEventListener('change', handleFileSelect);
    }

    // Spotify connect
    if (spotifyConnectBtn) {
        spotifyConnectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleSpotifyConnect();
        });
    }

    // Reset
    if (resetBtn) {
        resetBtn.addEventListener('click', handleReset);
    }

    // Reveal actions
    document.getElementById('explore-chat-btn')?.addEventListener('click', showChat);
    document.getElementById('share-card-btn')?.addEventListener('click', handleShare);
    document.getElementById('lite-explore-chat-btn')?.addEventListener('click', showChat);
    document.getElementById('lite-share-card-btn')?.addEventListener('click', handleShare);
    document.getElementById('lite-upload-full-btn')?.addEventListener('click', showUpload);

    // Chat
    document.getElementById('chat-send')?.addEventListener('click', handleChatSend);
    document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleChatSend();
    });

    // Suggestion chips (exclude demo chips which have their own handlers)
    document.querySelectorAll('.suggestion-chip:not(.demo-chip)').forEach(chip => {
        chip.addEventListener('click', () => {
            const input = document.getElementById('chat-input');
            if (input) {
                input.value = chip.dataset.question;
                handleChatSend();
            }
        });
    });
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

async function handleChatSend() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message) return;

    input.value = '';

    // Add user message via ChatUIController
    ChatUIController.addMessage(message, 'user');

    // Hide suggestions
    const suggestions = document.getElementById('chat-suggestions');
    if (suggestions) suggestions.style.display = 'none';

    // Get response
    await processMessageResponse((options) => Chat.sendMessage(message, options));
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
            if (response.status === 'error') {
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

function showToast(message, duration = 3000) {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.className = 'toast-notification';
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
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

// Make modal functions available globally for onclick handlers
if (typeof window !== 'undefined') {
    window.executeReset = executeReset;
    window.hideResetConfirmModal = hideResetConfirmModal;
    window.showPrivacyDashboard = showPrivacyDashboard;
    window.clearSensitiveData = clearSensitiveData;
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
    if (window.Security?.enablePrototypePollutionProtection) {
        window.Security.enablePrototypePollutionProtection();
        console.log('[App] Prototype pollution protection enabled (window.onload - after all resources loaded)');
    }
});
