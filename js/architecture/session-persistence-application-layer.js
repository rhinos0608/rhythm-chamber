/**
 * Session Persistence Application Logic Layer
 *
 * This layer defines HOW to coordinate session data operations.
 * It orchestrates business logic and data transformation but contains
 * no direct storage API calls (IndexedDB, localStorage, etc.).
 *
 * Layer: Application Logic (HOW)
 * Responsibilities:
 * - Sequence data filtering and transformation
 * - Orchestrate business rules
 * - Prepare data for infrastructure layer
 * - Transform data between layers
 *
 * @module architecture/session-persistence-application-layer
 */

// ==========================================
// Constants
// ==========================================

/**
 * Default title for sessions without user messages
 */
export const DEFAULT_SESSION_TITLE = 'New Chat';

/**
 * Maximum title length for session display
 */
export const MAX_TITLE_LENGTH = 50;

/**
 * Maximum messages to save per session
 */
export const MAX_SAVED_MESSAGES = 100;

// ==========================================
// Message Filtering
// ==========================================

/**
 * Filter messages for storage according to business rules
 *
 * Business Rules:
 * - Always preserve system messages
 * - Limit total messages to maxSaved
 * - Keep most recent non-system messages when truncating
 *
 * This is a pure function - no side effects, no storage calls
 *
 * @param {Array<{role: string, content: any}>} messages - Messages to filter
 * @param {number} [maxSaved=MAX_SAVED_MESSAGES] - Maximum messages to save
 * @returns {Array<{role: string, content: any}>} Filtered messages
 */
export function filterMessagesForStorage(messages, maxSaved = MAX_SAVED_MESSAGES) {
    if (!messages || !Array.isArray(messages)) {
        return [];
    }

    if (messages.length <= maxSaved) {
        return [...messages]; // Return copy to prevent mutations
    }

    // Separate system and non-system messages
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // Calculate how many non-system messages we can keep
    const availableSlots = maxSaved - systemMessages.length;

    // If system messages exceed max, keep only system messages
    if (availableSlots <= 0) {
        return [...systemMessages.slice(0, maxSaved)];
    }

    // Keep most recent non-system messages
    const recentNonSystem = nonSystemMessages.slice(-availableSlots);

    // Combine: all system + most recent non-system
    return [...systemMessages, ...recentNonSystem];
}

// ==========================================
// Title Generation
// ==========================================

/**
 * Generate a session title from messages
 *
 * Business Rules:
 * - Use first user message content as title
 * - Truncate to MAX_TITLE_LENGTH if too long
 * - Default to "New Chat" if no user messages
 * - Skip empty or whitespace-only messages
 *
 * This is a pure function - no side effects, no storage calls
 *
 * @param {Array<{role: string, content: any}>} messages - Session messages
 * @param {string} [existingTitle] - Existing title to use if provided
 * @returns {string} Generated or existing title
 */
export function generateSessionTitle(messages, existingTitle) {
    // Use existing title if provided
    if (existingTitle && typeof existingTitle === 'string' && existingTitle.trim().length > 0) {
        return existingTitle;
    }

    if (!messages || !Array.isArray(messages)) {
        return DEFAULT_SESSION_TITLE;
    }

    // Find first user message with content
    const firstUserMsg = messages.find(m => {
        if (m.role !== 'user') return false;
        if (!m.content) return false;
        if (typeof m.content !== 'string') return false;
        return m.content.trim().length > 0;
    });

    if (!firstUserMsg) {
        return DEFAULT_SESSION_TITLE;
    }

    // Truncate and add ellipsis if needed
    const content = firstUserMsg.content.trim();
    const chars = Array.from(content);

    if (chars.length <= MAX_TITLE_LENGTH) {
        return chars.join('');
    }

    return chars.slice(0, MAX_TITLE_LENGTH).join('') + '...';
}

// ==========================================
// Metadata Building
// ==========================================

/**
 * Build session metadata from session data
 *
 * Business Rules:
 * - Extract personality info for display
 * - Track lite mode status
 * - Provide defaults for missing data
 *
 * This is a pure function - no side effects, no storage calls
 *
 * @param {Object} sessionData - Session data object
 * @param {Object} [sessionData.personality] - Personality data
 * @param {boolean} [sessionData.isLiteMode] - Lite mode flag
 * @returns {{personalityName: string, personalityEmoji: string, isLiteMode: boolean}}
 */
export function buildSessionMetadata(sessionData = {}) {
    const personality = sessionData.personality || {};

    return {
        personalityName: personality.name || 'Unknown',
        personalityEmoji: personality.emoji || '🎵',
        isLiteMode: Boolean(sessionData.isLiteMode)
    };
}

// ==========================================
// Session Preparation
// ==========================================

/**
 * Prepare session data for saving to storage
 *
 * Orchestrates all application-level transformations:
 * 1. Filters messages according to business rules
 * 2. Generates or preserves title
 * 3. Builds metadata
 * 4. Returns storage-ready object
 *
 * This is a pure function - no side effects, no storage calls
 * The returned object is ready for the infrastructure layer to persist.
 *
 * @param {Object} sessionData - Raw session data
 * @param {string} sessionData.id - Session ID
 * @param {string} [sessionData.createdAt] - Session creation timestamp
 * @param {Array} sessionData.messages - Session messages
 * @param {Object} [sessionData.personality] - Personality data
 * @param {boolean} [sessionData.isLiteMode] - Lite mode flag
 * @param {string} [sessionData.title] - Optional existing title
 * @param {number} [maxSaved=MAX_SAVED_MESSAGES] - Max messages to save
 * @returns {{id: string, title: string, createdAt: string|null, messages: Array, metadata: Object}}
 */
export function prepareSessionForSave(sessionData, maxSaved = MAX_SAVED_MESSAGES) {
    if (!sessionData) {
        return {
            id: null,
            title: DEFAULT_SESSION_TITLE,
            createdAt: null,
            messages: [],
            metadata: buildSessionMetadata()
        };
    }

    // Filter messages according to business rules
    const messages = filterMessagesForStorage(sessionData.messages, maxSaved);

    // Generate or use existing title
    const title = generateSessionTitle(messages, sessionData.title);

    // Build metadata
    const metadata = buildSessionMetadata(sessionData);

    return {
        id: sessionData.id || null,
        title,
        createdAt: sessionData.createdAt || null,
        messages,
        metadata
    };
}

// ==========================================
// Export
// ==========================================

export default {
    DEFAULT_SESSION_TITLE,
    MAX_TITLE_LENGTH,
    MAX_SAVED_MESSAGES,
    filterMessagesForStorage,
    generateSessionTitle,
    buildSessionMetadata,
    prepareSessionForSave
};
