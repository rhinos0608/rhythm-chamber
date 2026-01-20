/**
 * View Controller
 *
 * Manages view transitions and DOM updates for different application states.
 * Uses AppState for state management.
 *
 * @module ViewController
 */

import { Chat } from '../chat.js';
import { ProfileDescriptionGenerator } from '../services/profile-description-generator.js';
import { AppState } from '../state/app-state.js';
import { SidebarController } from './sidebar-controller.js';

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

/**
 * Render a list of items into a container element safely.
 * @param {HTMLElement} container
 * @param {Array} items
 * @param {Function} renderItem - Receives item, returns an element
 */
function renderList(container, items, renderItem) {
    container.innerHTML = '';
    if (!Array.isArray(items)) return;
    items.forEach(item => {
        const el = renderItem(item);
        if (el) container.appendChild(el);
    });
}

/**
 * Render pill-style tags safely.
 * @param {HTMLElement} container
 * @param {Array<string>} tags
 */
function renderTags(container, tags) {
    container.innerHTML = '';
    if (!Array.isArray(tags)) return;
    tags.forEach(tag => {
        const span = document.createElement('span');
        span.className = 'genre-tag';
        span.textContent = tag;
        container.appendChild(span);
    });
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
    // Use getActiveData to transparently support both demo and normal modes
    const activeData = AppState.getActiveData();
    const personality = activeData.personality;
    const patterns = activeData.patterns ?? AppState.get()?.data?.patterns;
    const streams = activeData.streams;

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

    const descriptionEl = document.getElementById('personality-description');
    const summary = patterns?.summary || {};

    // Check if AI description should be generated
    const canGenerateAI = ProfileDescriptionGenerator?.checkLLMAvailability?.()?.available;

    if (canGenerateAI && descriptionEl) {
        // Show loading state for description
        descriptionEl.innerHTML = '<span class="ai-description-loading">✨ Crafting your personalized description...</span>';
        descriptionEl.classList.add('generating');

        // Generate AI description async
        generateAIDescription(personality, patterns, summary, descriptionEl);
    } else {
        // Use generic description
        if (descriptionEl) {
            descriptionEl.textContent = personality.description;
        }
    }

    // Data Stats - with highlight class for visual emphasis
    const streamCount = streams?.length || 0;
    const streamCountEl = document.getElementById('stream-count');
    if (streamCountEl) {
        streamCountEl.textContent = streamCount.toLocaleString();
        streamCountEl.classList.add('stat-highlight');
    }

    if (summary.dateRange) {
        const startEl = document.getElementById('date-range-start');
        const endEl = document.getElementById('date-range-end');
        if (startEl) {
            startEl.textContent = summary.dateRange.start;
            startEl.classList.add('stat-highlight');
        }
        if (endEl) {
            endEl.textContent = summary.dateRange.end;
            endEl.classList.add('stat-highlight');
        }
    }

    // Evidence
    const evidenceItems = document.getElementById('evidence-items');
    if (evidenceItems && personality.allEvidence) {
        renderList(evidenceItems, personality.allEvidence, (text) => {
            const li = document.createElement('li');
            li.textContent = text;
            return li;
        });
    }

    // Score Breakdown
    populateScoreBreakdown(personality);

    // Init chat context with streams data for queries
    if (Chat?.initChat) {
        Chat.initChat(personality, patterns, summary, streams);
    }
}

/**
 * Generate AI description async and update the element
 * @param {Object} personality - Personality data
 * @param {Object} patterns - Patterns data
 * @param {Object} summary - Summary data
 * @param {HTMLElement} descriptionEl - Element to update
 */
async function generateAIDescription(personality, patterns, summary, descriptionEl) {
    // Create/increment generation ID to prevent race conditions
    if (!descriptionEl._generationId) {
        descriptionEl._generationId = 0;
    }
    const currentGenerationId = ++descriptionEl._generationId;

    try {
        const aiDescription = await ProfileDescriptionGenerator.generateDescription(
            personality,
            patterns,
            summary
        );

        // Only update if this is still the current generation
        if (descriptionEl._generationId !== currentGenerationId) {
            console.log('[ViewController] Skipping outdated AI description generation');
            return;
        }

        if (aiDescription) {
            descriptionEl.textContent = aiDescription;
            descriptionEl.classList.remove('generating');
            descriptionEl.classList.add('ai-generated');
            console.log('[ViewController] AI description generated successfully');
        } else {
            // Fallback to generic
            descriptionEl.textContent = personality.description;
            descriptionEl.classList.remove('generating');
        }
    } catch (error) {
        console.error('[ViewController] AI description generation failed:', error);
        // Only fallback if this is still the current generation
        if (descriptionEl._generationId === currentGenerationId) {
            descriptionEl.textContent = personality.description;
            descriptionEl.classList.remove('generating');
        }
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
        renderList(scoreBreakdown, personality.breakdown, (item) => {
            const li = document.createElement('li');
            li.className = item.points > 0 ? 'score-positive' : 'score-zero';
            li.textContent = `${item.label} (${item.points > 0 ? '+' + item.points : '0'} points)`;
            return li;
        });
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
        renderTags(genreTags, genres);
    }

    // Evidence
    const evidenceItems = document.getElementById('lite-evidence-items');
    if (evidenceItems && personality.allEvidence) {
        renderList(evidenceItems, personality.allEvidence, (text) => {
            const li = document.createElement('li');
            li.textContent = text;
            return li;
        });
    }

    // Init chat context
    if (Chat?.initChat) {
        Chat.initChat(personality, litePatterns, litePatterns?.summary, liteData?.recentStreams || null);
    }
}

/**
 * Show chat view
 */
function showChat() {
    const el = initElements();
    // Use getActiveData to transparently support both demo and normal modes
    const activeData = AppState.getActiveData();
    const personality = activeData.personality;

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

        if (SidebarController) {
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

// ES Module export
export const ViewController = {
    showUpload,
    showProcessing,
    showReveal,
    showLiteReveal,
    showChat,
    updateProgress,
    populateScoreBreakdown
};


console.log('[ViewController] Module loaded');
