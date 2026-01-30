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

// AbortController for cancelling pending AI description requests (RACE CONDITION FIX)
let descriptionAbortController = null;
// Edge case: Pending request flag to prevent concurrent AI description requests (RACE CONDITION FIX)
let descriptionRequestPending = false;

// Unsubscribe function for AppState subscription
let unsubscribeAppState = null;

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

    // Subscribe to AppState changes for reset button visibility
    if (!unsubscribeAppState) {
        unsubscribeAppState = AppState.subscribe((state, changedDomains) => {
            // Only respond to ui domain changes
            if (changedDomains.includes('ui')) {
                const resetButtonVisible = state.ui.resetButton?.visible || false;
                const el = initElements();
                if (el.resetBtn) {
                    el.resetBtn.style.display = resetButtonVisible ? 'block' : 'none';
                }
            }
        });
    }

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
 * @returns {void}
 */
function showUpload() {
    const el = initElements();

    AppState.setView('upload');
    AppState.setResetButton(false);

    if (el.uploadZone) el.uploadZone.style.display = 'flex';
    if (el.processing) el.processing.classList.remove('active');
    if (el.revealSection) el.revealSection.classList.remove('active');
    if (el.liteRevealSection) el.liteRevealSection.classList.remove('active');
    if (el.chatSection) el.chatSection.classList.remove('active');

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
    AppState.setResetButton(false);

    if (el.uploadZone) el.uploadZone.style.display = 'none';
    if (el.processing) el.processing.classList.add('active');
    if (el.revealSection) el.revealSection.classList.remove('active');
    if (el.liteRevealSection) el.liteRevealSection.classList.remove('active');
    if (el.chatSection) el.chatSection.classList.remove('active');

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

    // Null check already present, no changes needed
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
    AppState.setResetButton(true);

    if (el.uploadZone) el.uploadZone.style.display = 'none';
    if (el.processing) el.processing.classList.remove('active');
    if (el.revealSection) el.revealSection.classList.add('active');
    if (el.liteRevealSection) el.liteRevealSection.classList.remove('active');
    if (el.chatSection) el.chatSection.classList.remove('active');

    // Populate reveal content
    const personalityEmojiEl = document.getElementById('personality-emoji');
    const personalityNameEl = document.getElementById('personality-name');
    if (personalityEmojiEl) personalityEmojiEl.textContent = personality.emoji;
    if (personalityNameEl) personalityNameEl.textContent = personality.name;

    const descriptionEl = document.getElementById('personality-description');
    const summary = patterns?.summary || {};

    // Check if AI description should be generated
    const canGenerateAI = ProfileDescriptionGenerator?.checkLLMAvailability?.()?.available;

    if (canGenerateAI && descriptionEl) {
        // Show loading state for description
        // SAFE: Static HTML literal with no user input
        descriptionEl.innerHTML = '<span class="ai-description-loading">✨ Crafting your personalized description...</span>';
        descriptionEl.classList.add('generating');

        // Generate AI description async with error handling
        generateAIDescription(personality, patterns, summary, descriptionEl)
            .catch(err => {
                // Catch any errors that occur before internal try/catch
                console.error('[ViewController] Critical error in AI description background task:', err);
                // Clean up UI state
                if (descriptionEl) {
                    descriptionEl.classList.remove('generating');
                    descriptionEl.textContent = personality?.description || 'Description unavailable';
                }
            });
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
    // Edge case: Guard against concurrent requests (RACE CONDITION FIX)
    // Between abort() and creating a new AbortController, there's a microtask window.
    // This flag ensures we never have two requests in flight simultaneously.
    if (descriptionRequestPending) {
        console.log('[ViewController] AI description request already in flight, ignoring duplicate call');
        return;
    }
    descriptionRequestPending = true;

    // Cancel any pending description request (RACE CONDITION FIX with AbortController)
    if (descriptionAbortController) {
        descriptionAbortController.abort();
    }

    // Create new AbortController for this request
    descriptionAbortController = new AbortController();
    const signal = descriptionAbortController.signal;

    // Create/increment generation ID as additional race condition protection
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

        // Check if request was aborted (RACE CONDITION FIX)
        if (signal.aborted) {
            console.log('[ViewController] AI description request was aborted - newer request in progress');
            return;
        }

        // Only update if this is still the current generation (double protection)
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
        // Check if error is due to abort (RACE CONDITION FIX)
        if (error.name === 'AbortError' || signal.aborted) {
            console.log('[ViewController] AI description request aborted - skipping');
            return;
        }

        console.error('[ViewController] AI description generation failed:', error);
        // Only fallback if this is still the current generation
        if (descriptionEl._generationId === currentGenerationId) {
            descriptionEl.textContent = personality.description;
            descriptionEl.classList.remove('generating');
        }
    } finally {
        // Clear abort controller if this is still the current request
        if (descriptionEl._generationId === currentGenerationId) {
            descriptionAbortController = null;
        }
        // Always reset the pending flag to allow new requests (RACE CONDITION FIX)
        descriptionRequestPending = false;
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
    AppState.setResetButton(true);

    if (el.uploadZone) el.uploadZone.style.display = 'none';
    if (el.processing) el.processing.classList.remove('active');
    if (el.revealSection) el.revealSection.classList.remove('active');
    if (el.liteRevealSection) el.liteRevealSection.classList.add('active');
    if (el.chatSection) el.chatSection.classList.remove('active');

    // Populate lite reveal content
    const litePersonalityEmojiEl = document.getElementById('lite-personality-emoji');
    const litePersonalityNameEl = document.getElementById('lite-personality-name');
    const litePersonalityDescEl = document.getElementById('lite-personality-description');
    if (litePersonalityEmojiEl) litePersonalityEmojiEl.textContent = personality.emoji;
    if (litePersonalityNameEl) litePersonalityNameEl.textContent = personality.name;
    if (litePersonalityDescEl) litePersonalityDescEl.textContent = personality.description;

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
    AppState.setResetButton(true);

    if (el.uploadZone) el.uploadZone.style.display = 'none';
    if (el.processing) el.processing.classList.remove('active');
    if (el.revealSection) el.revealSection.classList.remove('active');
    if (el.liteRevealSection) el.liteRevealSection.classList.remove('active');
    if (el.chatSection) el.chatSection.classList.add('active');

    const chatPersonalityName = document.getElementById('chat-personality-name');
    if (chatPersonalityName) {
        chatPersonalityName.textContent = personality.name;
    }

    // Show sidebar and render sessions via SidebarController
    if (el.chatSidebar) {
        el.chatSidebar.classList.remove('hidden');

        if (SidebarController) {
            // Get appState reference for sidebar
            const appStateRef = AppState.get();
            SidebarController.updateVisibility(appStateRef);
            SidebarController.renderSessionList();
        }
    }
}

// ==========================================
// Public API
// ==========================================
// Cleanup
// ==========================================

/**
 * Clean up resources (abort pending requests, clear references)
 * Call when destroying the view or during page unload
 */
function destroy() {
    // Abort any pending AI description requests
    if (descriptionAbortController) {
        descriptionAbortController.abort();
        descriptionAbortController = null;
    }
    // Reset pending request flag (RACE CONDITION FIX)
    descriptionRequestPending = false;
    // Unsubscribe from AppState changes
    if (unsubscribeAppState) {
        unsubscribeAppState();
        unsubscribeAppState = null;
    }
    // Clear element cache
    _elements = null;
}

// ==========================================

// ES Module export
export const ViewController = {
    showUpload,
    showProcessing,
    showReveal,
    showLiteReveal,
    showChat,
    updateProgress,
    populateScoreBreakdown,
    destroy
};


console.log('[ViewController] Module loaded');
