/**
 * Chat UI Controller
 *
 * Orchestrates chat message display, streaming, and user interactions.
 * Refactored into focused modules for better maintainability.
 *
 * @module controllers/chat-ui-controller
 */

import { MessageRenderer } from './message-renderer.js';
import { StreamingMessageHandler } from './streaming-message-handler.js';
import { MessageActions } from './message-actions.js';
import { ArtifactRenderer } from './artifact-renderer.js';
import { ChatInputManager } from './chat-input-manager.js';

// ==========================================
// Controller Initialization
// ==========================================

/**
 * Initialize ChatUIController with dependencies
 * @param {Object} dependencies - Injected dependencies
 * @param {Object} dependencies.AppState - Application state manager
 * @param {Object} dependencies.Storage - Storage service
 * @param {Object} dependencies.ViewController - View controller
 * @param {Function} dependencies.showToast - Toast notification function
 */
function init(dependencies) {
    // ChatUIController is a facade that re-exports functionality from specialized modules
    // The init method is called by the container but doesn't need to do anything
    // since the underlying modules are self-contained
    console.log('[ChatUIController] Initialized (facade mode)');
}

// ==========================================
// Public API
// ==========================================

// ES Module export - maintains backward compatibility
export const ChatUIController = {
    // Initialization
    init,

    // Message rendering
    parseMarkdown: MessageRenderer.parseMarkdown,
    createMessageElement: MessageRenderer.createMessageElement,
    addMessage: MessageRenderer.addMessage,

    // Loading & streaming
    addLoadingMessage: StreamingMessageHandler.addLoadingMessage,
    updateLoadingMessage: StreamingMessageHandler.updateLoadingMessage,
    removeMessageElement: StreamingMessageHandler.removeMessageElement,
    finalizeStreamedMessage: StreamingMessageHandler.finalizeStreamedMessage,

    // SSE sequence validation
    processSequencedChunk: StreamingMessageHandler.processSequencedChunk,
    resetSequenceBuffer: StreamingMessageHandler.resetSequenceBuffer,
    getSequenceBufferStatus: StreamingMessageHandler.getSequenceBufferStatus,

    // Input handling
    getInputValue: ChatInputManager.getInputValue,
    clearInput: ChatInputManager.clearInput,
    hideSuggestions: ChatInputManager.hideSuggestions,
    clearMessages: ChatInputManager.clearMessages,

    // Edit mode
    enableEditMode: MessageActions.enableEditMode,
    restoreFocusToChatInput: MessageActions.restoreFocusToChatInput,

    // Artifact rendering
    hasArtifact: ArtifactRenderer.hasArtifact,
    extractArtifact: ArtifactRenderer.extractArtifact,
    renderArtifact: ArtifactRenderer.renderArtifact,
    addArtifactToChat: ArtifactRenderer.addArtifactToChat,
    processArtifactResult: ArtifactRenderer.processArtifactResult,
};

console.log('[ChatUIController] Controller loaded (refactored into modules)');
