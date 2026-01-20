/**
 * Recovery Handlers Module
 *
 * Provides executable recovery actions for ErrorContext recovery paths.
 * Each handler corresponds to a recovery path string returned by ErrorContext.getRecoveryPath().
 *
 * HNW Note: This converts static recovery path strings into actionable functions,
 * closing the gap between error context creation and actual recovery.
 */

import { Spotify } from '../spotify.js';

const RecoveryHandlers = {
    /**
     * Reconnect to Spotify - clears tokens and initiates new OAuth flow
     */
    async reconnect_spotify() {
        console.log('[Recovery] Executing: reconnect_spotify');
        Spotify.clearTokens();
        await Spotify.initiateLogin();
    },

    /**
     * Refresh token - attempts silent refresh before falling back to reconnect
     */
    async refresh_token() {
        console.log('[Recovery] Executing: refresh_token');
        const success = await Spotify.refreshToken();
        if (!success) {
            console.log('[Recovery] Refresh failed, falling back to reconnect');
            await this.reconnect_spotify();
        }
    },

    /**
     * Wait and retry - delays for specified time before allowing retry
     * @param {object} details - Must contain waitSeconds
     */
    async wait_and_retry(details = {}) {
        const waitMs = (details.waitSeconds || 60) * 1000;
        console.log(`[Recovery] Executing: wait_and_retry (${waitMs}ms)`);
        await new Promise(r => setTimeout(r, waitMs));
    },

    /**
     * Wait or verify identity - for geographic lockouts
     * @param {object} details - Contains cooldownMinutes
     */
    async wait_or_verify_identity(details = {}) {
        const waitMs = (details.cooldownMinutes || 60) * 60 * 1000;
        console.log(`[Recovery] Geo lockout - waiting ${details.cooldownMinutes || 60} minutes`);
        // For now, just inform user - actual verification would require backend
        return {
            action: 'wait',
            waitMs,
            message: `Please wait ${details.cooldownMinutes || 60} minutes or try from a consistent location.`
        };
    },

    /**
     * Merge or restart - for checkpoint mismatches
     * Offers choice between merging with previous progress or starting fresh
     */
    async merge_or_restart(details = {}) {
        console.log('[Recovery] Executing: merge_or_restart');
        // Return options for UI to present
        return {
            options: [
                { id: 'merge', label: 'Merge with previous progress', action: 'merge' },
                { id: 'restart', label: 'Start fresh', action: 'restart' }
            ],
            selectedAction: null // UI should set this
        };
    },

    /**
     * Retry operation - generic retry for transient failures
     */
    async retry_operation(details = {}) {
        console.log('[Recovery] Executing: retry_operation');
        // This is a signal to the caller to retry
        return { shouldRetry: true };
    },

    /**
     * Use secure browser - for XSS detection
     */
    async use_secure_browser(details = {}) {
        console.log('[Recovery] Executing: use_secure_browser');
        // Provide guidance, no automated action possible
        return {
            action: 'user_action_required',
            message: 'Please ensure you are using HTTPS and not in an embedded frame. Try opening this app directly in a new tab.',
            canAutoRecover: false
        };
    },

    /**
     * Contact support - fallback for unknown errors
     */
    async contact_support(details = {}) {
        console.log('[Recovery] Executing: contact_support');
        return {
            action: 'user_action_required',
            message: 'An unexpected error occurred. Please try refreshing the page. If the issue persists, contact support.',
            canAutoRecover: false
        };
    },

    /**
     * Execute a recovery path by name
     * @param {string} recoveryPath - The recovery path string from ErrorContext
     * @param {object} details - Additional context for the recovery action
     * @returns {Promise<any>} Result of recovery action, or null if handler not found
     */
    async execute(recoveryPath, details = {}) {
        const handler = this[recoveryPath];
        if (handler && typeof handler === 'function') {
            try {
                return await handler.call(this, details);
            } catch (err) {
                console.error(`[Recovery] Handler '${recoveryPath}' failed:`, err);
                throw err;
            }
        }
        console.warn(`[Recovery] No handler for path: ${recoveryPath}`);
        return null;
    },

    /**
     * Check if a recovery path has an automated handler
     * @param {string} recoveryPath - The recovery path string
     * @returns {boolean} True if handler exists
     */
    hasHandler(recoveryPath) {
        return typeof this[recoveryPath] === 'function' && recoveryPath !== 'execute' && recoveryPath !== 'hasHandler';
    },

    /**
     * Get list of all available recovery paths
     * @returns {string[]} Array of recovery path names
     */
    getAvailablePaths() {
        return Object.keys(this).filter(key =>
            typeof this[key] === 'function' &&
            !['execute', 'hasHandler', 'getAvailablePaths'].includes(key)
        );
    }
};

// Export for ES Module consumers
export { RecoveryHandlers };

console.log('[RecoveryHandlers] Module loaded - available paths:', RecoveryHandlers.getAvailablePaths());

