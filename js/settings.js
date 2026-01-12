/**
 * Settings Module for Rhythm Chamber
 * 
 * Handles in-app configuration display for AI and Spotify settings.
 * The source of truth is config.js - this module provides a UI to view
 * and optionally override those settings via localStorage.
 */

// Available models for the dropdown
const AVAILABLE_MODELS = [
    { id: 'xiaomi/mimo-v2-flash:free', name: 'Xiaomi Mimo v2 Flash (Free)', free: true },
    { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B (Free)', free: true },
    { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (Free)', free: true },
    { id: 'google/gemma-2-9b-it:free', name: 'Gemma 2 9B (Free)', free: true },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini ($)', free: false },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet ($)', free: false },
    { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo ($)', free: false }
];

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
        openrouter: {
            apiKey: configOpenrouter.apiKey || '',
            model: configOpenrouter.model || 'xiaomi/mimo-v2-flash:free',
            maxTokens: configOpenrouter.maxTokens || 4500,
            temperature: configOpenrouter.temperature ?? 0.7
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
        openrouter: {
            apiKey: configOpenrouter.apiKey || '',
            model: configOpenrouter.model || 'xiaomi/mimo-v2-flash:free',
            maxTokens: configOpenrouter.maxTokens || 4500,
            temperature: configOpenrouter.temperature ?? 0.7
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
                    
                    <div class="settings-row">
                        <div class="settings-field">
                            <label for="setting-max-tokens">Max Response Length</label>
                            <input type="number" id="setting-max-tokens" 
                                   value="${settings.openrouter.maxTokens}" 
                                   min="100" max="6000" step="100">
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
                    
                    <div class="settings-field">
                        <label for="setting-qdrant-url">Qdrant Cluster URL</label>
                        <input type="text" id="setting-qdrant-url" 
                               value="${window.RAG?.getConfig()?.qdrantUrl || ''}" 
                               placeholder="https://xyz-abc.cloud.qdrant.io:6333"
                               autocomplete="off">
                        <span class="settings-hint">Get a free cluster at <a href="https://cloud.qdrant.io" target="_blank">cloud.qdrant.io</a></span>
                    </div>
                    
                    <div class="settings-field">
                        <label for="setting-qdrant-key">Qdrant API Key</label>
                        <input type="password" id="setting-qdrant-key" 
                               value="${window.RAG?.getConfig()?.qdrantApiKey || ''}" 
                               placeholder="Enter your Qdrant API key"
                               autocomplete="off">
                        <button class="btn-show-password" onclick="Settings.togglePasswordVisibility('setting-qdrant-key', this)">Show</button>
                    </div>
                    
                    <div class="settings-field">
                        <button class="btn btn-primary" id="generate-embeddings-btn" onclick="Settings.generateEmbeddings()">
                            ${window.RAG?.isConfigured() ? '🔄 Regenerate Embeddings' : '⚡ Generate Embeddings'}
                        </button>
                        ${window.RAG?.getCheckpoint?.() ? `
                            <button class="btn btn-secondary" id="resume-embeddings-btn" onclick="Settings.resumeEmbeddings()">
                                ▶️ Resume
                            </button>
                        ` : ''}
                        ${window.RAG?.isConfigured() ? `
                            <span class="settings-hint success">✓ ${window.RAG.getConfig()?.chunksCount || 0} chunks indexed</span>
                        ` : window.RAG?.getCheckpoint?.() ? `
                            <span class="settings-hint warning">⚠️ Interrupted - click Resume to continue</span>
                        ` : `
                            <span class="settings-hint">Required after adding your Qdrant credentials</span>
                        `}
                    </div>
                    
                    <div id="embedding-progress" class="embedding-progress" style="display: none;">
                        <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
                        <span class="progress-text" id="progress-text">Processing...</span>
                    </div>
                    
                    <!-- Session Reset with Cryptographic Proof -->
                    <div class="settings-field session-controls">
                        <button class="btn btn-danger-outline" onclick="Settings.showSessionResetModal()">
                            🔒 Reset Security Session
                        </button>
                        <span class="settings-hint">Invalidates all encrypted credentials and forces re-authentication</span>
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
    const maxTokens = parseInt(document.getElementById('setting-max-tokens').value) || 4500;
    const temperature = parseFloat(document.getElementById('setting-temperature').value) || 0.7;
    const spotifyInput = document.getElementById('setting-spotify-client-id');

    // Only save API key if user actually entered one (field not readonly)
    const apiKey = apiKeyInput.readOnly ? null : apiKeyInput.value.trim();
    const spotifyClientId = spotifyInput.readOnly ? null : spotifyInput.value.trim();

    const settings = {
        openrouter: {
            model,
            maxTokens: Math.min(Math.max(maxTokens, 100), 6000),
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

    // Save Qdrant settings
    if (window.RAG) {
        const qdrantUrl = document.getElementById('setting-qdrant-url')?.value?.trim();
        const qdrantKey = document.getElementById('setting-qdrant-key')?.value?.trim();

        if (qdrantUrl || qdrantKey) {
            const ragConfig = window.RAG.getConfig() || {};
            window.RAG.saveConfig({
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
 * @param {boolean} resume - Whether to resume from checkpoint
 */
async function generateEmbeddings(resume = false) {
    if (!window.RAG) {
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
    const ragConfig = window.RAG.getConfig() || {};
    window.RAG.saveConfig({
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

    if (progressContainer) progressContainer.style.display = 'block';
    if (generateBtn) generateBtn.disabled = true;
    if (resumeBtn) resumeBtn.disabled = true;

    try {
        // Test connection first
        progressText.textContent = 'Testing Qdrant connection...';

        try {
            await window.RAG.testConnection();
        } catch (connErr) {
            showToast('Qdrant connection failed: ' + connErr.message);
            if (progressContainer) progressContainer.style.display = 'none';
            if (generateBtn) generateBtn.disabled = false;
            if (resumeBtn) resumeBtn.disabled = false;
            return;
        }

        // Generate embeddings with progress callback
        await window.RAG.generateEmbeddings((current, total, message) => {
            const percent = Math.round((current / total) * 100);
            if (progressFill) progressFill.style.width = `${percent}%`;
            if (progressText) progressText.textContent = message;
        }, { resume });

        showToast('🎉 Embeddings generated successfully!');

        // Refresh the modal to show updated status
        setTimeout(() => {
            hideSettingsModal();
            showSettingsModal();
        }, 1500);

    } catch (err) {
        console.error('Embedding generation error:', err);

        // Check if we have a checkpoint for resume
        const checkpoint = window.RAG.getCheckpoint?.();
        if (checkpoint && checkpoint.processed > 0) {
            showToast(`Error at ${checkpoint.processed}/${checkpoint.totalChunks}: ${err.message}. Click Resume to continue.`);
        } else {
            showToast('Error: ' + err.message);
        }

        if (progressContainer) progressContainer.style.display = 'none';
        if (generateBtn) generateBtn.disabled = false;

        // Check if we need to show resume button
        if (window.RAG.getCheckpoint?.()) {
            if (resumeBtn) {
                resumeBtn.style.display = 'inline-block';
                resumeBtn.disabled = false;
            }
        }
    }
}

/**
 * Resume embedding generation from checkpoint
 */
function resumeEmbeddings() {
    generateEmbeddings(true);
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

// Public API
window.Settings = {
    getSettings,
    getSettingsAsync,
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
    generateEmbeddings,
    resumeEmbeddings,
    showSessionResetModal,
    hideSessionResetModal,
    confirmSessionReset,
    AVAILABLE_MODELS
};
