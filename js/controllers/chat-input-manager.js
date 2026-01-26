/**
 * Chat Input Manager
 *
 * Handles input validation and focus management for the chat UI.
 * Manages input field operations and suggestions panel.
 *
 * @module controllers/chat-input-manager
 */

// ==========================================
// Constants
// ==========================================

const CHAT_UI_INPUT_ID = 'chat-input';
const CHAT_UI_SUGGESTIONS_ID = 'chat-suggestions';
const CHAT_UI_MESSAGE_CONTAINER_ID = 'chat-messages';

// Edge case: Maximum message length to prevent performance issues
const MAX_MESSAGE_LENGTH = 50000; // 50K characters

// SECURITY: Whitelist of valid tool names to prevent XSS
const VALID_TOOL_NAMES = [
    'DataQuery',
    'PatternAnalyzer',
    'PersonalityClassifier',
    'StreamProcessor'
];

// ==========================================
// Validation & Security
// ==========================================

/**
 * Validate tool name against whitelist
 * @param {string} toolName - Tool name to validate
 * @returns {boolean} True if tool name is valid
 */
function isValidToolName(toolName) {
    if (typeof toolName !== 'string') return false;
    return VALID_TOOL_NAMES.includes(toolName);
}

// ==========================================
// Input Handling
// ==========================================

/**
 * Get the current input value
 * Edge case: Trims and validates length
 * @returns {string}
 */
function getInputValue() {
    const input = document.getElementById(CHAT_UI_INPUT_ID);
    const value = input?.value?.trim() || '';
    // Edge case: Enforce maximum message length
    // Use Array.from to properly handle Unicode surrogate pairs (emojis, rare CJK chars)
    // which prevents splitting multi-byte characters during truncation
    if (value.length > MAX_MESSAGE_LENGTH) {
        console.warn(`[ChatInputManager] Message exceeds ${MAX_MESSAGE_LENGTH} characters, truncating`);
        const chars = Array.from(value);
        if (chars.length > MAX_MESSAGE_LENGTH) {
            return chars.slice(0, MAX_MESSAGE_LENGTH).join('');
        }
    }
    return value;
}

/**
 * Clear the input
 */
function clearInput() {
    const input = document.getElementById(CHAT_UI_INPUT_ID);
    if (input) input.value = '';
}

/**
 * Hide the suggestions panel
 */
function hideSuggestions() {
    const suggestions = document.getElementById(CHAT_UI_SUGGESTIONS_ID);
    if (suggestions) suggestions.style.display = 'none';
}

/**
 * Clear all messages from the chat
 */
function clearMessages() {
    const messages = document.getElementById(CHAT_UI_MESSAGE_CONTAINER_ID);
    if (messages) {
        // SAFE: Static HTML with no user input
        messages.innerHTML = '<div class="message assistant">What would you like to explore about your listening patterns?</div>';
    }

    // Show suggestions again
    const suggestions = document.getElementById(CHAT_UI_SUGGESTIONS_ID);
    if (suggestions) suggestions.style.display = '';
}

// ==========================================
// Public API
// ==========================================

export const ChatInputManager = {
    getInputValue,
    clearInput,
    hideSuggestions,
    clearMessages,
    isValidToolName,
    MAX_MESSAGE_LENGTH
};

console.log('[ChatInputManager] Module loaded');
