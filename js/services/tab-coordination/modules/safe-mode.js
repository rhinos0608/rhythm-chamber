/**
 * Tab Coordinator - Safe Mode Module
 *
 * Handles safe mode UI and notifications:
 * - Shows safe mode warning banner from remote tabs
 * - Hides safe mode warning
 * - Broadcasts safe mode changes to other tabs
 *
 * @module tab-coordination/modules/safe-mode
 */

import { MESSAGE_TYPES, TAB_ID } from '../constants.js';
import { sendMessage } from './message-sender.js';
import { escapeHtml } from '../../../utils/html-escape.js';

// ==========================================
// Safe Mode UI
// ==========================================

/**
 * Show safe mode warning banner from remote tab
 * @param {string} reason - Reason for safe mode activation
 */
export function showSafeModeWarningFromRemote(reason) {
    if (typeof document === 'undefined') return;

    let banner = document.getElementById('safe-mode-remote-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'safe-mode-remote-banner';
        banner.className = 'safe-mode-banner';

        // security-validated: Uses escapeHtml() from js/utils/html-escape.js
        // Escaping method: DOM-based textContent assignment
        // Data flow: reason parameter → escapeHtml() → innerHTML insertion
        // Context: Safe mode activation reason from inter-tab communication
        // Review date: 2026-01-28
        banner.innerHTML = `
            <span class="safe-mode-icon">⚠️</span>
            <span class="safe-mode-message">Safe Mode activated in another tab: <strong>${escapeHtml(reason || 'Unknown reason')}</strong></span>
            <button class="safe-mode-dismiss" data-action="dismiss-safe-mode-banner" aria-label="Dismiss warning">×</button>
        `;

        const dismissBtn = banner.querySelector('.safe-mode-dismiss');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => banner.remove());
        }

        document.body.prepend(banner);
    } else {
        const msgEl = banner.querySelector('.safe-mode-message');
        if (msgEl) {
            // security-validated: Uses escapeHtml() from js/utils/html-escape.js
            // Escaping method: DOM-based textContent assignment
            // Data flow: reason parameter → escapeHtml() → innerHTML insertion
            // Context: Updating existing banner with new reason
            // Review date: 2026-01-28
            msgEl.innerHTML = `Safe Mode activated in another tab: <strong>${escapeHtml(reason || 'Unknown reason')}</strong>`;
        }
        banner.style.display = 'flex';
    }
}

/**
 * Hide safe mode warning banner
 */
export function hideSafeModeWarning() {
    if (typeof document === 'undefined') return;

    const banner = document.getElementById('safe-mode-remote-banner');
    if (banner) {
        banner.style.display = 'none';
    }
}

/**
 * Broadcast safe mode change to all tabs
 * @param {boolean} enabled - Whether safe mode is enabled
 * @param {string} reason - Reason for safe mode change
 */
export function broadcastSafeModeChange(enabled, reason) {
    sendMessage({
        type: MESSAGE_TYPES.SAFE_MODE_CHANGED,
        tabId: TAB_ID,
        enabled,
        reason
    });
}
