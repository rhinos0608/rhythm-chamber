import { Crypto } from '../security/crypto.js';
import { ModuleRegistry } from '../module-registry.js';
import { AppState } from '../state/app-state.js';
import { Storage } from '../storage.js';

import { Patterns } from '../patterns.js';
import { Personality } from '../personality.js';
import { DataQuery } from '../data-query.js';
import { Prompts } from '../prompts.js';
import { TokenCounter } from '../token-counter.js';
import { Functions } from '../functions/index.js';
import { Cards } from '../cards.js';
import { Spotify } from '../spotify.js';
import { Chat } from '../chat.js';

import { ViewController } from '../controllers/view-controller.js';
import { FileUploadController } from '../controllers/file-upload-controller.js';
import { SpotifyController } from '../controllers/spotify-controller.js';
import { DemoController } from '../controllers/demo-controller.js';
import { ResetController } from '../controllers/reset-controller.js';
import { SidebarController } from '../controllers/sidebar-controller.js';
import { ChatUIController } from '../controllers/chat-ui-controller.js';
import { StreamingMessageHandler } from '../controllers/streaming-message-handler.js';

import { TabCoordinator } from '../services/tab-coordination.js';
import { SessionManager } from '../services/session-manager.js';
import { MessageOperations } from '../services/message-operations.js';
import { EventBus } from '../services/event-bus.js';
import { EventLogStore } from '../storage/event-log-store.js';

import { OperationLock } from '../operation-lock.js';
import { CircuitBreaker } from '../services/circuit-breaker.js';
import { FunctionCallingFallback } from '../services/function-calling-fallback.js';
import { DataVersion } from '../services/data-version.js';

import { DemoData } from '../demo-data.js';
import { TemplateProfileStore } from '../template-profiles.js';
import { ProfileSynthesizer } from '../profile-synthesizer.js';

import { LemonSqueezyService } from '../services/lemon-squeezy-service.js';

/**
 * DI Container - Improved Dependency Injection Container
 *
 * Provides:
 * - Explicit dependency declarations
 * - Constructor injection support
 * - Circular dependency detection
 * - Dependency graph visualization
 *
 * The legacy interface is preserved for backward compatibility.
 */
import { DIContainer } from './di-container.js';

/**
 * DI Container - Improved Dependency Injection Container
 *
 * Provides:
 * - Explicit dependency declarations
 * - Constructor injection support
 * - Circular dependency detection
 * - Dependency graph visualization
 *
 * The legacy interface is preserved for backward compatibility.
 */
const Container = new DIContainer();

// Export Container for use in other modules (after function declarations)
// Container now available via ES6 imports, no window globals needed

function showToast(message, type = 'info', duration = 3000) {
    if (typeof document === 'undefined') return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = String(message);
    toast.style.cssText =
        'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:10px 14px;border-radius:8px;z-index:99999;max-width:90vw;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}

function showLoadingError(missing = [], optional = []) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('loading-error');
    if (!el) return;
    el.style.display = 'block';
    el.textContent = `Failed to start. Missing: ${missing.join(', ')}${optional.length ? ` (optional: ${optional.join(', ')})` : ''}`;
}

function registerContainerServices() {
    Container.registerInstance('Storage', Storage);
    Container.registerInstance('AppState', AppState);
    Container.registerInstance('Spotify', Spotify);
    Container.registerInstance('Chat', Chat);
    Container.registerInstance('Patterns', Patterns);
    Container.registerInstance('Personality', Personality);
    Container.registerInstance('DataQuery', DataQuery);
    Container.registerInstance('TokenCounter', TokenCounter);
    Container.registerInstance('Functions', Functions);
    Container.registerInstance('Prompts', Prompts);
    Container.registerInstance('Cards', Cards);
    Container.registerInstance('OperationLock', OperationLock);
    Container.registerInstance('CircuitBreaker', CircuitBreaker);
    Container.registerInstance('FunctionCallingFallback', FunctionCallingFallback);
    Container.registerInstance('DataVersion', DataVersion);
    Container.registerInstance('TabCoordinator', TabCoordinator);
    Container.registerInstance('SessionManager', SessionManager);
    Container.registerInstance('EventBus', EventBus);
    Container.registerInstance('EventLogStore', EventLogStore);
    Container.registerInstance('ViewController', ViewController);
    Container.registerInstance('DemoData', DemoData);
    Container.registerInstance('TemplateProfileStore', TemplateProfileStore);
    Container.registerInstance('ProfileSynthesizer', ProfileSynthesizer);
    Container.registerInstance('showToast', showToast);

    Container.registerController('FileUploadController', FileUploadController);
    Container.registerController('SpotifyController', SpotifyController);
    Container.registerController('DemoController', DemoController);
    Container.registerController('ResetController', ResetController);
    Container.registerController('SidebarController', SidebarController);
    Container.registerController('ChatUIController', ChatUIController);

    // MessageOperations is a service (business logic), not a controller (UI)
    Container.registerInstance('MessageOperations', MessageOperations);
}

/**
 * Explicit controller dependency declarations
 * Each controller declares its dependencies for better clarity
 */
const CONTROLLER_DEPENDENCIES = Object.freeze({
    FileUploadController: [
        'Storage',
        'AppState',
        'OperationLock',
        'Patterns',
        'Personality',
        'ViewController',
        'showToast',
    ],
    SpotifyController: [
        'Storage',
        'AppState',
        'Spotify',
        'Patterns',
        'Personality',
        'ViewController',
        'showToast',
    ],
    DemoController: ['AppState', 'DemoData', 'ViewController', 'Patterns', 'showToast'],
    ResetController: [
        'Storage',
        'AppState',
        'Spotify',
        'Chat',
        'OperationLock',
        'ViewController',
        'showToast',
        'FileUploadController',
    ],
    SidebarController: ['AppState', 'Storage', 'ViewController', 'showToast'],
    ChatUIController: ['AppState', 'Storage', 'ViewController', 'showToast'],
});

function initializeControllers() {
    for (const [controllerName, deps] of Object.entries(CONTROLLER_DEPENDENCIES)) {
        Container.initController(controllerName, deps);
    }
}

/**
 * Get the dependency graph for debugging
 * Useful for visualizing the application's dependency structure
 * @returns {Object} Dependency graph
 */
function getDependencyGraph() {
    return Container.getDependencyGraph();
}

/**
 * Get container status for health checks
 * @returns {Object} Container status
 */
function getContainerStatus() {
    return Container.getStatus();
}

/**
 * Generate DOT format graph for visualization tools
 * @returns {string} DOT format graph
 */
function getDependencyGraphDot() {
    return Container.toDotFormat();
}

function bindSettingsButtons() {
    if (typeof document === 'undefined') return;
    const settingsBtn = document.getElementById('settings-btn');
    const toolsBtn = document.getElementById('tools-btn');

    const loadSettings = async () => {
        const { Settings } = await import('../settings.js');
        return Settings;
    };

    if (settingsBtn) {
        settingsBtn.addEventListener('click', async () => {
            const Settings = await loadSettings();
            Settings.showSettingsModal?.();
        });
    }
    if (toolsBtn) {
        toolsBtn.addEventListener('click', async () => {
            const Settings = await loadSettings();
            Settings.showToolsModal?.();
        });
    }
}

/**
 * Bind UI elements to tab authority changes from TabCoordinator via EventBus
 *
 * Updates the following when tab authority changes:
 * - Authority indicator (class and text)
 * - Upload zone (enabled/disabled state)
 * - Body class (read-only-mode)
 * - Multi-tab modal visibility
 *
 * @listens tab:authority_changed
 * @see TabCoordinator emits 'tab:authority_changed' event
 */
function bindAuthorityUI() {
    if (typeof document === 'undefined') return;

    // Listen for authority changes via EventBus instead of direct callback
    EventBus.on('tab:authority_changed', data => {
        const isPrimary = data.isPrimary;
        const level = data.level;

        console.log('[App] Authority changed:', level, isPrimary ? 'primary' : 'secondary');
        document.body.classList.toggle('read-only-mode', !isPrimary);

        // Update authority indicator element
        const indicator = document.getElementById('authority-indicator');
        if (indicator) {
            // Remove both classes first, then add the correct one
            indicator.classList.remove('primary', 'secondary');
            indicator.classList.add(level);
            // Update text content
            const statusText = indicator.querySelector('.status-text');
            if (statusText) {
                statusText.textContent = level === 'primary' ? 'Primary' : 'Secondary';
            } else {
                indicator.textContent = level === 'primary' ? 'Primary' : 'Secondary';
            }
        }

        // Update read-only banner
        const readOnlyBanner = document.getElementById('read-only-banner');
        if (readOnlyBanner) {
            if (isPrimary) {
                readOnlyBanner.classList.remove('active');
            } else {
                readOnlyBanner.classList.add('active');
            }
        }

        // Immediately disable/enable upload zone based on authority
        const uploadZone = document.getElementById('upload-zone');
        if (uploadZone) {
            if (!isPrimary) {
                uploadZone.style.pointerEvents = 'none';
                uploadZone.style.opacity = '0.5';
            } else {
                uploadZone.style.pointerEvents = '';
                uploadZone.style.opacity = '';
            }
        }

        // Enable/disable file input
        const fileInput = document.getElementById('file-input');
        if (fileInput) fileInput.disabled = !isPrimary;

        // Enable/disable chat input and send button
        const chatInput = document.getElementById('chat-input');
        const chatSend = document.getElementById('chat-send');
        if (chatInput) {
            chatInput.disabled = !isPrimary;
            chatInput.placeholder = isPrimary
                ? 'Ask about your music...'
                : 'Read-only mode (close other tab to enable)';
        }
        if (chatSend) chatSend.disabled = !isPrimary;

        // Enable/disable reset button
        const resetBtn = document.getElementById('reset-btn');
        if (resetBtn) resetBtn.disabled = !isPrimary;

        // Enable/disable Spotify connect button
        const spotifyConnectBtn = document.getElementById('spotify-connect-btn');
        if (spotifyConnectBtn) spotifyConnectBtn.disabled = !isPrimary;

        // Enable/disable new chat button
        const newChatBtn = document.getElementById('new-chat-btn');
        if (newChatBtn) newChatBtn.disabled = !isPrimary;

        // Handle multi-tab modal display
        const multiTabModal = document.getElementById('multi-tab-modal');
        if (multiTabModal) {
            if (!isPrimary) {
                multiTabModal.style.display = 'flex';
            } else {
                multiTabModal.style.display = 'none';
            }
        }

        // Force a reflow to ensure the CSS takes effect immediately
        void document.body.offsetHeight;
    });
}

function bindFileUpload() {
    if (typeof document === 'undefined') return;

    // Helper function to render a user message directly to the DOM
    function renderUserMessage(message) {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) {
            console.warn('[App] Chat messages container not found');
            return;
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message user';
        messageDiv.textContent = message;
        chatMessages.appendChild(messageDiv);

        // Auto-scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Set up file input change listener
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
        fileInput.addEventListener('change', async event => {
            const file = event.target.files?.[0];
            if (file) {
                await FileUploadController.handleFileUpload(file);
            }
        });
        console.log('[App] File input listener bound');
    }

    // Set up "Choose File" button click listener
    const chooseFileBtn = document.querySelector('[data-action="trigger-file-select"]');
    if (chooseFileBtn) {
        chooseFileBtn.addEventListener('click', () => {
            fileInput?.click();
        });
        console.log('[App] Choose File button listener bound');
    }

    // Set up drag-and-drop on upload zone
    const uploadZone = document.getElementById('upload-zone');
    if (uploadZone) {
        uploadZone.addEventListener('dragover', e => {
            e.preventDefault();
            uploadZone.classList.add('drag-over');
        });

        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('drag-over');
        });

        uploadZone.addEventListener('drop', async e => {
            e.preventDefault();
            uploadZone.classList.remove('drag-over');
            const file = e.dataTransfer?.files?.[0];
            if (file) {
                await FileUploadController.handleFileUpload(file);
            }
        });
        console.log('[App] Drag-and-drop listeners bound');
    }

    // Set up "Explore in Chat" button
    const exploreChatBtn = document.getElementById('explore-chat-btn');
    if (exploreChatBtn) {
        exploreChatBtn.addEventListener('click', () => {
            if (ViewController && ViewController.showChat) {
                ViewController.showChat();
            }
        });
        console.log('[App] Explore Chat button listener bound');
    }

    // Set up "Share Card" button
    const shareCardBtn = document.getElementById('share-card-btn');
    if (shareCardBtn) {
        shareCardBtn.addEventListener('click', () => {
            if (typeof Cards !== 'undefined' && Cards.shareCard) {
                Cards.shareCard();
            }
        });
        console.log('[App] Share Card button listener bound');
    }

    // Set up chat send button
    const chatSend = document.getElementById('chat-send');
    const chatInput = document.getElementById('chat-input');
    if (chatSend && chatInput) {
        const sendChatMessage = async () => {
            const message = chatInput.value.trim();
            console.log('[App] Send button clicked, message:', message);
            console.log('[App] Chat object:', typeof Chat, Chat ? 'defined' : 'undefined');
            if (message) {
                if (typeof Chat !== 'undefined' && Chat.sendMessage) {
                    chatInput.value = '';
                    // FIX: Add loading indicator for immediate feedback
                    const loadingId = StreamingMessageHandler.addLoadingMessage();
                    console.log('[App] Calling Chat.sendMessage, loadingId:', loadingId);
                    try {
                        await Chat.sendMessage(message);
                        console.log('[App] Chat.sendMessage returned');
                        // Remove loading indicator on success (response will render the actual message)
                        if (loadingId) StreamingMessageHandler.removeMessageElement(loadingId);
                    } catch (e) {
                        console.error('[App] Chat.sendMessage error:', e);
                        // Remove loading indicator on error
                        if (loadingId) StreamingMessageHandler.removeMessageElement(loadingId);
                        // Still show the message even if there's an error
                        renderUserMessage(message);
                    }
                } else {
                    console.warn('[App] Chat not available, rendering message directly');
                    renderUserMessage(message);
                }
            }
        };

        chatSend.addEventListener('click', sendChatMessage);
        chatInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
        console.log('[App] Chat send listeners bound');
    }

    // Set up suggestion chip clicks (event delegation)
    // FIX: Suggestion chips had data-question attributes but no click handlers
    const chatSuggestions = document.getElementById('chat-suggestions');
    if (chatSuggestions) {
        chatSuggestions.addEventListener('click', e => {
            const chip = e.target.closest('.suggestion-chip');
            if (!chip) return;

            const question = chip.dataset.question;
            if (!question) return;

            // Fill the question into input and send
            const chatInput = document.getElementById('chat-input');
            if (chatInput) {
                chatInput.value = question;
                // Trigger the send function
                const chatSend = document.getElementById('chat-send');
                if (chatSend) {
                    chatSend.click();
                }
            }
        });
        console.log('[App] Suggestion chip listeners bound');
    }

    // Set up sidebar toggle
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', () => {
            document.body.classList.toggle('sidebar-collapsed');
        });
        console.log('[App] Sidebar toggle listener bound');
    }

    // Set up sidebar collapse button
    const sidebarCollapseBtn = document.getElementById('sidebar-collapse-btn');
    if (sidebarCollapseBtn) {
        sidebarCollapseBtn.addEventListener('click', () => {
            document.body.classList.toggle('sidebar-collapsed');
        });
        console.log('[App] Sidebar collapse listener bound');
    }

    // Set up new chat button
    const newChatBtn = document.getElementById('new-chat-btn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', async () => {
            if (typeof SessionManager !== 'undefined' && SessionManager.createNewSession) {
                await SessionManager.createNewSession();
            }
        });
        console.log('[App] New chat button listener bound');
    }

    // Set up reset button
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            const modal = document.getElementById('reset-confirm-modal');
            if (modal) {
                modal.style.display = 'flex';
            }
        });
        console.log('[App] Reset button listener bound');
    }

    // Set up reset confirm button
    const resetConfirmBtn = document.getElementById('reset-confirm-btn');
    const resetConfirmInput = document.getElementById('reset-confirm-input');
    if (resetConfirmBtn && resetConfirmInput) {
        resetConfirmInput.addEventListener('input', e => {
            resetConfirmBtn.disabled = e.target.value !== 'DELETE';
        });

        resetConfirmBtn.addEventListener('click', async () => {
            if (resetConfirmInput.value === 'DELETE') {
                if (typeof ResetController !== 'undefined' && ResetController.executeReset) {
                    await ResetController.executeReset();
                }
                const modal = document.getElementById('reset-confirm-modal');
                if (modal) {
                    modal.style.display = 'none';
                }
            }
        });
        console.log('[App] Reset confirm listeners bound');
    }

    // Set up cancel buttons for modals
    const cancelBtns = document.querySelectorAll(
        '[data-action="hide-reset-modal"], [data-action="hide-delete-modal"], [data-action="close-multi-tab-modal"]'
    );
    cancelBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal-overlay');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    });
    console.log('[App] Modal cancel listeners bound');

    // FIX: Set up delete chat modal buttons (were completely unbound)
    const confirmDeleteBtn = document.querySelector('[data-action="confirm-delete-chat"]');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async () => {
            if (typeof SidebarController !== 'undefined' && SidebarController.confirmDeleteChat) {
                await SidebarController.confirmDeleteChat();
            }
        });
        console.log('[App] Delete chat confirm listener bound');
    }

    // Set up privacy dashboard button
    const privacyDashboardBtn = document.getElementById('privacy-dashboard-btn');
    if (privacyDashboardBtn) {
        privacyDashboardBtn.addEventListener('click', () => {
            const modal = document.getElementById('privacy-dashboard-modal');
            if (modal) {
                modal.style.display = 'flex';
                // Populate privacy data
                if (typeof Storage !== 'undefined') {
                    const rawStreams = Storage.getStreams();
                    const rawCount = rawStreams ? rawStreams.length : 0;
                    const countEl = document.getElementById('raw-streams-count');
                    if (countEl) countEl.textContent = rawCount;
                }
            }
        });
        console.log('[App] Privacy dashboard button listener bound');
    }

    // Set up close privacy dashboard button
    const closePrivacyBtns = document.querySelectorAll('[data-action="close-privacy-modal"]');
    closePrivacyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = document.getElementById('privacy-dashboard-modal');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    });

    // Set up clear sensitive data button
    const clearSensitiveBtn = document.querySelector('[data-action="clear-sensitive-data"]');
    if (clearSensitiveBtn) {
        clearSensitiveBtn.addEventListener('click', async () => {
            if (typeof Storage !== 'undefined' && Storage.clearRawData) {
                await Storage.clearRawData();
                showToast('Raw data cleared');
            }
        });
    }

    // Set up close settings modal buttons
    const closeSettingsBtns = document.querySelectorAll('[data-action="close-settings-modal"]');
    closeSettingsBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const { Settings } = await import('../settings.js');
            Settings.hideSettingsModal?.();
        });
    });
    console.log('[App] Settings modal close listeners bound');

    // Set up close tools modal buttons
    const closeToolsBtns = document.querySelectorAll('[data-action="close-tools-modal"]');
    closeToolsBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const { Settings } = await import('../settings.js');
            Settings.hideToolsModal?.();
        });
    });
    console.log('[App] Tools modal close listeners bound');

    // Set up provider selection change handler
    const providerSelect = document.getElementById('setting-provider');
    if (providerSelect) {
        providerSelect.addEventListener('change', e => {
            // Hide all provider-specific fields
            document.querySelectorAll('.provider-fields').forEach(el => {
                el.style.display = 'none';
            });
            // Show selected provider fields
            const selectedFields = document.getElementById(`provider-${e.target.value}-fields`);
            if (selectedFields) {
                selectedFields.style.display = 'block';
            }
        });
        console.log('[App] Provider selection listener bound');
    }

    // Set up temperature slider with real-time feedback
    const temperatureSlider = document.getElementById('setting-temperature');
    const temperatureValue = document.getElementById('temperature-value');
    const temperatureLabel = document.getElementById('temperature-label');
    if (temperatureSlider && temperatureValue && temperatureLabel) {
        temperatureSlider.addEventListener('input', e => {
            const val = parseFloat(e.target.value);
            temperatureValue.textContent = val.toFixed(1);

            // Update label based on value
            if (val < 0.4) {
                temperatureLabel.textContent = 'Focused';
            } else if (val < 1.0) {
                temperatureLabel.textContent = 'Balanced';
            } else if (val < 1.6) {
                temperatureLabel.textContent = 'Creative';
            } else {
                temperatureLabel.textContent = 'Very Creative';
            }
        });
        console.log('[App] Temperature slider listener bound');
    }

    // Set up save settings button
    const saveSettingsBtn = document.querySelector('[data-action="save-settings"]');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', async () => {
            /** @type {import('../settings.js').Settings|undefined} */
            let Settings;
            try {
                ({ Settings } = await import('../settings.js'));
                const settings = await Settings.getSettingsAsync();

                // Get selected provider
                const providerSelect = document.getElementById('setting-provider');
                if (!providerSelect) {
                    Settings.showToast('Provider selector not found', 'error');
                    return;
                }

                const selectedProvider = providerSelect.value;
                settings.llm.provider = selectedProvider;

                // Save provider-specific settings with validation
                if (selectedProvider === 'openrouter') {
                    const openrouterKey = document.getElementById('setting-openrouter-apikey');
                    const openrouterModel = document.getElementById('setting-openrouter-model');
                    if (!openrouterKey?.value?.trim()) {
                        Settings.showToast('OpenRouter API key is required', 'error');
                        return;
                    }
                    if (!openrouterModel?.value?.trim()) {
                        Settings.showToast('OpenRouter model is required', 'error');
                        return;
                    }
                    settings.llm.openrouterApiKey = openrouterKey.value.trim();
                    settings.llm.openrouterModel = openrouterModel.value.trim();
                }

                if (selectedProvider === 'gemini') {
                    const geminiKey = document.getElementById('setting-gemini-apikey');
                    const geminiModel = document.getElementById('setting-gemini-model');
                    if (!geminiKey?.value?.trim()) {
                        Settings.showToast('Gemini API key is required', 'error');
                        return;
                    }
                    if (!geminiModel?.value?.trim()) {
                        Settings.showToast('Gemini model is required', 'error');
                        return;
                    }
                    settings.llm.geminiApiKey = geminiKey.value.trim();
                    settings.llm.geminiModel = geminiModel.value.trim();
                }

                if (selectedProvider === 'openai-compatible') {
                    const openaiKey = document.getElementById('setting-openai-compatible-apikey');
                    const openaiEndpoint = document.getElementById(
                        'setting-openai-compatible-endpoint'
                    );
                    const openaiModel = document.getElementById('setting-openai-compatible-model');
                    if (!openaiKey?.value?.trim()) {
                        Settings.showToast('API key is required', 'error');
                        return;
                    }
                    if (!openaiEndpoint?.value?.trim()) {
                        Settings.showToast('API endpoint is required', 'error');
                        return;
                    }
                    if (!openaiModel?.value?.trim()) {
                        Settings.showToast('Model is required', 'error');
                        return;
                    }
                    settings.llm.openaiCompatibleApiKey = openaiKey.value.trim();
                    settings.llm.openaiCompatibleEndpoint = openaiEndpoint.value.trim();
                    settings.llm.openaiCompatibleModel = openaiModel.value.trim();
                }

                if (selectedProvider === 'ollama') {
                    const ollamaEndpoint = document.getElementById('setting-ollama-endpoint');
                    const ollamaModel = document.getElementById('setting-ollama-model');
                    if (!ollamaEndpoint?.value?.trim()) {
                        Settings.showToast('Ollama endpoint is required', 'error');
                        return;
                    }
                    settings.llm.ollamaEndpoint = ollamaEndpoint.value.trim();
                    settings.llm.ollamaModel = ollamaModel?.value?.trim() || 'llama3.2';
                }

                if (selectedProvider === 'lmstudio') {
                    const lmstudioEndpoint = document.getElementById('setting-lmstudio-endpoint');
                    const lmstudioModel = document.getElementById('setting-lmstudio-model');
                    if (!lmstudioEndpoint?.value?.trim()) {
                        Settings.showToast('LM Studio endpoint is required', 'error');
                        return;
                    }
                    settings.llm.lmstudioEndpoint = lmstudioEndpoint.value.trim();
                    settings.llm.lmstudioModel = lmstudioModel?.value?.trim() || 'local-model';
                }

                // Validate and save max tokens (common to all)
                const maxTokensInput = document.getElementById('setting-max-tokens');
                if (maxTokensInput) {
                    const maxTokens = parseInt(maxTokensInput.value, 10);
                    if (isNaN(maxTokens) || maxTokens < 100 || maxTokens > 32000) {
                        Settings.showToast('Max tokens must be between 100 and 32000', 'error');
                        return;
                    }
                    settings.llm.maxTokens = maxTokens;
                }

                // Validate and save temperature (common to all)
                const temperatureInput = document.getElementById('setting-temperature');
                if (temperatureInput) {
                    const temperature = parseFloat(temperatureInput.value);
                    if (isNaN(temperature) || temperature < 0 || temperature > 2) {
                        Settings.showToast('Temperature must be between 0 and 2', 'error');
                        return;
                    }
                    settings.llm.temperature = temperature;
                }

                // Save Spotify client ID
                const spotifyClientId = document.getElementById('setting-spotify-clientid');
                if (spotifyClientId) {
                    settings.spotify.clientId = spotifyClientId.value.trim();
                }

                await Settings.saveSettings(settings);
                Settings.showToast('Settings saved successfully');
                Settings.hideSettingsModal?.();
            } catch (error) {
                console.error('[App] Failed to save settings:', error);
                Settings.showToast('Failed to save settings: ' + error.message, 'error');
            }
        });
        console.log('[App] Settings save listener bound');
    }

    // Populate settings modal when opened
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener(
            'click',
            async () => {
                const { Settings } = await import('../settings.js');
                const settings = await Settings.getSettingsAsync();

                // Populate provider selection
                const providerSelect = document.getElementById('setting-provider');
                if (providerSelect && settings?.llm?.provider) {
                    providerSelect.value = settings.llm.provider;
                }

                // Populate OpenRouter settings
                const openrouterKey = document.getElementById('setting-openrouter-apikey');
                const openrouterModelSelect = document.getElementById('setting-openrouter-model');
                if (openrouterKey && settings?.llm?.openrouterApiKey) {
                    openrouterKey.value = settings.llm.openrouterApiKey;
                }

                // Populate OpenRouter model dropdown
                if (openrouterModelSelect && Settings.AVAILABLE_MODELS?.openrouter) {
                    openrouterModelSelect.innerHTML = Settings.AVAILABLE_MODELS.openrouter
                        .map(model => `<option value="${model.id}">${model.name}</option>`)
                        .join('');

                    if (settings?.llm?.openrouterModel) {
                        openrouterModelSelect.value = settings.llm.openrouterModel;
                    } else {
                        openrouterModelSelect.value = 'xiaomi/mimo-v2-flash:free';
                    }
                }

                // Populate Gemini settings
                const geminiKey = document.getElementById('setting-gemini-apikey');
                const geminiModelSelect = document.getElementById('setting-gemini-model');
                if (geminiKey && settings?.llm?.geminiApiKey) {
                    geminiKey.value = settings.llm.geminiApiKey;
                }

                // Populate Gemini model dropdown
                if (geminiModelSelect && Settings.AVAILABLE_MODELS?.gemini) {
                    geminiModelSelect.innerHTML = Settings.AVAILABLE_MODELS.gemini
                        .map(model => `<option value="${model.id}">${model.name}</option>`)
                        .join('');

                    if (settings?.llm?.geminiModel) {
                        geminiModelSelect.value = settings.llm.geminiModel;
                    } else {
                        geminiModelSelect.value = 'gemini-2.5-flash';
                    }
                }

                // Populate OpenAI Compatible settings
                const openaiKey = document.getElementById('setting-openai-compatible-apikey');
                const openaiEndpoint = document.getElementById(
                    'setting-openai-compatible-endpoint'
                );
                const openaiModelSelect = document.getElementById(
                    'setting-openai-compatible-model'
                );
                if (openaiKey && settings?.llm?.openaiCompatibleApiKey) {
                    openaiKey.value = settings.llm.openaiCompatibleApiKey;
                }
                if (openaiEndpoint && settings?.llm?.openaiCompatibleEndpoint) {
                    openaiEndpoint.value = settings.llm.openaiCompatibleEndpoint;
                } else if (openaiEndpoint) {
                    openaiEndpoint.value = 'https://api.openai.com/v1';
                }

                // Populate OpenAI-compatible model dropdown
                if (openaiModelSelect && Settings.AVAILABLE_MODELS?.['openai-compatible']) {
                    openaiModelSelect.innerHTML = Settings.AVAILABLE_MODELS['openai-compatible']
                        .map(model => `<option value="${model.id}">${model.name}</option>`)
                        .join('');

                    if (settings?.llm?.openaiCompatibleModel) {
                        openaiModelSelect.value = settings.llm.openaiCompatibleModel;
                    } else {
                        openaiModelSelect.value = 'gpt-4o-mini';
                    }
                }

                // Populate Ollama settings
                const ollamaEndpoint = document.getElementById('setting-ollama-endpoint');
                if (ollamaEndpoint && settings?.llm?.ollamaEndpoint) {
                    ollamaEndpoint.value = settings.llm.ollamaEndpoint;
                } else if (ollamaEndpoint) {
                    ollamaEndpoint.value = 'http://localhost:11434';
                }
                const ollamaModel = document.getElementById('setting-ollama-model');
                if (ollamaModel && settings?.llm?.ollamaModel) {
                    ollamaModel.value = settings.llm.ollamaModel;
                } else if (ollamaModel) {
                    ollamaModel.value = 'llama3.2';
                }

                // Populate LM Studio settings
                const lmstudioEndpoint = document.getElementById('setting-lmstudio-endpoint');
                if (lmstudioEndpoint && settings?.llm?.lmstudioEndpoint) {
                    lmstudioEndpoint.value = settings.llm.lmstudioEndpoint;
                } else if (lmstudioEndpoint) {
                    lmstudioEndpoint.value = 'http://localhost:1234/v1';
                }
                const lmstudioModel = document.getElementById('setting-lmstudio-model');
                if (lmstudioModel && settings?.llm?.lmstudioModel) {
                    lmstudioModel.value = settings.llm.lmstudioModel;
                } else if (lmstudioModel) {
                    lmstudioModel.value = 'local-model';
                }

                // Populate max tokens
                const maxTokensInput = document.getElementById('setting-max-tokens');
                if (maxTokensInput && settings?.llm?.maxTokens) {
                    maxTokensInput.value = settings.llm.maxTokens;
                } else if (maxTokensInput) {
                    maxTokensInput.value = 4500;
                }

                // Populate temperature slider
                const temperatureInput = document.getElementById('setting-temperature');
                const temperatureValue = document.getElementById('temperature-value');
                const temperatureLabel = document.getElementById('temperature-label');
                if (temperatureInput && settings?.llm?.temperature !== undefined) {
                    temperatureInput.value = settings.llm.temperature;
                    // Update display
                    if (temperatureValue && temperatureLabel) {
                        const val = settings.llm.temperature;
                        temperatureValue.textContent = val.toFixed(1);
                        if (val < 0.4) {
                            temperatureLabel.textContent = 'Focused';
                        } else if (val < 1.0) {
                            temperatureLabel.textContent = 'Balanced';
                        } else if (val < 1.6) {
                            temperatureLabel.textContent = 'Creative';
                        } else {
                            temperatureLabel.textContent = 'Very Creative';
                        }
                    }
                } else if (temperatureInput) {
                    temperatureInput.value = 0.7;
                    if (temperatureValue && temperatureLabel) {
                        temperatureValue.textContent = '0.7';
                        temperatureLabel.textContent = 'Balanced';
                    }
                }

                // Populate Spotify client ID
                const spotifyClientId = document.getElementById('setting-spotify-clientid');
                if (spotifyClientId && settings?.spotify?.clientId) {
                    spotifyClientId.value = settings.spotify.clientId;
                }

                // Trigger provider change to show correct fields
                if (providerSelect) {
                    providerSelect.dispatchEvent(new Event('change'));
                }
            },
            { once: false }
        ); // Allow multiple opens
    }
}

async function validateExistingLicense() {
    try {
        const licenseData = localStorage.getItem('rhythm_chamber_license');
        if (!licenseData) return;
        const license = JSON.parse(licenseData);
        if (!license?.licenseKey) return;
        const result = await LemonSqueezyService.validateLicense(license.licenseKey);
        if (!result.valid && result.error === 'EXPIRED') {
            localStorage.removeItem('rhythm_chamber_license');
            showToast(
                'Your Premium license has expired. Please renew to continue using Premium features.',
                'warning',
                6000
            );
        }
    } catch (e) {
        void e;
    }
}

/**
 * Load saved settings from localStorage into AppState
 * Ensures user preferences (max tokens, etc.) are applied on startup
 */
async function loadSavedSettings() {
    try {
        const saved = localStorage.getItem('rhythm_chamber_settings');
        if (!saved) {
            console.log('[App] No saved settings found, using defaults');
            return;
        }

        const settings = JSON.parse(saved);
        console.log('[App] Loading saved settings:', settings);

        // Note: Settings are managed via localStorage and input elements,
        // not in AppState (which only supports: view, data, lite, ui, operations, demo)

        // Update input elements to reflect loaded values
        if (settings.maxTokens) {
            const maxTokensInput = document.getElementById('setting-max-tokens');
            if (maxTokensInput) {
                maxTokensInput.value = settings.maxTokens;
            }
        }
    } catch (e) {
        console.error('[App] Failed to load saved settings:', e);
        // Don't block app startup on settings load failure
    }
}

/**
 * Restore view state from persisted data
 * Checks if personality data exists and restores the appropriate view
 */
async function restoreViewState() {
    try {
        // Check if we have persisted personality data
        const personality = await Storage.getPersonality?.();
        if (!personality) {
            console.log('[App] No persisted personality data found, showing upload view');
            return;
        }

        // We have personality data, restore the reveal view
        console.log('[App] Restoring view from persisted data:', personality);

        // Also load streams, chunks, and patterns for complete state restoration
        // ViewController.showReveal() expects streams from AppState.getActiveData()
        const streams = await Storage.getStreams?.();
        const chunks = await Storage.getChunks?.();
        const patterns = await Storage.getPatterns?.();

        console.log(
            '[App] Loaded persisted data - streams:',
            streams?.length || 0,
            'patterns:',
            !!patterns
        );

        // Update AppState with the persisted personality AND data
        // Include ALL fields needed by ViewController.showReveal()
        if (typeof AppState !== 'undefined') {
            const personalityData = {
                type: personality.type,
                name: personality.name,
                emoji: personality.emoji,
                tagline: personality.tagline,
                description: personality.description,
                evidence: personality.evidence,
                allEvidence: personality.allEvidence,
                score: personality.score,
                confidence: personality.confidence,
                secondaryType: personality.secondaryType,
                breakdown: personality.breakdown,
            };

            // Update data domain with ALL persisted data (personality, streams, chunks, patterns)
            // If patterns storage is not available, reconstruct minimal patterns from personality.summary
            // (personality.summary contains the patterns summary that was embedded during processing)
            const restoredPatterns =
                patterns || (personality.summary ? { summary: personality.summary } : null);

            AppState.update('data', {
                personality: personalityData,
                streams: streams || null,
                chunks: chunks || null,
                patterns: restoredPatterns,
            });
            AppState.update('view', { current: 'reveal' });

            console.log('[App] AppState updated with personality and data');
        }

        // Wait for next tick to ensure AppState updates propagate
        await new Promise(resolve => queueMicrotask(resolve));

        // Show the reveal section
        if (typeof ViewController !== 'undefined' && ViewController.showReveal) {
            ViewController.showReveal();
            console.log('[App] ViewController.showReveal() called');
        }

        console.log('[App] View restored successfully');
    } catch (e) {
        console.error('[App] Failed to restore view state:', e);
        // Don't block app startup on restoration failure
    }
}

async function init() {
    const secure = Crypto.checkSecureContext?.();
    if (secure === false) {
        showToast(
            'Running in limited mode (insecure context). Use HTTPS or localhost.',
            'warning',
            6000
        );
    }

    await AppState.init();
    if (!AppState.isReady()) {
        showLoadingError(['AppState'], []);
        return;
    }

    try {
        await Storage.init();
    } catch (e) {
        console.error('[App] Storage init failed:', e);
        showLoadingError(['Storage'], []);
        return;
    }

    // Register EventBus listeners BEFORE TabCoordinator.init() to avoid race condition
    bindAuthorityUI();

    try {
        await TabCoordinator.init();
    } catch (e) {
        console.warn('[App] Tab coordination unavailable:', e);
    }

    try {
        await SessionManager.init();
    } catch (e) {
        console.warn('[App] SessionManager init failed:', e);
    }

    registerContainerServices();
    initializeControllers();

    // Initialize MessageOperations with optional RAG dependency
    try {
        const RAG = await ModuleRegistry.load('RAG');
        MessageOperations.init({
            DataQuery,
            TokenCounter,
            Functions,
            RAG,
        });
        console.log('[App] MessageOperations initialized with RAG');
    } catch (e) {
        console.warn('[App] RAG not available, MessageOperations will fall back');
        MessageOperations.init({
            DataQuery,
            TokenCounter,
            Functions,
            RAG: null,
        });
    }

    bindSettingsButtons();
    bindFileUpload();

    // Load saved settings into AppState
    await loadSavedSettings();

    // Restore view state from persisted data
    await restoreViewState();

    // Check for demo mode URL parameter (from landing page "Try Demo Mode" button)
    // This triggers demo mode when accessing app.html?mode=demo
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'demo') {
        console.log('[App] Demo mode requested via URL parameter, loading demo...');
        try {
            await DemoController.loadDemoMode();
            // Clean up the URL parameter without triggering a reload
            const cleanUrl = window.location.pathname + window.location.hash;
            window.history.replaceState({}, document.title, cleanUrl);
        } catch (e) {
            console.error('[App] Failed to load demo mode:', e);
            showToast('Failed to load demo mode. Please try again.', 'error', 5000);
        }
    }

    await validateExistingLicense();

    window.addEventListener('unhandledrejection', event => {
        showToast(`Error: ${event.reason?.message || String(event.reason)}`, 'error', 5000);
    });
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        init().catch(e => {
            console.error('[App] Init failed:', e);
            showToast('App failed to start', 'error', 6000);
        });
    });
}

// Expose debugging helpers in development
if (typeof window !== 'undefined') {
    window.getDependencyGraph = getDependencyGraph;
    window.getContainerStatus = getContainerStatus;
    window.getDependencyGraphDot = getDependencyGraphDot;
    // Note: CONTROLLER_DEPENDENCIES removed - use Container.getAllInstances()
    console.log('[App] DI Container loaded:', Object.keys(Container));
    console.log('[App] Controller dependencies:', Object.keys(CONTROLLER_DEPENDENCIES));
}

export { init };
export default { init };
