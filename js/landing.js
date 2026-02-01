/**
 * Landing Page Interactions
 *
 * Handles premium CTA time-delayed appearance, user state detection,
 * and premium preview modal functionality.
 *
 * @module landing
 */

// ==========================================
// Premium CTA Behavior
// ==========================================

const premiumCta = document.getElementById('premium-cta');
const premiumModal = document.getElementById('premium-modal');
const APPEARANCE_DELAY = 4000; // 4 seconds

/**
 * Show CTA after time delay
 * This respects the hero section while ensuring visibility
 */
setTimeout(() => {
    premiumCta?.classList.add('visible');
}, APPEARANCE_DELAY);

// ==========================================
// User State Detection
// ==========================================

/**
 * Validate license data structure
 * @param {unknown} data - Data to validate
 * @returns {boolean} True if valid license structure
 */
function isValidLicenseData(data) {
    return (
        data !== null &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        typeof data.active === 'boolean'
    );
}

/**
 * Detect user premium status and update CTA text accordingly
 * Shows "Premium" for new users, "Manage" for existing premium users
 */
async function initUserState() {
    try {
        // Check localStorage for premium status
        const storedLicense = localStorage.getItem('rhythm_chamber_license');

        if (!storedLicense) {
            premiumCta?.setAttribute('data-user-state', 'free');
            return;
        }

        // SECURITY: Validate JSON.parse with try-catch and structure validation
        let licenseData;
        try {
            licenseData = JSON.parse(storedLicense);
        } catch (parseError) {
            console.warn('[Landing] Invalid JSON in license data:', parseError);
            premiumCta?.setAttribute('data-user-state', 'free');
            return;
        }

        // Validate data structure before use
        if (!isValidLicenseData(licenseData)) {
            console.warn('[Landing] Invalid license data structure');
            premiumCta?.setAttribute('data-user-state', 'free');
            return;
        }

        const isPremium = licenseData.active === true;

        if (isPremium) {
            premiumCta?.setAttribute('data-user-state', 'premium');
            const textEl = premiumCta?.querySelector('.premium-text');
            if (textEl) textEl.textContent = 'Manage';
            premiumCta?.setAttribute('aria-label', 'Manage premium subscription');
        } else {
            premiumCta?.setAttribute('data-user-state', 'free');
        }
    } catch (e) {
        // If error, default to "Premium" text
        console.warn('[Landing] Could not detect user premium status:', e);
    }
}

// Initialize user state on page load
initUserState();

// ==========================================
// Modal Interactions
// ==========================================

/**
 * Close modal and restore body scroll
 */
function closeModal() {
    if (!premiumModal) return;
    premiumModal.classList.add('hidden');
    premiumModal.hidden = true;
    document.body.style.overflow = '';
}

/**
 * Handle CTA click based on user state
 */
premiumCta?.addEventListener('click', () => {
    const userState = premiumCta.getAttribute('data-user-state');

    // If premium user, show account management (coming soon)
    if (userState === 'premium') {
        // TODO: Navigate to account management page when it exists
        // For now, show a friendly message
        alert('Account management coming soon!');
        return;
    }

    // Show upgrade modal for free users
    premiumModal?.classList.remove('hidden');
    premiumModal.hidden = false;
    document.body.style.overflow = 'hidden';

    // Focus the modal for accessibility
    const closeBtn = premiumModal?.querySelector('.modal-close');
    if (closeBtn) closeBtn.focus();
});

// ==========================================
// Global Event Delegation
// ==========================================

/**
 * Handle click actions for landing page elements
 * Uses event delegation so it works immediately, independent of ES module loading
 */
document.addEventListener('click', e => {
    const button = e.target.closest('[data-action]');
    if (!button) return;

    const action = button.dataset.action;

    // Handle Close Modal - this MUST work even if modules fail to load
    if (action === 'close-modal') {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
    }
});

// Close on backdrop click (outside modal content)
premiumModal?.addEventListener('click', e => {
    if (e.target === premiumModal) {
        closeModal();
    }
});

// Close on Escape key
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !premiumModal?.hidden) {
        closeModal();
    }
});

// ==========================================
// Focus Trap for Accessibility
// ==========================================

/**
 * Keep focus within modal when open (WCAG 2.1 compliance)
 */
premiumModal?.addEventListener('keydown', e => {
    if (premiumModal.hidden) return;

    const focusableElements = premiumModal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // If Tab key pressed
    if (e.key === 'Tab') {
        // If Shift + Tab on first element, move to last
        if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
        }
        // If Tab on last element, move to first
        else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
        }
    }
});
