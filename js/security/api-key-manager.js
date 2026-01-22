/**
 * API Key Manager for Rhythm Chamber
 *
 * SECURITY: Manages user-provided OpenRouter API keys with localStorage persistence.
 *
 * This module addresses CRITICAL security issue #1 from the security audit:
 * - Removes hard-coded API keys from source code
 * - Allows users to provide their own keys at runtime
 * - Stores keys securely in localStorage (browser-local only)
 * - Provides validation and management functions
 *
 * @module security/api-key-manager
 */

// Storage key for the OpenRouter API key
const OPENROUTER_KEY_STORAGE = 'rhythm_chamber_openrouter_key';

// Legacy config key (for migration)
const LEGACY_CONFIG_KEY = 'rhythm_chamber_legacy_api_key';

/**
 * API Key Manager
 * Provides functions for managing the user's OpenRouter API key
 */
const ApiKeyManager = {
    /**
     * Get the current OpenRouter API key
     * Priority: localStorage > legacy config migration > null
     *
     * @returns {string|null} The API key or null if not set
     */
    getApiKey() {
        // 1. Check localStorage for user-provided key
        const storedKey = localStorage.getItem(OPENROUTER_KEY_STORAGE);
        if (storedKey && storedKey.trim()) {
            const trimmedKey = storedKey.trim();
            // Don't return placeholder values
            if (!this._isPlaceholder(trimmedKey)) {
                return trimmedKey;
            }
        }

        // 2. Check for legacy migration key
        const legacyKey = localStorage.getItem(LEGACY_CONFIG_KEY);
        if (legacyKey && legacyKey.trim() && !this._isPlaceholder(legacyKey.trim())) {
            // Migrate to new storage location
            this.saveApiKey(legacyKey.trim());
            localStorage.removeItem(LEGACY_CONFIG_KEY);
            console.warn('[ApiKeyManager] Migrated legacy API key to new storage location');
            return legacyKey.trim();
        }

        // 3. Check Config object for backward compatibility during transition
        // This allows existing setups to continue working
        if (typeof Config !== 'undefined' && Config.openrouter && Config.openrouter.apiKey) {
            const configKey = Config.openrouter.apiKey;
            // Skip placeholder or empty values
            if (configKey && !this._isPlaceholder(configKey)) {
                // One-time migration to localStorage
                console.warn('[ApiKeyManager] Found API key in Config - migrating to localStorage');
                this.saveApiKey(configKey);
                return configKey;
            }
        }

        return null;
    },

    /**
     * Save a user-provided OpenRouter API key to localStorage
     *
     * SECURITY: The key is stored in localStorage which is:
     * - Accessible only from the same origin (domain)
     * - Not sent to servers automatically (unlike cookies)
     * - Accessible via browser DevTools (user-side storage limitation)
     * - Cleared when user clears browser data
     *
     * @param {string} apiKey - The API key to save
     * @returns {boolean} True if saved successfully, false otherwise
     */
    saveApiKey(apiKey) {
        if (!apiKey || typeof apiKey !== 'string') {
            console.error('[ApiKeyManager] Invalid API key provided');
            return false;
        }

        const trimmedKey = apiKey.trim();

        if (!trimmedKey) {
            console.error('[ApiKeyManager] Empty API key provided');
            return false;
        }

        // Check for placeholder values
        if (this._isPlaceholder(trimmedKey)) {
            console.error('[ApiKeyManager] Cannot save placeholder API key');
            return false;
        }

        // Basic format validation - OpenRouter keys start with 'sk-or-v1-'
        if (!trimmedKey.startsWith('sk-or-v1-')) {
            console.warn('[ApiKeyManager] API key format may be invalid. OpenRouter keys typically start with "sk-or-v1-"');
            // Still save it - user may have a different format
        }

        try {
            localStorage.setItem(OPENROUTER_KEY_STORAGE, trimmedKey);
            return true;
        } catch (error) {
            console.error('[ApiKeyManager] Failed to save API key:', error);
            return false;
        }
    },

    /**
     * Clear the stored API key from localStorage
     *
     * @returns {boolean} True if cleared successfully
     */
    clearApiKey() {
        try {
            localStorage.removeItem(OPENROUTER_KEY_STORAGE);
            console.log('[ApiKeyManager] API key cleared');
            return true;
        } catch (error) {
            console.error('[ApiKeyManager] Failed to clear API key:', error);
            return false;
        }
    },

    /**
     * Check if a valid API key is available
     *
     * @returns {boolean} True if a valid key exists
     */
    hasValidKey() {
        const key = this.getApiKey();
        if (!key) return false;

        // Basic validation: OpenRouter keys are typically > 40 chars
        return key.length > 40;
    },

    /**
     * Get a masked version of the key for UI display
     * Shows only the last 8 characters
     *
     * @returns {string} Masked key like 'sk-or-v1-...x9y2z4a6'
     */
    getMaskedKey() {
        const key = this.getApiKey();
        if (!key) return null;

        if (key.length > 12) {
            return key.substring(0, 9) + '...' + key.slice(-8);
        }
        return '...'.repeat(3);
    },

    /**
     * Validate the format of an OpenRouter API key
     *
     * @param {string} key - The API key to validate
     * @returns {object} Validation result with {valid, reason}
     */
    validateKeyFormat(key) {
        if (!key || typeof key !== 'string') {
            return { valid: false, reason: 'Key is required' };
        }

        const trimmedKey = key.trim();

        if (!trimmedKey) {
            return { valid: false, reason: 'Key cannot be empty' };
        }

        if (this._isPlaceholder(trimmedKey)) {
            return { valid: false, reason: 'Please replace the placeholder with your actual API key' };
        }

        if (trimmedKey.length < 40) {
            return { valid: false, reason: 'API key appears too short' };
        }

        if (!trimmedKey.startsWith('sk-or-v1-')) {
            return { valid: false, reason: 'OpenRouter keys typically start with "sk-or-v1-"' };
        }

        return { valid: true };
    },

    /**
     * Check if a key value is a placeholder that should be rejected
     *
     * @private
     * @param {string} key - The key to check
     * @returns {boolean} True if the key is a placeholder
     */
    _isPlaceholder(key) {
        const placeholders = [
            'your-api-key-here',
            'your-openrouter-api-key',
            'YOUR_API_KEY_HERE',
            'YOUR_OPENROUTER_API_KEY',
            'enter-your-api-key',
            'replace-with-your-key',
            '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' // The old hardcoded key
        ];

        const lowerKey = key.toLowerCase();
        return placeholders.some(placeholder => lowerKey.includes(placeholder.toLowerCase()));
    }
};

// Export the manager
export { ApiKeyManager };
