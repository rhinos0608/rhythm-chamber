/**
 * Premium Controller
 *
 * Manages premium feature gates and upgrade flow.
 *
 * Features:
 * - Shows upgrade modal when free users hit premium limits
 * - Displays feature comparison and pricing
 * - Handles upgrade click-throughs
 * - Integrates with PremiumQuota for usage tracking
 *
 * @module controllers/premium-controller
 */

import { Pricing } from '../pricing.js';
import { PremiumQuota } from '../services/premium-quota.js';
import { PremiumGatekeeper } from '../services/premium-gatekeeper.js';
import { createFocusTrap } from '../utils/focus-trap.js';
import { LemonSqueezyService } from '../services/lemon-squeezy-service.js';
import { escapeHtml } from '../utils/html-escape.js';
import { Settings } from '../settings/index.js';

// ==========================================
// Premium Controller
// ==========================================

const PremiumController = {
    // Modal state
    _modal: null,
    _focusTrap: null,
    _currentFeature: null,
    _upgradeCallback: null,
    _lemonSqueezyInitialized: false,

    /**
     * Check if user has access to a premium feature
     * Shows upgrade modal if not
     *
     * @param {string} feature - Feature key to check
     * @param {Function} [onGranted] - Callback if access is granted
     * @returns {Promise<boolean>} True if user has access
     */
    checkFeatureAccess(feature, onGranted) {
        // Check if user has access
        if (Pricing.hasFeatureAccess(feature)) {
            if (typeof onGranted === 'function') {
                onGranted();
            }
            return Promise.resolve(true);
        }

        // No access - show upgrade modal
        this.showUpgradeModal(feature);
        return Promise.resolve(false);
    },

    /**
     * Check if user can create a playlist
     * Shows upgrade modal if quota exceeded
     *
     * @returns {Promise<boolean>} True if user can create playlist
     */
    async canCreatePlaylist() {
        const access = await PremiumGatekeeper.checkFeature('unlimited_playlists');

        if (access.allowed) {
            return true;
        }

        // Show upgrade modal with quota message
        this.showPlaylistUpgradeModal(access.quotaRemaining ?? 0, access.reason);
        return false;
    },

    /**
     * Record a playlist creation
     * Should be called after successful playlist generation
     */
    async recordPlaylistCreation() {
        await PremiumQuota.recordPlaylistCreation();
    },

    /**
     * Initialize Lemon Squeezy event handlers
     * Should be called once on app initialization
     */
    async initLemonSqueezy() {
        if (this._lemonSqueezyInitialized) {
            return;
        }

        try {
            // Load Lemon.js
            await LemonSqueezyService.loadLemonJS();

            // Setup event handlers
            LemonSqueezyService.setupEventHandlers({
                onCheckoutSuccess: async data => {
                    console.log('[PremiumController] Checkout successful:', data);

                    // Activate license if key provided
                    if (data.licenseKey) {
                        const result = await LemonSqueezyService.activateLicense(data.licenseKey);
                        if (result.success) {
                            // Show success message
                            Settings.showToast(
                                'Premium activated! Enjoy unlimited playlists.',
                                5000
                            );
                            // Refresh UI to show premium features
                            setTimeout(() => {
                                window.location.reload();
                            }, 1500);
                        } else {
                            // Show activation error
                            Settings.showToast(
                                `Activation failed: ${result.message || 'Unknown error'}`,
                                5000
                            );
                        }
                    }
                },
                onCheckoutClosed: () => {
                    console.log('[PremiumController] Checkout closed');
                },
            });

            this._lemonSqueezyInitialized = true;
            console.log('[PremiumController] Lemon Squeezy initialized');
        } catch (e) {
            console.error('[PremiumController] Failed to initialize Lemon Squeezy:', e);
        }
    },

    /**
     * Show upgrade modal for a specific feature
     *
     * @param {string} feature - Feature key
     */
    showUpgradeModal(feature) {
        this._currentFeature = feature;
        this._showModal('feature', { feature });
    },

    /**
     * Show upgrade modal for playlist quota exceeded
     *
     * @param {number} remaining - Remaining playlists (usually 0)
     * @param {string} reason - Human-readable reason
     */
    showPlaylistUpgradeModal(remaining, reason) {
        this._showModal('playlist', { remaining, reason });
    },

    /**
     * Show upgrade modal for general upgrade prompt
     */
    showGeneralUpgradeModal() {
        this._showModal('general');
    },

    /**
     * Internal: Show the modal with specific content
     *
     * @param {string} type - Modal type ('feature', 'playlist', 'general')
     * @param {Object} data - Additional data for modal content
     */
    _showModal(type, data = {}) {
        // Initialize Lemon Squeezy if not already done
        this.initLemonSqueezy();

        // Remove existing modal if present - immediately remove from DOM
        if (this._modal) {
            this._modal.remove();
            this._modal = null;
        }

        this._createModal(type, data);
        this._setupEventListeners();
        document.body.style.overflow = 'hidden';

        // Activate focus trap after modal is in DOM
        const modalContent = this._modal.querySelector('.modal-content');
        if (modalContent) {
            this._focusTrap = createFocusTrap(modalContent, {
                onEscape: () => this.hideModal(),
                initialFocus: '.upgrade-modal-close-btn',
            });
            this._focusTrap.activate();
        }
    },

    /**
     * Handle upgrade button click
     * @param {string} plan - 'monthly' or 'yearly'
     */
    async _handleUpgrade(plan) {
        console.log(`[PremiumController] Opening ${plan} checkout`);

        const result =
            plan === 'monthly'
                ? await LemonSqueezyService.openMonthlyCheckout()
                : await LemonSqueezyService.openYearlyCheckout();

        if (!result.success) {
            // Show error message
            const errorMsg = result.message || 'Failed to open checkout';
            Settings.showToast(errorMsg, 4000);
        }
    },

    /**
     * Hide the upgrade modal
     */
    hideModal() {
        if (this._focusTrap) {
            this._focusTrap.deactivate();
            this._focusTrap = null;
        }

        if (this._modal) {
            this._modal.classList.add('modal-closing');
            setTimeout(() => {
                this._modal?.remove();
                this._modal = null;
                document.body.style.overflow = '';
            }, 200);
        }

        this._currentFeature = null;
        this._upgradeCallback = null;
    },

    /**
     * Create the modal DOM structure
     *
     * @param {string} type - Modal type
     * @param {Object} data - Additional data
     */
    _createModal(type, data) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay premium-upgrade-modal';
        modal.id = 'premium-upgrade-modal';

        const content = this._getModalContent(type, data);

        // security-validated: Uses escapeHtml() from js/utils/html-escape.js
        // Escaping method: DOM-based textContent assignment
        // Data flow: content.title (internal state) → escapeHtml() → innerHTML insertion
        // Static HTML structure is preserved, dynamic content is escaped
        // content.body is generated internally from static templates
        // Review date: 2026-01-28
        modal.innerHTML = `
            <div class="modal-overlay-bg" data-action="hide-upgrade-modal"></div>
            <div class="modal-content" role="dialog" aria-labelledby="upgrade-modal-title" aria-modal="true">
                <div class="modal-header">
                    <h2 id="upgrade-modal-title" class="gradient-text">${escapeHtml(content.title)}</h2>
                    <button class="modal-close upgrade-modal-close-btn"
                            data-action="hide-upgrade-modal"
                            aria-label="Close modal">×</button>
                </div>
                <div class="modal-body">
                    ${content.body}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" data-action="hide-upgrade-modal">Maybe Later</button>
                    <div class="upgrade-actions">
                        <button class="btn btn-primary" data-action="upgrade-monthly">
                            $4.99/mo
                        </button>
                        <button class="btn btn-primary" data-action="upgrade-yearly">
                            $39/yr (Save 35%)
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this._modal = modal;
    },

    /**
     * Get modal content based on type
     *
     * @param {string} type - Modal type
     * @param {Object} data - Additional data
     * @returns {Object} Content with title and body HTML
     */
    _getModalContent(type, data) {
        switch (type) {
            case 'playlist': {
                // SAFE: Escape dynamic reason message
                const escapedReason = escapeHtml(data.reason || "You've used your free playlist.");
                return {
                    title: '✨ Unlock Unlimited Playlists',
                    body: `
                        <div class="upgrade-illustration">
                            <div class="illustration-icon">🎵</div>
                        </div>
                        <p class="upgrade-message">${escapedReason}</p>
                        <div class="feature-list">
                            <div class="feature-item">
                                <span class="feature-icon">∞</span>
                                <span>Unlimited AI-curated playlists</span>
                            </div>
                            <div class="feature-item">
                                <span class="feature-icon">🎯</span>
                                <span>Mood-based, era-based, and time machine playlists</span>
                            </div>
                            <div class="feature-item">
                                <span class="feature-icon">🔍</span>
                                <span>Semantic search for any vibe or moment</span>
                            </div>
                            <div class="feature-item">
                                <span class="feature-icon">📊</span>
                                <span>Metadata enrichment with genres & audio features</span>
                            </div>
                        </div>
                        <div class="upgrade-price">
                            <span class="price-label">Premium Access</span>
                            <span class="price-value">$4.99/mo or $39/yr</span>
                        </div>
                    `,
                };
            }

            case 'feature': {
                const feature = Pricing.FEATURES[data.feature];
                const featureName = feature?.name || 'Premium Feature';
                const featureDesc = feature?.description || '';

                // SAFE: Escape feature name and description
                const escapedFeatureName = escapeHtml(featureName);
                const escapedFeatureDesc = escapeHtml(featureDesc);

                return {
                    title: `✨ ${escapedFeatureName}`,
                    body: `
                        <div class="upgrade-illustration">
                            <div class="illustration-icon">🔒</div>
                        </div>
                        <p class="upgrade-description">${escapedFeatureDesc}</p>
                        <p class="upgrade-message">This feature is available with Premium.</p>
                        <div class="feature-list">
                            <div class="feature-item">
                                <span class="feature-icon">∞</span>
                                <span>Unlimited playlist generation</span>
                            </div>
                            <div class="feature-item">
                                <span class="feature-icon">📊</span>
                                <span>Metadata enrichment</span>
                            </div>
                            <div class="feature-item">
                                <span class="feature-icon">🔍</span>
                                <span>Semantic search & embeddings</span>
                            </div>
                            <div class="feature-item">
                                <span class="feature-icon">🤖</span>
                                <span>AI playlist curator</span>
                            </div>
                        </div>
                        <div class="upgrade-price">
                            <span class="price-label">Premium Access</span>
                            <span class="price-value">$4.99/mo or $39/yr</span>
                        </div>
                    `,
                };
            }

            default: {
                return {
                    title: '✨ Upgrade to Premium',
                    body: `
                        <div class="upgrade-illustration">
                            <div class="illustration-icon">🎵</div>
                        </div>
                        <p class="upgrade-message">Unlock the full potential of Rhythm Chamber.</p>
                        <div class="feature-list">
                            <div class="feature-item">
                                <span class="feature-icon">∞</span>
                                <span>Unlimited playlist generation</span>
                            </div>
                            <div class="feature-item">
                                <span class="feature-icon">📊</span>
                                <span>Metadata enrichment with genres & audio features</span>
                            </div>
                            <div class="feature-item">
                                <span class="feature-icon">🔍</span>
                                <span>Semantic search: "songs that feel like 3 AM"</span>
                            </div>
                            <div class="feature-item">
                                <span class="feature-icon">🤖</span>
                                <span>AI playlist curator for any mood</span>
                            </div>
                        </div>
                        <div class="upgrade-price">
                            <span class="price-label">Premium Access</span>
                            <span class="price-value">$4.99/mo or $39/yr</span>
                        </div>
                    `,
                };
            }
        }
    },

    /**
     * Setup event listeners for modal interactions
     */
    _setupEventListeners() {
        if (!this._modal) return;

        // Event delegation for actions
        this._modal.addEventListener('click', e => {
            const action = e.target.closest('[data-action]')?.dataset.action;

            switch (action) {
                case 'hide-upgrade-modal':
                    e.preventDefault();
                    this.hideModal();
                    break;
                case 'upgrade-monthly':
                    e.preventDefault();
                    this._handleUpgrade('monthly');
                    break;
                case 'upgrade-yearly':
                    e.preventDefault();
                    this._handleUpgrade('yearly');
                    break;
            }
        });

        // Escape key to close (additional to focus trap)
        this._modal.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.hideModal();
            }
        });
    },
};

// ==========================================
// Global Event Listeners
// ==========================================

// Listen for showUpgradeModal events (for integration with other modules)
if (typeof window !== 'undefined') {
    window.addEventListener('showUpgradeModal', event => {
        const { feature } = event.detail || {};
        if (feature) {
            PremiumController.showUpgradeModal(feature);
        } else {
            PremiumController.showGeneralUpgradeModal();
        }
    });
}

// ==========================================
// ES Module Export
// ==========================================

export { PremiumController };

console.log('[PremiumController] Module loaded');
