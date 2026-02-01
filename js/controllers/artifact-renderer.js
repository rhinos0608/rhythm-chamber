/**
 * Artifact Renderer
 *
 * Handles artifact validation and rendering in the chat UI.
 * Manages artifact extraction, validation, and display.
 *
 * @module controllers/artifact-renderer
 */

import { Artifacts } from '../artifacts/index.js';

// ==========================================
// Constants
// ==========================================

const CHAT_UI_MESSAGE_CONTAINER_ID = 'chat-messages';

// ==========================================
// Artifact Rendering
// ==========================================

/**
 * Check if a function result contains an artifact
 * @param {Object} result - Function execution result
 * @returns {boolean}
 */
function hasArtifact(result) {
    return Artifacts.hasArtifact(result);
}

/**
 * Extract artifact from function result
 * @param {Object} result - Function execution result
 * @returns {Object|null} The artifact spec or null
 */
function extractArtifact(result) {
    return Artifacts.extractArtifact(result);
}

/**
 * Render an artifact inline in the chat
 * @param {Object} artifact - Validated artifact spec
 * @param {HTMLElement} parentEl - Parent element to append to
 * @returns {HTMLElement|null} The rendered artifact card or null on error
 */
function renderArtifact(artifact, parentEl) {
    if (!artifact) return null;

    try {
        // Validate the artifact spec
        const validation = Artifacts.validate(artifact);
        if (!validation.valid) {
            console.warn('[ArtifactRenderer] Invalid artifact spec:', validation.errors);
            return null;
        }

        // Render to DOM element
        const artifactCard = Artifacts.render(validation.sanitized);
        if (!artifactCard) {
            console.warn('[ArtifactRenderer] Failed to render artifact');
            return null;
        }

        // Append to parent
        if (parentEl) {
            parentEl.appendChild(artifactCard);

            // Scroll to show the artifact
            const messages = document.getElementById(CHAT_UI_MESSAGE_CONTAINER_ID);
            if (messages) messages.scrollTop = messages.scrollHeight;
        }

        return artifactCard;
    } catch (err) {
        console.error('[ArtifactRenderer] Error rendering artifact:', err);
        return null;
    }
}

/**
 * Add an artifact to the most recent assistant message, or create a new one
 * @param {Object} artifact - Artifact spec from function result
 * @returns {HTMLElement|null} The rendered artifact card
 */
function addArtifactToChat(artifact) {
    const messages = document.getElementById(CHAT_UI_MESSAGE_CONTAINER_ID);
    if (!messages) return null;

    // Find the most recent assistant message (excluding loading)
    const assistantMessages = messages.querySelectorAll('.message.assistant:not(.loading)');
    const lastMessage = assistantMessages[assistantMessages.length - 1];

    if (lastMessage) {
        // Append artifact to existing message
        return renderArtifact(artifact, lastMessage);
    } else {
        // Create new message container for the artifact
        const div = document.createElement('div');
        div.className = 'message assistant artifact-only';
        messages.appendChild(div);
        return renderArtifact(artifact, div);
    }
}

/**
 * Process a function result and render any artifacts it contains
 * Called after a function call completes
 * @param {Object} result - Function execution result with optional artifact
 * @returns {{ hasArtifact: boolean, element: HTMLElement|null }}
 */
function processArtifactResult(result) {
    if (!Artifacts.hasArtifact(result)) {
        return { hasArtifact: false, element: null };
    }

    const artifact = Artifacts.extractArtifact(result);
    if (!artifact) {
        return { hasArtifact: true, element: null };
    }

    const element = addArtifactToChat(artifact);
    return { hasArtifact: true, element };
}

// ==========================================
// Public API
// ==========================================

export const ArtifactRenderer = {
    hasArtifact,
    extractArtifact,
    renderArtifact,
    addArtifactToChat,
    processArtifactResult,
};

console.log('[ArtifactRenderer] Module loaded');
