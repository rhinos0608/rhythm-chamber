/**
 * Error Boundary for UI Widgets
 * 
 * Provides React-style error boundaries for vanilla JavaScript.
 * Wraps async operations and renders recovery UI on failure.
 * 
 * Features:
 * - Isolates widget crashes from affecting the whole app
 * - Shows user-friendly error UI with retry button
 * - Logs errors for debugging
 * - Preserves original content for recovery
 * 
 * Usage:
 *   const boundary = new ErrorBoundary('Chat', '.chat-container');
 *   await boundary.wrap(async () => { ... });
 * 
 * @module services/error-boundary
 */

/**
 * Error Boundary for UI Widgets
 *
 * Provides React-style error boundaries for vanilla JavaScript.
 * Wraps async operations and renders recovery UI on failure.
 *
 * Features:
 * - Isolates widget crashes from affecting the whole app
 * - Shows user-friendly error UI with retry button
 * - Logs errors for debugging
 * - Preserves original content for recovery
 *
 * Usage:
 *   const boundary = new ErrorBoundary('Chat', '.chat-container');
 *   await boundary.wrap(async () => { ... });
 *
 * @module services/error-boundary
 */

// Import centralized HTML escape utility
import { escapeHtml } from '../utils/html-escape.js';

// ==========================================
// Error Boundary Class
// ==========================================

/**
 * Vanilla JS Error Boundary
 * Wraps widget operations with error handling and recovery UI
 */
export class ErrorBoundary {
    /**
     * Create an error boundary for a widget
     * @param {string} widgetName - Human-readable widget name (e.g., 'Chat')
     * @param {string} containerSelector - CSS selector for widget container
     * @param {Object} options - Configuration options
     * @param {function} options.onError - Custom error handler
     * @param {function} options.onRetry - Called when user clicks retry
     * @param {boolean} options.preserveContent - Whether to save original content
     */
    constructor(widgetName, containerSelector, options = {}) {
        this.widgetName = widgetName;
        this.containerSelector = containerSelector;
        this.onError = options.onError || console.error;
        this.onRetry = options.onRetry || null;
        this.preserveContent = options.preserveContent !== false;

        // State
        this.hasError = false;
        this.lastError = null;
        this.lastContext = null;
        this.originalContent = null;
        this.retryFn = null;

        // Unique ID for this boundary
        this.id = `error-boundary-${ErrorBoundary._idCounter++}`;
    }

    static _idCounter = 0;

    /**
     * Get the container element
     * @returns {Element|null}
     */
    getContainer() {
        return document.querySelector(this.containerSelector);
    }

    /**
     * Wrap an async operation with error boundary protection
     * @param {function} operation - Async function to execute
     * @param {Object} context - Context data for error reporting
     * @returns {Promise<any>} Operation result
     */
    async wrap(operation, context = {}) {
        try {
            this.hasError = false;
            this.retryFn = () => this.wrap(operation, context);

            // Save original content if not already saved
            if (this.preserveContent && !this.originalContent) {
                const container = this.getContainer();
                if (container) {
                    this.originalContent = container.innerHTML;
                }
            }

            const result = await operation();
            return result;
        } catch (error) {
            this.hasError = true;
            this.lastError = error;
            this.lastContext = context;

            // Log error
            this.onError(`[${this.widgetName}] Error:`, error, context);

            // Show error UI
            this.showErrorUI(error, context);

            // Re-throw for caller awareness
            throw error;
        }
    }

    /**
     * Wrap a sync operation with error boundary protection
     * @param {function} operation - Sync function to execute
     * @param {Object} context - Context data for error reporting
     * @returns {any} Operation result
     */
    wrapSync(operation, context = {}) {
        try {
            this.hasError = false;
            this.retryFn = () => this.wrapSync(operation, context);

            const result = operation();
            return result;
        } catch (error) {
            this.hasError = true;
            this.lastError = error;
            this.lastContext = context;

            this.onError(`[${this.widgetName}] Error:`, error, context);
            this.showErrorUI(error, context);
            throw error;
        }
    }

    /**
     * Show error UI in widget container
     * @param {Error} error - The error that occurred
     * @param {Object} context - Context data
     */
    showErrorUI(error, context = {}) {
        const container = this.getContainer();
        if (!container) {
            console.warn(`[ErrorBoundary] Container not found: ${this.containerSelector}`);
            return;
        }

        const errorId = `${this.id}-error`;
        const retryBtnId = `${this.id}-retry`;
        const dismissBtnId = `${this.id}-dismiss`;

        const errorHTML = `
            <div id="${errorId}" class="widget-error" role="alert" style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 1.5rem;
                background: var(--bg-error, rgba(220, 53, 69, 0.1));
                border: 1px solid var(--border-error, rgba(220, 53, 69, 0.3));
                border-radius: 8px;
                margin: 1rem;
                text-align: center;
            ">
                <div class="error-icon" style="font-size: 2.5rem; margin-bottom: 0.75rem;">⚠️</div>
                <h4 style="margin: 0 0 0.5rem 0; color: var(--text-primary, #333);">
                    ${this.escapeHtml(this.widgetName)} encountered an error
                </h4>
                <p style="margin: 0 0 1rem 0; color: var(--text-muted, #6c757d); font-size: 0.9rem;">
                    ${this.escapeHtml(error.message || 'An unexpected error occurred')}
                </p>
                <div class="error-actions" style="display: flex; gap: 0.5rem;">
                    <button id="${retryBtnId}" class="btn btn-primary" style="
                        padding: 0.5rem 1rem;
                        background: var(--accent, #6f42c1);
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 0.9rem;
                    ">
                        Try Again
                    </button>
                    <button id="${dismissBtnId}" class="btn btn-secondary" style="
                        padding: 0.5rem 1rem;
                        background: var(--bg-tertiary, #f8f9fa);
                        color: var(--text-primary, #333);
                        border: 1px solid var(--border-color, #dee2e6);
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 0.9rem;
                    ">
                        Dismiss
                    </button>
                </div>
            </div>
        `;

        // Insert error UI (preserving original for recovery)
        container.innerHTML = errorHTML;

        // Attach event listeners
        const retryBtn = document.getElementById(retryBtnId);
        const dismissBtn = document.getElementById(dismissBtnId);

        if (retryBtn) {
            retryBtn.addEventListener('click', () => this.handleRetry());
        }
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => this.handleDismiss());
        }
    }

    /**
     * Handle retry button click
     */
    async handleRetry() {
        // Restore original content first
        this.restoreOriginal();

        // Call custom retry handler if set
        if (this.onRetry) {
            await this.onRetry(this.lastContext);
        } else if (this.retryFn) {
            // Re-execute the original operation
            try {
                await this.retryFn();
            } catch (e) {
                // Error UI will be shown by wrap()
            }
        }
    }

    /**
     * Handle dismiss button click
     */
    handleDismiss() {
        this.restoreOriginal();
        this.reset();
    }

    /**
     * Restore original container content
     */
    restoreOriginal() {
        const container = this.getContainer();
        if (container && this.originalContent !== null) {
            container.innerHTML = this.originalContent;
        }
    }

    /**
     * Reset error state
     */
    reset() {
        this.hasError = false;
        this.lastError = null;
        this.lastContext = null;
    }

    /**
     * Check if boundary is in error state
     * @returns {boolean}
     */
    isInError() {
        return this.hasError;
    }

    /**
     * Get last error
     * @returns {Error|null}
     */
    getLastError() {
        return this.lastError;
    }

    /**
     * Escape HTML to prevent XSS
     * NOTE: Now uses centralized utility from utils/html-escape.js
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        return escapeHtml(text);
    }
}

// ==========================================
// Pre-configured Widget Boundaries
// ==========================================

/**
 * Create a pre-configured error boundary for the Chat widget
 * @param {Object} options - Additional options
 * @returns {ErrorBoundary}
 */
export function createChatBoundary(options = {}) {
    return new ErrorBoundary('Chat', '.chat-container', {
        onError: (msg, error, context) => {
            console.error(msg, error);
            // Could also send to analytics
        },
        ...options
    });
}

/**
 * Create a pre-configured error boundary for the Card generator widget
 * @param {Object} options - Additional options
 * @returns {ErrorBoundary}
 */
export function createCardBoundary(options = {}) {
    return new ErrorBoundary('Card Generator', '.card-preview', {
        onError: (msg, error, context) => {
            console.error(msg, error);
        },
        ...options
    });
}

// ==========================================
// Global Error Handler
// ==========================================

/**
 * Show a toast notification for errors
 * @param {string} message - Error message to display
 */
function showErrorToast(message) {
    // Try to use existing toast function if available
    if (typeof window !== 'undefined' && window.showToast) {
        window.showToast(message, 5000);
        return;
    }

    // Fallback: create simple notification
    if (typeof document !== 'undefined') {
        const existing = document.getElementById('global-error-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'global-error-toast';
        toast.className = 'toast-notification error';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--danger, #dc3545);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    }
}

/**
 * Install global error handlers for uncaught errors
 * This provides a fallback for errors not caught by widget boundaries
 */
export function installGlobalErrorHandler() {
    if (typeof window === 'undefined') return;

    window.addEventListener('error', (event) => {
        console.error('[GlobalErrorBoundary] Uncaught error:', event.error);
        // Show user-facing toast for non-developer errors
        if (event.error && !event.error.message.includes('ResizeObserver')) {
            // Skip ResizeObserver errors as they're often benign
            showErrorToast('An unexpected error occurred. Some features may not work correctly.');
        }
    });

    window.addEventListener('unhandledrejection', (event) => {
        console.error('[GlobalErrorBoundary] Unhandled promise rejection:', event.reason);
        // Prevent the default browser error logging
        event.preventDefault();

        // Show user-facing toast
        const reason = event.reason;
        let message = 'An operation failed. Please try again.';

        // Provide context for common errors
        if (reason?.message) {
            if (reason.message.includes('network') || reason.message.includes('fetch')) {
                message = 'Network error. Please check your connection.';
            } else if (reason.message.includes('storage') || reason.message.includes('IndexedDB')) {
                message = 'Storage error. Your data may not be saved correctly.';
            }
        }

        showErrorToast(message);
    });

    console.log('[ErrorBoundary] Global error handlers installed');
}

// ==========================================
// Export
// ==========================================

export default ErrorBoundary;
