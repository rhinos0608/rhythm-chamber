/**
 * Configuration Loader Service
 * 
 * Loads configuration from JSON file with retry logic, validation, and fallback defaults.
 * Replaces the fragile <script src="config.js"> pattern with a resilient async loader.
 * 
 * Features:
 * - Fetch with exponential backoff retry (3 attempts)
 * - Inline critical defaults for app functionality
 * - LocalStorage caching for offline resilience
 * - Config validation against required fields
 * - Event emission on config load/failure for UI awareness
 * 
 * @module services/config-loader
 */

// ==========================================
// Default Configuration (Critical Fallbacks)
// ==========================================

/**
 * Critical defaults that allow the app to function even if config loading fails.
 * These are the absolute minimum settings needed for a degraded but usable experience.
 */
const CRITICAL_DEFAULTS = {
    openrouter: {
        apiKey: '',
        apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
        model: 'xiaomi/mimo-v2-flash:free',
        maxTokens: 4500,
        temperature: 0.7
    },
    spotify: {
        clientId: '',
        redirectUri: typeof window !== 'undefined' ? window.location.origin + '/app.html' : '',
        scopes: [
            'user-read-recently-played',
            'user-top-read'
        ]
    },
    lemonsqueezy: {
        storeUrl: '',
        variantMonthly: '',
        variantYearly: '',
        variantLifetime: '',
        validationEndpoint: '',
        apiKey: ''
    },
    stripe: {
        publishableKey: '',
        prices: {
            lifetime: '',
            monthly: ''
        }
    },
    app: {
        name: 'Rhythm Chamber',
        url: typeof window !== 'undefined' ? window.location.origin : ''
    },
    PAYMENT_MODE: '' // Empty = MVP mode, 'chamber' = production mode
};

// ==========================================
// State
// ==========================================

/** @type {Object|null} */
let loadedConfig = null;

/** @type {boolean} */
let isLoading = false;

/** @type {Promise<Object>|null} */
let loadingPromise = null;

/** @type {boolean} */
let loadFailed = false;

/** @type {string|null} */
let loadError = null;

const CONFIG_CACHE_KEY = 'rhythm_chamber_config_cache';
const CONFIG_URL = './js/config.json';
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 500;

// ==========================================
// Core Functions
// ==========================================

/**
 * Load configuration with retry logic
 * 
 * @param {Object} [options] - Load options
 * @param {boolean} [options.forceRefresh=false] - Bypass cache and reload
 * @returns {Promise<Object>} Merged configuration (loaded + defaults)
 */
async function load(options = {}) {
    const { forceRefresh = false } = options;

    // Return cached config if available
    if (loadedConfig && !forceRefresh) {
        return loadedConfig;
    }

    // Return existing loading promise to prevent duplicate loads
    if (isLoading && loadingPromise) {
        return loadingPromise;
    }

    isLoading = true;
    loadFailed = false;
    loadError = null;

    loadingPromise = (async () => {
        let lastError = null;

        // Try to load with retries
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                console.log(`[ConfigLoader] Loading config (attempt ${attempt}/${MAX_RETRIES})...`);

                const response = await fetch(CONFIG_URL, {
                    cache: forceRefresh ? 'no-cache' : 'default'
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const json = await response.json();

                // Validate required structure
                const validation = validateConfig(json);
                if (!validation.valid) {
                    console.warn('[ConfigLoader] Config validation warnings:', validation.warnings);
                }

                // Merge with defaults (loaded values take precedence)
                loadedConfig = deepMerge(CRITICAL_DEFAULTS, json);

                // Add computed properties
                loadedConfig.spotify.redirectUri = window.location.origin + '/app.html';
                loadedConfig.app.url = window.location.origin;

                // Cache to localStorage for offline resilience
                cacheConfig(loadedConfig);

                console.log('[ConfigLoader] Config loaded successfully');
                emitEvent('config:loaded', { source: 'network' });

                isLoading = false;
                return loadedConfig;

            } catch (error) {
                lastError = error;
                console.warn(`[ConfigLoader] Attempt ${attempt} failed:`, error.message);

                if (attempt < MAX_RETRIES) {
                    // Exponential backoff: 500ms, 1000ms, 2000ms
                    const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                    console.log(`[ConfigLoader] Retrying in ${delay}ms...`);
                    await sleep(delay);
                }
            }
        }

        // All retries failed - try cache
        console.warn('[ConfigLoader] All retries failed, trying cache...');
        const cached = getCachedConfig();

        if (cached) {
            console.log('[ConfigLoader] Using cached config');
            loadedConfig = deepMerge(CRITICAL_DEFAULTS, cached);
            emitEvent('config:loaded', { source: 'cache', warning: 'Network load failed' });
            isLoading = false;
            return loadedConfig;
        }

        // No cache - use critical defaults
        console.warn('[ConfigLoader] No cache available, using critical defaults');
        loadedConfig = deepMerge({}, CRITICAL_DEFAULTS);
        loadFailed = true;
        loadError = lastError?.message || 'Unknown error';

        emitEvent('config:failed', {
            error: loadError,
            usingDefaults: true
        });

        isLoading = false;
        return loadedConfig;
    })();

    return loadingPromise;
}

/**
 * Get a configuration value by dot-notation path
 * 
 * @param {string} path - Dot-notation path (e.g., 'openrouter.apiKey')
 * @param {*} [defaultValue] - Default if path not found
 * @returns {*} Configuration value
 * @throws {Error} If config not loaded and no default provided
 */
function get(path, defaultValue = undefined) {
    if (!loadedConfig) {
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        throw new Error('[ConfigLoader] Config not loaded. Call load() first.');
    }

    const parts = path.split('.');
    let current = loadedConfig;

    for (const part of parts) {
        if (current === null || current === undefined || typeof current !== 'object') {
            return defaultValue;
        }
        current = current[part];
    }

    return current !== undefined ? current : defaultValue;
}

/**
 * Check if configuration is loaded and ready
 * 
 * @returns {boolean}
 */
function isReady() {
    return loadedConfig !== null;
}

/**
 * Check if configuration load failed
 * 
 * @returns {{failed: boolean, error: string|null, usingDefaults: boolean}}
 */
function getLoadStatus() {
    return {
        failed: loadFailed,
        error: loadError,
        usingDefaults: loadFailed && loadedConfig !== null
    };
}

/**
 * Get the full configuration object
 * 
 * @returns {Object|null}
 */
function getAll() {
    return loadedConfig ? { ...loadedConfig } : null;
}

/**
 * Set a configuration value at runtime (does not persist)
 * 
 * @param {string} path - Dot-notation path
 * @param {*} value - Value to set
 */
function set(path, value) {
    if (!loadedConfig) {
        throw new Error('[ConfigLoader] Config not loaded. Call load() first.');
    }

    const parts = path.split('.');
    let current = loadedConfig;

    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current) || typeof current[part] !== 'object') {
            current[part] = {};
        }
        current = current[part];
    }

    current[parts[parts.length - 1]] = value;
}

// ==========================================
// Validation
// ==========================================

/**
 * Validate configuration structure and value formats
 *
 * @param {Object} config - Config to validate
 * @returns {{valid: boolean, warnings: string[]}}
 */
function validateConfig(config) {
    const warnings = [];

    // Check for required sections
    const requiredSections = ['openrouter', 'spotify', 'app'];
    for (const section of requiredSections) {
        if (!config[section] || typeof config[section] !== 'object') {
            warnings.push(`Missing or invalid section: ${section}`);
        }
    }

    // Check OpenRouter config
    if (config.openrouter) {
        if (!config.openrouter.apiUrl) {
            warnings.push('openrouter.apiUrl is missing');
        } else {
            // Validate URL format
            try {
                const url = new URL(config.openrouter.apiUrl);
                if (!url.protocol.startsWith('https')) {
                    warnings.push('openrouter.apiUrl should use HTTPS for security');
                }
            } catch (e) {
                warnings.push('openrouter.apiUrl is not a valid URL');
            }
        }

        if (!config.openrouter.model) {
            warnings.push('openrouter.model is missing');
        } else {
            // Validate model ID format (basic check)
            const modelId = config.openrouter.model;
            if (typeof modelId !== 'string' || modelId.length < 3) {
                warnings.push('openrouter.model seems invalid (too short)');
            }
        }

        // Validate API key format if present (warn if malformed)
        if (config.openrouter.apiKey && config.openrouter.apiKey.length > 0) {
            const apiKey = config.openrouter.apiKey;
            if (!apiKey.startsWith('sk-or-v1-')) {
                warnings.push('openrouter.apiKey format may be invalid (should start with sk-or-v1-)');
            }
            if (apiKey.length < 40) {
                warnings.push('openrouter.apiKey seems too short');
            }
        }
    }

    // Check Spotify config
    if (config.spotify) {
        if (config.spotify.redirectUri) {
            try {
                new URL(config.spotify.redirectUri);
            } catch (e) {
                warnings.push('spotify.redirectUri is not a valid URL');
            }
        }

        // Validate scopes array
        if (config.spotify.scopes && !Array.isArray(config.spotify.scopes)) {
            warnings.push('spotify.scopes should be an array');
        }
    }

    // Check Lemon Squeezy config if present
    if (config.lemonsqueezy) {
        if (config.lemonsqueezy.storeUrl) {
            try {
                new URL(config.lemonsqueezy.storeUrl);
            } catch (e) {
                warnings.push('lemonsqueezy.storeUrl is not a valid URL');
            }
        }
        if (config.lemonsqueezy.validationEndpoint) {
            try {
                new URL(config.lemonsqueezy.validationEndpoint);
            } catch (e) {
                warnings.push('lemonsqueezy.validationEndpoint is not a valid URL');
            }
        }
        // Warn if variant IDs are missing when storeUrl is configured
        if (config.lemonsqueezy.storeUrl && !config.lemonsqueezy.variantMonthly && !config.lemonsqueezy.variantYearly) {
            warnings.push('lemonsqueezy variant IDs are missing (variantMonthly, variantYearly)');
        }
    }

    // Check Stripe config if present
    if (config.stripe) {
        if (config.stripe.publishableKey && !config.stripe.publishableKey.startsWith('pk_')) {
            warnings.push('stripe.publishableKey format may be invalid (should start with pk_)');
        }
    }

    // Check app config
    if (config.app) {
        if (config.app.url) {
            try {
                new URL(config.app.url);
            } catch (e) {
                warnings.push('app.url is not a valid URL');
            }
        }
    }

    return {
        valid: warnings.length === 0,
        warnings
    };
}

// ==========================================
// Cache Management
// ==========================================

/**
 * Cache configuration to localStorage
 * 
 * @param {Object} config - Config to cache
 */
function cacheConfig(config) {
    try {
        // Don't cache sensitive data
        const cacheable = { ...config };
        if (cacheable.openrouter) {
            cacheable.openrouter = { ...cacheable.openrouter, apiKey: '' };
        }
        if (cacheable.stripe) {
            cacheable.stripe = { ...cacheable.stripe, publishableKey: '' };
        }

        localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify({
            config: cacheable,
            timestamp: Date.now()
        }));
    } catch (e) {
        // Ignore localStorage errors
        console.warn('[ConfigLoader] Failed to cache config:', e.message);
    }
}

/**
 * Get cached configuration from localStorage
 * 
 * @returns {Object|null}
 */
function getCachedConfig() {
    try {
        const stored = localStorage.getItem(CONFIG_CACHE_KEY);
        if (!stored) return null;

        const { config, timestamp } = JSON.parse(stored);

        // Cache expires after 7 days
        const maxAge = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - timestamp > maxAge) {
            localStorage.removeItem(CONFIG_CACHE_KEY);
            return null;
        }

        return config;
    } catch (e) {
        return null;
    }
}

/**
 * Clear cached configuration
 */
function clearCache() {
    try {
        localStorage.removeItem(CONFIG_CACHE_KEY);
    } catch (e) {
        // Ignore
    }
}

// ==========================================
// Utilities
// ==========================================

/**
 * Deep merge objects (source overrides target)
 * 
 * @param {Object} target - Base object
 * @param {Object} source - Override object
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
    const result = { ...target };

    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(result[key] || {}, source[key]);
        } else if (source[key] !== undefined && source[key] !== '') {
            result[key] = source[key];
        }
    }

    return result;
}

/**
 * Sleep for a duration
 * 
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Emit a custom event (for EventBus integration)
 * 
 * @param {string} eventType - Event type
 * @param {Object} payload - Event payload
 */
function emitEvent(eventType, payload) {
    // Try to use EventBus if available
    if (typeof window !== 'undefined') {
        // Dispatch custom DOM event as fallback
        const event = new CustomEvent(eventType, { detail: payload });
        window.dispatchEvent(event);
    }
}

// ==========================================
// Backward Compatibility Layer
// ==========================================

/**
 * Create a window.Config proxy for backward compatibility
 * Modules still using window.Config will work without changes
 */
function installWindowProxy() {
    if (typeof window === 'undefined') return;

    // If legacy config.js already loaded, preserve it
    if (window.Config && Object.keys(window.Config).length > 0) {
        console.log('[ConfigLoader] Legacy window.Config detected, merging...');
        if (loadedConfig) {
            loadedConfig = deepMerge(loadedConfig, window.Config);
        } else {
            loadedConfig = deepMerge({}, window.Config);
        }
        return;
    }

    // Create a proxy that provides access via window.Config
    Object.defineProperty(window, 'Config', {
        get() {
            if (!loadedConfig) {
                console.warn('[ConfigLoader] Accessed window.Config before load() completed');
                return CRITICAL_DEFAULTS;
            }
            return loadedConfig;
        },
        set(value) {
            // Allow setting for tests or runtime overrides
            if (value && typeof value === 'object') {
                loadedConfig = deepMerge(loadedConfig || CRITICAL_DEFAULTS, value);
            }
        },
        configurable: true
    });
}

// ==========================================
// Public API
// ==========================================

const ConfigLoader = {
    // Core operations
    load,
    get,
    set,
    getAll,

    // Status
    isReady,
    getLoadStatus,

    // Cache
    clearCache,

    // Backward compatibility
    installWindowProxy,

    // Constants (for testing)
    CRITICAL_DEFAULTS,
    CONFIG_URL
};

export { ConfigLoader };

console.log('[ConfigLoader] Configuration Loader Service loaded');
