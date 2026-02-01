/**
 * Mobile Responsivity Controller
 *
 * Handles mobile-specific sidebar behavior.
 * Separated from SidebarStateController to follow Single Responsibility Principle.
 *
 * Responsibilities:
 * - Detect mobile viewport
 * - Handle mobile sidebar open/close states
 * - Manage mobile overlay visibility
 *
 * @module controllers/sidebar/mobile-responsiveness
 */

const MOBILE_BREAKPOINT = 768;

/**
 * Check if current viewport is mobile size
 * @returns {boolean}
 */
function isMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
}

/**
 * Open sidebar on mobile (add open class)
 * @param {HTMLElement} sidebar - The sidebar DOM element
 */
function openMobileSidebar(sidebar) {
    if (sidebar && isMobile()) {
        sidebar.classList.add('open');
    }
}

/**
 * Close sidebar on mobile (remove open class)
 * @param {HTMLElement} sidebar - The sidebar DOM element
 */
function closeMobileSidebar(sidebar) {
    if (sidebar) {
        sidebar.classList.remove('open');
    }
}

/**
 * Toggle mobile sidebar open state
 * @param {HTMLElement} sidebar - The sidebar DOM element
 * @param {boolean} shouldOpen - Whether to open (true) or close (false)
 */
function setMobileSidebarState(sidebar, shouldOpen) {
    if (isMobile()) {
        if (shouldOpen) {
            openMobileSidebar(sidebar);
        } else {
            closeMobileSidebar(sidebar);
        }
    }
}

/**
 * Update mobile overlay visibility
 * @param {HTMLElement} overlay - The overlay DOM element
 * @param {boolean} isSidebarCollapsed - Whether sidebar is collapsed
 */
function updateOverlayVisibility(overlay, isSidebarCollapsed) {
    if (overlay) {
        if (!isSidebarCollapsed && isMobile()) {
            overlay.classList.add('visible');
        } else {
            overlay.classList.remove('visible');
        }
    }
}

// ES Module export
export const MobileResponsivityController = {
    isMobile,
    openMobileSidebar,
    closeMobileSidebar,
    setMobileSidebarState,
    updateOverlayVisibility,
    MOBILE_BREAKPOINT,
};

console.log('[MobileResponsivityController] Mobile responsivity controller loaded');
