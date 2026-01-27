/**
 * Session Constants
 *
 * Shared constants for session-related operations.
 * Centralizes validation rules and limits to prevent duplication.
 *
 * @module constants/session
 */

// Import MAX_SAVED_MESSAGES from limits to avoid duplication
import { LIMITS } from './limits.js';

/**
 * Session-related constants
 */
export const SESSION = Object.freeze({
    /**
     * Maximum number of messages saved per session
     * Messages beyond this limit are truncated when saving to disk
     * Imported from LIMITS to avoid duplication
     */
    MAX_SAVED_MESSAGES: LIMITS.MAX_SAVED_MESSAGES,

    /**
     * Maximum length for session IDs
     * Session IDs must be between 1 and 64 characters
     */
    MAX_ID_LENGTH: LIMITS.MAX_ID_LENGTH,

    /**
     * Session ID validation pattern
     * - Must start and end with alphanumeric character
     * - Can contain hyphens and underscores in between
     * - Case-insensitive (a-z, A-Z, 0-9)
     * - Must be at least 2 characters after pattern validation
     */
    ID_PATTERN: /^[a-z0-9][a-z0-9\-_]{0,62}[a-z0-9]$/i
});

export default SESSION;
