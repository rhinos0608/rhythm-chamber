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
    view: 'upload' // upload, processing, reveal, chat
};

// DOM Elements
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const processing = document.getElementById('processing');
const progressText = document.getElementById('progress-text');
const revealSection = document.getElementById('reveal-section');
const chatSection = document.getElementById('chat-section');
const resetBtn = document.getElementById('reset-btn');

/**
 * Initialize the app
 */
async function init() {
    await Storage.init();

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
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // File upload
    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('dragover', handleDragOver);
    uploadZone.addEventListener('dragleave', handleDragLeave);
    uploadZone.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);

    // Reset
    resetBtn.addEventListener('click', handleReset);

    // Reveal actions
    document.getElementById('explore-chat-btn')?.addEventListener('click', showChat);
    document.getElementById('share-card-btn')?.addEventListener('click', handleShare);

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
    if (file?.name.endsWith('.zip')) {
        processFile(file);
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) processFile(file);
}

/**
 * Process uploaded file using Web Worker (non-blocking)
 */
async function processFile(file) {
    showProcessing();

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

/**
 * View transitions
 */
function showUpload() {
    appState.view = 'upload';
    uploadZone.style.display = 'flex';
    processing.classList.remove('active');
    revealSection.classList.remove('active');
    chatSection.classList.remove('active');
    resetBtn.style.display = 'none';
}

function showProcessing() {
    appState.view = 'processing';
    uploadZone.style.display = 'none';
    processing.classList.add('active');
    revealSection.classList.remove('active');
    chatSection.classList.remove('active');
    resetBtn.style.display = 'none';
}

function showReveal() {
    appState.view = 'reveal';
    uploadZone.style.display = 'none';
    processing.classList.remove('active');
    revealSection.classList.add('active');
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

    // Init chat context
    Chat.initChat(p, appState.patterns, appState.patterns.summary);
}

function showChat() {
    appState.view = 'chat';
    uploadZone.style.display = 'none';
    processing.classList.remove('active');
    revealSection.classList.remove('active');
    chatSection.classList.add('active');
    resetBtn.style.display = 'block';

    document.getElementById('chat-personality-name').textContent = appState.personality.name;
}

/**
 * Chat handler
 */
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

function addMessage(text, role) {
    const messages = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}

/**
 * Share handler
 */
async function handleShare() {
    await Cards.shareCard(appState.personality);
}

/**
 * Reset handler
 */
async function handleReset() {
    if (confirm('Start over? Your data will be cleared.')) {
        await Storage.clear();
        appState = { streams: null, chunks: null, patterns: null, personality: null, view: 'upload' };
        Chat.clearHistory();
        showUpload();
    }
}

// Start
init();
