/**
 * Custom Profile Controller
 *
 * Manages the custom profile creation flow from the landing page.
 * Users describe their desired music personality, and we synthesize a profile.
 *
 * HNW Considerations:
 * - Hierarchy: Delegates to ProfileSynthesizer and ProfileStorage
 * - Network: Uses existing modal and focus trap patterns
 * - Wave: Async synthesis with progress callbacks
 *
 * @module controllers/custom-profile-controller
 */

import { ProfileSynthesizer } from '../profile-synthesizer.js';
import { ProfileStorage } from '../storage/profiles.js';
import { createFocusTrap } from '../utils/focus-trap.js';
import { escapeHtml } from '../utils/html-escape.js';

// ==========================================
// Example prompts for users
// ==========================================

const EXAMPLE_PROMPTS = {
    'night-owl-electronic': 'A night owl who loves electronic music, especially techno and house. Listens mostly in the evenings and late nights, enjoys discovering new DJs and remixes.',
    'road-trip-classic-rock': 'A classic rock enthusiast who loves road trip playlists. Heavy on 70s and 80s rock, especially guitar-driven anthems and singalong tracks.',
    'jazz-convert': 'Someone who used to listen to pop music but discovered jazz and never looked back. Loves piano jazz, bebop, and modal jazz. Mostly evening listening.'
};

// ==========================================
// Custom Profile Controller
// ==========================================

const CustomProfileController = {
    // Modal state
    _modal: null,
    _focusTrap: null,
    _isSynthesizing: false,
    _currentProfile: null,

    /**
     * Show the custom profile creation modal
     * Creates the modal DOM, sets up event listeners, and activates focus trap
     */
    showModal() {
        // Remove existing modal if present
        if (this._modal) {
            this.hideModal();
        }

        this._createModal();
        this._setupEventListeners();
        document.body.style.overflow = 'hidden';

        // Activate focus trap after modal is in DOM
        const modalContent = this._modal.querySelector('.modal-content');
        if (modalContent) {
            this._focusTrap = createFocusTrap(modalContent, {
                onEscape: () => this.hideModal(),
                initialFocus: '#profile-description-input'
            });
            this._focusTrap.activate();
        }
    },

    /**
     * Hide the modal
     * Cleans up focus trap and removes modal from DOM
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
    },

    /**
     * Create the modal DOM structure
     * Uses template literal for HTML generation with proper escaping
     */
    _createModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay custom-profile-modal';
        modal.id = 'custom-profile-modal';
        modal.innerHTML = `
            <div class="modal-overlay-bg" data-action="hide-custom-profile-modal"></div>
            <div class="modal-content" role="dialog" aria-labelledby="custom-profile-title" aria-modal="true">
                <div class="modal-header">
                    <h2 id="custom-profile-title">✨ Design Your Music Personality</h2>
                    <button class="modal-close" data-action="hide-custom-profile-modal"
                            aria-label="Close modal">×</button>
                </div>
                <div class="modal-body">
                    <!-- Input State -->
                    <div class="custom-profile-state" data-state="input">
                        <p class="custom-profile-instructions">
                            Describe your ideal listening profile in natural language.
                            We'll generate a synthetic music history and personality to match.
                        </p>
                        <div class="profile-input-area">
                            <textarea
                                id="profile-description-input"
                                class="profile-description-textarea"
                                placeholder="e.g., 'Someone who loves jazz piano but used to be into punk rock, mostly listens in the evenings, and discovers new music through friends'"
                                rows="4"
                                aria-label="Describe your desired music personality"
                            ></textarea>
                        </div>
                        <div class="custom-profile-examples">
                            <span class="example-label">Try:</span>
                            <button class="example-chip" data-example="night-owl-electronic" type="button">
                                🌙 Night owl who loves electronic music
                            </button>
                            <button class="example-chip" data-example="road-trip-classic-rock" type="button">
                                🚗 Classic rock road trip enthusiast
                            </button>
                            <button class="example-chip" data-example="jazz-convert" type="button">
                                🎷 Jazz lover who used to listen to pop
                            </button>
                        </div>
                        <button class="btn btn-primary btn-full-width"
                                id="generate-profile-btn"
                                disabled
                                type="button">
                            Generate Profile
                        </button>
                    </div>

                    <!-- Progress State -->
                    <div class="custom-profile-state" data-state="progress" style="display: none;">
                        <div class="synthesis-progress">
                            <div class="progress-bar-container">
                                <div class="progress-bar-fill" id="progress-fill" style="width: 0%;"></div>
                            </div>
                            <p class="progress-status" id="progress-status">Analyzing description...</p>
                        </div>
                    </div>

                    <!-- Success State -->
                    <div class="custom-profile-state" data-state="success" style="display: none;">
                        <div class="success-icon">✨</div>
                        <h3>Your Profile is Ready!</h3>
                        <div class="profile-summary-card" id="profile-summary">
                            <!-- Populated dynamically -->
                        </div>
                        <button class="btn btn-primary btn-full-width" id="start-chatting-btn" type="button">
                            Start Chatting
                        </button>
                    </div>

                    <!-- Error State -->
                    <div class="custom-profile-state" data-state="error" style="display: none;">
                        <div class="error-icon">⚠️</div>
                        <h3>Couldn't Create That Profile</h3>
                        <p class="error-message" id="error-message">
                            We couldn't create a profile from that description.
                        </p>
                        <button class="btn btn-secondary btn-full-width" data-action="retry-profile" type="button">
                            Try Again
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this._modal = modal;
    },

    /**
     * Setup event listeners for modal interactions
     * Uses event delegation for efficiency and dynamic content
     */
    _setupEventListeners() {
        if (!this._modal) return;

        // Event delegation for actions
        this._modal.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;

            switch (action) {
                case 'hide-custom-profile-modal':
                    e.preventDefault();
                    this.hideModal();
                    break;
                case 'retry-profile':
                    this._showState('input');
                    this._updateGenerateButton();
                    break;
            }

            // Example chips
            if (e.target.classList.contains('example-chip')) {
                e.preventDefault();
                const example = e.target.dataset.example;
                const textarea = this._modal.querySelector('#profile-description-input');
                if (textarea && EXAMPLE_PROMPTS[example]) {
                    textarea.value = EXAMPLE_PROMPTS[example];
                    this._updateGenerateButton();
                }
            }
        });

        // Textarea input handling
        const textarea = this._modal.querySelector('#profile-description-input');
        textarea?.addEventListener('input', () => this._updateGenerateButton());

        // Generate button
        const generateBtn = this._modal.querySelector('#generate-profile-btn');
        generateBtn?.addEventListener('click', () => this._handleGenerate());

        // Start chatting button
        const startChatBtn = this._modal.querySelector('#start-chatting-btn');
        startChatBtn?.addEventListener('click', () => this._transitionToApp());

        // Enter key to submit (Cmd/Ctrl + Enter)
        textarea?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                this._handleGenerate();
            }
        });

        // Escape key to close (additional to focus trap)
        this._modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.hideModal();
            }
        });
    },

    /**
     * Update generate button state based on input
     * Button is disabled when input is too short or synthesis is in progress
     */
    _updateGenerateButton() {
        const textarea = this._modal?.querySelector('#profile-description-input');
        const btn = this._modal?.querySelector('#generate-profile-btn');
        if (!textarea || !btn) return;

        const hasContent = textarea.value.trim().length > 10;
        btn.disabled = !hasContent || this._isSynthesizing;
    },

    /**
     * Show a specific modal state
     * @param {string} state - One of: 'input', 'progress', 'success', 'error'
     */
    _showState(state) {
        this._modal?.querySelectorAll('.custom-profile-state').forEach(el => {
            el.style.display = el.dataset.state === state ? 'block' : 'none';
        });
    },

    /**
     * Handle profile generation
     * Calls ProfileSynthesizer and saves the result
     */
    async _handleGenerate() {
        if (this._isSynthesizing) return;

        const textarea = this._modal?.querySelector('#profile-description-input');
        const description = textarea?.value.trim();

        if (!description || description.length < 10) return;

        this._isSynthesizing = true;
        this._updateGenerateButton();
        this._showState('progress');

        try {
            // Ensure ProfileSynthesizer is initialized
            if (!ProfileSynthesizer._templateStore) {
                ProfileSynthesizer.init();
            }

            const profile = await ProfileSynthesizer.synthesizeFromDescription(
                description,
                (percent, message) => this._updateProgress(percent, message)
            );

            // Save the profile to storage
            await ProfileStorage.saveProfile(profile);
            await ProfileStorage.setActiveProfile(profile.id);

            // Store for app.html to pick up
            this._currentProfile = profile;

            // Show success state
            this._showSuccessState(profile);

            console.log('[CustomProfileController] Profile created:', profile.name);

        } catch (error) {
            console.error('[CustomProfileController] Synthesis failed:', error);
            this._modal.querySelector('#error-message').textContent =
                error.message || 'We couldn\'t create a profile from that description. Please try a different description.';
            this._showState('error');
        } finally {
            this._isSynthesizing = false;
            this._updateGenerateButton();
        }
    },

    /**
     * Update progress during synthesis
     * @param {number} percent - Progress percentage (0-100)
     * @param {string} message - Progress status message
     */
    _updateProgress(percent, message) {
        const fill = this._modal?.querySelector('#progress-fill');
        const status = this._modal?.querySelector('#progress-status');

        if (fill) fill.style.width = `${percent}%`;
        if (status) status.textContent = message;
    },

    /**
     * Show success state with profile summary
     * @param {object} profile - The synthesized profile
     */
    _showSuccessState(profile) {
        const summary = this._modal?.querySelector('#profile-summary');
        if (!summary) return;

        const personality = profile.personality || {};
        const sourceTemplates = profile.sourceTemplates || [];
        const emoji = personality.emoji || this._getEmojiForPersonality(personality.type);
        const personalityType = personality.type
            ? personality.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
            : 'Custom Profile';

        summary.innerHTML = `
            <div class="profile-summary-header">
                <span class="profile-emoji">${emoji}</span>
                <div class="profile-summary-name">${escapeHtml(profile.name)}</div>
            </div>
            <div class="profile-summary-personality">
                <span class="personality-label">Your Type:</span>
                <span class="personality-value">${escapeHtml(personalityType)}</span>
            </div>
            <p class="profile-summary-description">${escapeHtml(profile.description)}</p>
            <div class="profile-summary-stats">
                <div class="profile-stat">
                    <div class="profile-stat-value">${profile.metadata?.streamCount || 0}</div>
                    <div class="profile-stat-label">Synthetic Streams</div>
                </div>
                <div class="profile-stat">
                    <div class="profile-stat-value">${sourceTemplates.length}</div>
                    <div class="profile-stat-label">Template${sourceTemplates.length !== 1 ? 's' : ''} Used</div>
                </div>
            </div>
            ${sourceTemplates.length > 0 ? `
                <div class="profile-templates">
                    <span class="templates-label">Built from:</span>
                    ${sourceTemplates.map(t => `
                        <span class="template-badge">${escapeHtml(t.name)}</span>
                    `).join('')}
                </div>
            ` : ''}
        `;

        this._showState('success');
    },

    /**
     * Get emoji based on personality type
     * @param {string} type - Personality type
     * @returns {string} Emoji character
     */
    _getEmojiForPersonality(type) {
        const emojiMap = {
            'emotional_archaeologist': '🏛️',
            'mood_engineer': '🎛️',
            'discovery_junkie': '🔍',
            'comfort_curator': '🛋️',
            'social_chameleon': '🎭'
        };
        return emojiMap[type] || '🎵';
    },

    /**
     * Transition to app.html with the synthesized profile
     * Stores profile ID in sessionStorage for app.html to pick up
     */
    _transitionToApp() {
        if (!this._currentProfile) return;

        // Store profile ID for app.html to pick up
        sessionStorage.setItem('pendingCustomProfile', this._currentProfile.id);

        // Navigate to app
        window.location.href = 'app.html?mode=custom';
    }
};

// ==========================================
// ES Module Export
// ==========================================

export { CustomProfileController };

console.log('[CustomProfileController] Module loaded');
