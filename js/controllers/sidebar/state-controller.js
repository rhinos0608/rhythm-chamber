/**
 * Sidebar State Controller
 *
 * Manages sidebar collapse/expand state and visibility.
 * Handles persistence of sidebar preferences.
 *
 * Responsibilities (Single Responsibility Principle):
 * - Toggle sidebar collapsed state
 * - Update sidebar visibility (collapsed/expanded classes)
 * - Persist state to storage
 * - Hide sidebar for non-chat views
 *
 * Mobile-specific behavior is delegated to MobileResponsivityController.
 *
 * @module controllers/sidebar/state-controller
 */

import { Storage } from '../../storage.js';
import { AppState } from '../../state/app-state.js';
import { STORAGE_KEYS } from '../../storage/keys.js';
import { MobileResponsivityController } from './mobile-responsiveness.js';

const SIDEBAR_STATE_KEY = STORAGE_KEYS.SIDEBAR_COLLAPSED;

// DOM element references (cached)
let chatSidebar = null;
let sidebarOverlay = null;

// Resize handler for mobile overlay state sync
let resizeHandler = null;

/**
 * Initialize DOM references
 */
function initDOMReferences() {
    chatSidebar = document.getElementById('chat-sidebar');
    sidebarOverlay = document.getElementById('sidebar-overlay');
}

/**
 * Initialize sidebar state
 * Restores saved state and sets up resize handler
 */
async function init() {
    initDOMReferences();

    // Restore collapsed state from unified storage or localStorage
    let savedState = null;
    if (Storage.getConfig) {
        savedState = await Storage.getConfig(SIDEBAR_STATE_KEY);
    }
    if (savedState === null) {
        savedState = localStorage.getItem(SIDEBAR_STATE_KEY);
    }

    // Update AppState with restored sidebar state
    const collapsed = savedState === 'true' || savedState === true;
    AppState.setSidebarCollapsed(collapsed);
    updateVisibility();

    // Setup resize handler to sync overlay state on breakpoint changes
    setupResizeHandler();
}

/**
 * Setup resize handler for responsive behavior
 */
function setupResizeHandler() {
    // Remove existing handler if present
    if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
    }

    // Throttled resize handler
    const throttle = (fn, delay) => {
        let lastCall = 0;
        return function(...args) {
            const now = Date.now();
            if (now - lastCall >= delay) {
                lastCall = now;
                fn.apply(this, args);
            }
        };
    };

    resizeHandler = throttle(() => {
        updateVisibility();
    }, 100);

    window.addEventListener('resize', resizeHandler);
}

/**
 * Update sidebar visibility based on current state
 * Handles desktop collapse/expand and delegates mobile overlay to MobileResponsivityController
 */
function updateVisibility() {
    if (!chatSidebar) return;

    const uiState = AppState.get('ui');

    // Handle collapsed state
    if (uiState.sidebarCollapsed) {
        chatSidebar.classList.add('collapsed');
    } else {
        chatSidebar.classList.remove('collapsed');
    }

    // Handle mobile overlay via MobileResponsivityController (SRP: separation of concerns)
    MobileResponsivityController.updateOverlayVisibility(sidebarOverlay, uiState.sidebarCollapsed);
}

/**
 * Toggle sidebar collapsed state
 * Switches between expanded and collapsed, persists to storage
 */
function toggle() {
    const currentCollapsed = AppState.get('ui').sidebarCollapsed;
    const newCollapsed = !currentCollapsed;

    // Update AppState
    AppState.setSidebarCollapsed(newCollapsed);

    // Save to unified storage and localStorage
    if (Storage.setConfig) {
        Storage.setConfig(SIDEBAR_STATE_KEY, newCollapsed)
            .catch(err => console.warn('[SidebarStateController] Failed to save sidebar state:', err));
    }
    localStorage.setItem(SIDEBAR_STATE_KEY, newCollapsed.toString());

    // Mobile: Toggle open class via MobileResponsivityController (SRP: separation of concerns)
    MobileResponsivityController.setMobileSidebarState(chatSidebar, !newCollapsed);

    // Update visibility
    updateVisibility();
}

/**
 * Close sidebar (mobile)
 * Collapses sidebar and removes open class via MobileResponsivityController
 */
function close() {
    // Update AppState
    AppState.setSidebarCollapsed(true);

    // Save to unified storage and localStorage
    if (Storage.setConfig) {
        Storage.setConfig(SIDEBAR_STATE_KEY, true)
            .catch(err => console.warn('[SidebarStateController] Failed to save sidebar state on close:', err));
    }
    localStorage.setItem(SIDEBAR_STATE_KEY, 'true');

    // Mobile: Close sidebar via MobileResponsivityController (SRP: separation of concerns)
    MobileResponsivityController.closeMobileSidebar(chatSidebar);

    updateVisibility();
}

/**
 * Hide sidebar for non-chat views
 * Adds hidden class when not in chat view
 */
function hideForNonChatViews() {
    const viewState = AppState.get('view');
    if (chatSidebar && viewState.current !== 'chat') {
        chatSidebar.classList.add('hidden');
    } else if (chatSidebar) {
        chatSidebar.classList.remove('hidden');
    }
}

/**
 * Get current sidebar state
 * @returns {{collapsed: boolean, hasDOM: boolean}}
 */
function getState() {
    const uiState = AppState.get('ui');
    return {
        collapsed: uiState.sidebarCollapsed,
        hasDOM: !!chatSidebar
    };
}

/**
 * Cleanup event listeners and state
 */
function destroy() {
    // Remove resize handler
    if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
    }

    // Clear DOM references
    chatSidebar = null;
    sidebarOverlay = null;
}

// ES Module export
export const SidebarStateController = {
    init,
    updateVisibility,
    toggle,
    close,
    hideForNonChatViews,
    getState,
    destroy
};

console.log('[SidebarStateController] State controller loaded');
