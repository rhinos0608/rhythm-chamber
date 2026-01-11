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
    view: 'upload' // upload, processing, reveal, lite-reveal, chat
};

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

/**
 * Initialize the app
 */
async function init() {
    await Storage.init();

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

    // Use Web Worker for parsing (keeps UI responsive)
    const worker = new Worker('js/parser-worker.js');

    worker.onmessage = async (e) => {
        const { type, message, streams, chunks, stats, error } = e.data;

        if (type === 'progress') {
            progressText.textContent = message;
        }

        if (type === 'error') {
            console.error('Worker error:', error);
            progressText.textContent = `Error: ${error}`;
            setTimeout(() => showUpload(), 3000);
            worker.terminate();
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

                // Save to IndexedDB
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

            worker.terminate();
        }
    };

    worker.onerror = (err) => {
        console.error('Worker error:', err);
        progressText.textContent = `Error: ${err.message}`;
        setTimeout(() => showUpload(), 3000);
        worker.terminate();
    };

    // Start parsing
    worker.postMessage({ type: 'parse', file });
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

    // Evidence
    const evidenceItems = document.getElementById('evidence-items');
    evidenceItems.innerHTML = p.allEvidence.map(e => `<li>${e}</li>`).join('');

    // Init chat context with streams data for queries
    Chat.initChat(p, appState.patterns, appState.patterns.summary, appState.streams);
}

function showLiteReveal() {
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
    appState.view = 'chat';
    uploadZone.style.display = 'none';
    processing.classList.remove('active');
    revealSection.classList.remove('active');
    liteRevealSection?.classList.remove('active');
    chatSection.classList.add('active');
    resetBtn.style.display = 'block';

    document.getElementById('chat-personality-name').textContent = appState.personality.name;
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
    const response = await Chat.sendMessage(message);
    addMessage(response, 'assistant');
}

/**
 * Simple markdown to HTML converter for chat messages
 */
function parseMarkdown(text) {
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

function addMessage(text, role) {
    const messages = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `message ${role}`;

    // Parse markdown for assistant messages, plain text for user
    if (role === 'assistant') {
        div.innerHTML = parseMarkdown(text);
    } else {
        div.textContent = text;
    }

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
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

async function handleReset() {
    if (confirm('Start over? Your data will be cleared.')) {
        await Storage.clear();
        Spotify.clearTokens();
        appState = {
            streams: null,
            chunks: null,
            patterns: null,
            personality: null,
            liteData: null,
            litePatterns: null,
            isLiteMode: false,
            view: 'upload'
        };
        Chat.clearHistory();
        showUpload();
    }
}

// Start
init();

