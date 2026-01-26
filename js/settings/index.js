import { ModuleRegistry } from '../module-registry.js';
import { ConfigLoader } from '../services/config-loader.js';
import { Storage } from '../storage.js';
import { safeJsonParse } from '../utils/safe-json.js';
import { escapeHtml } from '../utils/html-escape.js';
import { STORAGE_KEYS } from '../storage/keys.js';
import { EventBus } from '../services/event-bus.js';

if (ConfigLoader?.installWindowProxy) {
    try {
        ConfigLoader.installWindowProxy();
    } catch (e) {
        void e;
    }
}

const PROVIDER_ID = {
    OLLAMA: 'ollama',
    LM_STUDIO: 'lmstudio',
    GEMINI: 'gemini',
    OPENROUTER: 'openrouter',
    OPENAI_COMPATIBLE: 'openai-compatible'
};

const LLM_PROVIDERS = [
    { id: PROVIDER_ID.OLLAMA, name: 'Ollama (Local)', description: 'Run AI models on your own hardware - zero data transmission' },
    { id: PROVIDER_ID.LM_STUDIO, name: 'LM Studio (Local)', description: 'User-friendly local AI with OpenAI-compatible API' },
    { id: PROVIDER_ID.GEMINI, name: 'Gemini (Google AI Studio)', description: 'Google AI models' },
    { id: PROVIDER_ID.OPENROUTER, name: 'OpenRouter (Cloud)', description: 'Optional cloud provider for premium models' },
    { id: PROVIDER_ID.OPENAI_COMPATIBLE, name: 'OpenAI Compatible', description: 'Connect to any OpenAI-compatible API - custom endpoint' }
];

const DEFAULT_ENDPOINTS = {
    ollama: 'http://localhost:11434',
    lmstudio: 'http://localhost:1234/v1'
};

const AVAILABLE_MODELS = [
    { id: 'xiaomi/mimo-v2-flash:free', name: 'Xiaomi Mimo v2 Flash (Free)', free: true },
    { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B (Free)', free: true },
    { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (Free)', free: true },
    { id: 'google/gemma-2-9b-it:free', name: 'Gemma 2 9B (Free)', free: true },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini ($)', free: false }
];

let _cachedSettings = null;

function buildDefaults() {
    const configOpenrouter = ConfigLoader.get('openrouter', {});
    const configSpotify = ConfigLoader.get('spotify', {});
    const configGemini = ConfigLoader.get('gemini', {});
    const configOllama = ConfigLoader.get('ollama', {});
    const configLmStudio = ConfigLoader.get('lmstudio', {});
    const configOpenAICompatible = ConfigLoader.get('openaiCompatible', {});

    return {
        llm: {
            provider: configOpenrouter.apiKey ? PROVIDER_ID.OPENROUTER : (configGemini.apiKey ? PROVIDER_ID.GEMINI : PROVIDER_ID.OLLAMA),
            openrouterApiKey: configOpenrouter.apiKey || '',
            openrouterModel: configOpenrouter.defaultModel || 'xiaomi/mimo-v2-flash:free',
            geminiApiKey: configGemini.apiKey || '',
            geminiModel: configGemini.defaultModel || 'gemini-2.5-flash',
            ollamaEndpoint: configOllama.endpoint || DEFAULT_ENDPOINTS.ollama,
            lmstudioEndpoint: configLmStudio.endpoint || DEFAULT_ENDPOINTS.lmstudio,
            openaiCompatibleEndpoint: configOpenAICompatible.endpoint || '',
            openaiCompatibleApiKey: configOpenAICompatible.apiKey || '',
            maxTokens: 4500,
            contextWindow: 4096
        },
        spotify: {
            clientId: configSpotify.clientId || '',
            redirectUri: configSpotify.redirectUri || ''
        },
        tools: {
            enabledTools: null
        }
    };
}

function deepMerge(base, override) {
    if (!override || typeof override !== 'object') return base;
    const out = Array.isArray(base) ? [...base] : { ...base };
    for (const [k, v] of Object.entries(override)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object') {
            out[k] = deepMerge(base[k], v);
        } else {
            out[k] = v;
        }
    }
    return out;
}

function getSettings() {
    if (_cachedSettings) return _cachedSettings;
    return buildDefaults();
}

async function getSettingsAsync() {
    const defaults = buildDefaults();
    let stored = null;
    if (Storage.getConfig) {
        stored = await Storage.getConfig(STORAGE_KEYS.SETTINGS);
    }
    _cachedSettings = deepMerge(defaults, stored || {});
    return _cachedSettings;
}

async function saveSettings(settings) {
    _cachedSettings = settings;
    if (Storage.setConfig) {
        await Storage.setConfig(STORAGE_KEYS.SETTINGS, settings);
    }
    try {
        localStorage.setItem('rhythm_chamber_settings_version', String(Date.now()));
    } catch (e) {
        void e;
    }
    EventBus.emit('settings:changed', settings, { skipEventLog: true });
}

async function clearSettings() {
    _cachedSettings = null;
    if (Storage.deleteConfig) {
        await Storage.deleteConfig(STORAGE_KEYS.SETTINGS);
    } else if (Storage.setConfig) {
        await Storage.setConfig(STORAGE_KEYS.SETTINGS, null);
    }
    try {
        localStorage.setItem('rhythm_chamber_settings_version', String(Date.now()));
    } catch (e) {
        void e;
    }
    EventBus.emit('settings:cleared', {}, { skipEventLog: true });
}

function getSetting(path, fallbackValue = undefined) {
    const settings = getSettings();
    if (!path) return fallbackValue;
    const parts = path.split('.');
    let cur = settings;
    for (const p of parts) {
        if (!cur || typeof cur !== 'object' || !(p in cur)) return fallbackValue;
        cur = cur[p];
    }
    return cur;
}

function getContextWindow() {
    return getSetting('llm.contextWindow', 4096);
}

function hasApiKey(providerId) {
    const settings = getSettings();
    const pid = (providerId || settings.llm.provider || '').toLowerCase();
    if (pid === PROVIDER_ID.OPENROUTER) return !!settings.llm.openrouterApiKey;
    if (pid === PROVIDER_ID.GEMINI) return !!settings.llm.geminiApiKey;
    if (pid === PROVIDER_ID.OPENAI_COMPATIBLE) return !!settings.llm.openaiCompatibleApiKey;
    return true;
}

function hasSpotifyConfig() {
    const settings = getSettings();
    return !!(settings.spotify.clientId && settings.spotify.redirectUri);
}

function ensureModal(id) {
    if (typeof document === 'undefined') return null;
    return document.getElementById(id);
}

function showSettingsModal() {
    const modal = ensureModal('settings-modal');
    if (modal) modal.style.display = 'flex';
}

function hideSettingsModal() {
    const modal = ensureModal('settings-modal');
    if (modal) modal.style.display = 'none';
}

function showToolsModal() {
    const modal = ensureModal('tools-modal');
    if (modal) modal.style.display = 'flex';
}

function hideToolsModal() {
    const modal = ensureModal('tools-modal');
    if (modal) modal.style.display = 'none';
}

function showToast(message, duration = 2000) {
    if (typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = String(message);
    el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:10px 14px;border-radius:8px;z-index:99999;max-width:90vw;';
    document.body.appendChild(el);
    setTimeout(() => {
        el.remove();
    }, duration);
}

function getEnabledTools() {
    const settings = getSettings();
    const enabledTools = settings?.tools?.enabledTools;
    if (enabledTools === null || enabledTools === undefined) return null;
    if (Array.isArray(enabledTools)) return enabledTools;
    if (enabledTools && typeof enabledTools === 'object') {
        return Object.entries(enabledTools)
            .filter(([, enabled]) => !!enabled)
            .map(([name]) => name);
    }
    return null;
}

function isToolEnabled(toolName) {
    const enabled = getEnabledTools();
    if (enabled === null) return true;
    return enabled.includes(toolName);
}

async function saveToolsAndClose() {
    const settings = await getSettingsAsync();
    await saveSettings(settings);
    hideToolsModal();
}

function onToolToggle() {}
function onToggleAllTools() {}

async function generateEmbeddings() {
    try {
        if (!ModuleRegistry.isLoaded('LocalEmbeddings')) {
            await ModuleRegistry.load('LocalEmbeddings');
        }
        const { EmbeddingsTaskManager } = await import('../embeddings/embeddings-task-manager.js');
        await EmbeddingsTaskManager.start();
    } catch (e) {
        console.error('[Settings] generateEmbeddings failed:', e);
        showToast('Embeddings failed to start', 4000);
    }
}

async function resumeEmbeddings() {
    try {
        const { EmbeddingsTaskManager } = await import('../embeddings/embeddings-task-manager.js');
        await EmbeddingsTaskManager.resume();
    } catch (e) {
        console.error('[Settings] resumeEmbeddings failed:', e);
        showToast('Embeddings resume failed', 4000);
    }
}

function cancelEmbeddings() {
    EventBus.emit('embeddings:cancel_requested', {}, { skipEventLog: true });
}

function togglePasswordVisibility() {}
function copyToClipboard(text) {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(String(text)).catch(() => {});
}

async function saveFromModal() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        const parsed = safeJsonParse(raw, null);
        if (parsed) {
            await saveSettings(parsed);
            showToast('Settings saved');
        } else {
            showToast('No settings to save', 2000);
        }
    } catch (e) {
        console.error('[Settings] saveFromModal failed:', e);
        showToast('Settings save failed', 4000);
    }
}

function showSessionResetModal() {
    const modal = ensureModal('session-reset-modal');
    if (modal) modal.style.display = 'flex';
}
function hideSessionResetModal() {
    const modal = ensureModal('session-reset-modal');
    if (modal) modal.style.display = 'none';
}
async function confirmSessionReset() {}
function refreshTravelStatusUI() {}
function toggleTravelMode() {}
async function verifyIdentity() { return true; }

function onProviderChange() {}
async function checkOllamaConnection() { return false; }
async function testOllamaConnection() { return false; }
async function refreshOllamaModels() { return []; }

function initCrossTabSync() {
    if (typeof window === 'undefined') return;
    window.addEventListener('storage', (e) => {
        if (e.key === 'rhythm_chamber_settings_version' && e.newValue && e.newValue !== e.oldValue) {
            getSettingsAsync().then(settings => {
                _cachedSettings = settings;
                EventBus.emit('settings:changed', settings, { skipEventLog: true });
            }).catch(err => {
                console.error('[Settings] Cross-tab reload failed:', err);
                showToast('Settings sync failed. Refresh page.', 5000);
                EventBus.emit('settings:sync_failed', { error: err }, { skipEventLog: true });
            });
        }
    });
}

initCrossTabSync();

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
    onProviderChange,
    checkOllamaConnection,
    testOllamaConnection,
    refreshOllamaModels,
    showToolsModal,
    hideToolsModal,
    onToolToggle,
    onToggleAllTools,
    saveToolsAndClose,
    getEnabledTools,
    isToolEnabled,
    AVAILABLE_MODELS,
    LLM_PROVIDERS,
    DEFAULT_ENDPOINTS
};

if (typeof window !== 'undefined') {
    window.Settings = Settings;
}
