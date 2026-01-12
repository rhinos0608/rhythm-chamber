/**
 * Main Application Controller
 * Orchestrates the Rhythm Chamber flow
 */

// State
let appState = {
    streams: null,
    chunks: null,
    patterns: null,
    personality: null,
    liteData: null,      // Spotify API data
    litePatterns: null,  // Patterns from lite data
    isLiteMode: false,   // Quick Snapshot mode
    view: 'upload',      // upload, processing, reveal, lite-reveal, chat
    sidebarCollapsed: false  // Sidebar visibility state
};

let activeWorker = null; // Track active worker for cancellation

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

// Sidebar Elements
const chatSidebar = document.getElementById('chat-sidebar');
const sidebarSessions = document.getElementById('sidebar-sessions');
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
const sidebarCollapseBtn = document.getElementById('sidebar-collapse-btn');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const newChatBtn = document.getElementById('new-chat-btn');

const SIDEBAR_STATE_KEY = 'rhythm_chamber_sidebar_collapsed';

/**
 * Initialize the app
 */
async function init() {
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
    initSidebar();
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

        // Fetch data from Spotify
        const spotifyData = await Spotify.fetchSnapshotData((message) => {
            progressText.textContent = message;
        });

        // Transform for analysis
        progressText.textContent = 'Analyzing your listening patterns...';
        await new Promise(r => setTimeout(r, 10));

        appState.liteData = Spotify.transformForAnalysis(spotifyData);

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
    showProcessing();
    appState.isLiteMode = false;

    // Terminate any existing worker
    if (activeWorker) {
        activeWorker.terminate();
    }

    // Use Web Worker for parsing (keeps UI responsive)
    activeWorker = new Worker('js/parser-worker.js');

    // Clear any previous partial saves before new parsing session
    Storage.clearStreams();

    activeWorker.onmessage = async (e) => {
        const { type, message, streams, chunks, stats, error, partialStreams, fileIndex, totalFiles } = e.data;

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

        // Handle incremental saves from partial data
        if (type === 'partial') {
            try {
                // Save partial streams incrementally (crash-safe)
                await Storage.appendStreams(partialStreams);
                progressText.textContent = `Parsing file ${fileIndex}/${totalFiles}... (${e.data.streamCount.toLocaleString()} streams)`;
            } catch (err) {
                console.warn('Failed to save partial streams:', err);
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
    };

    // Start parsing
    activeWorker.postMessage({ type: 'parse', file });
}

// ==========================================
// View Transitions
// ==========================================

function showUpload() {
    appState.view = 'upload';
    uploadZone.style.display = 'flex';
    processing.classList.remove('active');
    revealSection.classList.remove('active');
    liteRevealSection?.classList.remove('active');
    chatSection.classList.remove('active');
    resetBtn.style.display = 'none';

    // Hide sidebar in non-chat views
    if (chatSidebar) {
        chatSidebar.classList.add('hidden');
    }
}

function showProcessing() {
    appState.view = 'processing';
    uploadZone.style.display = 'none';
    processing.classList.add('active');
    revealSection.classList.remove('active');
    liteRevealSection?.classList.remove('active');
    chatSection.classList.remove('active');
    resetBtn.style.display = 'none';
}

function showReveal() {
    if (!appState.personality) {
        console.warn('showReveal called without personality data');
        showUpload();
        return;
    }

    appState.view = 'reveal';
    uploadZone.style.display = 'none';
    processing.classList.remove('active');
    revealSection.classList.add('active');
    liteRevealSection?.classList.remove('active');
    chatSection.classList.remove('active');
    resetBtn.style.display = 'block';

    // Populate reveal
    const p = appState.personality;
    document.getElementById('personality-emoji').textContent = p.emoji;
    document.getElementById('personality-name').textContent = p.name;
    document.getElementById('personality-description').textContent = p.description;

    // Data Stats
    const streams = appState.streams || [];
    const summary = appState.patterns?.summary || {};
    document.getElementById('stream-count').textContent = streams.length.toLocaleString();

    if (summary.dateRange) {
        document.getElementById('date-range-start').textContent = summary.dateRange.start;
        document.getElementById('date-range-end').textContent = summary.dateRange.end;
    }

    // Evidence
    const evidenceItems = document.getElementById('evidence-items');
    evidenceItems.innerHTML = p.allEvidence.map(e => `<li>${e}</li>`).join('');

    // Score Breakdown (Detection Explainer)
    populateScoreBreakdown(p);

    // Init chat context with streams data for queries
    Chat.initChat(p, appState.patterns, appState.patterns.summary, appState.streams);
}

/**
 * Populate the "How did we detect this?" explainer
 */
function populateScoreBreakdown(personality) {
    const scoreBreakdown = document.getElementById('score-breakdown');
    const scoreTotal = document.getElementById('score-total');
    const explainer = document.getElementById('detection-explainer');

    if (!personality.breakdown || personality.breakdown.length === 0) {
        // Hide explainer if no breakdown available
        explainer.style.display = 'none';
        return;
    }

    explainer.style.display = '';

    // Use the pre-computed breakdown from personality module
    scoreBreakdown.innerHTML = personality.breakdown.map(item =>
        `<li class="${item.points > 0 ? 'score-positive' : 'score-zero'}">${item.label} (${item.points > 0 ? '+' + item.points : '0'} points)</li>`
    ).join('');

    // Calculate total from breakdown
    const totalPoints = personality.breakdown.reduce((sum, item) => sum + item.points, 0);
    scoreTotal.textContent = `Total: ${totalPoints} points → ${personality.name}`;
}

function showLiteReveal() {
    if (!appState.personality) {
        console.warn('showLiteReveal called without personality data');
        showUpload();
        return;
    }

    appState.view = 'lite-reveal';
    uploadZone.style.display = 'none';
    processing.classList.remove('active');
    revealSection.classList.remove('active');
    liteRevealSection.classList.add('active');
    chatSection.classList.remove('active');
    resetBtn.style.display = 'block';

    // Populate lite reveal
    const p = appState.personality;
    document.getElementById('lite-personality-emoji').textContent = p.emoji;
    document.getElementById('lite-personality-name').textContent = p.name;
    document.getElementById('lite-personality-description').textContent = p.description;

    // Genre tags
    const genreTags = document.getElementById('lite-genre-tags');
    const genres = appState.litePatterns?.summary?.topGenres || [];
    genreTags.innerHTML = genres.map(g => `<span class="genre-tag">${g}</span>`).join('');

    // Evidence
    const evidenceItems = document.getElementById('lite-evidence-items');
    evidenceItems.innerHTML = p.allEvidence.map(e => `<li>${e}</li>`).join('');

    // Init chat context with lite data (no streams for lite mode)
    Chat.initChat(p, appState.litePatterns, appState.litePatterns.summary, appState.liteData?.recentStreams || null);
}

function showChat() {
    if (!appState.personality) {
        showUpload();
        return;
    }

    appState.view = 'chat';
    uploadZone.style.display = 'none';
    processing.classList.remove('active');
    revealSection.classList.remove('active');
    liteRevealSection?.classList.remove('active');
    chatSection.classList.add('active');
    resetBtn.style.display = 'block';

    document.getElementById('chat-personality-name').textContent = appState.personality.name;

    // Show sidebar and render sessions
    if (chatSidebar) {
        chatSidebar.classList.remove('hidden');
        updateSidebarVisibility();
        renderSessionList();
    }
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

        // Remove loading message
        removeMessageElement(loadingId);

        // Add actual response
        if (response.status === 'error') {
            addMessage(response.content, 'assistant', true);
        } else {
            addMessage(response.content, 'assistant');
        }
    } catch (err) {
        removeMessageElement(loadingId);
        addMessage(`Error: ${err.message}`, 'assistant', true);
    }
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
        el.className = 'message assistant loading';
        el.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
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

async function executeReset() {
    hideResetConfirmModal();

    // HNW Fix: Enhanced worker termination with message queue drain
    // 1. Stop background refresh first (prevents new token operations)
    // 2. Mark worker as invalid so any in-flight messages are ignored  
    // 3. Send abort signal to worker (graceful shutdown)
    // 4. Wait for message queue drain
    // 5. Force terminate after drain window
    // 6. Clear storage and security state

    // Stop background token refresh if running
    if (Spotify.stopBackgroundRefresh) {
        Spotify.stopBackgroundRefresh();
    }

    if (activeWorker) {
        const workerRef = activeWorker;
        activeWorker = null; // Mark as invalid immediately

        // Nullify handlers first to prevent race with in-flight messages
        workerRef.onmessage = null;
        workerRef.onerror = null;

        // Send abort signal to worker (if supported)
        try {
            workerRef.postMessage({ type: 'abort' });
        } catch (e) {
            // Worker may already be terminated, ignore
        }

        // Wait for message queue drain (500ms is sufficient for most cases)
        await new Promise(resolve => setTimeout(resolve, 500));

        // Force terminate after drain window
        try {
            workerRef.terminate();
        } catch (e) {
            // Already terminated, ignore
        }
    }

    // Clear storage
    await Storage.clear();
    await Storage.clearAllSessions();  // Clear all chat sessions

    // Clear Spotify tokens and security bindings
    Spotify.clearTokens();

    // Clear any RAG checkpoints
    if (window.RAG?.clearCheckpoint) {
        window.RAG.clearCheckpoint();
    }

    // Reset app state
    appState = {
        streams: null,
        chunks: null,
        patterns: null,
        personality: null,
        liteData: null,
        litePatterns: null,
        isLiteMode: false,
        view: 'upload',
        sidebarCollapsed: appState.sidebarCollapsed  // Preserve sidebar state
    };

    Chat.clearHistory();
    localStorage.removeItem('rhythm_chamber_current_session');

    console.log('[App] Reset complete');
    showUpload();
}

function handleReset() {
    showResetConfirmModal();
}

// Make modal functions available globally for onclick handlers
window.executeReset = executeReset;
window.hideResetConfirmModal = hideResetConfirmModal;

// ==========================================
// Sidebar Controller
// ==========================================

/**
 * Initialize sidebar state and event listeners
 */
function initSidebar() {
    // Restore collapsed state
    const savedState = localStorage.getItem(SIDEBAR_STATE_KEY);
    appState.sidebarCollapsed = savedState === 'true';
    updateSidebarVisibility();

    // Setup event listeners
    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', toggleSidebar);
    }
    if (sidebarCollapseBtn) {
        sidebarCollapseBtn.addEventListener('click', toggleSidebar);
    }
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeSidebar);
    }
    if (newChatBtn) {
        newChatBtn.addEventListener('click', handleNewChat);
    }

    // Register for session updates
    if (Chat.onSessionUpdate) {
        Chat.onSessionUpdate(renderSessionList);
    }

    // Initial sidebar hidden (shown only in chat view)
    hideSidebarForNonChatViews();
}

/**
 * Hide sidebar when not in chat view
 */
function hideSidebarForNonChatViews() {
    if (chatSidebar && appState.view !== 'chat') {
        chatSidebar.classList.add('hidden');
    }
}

/**
 * Update sidebar visibility based on state
 */
function updateSidebarVisibility() {
    if (!chatSidebar) return;

    if (appState.sidebarCollapsed) {
        chatSidebar.classList.add('collapsed');
    } else {
        chatSidebar.classList.remove('collapsed');
    }

    // Mobile overlay
    if (sidebarOverlay) {
        if (!appState.sidebarCollapsed && window.innerWidth <= 768) {
            sidebarOverlay.classList.add('visible');
        } else {
            sidebarOverlay.classList.remove('visible');
        }
    }
}

/**
 * Toggle sidebar collapsed state
 */
function toggleSidebar() {
    appState.sidebarCollapsed = !appState.sidebarCollapsed;
    localStorage.setItem(SIDEBAR_STATE_KEY, appState.sidebarCollapsed.toString());
    updateSidebarVisibility();

    // Mobile: Toggle open class
    if (window.innerWidth <= 768) {
        if (appState.sidebarCollapsed) {
            chatSidebar.classList.remove('open');
        } else {
            chatSidebar.classList.add('open');
        }
    }
}

/**
 * Close sidebar (mobile)
 */
function closeSidebar() {
    appState.sidebarCollapsed = true;
    localStorage.setItem(SIDEBAR_STATE_KEY, 'true');
    updateSidebarVisibility();
    if (chatSidebar) {
        chatSidebar.classList.remove('open');
    }
}

/**
 * Render session list in sidebar
 */
async function renderSessionList() {
    if (!sidebarSessions) return;

    const sessions = await Chat.listSessions();
    const currentId = Chat.getCurrentSessionId();

    if (sessions.length === 0) {
        sidebarSessions.innerHTML = `
            <div class="sidebar-empty">
                <div class="emoji">💬</div>
                <p>No conversations yet.<br>Start a new chat!</p>
            </div>
        `;
        return;
    }

    sidebarSessions.innerHTML = sessions.map(session => {
        const isActive = session.id === currentId;
        const date = new Date(session.updatedAt || session.createdAt);
        const dateStr = formatRelativeDate(date);
        const emoji = session.metadata?.personalityEmoji || '🎵';

        return `
            <div class="session-item ${isActive ? 'active' : ''}" 
                 data-session-id="${session.id}"
                 onclick="handleSessionClick('${session.id}')">
                <div class="session-title">${escapeHtml(session.title || 'New Chat')}</div>
                <div class="session-meta">
                    <span class="emoji">${emoji}</span>
                    <span>${dateStr}</span>
                    <span>·</span>
                    <span>${session.messageCount || 0} msgs</span>
                </div>
                <div class="session-actions">
                    <button class="session-action-btn" 
                            onclick="event.stopPropagation(); handleSessionRename('${session.id}')"
                            title="Rename">✏️</button>
                    <button class="session-action-btn delete" 
                            onclick="event.stopPropagation(); handleSessionDelete('${session.id}')"
                            title="Delete">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Format date as relative string
 */
function formatRelativeDate(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Handle session click - switch to that session
 */
async function handleSessionClick(sessionId) {
    const currentId = Chat.getCurrentSessionId();
    if (sessionId === currentId) return;

    await Chat.switchSession(sessionId);

    // Re-render chat messages
    const messages = document.getElementById('chat-messages');
    if (messages) {
        messages.innerHTML = '';
        const history = Chat.getHistory();
        history.forEach(msg => {
            if (msg.role === 'user' || msg.role === 'assistant') {
                appendMessage(msg.role, msg.content);
            }
        });
    }

    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        closeSidebar();
    }
}

/**
 * Handle new chat button
 */
async function handleNewChat() {
    await Chat.createNewSession();

    // Clear chat messages
    const messages = document.getElementById('chat-messages');
    if (messages) {
        messages.innerHTML = '';
    }

    // Show suggestions
    const suggestions = document.getElementById('chat-suggestions');
    if (suggestions) {
        suggestions.style.display = 'flex';
    }

    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        closeSidebar();
    }
}

// Track which session is pending deletion
let pendingDeleteSessionId = null;

/**
 * Handle session delete - show confirmation modal
 */
function handleSessionDelete(sessionId) {
    pendingDeleteSessionId = sessionId;
    const modal = document.getElementById('delete-chat-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

/**
 * Hide delete chat confirmation modal
 */
function hideDeleteChatModal() {
    pendingDeleteSessionId = null;
    const modal = document.getElementById('delete-chat-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Confirm and execute the delete
 */
async function confirmDeleteChat() {
    if (!pendingDeleteSessionId) return;

    const sessionId = pendingDeleteSessionId;
    hideDeleteChatModal();

    await Chat.deleteSessionById(sessionId);

    // If we deleted the current session, clear messages
    const messages = document.getElementById('chat-messages');
    if (messages) {
        messages.innerHTML = '';
    }
}

/**
 * Handle session rename
 */
async function handleSessionRename(sessionId) {
    const sessionEl = document.querySelector(`[data-session-id="${sessionId}"]`);
    if (!sessionEl) return;

    const titleEl = sessionEl.querySelector('.session-title');
    const currentTitle = titleEl.textContent;

    // Replace with input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'session-title-input';
    input.value = currentTitle;
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    // Save on blur or enter
    const saveTitle = async () => {
        const newTitle = input.value.trim() || 'New Chat';
        await Chat.renameSession(sessionId, newTitle);
    };

    input.addEventListener('blur', saveTitle);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            input.blur();
        } else if (e.key === 'Escape') {
            input.value = currentTitle;
            input.blur();
        }
    });
}

/**
 * Append a message to chat (helper for session switching)
 */
function appendMessage(role, content) {
    const messages = document.getElementById('chat-messages');
    if (!messages) return;

    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = `<div class="message-content">${typeof marked !== 'undefined' ? marked.parse(content) : content}</div>`;
    messages.appendChild(div);
}

// Make sidebar handlers available globally
window.handleSessionClick = handleSessionClick;
window.handleSessionDelete = handleSessionDelete;
window.handleSessionRename = handleSessionRename;
window.hideDeleteChatModal = hideDeleteChatModal;
window.confirmDeleteChat = confirmDeleteChat;

// Start
init();
