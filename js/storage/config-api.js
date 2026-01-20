/**
 * Config API Module
 * 
 * Unified configuration storage API for the application.
 * Provides key-value storage with IndexedDB backend and localStorage fallback.
 * 
 * @module storage/config-api
 */

// ==========================================
// Config API
// ==========================================

/**
 * Get a config value from unified storage
 * @param {string} key - The config key
 * @param {*} defaultValue - Default if not found
 * @returns {Promise<*>} The stored value or default
 */
async function getConfig(key, defaultValue = null) {
    try {
        // Try IndexedDBCore if available
        if (window.IndexedDBCore) {
            const result = await window.IndexedDBCore.get(
                window.IndexedDBCore.STORES.CONFIG,
                key
            );
            if (result) {
                return result.value;
            }
        }

        // Fall back to localStorage
        const stored = localStorage.getItem(key);
        if (stored !== null) {
            try {
                return JSON.parse(stored);
            } catch {
                return stored;
            }
        }

        return defaultValue;
    } catch (err) {
        console.warn(`[ConfigAPI] Error getting config '${key}':`, err);
        return defaultValue;
    }
}

/**
 * Set a config value in unified storage
 * @param {string} key - The config key
 * @param {*} value - The value to store
 * @returns {Promise<void>}
 */
async function setConfig(key, value) {
    try {
        // Try IndexedDBCore if available
        if (window.IndexedDBCore) {
            await window.IndexedDBCore.put(window.IndexedDBCore.STORES.CONFIG, {
                key,
                value,
                updatedAt: new Date().toISOString()
            });
            return;
        }

        // Fall back to localStorage
        localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
        console.warn(`[ConfigAPI] Error setting config '${key}':`, err);
        // Try localStorage as last resort
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.error(`[ConfigAPI] Failed to set config '${key}':`, e);
        }
    }
}

/**
 * Remove a config value from unified storage
 * @param {string} key - The config key to remove
 * @returns {Promise<void>}
 */
async function removeConfig(key) {
    try {
        // Try IndexedDBCore if available
        if (window.IndexedDBCore) {
            await window.IndexedDBCore.delete(window.IndexedDBCore.STORES.CONFIG, key);
        }

        // Also clean from localStorage
        localStorage.removeItem(key);
    } catch (err) {
        console.warn(`[ConfigAPI] Error removing config '${key}':`, err);
        localStorage.removeItem(key);
    }
}

/**
 * Get all config values
 * @returns {Promise<Object>} All config as key-value pairs
 */
async function getAllConfig() {
    try {
        if (window.IndexedDBCore) {
            const records = await window.IndexedDBCore.getAll(
                window.IndexedDBCore.STORES.CONFIG
            );
            const config = {};
            for (const record of records) {
                config[record.key] = record.value;
            }
            return config;
        }
        return {};
    } catch (err) {
        console.warn('[ConfigAPI] Error getting all config:', err);
        return {};
    }
}

// ==========================================
// Token API (Secure Storage)
// ==========================================

/**
 * Get a token from secure token storage
 * @param {string} key - Token key (e.g., 'spotify_access_token')
 * @returns {Promise<*>} The token value or null
 */
async function getToken(key) {
    try {
        if (window.SecureTokenStore?.isAvailable?.()) {
            return await window.SecureTokenStore.retrieve(key);
        }
        if (window.SecureTokenStore) {
            console.warn(`[ConfigAPI] SecureTokenStore unavailable; token access blocked for '${key}'.`);
            return null;
        }

        if (window.IndexedDBCore) {
            const result = await window.IndexedDBCore.get(
                window.IndexedDBCore.STORES.TOKENS,
                key
            );
            return result ? result.value : null;
        }

        // Legacy fallback for environments without SecureTokenStore
        return localStorage.getItem(key);
    } catch (err) {
        console.warn(`[ConfigAPI] Error getting token '${key}':`, err);
        return null;
    }
}

/**
 * Set a token in secure token storage
 * @param {string} key - Token key
 * @param {*} value - Token value
 * @returns {Promise<void>}
 */
async function setToken(key, value) {
    try {
        if (window.SecureTokenStore?.isAvailable?.()) {
            const stored = await window.SecureTokenStore.store(key, value, {
                metadata: { source: 'config_api' }
            });
            if (!stored) {
                throw new Error('SecureTokenStore refused token write');
            }
            return;
        }
        if (window.SecureTokenStore) {
            console.warn(`[ConfigAPI] SecureTokenStore unavailable; token write blocked for '${key}'.`);
            return;
        }

        if (window.IndexedDBCore) {
            await window.IndexedDBCore.put(window.IndexedDBCore.STORES.TOKENS, {
                key,
                value,
                updatedAt: new Date().toISOString()
            });
            return;
        }

        // Legacy fallback for environments without SecureTokenStore
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    } catch (err) {
        console.warn(`[ConfigAPI] Error setting token '${key}':`, err);
    }
}

/**
 * Remove a token from storage
 * @param {string} key - Token key
 * @returns {Promise<void>}
 */
async function removeToken(key) {
    try {
        if (window.SecureTokenStore?.isAvailable?.()) {
            await window.SecureTokenStore.invalidate(key);
        }
        if (!window.SecureTokenStore && window.IndexedDBCore) {
            await window.IndexedDBCore.delete(window.IndexedDBCore.STORES.TOKENS, key);
        }
        localStorage.removeItem(key);
    } catch (err) {
        console.warn(`[ConfigAPI] Error removing token '${key}':`, err);
        localStorage.removeItem(key);
    }
}

/**
 * Clear all tokens
 * @returns {Promise<void>}
 */
async function clearAllTokens() {
    try {
        if (window.SecureTokenStore?.isAvailable?.()) {
            await window.SecureTokenStore.invalidateAllTokens('config_api_clear');
        }

        if (!window.SecureTokenStore && window.IndexedDBCore) {
            await window.IndexedDBCore.clear(window.IndexedDBCore.STORES.TOKENS);
        }

        // Clear known token keys from localStorage (legacy cleanup)
        ['spotify_access_token', 'spotify_token_expiry', 'spotify_refresh_token'].forEach(key => {
            localStorage.removeItem(key);
        });
    } catch (err) {
        console.warn('[ConfigAPI] Error clearing tokens:', err);
    }
}

// ==========================================
// Public API
// ==========================================

export const ConfigAPI = {
    // Config operations
    getConfig,
    setConfig,
    removeConfig,
    getAllConfig,

    // Token operations
    getToken,
    setToken,
    removeToken,
    clearAllTokens
};

// Keep window global for backwards compatibility during migration
if (typeof window !== 'undefined') {
    window.ConfigAPI = ConfigAPI;
}

console.log('[ConfigAPI] Unified config API loaded');
