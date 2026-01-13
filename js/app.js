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

// ==========================================
// State Management
// ==========================================

// Initialize centralized state
AppState.init();

// ==========================================
// Controller Initialization
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
 */
async function init() {
    console.log('[App] Initializing with HNW modular architecture...');

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

    // Add user message
    addMessage(message, 'user');

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
    // Create loading placeholder
    const loadingId = addLoadingMessage();

    const onProgress = (state) => {
        updateLoadingMessage(loadingId, state);
    };

    try {
        const response = await actionFn({ onProgress });
        const loadingEl = document.getElementById(loadingId);

        if (!response) {
            removeMessageElement(loadingId);
            addMessage('No response generated. Please try again.', 'assistant', true);
            return;
        }

        if (response.error && !response.content) {
            removeMessageElement(loadingId);
            addMessage(response.error, 'assistant', true);
            return;
        }

        const wasStreaming = loadingEl?.dataset?.streaming === 'true';

        if (wasStreaming) {
            loadingEl.classList.remove('streaming');
            loadingEl.classList.add('assistant');
            loadingEl.removeAttribute('id');
            delete loadingEl.dataset.streaming;
            finalizeStreamedMessage(loadingEl, response.content);
        } else {
            removeMessageElement(loadingId);
            if (response.status === 'error') {
                addMessage(response.content, 'assistant', true);
            } else {
                addMessage(response.content, 'assistant');
            }
        }
    } catch (err) {
        removeMessageElement(loadingId);
        addMessage(`Error: ${err.message}`, 'assistant', true);
    }
}

/**
 * Finalize a streamed message - add action buttons
 */
function finalizeStreamedMessage(messageEl, fullContent) {
    const contentEl = messageEl.querySelector('.streaming-content');
    if (contentEl && fullContent) {
        contentEl.innerHTML = parseMarkdown(fullContent);
        contentEl.classList.remove('streaming-content');
    }

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';

    // Regenerate button
    const regenBtn = document.createElement('button');
    regenBtn.className = 'action-btn regenerate';
    regenBtn.innerHTML = '↻';
    regenBtn.title = 'Regenerate';
    regenBtn.onclick = async () => {
        messageEl.remove();
        await processMessageResponse((options) => Chat.regenerateLastResponse(options));
    };
    actionsDiv.appendChild(regenBtn);

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn delete';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Delete';
    deleteBtn.onclick = () => {
        const messages = document.getElementById('chat-messages');
        const index = Array.from(messages.children).indexOf(messageEl);
        if (Chat.deleteMessage(index)) {
            messageEl.remove();
        }
    };
    actionsDiv.appendChild(deleteBtn);

    messageEl.appendChild(actionsDiv);
}

function addLoadingMessage() {
    if (typeof ChatUIController !== 'undefined' && ChatUIController.addLoadingMessage) {
        return ChatUIController.addLoadingMessage();
    }

    const id = 'msg-' + Date.now();
    const messages = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'message assistant loading';
    div.id = id;
    div.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return id;
}

function updateLoadingMessage(id, state) {
    if (typeof ChatUIController !== 'undefined' && ChatUIController.updateLoadingMessage) {
        return ChatUIController.updateLoadingMessage(id, state);
    }

    const el = document.getElementById(id);
    if (!el) return;

    if (state.type === 'tool_start') {
        el.className = 'message tool-execution';
        el.innerHTML = `<span class="icon">⚡</span> Analyzing data with ${state.tool}...`;
    } else if (state.type === 'thinking') {
        if (!el.dataset.streaming) {
            el.className = 'message assistant loading';
            el.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
        }
    } else if (state.type === 'token') {
        if (!el.dataset.streaming) {
            el.dataset.streaming = 'true';
            el.className = 'message assistant streaming';
            el.innerHTML = '<div class="message-content streaming-content"></div>';
        }
        const contentEl = el.querySelector('.streaming-content');
        if (contentEl && state.token) {
            const escaped = escapeHtml(state.token).replace(/\n/g, '<br>');
            contentEl.innerHTML += escaped;
            const messages = document.getElementById('chat-messages');
            if (messages) messages.scrollTop = messages.scrollHeight;
        }
    } else if (state.type === 'thinking' && state.content) {
        let thinkingEl = el.querySelector('.thinking-block');
        if (!thinkingEl) {
            thinkingEl = document.createElement('details');
            thinkingEl.className = 'thinking-block';
            thinkingEl.innerHTML = '<summary>💭 Model reasoning</summary><div class="thinking-content"></div>';
            el.insertBefore(thinkingEl, el.firstChild);
        }
        const content = thinkingEl.querySelector('.thinking-content');
        if (content) {
            content.textContent = state.content;
        }
    }
}

function removeMessageElement(id) {
    if (typeof ChatUIController !== 'undefined' && ChatUIController.removeMessageElement) {
        return ChatUIController.removeMessageElement(id);
    }

    const el = document.getElementById(id);
    if (el) el.remove();
}

/**
 * Escape HTML to prevent injection in rendered content
 */
function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (char) => {
        switch (char) {
            case '&':
                return '&amp;';
            case '<':
                return '&lt;';
            case '>':
                return '&gt;';
            case '"':
                return '&quot;';
            case "'":
                return '&#39;';
            default:
                return char;
        }
    });
}

/**
 * Simple markdown to HTML converter
 */
function parseMarkdown(text) {
    if (typeof ChatUIController !== 'undefined' && ChatUIController.parseMarkdown) {
        return ChatUIController.parseMarkdown(text);
    }

    if (!text) return '';
    return escapeHtml(text)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/\*([^\*]+)\*/g, '<em>$1</em>')
        .replace(/_([^_]+)_/g, '<em>$1</em>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/^(.+)$/, '<p>$1</p>');
}

/**
 * Add message to chat UI
 */
function addMessage(text, role, isError = false) {
    const messages = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `message ${role} ${isError ? 'error' : ''}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    if (role === 'assistant') {
        contentDiv.innerHTML = parseMarkdown(text);
    } else {
        contentDiv.textContent = text;
    }
    div.appendChild(contentDiv);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';

    if (isError) {
        const retryBtn = document.createElement('button');
        retryBtn.className = 'retry-btn';
        retryBtn.textContent = 'Try Again';
        retryBtn.onclick = async () => {
            div.remove();
            await processMessageResponse((options) => Chat.regenerateLastResponse(options));
        };
        actionsDiv.appendChild(retryBtn);

        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'retry-btn secondary';
        settingsBtn.textContent = 'Change Model';
        settingsBtn.style.marginLeft = '10px';
        settingsBtn.onclick = () => {
            const modal = document.getElementById('settings-modal');
            if (modal) modal.style.display = 'block';
        };
        actionsDiv.appendChild(settingsBtn);
    } else if (role === 'user') {
        const editBtn = document.createElement('button');
        editBtn.className = 'action-btn edit';
        editBtn.innerHTML = '✎';
        editBtn.title = 'Edit';
        editBtn.onclick = () => enableEditMode(div, text);
        actionsDiv.appendChild(editBtn);
    } else {
        const regenBtn = document.createElement('button');
        regenBtn.className = 'action-btn regenerate';
        regenBtn.innerHTML = '↻';
        regenBtn.title = 'Regenerate';
        regenBtn.onclick = async () => {
            div.remove();
            await processMessageResponse((options) => Chat.regenerateLastResponse(options));
        };
        actionsDiv.appendChild(regenBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn delete';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Delete';
    deleteBtn.onclick = () => {
        const index = Array.from(messages.children).indexOf(div);
        if (Chat.deleteMessage(index)) {
            div.remove();
        }
    };
    actionsDiv.appendChild(deleteBtn);

    div.appendChild(actionsDiv);
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}

function enableEditMode(messageDiv, currentText) {
    const contentDiv = messageDiv.querySelector('.message-content');
    const actionsDiv = messageDiv.querySelector('.message-actions');

    actionsDiv.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.className = 'edit-input-wrapper';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'edit-input';
    input.value = currentText;

    const saveBtn = document.createElement('button');
    saveBtn.className = 'action-btn';
    saveBtn.innerText = 'Save';
    saveBtn.onclick = async () => {
        const newText = input.value.trim();
        if (newText && newText !== currentText) {
            const index = Array.from(messageDiv.parentElement.children).indexOf(messageDiv);

            const allMessages = Array.from(messageDiv.parentElement.children);
            for (let i = index; i < allMessages.length; i++) {
                allMessages[i].remove();
            }

            addMessage(newText, 'user');
            await processMessageResponse((options) => Chat.editMessage(index, newText, options));
        } else {
            cancelEdit();
        }
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'action-btn';
    cancelBtn.innerText = 'Cancel';
    cancelBtn.onclick = cancelEdit;

    function cancelEdit() {
        contentDiv.style.display = '';
        wrapper.remove();
        actionsDiv.style.display = '';
    }

    wrapper.appendChild(input);
    wrapper.appendChild(saveBtn);
    wrapper.appendChild(cancelBtn);

    contentDiv.style.display = 'none';
    messageDiv.insertBefore(wrapper, actionsDiv);

    input.focus();
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
// Start Application
// ==========================================

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
