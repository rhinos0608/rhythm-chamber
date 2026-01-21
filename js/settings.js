/**
 * Settings Module for Rhythm Chamber
 *
 * Handles in-app configuration display for AI and Spotify settings.
 * The source of truth is config.js - this module provides a UI to view
 * and optionally override those settings via localStorage.
 */

import { ModuleRegistry } from './module-registry.js';
import { StorageBreakdownUI } from './storage-breakdown-ui.js';
import { ConfigLoader } from './services/config-loader.js';
import { Storage } from './storage.js';
import { Security } from './security/index.js';
import { SecureTokenStore } from './security/secure-token-store.js';
import { DataQuerySchemas } from './functions/schemas/data-queries.js';
import { Functions } from './functions/index.js';
import { Spotify } from './spotify.js';
import { AnalyticsQuerySchemas } from './functions/schemas/analytics-queries.js';
import { TemplateQuerySchemas } from './functions/schemas/template-queries.js';
import { InputValidation } from './utils/input-validation.js';
import { safeJsonParse } from './utils/safe-json.js';
import { STORAGE_KEYS } from './storage/keys.js';
import { EventBus } from './services/event-bus.js';
import { SettingsSchema } from './settings-schema.js';
import { setupModalFocusTrap } from './utils/focus-trap.js';

// Focus trap cleanup functions for modals
let settingsFocusTrapCleanup = null;
let toolsFocusTrapCleanup = null;

// ==========================================
// Constants - Provider Configuration
// ==========================================

/** Provider identifiers */
const PROVIDER_ID = {
    OLLAMA: 'ollama',
    LM_STUDIO: 'lmstudio',
    GEMINI: 'gemini',
    OPENROUTER: 'openrouter'
};

// Available LLM providers
const LLM_PROVIDERS = [
    { id: PROVIDER_ID.OLLAMA, name: 'Ollama (Local)', description: 'Run AI models on your own hardware - zero data transmission' },
    { id: PROVIDER_ID.LM_STUDIO, name: 'LM Studio (Local)', description: 'User-friendly local AI with OpenAI-compatible API' },
    { id: PROVIDER_ID.GEMINI, name: 'Gemini (Google AI Studio)', description: 'Google AI models - Gemini 2.0 Flash is FREE!' },
    { id: PROVIDER_ID.OPENROUTER, name: 'OpenRouter (Cloud)', description: 'Optional cloud provider for premium models' }
];

// Default endpoints for local providers
const DEFAULT_ENDPOINTS = {
    ollama: 'http://localhost:11434',
    lmstudio: 'http://localhost:1234/v1'
};

// ==========================================
// Constants - UI Configuration
// ==========================================

/** UI display constants */
const UI_CONFIG = {
    MOBILE_BREAKPOINT_PX: 768,
    DEFAULT_TOAST_DURATION_MS: 2000,
    TOAST_ANIMATION_DELAY_MS: 10,
    TOAST_CLOSE_DELAY_MS: 300,
    MODAL_CLOSE_DELAY_MS: 200
};

// ==========================================
// Constants - LLM Configuration
// ==========================================

/** LLM parameter bounds and defaults */
const LLM_CONFIG = {
    MIN_TEMP: 0,
    MAX_TEMP: 2,
    DEFAULT_TEMP: 0.7,
    MIN_TOP_P: 0,
    MAX_TOP_P: 1,
    DEFAULT_TOP_P: 0.9,
    MIN_FREQUENCY_PENALTY: -2,
    MAX_FREQUENCY_PENALTY: 2,
    DEFAULT_FREQUENCY_PENALTY: 0,
    MIN_PRESENCE_PENALTY: -2,
    MAX_PRESENCE_PENALTY: 2,
    DEFAULT_PRESENCE_PENALTY: 0,
    DEFAULT_MAX_TOKENS: 4500,
    DEFAULT_MAX_TOKENS_GEMINI: 8192,
    MIN_MAX_TOKENS: 100,
    MAX_MAX_TOKENS: 8000,
    MIN_MAX_TOKENS_GEMINI: 100,
    MAX_MAX_TOKENS_GEMINI: 8192,
    DEFAULT_CONTEXT_WINDOW: 4096,
    MIN_CONTEXT_WINDOW: 1024,
    MAX_CONTEXT_WINDOW: 128000,
    DEFAULT_CONTEXT_STEP: 1024
};

// Available models for the dropdown (OpenRouter)
const AVAILABLE_MODELS = [
    { id: 'xiaomi/mimo-v2-flash:free', name: 'Xiaomi Mimo v2 Flash (Free)', free: true },
    { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B (Free)', free: true },
    { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (Free)', free: true },
    { id: 'google/gemma-2-9b-it:free', name: 'Gemma 2 9B (Free)', free: true },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini ($)', free: false },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet ($)', free: false },
    { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo ($)', free: false }
];

// Gemini models (Google AI Studio)
const GEMINI_MODELS = [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Free)', free: true },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite (Free)', free: true },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Free)', free: true },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite (Free)', free: true },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Free)', free: true },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro ($)', free: false },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro ($)', free: false }
];

// Priority 2: Module-level AbortController for embedding cancellation
let currentEmbeddingAbortController = null;

// Settings migration state
let settingsMigrationComplete = false;
const SETTINGS_MIGRATED_KEY = STORAGE_KEYS.SETTINGS_MIGRATED_TO_IDB;

// HNW: Settings cache - populated by getSettingsAsync() for sync access
// This allows getSettings() to return user's saved settings after initialization
let _cachedSettings = null;

/**
 * Migrate settings from localStorage to IndexedDB (one-time migration)
 * HNW Hierarchy: Simplifies to config.js → IndexedDB (removes localStorage as third authority)
 * 
 * @returns {Promise<boolean>} True if migration occurred, false if already migrated
 */
async function migrateLocalStorageSettings() {
    // Check if already migrated
    if (settingsMigrationComplete) return false;
    if (localStorage.getItem(SETTINGS_MIGRATED_KEY) === 'true') {
        settingsMigrationComplete = true;
        return false;
    }

    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!stored) {
        // No settings to migrate
        localStorage.setItem(SETTINGS_MIGRATED_KEY, 'true');
        settingsMigrationComplete = true;
        console.log('[Settings] No localStorage settings to migrate');
        return false;
    }

    try {
        const parsed = safeJsonParse(stored, null);
        if (!parsed) {
            console.error('[Settings] Stored settings are corrupted');
            return false;
        }

        // Migrate to IndexedDB
        if (Storage.setConfig) {
            await Storage.setConfig(STORAGE_KEYS.SETTINGS, parsed);

            // Mark migration complete and remove old localStorage data
            localStorage.setItem(SETTINGS_MIGRATED_KEY, 'true');
            localStorage.removeItem(STORAGE_KEYS.SETTINGS);
            settingsMigrationComplete = true;

            console.log('[Settings] Migrated settings from localStorage to IndexedDB');
            return true;
        } else {
            // Storage not available yet, will retry on next call
            console.warn('[Settings] Storage not available, migration deferred');
            return false;
        }
    } catch (e) {
        console.error('[Settings] Migration failed:', e);
        return false;
    }
}

/**
 * Get current settings - reads directly from window.Config (source of truth)
 * Falls back to localStorage only if migration hasn't completed yet.
 * SYNC version for backward compatibility - use getSettingsAsync() for full unified storage support.
 * 
 * HNW: After migration, this function only reads config.js defaults.
 * Use getSettingsAsync() to get full settings with IndexedDB overrides.
 */
function getSettings() {
    // Read directly from config.js as the source of truth
    const configOpenrouter = ConfigLoader.get('openrouter', {});
    const configSpotify = ConfigLoader.get('spotify', {});
    const configGemini = ConfigLoader.get('gemini', {});

    // Build settings object from config.js
    const settings = {
        // LLM Provider settings
        llm: {
            provider: 'ollama', // Default to local AI for privacy
            ollamaEndpoint: DEFAULT_ENDPOINTS.ollama,
            lmstudioEndpoint: DEFAULT_ENDPOINTS.lmstudio
        },
        openrouter: {
            apiKey: configOpenrouter.apiKey || '',
            model: configOpenrouter.model || 'xiaomi/mimo-v2-flash:free',
            maxTokens: configOpenrouter.maxTokens || 4500,
            temperature: configOpenrouter.temperature ?? 0.7,
            // Advanced parameters
            topP: configOpenrouter.topP ?? 0.9,
            frequencyPenalty: configOpenrouter.frequencyPenalty ?? 0,
            presencePenalty: configOpenrouter.presencePenalty ?? 0,
            // Context window configuration
            contextWindow: configOpenrouter.contextWindow || 4096
        },
        // Ollama-specific settings
        ollama: {
            model: 'llama3.2',
            temperature: 0.7,
            topP: 0.9,
            maxTokens: 2000
        },
        // LM Studio settings (uses OpenAI format)
        lmstudio: {
            model: 'local-model',
            temperature: 0.7,
            topP: 0.9,
            maxTokens: 2000
        },
        // Gemini settings (Google AI Studio)
        gemini: {
            apiKey: configGemini.apiKey || '',
            model: configGemini.model || 'gemini-2.5-flash',
            maxTokens: configGemini.maxTokens || 8192,
            temperature: configGemini.temperature ?? 0.7,
            topP: configGemini.topP ?? 0.9
        },
        spotify: {
            clientId: configSpotify.clientId || ''
        }
    };

    // Post-migration: Return cached settings if available
    // The cache is populated by getSettingsAsync() on first call
    if (settingsMigrationComplete && _cachedSettings) {
        return _cachedSettings;
    }

    // Post-migration without cache: warn and return defaults
    // Callers should use getSettingsAsync() to get saved settings from IndexedDB
    if (settingsMigrationComplete) {
        console.warn('[Settings] getSettings() called before cache populated - returning defaults. Use getSettingsAsync() for saved settings.');
        return settings;
    }

    // Pre-migration fallback: Apply localStorage overrides
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (stored) {
        const parsed = safeJsonParse(stored, null);
        if (parsed) {
            applySettingsOverrides(settings, parsed);
        }
    }

    return settings;
}

/**
 * Get settings from unified storage (async version)
 * HNW: Single point of truth - config.js (defaults) → IndexedDB (user overrides)
 * Note: localStorage fallback only used if migration hasn't completed yet
 * @returns {Promise<Object>} Settings object
 */
async function getSettingsAsync() {
    // Ensure migration has been attempted
    await migrateLocalStorageSettings();

    // Read directly from config.js as the source of truth
    const configOpenrouter = ConfigLoader.get('openrouter', {});
    const configSpotify = ConfigLoader.get('spotify', {});
    const configGemini = ConfigLoader.get('gemini', {});

    // Build settings object from config.js
    const settings = {
        // LLM Provider settings
        llm: {
            provider: 'ollama', // Default to local AI for privacy
            ollamaEndpoint: DEFAULT_ENDPOINTS.ollama,
            lmstudioEndpoint: DEFAULT_ENDPOINTS.lmstudio
        },
        openrouter: {
            apiKey: configOpenrouter.apiKey || '',
            model: configOpenrouter.model || 'xiaomi/mimo-v2-flash:free',
            maxTokens: configOpenrouter.maxTokens || 4500,
            temperature: configOpenrouter.temperature ?? 0.7,
            // Advanced parameters
            topP: configOpenrouter.topP ?? 0.9,
            frequencyPenalty: configOpenrouter.frequencyPenalty ?? 0,
            presencePenalty: configOpenrouter.presencePenalty ?? 0,
            // Context window configuration
            contextWindow: configOpenrouter.contextWindow || 4096
        },
        // Ollama-specific settings
        ollama: {
            model: 'llama3.2',
            temperature: 0.7,
            topP: 0.9,
            maxTokens: 2000
        },
        // LM Studio settings (uses OpenAI format)
        lmstudio: {
            model: 'local-model',
            temperature: 0.7,
            topP: 0.9,
            maxTokens: 2000
        },
        // Gemini settings (Google AI Studio)
        gemini: {
            apiKey: configGemini.apiKey || '',
            model: configGemini.model || 'gemini-2.5-flash',
            maxTokens: configGemini.maxTokens || 8192,
            temperature: configGemini.temperature ?? 0.7,
            topP: configGemini.topP ?? 0.9
        },
        spotify: {
            clientId: configSpotify.clientId || ''
        }
    };

    // After migration, read only from IndexedDB (single source of user overrides)
    if (settingsMigrationComplete && Storage.getConfig) {
        try {
            const storedConfig = await Storage.getConfig(STORAGE_KEYS.SETTINGS);
            if (storedConfig) {
                applySettingsOverrides(settings, storedConfig);
            }
            // Update cache for sync access
            _cachedSettings = settings;
        } catch (e) {
            console.warn('[Settings] Failed to read from IndexedDB:', e);
        }
        return settings;
    }

    // Pre-migration fallback: Try IndexedDB first, then localStorage
    if (Storage.getConfig) {
        try {
            const storedConfig = await Storage.getConfig(STORAGE_KEYS.SETTINGS);
            if (storedConfig) {
                applySettingsOverrides(settings, storedConfig);
                return settings;
            }
        } catch (e) {
            console.warn('[Settings] Failed to read from unified storage:', e);
        }
    }

    // Fall back to localStorage only if migration hasn't completed
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (stored) {
        const parsed = safeJsonParse(stored, null);
        if (parsed) {
            applySettingsOverrides(settings, parsed);
        }
    }

    return settings;
}

/**
 * Apply settings overrides from stored values to settings object
 * @param {Object} settings - Base settings to modify
 * @param {Object} parsed - Parsed stored settings
 */
function applySettingsOverrides(settings, parsed) {
    // LLM Provider settings
    if (parsed.llm?.provider) {
        settings.llm.provider = parsed.llm.provider;
    }
    if (parsed.llm?.ollamaEndpoint) {
        settings.llm.ollamaEndpoint = parsed.llm.ollamaEndpoint;
    }
    if (parsed.llm?.lmstudioEndpoint) {
        settings.llm.lmstudioEndpoint = parsed.llm.lmstudioEndpoint;
    }

    // Only use stored API key if config.js has placeholder or empty
    if (parsed.openrouter?.apiKey &&
        (!settings.openrouter.apiKey || settings.openrouter.apiKey === 'your-api-key-here')) {
        settings.openrouter.apiKey = parsed.openrouter.apiKey;
    }

    // Only use stored model if user explicitly changed it
    if (parsed.openrouter?.model) {
        settings.openrouter.model = parsed.openrouter.model;
    }

    // Only use stored maxTokens if user explicitly changed it
    if (parsed.openrouter?.maxTokens) {
        settings.openrouter.maxTokens = parsed.openrouter.maxTokens;
    }

    // Only use stored temperature if user explicitly changed it
    if (parsed.openrouter?.temperature !== undefined) {
        settings.openrouter.temperature = parsed.openrouter.temperature;
    }

    // Advanced parameters
    if (parsed.openrouter?.topP !== undefined) {
        settings.openrouter.topP = parsed.openrouter.topP;
    }
    if (parsed.openrouter?.frequencyPenalty !== undefined) {
        settings.openrouter.frequencyPenalty = parsed.openrouter.frequencyPenalty;
    }
    if (parsed.openrouter?.presencePenalty !== undefined) {
        settings.openrouter.presencePenalty = parsed.openrouter.presencePenalty;
    }

    // Context window configuration
    if (parsed.openrouter?.contextWindow !== undefined) {
        settings.openrouter.contextWindow = parsed.openrouter.contextWindow;
    }

    // Ollama settings
    if (parsed.ollama) {
        Object.assign(settings.ollama, parsed.ollama);
    }

    // LM Studio settings
    if (parsed.lmstudio) {
        Object.assign(settings.lmstudio, parsed.lmstudio);
    }

    // Gemini settings
    if (parsed.gemini) {
        Object.assign(settings.gemini, parsed.gemini);
    }

    // Only use stored Spotify client ID if config.js has placeholder or empty
    if (parsed.spotify?.clientId &&
        (!settings.spotify.clientId || settings.spotify.clientId === 'your-spotify-client-id')) {
        settings.spotify.clientId = parsed.spotify.clientId;
    }
}

/**
 * Save user overrides to unified storage (IndexedDB only)
 * HNW Hierarchy: Storage module is the single authority for persistence
 * Settings cascade: config.js (defaults) → IndexedDB (user overrides)
 * Note: This does NOT modify config.js - it stores overrides
 *
 * SCHEMA VALIDATION: Settings are validated before saving
 * CROSS-TAB SYNC: Emits events and sets localStorage version for other tabs
 */
async function saveSettings(settings) {
    // Validate settings before saving
    const validation = SettingsSchema.validate(settings);

    if (validation.errors.length > 0) {
        console.warn('[Settings] Validation errors before save:', validation.errors);
        // Use sanitized version for saving
        settings = validation.sanitized;
    }

    // Add version to settings
    settings._version = SettingsSchema.VERSION;

    // Save to IndexedDB only (localStorage fallback removed for HNW simplification)
    if (Storage.setConfig) {
        try {
            await Storage.setConfig(STORAGE_KEYS.SETTINGS, settings);
            console.log('[Settings] Saved to IndexedDB');
            // Emit cross-tab sync event via localStorage (works across tabs)
            localStorage.setItem('rhythm_chamber_settings_version', Date.now().toString());
            // Emit internal event for same-tab listeners
            EventBus.emit('settings:saved', { version: settings._version });
        } catch (e) {
            console.warn('[Settings] Failed to save to IndexedDB:', e);
            EventBus.emit('settings:save_failed', { error: e.message });
            throw e; // Propagate error so caller knows save failed
        }
    } else {
        console.warn('[Settings] Storage not available, settings not persisted');
    }

    // Update the runtime Config object so changes take effect immediately
    if (settings.openrouter) {
        ConfigLoader.set('openrouter.apiKey', settings.openrouter.apiKey || ConfigLoader.get('openrouter.apiKey'));
        ConfigLoader.set('openrouter.model', settings.openrouter.model);
        ConfigLoader.set('openrouter.maxTokens', settings.openrouter.maxTokens);
        ConfigLoader.set('openrouter.temperature', settings.openrouter.temperature);
        ConfigLoader.set('openrouter.contextWindow', settings.openrouter.contextWindow);
        ConfigLoader.set('openrouter.apiUrl', ConfigLoader.get('openrouter.apiUrl', 'https://openrouter.ai/api/v1/chat/completions'));
    }
    if (settings.gemini) {
        // Only set keys when explicitly provided to avoid clobbering existing runtime config with undefined
        if (settings.gemini.apiKey !== undefined) {
            ConfigLoader.set('gemini.apiKey', settings.gemini.apiKey);
        }
        if (settings.gemini.model !== undefined) {
            ConfigLoader.set('gemini.model', settings.gemini.model);
        }
        if (settings.gemini.maxTokens !== undefined) {
            ConfigLoader.set('gemini.maxTokens', settings.gemini.maxTokens);
        }
        if (settings.gemini.temperature !== undefined) {
            ConfigLoader.set('gemini.temperature', settings.gemini.temperature);
        }
        if (settings.gemini.topP !== undefined) {
            ConfigLoader.set('gemini.topP', settings.gemini.topP);
        }
    }
    if (settings.spotify?.clientId) {
        ConfigLoader.set('spotify.clientId', settings.spotify.clientId);
    }

    // HNW: Update cached settings for sync access via getSettings()
    // Directly cache the settings object to avoid unnecessary async read-back
    // This prevents race conditions where another read could return stale data
    _cachedSettings = settings;

    console.log('[Settings] Saved and applied to runtime Config');
}

/**
 * Clear all stored setting overrides
 * HNW Hierarchy: Only clears from IndexedDB (single source of truth)
 */
async function clearSettings() {
    if (Storage.removeConfig) {
        try {
            await Storage.removeConfig(STORAGE_KEYS.SETTINGS);
            console.log('[Settings] Cleared from IndexedDB');
        } catch (e) {
            console.warn('[Settings] Failed to clear from IndexedDB:', e);
        }
    }
}

/**
 * Get a specific setting value
 */
function getSetting(path) {
    const settings = getSettings();
    const parts = path.split('.');
    let value = settings;
    for (const part of parts) {
        value = value?.[part];
    }
    return value;
}

/**
 * Get context window from settings
 * This is used by TokenCounter to get the configured context window
 */
function getContextWindow() {
    const settings = getSettings();
    return settings.openrouter?.contextWindow || 4096;
}

/**
 * Check if API key is configured (in config.js or localStorage)
 */
function hasApiKey() {
    const key = ConfigLoader.get('openrouter.apiKey');
    return key && key !== '' && key !== 'your-api-key-here';
}

/**
 * Check if Spotify is configured (in config.js or localStorage)
 */
function hasSpotifyConfig() {
    const clientId = ConfigLoader.get('spotify.clientId');
    return clientId && clientId !== '' && clientId !== 'your-spotify-client-id';
}

/**
 * Create and show the settings modal
 */
async function showSettingsModal() {
    // Remove existing modal if present
    const existing = document.getElementById('settings-modal');
    if (existing) {
        existing.remove();
    }

    // Use async version to get saved settings from IndexedDB
    const settings = await getSettingsAsync();

    // Determine if API key is from config.js (show masked) or needs to be entered
    const hasConfigKey = ConfigLoader.get('openrouter.apiKey') &&
        ConfigLoader.get('openrouter.apiKey') !== 'your-api-key-here';
    const apiKeyDisplay = hasConfigKey ? settings.openrouter.apiKey : '';

    const hasConfigSpotify = ConfigLoader.get('spotify.clientId') &&
        ConfigLoader.get('spotify.clientId') !== 'your-spotify-client-id';
    const spotifyDisplay = hasConfigSpotify ? settings.spotify.clientId : '';

    const modal = document.createElement('div');
    modal.id = 'settings-modal';
    modal.className = 'settings-modal';
    modal.innerHTML = `
        <div class="settings-overlay" data-action="hide-settings-modal"></div>
        <div class="settings-content">
            <div class="settings-header">
                <h2>⚙️ Settings</h2>
                <button class="settings-close" data-action="hide-settings-modal">×</button>
            </div>
            
            <div class="settings-body">
                <!-- LLM Provider Section -->
                <div class="settings-section">
                    <h3>🤖 AI Chat Settings</h3>
                    <p class="settings-description">
                        Choose your AI provider. <strong>Local AI (Ollama/LM Studio) = zero data transmission.</strong>
                    </p>
                    
                    <!-- Provider Selection -->
                    <div class="settings-field">
                        <label for="setting-llm-provider">LLM Provider</label>
                        <select id="setting-llm-provider" data-change-action="provider-change">
                            ${LLM_PROVIDERS.map(p => `
                                <option value="${p.id}" ${settings.llm.provider === p.id ? 'selected' : ''}>
                                    ${p.name}
                                </option>
                            `).join('')}
                        </select>
                        <span class="settings-hint" id="provider-hint">
                            ${LLM_PROVIDERS.find(p => p.id === settings.llm.provider)?.description || ''}
                        </span>
                    </div>

                    <!-- Ollama Status (shown when ollama selected) -->
                    <div id="ollama-status" class="settings-field provider-section" style="display: ${settings.llm.provider === 'ollama' ? 'block' : 'none'}">
                        <div class="status-indicator" id="ollama-connection-status">
                            <span class="status-dot checking"></span>
                            <span>Checking Ollama connection...</span>
                        </div>
                        <div class="settings-field">
                            <label for="setting-ollama-endpoint">Ollama Endpoint</label>
                            <input type="text" id="setting-ollama-endpoint" 
                                   value="${settings.llm.ollamaEndpoint}" 
                                   placeholder="http://localhost:11434">
                            <button class="btn btn-small" data-action="test-ollama">Test</button>
                        </div>
                        <div class="settings-field">
                            <label for="setting-ollama-model">Model</label>
                            <select id="setting-ollama-model">
                                <option value="${settings.ollama.model}">${settings.ollama.model}</option>
                            </select>
                            <button class="btn btn-small" data-action="refresh-ollama-models">↻ Refresh</button>
                            <span class="settings-hint">Run <code>ollama list</code> to see available models</span>
                        </div>
                    </div>
                    
                    <!-- LM Studio Section (shown when lmstudio selected) -->
                    <div id="lmstudio-status" class="settings-field provider-section" style="display: ${settings.llm.provider === 'lmstudio' ? 'block' : 'none'}">
                        <div class="settings-field">
                            <label for="setting-lmstudio-endpoint">LM Studio Endpoint</label>
                            <input type="text" id="setting-lmstudio-endpoint" 
                                   value="${settings.llm.lmstudioEndpoint}" 
                                   placeholder="http://localhost:1234/v1">
                            <span class="settings-hint">LM Studio uses OpenAI-compatible API at port 1234</span>
                        </div>
                        
                        <div class="settings-field">
                            <label for="setting-lmstudio-model">Model Name</label>
                            <input type="text" id="setting-lmstudio-model" 
                                   value="${settings.lmstudio?.model || 'local-model'}" 
                                   placeholder="e.g., qwen2.5-coder-7b-instruct">
                            <span class="settings-hint">The model name as shown in LM Studio's server tab</span>
                        </div>
                    </div>
                    
                    <!-- OpenRouter Section (shown when openrouter selected) -->
                    <div id="openrouter-section" class="provider-section" style="display: ${settings.llm.provider === 'openrouter' ? 'block' : 'none'}">
                        <p class="settings-description">
                            ${hasConfigKey
            ? '✅ API key configured in config.js'
            : 'Configure your OpenRouter API key. Get a free key at <a href="https://openrouter.ai/keys" target="_blank">openrouter.ai/keys</a>'}
                        </p>
                        
                        <div class="security-warning warning-small">
                            <span class="warning-icon">☁️</span>
                            <div class="warning-content">
                                <strong>Data Privacy Notice</strong>
                                <p>Using OpenRouter sends your conversation data to external servers. Use Local AI for zero data transmission.</p>
                            </div>
                        </div>
                        
                        <div class="settings-field">
                            <label for="setting-api-key">API Key ${hasConfigKey ? '(from config.js)' : ''}</label>
                            <input type="password" id="setting-api-key"
                                   value="${apiKeyDisplay}"
                                   placeholder="${hasConfigKey ? '••••••••••••••••' : 'sk-or-v1-...'}"
                                   ${hasConfigKey ? 'readonly' : ''}
                                   ${hasConfigKey ? 'autocomplete="off"' : 'autocomplete="new-password"'}>
                            <button class="btn-show-password" data-action="toggle-password" data-target="setting-api-key">Show</button>
                        </div>
                        
                        <div class="settings-field">
                            <label for="setting-model">Model</label>
                            <input type="text" id="setting-model" 
                                   list="model-options"
                                   value="${settings.openrouter.model}" 
                                   placeholder="e.g., anthropic/claude-3.5-sonnet"
                                   autocomplete="off">
                            <datalist id="model-options">
                                ${AVAILABLE_MODELS.map(m => `
                                    <option value="${m.id}">${m.name}</option>
                                `).join('')}
                            </datalist>
                            <span class="settings-hint">Select a preset or enter any <a href="https://openrouter.ai/models" target="_blank">OpenRouter model ID</a></span>
                        </div>
                    </div>

                    <!-- Gemini Section (shown when gemini selected) -->
                    <div id="gemini-section" class="provider-section" style="display: ${settings.llm.provider === 'gemini' ? 'block' : 'none'}">
                        <p class="settings-description">
                            Configure your Google AI Studio API key. Gemini 2.0 Flash is FREE!
                            Get a key at <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com/apikey</a>
                        </p>

                        <div class="security-warning warning-small" style="border-color: #4285f4; background: #e8f0fe;">
                            <span class="warning-icon">🆓</span>
                            <div class="warning-content">
                                <strong>Free Tier Available</strong>
                                <p>Gemini 2.0 Flash is completely free with generous limits. No credit card required!</p>
                            </div>
                        </div>

                        <div class="security-warning warning-small">
                            <span class="warning-icon">☁️</span>
                            <div class="warning-content">
                                <strong>Data Privacy Notice</strong>
                                <p>Using Gemini sends your conversation data to Google's servers. Use Local AI for zero data transmission.</p>
                            </div>
                        </div>

                        <div class="settings-field">
                            <label for="setting-gemini-api-key">API Key</label>
                            <input type="password" id="setting-gemini-api-key"
                                   value="${settings.gemini?.apiKey || ''}"
                                   placeholder="AIzaSy..."
                                   autocomplete="new-password">
                            <button class="btn-show-password" data-action="toggle-password" data-target="setting-gemini-api-key">Show</button>
                            <span class="settings-hint">Your Google AI Studio API key</span>
                        </div>

                        <div class="settings-field">
                            <label for="setting-gemini-model">Model</label>
                            <select id="setting-gemini-model">
                                ${GEMINI_MODELS.map(m => `
                                    <option value="${m.id}" ${settings.gemini?.model === m.id ? 'selected' : ''}>${m.name}</option>
                                `).join('')}
                            </select>
                            <span class="settings-hint">Choose a Gemini model (free tier options available)</span>
                        </div>

                        <div class="settings-field">
                            <label for="setting-gemini-max-tokens">Max Response Length</label>
                            <input type="number" id="setting-gemini-max-tokens"
                                   value="${settings.gemini?.maxTokens || LLM_CONFIG.DEFAULT_MAX_TOKENS_GEMINI}"
                                   min="${LLM_CONFIG.MIN_MAX_TOKENS_GEMINI}" max="${LLM_CONFIG.MAX_MAX_TOKENS_GEMINI}" step="100">
                            <span class="settings-hint">tokens (max ${LLM_CONFIG.MAX_MAX_TOKENS_GEMINI} for Gemini)</span>
                        </div>
                    </div>

                    <!-- Common Parameters (all providers) -->
                    <div class="settings-row">
                        <div class="settings-field">
                            <label for="setting-max-tokens">Max Response Length</label>
                            <input type="number" id="setting-max-tokens"
                                   value="${settings.openrouter.maxTokens}"
                                   min="${LLM_CONFIG.MIN_MAX_TOKENS}" max="${LLM_CONFIG.MAX_MAX_TOKENS}" step="100">
                            <span class="settings-hint">tokens (higher = longer responses)</span>
                        </div>

                        <div class="settings-field">
                            <label for="setting-temperature">Temperature</label>
                            <input type="range" id="setting-temperature"
                                   value="${settings.openrouter.temperature}"
                                   min="${LLM_CONFIG.MIN_TEMP}" max="${LLM_CONFIG.MAX_TEMP}" step="0.1">
                            <span class="settings-hint" id="temp-value">${settings.openrouter.temperature} (${settings.openrouter.temperature < 0.4 ? 'focused' : settings.openrouter.temperature > 1.0 ? 'creative' : 'balanced'})</span>
                        </div>
                    </div>

                    <!-- Context Window Configuration -->
                    <div class="settings-field">
                        <label for="setting-context-window">Context Window Size</label>
                        <input type="number" id="setting-context-window"
                               value="${settings.openrouter.contextWindow}"
                               min="${LLM_CONFIG.MIN_CONTEXT_WINDOW}" max="${LLM_CONFIG.MAX_CONTEXT_WINDOW}" step="${LLM_CONFIG.DEFAULT_CONTEXT_STEP}">
                        <span class="settings-hint">tokens (default: ${LLM_CONFIG.DEFAULT_CONTEXT_WINDOW}, adjust based on your model)</span>
                    </div>

                    <!-- Advanced Parameters (collapsible) -->
                    <details class="settings-advanced">
                        <summary>Advanced Parameters</summary>
                        <div class="settings-row">
                            <div class="settings-field">
                                <label for="setting-top-p">Top P (Nucleus Sampling)</label>
                                <input type="range" id="setting-top-p"
                                       value="${settings.openrouter.topP}"
                                       min="${LLM_CONFIG.MIN_TOP_P}" max="${LLM_CONFIG.MAX_TOP_P}" step="0.05">
                                <span class="settings-hint" id="top-p-value">${settings.openrouter.topP}</span>
                            </div>

                            <div class="settings-field">
                                <label for="setting-freq-penalty">Frequency Penalty</label>
                                <input type="range" id="setting-freq-penalty"
                                       value="${settings.openrouter.frequencyPenalty}"
                                       min="${LLM_CONFIG.MIN_FREQUENCY_PENALTY}" max="${LLM_CONFIG.MAX_FREQUENCY_PENALTY}" step="0.1">
                                <span class="settings-hint" id="freq-penalty-value">${settings.openrouter.frequencyPenalty}</span>
                            </div>
                        </div>

                        <div class="settings-field">
                            <label for="setting-pres-penalty">Presence Penalty</label>
                            <input type="range" id="setting-pres-penalty"
                                   value="${settings.openrouter.presencePenalty}"
                                   min="${LLM_CONFIG.MIN_PRESENCE_PENALTY}" max="${LLM_CONFIG.MAX_PRESENCE_PENALTY}" step="0.1">
                            <span class="settings-hint" id="pres-penalty-value">${settings.openrouter.presencePenalty} (positive = more topic diversity)</span>
                        </div>
                    </details>
                </div>
                
                <!-- Spotify Settings Section -->
                <div class="settings-section">
                    <h3>🎵 Spotify Settings</h3>
                    <p class="settings-description">
                        ${hasConfigSpotify
            ? '✅ Spotify configured in config.js'
            : 'For Quick Snapshot, add your Spotify Client ID from <a href="https://developer.spotify.com/dashboard" target="_blank">developer.spotify.com</a>'}
                    </p>
                    
                    <div class="settings-field">
                        <label for="setting-spotify-client-id">Client ID ${hasConfigSpotify ? '(from config.js)' : ''}</label>
                        <input type="text" id="setting-spotify-client-id" 
                               value="${spotifyDisplay}" 
                               placeholder="${hasConfigSpotify ? 'Configured' : 'Enter your Spotify Client ID'}"
                               ${hasConfigSpotify ? 'readonly' : ''}
                               autocomplete="off">
                    </div>
                    
                    <div class="settings-info">
                        <strong>Redirect URI:</strong> <code>${window.location.origin}/app.html</code>
                        <button class="btn-copy" data-action="copy-url">Copy</button>
                    </div>
                </div>
                
                <!-- Semantic Search Section (Now Free) -->
                <div class="settings-section premium-section">
                    <h3>🚀 Semantic Search</h3>
                    
                    <!-- Security Status Indicator -->
                    <div class="security-status-banner" id="security-status">
                        <span class="security-icon">🔐</span>
                        <span class="security-level">Security Level: <strong>Medium</strong></span>
                        <span class="security-description">Requires physical device protection</span>
                    </div>

                    <!-- Secure Context Warning (shown only when in fallback mode) -->
                    <div class="security-warning secure-context-warning" id="secure-context-warning" style="display: none;">
                        <span class="warning-icon">⚠️</span>
                        <div class="warning-content">
                            <strong>Insecure Context Detected</strong>
                            <p id="secure-context-warning-message">Your tokens are stored without encryption. Use HTTPS or localhost for proper security.</p>
                        </div>
                    </div>

                    <p class="settings-description">
                        RAG-powered semantic search using 100% local browser embeddings.
                        Ask natural questions about your listening history without data leaving your device.
                    </p>
                    
                    <!-- Security Warning -->
                    <div class="security-warning">
                        <span class="warning-icon">⚠️</span>
                        <div class="warning-content">
                            <strong>Physical Security Notice</strong>
                            <p>API keys remain accessible if your device is compromised. 
                            Protect physical access to this device as you would bank PINs or passwords.</p>
                        </div>
                    </div>

                    <div class="security-warning travel-mode">
                        <span class="warning-icon">🧭</span>
                        <div class="warning-content">
                            <strong>Traveling or on a VPN?</strong>
                            <p>Geographic anomaly detection can block rapid location changes. Use travel mode to relax checks or verify with Spotify to prove it's you.</p>
                            <div class="travel-actions">
                                <button class="btn btn-secondary" id="travel-mode-btn" data-action="toggle-travel-mode">
                                    I am traveling / on VPN
                                </button>
                                <button class="btn btn-primary" id="verify-identity-btn" data-action="verify-identity">
                                    Verify with Spotify
                                </button>
                            </div>
                            <p class="settings-hint" id="travel-status-text">Helps prevent false lockouts while traveling.</p>
                        </div>
                    </div>
                    
                    
                    <div class="settings-field">
                        <button class="btn btn-primary" id="generate-embeddings-btn" data-action="generate-embeddings">
                            ${ModuleRegistry.getModuleSync('RAG')?.isConfigured() ? '🔄 Regenerate Embeddings' : '⚡ Generate Embeddings'}
                        </button>
                        ${ModuleRegistry.getModuleSync('RAG')?.getCheckpoint?.() ? `
                            <button class="btn btn-secondary" id="resume-embeddings-btn" data-action="resume-embeddings">
                                ▶️ Resume
                            </button>
                        ` : ''}
                        ${(() => {
            const RAG = ModuleRegistry.getModuleSync('RAG');
            if (RAG?.isConfigured?.()) {
                const chunksCount = RAG.getConfig?.()?.chunksCount || 0;
                return `<span class="settings-hint success">✓ ${chunksCount} chunks indexed</span>`;
            } else if (RAG?.getCheckpoint?.()) {
                return `<span class="settings-hint warning">⚠️ Interrupted - click Resume to continue</span>`;
            } else {
                return `<span class="settings-hint">Generate embeddings to enable semantic search</span>`;
            }
        })()}
                    </div>
                    
                    <div id="embedding-progress" class="embedding-progress" style="display: none;">
                        <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
                        <div class="progress-actions">
                            <span class="progress-text" id="progress-text">Processing...</span>
                            <button class="btn btn-secondary btn-sm" id="cancel-embeddings-btn" data-action="cancel-embeddings">
                                ✕ Cancel
                            </button>
                        </div>
                    </div>
                    
                    <!-- Session Reset with Cryptographic Proof -->
                    <div class="settings-field session-controls">
                        <button class="btn btn-danger-outline" data-action="show-session-reset">
                            🔒 Reset Security Session
                        </button>
                        <span class="settings-hint">Invalidates all encrypted credentials and forces re-authentication</span>
                    </div>
                </div>
                
                <!-- Storage Management Section -->
                <div class="settings-section">
                    <h3>💾 Storage Management</h3>
                    <p class="settings-description">
                        Monitor and manage local storage usage. Cleanup old data to free space.
                    </p>
                    
                    <!-- Storage Breakdown Container -->
                    <div id="storage-breakdown-container">
                        <div class="storage-loading">Loading storage breakdown...</div>
                    </div>
                </div>
            </div>
            
            <div class="settings-footer">
                <button class="btn btn-secondary" data-action="hide-settings-modal">Close</button>
                <button class="btn btn-primary" data-action="save-settings">Save Changes</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Initialize travel/VPN override status UI
    refreshTravelStatusUI();

    // Check for secure context and show warning if in fallback mode
    checkAndShowSecureContextWarning();

    // Set up focus trap for accessibility (WCAG 2.1.2)
    // Clean up any existing trap first
    if (settingsFocusTrapCleanup) {
        settingsFocusTrapCleanup();
        settingsFocusTrapCleanup = null;
    }
    settingsFocusTrapCleanup = setupModalFocusTrap('settings-modal', () => hideSettingsModal());

    // Event delegation for settings modal actions
    modal.addEventListener('click', (e) => {
        const actionElement = e.target.closest('[data-action]');
        if (!actionElement) return;

        // HNW: Stop propagation to prevent app.js from seeing these settings-specific actions
        e.stopPropagation();

        const action = actionElement.dataset.action;
        switch (action) {
            case 'hide-settings-modal':
                hideSettingsModal();
                break;
            case 'test-ollama':
                testOllamaConnection();
                break;
            case 'refresh-ollama-models':
                refreshOllamaModels();
                break;
            case 'toggle-password': {
                const target = actionElement.dataset.target;
                togglePasswordVisibility(target, actionElement);
                break;
            }
            case 'copy-url':
                copyToClipboard(window.location.origin + '/app.html', actionElement);
                break;
            case 'toggle-travel-mode':
                toggleTravelMode();
                break;
            case 'verify-identity':
                verifyIdentity();
                break;
            case 'generate-embeddings':
                generateEmbeddings();
                break;
            case 'resume-embeddings':
                resumeEmbeddings();
                break;
            case 'cancel-embeddings':
                cancelEmbeddings();
                break;
            case 'show-session-reset':
                showSessionResetModal();
                break;
            case 'save-settings':
                saveFromModal();
                break;
        }
    });

    modal.addEventListener('change', (e) => {
        const actionElement = e.target.closest('[data-change-action]');
        if (!actionElement) return;

        const action = actionElement.dataset.changeAction;
        switch (action) {
            case 'provider-change':
                onProviderChange(e.target.value);
                break;
        }
    });

    // Add temperature slider listener
    const tempSlider = document.getElementById('setting-temperature');
    const tempValue = document.getElementById('temp-value');
    tempSlider?.addEventListener('input', () => {
        const val = parseFloat(tempSlider.value);
        const label = val < 0.4 ? 'focused' : val > 1.0 ? 'creative' : 'balanced';
        tempValue.textContent = `${val} (${label})`;
    });

    // Add top-p slider listener
    const topPSlider = document.getElementById('setting-top-p');
    const topPValue = document.getElementById('top-p-value');
    topPSlider?.addEventListener('input', () => {
        topPValue.textContent = topPSlider.value;
    });

    // Add frequency penalty slider listener
    const freqSlider = document.getElementById('setting-freq-penalty');
    const freqValue = document.getElementById('freq-penalty-value');
    freqSlider?.addEventListener('input', () => {
        freqValue.textContent = freqSlider.value;
    });

    // Add presence penalty slider listener
    const presSlider = document.getElementById('setting-pres-penalty');
    const presValue = document.getElementById('pres-penalty-value');
    presSlider?.addEventListener('input', () => {
        const val = parseFloat(presSlider.value);
        presValue.textContent = `${val} (positive = more topic diversity)`;
    });

    // Check Ollama connection if selected
    if (settings.llm.provider === 'ollama') {
        checkOllamaConnection();
    }

    // Note: Escape key handling is now done by the focus trap

    // Initialize storage breakdown UI
    initStorageBreakdown();
}

/**
 * Hide the settings modal
 */
function hideSettingsModal() {
    // Clean up focus trap first (restores focus to previous element)
    if (settingsFocusTrapCleanup) {
        settingsFocusTrapCleanup();
        settingsFocusTrapCleanup = null;
    }

    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), UI_CONFIG.MODAL_CLOSE_DELAY_MS);
    }
}

/**
 * Update the travel/VPN override UI state
 */
function refreshTravelStatusUI() {
    const statusEl = document.getElementById('travel-status-text');
    const travelBtn = document.getElementById('travel-mode-btn');

    if (!statusEl || !travelBtn) return;

    const travelStatus = Security.getTravelOverrideStatus() || { active: false };

    if (travelStatus.active && travelStatus.expiresAt) {
        const expires = new Date(travelStatus.expiresAt);
        const sameDay = expires.toDateString() === new Date().toDateString();
        const timeString = expires.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const datePrefix = sameDay ? '' : `${expires.toLocaleDateString()} `;

        statusEl.textContent = `Travel mode is active until ${datePrefix}${timeString}. Geographic anomaly detection is relaxed while you travel.`;
        travelBtn.textContent = 'Disable travel mode';
    } else {
        statusEl.textContent = 'Use this if VPN or travel triggers false lockouts. It relaxes geo checks for 12 hours.';
        travelBtn.textContent = 'I am traveling / on VPN';
    }
}

/**
 * Toggle travel override to reduce false positives for VPN/travel
 */
function toggleTravelMode() {
    if (!Security.setTravelOverride || !Security.getTravelOverrideStatus) {
        showToast('Security module not loaded');
        return;
    }

    const travelStatus = Security.getTravelOverrideStatus();

    if (travelStatus.active) {
        Security.clearTravelOverride();
        showToast('Travel mode disabled. Geographic anomaly detection is back to normal.');
    } else {
        Security.setTravelOverride(12, 'user_travel_override');
        Security.clearSecurityLockout();
        showToast('Travel mode enabled for 12 hours. Geo anomaly checks are relaxed for VPN/travel.');
    }

    refreshTravelStatusUI();
}

/**
 * Check for secure context and show warning if in fallback mode
 * Issue 5.3: Add UI warning when operating without secure context
 */
function checkAndShowSecureContextWarning() {
    // Check if SecureTokenStore is in fallback mode
    const isAvailable = SecureTokenStore?.isAvailable?.() ?? true;

    if (!isAvailable) {
        const warningEl = document.getElementById('secure-context-warning');
        const messageEl = document.getElementById('secure-context-warning-message');

        if (warningEl) {
            warningEl.style.display = 'flex';

            // Get specific fallback reason if available
            const fallbackReason = SecureTokenStore?.getFallbackReason?.();
            if (messageEl && fallbackReason) {
                messageEl.textContent = `Your tokens are stored without encryption. Reason: ${fallbackReason}`;
            }

            // Mark as warned to avoid spam (optional - the warning is only shown when settings are opened)
            SecureTokenStore?.markFallbackWarned?.();
        }
    }
}

/**
 * Fallback identity verification for geo lockouts
 * Rebinds via Spotify OAuth to prove legitimacy
 */
async function verifyIdentity() {
    if (!Spotify.isConfigured?.()) {
        showToast('Add your Spotify Client ID before verifying identity.');
        return;
    }

    try {
        Security.clearSecurityLockout();
        Security.setTravelOverride(12, 'verified_travel');
        Security.clearTokenBinding();
        Spotify.clearTokens();

        showToast('Redirecting to Spotify to verify identity...');
        await Spotify.initiateLogin();
    } catch (error) {
        console.error('[Settings] Identity verification failed:', error);
        showToast('Could not start verification: ' + error.message);
    }
}

/**
 * Initialize the storage breakdown UI
 * Gets StorageDegradationManager and renders the breakdown
 */
async function initStorageBreakdown() {
    const container = document.getElementById('storage-breakdown-container');
    if (!container) return;

    // Show loading state for better UX
    container.innerHTML = '<div class="storage-loading">Loading storage breakdown...</div>';

    try {
        // Asynchronously request the module to ensure it's loaded
        const manager = await ModuleRegistry.getModule('StorageDegradationManager');

        if (!manager) {
            container.innerHTML = '<div class="storage-error">Storage degradation manager not available</div>';
            return;
        }

        // Initialize StorageBreakdownUI with the manager
        await StorageBreakdownUI.init(manager);

        // Render the breakdown
        await StorageBreakdownUI.render(container);

    } catch (error) {
        console.error('[Settings] Failed to initialize storage breakdown:', error);
        // SAFE: Use textContent instead of innerHTML to prevent XSS from error.message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'storage-error';
        errorDiv.textContent = 'Failed to load storage breakdown: ' + (error.message || 'Unknown error');
        container.innerHTML = '';
        container.appendChild(errorDiv);
    }
}

/**
 * Validate settings before saving
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateSettingsInputs(settings) {
    const errors = [];

    // Validate API keys if provided
    if (settings.openrouter?.apiKey) {
        const keyCheck = InputValidation.validateApiKey('openrouter', settings.openrouter.apiKey);
        if (!keyCheck.valid) {
            errors.push(`OpenRouter API key: ${keyCheck.error}`);
        }
    }

    if (settings.gemini?.apiKey) {
        const keyCheck = InputValidation.validateApiKey('gemini', settings.gemini.apiKey);
        if (!keyCheck.valid) {
            errors.push(`Gemini API key: ${keyCheck.error}`);
        }
    }

    if (settings.spotify?.clientId) {
        const keyCheck = InputValidation.validateApiKey('spotify', settings.spotify.clientId);
        if (!keyCheck.valid) {
            errors.push(`Spotify Client ID: ${keyCheck.error}`);
        }
    }

    // Validate endpoint URLs
    if (settings.llm?.ollamaEndpoint) {
        const urlCheck = InputValidation.validateUrl(settings.llm.ollamaEndpoint, ['http', 'https']);
        if (!urlCheck.valid) {
            errors.push(`Ollama endpoint: ${urlCheck.error}`);
        }
    }

    if (settings.llm?.lmstudioEndpoint) {
        const urlCheck = InputValidation.validateUrl(settings.llm.lmstudioEndpoint, ['http', 'https']);
        if (!urlCheck.valid) {
            errors.push(`LM Studio endpoint: ${urlCheck.error}`);
        }
    }

    // Validate model IDs
    if (settings.openrouter?.model) {
        const modelCheck = InputValidation.validateModelId(settings.openrouter.model);
        if (!modelCheck.valid) {
            errors.push(`OpenRouter model: ${modelCheck.error}`);
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Save settings from the modal form
 */
async function saveFromModal() {
    // Get provider selection
    const provider = document.getElementById('setting-llm-provider')?.value || 'ollama';
    const ollamaEndpoint = document.getElementById('setting-ollama-endpoint')?.value || DEFAULT_ENDPOINTS.ollama;
    const lmstudioEndpoint = document.getElementById('setting-lmstudio-endpoint')?.value || DEFAULT_ENDPOINTS.lmstudio;
    const ollamaModel = document.getElementById('setting-ollama-model')?.value || 'llama3.2';
    const lmstudioModel = document.getElementById('setting-lmstudio-model')?.value || 'local-model';

    // OpenRouter settings
    const apiKeyInput = document.getElementById('setting-api-key');
    const model = document.getElementById('setting-model')?.value || 'xiaomi/mimo-v2-flash:free';
    const maxTokens = parseInt(document.getElementById('setting-max-tokens')?.value) || 4500;
    const temperature = parseFloat(document.getElementById('setting-temperature')?.value) || 0.7;
    const contextWindow = parseInt(document.getElementById('setting-context-window')?.value) || 4096;

    // Advanced parameters
    const topP = parseFloat(document.getElementById('setting-top-p')?.value) || 0.9;
    const frequencyPenalty = parseFloat(document.getElementById('setting-freq-penalty')?.value) || 0;
    const presencePenalty = parseFloat(document.getElementById('setting-pres-penalty')?.value) || 0;

    // Gemini settings
    const geminiApiKeyInput = document.getElementById('setting-gemini-api-key');
    const geminiModel = document.getElementById('setting-gemini-model')?.value || 'gemini-2.5-flash';
    const geminiApiKey = geminiApiKeyInput?.value?.trim();
    const geminiMaxTokens = parseInt(document.getElementById('setting-gemini-max-tokens')?.value) || 8192;

    const spotifyInput = document.getElementById('setting-spotify-client-id');

    // Only save API key if user actually entered one (field not readonly)
    const apiKey = apiKeyInput?.readOnly ? null : apiKeyInput?.value?.trim();
    const spotifyClientId = spotifyInput?.readOnly ? null : spotifyInput?.value?.trim();

    // Build settings object for validation
    const settingsToValidate = {
        openrouter: { apiKey, model },
        gemini: { apiKey: geminiApiKey },
        spotify: { clientId: spotifyClientId },
        llm: { ollamaEndpoint, lmstudioEndpoint }
    };

    // Validate inputs before saving
    const validation = validateSettingsInputs(settingsToValidate);
    if (!validation.valid) {
        console.error('[Settings] Validation failed:', validation.errors);
        showToast('Settings validation failed:\n' + validation.errors.join('\n'));
        return;
    }

    const settings = {
        llm: {
            provider,
            ollamaEndpoint,
            lmstudioEndpoint
        },
        openrouter: {
            model,
            maxTokens: Math.min(Math.max(maxTokens, 100), 8000),
            temperature: Math.min(Math.max(temperature, 0), 2),
            contextWindow: Math.min(Math.max(contextWindow, 1024), 128000),
            topP: Math.min(Math.max(topP, 0), 1),
            frequencyPenalty: Math.min(Math.max(frequencyPenalty, -2), 2),
            presencePenalty: Math.min(Math.max(presencePenalty, -2), 2)
        },
        ollama: {
            model: ollamaModel,
            temperature: Math.min(Math.max(temperature, 0), 2),
            topP: Math.min(Math.max(topP, 0), 1),
            maxTokens: Math.min(Math.max(maxTokens, 100), 8000)
        },
        lmstudio: {
            model: lmstudioModel,
            temperature: Math.min(Math.max(temperature, 0), 2),
            topP: Math.min(Math.max(topP, 0), 1),
            maxTokens: Math.min(Math.max(maxTokens, 100), 8000)
        },
        gemini: {
            model: geminiModel,
            apiKey: geminiApiKey || '',
            maxTokens: Math.min(Math.max(geminiMaxTokens, 100), 8192),
            temperature: Math.min(Math.max(temperature, 0), 2),
            topP: Math.min(Math.max(topP, 0), 1)
        },
        spotify: {}
    };

    // Only include API key in saved settings if user provided one
    if (apiKey) {
        settings.openrouter.apiKey = apiKey;
    }

    // Only include Spotify client ID if user provided one
    if (spotifyClientId) {
        settings.spotify.clientId = spotifyClientId;
    }

    // Get the save button for state feedback
    const saveButton = document.querySelector('[data-action="save-settings"]');
    const originalButtonText = saveButton?.textContent || 'Save Changes';

    // Set loading state
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.classList.add('btn-loading');
        saveButton.innerHTML = '<span class="btn-spinner"></span> Saving...';
    }

    try {
        await saveSettings(settings);
        hideSettingsModal();
        showToast('Settings saved!', 'success');
    } catch (error) {
        console.error('[Settings] Failed to save:', error);
        showToast('Failed to save settings: ' + error.message, 'error');
    } finally {
        // Reset button state (modal might be hidden, so check if element exists)
        if (saveButton && document.body.contains(saveButton)) {
            saveButton.disabled = false;
            saveButton.classList.remove('btn-loading');
            saveButton.textContent = originalButtonText;
        }
    }
}

/**
 * Toggle password visibility
 */
function togglePasswordVisibility(inputId, button) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        button.textContent = 'Hide';
    } else {
        input.type = 'password';
        button.textContent = 'Show';
    }
}

/**
 * Copy text to clipboard
 */
function copyToClipboard(text, button) {
    navigator.clipboard.writeText(text).then(() => {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => button.textContent = originalText, 1500);
    });
}

/**
 * Show a toast notification
 */
function showToast(message, duration = UI_CONFIG.DEFAULT_TOAST_DURATION_MS) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), UI_CONFIG.TOAST_ANIMATION_DELAY_MS);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), UI_CONFIG.TOAST_CLOSE_DELAY_MS);
    }, duration);
}

/**
 * Generate embeddings with progress UI
 * Priority 2: AbortController support for cancellation
 * @param {boolean} resume - Whether to resume from checkpoint
 */
async function generateEmbeddings(resume = false) {
    const RAG = ModuleRegistry.getModuleSync('RAG');
    if (!RAG) {
        showToast('RAG module not loaded');
        return;
    }

    // Show progress UI
    const progressContainer = document.getElementById('embedding-progress');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const generateBtn = document.getElementById('generate-embeddings-btn');
    const resumeBtn = document.getElementById('resume-embeddings-btn');
    const cancelBtn = document.getElementById('cancel-embeddings-btn');

    if (progressContainer) progressContainer.style.display = 'block';
    if (generateBtn) generateBtn.disabled = true;
    if (resumeBtn) resumeBtn.disabled = true;

    // Priority 2: Create AbortController for cancellation
    const abortController = new AbortController();
    currentEmbeddingAbortController = abortController;

    // Show cancel button
    if (cancelBtn) {
        cancelBtn.style.display = 'inline-block';
        cancelBtn.disabled = false;
    }

    try {
        // Generate embeddings with progress callback and abort signal
        await RAG.generateEmbeddings((current, total, message) => {
            const percent = Math.round((current / total) * 100);
            if (progressFill) progressFill.style.width = `${percent}%`;
            if (progressText) progressText.textContent = message;
        }, { resume }, abortController.signal);

        showToast('🎉 Embeddings generated successfully!');

        // Refresh the modal to show updated status
        setTimeout(async () => {
            hideSettingsModal();
            await showSettingsModal();
        }, 1500);

    } catch (err) {
        console.error('Embedding generation error:', err);

        // Handle cancellation specifically
        if (err.message === 'Embedding generation cancelled') {
            showToast('Embedding generation cancelled');
        } else {
            // Check if we have a checkpoint for resume
            const checkpoint = RAG.getCheckpoint?.();
            if (checkpoint && checkpoint.processed > 0) {
                showToast(`Error at ${checkpoint.processed}/${checkpoint.totalChunks}: ${err.message}. Click Resume to continue.`);
            } else {
                showToast('Error: ' + err.message);
            }
        }

        if (progressContainer) progressContainer.style.display = 'none';
        if (generateBtn) generateBtn.disabled = false;

        // Check if we need to show resume button
        if (RAG.getCheckpoint?.()) {
            if (resumeBtn) {
                resumeBtn.style.display = 'inline-block';
                resumeBtn.disabled = false;
            }
        }
    } finally {
        // Clean up abort controller and hide cancel button
        currentEmbeddingAbortController = null;
        if (cancelBtn) cancelBtn.style.display = 'none';
    }
}

/**
 * Resume embedding generation from checkpoint
 */
function resumeEmbeddings() {
    generateEmbeddings(true);
}

/**
 * Cancel ongoing embedding generation
 * Priority 2: Uses AbortController to cleanly abort the operation
 */
function cancelEmbeddings() {
    if (currentEmbeddingAbortController) {
        currentEmbeddingAbortController.abort();
        console.log('[Settings] Embedding generation cancelled by user');
    } else {
        console.warn('[Settings] No embedding generation in progress to cancel');
    }
}

/**
 * Show session reset confirmation modal with cryptographic proof
 */
async function showSessionResetModal() {
    // Remove existing modal if present
    const existing = document.getElementById('session-reset-modal');
    if (existing) existing.remove();

    // Get current session version for display
    const currentVersion = Security.getSessionVersion() || 1;
    const newVersion = currentVersion + 1;

    // Generate a proof hash that will change after reset
    let proofHash = 'N/A';
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(`session-${currentVersion}-${Date.now()}`);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        proofHash = hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        proofHash = 'unable-to-generate';
    }

    const modal = document.createElement('div');
    modal.id = 'session-reset-modal';
    modal.className = 'session-reset-modal';
    modal.innerHTML = `
        <div class="session-reset-overlay" data-action="hide-session-reset"></div>
        <div class="session-reset-content">
            <div class="session-reset-header">
                <h2>🔒 Reset Security Session</h2>
            </div>
            
            <div class="session-reset-body">
                <div class="reset-warning">
                    <span class="warning-icon">⚠️</span>
                    <div class="warning-text">
                        <strong>This action will:</strong>
                        <ul>
                            <li>Invalidate all encrypted credentials</li>
                            <li>Clear RAG checkpoint data</li>
                            <li>Require re-authentication with Spotify</li>
                            <li>Force generation of new session keys</li>
                        </ul>
                    </div>
                </div>
                
                <div class="crypto-proof">
                    <h4>🔐 Cryptographic Proof of Revocation</h4>
                    <div class="proof-details">
                        <div class="proof-row">
                            <span class="proof-label">Current Session:</span>
                            <code class="proof-value">v${currentVersion}</code>
                        </div>
                        <div class="proof-row">
                            <span class="proof-label">New Session:</span>
                            <code class="proof-value new-session">v${newVersion}</code>
                        </div>
                        <div class="proof-row">
                            <span class="proof-label">Revocation Hash:</span>
                            <code class="proof-value hash">${proofHash}</code>
                        </div>
                    </div>
                    <p class="proof-explanation">
                        After reset, all data encrypted with session v${currentVersion} will be permanently unreadable.
                        The revocation hash provides proof that the reset occurred.
                    </p>
                </div>
            </div>
            
            <div class="session-reset-footer">
                <button class="btn btn-secondary" data-action="hide-session-reset">Cancel</button>
                <button class="btn btn-danger" id="confirm-reset-btn" data-action="confirm-session-reset">
                    Reset Session
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Event delegation for session reset modal actions
    modal.addEventListener('click', (e) => {
        const actionElement = e.target.closest('[data-action]');
        if (!actionElement) return;

        const action = actionElement.dataset.action;
        switch (action) {
            case 'hide-session-reset':
                hideSessionResetModal();
                break;
            case 'confirm-session-reset':
                confirmSessionReset();
                break;
        }
    });

    // Add escape key listener
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            hideSessionResetModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

/**
 * Hide session reset modal
 */
function hideSessionResetModal() {
    const modal = document.getElementById('session-reset-modal');
    if (modal) {
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), UI_CONFIG.MODAL_CLOSE_DELAY_MS);
    }
}

/**
 * Confirm and execute session reset
 */
async function confirmSessionReset() {
    const confirmBtn = document.getElementById('confirm-reset-btn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Resetting...';
    }

    try {
        // Perform session invalidation
        if (Security.clearSessionData) {
            await Security.clearSessionData();
        } else if (Security.invalidateSessions) {
            Security.invalidateSessions();
        }

        // Clear KeyManager session keys from memory (KEY-05)
        if (Security.clearKeySession) {
            Security.clearKeySession();
            console.log('[Settings] KeyManager session cleared');
        }

        // Clear RAG config from unified storage and localStorage
        if (Storage.removeConfig) {
            await Storage.removeConfig(STORAGE_KEYS.RAG_CONFIG);
            await Storage.removeConfig(STORAGE_KEYS.RAG_CHECKPOINT);
            await Storage.removeConfig(STORAGE_KEYS.RAG_CHECKPOINT_CIPHER);
        }
        // Also clear from localStorage (backward compat)
        localStorage.removeItem(STORAGE_KEYS.RAG_CONFIG);
        localStorage.removeItem(STORAGE_KEYS.RAG_CHECKPOINT);
        localStorage.removeItem(STORAGE_KEYS.RAG_CHECKPOINT_CIPHER);


        // Get new version for display
        const newVersion = Security.getSessionVersion() || 'new';

        // Show success message
        hideSessionResetModal();
        showToast(`✅ Session reset complete. Now on session v${newVersion}`);

        // Refresh settings modal to show updated state
        setTimeout(async () => {
            hideSettingsModal();
            await showSettingsModal();
        }, 500);

    } catch (error) {
        console.error('Session reset error:', error);
        showToast('Error during reset: ' + error.message);
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Reset Session';
        }
    }
}

// ==========================================
// Provider UI Helper Functions
// ==========================================

/**
 * Handle provider change in settings UI
 * @param {string} provider - New provider id
 */
function onProviderChange(provider) {
    // Update hint text
    const hint = document.getElementById('provider-hint');
    const selectedProvider = LLM_PROVIDERS.find(p => p.id === provider);
    if (hint && selectedProvider) {
        hint.textContent = selectedProvider.description;
    }

    // Show/hide provider-specific sections
    const ollamaSection = document.getElementById('ollama-status');
    const lmstudioSection = document.getElementById('lmstudio-status');
    const openrouterSection = document.getElementById('openrouter-section');
    const geminiSection = document.getElementById('gemini-section');

    if (ollamaSection) ollamaSection.style.display = provider === 'ollama' ? 'block' : 'none';
    if (lmstudioSection) lmstudioSection.style.display = provider === 'lmstudio' ? 'block' : 'none';
    if (openrouterSection) openrouterSection.style.display = provider === 'openrouter' ? 'block' : 'none';
    if (geminiSection) geminiSection.style.display = provider === 'gemini' ? 'block' : 'none';


    // Check Ollama connection if selected
    if (provider === 'ollama') {
        checkOllamaConnection();
    }
}

/**
 * Check Ollama connection status (called on modal open)
 */
async function checkOllamaConnection() {
    const statusEl = document.getElementById('ollama-connection-status');
    if (!statusEl) return;

    // Set checking state
    statusEl.innerHTML = `
        <span class="status-dot checking"></span>
        <span>Checking Ollama connection...</span>
    `;

    try {
        const Ollama = ModuleRegistry.getModuleSync('Ollama');
        if (!Ollama) {
            statusEl.innerHTML = `
                <span class="status-dot error"></span>
                <span>Ollama module not loaded</span>
            `;
            return;
        }

        const result = await Ollama.detectServer();

        if (result.available) {
            statusEl.innerHTML = `
                <span class="status-dot connected"></span>
                <span>Connected to Ollama v${result.version}</span>
            `;
            // Refresh model list
            await refreshOllamaModels();
        } else {
            statusEl.innerHTML = `
                <span class="status-dot error"></span>
                <span>${result.error || 'Cannot connect to Ollama'}</span>
            `;
        }
    } catch (error) {
        statusEl.innerHTML = `
            <span class="status-dot error"></span>
            <span>Error: ${error.message}</span>
        `;
    }
}

/**
 * Test Ollama connection (called by Test button)
 */
async function testOllamaConnection() {
    const endpointInput = document.getElementById('setting-ollama-endpoint');
    if (endpointInput) {
        // Temporarily update the endpoint in Ollama module
        const Ollama = ModuleRegistry.getModuleSync('Ollama');
        const originalEndpoint = Ollama?.getEndpoint?.();
        // Note: The endpoint is read from settings, so we save first
        const tempSettings = getSettings();
        tempSettings.llm.ollamaEndpoint = endpointInput.value;
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(tempSettings));
    }

    await checkOllamaConnection();
    showToast('Ollama connection tested');
}

/**
 * Refresh list of available Ollama models
 */
async function refreshOllamaModels() {
    const modelSelect = document.getElementById('setting-ollama-model');
    const Ollama = ModuleRegistry.getModuleSync('Ollama');
    if (!modelSelect || !Ollama) return;

    try {
        const models = await Ollama.listModels();
        const currentValue = modelSelect.value;

        // Clear and rebuild options
        modelSelect.innerHTML = '';

        if (models.length === 0) {
            modelSelect.innerHTML = '<option value="">No models found - run: ollama pull llama3.2</option>';
            return;
        }

        // Add models to dropdown
        for (const model of models) {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = `${model.name} (${model.sizeGB}GB)`;
            if (model.id === currentValue) {
                option.selected = true;
            }
            modelSelect.appendChild(option);
        }

        // If previous selection not found, select first model
        if (!modelSelect.value && models.length > 0) {
            modelSelect.value = models[0].id;
        }

    } catch (error) {
        // SAFE: Use DOM API instead of innerHTML to prevent XSS from error.message
        modelSelect.innerHTML = '';
        const errorOption = document.createElement('option');
        errorOption.value = '';
        errorOption.textContent = 'Error loading models: ' + (error.message || 'Unknown error');
        modelSelect.appendChild(errorOption);
    }
}
// ==========================================
// Tools Modal Functions
// ==========================================

/**
 * Get the list of enabled tools from storage
 * By default, all tools are enabled
 */
function getEnabledTools() {
    const stored = localStorage.getItem(STORAGE_KEYS.ENABLED_TOOLS);
    if (stored) {
        return safeJsonParse(stored, null);
    }
    // Default: all tools enabled
    return null; // null means "all enabled"
}

/**
 * Save the list of enabled tools
 * @param {string[]|null} enabledTools - Array of enabled tool names, or null for "all enabled"
 */
async function saveEnabledTools(enabledTools) {
    if (enabledTools === null) {
        localStorage.removeItem(STORAGE_KEYS.ENABLED_TOOLS);
    } else {
        localStorage.setItem(STORAGE_KEYS.ENABLED_TOOLS, JSON.stringify(enabledTools));
    }

    // Also save to unified storage
    if (Storage.setConfig) {
        try {
            await Storage.setConfig(STORAGE_KEYS.ENABLED_TOOLS, enabledTools);
        } catch (e) {
            console.warn('[Settings] Failed to save enabled tools to unified storage:', e);
        }
    }
}

/**
 * Check if a specific tool is enabled
 * @param {string} toolName - Name of the tool
 * @returns {boolean} Whether the tool is enabled
 */
function isToolEnabled(toolName) {
    const enabledTools = getEnabledTools();
    if (enabledTools === null) return true; // All enabled
    return enabledTools.includes(toolName);
}

/**
 * Get all function schemas organized by category
 */
function getToolsByCategory() {
    const categories = {
        data: {
            name: '📊 Data Queries',
            description: 'Core functions for querying your listening history',
            tools: []
        },
        analytics: {
            name: '📈 Analytics',
            description: 'Stats.fm and Wrapped-style deep analytics',
            tools: []
        },
        templates: {
            name: '🎭 Template Profiles',
            description: 'Explore curated profiles and AI synthesis',
            tools: []
        }
    };

    // Data query tools
    const dataSchemas = DataQuerySchemas || [];
    for (const schema of dataSchemas) {
        categories.data.tools.push({
            name: schema.function.name,
            description: schema.function.description
        });
    }

    // Analytics tools
    const analyticsSchemas = AnalyticsQuerySchemas || [];
    for (const schema of analyticsSchemas) {
        categories.analytics.tools.push({
            name: schema.function.name,
            description: schema.function.description
        });
    }

    // Template tools
    const templateSchemas = TemplateQuerySchemas || [];
    for (const schema of templateSchemas) {
        categories.templates.tools.push({
            name: schema.function.name,
            description: schema.function.description
        });
    }

    return categories;
}

/**
 * Show the tools modal
 */
function showToolsModal() {
    // Remove existing modal if present
    const existing = document.getElementById('tools-modal');
    if (existing) {
        existing.remove();
    }

    const categories = getToolsByCategory();
    const enabledTools = getEnabledTools();
    const allTools = [
        ...categories.data.tools,
        ...categories.analytics.tools,
        ...categories.templates.tools
    ];

    // Check if all tools are enabled
    const allEnabled = enabledTools === null || enabledTools.length === allTools.length;

    const modal = document.createElement('div');
    modal.id = 'tools-modal';
    modal.className = 'tools-modal';
    modal.innerHTML = `
        <div class="tools-overlay" data-action="hide-tools-modal"></div>
        <div class="tools-content">
            <div class="tools-header">
                <h2>🧰 AI Tools</h2>
                <button class="tools-close" data-action="hide-tools-modal">×</button>
            </div>
            
            <div class="tools-body">
                <p class="tools-description">
                    Enable or disable specific tools to control what the AI can access. 
                    Disabling unnecessary tools reduces token usage and can improve response quality.
                </p>
                
                <!-- Bulk Actions -->
                <div class="tools-bulk-actions">
                    <label class="tool-toggle bulk-toggle">
                        <input type="checkbox" id="toggle-all-tools" ${allEnabled ? 'checked' : ''} 
                               data-change-action="toggle-all-tools">
                        <span class="toggle-slider"></span>
                        <span class="toggle-label"><strong>Enable All Tools</strong></span>
                    </label>
                    <span class="tools-count" id="tools-count">${enabledTools === null ? allTools.length : enabledTools.length}/${allTools.length} enabled</span>
                </div>
                
                <!-- Categories -->
                ${Object.entries(categories).map(([key, category]) => `
                    <div class="tools-category">
                        <h3>${category.name}</h3>
                        <p class="category-description">${category.description}</p>
                        <div class="tools-list">
                            ${category.tools.map(tool => `
                                <label class="tool-toggle" title="${tool.description}">
                                    <input type="checkbox"
                                           data-tool="${tool.name}"
                                           ${enabledTools === null || enabledTools.includes(tool.name) ? 'checked' : ''}
                                           data-change-action="toggle-tool" data-tool-name="${tool.name}">
                                    <span class="toggle-slider"></span>
                                    <span class="toggle-label">
                                        <code>${tool.name}</code>
                                        <span class="tool-desc">${truncateDescription(tool.description, 60)}</span>
                                    </span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div class="tools-footer">
                <button class="btn btn-secondary" data-action="hide-tools-modal">Close</button>
                <button class="btn btn-primary" data-action="save-tools">Save Changes</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Set up focus trap for accessibility (WCAG 2.1.2)
    // Clean up any existing trap first
    if (toolsFocusTrapCleanup) {
        toolsFocusTrapCleanup();
        toolsFocusTrapCleanup = null;
    }
    toolsFocusTrapCleanup = setupModalFocusTrap('tools-modal', () => hideToolsModal());

    // Event delegation for tools modal actions
    modal.addEventListener('click', (e) => {
        const actionElement = e.target.closest('[data-action]');
        if (!actionElement) return;

        const action = actionElement.dataset.action;
        switch (action) {
            case 'hide-tools-modal':
                hideToolsModal();
                break;
            case 'save-tools':
                saveToolsAndClose();
                break;
        }
    });

    modal.addEventListener('change', (e) => {
        const actionElement = e.target.closest('[data-change-action]');
        if (!actionElement) return;

        const action = actionElement.dataset.changeAction;
        switch (action) {
            case 'toggle-all-tools':
                onToggleAllTools(e.target.checked);
                break;
            case 'toggle-tool': {
                const toolName = actionElement.dataset.toolName;
                onToolToggle(toolName, e.target.checked);
                break;
            }
        }
    });

    // Note: Escape key handling is now done by the focus trap
}

/**
 * Truncate description for display
 * Uses Array.from to properly handle Unicode surrogate pairs
 */
function truncateDescription(text, maxLength) {
    if (text.length <= maxLength) return text;
    // Use Array.from to properly handle Unicode (emojis, CJK characters)
    // which prevents splitting multi-byte characters during truncation
    const chars = Array.from(text);
    if (chars.length <= maxLength) return text;
    return chars.slice(0, maxLength - 3).join('') + '...';
}

/**
 * Hide the tools modal
 */
function hideToolsModal() {
    // Clean up focus trap first (restores focus to previous element)
    if (toolsFocusTrapCleanup) {
        toolsFocusTrapCleanup();
        toolsFocusTrapCleanup = null;
    }

    const modal = document.getElementById('tools-modal');
    if (modal) {
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), UI_CONFIG.MODAL_CLOSE_DELAY_MS);
    }
}

/**
 * Handle individual tool toggle
 */
function onToolToggle(toolName, enabled) {
    // Get current enabled tools
    let enabledTools = getEnabledTools();
    const allTools = getAllToolNames();

    // If null (all enabled), convert to full array first
    if (enabledTools === null) {
        enabledTools = [...allTools];
    }

    if (enabled && !enabledTools.includes(toolName)) {
        enabledTools.push(toolName);
    } else if (!enabled) {
        enabledTools = enabledTools.filter(t => t !== toolName);
    }

    // Update count display
    updateToolsCount(enabledTools.length, allTools.length);

    // Update "Enable All" checkbox state
    const toggleAll = document.getElementById('toggle-all-tools');
    if (toggleAll) {
        toggleAll.checked = enabledTools.length === allTools.length;
        toggleAll.indeterminate = enabledTools.length > 0 && enabledTools.length < allTools.length;
    }

    // Store temporarily (will be saved on "Save Changes")
    document.getElementById('tools-modal').dataset.pending = JSON.stringify(enabledTools);
}

/**
 * Handle toggle all tools
 */
function onToggleAllTools(enabled) {
    const allTools = getAllToolNames();
    const checkboxes = document.querySelectorAll('#tools-modal input[data-tool]');

    checkboxes.forEach(cb => {
        cb.checked = enabled;
    });

    const enabledTools = enabled ? [...allTools] : [];
    updateToolsCount(enabledTools.length, allTools.length);

    // Store temporarily
    document.getElementById('tools-modal').dataset.pending = JSON.stringify(enabledTools);
}

/**
 * Get all tool names from schemas
 */
function getAllToolNames() {
    const schemas = Functions?.getAllSchemas?.() || [];
    return schemas.map(s => s.function.name);
}

/**
 * Update the enabled tools count display
 */
function updateToolsCount(enabled, total) {
    const countEl = document.getElementById('tools-count');
    if (countEl) {
        countEl.textContent = `${enabled}/${total} enabled`;
    }
}

/**
 * Save tools settings and close modal
 */
async function saveToolsAndClose() {
    const modal = document.getElementById('tools-modal');
    const pendingData = modal?.dataset.pending;
    const saveButton = document.querySelector('[data-action="save-tools"]');
    const originalButtonText = saveButton?.textContent || 'Save Changes';

    // Set loading state
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.classList.add('btn-loading');
        saveButton.innerHTML = '<span class="btn-spinner"></span> Saving...';
    }

    try {
        if (pendingData) {
            // Parse JSON with error handling (CRITICAL FIX - prevents crash on malformed data)
            const enabledTools = safeJsonParse(pendingData, []);

            const allTools = getAllToolNames();

            // If all tools are enabled, store null (default)
            if (enabledTools.length === allTools.length) {
                await saveEnabledTools(null);
            } else {
                await saveEnabledTools(enabledTools);
            }

            console.log(`[Settings] Saved ${enabledTools.length}/${allTools.length} tools enabled`);
        }

        hideToolsModal();
        showToast('Tool settings saved!', 'success');
    } catch (error) {
        console.error('[Settings] Failed to save tools:', error);
        showToast('Failed to save tools: ' + error.message, 'error');
    } finally {
        // Reset button state
        if (saveButton && document.body.contains(saveButton)) {
            saveButton.disabled = false;
            saveButton.classList.remove('btn-loading');
            saveButton.textContent = originalButtonText;
        }
    }
}

// ==========================================
// Cross-Tab Synchronization
// ==========================================

/**
 * Initialize cross-tab synchronization for settings
 * Listens for storage events from other tabs and reloads settings when changed
 */
function initCrossTabSync() {
    // Listen for storage events from other tabs
    window.addEventListener('storage', (e) => {
        if (e.key === 'rhythm_chamber_settings_version' && e.newValue && e.newValue !== e.oldValue) {
            console.log('[Settings] Detected settings change in another tab, reloading...');
            // Reload settings from IndexedDB
            getSettingsAsync().then(settings => {
                _cachedSettings = settings;
                // Emit event for UI to update
                EventBus.emit('settings:changed', settings);
            }).catch(err => {
                console.warn('[Settings] Failed to reload settings after cross-tab change:', err);
            });
        }
    });

    console.log('[Settings] Cross-tab synchronization initialized');
}

// Initialize cross-tab sync on module load
initCrossTabSync();

// ES Module export
export const Settings = {
    getSettings,
    getSettingsAsync,
    saveSettings,
    clearSettings,
    getSetting,
    getContextWindow,
    hasApiKey,
    hasSpotifyConfig,
    showSettingsModal,
    hideSettingsModal,
    saveFromModal,
    togglePasswordVisibility,
    copyToClipboard,
    showToast,
    generateEmbeddings,
    resumeEmbeddings,
    cancelEmbeddings,
    showSessionResetModal,
    hideSessionResetModal,
    confirmSessionReset,
    refreshTravelStatusUI,
    toggleTravelMode,
    verifyIdentity,
    // Provider UI helpers
    onProviderChange,
    checkOllamaConnection,
    testOllamaConnection,
    refreshOllamaModels,
    // Tools modal
    showToolsModal,
    hideToolsModal,
    onToolToggle,
    onToggleAllTools,
    saveToolsAndClose,
    getEnabledTools,
    isToolEnabled,
    // Constants
    AVAILABLE_MODELS,
    LLM_PROVIDERS,
    DEFAULT_ENDPOINTS
};


console.log('[Settings] Module loaded');

