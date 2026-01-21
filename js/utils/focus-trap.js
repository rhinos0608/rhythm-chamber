/**
 * Focus Trap Utility (WCAG 2.1 AA - 2.1.2 No Keyboard Trap)
 *
 * Provides reusable focus management for modal dialogs and other
 * focus-restricting UI components. Ensures keyboard users can navigate
 * properly and that focus is restored on close.
 *
 * @module utils/focus-trap
 */

/**
 * Selector for all focusable elements
 * Based on ARIA Authoring Practices Guide (APG) recommendations
 */
const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
].join(', ');

/**
 * Get all focusable elements within a container
 * @param {HTMLElement} container - The container element
 * @returns {HTMLElement[]} Array of focusable elements
 */
function getFocusableElements(container) {
    if (!container) return [];

    const focusable = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));

    // Filter out elements that are visually hidden or in hidden containers
    return focusable.filter(el => {
        const style = window.getComputedStyle(el);
        const isVisible = style.display !== 'none' &&
                         style.visibility !== 'hidden' &&
                         style.opacity !== '0';
        const isNotHidden = el.offsetParent !== null || el.getBoundingClientRect().width > 0;
        return isVisible && isNotHidden;
    });
}

/**
 * Store and manage focus restoration
 */
class FocusHistory {
    constructor() {
        this._stack = [];
    }

    /**
     * Push current focus to history
     */
    push() {
        if (document.activeElement && document.activeElement !== document.body) {
            this._stack.push(document.activeElement);
        }
    }

    /**
     * Restore last focused element
     */
    pop() {
        const el = this._stack.pop();
        if (el && typeof el.focus === 'function') {
            // Check if element is still in DOM and focusable
            if (document.contains(el)) {
                el.focus();
            }
        }
    }

    /**
     * Clear focus history
     */
    clear() {
        this._stack = [];
    }
}

// Global focus history for nested modal support
const globalFocusHistory = new FocusHistory();

/**
 * Create a focus trap instance
 * @param {HTMLElement} container - The container element to trap focus within
 * @param {Object} options - Configuration options
 * @param {Function} options.onEscape - Callback when Escape key is pressed
 * @param {Function} options.onActivate - Callback when trap is activated
 * @param {Function} options.onDeactivate - Callback when trap is deactivated
 * @param {HTMLElement|string} options.initialFocus - Element or selector to focus initially
 * @param {boolean} options.returnFocusOnDeactivate - Whether to restore focus on deactivate (default: true)
 * @returns {Object} Focus trap control object
 */
export function createFocusTrap(container, options = {}) {
    if (!container) {
        console.error('[FocusTrap] Container element is required');
        return null;
    }

    const {
        onEscape = null,
        onActivate = null,
        onDeactivate = null,
        initialFocus = null,
        returnFocusOnDeactivate = true
    } = options;

    let isActive = false;
    let keydownHandler = null;

    /**
     * Get the first focusable element
     */
    const getFirstFocusable = () => {
        const focusable = getFocusableElements(container);
        return focusable.length > 0 ? focusable[0] : null;
    };

    /**
     * Get the last focusable element
     */
    const getLastFocusable = () => {
        const focusable = getFocusableElements(container);
        return focusable.length > 0 ? focusable[focusable.length - 1] : null;
    };

    /**
     * Get the initial focus element
     */
    const getInitialFocusElement = () => {
        if (typeof initialFocus === 'string') {
            return container.querySelector(initialFocus);
        } else if (initialFocus instanceof HTMLElement) {
            return initialFocus;
        }
        return getFirstFocusable();
    };

    /**
     * Handle keyboard events
     */
    const handleKeydown = (e) => {
        if (!isActive) return;

        // Handle Escape key
        if (e.key === 'Escape' && onEscape) {
            e.preventDefault();
            onEscape(e);
            return;
        }

        // Handle Tab key - trap focus within container
        if (e.key === 'Tab') {
            const focusable = getFocusableElements(container);

            if (focusable.length === 0) {
                e.preventDefault();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            // Shift+Tab on first element - wrap to last
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
                return;
            }

            // Tab on last element - wrap to first
            if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
                return;
            }
        }
    };

    /**
     * Activate the focus trap
     */
    const activate = () => {
        if (isActive) return;

        isActive = true;

        // Store current focus for restoration
        if (returnFocusOnDeactivate) {
            globalFocusHistory.push();
        }

        // Set initial focus
        const initialElement = getInitialFocusElement();
        if (initialElement) {
            // Use setTimeout to ensure DOM is ready
            setTimeout(() => {
                if (initialElement.focus) {
                    initialElement.focus();
                }
            }, 0);
        }

        // Add event listener
        keydownHandler = handleKeydown;
        document.addEventListener('keydown', keydownHandler, { capture: true });

        // Call activate callback
        if (onActivate) {
            onActivate();
        }
    };

    /**
     * Deactivate the focus trap
     */
    const deactivate = () => {
        if (!isActive) return;

        isActive = false;

        // Remove event listener
        if (keydownHandler) {
            document.removeEventListener('keydown', keydownHandler, { capture: true });
            keydownHandler = null;
        }

        // Restore focus
        if (returnFocusOnDeactivate) {
            globalFocusHistory.pop();
        }

        // Call deactivate callback
        if (onDeactivate) {
            onDeactivate();
        }
    };

    /**
     * Update the focus trap (recalculate focusable elements)
     * Call this after DOM changes within the container
     */
    const update = () => {
        if (isActive) {
            // Re-apply focus if needed after DOM changes
            const active = document.activeElement;
            if (!container.contains(active)) {
                const first = getFirstFocusable();
                if (first) first.focus();
            }
        }
    };

    /**
     * Check if the trap is currently active
     */
    const active = () => isActive;

    /**
     * Clean up the focus trap (permanently)
     */
    const destroy = () => {
        deactivate();
        globalFocusHistory.clear();
    };

    return {
        activate,
        deactivate,
        update,
        active,
        destroy,
        // Exposed for testing
        getFirstFocusable,
        getLastFocusable,
        getFocusableElements: () => getFocusableElements(container)
    };
}

/**
 * Create an auto-activating focus trap for a modal
 * @param {HTMLElement} modalElement - The modal element
 * @param {Object} options - Configuration options
 * @returns {Object} Focus trap control object with show/hide methods
 */
export function createModalFocusTrap(modalElement, options = {}) {
    const {
        onShow = null,
        onHide = null,
        closeOnEscape = true,
        ...trapOptions
    } = options;

    // Find the actual modal content if modalElement is an overlay
    const modalContent = modalElement.querySelector('.modal-content, .settings-content, .tools-content') ||
                        modalElement;

    const trap = createFocusTrap(modalContent, {
        onEscape: closeOnEscape ? () => hide() : null,
        ...trapOptions
    });

    /**
     * Show the modal and activate the trap
     */
    const show = () => {
        // Ensure modal is visible
        modalElement.style.display = '';

        // Activate focus trap after a short delay to ensure animation complete
        setTimeout(() => {
            trap?.activate();
        }, 50);

        if (onShow) onShow();
    };

    /**
     * Hide the modal and deactivate the trap
     */
    const hide = () => {
        trap?.deactivate();
        modalElement.style.display = 'none';

        if (onHide) onHide();
    };

    return {
        show,
        hide,
        activate: () => trap?.activate(),
        deactivate: () => trap?.deactivate(),
        update: () => trap?.update(),
        active: () => trap?.active(),
        destroy: () => trap?.destroy()
    };
}

/**
 * Utility function to set up focus trap for an existing modal
 * Call this after showing a modal to trap focus
 *
 * @param {string} modalId - The ID of the modal element
 * @param {Function} onClose - Callback when modal should close (e.g., on Escape)
 * @returns {Function} Cleanup function to remove the trap
 */
export function setupModalFocusTrap(modalId, onClose) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.warn(`[FocusTrap] Modal with id "${modalId}" not found`);
        return () => {};
    }

    const modalContent = modal.querySelector('.modal-content, .settings-content, .tools-content') || modal;

    // Store the previously focused element
    const previousFocus = document.activeElement;

    // Get focusable elements
    const focusable = getFocusableElements(modalContent);
    if (focusable.length > 0) {
        // Focus the first element
        setTimeout(() => focusable[0].focus(), 50);
    }

    // Handle keyboard events
    const handleKeydown = (e) => {
        if (e.key === 'Escape' && onClose) {
            e.preventDefault();
            onClose();
            return;
        }

        if (e.key === 'Tab') {
            if (focusable.length === 0) {
                e.preventDefault();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    };

    document.addEventListener('keydown', handleKeydown, true);

    // Return cleanup function
    return () => {
        document.removeEventListener('keydown', handleKeydown, true);
        // Restore focus
        if (previousFocus && typeof previousFocus.focus === 'function') {
            previousFocus.focus();
        }
    };
}

export default { createFocusTrap, createModalFocusTrap, setupModalFocusTrap };
