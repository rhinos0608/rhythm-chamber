/**
 * Tab Coordinator - Authority Module
 *
 * Manages tab authority state and UI state:
 * - Tracks whether this tab is primary or secondary
 * - Manages authority change listeners
 * - Provides authority level information
 * - Handles UI state changes (disable write operations)
 *
 * @module tab-coordination/modules/authority
 */

import { EventBus } from '../../event-bus.js';
import { MESSAGE_TYPES, TAB_ID, vectorClock } from '../constants.js';

// Lazy import to avoid circular dependency
let sendMessage;
async function getSendMessage() {
    if (!sendMessage) {
        const module = await import('./message-sender.js');
        sendMessage = module.sendMessage;
    }
    return sendMessage;
}

// ==========================================
// Authority State
// ==========================================

let isPrimaryTab = true;
const authorityChangeListeners = [];

// ==========================================
// Authority Getters
// ==========================================

/**
 * Check if this tab is primary
 */
export function getIsPrimaryTab() {
    return isPrimaryTab;
}

/**
 * Set primary tab state
 */
export function setIsPrimaryTab(value) {
    isPrimaryTab = value;
}

/**
 * Get authority level information
 */
export function getAuthorityLevel() {
    return {
        level: isPrimaryTab ? 'primary' : 'secondary',
        canWrite: isPrimaryTab,
        canRead: true,
        tabId: TAB_ID,
        mode: isPrimaryTab ? 'full_access' : 'read_only',
        message: isPrimaryTab
            ? 'Full access - You can make changes'
            : 'Read-only mode - Another tab has primary control',
    };
}

// ==========================================
// Authority Listeners
// ==========================================

/**
 * Notify all authority change listeners
 */
export function notifyAuthorityChange() {
    const level = getAuthorityLevel();
    EventBus.emit('tab:authority_changed', {
        isPrimary: level.canWrite,
        level: level.level,
        mode: level.mode,
        message: level.message,
    });

    for (const listener of authorityChangeListeners) {
        try {
            listener(level);
        } catch (e) {
            console.error('[TabCoordination] Authority listener error:', e);
        }
    }
}

/**
 * Register callback for authority changes
 * @param {Function} callback - Callback function receiving authority level
 * @returns {Function} Unsubscribe function
 */
export function onAuthorityChange(callback) {
    authorityChangeListeners.push(callback);
    callback(getAuthorityLevel());

    return () => {
        const idx = authorityChangeListeners.indexOf(callback);
        if (idx >= 0) {
            authorityChangeListeners.splice(idx, 1);
        }
    };
}

/**
 * Get all authority change listeners
 */
export function getAuthorityChangeListeners() {
    return [...authorityChangeListeners];
}

// ==========================================
// UI State Management
// ==========================================

/**
 * Disable write operations in the UI
 * Disables upload zone, file input, chat input, buttons
 */
function disableWriteOperations() {
    if (typeof document === 'undefined') return;

    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    if (uploadZone) {
        uploadZone.style.pointerEvents = 'none';
        uploadZone.style.opacity = '0.5';
    }
    if (fileInput) fileInput.disabled = true;

    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');
    if (chatInput) {
        chatInput.disabled = true;
        chatInput.placeholder = 'Read-only mode (close other tab to enable)';
    }
    if (chatSend) chatSend.disabled = true;

    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) resetBtn.disabled = true;

    const spotifyConnectBtn = document.getElementById('spotify-connect-btn');
    if (spotifyConnectBtn) spotifyConnectBtn.disabled = true;

    const newChatBtn = document.getElementById('new-chat-btn');
    if (newChatBtn) newChatBtn.disabled = true;
}

/**
 * Handle transition to secondary mode
 * Stops watermark broadcast and disables UI write operations
 * Note: stopWatermarkBroadcast must be called separately to avoid circular dependency
 */
export function handleSecondaryMode() {
    if (typeof document !== 'undefined') {
        const modal = document.getElementById('multi-tab-modal');
        if (modal) {
            modal.style.display = 'flex';
            const msgEl = modal.querySelector('.modal-message');
            if (msgEl) {
                msgEl.textContent =
                    'Rhythm Chamber is open in another tab. ' +
                    'This tab is now read-only to prevent data corruption. ' +
                    'Close the other tab to regain full access here.';
            }
        }
    }

    disableWriteOperations();
    notifyAuthorityChange();
    EventBus.emit('tab:secondary_mode', { primaryTabId: null });
}

/**
 * Enter safe mode due to critical error
 * Disables all write operations and notifies other tabs
 */
export async function enterSafeMode(reason) {
    console.error(`[TabCoordination] ENTERING SAFE MODE: ${reason}`);
    disableWriteOperations();

    if (typeof document !== 'undefined') {
        const modal = document.getElementById('multi-tab-modal');
        if (modal) {
            modal.style.display = 'flex';
            const msgEl = modal.querySelector('.modal-message');
            if (msgEl) {
                msgEl.textContent =
                    'A critical error occurred in tab coordination. ' +
                    'This tab has been placed in safe mode to prevent data corruption. ' +
                    'Please refresh the page. Error: ' +
                    reason;
            }
        }
    }

    const msg = await getSendMessage();
    msg(
        {
            type: MESSAGE_TYPES.SAFE_MODE_CHANGED,
            tabId: TAB_ID,
            enabled: true,
            reason,
        },
        true
    );
}

// ==========================================
// Cleanup
// ==========================================

/**
 * Clear all authority change listeners
 */
export function clearAuthorityChangeListeners() {
    authorityChangeListeners.length = 0;
}
