/**
 * Security Module - ES Module Re-export
 * 
 * This file re-exports the modular security system for easy importing.
 * All security functionality comes from js/security/index.js.
 * 
 * ARCHITECTURE:
 * - js/security/encryption.js - Cryptographic operations (AES-GCM, PBKDF2)
 * - js/security/token-binding.js - XSS protection (device fingerprinting, token binding)
 * - js/security/anomaly.js - Behavioral detection (rate limiting, anomaly detection)
 * - js/security/recovery-handlers.js - Recovery action handlers
 * - js/security/index.js - Unified facade
 * - js/security.js - This file (re-export for convenient imports)
 * 
 * Usage:
 *   import { Security } from './security.js';
 *   // or
 *   import { Security, ErrorContext } from './security/index.js';
 */

// Re-export everything from the security facade
export { Security, ErrorContext, Encryption, TokenBinding, Anomaly } from './security/index.js';

// Also export the RecoveryHandlers for direct access
export { RecoveryHandlers } from './security/recovery-handlers.js';

/**
 * Security Checklist Module
 * 
 * Shows a security checklist on first run to set clear expectations
 * about what the app can and cannot protect against.
 */

// Security checklist items
const SECURITY_CHECKLIST = {
    recommended: [
        { id: 'https', text: 'Use HTTPS only', checked: false },
        { id: 'extensions', text: 'Disable browser extensions on this site', checked: false },
        { id: 'shared-computers', text: 'Don\'t use public/shared computers', checked: false }
    ],
    limitations: [
        { id: 'keyloggers', text: 'We cannot protect against keyloggers', checked: true, disabled: true },
        { id: 'screenshots', text: 'We cannot prevent screenshot theft', checked: true, disabled: true }
    ]
};

/**
 * Check if this is the first run by looking for stored preference
 * @returns {Promise<boolean>}
 */
async function isFirstRun() {
    try {
        // Check if user has already seen the security checklist
        const hasSeenChecklist = localStorage.getItem('rhythm_chamber_security_checklist_seen');
        return !hasSeenChecklist;
    } catch (e) {
        console.error('[SecurityChecklist] Error checking first run:', e);
        return false;
    }
}

/**
 * Mark security checklist as seen
 */
function markChecklistSeen() {
    try {
        localStorage.setItem('rhythm_chamber_security_checklist_seen', 'true');
    } catch (e) {
        console.error('[SecurityChecklist] Error marking checklist as seen:', e);
    }
}

/**
 * Create and show the security checklist modal
 */
function showSecurityChecklist() {
    // Remove existing modal if present
    const existing = document.getElementById('security-checklist-modal');
    if (existing) {
        existing.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'security-checklist-modal';
    modal.className = 'security-checklist-modal';

    modal.innerHTML = `
        <div class="security-checklist-overlay"></div>
        <div class="security-checklist-content">
            <div class="security-checklist-header">
                <div class="security-icon">🔒</div>
                <h2>Security Checklist</h2>
                <p class="subtitle">Set expectations before you start</p>
            </div>
            
            <div class="security-checklist-body">
                <div class="checklist-section">
                    <h3>✅ Recommended Practices</h3>
                    <p class="section-description">Help protect your data by following these guidelines:</p>
                    <div class="checklist-items">
                        ${SECURITY_CHECKLIST.recommended.map(item => `
                            <label class="checklist-item">
                                <input type="checkbox" id="check-${item.id}" ${item.checked ? 'checked' : ''}>
                                <span class="checkmark"></span>
                                <span class="item-text">${item.text}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>

                <div class="checklist-section limitations">
                    <h3>⚠️ What We Cannot Protect Against</h3>
                    <p class="section-description">Be aware of these fundamental limitations:</p>
                    <div class="checklist-items">
                        ${SECURITY_CHECKLIST.limitations.map(item => `
                            <label class="checklist-item ${item.disabled ? 'disabled' : ''}">
                                <input type="checkbox" ${item.checked ? 'checked' : ''} ${item.disabled ? 'disabled' : ''}>
                                <span class="checkmark ${item.disabled ? 'disabled' : ''}"></span>
                                <span class="item-text">${item.text}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>

                <div class="security-summary">
                    <div class="summary-box">
                        <strong>Bottom Line:</strong>
                        <p>Rhythm Chamber runs entirely in your browser. Your data never leaves your device, but your device's security is your responsibility.</p>
                    </div>
                </div>
            </div>
            
            <div class="security-checklist-footer">
                <button class="btn btn-primary" id="security-checklist-acknowledge">
                    I Understand • Continue
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Add event listeners
    const overlay = modal.querySelector('.security-checklist-overlay');
    const acknowledgeBtn = modal.querySelector('#security-checklist-acknowledge');

    // Close on overlay click
    overlay.addEventListener('click', () => {
        acknowledgeChecklist();
    });

    // Close on button click
    acknowledgeBtn.addEventListener('click', () => {
        acknowledgeChecklist();
    });

    // Close on Escape key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            acknowledgeChecklist();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // Prevent modal content click from closing
    modal.querySelector('.security-checklist-content').addEventListener('click', (e) => {
        e.stopPropagation();
    });

    function acknowledgeChecklist() {
        markChecklistSeen();
        modal.classList.add('closing');
        setTimeout(() => {
            modal.remove();
            // Show welcome toast
            if (window.Settings?.showToast) {
                window.Settings.showToast('Welcome to Rhythm Chamber! Stay secure.', 3000);
            }
        }, 200);
    }
}

/**
 * Initialize security checklist module
 */
async function initSecurityChecklist() {
    // Only show on first run
    if (await isFirstRun()) {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', showSecurityChecklist);
        } else {
            // Small delay to ensure other UI is ready
            setTimeout(showSecurityChecklist, 1000);
        }
    }
}

// Export for use in app.js
export const SecurityChecklist = {
    init: initSecurityChecklist,
    isFirstRun,
    show: showSecurityChecklist
};

// Make available globally for backwards compatibility
if (typeof window !== 'undefined') {
    window.SecurityChecklist = SecurityChecklist;
}

console.log('[Security] Module loaded with SecurityChecklist');
