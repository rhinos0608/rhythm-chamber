/**
 * Main Application Entry Point
 * 
 * This is the single ES Module entry point for the application.
 * It handles:
 * 1. Security initialization (fail-fast if not secure)
 * 2. Module imports
 * 3. Application startup
 * 
 * @module main
 */

// ==========================================
// Security Check (MUST run first, synchronously)
// ==========================================

import { Security } from './security/index.js';

// Validate secure context immediately before ANY other imports
const securityCheck = Security.checkSecureContext();
if (!securityCheck.secure) {
    showSecurityError(securityCheck.reason);
    throw new Error(`Security check failed: ${securityCheck.reason}`);
}

console.log('[Main] Security context validated');

// ==========================================
// Error UI for Security Failures
// ==========================================

/**
 * Show security error UI and block app loading
 * @param {string} reason - Why security check failed
 */
function showSecurityError(reason) {
    // Wait for DOM to be ready
    const showError = () => {
        const container = document.querySelector('.app-main') || document.body;
        container.innerHTML = `
            <div class="security-error" style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 60vh;
                text-align: center;
                padding: 2rem;
            ">
                <div style="font-size: 4rem; margin-bottom: 1rem;">🔒</div>
                <h2 style="color: var(--danger, #dc3545); margin-bottom: 1rem;">Security Check Failed</h2>
                <p style="max-width: 500px; margin-bottom: 1.5rem; color: var(--text-muted, #6c757d);">
                    ${escapeHtml(reason)}
                </p>
                <div style="
                    background: var(--bg-tertiary, #f8f9fa);
                    padding: 1rem;
                    border-radius: 8px;
                    max-width: 500px;
                    text-align: left;
                ">
                    <p style="margin-bottom: 0.5rem;"><strong>Common causes:</strong></p>
                    <ul style="margin: 0; padding-left: 1.5rem;">
                        <li>Page loaded in an iframe</li>
                        <li>Non-secure protocol (must use HTTPS, localhost, or file://)</li>
                        <li>Browser security features disabled</li>
                    </ul>
                </div>
                <button onclick="location.reload()" style="
                    margin-top: 1.5rem;
                    padding: 0.75rem 1.5rem;
                    background: var(--accent, #6f42c1);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 1rem;
                ">
                    Retry
                </button>
            </div>
        `;
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showError);
    } else {
        showError();
    }
}

/**
 * Escape HTML for safe display
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==========================================
// Application Bootstrap
// ==========================================

/**
 * Initialize the application after security passes
 */
async function bootstrap() {
    console.log('[Main] Bootstrapping application...');

    try {
        // Import and initialize the application
        const { init } = await import('./app.js');
        await init();

        console.log('[Main] Application initialized successfully');
    } catch (error) {
        console.error('[Main] Failed to initialize application:', error);
        showLoadingError(error);
    }
}

/**
 * Show generic loading error
 */
function showLoadingError(error) {
    const container = document.querySelector('.app-main') || document.body;
    container.innerHTML = `
        <div class="loading-error" style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            text-align: center;
            padding: 2rem;
        ">
            <div style="font-size: 4rem; margin-bottom: 1rem;">⚠️</div>
            <h2 style="margin-bottom: 1rem;">Application Loading Error</h2>
            <p style="max-width: 500px; margin-bottom: 1.5rem; color: var(--text-muted, #6c757d);">
                An error occurred while loading the application. 
                This may be due to a network issue or browser compatibility.
            </p>
            <details style="
                background: var(--bg-tertiary, #f8f9fa);
                padding: 1rem;
                border-radius: 8px;
                max-width: 500px;
                text-align: left;
                margin-bottom: 1rem;
            ">
                <summary style="cursor: pointer;">Technical Details</summary>
                <pre style="
                    margin-top: 0.5rem;
                    font-size: 0.85rem;
                    overflow-x: auto;
                    white-space: pre-wrap;
                ">${escapeHtml(error.message)}\n\n${escapeHtml(error.stack || '')}</pre>
            </details>
            <button onclick="location.reload()" style="
                padding: 0.75rem 1.5rem;
                background: var(--accent, #6f42c1);
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 1rem;
            ">
                Refresh Page
            </button>
        </div>
    `;
}

// ==========================================
// Start Application
// ==========================================

// Wait for DOM then bootstrap
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}
