/**
 * Main Application Controller
 * Orchestrates the Rhythm Chamber flow
 */

// ==========================================
// State Management (via AppState module)
// HNW: Centralized state with single mutation authority
// ==========================================

// Initialize centralized state
AppState.init();

// Backward compatibility: appState getter for incremental migration
// TODO: Remove once all direct appState access is migrated
const appStateProxy = {
    get streams() { return AppState.get('data').streams; },
    set streams(v) { AppState.update('data', { streams: v }); },

    get chunks() { return AppState.get('data').chunks; },
    set chunks(v) { AppState.update('data', { chunks: v }); },

    get patterns() { return AppState.get('data').patterns; },
    set patterns(v) { AppState.update('data', { patterns: v }); },

    get personality() { return AppState.get('data').personality; },
    set personality(v) { AppState.update('data', { personality: v }); },

    get liteData() { return AppState.get('lite').liteData; },
    set liteData(v) { AppState.update('lite', { liteData: v }); },

    get litePatterns() { return AppState.get('lite').litePatterns; },
    set litePatterns(v) { AppState.update('lite', { litePatterns: v }); },

    get isLiteMode() { return AppState.get('lite').isLiteMode; },
    set isLiteMode(v) { AppState.update('lite', { isLiteMode: v }); },

    get view() { return AppState.get('view').current; },
    set view(v) { AppState.setView(v); },

    get sidebarCollapsed() { return AppState.get('ui').sidebarCollapsed; },
    set sidebarCollapsed(v) { AppState.setSidebarCollapsed(v); }
};

// Use proxy for backward compatibility
let appState = appStateProxy;

let activeWorker = null; // Track active worker for cancellation
let workerAbortController = null; // NEW: Per-reset abort controller

// DOM Elements
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const processing = document.getElementById('processing');
const progressText = document.getElementById('progress-text');
const revealSection = document.getElementById('reveal-section');
const liteRevealSection = document.getElementById('lite-reveal-section');
const chatSection = document.getElementById('chat-section');
const resetBtn = document.getElementById('reset-btn');
const spotifyConnectBtn = document.getElementById('spotify-connect-btn');

// Sidebar Elements (managed by SidebarController)

// ==========================================
// Cross-Tab Coordination
// HNW Fix: Prevent data corruption from multiple tabs
// Uses BroadcastChannel for instant propagation (no polling)
// ==========================================

const TAB_ID = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
let tabCoordination = null;
let isPrimaryTab = true;

/**
 * Initialize cross-tab coordination
 * Uses BroadcastChannel for instant, no-polling coordination
 */
function initTabCoordination() {
    if (!('BroadcastChannel' in window)) {
        console.warn('[App] BroadcastChannel not supported, skipping cross-tab coordination');
        return;
    }

    tabCoordination = new BroadcastChannel('rhythm_chamber_coordination');

    tabCoordination.addEventListener('message', (event) => {
        if (event.data.type === 'CLAIM_PRIMARY' && event.data.tabId !== TAB_ID) {
            // Another tab claimed primary - we become secondary
            if (isPrimaryTab) {
                isPrimaryTab = false;
                showMultiTabWarning();
                disableWriteOperations();
            }
        } else if (event.data.type === 'RELEASE_PRIMARY') {
            // Primary tab closed - we can try to claim
            claimPrimaryTab();
        } else if (event.data.type === 'QUERY_PRIMARY') {
            // Another tab asking if there's a primary - respond if we're primary
            if (isPrimaryTab) {
                tabCoordination.postMessage({ type: 'CLAIM_PRIMARY', tabId: TAB_ID });
            }
        }
    });

    // Query for existing primary tabs first
    tabCoordination.postMessage({ type: 'QUERY_PRIMARY', tabId: TAB_ID });

    // Wait briefly for responses, then claim if no one responds
    setTimeout(() => {
        if (isPrimaryTab) {
            claimPrimaryTab();
        }
    }, 100);

    // Release primary on unload
    window.addEventListener('beforeunload', () => {
        if (isPrimaryTab) {
            tabCoordination?.postMessage({ type: 'RELEASE_PRIMARY', tabId: TAB_ID });
        }
    });
}

/**
 * Claim this tab as primary
 */
function claimPrimaryTab() {
    isPrimaryTab = true;
    tabCoordination?.postMessage({ type: 'CLAIM_PRIMARY', tabId: TAB_ID });
    console.log('[App] Claimed primary tab:', TAB_ID);
}

/**
 * Show warning that another tab is active
 */
function showMultiTabWarning() {
    const modal = document.getElementById('multi-tab-modal');
    if (modal) {
        modal.style.display = 'flex';
        const msgEl = modal.querySelector('.modal-message');
        if (msgEl) {
            msgEl.textContent =
                'Rhythm Chamber is open in another tab. ' +
                'This tab is now read-only to prevent data corruption. ' +
                'Close the other tab to regain full access here.';
        }
    } else {
        // Fallback if modal doesn't exist yet
        console.warn('[App] Multi-tab detected. This tab is read-only.');
    }
}

/**
 * Disable write operations in secondary tabs
 */
function disableWriteOperations() {
    // Disable file upload
    if (uploadZone) {
        uploadZone.style.pointerEvents = 'none';
        uploadZone.style.opacity = '0.5';
    }
    if (fileInput) fileInput.disabled = true;

    // Disable chat input
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');
    if (chatInput) {
        chatInput.disabled = true;
        chatInput.placeholder = 'Read-only mode (close other tab to enable)';
    }
    if (chatSend) chatSend.disabled = true;

    // Disable reset
    if (resetBtn) resetBtn.disabled = true;

    // Disable Spotify connect
    if (spotifyConnectBtn) spotifyConnectBtn.disabled = true;

    // Disable new chat button
    if (newChatBtn) newChatBtn.disabled = true;

    console.log('[App] Write operations disabled - secondary tab mode');
}


/**
 * Initialize the app
 */
async function init() {
    // Initialize cross-tab coordination first (prevents race conditions)
    initTabCoordination();

    await Storage.init();


    // HNW Fix: Validate storage consistency on startup
    const validation = await Storage.validateConsistency();
    if (!validation.valid) {
        console.warn('[App] Storage inconsistencies detected:', validation.warnings);
        // Auto-clear conversation if it exists without context
        if (validation.fixes.includes('clearConversation')) {
            sessionStorage.removeItem('rhythm_chamber_conversation');
            console.log('[App] Cleared orphaned conversation history');
        }
    }

    // Check for Spotify OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('code')) {
        await handleSpotifyCallback(urlParams.get('code'));
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }

    // Check if user cancelled OAuth
    if (urlParams.has('error')) {
        console.log('Spotify auth cancelled:', urlParams.get('error'));
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Check if user wants to initiate Spotify Quick Snapshot
    if (urlParams.get('mode') === 'spotify') {
        // Clean up URL first
        window.history.replaceState({}, document.title, window.location.pathname);
        // Auto-initiate Spotify connect if configured
        if (Spotify.isConfigured()) {
            setupEventListeners();
            setupSpotifyButton();
            handleSpotifyConnect();
            return;
        }
    }

    // Check for existing data
    const existingData = await Storage.getPersonality();
    if (existingData) {
        appState.personality = existingData;
        appState.streams = await Storage.getStreams();
        appState.chunks = await Storage.getChunks();

        if (appState.streams) {
            appState.patterns = Patterns.detectAllPatterns(appState.streams, appState.chunks);
            showReveal();
        }
    }

    setupEventListeners();
    setupSpotifyButton();

    // Initialize sidebar controller (uses AppState for state management)
    if (window.SidebarController) {
        await SidebarController.init();
    }
}

/**
 * Setup Spotify connect button state
 */
function setupSpotifyButton() {
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
    // File upload - but not on child elements
    uploadZone.addEventListener('click', (e) => {
        // Don't trigger file input if clicking on buttons or links
        if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.upload-alternatives')) {
            return;
        }
        fileInput.click();
    });
    uploadZone.addEventListener('dragover', handleDragOver);
    uploadZone.addEventListener('dragleave', handleDragLeave);
    uploadZone.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);

    // Spotify connect
    spotifyConnectBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        handleSpotifyConnect();
    });

    // Reset
    resetBtn.addEventListener('click', handleReset);

    // Reveal actions (full data)
    document.getElementById('explore-chat-btn')?.addEventListener('click', showChat);
    document.getElementById('share-card-btn')?.addEventListener('click', handleShare);

    // Lite reveal actions
    document.getElementById('lite-explore-chat-btn')?.addEventListener('click', showChat);
    document.getElementById('lite-share-card-btn')?.addEventListener('click', handleShare);
    document.getElementById('lite-upload-full-btn')?.addEventListener('click', () => {
        showUpload();
    });

    // Chat
    document.getElementById('chat-send')?.addEventListener('click', handleChatSend);
    document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleChatSend();
    });

    // Suggestion chips
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.getElementById('chat-input').value = chip.dataset.question;
            handleChatSend();
        });
    });
}

/**
 * Drag and drop handlers
 */
function handleDragOver(e) {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
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
    try {
        await Spotify.initiateLogin();
    } catch (error) {
        console.error('Spotify connect error:', error);
        alert(error.message);
    }
}

/**
 * Handle Spotify OAuth callback
 */
async function handleSpotifyCallback(code) {
    showProcessing();
    progressText.textContent = 'Connecting to Spotify...';

    try {
        // Exchange code for token
        await Spotify.handleCallback(code);

        // NEW: Start background token refresh for long operations
        Spotify.startBackgroundRefresh();

        // NEW: Validate session before fetching
        if (!await Spotify.ensureValidToken()) {
            showToast('Session expired. Reconnecting...');
            const refreshed = await Spotify.refreshToken();
            if (!refreshed) {
                throw new Error('Session expired. Please reconnect to Spotify.');
            }
        }

        // Fetch data from Spotify
        const spotifyData = await Spotify.fetchSnapshotData((message) => {
            progressText.textContent = message;
        });

        // Transform for analysis
        progressText.textContent = 'Analyzing your listening patterns...';
        await new Promise(r => setTimeout(r, 10));

        appState.liteData = Spotify.transformForAnalysis(spotifyData);

        // NEW: Show instant insight immediately
        progressText.textContent = 'Generating instant insight...';
        const instantInsight = Patterns.detectImmediateVibe(appState.liteData);

        // Update UI with instant insight
        progressText.innerHTML = `Quick snapshot ready!<br><br>${instantInsight}<br><br><small>Full analysis requires complete history for accurate personality detection</small>`;

        // Wait a moment for user to read
        await new Promise(r => setTimeout(r, 2000));

        // Detect patterns from lite data
        progressText.textContent = 'Detecting your current vibe...';
        await new Promise(r => setTimeout(r, 10));

        appState.litePatterns = Patterns.detectLitePatterns(appState.liteData);

        // Classify lite personality
        progressText.textContent = 'Classifying your music personality...';
        await new Promise(r => setTimeout(r, 10));

        appState.personality = Personality.classifyLitePersonality(appState.litePatterns);
        appState.personality.summary = appState.litePatterns.summary;
        appState.isLiteMode = true;

        // Show lite reveal
        showLiteReveal();

    } catch (error) {
        console.error('Spotify callback error:', error);
        progressText.textContent = `Error: ${error.message}`;
        setTimeout(() => showUpload(), 3000);
    }
}

// ==========================================
// File Upload Processing
// ==========================================

/**
 * Process uploaded file using Web Worker (non-blocking)
 */
async function processFile(file) {
    // HNW Hierarchy: Acquire operation lock before starting file processing
    let fileLockId = null;
    if (window.OperationLock) {
        try {
            fileLockId = await window.OperationLock.acquire('file_processing');
        } catch (lockError) {
            // Another conflicting operation is in progress
            showToast(`Cannot upload: ${lockError.message}`);
            return;
        }
    }

    showProcessing();
    appState.isLiteMode = false;

    // Store lock ID in appState to access in handlers
    appState._fileLockId = fileLockId;

    // NEW: Create abort controller for this parsing session
    if (workerAbortController) {
        workerAbortController.abort();
    }
    workerAbortController = new AbortController();

    // Terminate any existing worker
    if (activeWorker) {
        activeWorker.terminate();
        activeWorker = null;
    }

    // Use Web Worker for parsing (keeps UI responsive)
    activeWorker = new Worker('js/parser-worker.js');

    // Clear any previous partial saves before new parsing session
    Storage.clearStreams();

    activeWorker.onmessage = async (e) => {
        const { type, message, streams, chunks, stats, error, partialStreams, fileIndex, totalFiles, usage } = e.data;

        if (type === 'progress') {
            progressText.textContent = message;
        }

        if (type === 'error') {
            console.error('Worker error:', error);
            progressText.textContent = `Error: ${error}`;
            setTimeout(() => showUpload(), 3000);
            if (activeWorker) {
                activeWorker.terminate();
                activeWorker = null;
            }
        }

        // NEW: Handle memory warnings from worker
        if (type === 'memory_warning') {
            const usagePercent = Math.round(usage * 100);
            progressText.innerHTML = `Low on memory (${usagePercent}%) - pausing to avoid crash...`;
            console.warn(`[App] Memory warning: ${usagePercent}% usage`);
        }

        // NEW: Handle memory resumed
        if (type === 'memory_resumed') {
            progressText.textContent = 'Resuming processing...';
            console.log('[App] Memory usage normalized, resuming');
        }

        if (type === 'partial') {
            try {
                // Save partial streams incrementally (crash-safe)
                await Storage.appendStreams(partialStreams);
                progressText.textContent = `Parsing file ${fileIndex}/${totalFiles}... (${e.data.streamCount.toLocaleString()} streams)`;
            } catch (err) {
                console.warn('Failed to save partial streams:', err);
            }

            // HNW Wave: Send ACK back to worker for backpressure flow control
            if (e.data.ackId && activeWorker) {
                activeWorker.postMessage({ type: 'ack', ackId: e.data.ackId });
            }
        }

        if (type === 'complete') {
            try {
                appState.streams = streams;
                appState.chunks = chunks;

                // Pattern detection runs on main thread (fast enough)
                progressText.textContent = 'Detecting behavioral patterns...';
                await new Promise(r => setTimeout(r, 10)); // Let UI update

                appState.patterns = Patterns.detectAllPatterns(streams, chunks);

                // Classify personality
                progressText.textContent = 'Classifying personality...';
                await new Promise(r => setTimeout(r, 10));

                appState.personality = Personality.classifyPersonality(appState.patterns);
                appState.personality.summary = appState.patterns.summary;

                // Save final complete data to IndexedDB
                progressText.textContent = 'Saving...';
                await Storage.saveStreams(streams);
                await Storage.saveChunks(chunks);
                await Storage.savePersonality(appState.personality);

                showReveal();
            } catch (err) {
                console.error('Processing error:', err);
                progressText.textContent = `Error: ${err.message}`;
                setTimeout(() => showUpload(), 3000);
            }

            if (activeWorker) {
                activeWorker.terminate();
                activeWorker = null;
            }

            // Release operation lock
            if (appState._fileLockId && window.OperationLock) {
                window.OperationLock.release('file_processing', appState._fileLockId);
                appState._fileLockId = null;
            }
        }
    };

    activeWorker.onerror = (err) => {
        console.error('Worker error:', err);
        progressText.textContent = `Error: ${err.message}`;
        setTimeout(() => showUpload(), 3000);
        if (activeWorker) {
            activeWorker.terminate();
            activeWorker = null;
        }
        // Release operation lock on error
        if (appState._fileLockId && window.OperationLock) {
            window.OperationLock.release('file_processing', appState._fileLockId);
            appState._fileLockId = null;
        }
    };

    // NEW: Listen for abort signal
    workerAbortController.signal.addEventListener('abort', () => {
        if (activeWorker) {
            activeWorker.terminate();
            activeWorker = null;
            console.log('[App] Worker aborted via signal');
        }
        // Release operation lock on abort
        if (appState._fileLockId && window.OperationLock) {
            window.OperationLock.release('file_processing', appState._fileLockId);
            appState._fileLockId = null;
        }
    });

    // Start parsing
    activeWorker.postMessage({ type: 'parse', file });
}

// ==========================================
// View Transitions (Delegated to ViewController)
// ==========================================
// All view functions moved to js/controllers/view-controller.js
// Functions available globally: showUpload, showProcessing, showReveal, showLiteReveal, showChat

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

    // Hide suggestions after first message
    document.getElementById('chat-suggestions').style.display = 'none';

    // Get response
    await processMessageResponse((options) => Chat.sendMessage(message, options));
}

/**
 * Process the response from Chat module with progress updates
 */
async function processMessageResponse(actionFn) {
    // Create a temporary loading placeholder
    const loadingId = addLoadingMessage();

    const onProgress = (state) => {
        updateLoadingMessage(loadingId, state);
    };

    try {
        const response = await actionFn({ onProgress });
        const loadingEl = document.getElementById(loadingId);

        // Check if we were streaming (element has streaming content)
        const wasStreaming = loadingEl?.dataset?.streaming === 'true';

        if (wasStreaming) {
            // For streamed messages, finalize the existing element instead of replacing
            loadingEl.classList.remove('streaming');
            loadingEl.classList.add('assistant');
            loadingEl.removeAttribute('id'); // Remove temporary ID
            delete loadingEl.dataset.streaming;

            // Add message actions (regenerate, delete buttons)
            finalizeStreamedMessage(loadingEl, response.content);
        } else {
            // Non-streaming: remove loading and add full response
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
    // Parse markdown now that full content is available
    const contentEl = messageEl.querySelector('.streaming-content');
    if (contentEl && fullContent) {
        contentEl.innerHTML = parseMarkdown(fullContent);
        contentEl.classList.remove('streaming-content');
    }

    // Add actions container
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
    const el = document.getElementById(id);
    if (!el) return;

    if (state.type === 'tool_start') {
        el.className = 'message tool-execution';
        el.innerHTML = `<span class="icon">⚡</span> Analyzing data with ${state.tool}...`;
    } else if (state.type === 'tool_end') {
        // Transition back to thinking or stay until next event
    } else if (state.type === 'thinking') {
        // Reset to thinking indicator (for non-streaming or initial state)
        if (!el.dataset.streaming) {
            el.className = 'message assistant loading';
            el.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
        }
    } else if (state.type === 'token') {
        // Streaming token - append to message
        if (!el.dataset.streaming) {
            // First token - switch from loading to streaming mode
            el.dataset.streaming = 'true';
            el.className = 'message assistant streaming';
            el.innerHTML = '<div class="message-content streaming-content"></div>';
        }
        const contentEl = el.querySelector('.streaming-content');
        if (contentEl && state.token) {
            // Append token, escaping HTML
            const escaped = state.token
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');
            contentEl.innerHTML += escaped;
            // Scroll to show new content
            const messages = document.getElementById('chat-messages');
            if (messages) messages.scrollTop = messages.scrollHeight;
        }
    } else if (state.type === 'thinking' && state.content) {
        // Thinking block from reasoning model (DeepSeek R1, etc.)
        // Show in a collapsible thinking section
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
    const el = document.getElementById(id);
    if (el) el.remove();
}

/**
 * Simple markdown to HTML converter for chat messages
 */
function parseMarkdown(text) {
    if (!text) return '';
    return text
        // Escape HTML first
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        // Bold: **text** or __text__
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        // Italic: *text* or _text_
        .replace(/\*([^\*]+)\*/g, '<em>$1</em>')
        .replace(/_([^_]+)_/g, '<em>$1</em>')
        // Line breaks
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        // Wrap in paragraph
        .replace(/^(.+)$/, '<p>$1</p>');
}

/**
 * Add message to chat UI with actions
 */
function addMessage(text, role, isError = false) {
    const messages = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `message ${role} ${isError ? 'error' : ''}`;

    // Message index in history (approximate, for deletion/editing)
    // Accurate way would be to pass index, but appending assumes valid order for now.
    // We'll calculate index based on DOM position for simplicity in this MVP
    // or rely on the Chat module to handle logic if we pass the right signals.
    // Better: Rerender all messages? No, inefficient.
    // We will just append and attach handlers that look up their index dynamically.

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // Parse markdown for assistant messages, plain text for user
    if (role === 'assistant') {
        contentDiv.innerHTML = parseMarkdown(text);
    } else {
        contentDiv.textContent = text;
    }
    div.appendChild(contentDiv);

    // Actions Container
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';

    if (isError) {
        // Retry Button
        const retryBtn = document.createElement('button');
        retryBtn.className = 'retry-btn';
        retryBtn.textContent = 'Try Again';
        retryBtn.onclick = async () => {
            div.remove();
            await processMessageResponse((options) => Chat.regenerateLastResponse(options));
        };
        actionsDiv.appendChild(retryBtn);

        // Settings Button
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
        // Edit Button
        const editBtn = document.createElement('button');
        editBtn.className = 'action-btn edit';
        editBtn.innerHTML = '✎';
        editBtn.title = 'Edit';
        editBtn.onclick = () => enableEditMode(div, text);
        actionsDiv.appendChild(editBtn);
    } else {
        // Regenerate Button (Assistant only)
        // Only show if it matches the last message, or if it's an error
        // Note: For simplicity we add it, simpler logic might be to only show on hover
        const regenBtn = document.createElement('button');
        regenBtn.className = 'action-btn regenerate';
        regenBtn.innerHTML = '↻';
        regenBtn.title = 'Regenerate';
        regenBtn.onclick = async () => {
            // Remove this message from UI
            div.remove();
            // Call regenerate
            await processMessageResponse((options) => Chat.regenerateLastResponse(options));
        };
        actionsDiv.appendChild(regenBtn);
    }

    // Delete Button (Both)
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn delete';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Delete';
    deleteBtn.onclick = () => {
        // Find index
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

    // Hide standard actions
    actionsDiv.style.display = 'none';

    // Replace content with input
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

            // Remove this message and all after it from UI
            const allMessages = Array.from(messageDiv.parentElement.children);
            for (let i = index; i < allMessages.length; i++) {
                allMessages[i].remove();
            }

            // Re-add the updated user message to UI
            addMessage(newText, 'user');

            // Trigger edit in Chat module
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
    await Cards.shareCard(appState.personality);
}

// ==========================================
// Reset Handler
// ==========================================

/**
 * Show custom confirmation modal (replaces native confirm which was auto-dismissing)
 */
function showResetConfirmModal() {
    const modal = document.getElementById('reset-confirm-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function hideResetConfirmModal() {
    const modal = document.getElementById('reset-confirm-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * NEW: Wait for all workers to abort with timeout
 * This is the core of the safe reset flow
 */
async function $waitUntilAllWorkersAbort(abortController, timeoutMs) {
    const start = Date.now();

    // Send abort signal to worker
    if (activeWorker) {
        try {
            activeWorker.postMessage({ type: 'abort' });
        } catch (e) {
            // Worker may already be terminated
        }
    }

    // Wait for worker to acknowledge or timeout
    while (Date.now() - start < timeoutMs) {
        if (!activeWorker) {
            // Worker already terminated
            return true;
        }

        // Check if worker is still responding
        try {
            // If worker is still active after 100ms, it's not responding to abort
            await new Promise(resolve => setTimeout(resolve, 100));

            // If still active, force terminate
            if (activeWorker) {
                console.log('[App] Worker not responding to abort, forcing termination');
                activeWorker.terminate();
                activeWorker = null;
                return true;
            }
        } catch (e) {
            return true;
        }
    }

    // Timeout reached
    console.warn('[App] Worker abort timeout reached');
    if (activeWorker) {
        activeWorker.terminate();
        activeWorker = null;
    }
    return false;
}

async function executeReset() {
    hideResetConfirmModal();

    try {
        // Step 1: Stop background operations
        if (Spotify.stopBackgroundRefresh) {
            Spotify.stopBackgroundRefresh();
        }

        // Step 2: Cancel all pending operations with timeout
        progressText.textContent = 'Cancelling operations...';
        const abortController = new AbortController();
        await $waitUntilAllWorkersAbort(abortController, 30_000); // 30s max

        // Step 3: Clear ALL data across ALL backends (unified)
        progressText.textContent = 'Clearing data...';
        const result = await Storage.clearAllData();

        if (!result.success) {
            if (result.blockedBy) {
                showToast(`Cannot reset: ${result.blockedBy}`);
                showUpload();
                return;
            }
        }

        // Log results for debugging
        console.log('[App] clearAllData result:', result);

        // Show warning if Qdrant clear failed
        if (result.qdrant?.error) {
            console.warn('[App] Qdrant embeddings may not have been cleared:', result.qdrant.error);
        }

        // Step 4: Clear Spotify tokens (handled separately for security)
        Spotify.clearTokens();

        // Step 5: Reset app state (via centralized AppState)
        AppState.reset();

        Chat.clearHistory();

        console.log('[App] Reset complete');
        showUpload();
    } catch (error) {
        console.error('[App] Reset failed:', error);
        progressText.textContent = `Reset error: ${error.message}`;
        showUpload();
    } finally {
        // Cleanup
        if (workerAbortController) {
            workerAbortController.abort();
            workerAbortController = null;
        }
    }
}

function handleReset() {
    // HNW Hierarchy: Check if conflicting operation is in progress
    if (window.OperationLock) {
        const fileProcessing = window.OperationLock.isLocked('file_processing');
        const embedding = window.OperationLock.isLocked('embedding_generation');

        if (fileProcessing || embedding) {
            const blockedBy = fileProcessing ? 'file upload' : 'embedding generation';
            showToast(`Cannot reset while ${blockedBy} is in progress`);
            return;
        }
    }

    showResetConfirmModal();
}

// ==========================================
// Privacy Dashboard Functions
// ==========================================

function showToast(message, duration = 3000) {
    // Create toast element if it doesn't exist
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
    const modal = document.getElementById('privacy-dashboard-modal');
    if (!modal) return;

    // Get data summary
    const summary = await Storage.getDataSummary();

    // Update UI
    document.getElementById('raw-streams-count').textContent =
        summary.hasRawStreams ? `${summary.streamCount.toLocaleString()} streams (${summary.estimatedSizeMB}MB)` : 'None';

    document.getElementById('patterns-summary').textContent =
        summary.chunkCount > 0 ? `${summary.chunkCount} chunks, ${summary.chatSessionCount} chat sessions` : 'No patterns yet';

    // Check Spotify tokens
    const hasSpotifyToken = await Storage.getToken('spotify_access_token');
    document.getElementById('spotify-token-status').textContent =
        hasSpotifyToken ? 'Present (encrypted)' : 'Not stored';

    // Show modal
    modal.style.display = 'flex';
}

async function clearSensitiveData() {
    if (!confirm('Clear all raw streams? This keeps your personality analysis and chat history.')) {
        return;
    }

    await Storage.clearSensitiveData();
    alert('Raw data cleared. Your personality analysis and chat history are preserved.');
    showPrivacyDashboard(); // Refresh the dashboard
}

// Make modal functions available globally for onclick handlers
window.executeReset = executeReset;
window.hideResetConfirmModal = hideResetConfirmModal;
window.showPrivacyDashboard = showPrivacyDashboard;
window.clearSensitiveData = clearSensitiveData;

// ==========================================
// Sidebar (Delegated to SidebarController)
// ==========================================
// All sidebar functions moved to js/controllers/sidebar-controller.js

// Start
init();
