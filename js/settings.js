/**
 * Settings Module for Rhythm Chamber
 * 
 * Handles in-app configuration display for AI and Spotify settings.
 * The source of truth is config.js - this module provides a UI to view
 * and optionally override those settings via localStorage.
 */

import { ModuleRegistry } from './module-registry.js';
import { StorageBreakdownUI } from './storage-breakdown-ui.js';

// Available LLM providers
const LLM_PROVIDERS = [
    { id: 'ollama', name: 'Ollama (Local)', description: 'Run AI models on your own hardware - zero data transmission' },
    { id: 'lmstudio', name: 'LM Studio (Local)', description: 'User-friendly local AI with OpenAI-compatible API' },
    { id: 'openrouter', name: 'OpenRouter (Cloud)', description: 'Optional cloud provider for premium models' }
];

// Default endpoints for local providers
const DEFAULT_ENDPOINTS = {
    ollama: 'http://localhost:11434',
    lmstudio: 'http://localhost:1234/v1'
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

// Priority 2: Module-level AbortController for embedding cancellation
let currentEmbeddingAbortController = null;

/**
 * Get current settings - reads directly from window.Config (source of truth)
 * Falls back to localStorage overrides, then IndexedDB (after migration).
 * SYNC version for backward compatibility - use getSettingsAsync for full unified storage support.
 */
function getSettings() {
    // Read directly from config.js as the source of truth
    const configOpenrouter = window.Config?.openrouter || {};
    const configSpotify = window.Config?.spotify || {};

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
        spotify: {
            clientId: configSpotify.clientId || ''
        }
    };

    // Only apply localStorage overrides for fields that are empty/placeholder in config.js
    // After migration, this will be empty and fall through to defaults
    const stored = localStorage.getItem('rhythm_chamber_settings');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            applySettingsOverrides(settings, parsed);
        } catch (e) {
            console.error('Failed to parse stored settings:', e);
        }
    }

    return settings;
}

/**
 * Get settings from unified storage (async version)
 * HNW: Single point of truth through unified storage API
 * @returns {Promise<Object>} Settings object
 */
async function getSettingsAsync() {
    // Read directly from config.js as the source of truth
    const configOpenrouter = window.Config?.openrouter || {};
    const configSpotify = window.Config?.spotify || {};

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
        spotify: {
            clientId: configSpotify.clientId || ''
        }
    };

    // Try unified storage first (IndexedDB after migration)
    if (window.Storage?.getConfig) {
        try {
            const storedConfig = await window.Storage.getConfig('rhythm_chamber_settings');
            if (storedConfig) {
                applySettingsOverrides(settings, storedConfig);
                return settings;
            }
        } catch (e) {
            console.warn('[Settings] Failed to read from unified storage:', e);
        }
    }

    // Fall back to localStorage (pre-migration or if IndexedDB fails)
    const stored = localStorage.getItem('rhythm_chamber_settings');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            applySettingsOverrides(settings, parsed);
        } catch (e) {
            console.error('Failed to parse stored settings:', e);
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

    // Only use stored Spotify client ID if config.js has placeholder or empty
    if (parsed.spotify?.clientId &&
        (!settings.spotify.clientId || settings.spotify.clientId === 'your-spotify-client-id')) {
        settings.spotify.clientId = parsed.spotify.clientId;
    }
}

/**
 * Save user overrides to unified storage (IndexedDB) with localStorage sync fallback
 * HNW: Storage module is the single authority for persistence
 * Note: This does NOT modify config.js - it stores overrides
 */
async function saveSettings(settings) {
    // Try unified storage first (IndexedDB)
    if (window.Storage?.setConfig) {
        try {
            await window.Storage.setConfig('rhythm_chamber_settings', settings);
            console.log('[Settings] Saved to unified storage');
        } catch (e) {
            console.warn('[Settings] Failed to save to unified storage:', e);
        }
    }

    // Also save to localStorage as sync fallback (for pre-migration reads)
    localStorage.setItem('rhythm_chamber_settings', JSON.stringify(settings));

    // Update the runtime Config object so changes take effect immediately
    if (window.Config) {
        if (settings.openrouter) {
            window.Config.openrouter = {
                ...window.Config.openrouter,
                apiKey: settings.openrouter.apiKey || window.Config.openrouter?.apiKey,
                model: settings.openrouter.model,
                maxTokens: settings.openrouter.maxTokens,
                temperature: settings.openrouter.temperature,
                contextWindow: settings.openrouter.contextWindow,
                apiUrl: window.Config.openrouter?.apiUrl || 'https://openrouter.ai/api/v1/chat/completions'
            };
        }
        if (settings.spotify?.clientId) {
            window.Config.spotify = {
                ...window.Config.spotify,
                clientId: settings.spotify.clientId
            };
        }
    }

    console.log('Settings saved and applied to runtime Config');
}

/**
 * Clear all stored setting overrides
 */
async function clearSettings() {
    // Clear from unified storage
    if (window.Storage?.removeConfig) {
        try {
            await window.Storage.removeConfig('rhythm_chamber_settings');
        } catch (e) {
            console.warn('[Settings] Failed to clear from unified storage:', e);
        }
    }
    // Also clear localStorage
    localStorage.removeItem('rhythm_chamber_settings');
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
    const key = window.Config?.openrouter?.apiKey;
    return key && key !== '' && key !== 'your-api-key-here';
}

/**
 * Check if Spotify is configured (in config.js or localStorage)
 */
function hasSpotifyConfig() {
    const clientId = window.Config?.spotify?.clientId;
    return clientId && clientId !== '' && clientId !== 'your-spotify-client-id';
}

/**
 * Create and show the settings modal
 */
function showSettingsModal() {
    // Remove existing modal if present
    const existing = document.getElementById('settings-modal');
    if (existing) {
        existing.remove();
    }

    const settings = getSettings();

    // Determine if API key is from config.js (show masked) or needs to be entered
    const hasConfigKey = window.Config?.openrouter?.apiKey &&
        window.Config.openrouter.apiKey !== 'your-api-key-here';
    const apiKeyDisplay = hasConfigKey ? settings.openrouter.apiKey : '';

    const hasConfigSpotify = window.Config?.spotify?.clientId &&
        window.Config.spotify.clientId !== 'your-spotify-client-id';
    const spotifyDisplay = hasConfigSpotify ? settings.spotify.clientId : '';

    const modal = document.createElement('div');
    modal.id = 'settings-modal';
    modal.className = 'settings-modal';
    modal.innerHTML = `
        <div class="settings-overlay" onclick="Settings.hideSettingsModal()"></div>
        <div class="settings-content">
            <div class="settings-header">
                <h2>⚙️ Settings</h2>
                <button class="settings-close" onclick="Settings.hideSettingsModal()">×</button>
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
                        <select id="setting-llm-provider" onchange="Settings.onProviderChange(this.value)">
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
                            <button class="btn btn-small" onclick="Settings.testOllamaConnection()">Test</button>
                        </div>
                        <div class="settings-field">
                            <label for="setting-ollama-model">Model</label>
                            <select id="setting-ollama-model">
                                <option value="${settings.ollama.model}">${settings.ollama.model}</option>
                            </select>
                            <button class="btn btn-small" onclick="Settings.refreshOllamaModels()">↻ Refresh</button>
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
                                   autocomplete="off">
                            <button class="btn-show-password" onclick="Settings.togglePasswordVisibility('setting-api-key', this)">Show</button>
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
                    
                    <!-- Common Parameters (all providers) -->
                    <div class="settings-row">
                        <div class="settings-field">
                            <label for="setting-max-tokens">Max Response Length</label>
                            <input type="number" id="setting-max-tokens" 
                                   value="${settings.openrouter.maxTokens}" 
                                   min="100" max="8000" step="100">
                            <span class="settings-hint">tokens (higher = longer responses)</span>
                        </div>
                        
                        <div class="settings-field">
                            <label for="setting-temperature">Temperature</label>
                            <input type="range" id="setting-temperature" 
                                   value="${settings.openrouter.temperature}" 
                                   min="0" max="2" step="0.1">
                            <span class="settings-hint" id="temp-value">${settings.openrouter.temperature} (${settings.openrouter.temperature < 0.4 ? 'focused' : settings.openrouter.temperature > 1.0 ? 'creative' : 'balanced'})</span>
                        </div>
                    </div>

                    <!-- Context Window Configuration -->
                    <div class="settings-field">
                        <label for="setting-context-window">Context Window Size</label>
                        <input type="number" id="setting-context-window" 
                               value="${settings.openrouter.contextWindow}" 
                               min="1024" max="128000" step="1024">
                        <span class="settings-hint">tokens (default: 4096, adjust based on your model)</span>
                    </div>
                    
                    <!-- Advanced Parameters (collapsible) -->
                    <details class="settings-advanced">
                        <summary>Advanced Parameters</summary>
                        <div class="settings-row">
                            <div class="settings-field">
                                <label for="setting-top-p">Top P (Nucleus Sampling)</label>
                                <input type="range" id="setting-top-p" 
                                       value="${settings.openrouter.topP}" 
                                       min="0" max="1" step="0.05">
                                <span class="settings-hint" id="top-p-value">${settings.openrouter.topP}</span>
                            </div>
                            
                            <div class="settings-field">
                                <label for="setting-freq-penalty">Frequency Penalty</label>
                                <input type="range" id="setting-freq-penalty" 
                                       value="${settings.openrouter.frequencyPenalty}" 
                                       min="-2" max="2" step="0.1">
                                <span class="settings-hint" id="freq-penalty-value">${settings.openrouter.frequencyPenalty}</span>
                            </div>
                        </div>
                        
                        <div class="settings-field">
                            <label for="setting-pres-penalty">Presence Penalty</label>
                            <input type="range" id="setting-pres-penalty" 
                                   value="${settings.openrouter.presencePenalty}" 
                                   min="-2" max="2" step="0.1">
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
                        <button class="btn-copy" onclick="Settings.copyToClipboard('${window.location.origin}/app.html', this)">Copy</button>
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
                    
                    <p class="settings-description">
                        RAG-powered semantic search using your own Qdrant cluster.
                        Connect your cluster to ask natural questions about your listening history.
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
                                <button class="btn btn-secondary" id="travel-mode-btn" onclick="Settings.toggleTravelMode()">
                                    I am traveling / on VPN
                                </button>
                                <button class="btn btn-primary" id="verify-identity-btn" onclick="Settings.verifyIdentity()">
                                    Verify with Spotify
                                </button>
                            </div>
                            <p class="settings-hint" id="travel-status-text">Helps prevent false lockouts while traveling.</p>
                        </div>
                    </div>
                    
                    <div class="settings-field">
                        <label for="setting-qdrant-url">Qdrant Cluster URL</label>
                        <input type="text" id="setting-qdrant-url" 
                               value="${ModuleRegistry.getModuleSync('RAG')?.getConfig()?.qdrantUrl || ''}" 
                               placeholder="https://xyz-abc.cloud.qdrant.io:6333"
                               autocomplete="off">
                        <span class="settings-hint">Get a free cluster at <a href="https://cloud.qdrant.io" target="_blank">cloud.qdrant.io</a></span>
                    </div>
                    
                    <div class="settings-field">
                        <label for="setting-qdrant-key">Qdrant API Key</label>
                        <input type="password" id="setting-qdrant-key" 
                               value="${ModuleRegistry.getModuleSync('RAG')?.getConfig()?.qdrantApiKey || ''}" 
                               placeholder="Enter your Qdrant API key"
                               autocomplete="off">
                        <button class="btn-show-password" onclick="Settings.togglePasswordVisibility('setting-qdrant-key', this)">Show</button>
                    </div>
                    
                    <div class="settings-field">
                        <button class="btn btn-primary" id="generate-embeddings-btn" onclick="Settings.generateEmbeddings()">
                            ${ModuleRegistry.getModuleSync('RAG')?.isConfigured() ? '🔄 Regenerate Embeddings' : '⚡ Generate Embeddings'}
                        </button>
                        ${ModuleRegistry.getModuleSync('RAG')?.getCheckpoint?.() ? `
                            <button class="btn btn-secondary" id="resume-embeddings-btn" onclick="Settings.resumeEmbeddings()">
                                ▶️ Resume
                            </button>
                        ` : ''}
                        ${ModuleRegistry.getModuleSync('RAG')?.isConfigured() ? `
                            <span class="settings-hint success">✓ ${ModuleRegistry.getModuleSync('RAG').getConfig()?.chunksCount || 0} chunks indexed</span>
                        ` : ModuleRegistry.getModuleSync('RAG')?.getCheckpoint?.() ? `
                            <span class="settings-hint warning">⚠️ Interrupted - click Resume to continue</span>
                        ` : `
                            <span class="settings-hint">Required after adding your Qdrant credentials</span>
                        `}
                    </div>
                    
                    <div id="embedding-progress" class="embedding-progress" style="display: none;">
                        <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
                        <div class="progress-actions">
                            <span class="progress-text" id="progress-text">Processing...</span>
                            <button class="btn btn-secondary btn-sm" id="cancel-embeddings-btn" onclick="Settings.cancelEmbeddings()">
                                ✕ Cancel
                            </button>
                        </div>
                    </div>
                    
                    <!-- Session Reset with Cryptographic Proof -->
                    <div class="settings-field session-controls">
                        <button class="btn btn-danger-outline" onclick="Settings.showSessionResetModal()">
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
                <button class="btn btn-secondary" onclick="Settings.hideSettingsModal()">Close</button>
                <button class="btn btn-primary" onclick="Settings.saveFromModal()">Save Changes</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Initialize travel/VPN override status UI
    refreshTravelStatusUI();

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

    // Add escape key listener
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideSettingsModal();
        }
    });

    // Initialize storage breakdown UI
    initStorageBreakdown();
}

/**
 * Hide the settings modal
 */
function hideSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 200);
    }
}

/**
 * Update the travel/VPN override UI state
 */
function refreshTravelStatusUI() {
    const statusEl = document.getElementById('travel-status-text');
    const travelBtn = document.getElementById('travel-mode-btn');

    if (!statusEl || !travelBtn) return;

    const travelStatus = window.Security?.getTravelOverrideStatus?.() || { active: false };

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
    if (!window.Security?.setTravelOverride || !window.Security?.getTravelOverrideStatus) {
        showToast('Security module not loaded');
        return;
    }

    const travelStatus = window.Security.getTravelOverrideStatus();

    if (travelStatus.active) {
        window.Security.clearTravelOverride?.();
        showToast('Travel mode disabled. Geographic anomaly detection is back to normal.');
    } else {
        window.Security.setTravelOverride(12, 'user_travel_override');
        window.Security.clearSecurityLockout?.();
        showToast('Travel mode enabled for 12 hours. Geo anomaly checks are relaxed for VPN/travel.');
    }

    refreshTravelStatusUI();
}

/**
 * Fallback identity verification for geo lockouts
 * Rebinds via Spotify OAuth to prove legitimacy
 */
async function verifyIdentity() {
    if (!window.Spotify?.isConfigured?.()) {
        showToast('Add your Spotify Client ID before verifying identity.');
        return;
    }

    try {
        window.Security?.clearSecurityLockout?.();
        window.Security?.setTravelOverride?.(12, 'verified_travel');
        window.Security?.clearTokenBinding?.();
        window.Spotify?.clearTokens?.();

        showToast('Redirecting to Spotify to verify identity...');
        await window.Spotify.initiateLogin();
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
        container.innerHTML = `<div class="storage-error">Failed to load storage breakdown: ${error.message}</div>`;
    }
}

/**
 * Save settings from the modal form
 */
function saveFromModal() {
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

    const spotifyInput = document.getElementById('setting-spotify-client-id');

    // Only save API key if user actually entered one (field not readonly)
    const apiKey = apiKeyInput?.readOnly ? null : apiKeyInput?.value?.trim();
    const spotifyClientId = spotifyInput?.readOnly ? null : spotifyInput?.value?.trim();

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

    saveSettings(settings);

    // Save Qdrant settings
    const RAG = ModuleRegistry.getModuleSync('RAG');
    if (RAG) {
        const qdrantUrl = document.getElementById('setting-qdrant-url')?.value?.trim();
        const qdrantKey = document.getElementById('setting-qdrant-key')?.value?.trim();

        if (qdrantUrl || qdrantKey) {
            const ragConfig = RAG.getConfig() || {};
            RAG.saveConfig({
                ...ragConfig,
                qdrantUrl: qdrantUrl || ragConfig.qdrantUrl,
                qdrantApiKey: qdrantKey || ragConfig.qdrantApiKey
            });
        }
    }

    hideSettingsModal();

    // Show confirmation
    showToast('Settings saved!');
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
function showToast(message, duration = 2000) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
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

    // First save any unsaved Qdrant settings
    const qdrantUrl = document.getElementById('setting-qdrant-url')?.value?.trim();
    const qdrantKey = document.getElementById('setting-qdrant-key')?.value?.trim();

    if (!qdrantUrl || !qdrantKey) {
        showToast('Please enter your Qdrant URL and API key first');
        return;
    }

    // Save credentials
    const ragConfig = RAG.getConfig() || {};
    RAG.saveConfig({
        ...ragConfig,
        qdrantUrl,
        qdrantApiKey: qdrantKey
    });

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
        // Test connection first
        progressText.textContent = 'Testing Qdrant connection...';

        try {
            await RAG.testConnection();
        } catch (connErr) {
            showToast('Qdrant connection failed: ' + connErr.message);
            if (progressContainer) progressContainer.style.display = 'none';
            if (generateBtn) generateBtn.disabled = false;
            if (resumeBtn) resumeBtn.disabled = false;
            if (cancelBtn) cancelBtn.style.display = 'none';
            currentEmbeddingAbortController = null;
            return;
        }

        // Generate embeddings with progress callback and abort signal
        await RAG.generateEmbeddings((current, total, message) => {
            const percent = Math.round((current / total) * 100);
            if (progressFill) progressFill.style.width = `${percent}%`;
            if (progressText) progressText.textContent = message;
        }, { resume }, abortController.signal);

        showToast('🎉 Embeddings generated successfully!');

        // Refresh the modal to show updated status
        setTimeout(() => {
            hideSettingsModal();
            showSettingsModal();
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
    const currentVersion = window.Security?.getSessionVersion?.() || 1;
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
        <div class="session-reset-overlay" onclick="Settings.hideSessionResetModal()"></div>
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
                            <li>Require re-entering your Qdrant API key</li>
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
                <button class="btn btn-secondary" onclick="Settings.hideSessionResetModal()">Cancel</button>
                <button class="btn btn-danger" id="confirm-reset-btn" onclick="Settings.confirmSessionReset()">
                    Reset Session
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

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
        setTimeout(() => modal.remove(), 200);
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
        if (window.Security?.clearSessionData) {
            await window.Security.clearSessionData();
        } else if (window.Security?.invalidateSessions) {
            window.Security.invalidateSessions();
        }

        // Clear RAG config from unified storage and localStorage
        if (window.Storage?.removeConfig) {
            await window.Storage.removeConfig('rhythm_chamber_rag');
            await window.Storage.removeConfig('rhythm_chamber_rag_checkpoint');
            await window.Storage.removeConfig('rhythm_chamber_rag_checkpoint_cipher');
        }
        // Also clear from localStorage (backward compat)
        localStorage.removeItem('rhythm_chamber_rag');
        localStorage.removeItem('rhythm_chamber_rag_checkpoint');
        localStorage.removeItem('rhythm_chamber_rag_checkpoint_cipher');


        // Get new version for display
        const newVersion = window.Security?.getSessionVersion?.() || 'new';

        // Show success message
        hideSessionResetModal();
        showToast(`✅ Session reset complete. Now on session v${newVersion}`);

        // Refresh settings modal to show updated state
        setTimeout(() => {
            hideSettingsModal();
            showSettingsModal();
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
// Storage Mode Mismatch Modal
// Priority 1: Storage Mode Migration Detection
// ==========================================

/**
 * Show modal when storage mode has changed requiring embedding regeneration
 * @param {string} currentMode - Current storage mode ('local' or 'qdrant')
 * @param {string} savedMode - Previously saved storage mode
 */
function showStorageMismatchModal(currentMode, savedMode) {
    // Remove existing modal if present
    const existing = document.getElementById('storage-mismatch-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'storage-mismatch-modal';
    modal.className = 'storage-mismatch-modal';
    modal.innerHTML = `
        <div class="storage-mismatch-overlay"></div>
        <div class="storage-mismatch-content">
            <div class="storage-mismatch-header">
                <h2>⚠️ Semantic Search Mode Changed</h2>
            </div>
            
            <div class="storage-mismatch-body">
                <div class="mismatch-warning">
                    <span class="warning-icon">🔄</span>
                    <div class="warning-text">
                        <p>Your semantic search mode has changed from <strong>${savedMode}</strong> 
                           to <strong>${currentMode}</strong>.</p>
                        <p>Your existing embeddings are incompatible with the new mode. 
                           Please regenerate embeddings to continue using semantic search in chat.</p>
                    </div>
                </div>
                
                <div class="mismatch-impact">
                    <h4>What this means:</h4>
                    <ul>
                        <li>Chat will work without semantic search context</li>
                        <li>Embeddings need to be regenerated for the new mode</li>
                        <li>This typically takes 1-5 minutes depending on data size</li>
                    </ul>
                </div>
            </div>
            
            <div class="storage-mismatch-footer">
                <button class="btn btn-primary" id="regenerate-embeddings-btn">
                    🔄 Regenerate Embeddings
                </button>
                <button class="btn btn-secondary" id="dismiss-mismatch-btn">
                    Dismiss (Continue without semantic search)
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Wire up buttons
    document.getElementById('regenerate-embeddings-btn').onclick = () => {
        hideStorageMismatchModal();
        showSettingsModal();
        // Auto-navigate to embedding section after modal opens
        setTimeout(() => {
            const embeddingSection = document.querySelector('.premium-section');
            if (embeddingSection) {
                embeddingSection.scrollIntoView({ behavior: 'smooth' });
            }
        }, 300);
    };

    document.getElementById('dismiss-mismatch-btn').onclick = () => {
        hideStorageMismatchModal();
        showToast('Semantic search disabled. Regenerate embeddings in Settings when ready.');
    };

    // Add escape key listener
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            hideStorageMismatchModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    console.log('[Settings] Storage mismatch modal shown');
}

/**
 * Hide the storage mismatch modal
 */
function hideStorageMismatchModal() {
    const modal = document.getElementById('storage-mismatch-modal');
    if (modal) {
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 200);
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

    if (ollamaSection) ollamaSection.style.display = provider === 'ollama' ? 'block' : 'none';
    if (lmstudioSection) lmstudioSection.style.display = provider === 'lmstudio' ? 'block' : 'none';
    if (openrouterSection) openrouterSection.style.display = provider === 'openrouter' ? 'block' : 'none';

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
        localStorage.setItem('rhythm_chamber_settings', JSON.stringify(tempSettings));
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
        modelSelect.innerHTML = `<option value="">Error loading models: ${error.message}</option>`;
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
    const stored = localStorage.getItem('rhythm_chamber_enabled_tools');
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (e) {
            console.error('[Settings] Failed to parse enabled tools:', e);
        }
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
        localStorage.removeItem('rhythm_chamber_enabled_tools');
    } else {
        localStorage.setItem('rhythm_chamber_enabled_tools', JSON.stringify(enabledTools));
    }

    // Also save to unified storage
    if (window.Storage?.setConfig) {
        try {
            await window.Storage.setConfig('rhythm_chamber_enabled_tools', enabledTools);
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
    const dataSchemas = window.DataQuerySchemas || [];
    for (const schema of dataSchemas) {
        categories.data.tools.push({
            name: schema.function.name,
            description: schema.function.description
        });
    }

    // Analytics tools
    const analyticsSchemas = window.AnalyticsQuerySchemas || [];
    for (const schema of analyticsSchemas) {
        categories.analytics.tools.push({
            name: schema.function.name,
            description: schema.function.description
        });
    }

    // Template tools
    const templateSchemas = window.TemplateQuerySchemas || [];
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
        <div class="tools-overlay" onclick="Settings.hideToolsModal()"></div>
        <div class="tools-content">
            <div class="tools-header">
                <h2>🧰 AI Tools</h2>
                <button class="tools-close" onclick="Settings.hideToolsModal()">×</button>
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
                               onchange="Settings.onToggleAllTools(this.checked)">
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
                                           onchange="Settings.onToolToggle('${tool.name}', this.checked)">
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
                <button class="btn btn-secondary" onclick="Settings.hideToolsModal()">Close</button>
                <button class="btn btn-primary" onclick="Settings.saveToolsAndClose()">Save Changes</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Add escape key listener
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideToolsModal();
        }
    });
}

/**
 * Truncate description for display
 */
function truncateDescription(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Hide the tools modal
 */
function hideToolsModal() {
    const modal = document.getElementById('tools-modal');
    if (modal) {
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 200);
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
    const schemas = window.Functions?.getAllSchemas?.() || [];
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

    if (pendingData) {
        const enabledTools = JSON.parse(pendingData);
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
    showToast('Tool settings saved!');
}

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
    // Storage mode mismatch modal (Priority 1)
    showStorageMismatchModal,
    hideStorageMismatchModal,
    // Constants
    AVAILABLE_MODELS,
    LLM_PROVIDERS,
    DEFAULT_ENDPOINTS
};

// Keep window global for backwards compatibility
if (typeof window !== 'undefined') {
    window.Settings = Settings;
}

console.log('[Settings] Module loaded');

