/**
 * Settings Module for Rhythm Chamber
 * 
 * Handles in-app configuration display for AI and Spotify settings.
 * The source of truth is config.js - this module provides a UI to view
 * and optionally override those settings via localStorage.
 */

// Available models for the dropdown
const AVAILABLE_MODELS = [
    { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B (Free)', free: true },
    { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (Free)', free: true },
    { id: 'google/gemma-2-9b-it:free', name: 'Gemma 2 9B (Free)', free: true },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini ($)', free: false },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet ($)', free: false },
    { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo ($)', free: false }
];

/**
 * Get current settings - reads directly from window.Config (source of truth)
 * Falls back to localStorage overrides only if config.js values are missing
 */
function getSettings() {
    // Read directly from config.js as the source of truth
    const configOpenrouter = window.Config?.openrouter || {};
    const configSpotify = window.Config?.spotify || {};

    // Build settings object from config.js
    const settings = {
        openrouter: {
            apiKey: configOpenrouter.apiKey || '',
            model: configOpenrouter.model || 'mistralai/mistral-7b-instruct:free',
            maxTokens: configOpenrouter.maxTokens || 1000,
            temperature: configOpenrouter.temperature ?? 0.7
        },
        spotify: {
            clientId: configSpotify.clientId || ''
        }
    };

    // Only apply localStorage overrides for fields that are empty/placeholder in config.js
    const stored = localStorage.getItem('rhythm_chamber_settings');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);

            // Only use localStorage API key if config.js has placeholder or empty
            if (parsed.openrouter?.apiKey &&
                (!settings.openrouter.apiKey || settings.openrouter.apiKey === 'your-api-key-here')) {
                settings.openrouter.apiKey = parsed.openrouter.apiKey;
            }

            // Only use localStorage model if user explicitly changed it
            if (parsed.openrouter?.model) {
                settings.openrouter.model = parsed.openrouter.model;
            }

            // Only use localStorage maxTokens if user explicitly changed it
            if (parsed.openrouter?.maxTokens) {
                settings.openrouter.maxTokens = parsed.openrouter.maxTokens;
            }

            // Only use localStorage temperature if user explicitly changed it
            if (parsed.openrouter?.temperature !== undefined) {
                settings.openrouter.temperature = parsed.openrouter.temperature;
            }

            // Only use localStorage Spotify client ID if config.js has placeholder or empty
            if (parsed.spotify?.clientId &&
                (!settings.spotify.clientId || settings.spotify.clientId === 'your-spotify-client-id')) {
                settings.spotify.clientId = parsed.spotify.clientId;
            }
        } catch (e) {
            console.error('Failed to parse stored settings:', e);
        }
    }

    return settings;
}

/**
 * Save user overrides to localStorage
 * Note: This does NOT modify config.js - it stores overrides that will
 * be applied on next getSettings() call
 */
function saveSettings(settings) {
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
function clearSettings() {
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
                <!-- AI Settings Section -->
                <div class="settings-section">
                    <h3>🤖 AI Chat Settings</h3>
                    <p class="settings-description">
                        ${hasConfigKey
            ? '✅ API key configured in config.js'
            : 'Configure your OpenRouter API key. Get a free key at <a href="https://openrouter.ai/keys" target="_blank">openrouter.ai/keys</a>'}
                    </p>
                    
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
                        <select id="setting-model">
                            ${AVAILABLE_MODELS.map(m => `
                                <option value="${m.id}" ${settings.openrouter.model === m.id ? 'selected' : ''}>
                                    ${m.name}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    
                    <div class="settings-row">
                        <div class="settings-field">
                            <label for="setting-max-tokens">Max Response Length</label>
                            <input type="number" id="setting-max-tokens" 
                                   value="${settings.openrouter.maxTokens}" 
                                   min="100" max="4000" step="100">
                            <span class="settings-hint">tokens (higher = longer responses)</span>
                        </div>
                        
                        <div class="settings-field">
                            <label for="setting-temperature">Creativity</label>
                            <input type="range" id="setting-temperature" 
                                   value="${settings.openrouter.temperature}" 
                                   min="0" max="1" step="0.1">
                            <span class="settings-hint" id="temp-value">${settings.openrouter.temperature} (${settings.openrouter.temperature < 0.4 ? 'focused' : settings.openrouter.temperature > 0.7 ? 'creative' : 'balanced'})</span>
                        </div>
                    </div>
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
            </div>
            
            <div class="settings-footer">
                <button class="btn btn-secondary" onclick="Settings.hideSettingsModal()">Close</button>
                <button class="btn btn-primary" onclick="Settings.saveFromModal()">Save Changes</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Add temperature slider listener
    const tempSlider = document.getElementById('setting-temperature');
    const tempValue = document.getElementById('temp-value');
    tempSlider.addEventListener('input', () => {
        const val = parseFloat(tempSlider.value);
        const label = val < 0.4 ? 'focused' : val > 0.7 ? 'creative' : 'balanced';
        tempValue.textContent = `${val} (${label})`;
    });

    // Add escape key listener
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideSettingsModal();
        }
    });
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
 * Save settings from the modal form
 */
function saveFromModal() {
    const apiKeyInput = document.getElementById('setting-api-key');
    const model = document.getElementById('setting-model').value;
    const maxTokens = parseInt(document.getElementById('setting-max-tokens').value) || 1000;
    const temperature = parseFloat(document.getElementById('setting-temperature').value) || 0.7;
    const spotifyInput = document.getElementById('setting-spotify-client-id');

    // Only save API key if user actually entered one (field not readonly)
    const apiKey = apiKeyInput.readOnly ? null : apiKeyInput.value.trim();
    const spotifyClientId = spotifyInput.readOnly ? null : spotifyInput.value.trim();

    const settings = {
        openrouter: {
            model,
            maxTokens: Math.min(Math.max(maxTokens, 100), 4000),
            temperature: Math.min(Math.max(temperature, 0), 1)
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

// Public API
window.Settings = {
    getSettings,
    saveSettings,
    clearSettings,
    getSetting,
    hasApiKey,
    hasSpotifyConfig,
    showSettingsModal,
    hideSettingsModal,
    saveFromModal,
    togglePasswordVisibility,
    copyToClipboard,
    showToast,
    AVAILABLE_MODELS
};
