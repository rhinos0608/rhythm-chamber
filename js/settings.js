/**
 * Settings Module for Rhythm Chamber
 * 
 * Handles in-app configuration for AI and Spotify settings.
 * Settings are persisted in localStorage.
 */

// Default settings (used if no config.js or localStorage settings exist)
const DEFAULT_SETTINGS = {
    openrouter: {
        apiKey: '',
        model: 'mistralai/mistral-7b-instruct:free',
        maxTokens: 1000,
        temperature: 0.7
    },
    spotify: {
        clientId: ''
    }
};

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
 * Get current settings (merges config.js defaults with localStorage overrides)
 */
function getSettings() {
    // Start with defaults
    let settings = { ...DEFAULT_SETTINGS };

    // Merge config.js values if they exist
    if (window.Config?.openrouter) {
        settings.openrouter = {
            ...settings.openrouter,
            apiKey: window.Config.openrouter.apiKey || '',
            model: window.Config.openrouter.model || DEFAULT_SETTINGS.openrouter.model,
            maxTokens: window.Config.openrouter.maxTokens || DEFAULT_SETTINGS.openrouter.maxTokens,
            temperature: window.Config.openrouter.temperature || DEFAULT_SETTINGS.openrouter.temperature
        };
    }

    if (window.Config?.spotify) {
        settings.spotify = {
            ...settings.spotify,
            clientId: window.Config.spotify.clientId || ''
        };
    }

    // Override with localStorage values (user preferences take priority)
    const stored = localStorage.getItem('rhythm_chamber_settings');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            // Deep merge
            if (parsed.openrouter) {
                settings.openrouter = { ...settings.openrouter, ...parsed.openrouter };
            }
            if (parsed.spotify) {
                settings.spotify = { ...settings.spotify, ...parsed.spotify };
            }
        } catch (e) {
            console.error('Failed to parse stored settings:', e);
        }
    }

    return settings;
}

/**
 * Save settings to localStorage
 */
function saveSettings(settings) {
    localStorage.setItem('rhythm_chamber_settings', JSON.stringify(settings));

    // Update the runtime Config object so changes take effect immediately
    if (window.Config) {
        if (settings.openrouter) {
            window.Config.openrouter = {
                ...window.Config.openrouter,
                ...settings.openrouter,
                apiUrl: 'https://openrouter.ai/api/v1/chat/completions'
            };
        }
        if (settings.spotify?.clientId) {
            window.Config.spotify = {
                ...window.Config.spotify,
                clientId: settings.spotify.clientId
            };
        }
    }
}

/**
 * Clear all stored settings
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
 * Check if API key is configured
 */
function hasApiKey() {
    const key = getSetting('openrouter.apiKey');
    return key && key !== '' && key !== 'your-api-key-here';
}

/**
 * Check if Spotify is configured
 */
function hasSpotifyConfig() {
    const clientId = getSetting('spotify.clientId');
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
                    <p class="settings-description">Configure your OpenRouter API key to enable AI chat. Get a free key at <a href="https://openrouter.ai/keys" target="_blank">openrouter.ai/keys</a></p>
                    
                    <div class="settings-field">
                        <label for="setting-api-key">API Key</label>
                        <input type="password" id="setting-api-key" 
                               value="${settings.openrouter.apiKey === 'your-api-key-here' ? '' : settings.openrouter.apiKey}" 
                               placeholder="sk-or-v1-..." 
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
                    <p class="settings-description">For Quick Snapshot, add your Spotify Client ID from <a href="https://developer.spotify.com/dashboard" target="_blank">developer.spotify.com</a></p>
                    
                    <div class="settings-field">
                        <label for="setting-spotify-client-id">Client ID</label>
                        <input type="text" id="setting-spotify-client-id" 
                               value="${settings.spotify.clientId === 'your-spotify-client-id' ? '' : settings.spotify.clientId}" 
                               placeholder="Enter your Spotify Client ID"
                               autocomplete="off">
                    </div>
                    
                    <div class="settings-info">
                        <strong>Redirect URI:</strong> <code>${window.location.origin}/app.html</code>
                        <button class="btn-copy" onclick="Settings.copyToClipboard('${window.location.origin}/app.html', this)">Copy</button>
                    </div>
                </div>
            </div>
            
            <div class="settings-footer">
                <button class="btn btn-secondary" onclick="Settings.hideSettingsModal()">Cancel</button>
                <button class="btn btn-primary" onclick="Settings.saveFromModal()">Save Settings</button>
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

    // Add enter key listener for quick save
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideSettingsModal();
        }
    });

    // Focus on API key field if empty
    setTimeout(() => {
        const apiKeyInput = document.getElementById('setting-api-key');
        if (!apiKeyInput.value) {
            apiKeyInput.focus();
        }
    }, 100);
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
    const apiKey = document.getElementById('setting-api-key').value.trim();
    const model = document.getElementById('setting-model').value;
    const maxTokens = parseInt(document.getElementById('setting-max-tokens').value) || 1000;
    const temperature = parseFloat(document.getElementById('setting-temperature').value) || 0.7;
    const spotifyClientId = document.getElementById('setting-spotify-client-id').value.trim();

    const settings = {
        openrouter: {
            apiKey: apiKey || '',
            model,
            maxTokens: Math.min(Math.max(maxTokens, 100), 4000),
            temperature: Math.min(Math.max(temperature, 0), 1)
        },
        spotify: {
            clientId: spotifyClientId || ''
        }
    };

    saveSettings(settings);
    hideSettingsModal();

    // Show confirmation
    showToast('Settings saved!');

    // Update Spotify button state if on app page
    if (typeof setupSpotifyButton === 'function') {
        setupSpotifyButton();
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
 * Apply stored settings to runtime Config on page load
 */
function applyStoredSettings() {
    const stored = localStorage.getItem('rhythm_chamber_settings');
    if (!stored) return;

    try {
        const parsed = JSON.parse(stored);

        // Ensure Config object exists
        if (!window.Config) {
            window.Config = { openrouter: {}, spotify: {}, app: {} };
        }

        // Apply OpenRouter settings
        if (parsed.openrouter) {
            window.Config.openrouter = {
                apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
                ...window.Config.openrouter,
                ...parsed.openrouter
            };
        }

        // Apply Spotify settings
        if (parsed.spotify?.clientId) {
            window.Config.spotify = {
                ...window.Config.spotify,
                clientId: parsed.spotify.clientId
            };
        }

        console.log('Settings applied from localStorage');
    } catch (e) {
        console.error('Failed to apply stored settings:', e);
    }
}

// Apply settings immediately when script loads
applyStoredSettings();

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
    applyStoredSettings,
    AVAILABLE_MODELS
};
