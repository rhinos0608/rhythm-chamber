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
 * - Safe localStorage operations with try-catch and quota error handling
 * - Environment variable support for configuration overrides
 *
 * Environment Variables:
 * ----------------------
 * The following environment variables can be set to override configuration:
 *
 * Build-time / Runtime Config:
 * - VITE_CONFIG_URL or RHYTHM_CONFIG_URL: Overrides the config.json URL (default: './js/config.json')
 * - VITE_NODE_ENV or NODE_ENV: Environment detection ('development', 'production', 'test')
 *
 * OpenRouter API:
 * - VITE_OPENROUTER_API_KEY or OPENROUTER_API_KEY: OpenRouter API key
 * - VITE_OPENROUTER_API_URL or OPENROUTER_API_URL: OpenRouter API URL
 * - VITE_OPENROUTER_MODEL or OPENROUTER_MODEL: Default model to use
 *
 * Spotify OAuth:
 * - VITE_SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_ID: Spotify OAuth client ID
 *
 * Lemon Squeezy Payments:
 * - VITE_LEMONSQUEEZY_STORE_URL or LEMONSQUEEZY_STORE_URL: Lemon Squeezy store URL
 * - VITE_LEMONSQUEEZY_API_KEY or LEMONSQUEEZY_API_KEY: Lemon Squeezy API key
 * - VITE_LEMONSQUEEZY_VARIANT_MONTHLY or LEMONSQUEEZY_VARIANT_MONTHLY: Monthly variant ID
 * - VITE_LEMONSQUEEZY_VARIANT_YEARLY or LEMONSQUEEZY_VARIANT_YEARLY: Yearly variant ID
 * - VITE_LEMONSQUEEZY_VARIANT_LIFETIME or LEMONSQUEEZY_VARIANT_LIFETIME: Lifetime variant ID
 *
 * Stripe Payments:
 * - VITE_STRIPE_PUBLISHABLE_KEY or STRIPE_PUBLISHABLE_KEY: Stripe publishable key
 * - VITE_STRIPE_PRICE_LIFETIME or STRIPE_PRICE_LIFETIME: Lifetime price ID
 * - VITE_STRIPE_PRICE_MONTHLY or STRIPE_PRICE_MONTHLY: Monthly price ID
 *
 * Application:
 * - VITE_APP_NAME or APP_NAME: Application name (default: 'Rhythm Chamber')
 * - VITE_PAYMENT_MODE or PAYMENT_MODE: Payment mode ('' for MVP, 'chamber' for production)
 *
 * Priority Order:
 * 1. Environment variables (highest priority)
 * 2. Loaded config.json values
 * 3. localStorage cached values
 * 4. CRITICAL_DEFAULTS (lowest priority)
 *
 * @module services/config-loader
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('ConfigLoader');

// ==========================================
// Environment Variable Helpers
// ==========================================

/**
 * Get an environment variable value.
 * Checks multiple possible sources with priority:
 * 1. import.meta.env (Vite build-time env vars)
 * 2. window.env (runtime-injected env vars)
 * 3. process.env (for Node.js compatibility)
 *
 * @param {string[]} names - Array of possible env var names (checked in order)
 * @returns {string|undefined} The env var value or undefined
 */
function getEnvVar(names) {
    // Vite build-time env vars (prefixed with VITE_)
    if (typeof import.meta !== 'undefined' && import.meta.env) {
        for (const name of names) {
            const viteName = name.startsWith('VITE_') ? name : `VITE_${name}`;
            if (import.meta.env[viteName] !== undefined) {
                return import.meta.env[viteName];
            }
        }
    }

    // Runtime-injected env vars on window
    if (typeof window !== 'undefined' && window.env) {
        for (const name of names) {
            if (window.env[name] !== undefined) {
                return window.env[name];
            }
        }
    }

    // process.env (Node.js / SSR compatibility)
    const nodeProcess = typeof globalThis !== 'undefined' ? globalThis.process : undefined;
    if (nodeProcess?.env) {
        for (const name of names) {
            if (nodeProcess.env[name] !== undefined) {
                return nodeProcess.env[name];
            }
        }
    }

    return undefined;
}

/**
 * Get the current environment (development, production, test)
 *
 * @returns {string} The environment name
 */
function getEnvironment() {
    return getEnvVar(['NODE_ENV']) || 'development';
}

/**
 * Get the config URL from environment or default
 *
 * @returns {string} The config URL to load
 */
function getConfigUrl() {
    const customUrl = getEnvVar(['RHYTHM_CONFIG_URL', 'CONFIG_URL']);
    return customUrl || './js/config.json';
}

/**
 * Build configuration overrides from environment variables.
 * Env vars take highest priority and override all other sources.
 *
 * @returns {Object} Configuration overrides from environment
 */
function getEnvConfigOverrides() {
    const overrides = {};
    const env = getEnvironment();

    // Environment detection
    overrides.env = env;

    // OpenRouter configuration
    const openrouterApiKey = getEnvVar(['OPENROUTER_API_KEY']);
    if (openrouterApiKey) {
        overrides.openrouter = { ...overrides.openrouter, apiKey: openrouterApiKey };
    }

    const openrouterApiUrl = getEnvVar(['OPENROUTER_API_URL']);
    if (openrouterApiUrl) {
        overrides.openrouter = { ...overrides.openrouter, apiUrl: openrouterApiUrl };
    }

    const openrouterModel = getEnvVar(['OPENROUTER_MODEL']);
    if (openrouterModel) {
        overrides.openrouter = { ...overrides.openrouter, model: openrouterModel };
    }

    // Spotify configuration
    const spotifyClientId = getEnvVar(['SPOTIFY_CLIENT_ID']);
    if (spotifyClientId) {
        overrides.spotify = { ...overrides.spotify, clientId: spotifyClientId };
    }

    // Lemon Squeezy configuration
    const lsStoreUrl = getEnvVar(['LEMONSQUEEZY_STORE_URL']);
    if (lsStoreUrl) {
        overrides.lemonsqueezy = { ...overrides.lemonsqueezy, storeUrl: lsStoreUrl };
    }

    const lsApiKey = getEnvVar(['LEMONSQUEEZY_API_KEY']);
    if (lsApiKey) {
        overrides.lemonsqueezy = { ...overrides.lemonsqueezy, apiKey: lsApiKey };
    }

    const lsVariantMonthly = getEnvVar(['LEMONSQUEEZY_VARIANT_MONTHLY']);
    if (lsVariantMonthly) {
        overrides.lemonsqueezy = { ...overrides.lemonsqueezy, variantMonthly: lsVariantMonthly };
    }

    const lsVariantYearly = getEnvVar(['LEMONSQUEEZY_VARIANT_YEARLY']);
    if (lsVariantYearly) {
        overrides.lemonsqueezy = { ...overrides.lemonsqueezy, variantYearly: lsVariantYearly };
    }

    const lsVariantLifetime = getEnvVar(['LEMONSQUEEZY_VARIANT_LIFETIME']);
    if (lsVariantLifetime) {
        overrides.lemonsqueezy = { ...overrides.lemonsqueezy, variantLifetime: lsVariantLifetime };
    }

    // Stripe configuration
    const stripeKey = getEnvVar(['STRIPE_PUBLISHABLE_KEY']);
    if (stripeKey) {
        overrides.stripe = { ...overrides.stripe, publishableKey: stripeKey };
    }

    const stripePriceLifetime = getEnvVar(['STRIPE_PRICE_LIFETIME']);
    if (stripePriceLifetime) {
        overrides.stripe = {
            ...overrides.stripe,
            prices: { ...overrides.stripe?.prices, lifetime: stripePriceLifetime },
        };
    }

    const stripePriceMonthly = getEnvVar(['STRIPE_PRICE_MONTHLY']);
    if (stripePriceMonthly) {
        overrides.stripe = {
            ...overrides.stripe,
            prices: { ...overrides.stripe?.prices, monthly: stripePriceMonthly },
        };
    }

    // Application configuration
    const appName = getEnvVar(['APP_NAME']);
    if (appName) {
        overrides.app = { ...overrides.app, name: appName };
    }

    const paymentMode = getEnvVar(['PAYMENT_MODE']);
    if (paymentMode !== undefined) {
        overrides.PAYMENT_MODE = paymentMode;
    }

    return overrides;
}

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
        temperature: 0.7,
    },
    spotify: {
        clientId: '',
        redirectUri: typeof window !== 'undefined' ? window.location.origin + '/app.html' : '',
        scopes: ['user-read-recently-played', 'user-top-read'],
    },
    lemonsqueezy: {
        storeUrl: '',
        variantMonthly: '',
        variantYearly: '',
        variantLifetime: '',
        validationEndpoint: '',
        apiKey: '',
    },
    stripe: {
        publishableKey: '',
        prices: {
            lifetime: '',
            monthly: '',
        },
    },
    app: {
        name: 'Rhythm Chamber',
        url: typeof window !== 'undefined' ? window.location.origin : '',
    },
    PAYMENT_MODE: '', // Empty = MVP mode, 'chamber' = production mode
    env: 'development',
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
 * @param {boolean} [options.skipEnvOverride=false] - Skip environment variable overrides
 * @returns {Promise<Object>} Merged configuration (env vars + loaded + defaults)
 */
async function load(options = {}) {
    const { forceRefresh = false, skipEnvOverride = false } = options;

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

    // Get config URL (may be overridden by env var)
    const configUrl = getConfigUrl();
    logger.info(`Loading config from: ${configUrl}`);

    loadingPromise = (async () => {
        let lastError = null;

        // Try to load with retries
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                logger.info(`Loading config (attempt ${attempt}/${MAX_RETRIES})...`);

                const response = await fetch(configUrl, {
                    cache: forceRefresh ? 'no-cache' : 'default',
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const json = await response.json();

                // Validate required structure
                const validation = validateConfig(json);
                if (!validation.valid) {
                    logger.warn('Config validation warnings:', validation.warnings);
                }

                // Merge: defaults -> loaded values -> env overrides
                loadedConfig = deepMerge(CRITICAL_DEFAULTS, json);

                // Apply environment variable overrides (highest priority)
                if (!skipEnvOverride) {
                    const envOverrides = getEnvConfigOverrides();
                    const appliedOverrides = applyEnvOverrides(loadedConfig, envOverrides);
                    if (Object.keys(appliedOverrides).length > 0) {
                        logger.info(
                            'Applied environment variable overrides:',
                            Object.keys(appliedOverrides)
                        );
                    }
                }

                // Add computed properties
                if (typeof window !== 'undefined') {
                    loadedConfig.spotify.redirectUri = window.location.origin + '/app.html';
                    loadedConfig.app.url = window.location.origin;
                }

                // Cache to localStorage for offline resilience
                cacheConfig(loadedConfig);

                logger.info('Config loaded successfully');
                emitEvent('config:loaded', { source: 'network' });

                isLoading = false;
                return loadedConfig;
            } catch (error) {
                lastError = error;
                logger.warn(`Attempt ${attempt} failed:`, error.message);

                if (attempt < MAX_RETRIES) {
                    // Exponential backoff: 500ms, 1000ms, 2000ms
                    const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                    logger.info(`Retrying in ${delay}ms...`);
                    await sleep(delay);
                }
            }
        }

        // All retries failed - try cache
        logger.warn('All retries failed, trying cache...');
        const cached = getCachedConfig();

        if (cached) {
            logger.info('Using cached config');
            loadedConfig = deepMerge(CRITICAL_DEFAULTS, cached);

            // Still apply env overrides to cached config
            if (!skipEnvOverride) {
                const envOverrides = getEnvConfigOverrides();
                applyEnvOverrides(loadedConfig, envOverrides);
            }

            emitEvent('config:loaded', { source: 'cache', warning: 'Network load failed' });
            isLoading = false;
            return loadedConfig;
        }

        // No cache - use critical defaults with env overrides
        logger.warn('No cache available, using critical defaults');
        loadedConfig = deepMerge({}, CRITICAL_DEFAULTS);

        // Apply env overrides even when using defaults
        if (!skipEnvOverride) {
            const envOverrides = getEnvConfigOverrides();
            applyEnvOverrides(loadedConfig, envOverrides);
        }

        loadFailed = true;
        loadError = lastError?.message || 'Unknown error';

        emitEvent('config:failed', {
            error: loadError,
            usingDefaults: true,
        });

        isLoading = false;
        return loadedConfig;
    })();

    return loadingPromise;
}

/**
 * Apply environment variable overrides to config.
 * Env vars take highest priority and will overwrite existing values.
 *
 * @param {Object} config - The config object to modify
 * @param {Object} overrides - The overrides to apply
 * @returns {Object} The overrides that were applied
 */
function applyEnvOverrides(config, overrides) {
    const applied = {};

    for (const [key, value] of Object.entries(overrides)) {
        if (value !== undefined) {
            if (typeof value === 'object' && !Array.isArray(value)) {
                // Nested object - merge recursively
                if (!config[key] || typeof config[key] !== 'object') {
                    config[key] = {};
                }
                const nestedApplied = applyEnvOverrides(config[key], value);
                if (Object.keys(nestedApplied).length > 0) {
                    applied[key] = nestedApplied;
                }
            } else {
                // Primitive value - direct assignment
                config[key] = value;
                applied[key] = value;
            }
        }
    }

    return applied;
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
        usingDefaults: loadFailed && loadedConfig !== null,
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
                warnings.push(
                    'openrouter.apiKey format may be invalid (should start with sk-or-v1-)'
                );
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
        if (
            config.lemonsqueezy.storeUrl &&
            !config.lemonsqueezy.variantMonthly &&
            !config.lemonsqueezy.variantYearly
        ) {
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
        warnings,
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
    // Check for localStorage in window or global (for test environments)
    const storage =
        typeof window !== 'undefined' && window.localStorage
            ? window.localStorage
            : typeof globalThis !== 'undefined' && globalThis.localStorage
                ? globalThis.localStorage
                : null;

    if (!storage) {
        return;
    }

    try {
        // Don't cache sensitive data
        const cacheable = { ...config };
        if (cacheable.openrouter) {
            cacheable.openrouter = { ...cacheable.openrouter, apiKey: '' };
        }
        if (cacheable.stripe) {
            cacheable.stripe = { ...cacheable.stripe, publishableKey: '' };
        }

        storage.setItem(
            CONFIG_CACHE_KEY,
            JSON.stringify({
                config: cacheable,
                timestamp: Date.now(),
            })
        );
    } catch (e) {
        // Handle quota exceeded errors specifically
        if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
            logger.warn('localStorage quota exceeded, unable to cache config');
        } else {
            logger.warn('Failed to cache config:', e);
        }
    }
}

/**
 * Get cached configuration from localStorage
 *
 * @returns {Object|null}
 */
function getCachedConfig() {
    // Check for localStorage in window or global (for test environments)
    const storage =
        typeof window !== 'undefined' && window.localStorage
            ? window.localStorage
            : typeof globalThis !== 'undefined' && globalThis.localStorage
                ? globalThis.localStorage
                : null;

    if (!storage) {
        return null;
    }

    try {
        const stored = storage.getItem(CONFIG_CACHE_KEY);
        if (!stored) return null;

        const { config, timestamp } = JSON.parse(stored);

        // Cache expires after 7 days
        const maxAge = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - timestamp > maxAge) {
            clearCache();
            return null;
        }

        return config;
    } catch (e) {
        logger.warn('Failed to read cached config:', e);
        return null;
    }
}

/**
 * Clear cached configuration
 */
function clearCache() {
    // Check for localStorage in window or global (for test environments)
    const storage =
        typeof window !== 'undefined' && window.localStorage
            ? window.localStorage
            : typeof globalThis !== 'undefined' && globalThis.localStorage
                ? globalThis.localStorage
                : null;

    if (!storage) {
        return;
    }

    try {
        storage.removeItem(CONFIG_CACHE_KEY);
    } catch (e) {
        logger.warn('Failed to clear config cache:', e);
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
        } else if (source[key] !== undefined) {
            // FIX: Allow empty strings to be set (distinguish between unset and empty)
            // Previously: `source[key] !== undefined && source[key] !== ''`
            // This prevented intentionally empty values from being set
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
        logger.info('Legacy window.Config detected, merging...');
        if (loadedConfig) {
            loadedConfig = deepMerge(loadedConfig, window.Config);
        } else {
            loadedConfig = deepMerge({}, window.Config);
        }
        return;
    }

    // DEPRECATED: window.Config proxy is no longer installed
    // Use ES module imports instead:
    //   import { ConfigLoader } from './config-loader.js';
    //   const config = await ConfigLoader.load();
    //   const value = ConfigLoader.get('path.to.value');
    logger.warn(
        'installWindowProxy() is deprecated. Use ES module imports instead: import { ConfigLoader } from "./config-loader.js"'
    );
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

    // Environment helpers
    getEnvironment,
    getConfigUrl,

    // Constants (for testing)
    CRITICAL_DEFAULTS,
};

export { ConfigLoader };

logger.info('Configuration Loader Service loaded');
