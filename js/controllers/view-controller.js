/**
 * View Controller
 * 
 * Manages view transitions and DOM updates for different application states.
 * Uses AppState for state management.
 * 
 * @module ViewController
 */

// ==========================================
// DOM Element References
// ==========================================

let _elements = null;

/**
 * Initialize DOM element references
 * Called once on first use
 */
function initElements() {
    if (_elements) return _elements;

    _elements = {
        uploadZone: document.getElementById('upload-zone'),
        processing: document.getElementById('processing'),
        progressText: document.getElementById('progress-text'),
        revealSection: document.getElementById('reveal-section'),
        liteRevealSection: document.getElementById('lite-reveal-section'),
        chatSection: document.getElementById('chat-section'),
        resetBtn: document.getElementById('reset-btn'),
        chatSidebar: document.getElementById('chat-sidebar')
    };

    return _elements;
}

// ==========================================
// View Transition Functions
// ==========================================

/**
 * Show upload view
 */
function showUpload() {
    const el = initElements();

    AppState.setView('upload');

    el.uploadZone.style.display = 'flex';
    el.processing.classList.remove('active');
    el.revealSection.classList.remove('active');
    el.liteRevealSection?.classList.remove('active');
    el.chatSection.classList.remove('active');
    el.resetBtn.style.display = 'none';

    // Hide sidebar in non-chat views
    if (el.chatSidebar) {
        el.chatSidebar.classList.add('hidden');
    }
}

/**
 * Show processing view
 * @param {string} [message] - Optional progress message
 */
function showProcessing(message = 'Processing...') {
    const el = initElements();

    AppState.setView('processing');
    AppState.setProcessing(true, message);

    el.uploadZone.style.display = 'none';
    el.processing.classList.add('active');
    el.revealSection.classList.remove('active');
    el.liteRevealSection?.classList.remove('active');
    el.chatSection.classList.remove('active');
    el.resetBtn.style.display = 'none';

    if (el.progressText) {
        el.progressText.textContent = message;
    }
}

/**
 * Update progress message during processing
 * @param {string} message - Progress message
 * @param {number} [progress] - Optional progress percentage (0-100)
 */
function updateProgress(message, progress = 0) {
    const el = initElements();

    AppState.setProcessing(true, message, progress);

    if (el.progressText) {
        el.progressText.textContent = message;
    }
}

/**
 * Show personality reveal view (full data mode)
 */
function showReveal() {
    const el = initElements();
    const state = AppState.get();
    const personality = state.data.personality;
    const patterns = state.data.patterns;
    const streams = state.data.streams;

    if (!personality) {
        console.warn('[ViewController] showReveal called without personality data');
        showUpload();
        return;
    }

    AppState.setView('reveal');
    AppState.setProcessing(false);

    el.uploadZone.style.display = 'none';
    el.processing.classList.remove('active');
    el.revealSection.classList.add('active');
    el.liteRevealSection?.classList.remove('active');
    el.chatSection.classList.remove('active');
    el.resetBtn.style.display = 'block';

    // Populate reveal content
    document.getElementById('personality-emoji').textContent = personality.emoji;
    document.getElementById('personality-name').textContent = personality.name;
    document.getElementById('personality-description').textContent = personality.description;

    // Data Stats
    const streamCount = streams?.length || 0;
    const summary = patterns?.summary || {};
    document.getElementById('stream-count').textContent = streamCount.toLocaleString();

    if (summary.dateRange) {
        document.getElementById('date-range-start').textContent = summary.dateRange.start;
        document.getElementById('date-range-end').textContent = summary.dateRange.end;
    }

    // Evidence
    const evidenceItems = document.getElementById('evidence-items');
    if (evidenceItems && personality.allEvidence) {
        evidenceItems.innerHTML = personality.allEvidence.map(e => `<li>${e}</li>`).join('');
    }

    // Score Breakdown
    populateScoreBreakdown(personality);

    // Init chat context with streams data for queries
    if (window.Chat?.initChat) {
        window.Chat.initChat(personality, patterns, summary, streams);
    }
}

/**
 * Populate the "How did we detect this?" explainer
 * @param {Object} personality - Personality data
 */
function populateScoreBreakdown(personality) {
    const scoreBreakdown = document.getElementById('score-breakdown');
    const scoreTotal = document.getElementById('score-total');
    const explainer = document.getElementById('detection-explainer');

    if (!explainer) return;

    if (!personality.breakdown || personality.breakdown.length === 0) {
        explainer.style.display = 'none';
        return;
    }

    explainer.style.display = '';

    if (scoreBreakdown) {
        scoreBreakdown.innerHTML = personality.breakdown.map(item =>
            `<li class="${item.points > 0 ? 'score-positive' : 'score-zero'}">${item.label} (${item.points > 0 ? '+' + item.points : '0'} points)</li>`
        ).join('');
    }

    if (scoreTotal) {
        const totalPoints = personality.breakdown.reduce((sum, item) => sum + item.points, 0);
        scoreTotal.textContent = `Total: ${totalPoints} points → ${personality.name}`;
    }
}

/**
 * Show lite reveal view (Spotify quick snapshot mode)
 */
function showLiteReveal() {
    const el = initElements();
    const state = AppState.get();
    const personality = state.data.personality;
    const liteData = state.lite.liteData;
    const litePatterns = state.lite.litePatterns;

    if (!personality) {
        console.warn('[ViewController] showLiteReveal called without personality data');
        showUpload();
        return;
    }

    AppState.setView('lite-reveal');
    AppState.setProcessing(false);

    el.uploadZone.style.display = 'none';
    el.processing.classList.remove('active');
    el.revealSection.classList.remove('active');
    el.liteRevealSection?.classList.add('active');
    el.chatSection.classList.remove('active');
    el.resetBtn.style.display = 'block';

    // Populate lite reveal content
    document.getElementById('lite-personality-emoji').textContent = personality.emoji;
    document.getElementById('lite-personality-name').textContent = personality.name;
    document.getElementById('lite-personality-description').textContent = personality.description;

    // Genre tags
    const genreTags = document.getElementById('lite-genre-tags');
    const genres = litePatterns?.summary?.topGenres || [];
    if (genreTags) {
        genreTags.innerHTML = genres.map(g => `<span class="genre-tag">${g}</span>`).join('');
    }

    // Evidence
    const evidenceItems = document.getElementById('lite-evidence-items');
    if (evidenceItems && personality.allEvidence) {
        evidenceItems.innerHTML = personality.allEvidence.map(e => `<li>${e}</li>`).join('');
    }

    // Init chat context
    if (window.Chat?.initChat) {
        window.Chat.initChat(personality, litePatterns, litePatterns?.summary, liteData?.recentStreams || null);
    }
}

/**
 * Show chat view
 */
function showChat() {
    const el = initElements();
    const state = AppState.get();
    const personality = state.data.personality;

    if (!personality) {
        showUpload();
        return;
    }

    AppState.setView('chat');

    el.uploadZone.style.display = 'none';
    el.processing.classList.remove('active');
    el.revealSection.classList.remove('active');
    el.liteRevealSection?.classList.remove('active');
    el.chatSection.classList.add('active');
    el.resetBtn.style.display = 'block';

    const chatPersonalityName = document.getElementById('chat-personality-name');
    if (chatPersonalityName) {
        chatPersonalityName.textContent = personality.name;
    }

    // Show sidebar and render sessions via SidebarController
    if (el.chatSidebar) {
        el.chatSidebar.classList.remove('hidden');

        if (window.SidebarController) {
            // Get appState reference for sidebar (backward compatibility)
            const appStateRef = window.appState || AppState.get();
            SidebarController.updateVisibility(appStateRef);
            SidebarController.renderSessionList();
        }
    }
}

// ==========================================
// Public API
// ==========================================

window.ViewController = {
    showUpload,
    showProcessing,
    showReveal,
    showLiteReveal,
    showChat,
    updateProgress,
    populateScoreBreakdown
};

// Backward compatibility: expose as global functions for existing code
window.showUpload = showUpload;
window.showProcessing = showProcessing;
window.showReveal = showReveal;
window.showLiteReveal = showLiteReveal;
window.showChat = showChat;
