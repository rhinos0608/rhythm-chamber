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
if (typeof window !== 'undefined') {
    window.Container = Container;
}

function showToast(message, type = 'info', duration = 3000) {
    if (typeof document === 'undefined') return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = String(message);
    toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:10px 14px;border-radius:8px;z-index:99999;max-width:90vw;';
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
    Container.registerController('MessageOperations', MessageOperations);
}

/**
 * Explicit controller dependency declarations
 * Each controller declares its dependencies for better clarity
 */
const CONTROLLER_DEPENDENCIES = Object.freeze({
    FileUploadController: ['Storage', 'AppState', 'OperationLock', 'Patterns', 'Personality', 'ViewController', 'showToast'],
    SpotifyController: ['Storage', 'AppState', 'Spotify', 'Patterns', 'Personality', 'ViewController', 'showToast'],
    DemoController: ['AppState', 'DemoData', 'ViewController', 'Patterns', 'showToast'],
    ResetController: ['Storage', 'AppState', 'Spotify', 'Chat', 'OperationLock', 'ViewController', 'showToast', 'FileUploadController'],
    SidebarController: ['AppState', 'Storage', 'ViewController', 'showToast'],
    ChatUIController: ['AppState', 'Storage', 'ViewController', 'showToast'],
    MessageOperations: ['DataQuery', 'TokenCounter', 'Functions']
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

function bindAuthorityUI() {
    if (typeof document === 'undefined') return;
    TabCoordinator.onAuthorityChange((authority) => {
        const isPrimary = authority.level === 'primary';
        document.body.classList.toggle('read-only-mode', !isPrimary);
    });
}

function bindFileUpload() {
    if (typeof document === 'undefined') return;

    // Set up file input change listener
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
        fileInput.addEventListener('change', async (event) => {
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
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('drag-over');
        });

        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('drag-over');
        });

        uploadZone.addEventListener('drop', async (e) => {
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
            if (message && typeof Chat !== 'undefined' && Chat.sendMessage) {
                chatInput.value = '';
                await Chat.sendMessage(message);
            }
        };

        chatSend.addEventListener('click', sendChatMessage);
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
        console.log('[App] Chat send listeners bound');
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
        resetConfirmInput.addEventListener('input', (e) => {
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
    const cancelBtns = document.querySelectorAll('[data-action="hide-reset-modal"], [data-action="hide-delete-modal"]');
    cancelBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal-overlay');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    });
    console.log('[App] Modal cancel listeners bound');

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
            showToast('Your Premium license has expired. Please renew to continue using Premium features.', 'warning', 6000);
        }
    } catch (e) {
        void e;
    }
}

async function init() {
    const secure = Crypto.checkSecureContext?.();
    if (secure === false) {
        showToast('Running in limited mode (insecure context). Use HTTPS or localhost.', 'warning', 6000);
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

    bindSettingsButtons();
    bindAuthorityUI();
    bindFileUpload();

    await validateExistingLicense();

    window.addEventListener('unhandledrejection', (event) => {
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
    window.CONTROLLER_DEPENDENCIES = CONTROLLER_DEPENDENCIES;
}

export { init };
export default { init };
