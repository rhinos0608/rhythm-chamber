/**
 * Browser Compatibility Check
 *
 * This script runs before the main application to detect required browser features.
 * It must be loaded as a regular (non-module) script to ensure it can execute
 * even if ES module syntax is not supported.
 *
 * Required features:
 * - Web Crypto API (for encryption)
 * - IndexedDB (for local storage)
 * - Promise (for async operations)
 * - async/await syntax support
 * - TextEncoder/TextDecoder (for encoding operations)
 * - crypto.randomUUID() (for unique ID generation)
 * - crypto.getRandomValues() (for random number generation)
 * - localStorage/sessionStorage (for client-side storage)
 * - Secure Context (HTTPS or localhost) for crypto APIs
 * - ES Modules (type="module" - handled by browser script loading)
 *
 * Target browsers: Chrome 90+, Edge 90+, Firefox 90+, Safari 14.5+, iOS 14.5+
 */

(function () {
    'use strict';

    // NOTE: This window assignment is necessary because compatibility.js is loaded
    // as a regular (non-module) script before the ES module application.
    // It provides a mechanism for the main app to verify compatibility passed.
    // This is an exceptional case - regular modules should use ES exports.
    window.__COMPATIBILITY_PASSED__ = false;

    /**
     * Safely test async/await support without using eval/Function
     * Checks for async constructor existence without executing code
     */
    function hasAsyncAwaitSupport() {
        try {
            // Check if async functions are supported by checking the constructor
            // This doesn't execute code, just checks if the browser recognizes async syntax
            return (
                typeof Promise !== 'undefined' &&
                typeof Object.getPrototypeOf(async () => {}).constructor === 'function'
            );
        } catch (e) {
            return false;
        }
    }

    /**
     * Escape HTML to prevent XSS when displaying user/feature data
     */
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') {
            return String(unsafe);
        }
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Check all required browser features
     */
    function checkBrowserSupport() {
        const required = {
            'Web Crypto API': !!(window.crypto && window.crypto.subtle),
            IndexedDB: !!window.indexedDB,
            Promise: typeof Promise !== 'undefined',
            'async/await': hasAsyncAwaitSupport(),
            'TextEncoder/TextDecoder': !!(
                typeof TextEncoder !== 'undefined' && typeof TextDecoder !== 'undefined'
            ),
            'crypto.randomUUID()': !!(
                window.crypto && typeof window.crypto.randomUUID === 'function'
            ),
            'crypto.getRandomValues()': !!(
                window.crypto && typeof window.crypto.getRandomValues === 'function'
            ),
            'localStorage/sessionStorage': !!(
                typeof window.localStorage !== 'undefined' &&
                typeof window.sessionStorage !== 'undefined'
            ),
            'Secure Context (HTTPS)': window.isSecureContext !== false,
        };

        const missing = [];
        for (const feature in required) {
            if (!required[feature]) {
                missing.push(feature);
            }
        }

        return {
            allSupported: missing.length === 0,
            missing: missing,
        };
    }

    /**
     * Display browser upgrade message with app-consistent styling
     * This function blocks further script execution when compatibility fails.
     */
    function showBrowserUpgradeMessage(missing) {
        // Escape missing features to prevent XSS
        const escapedMissing = missing.map(feature => {
            return escapeHtml(feature);
        });

        // Create overlay div
        const overlay = document.createElement('div');
        overlay.id = 'compatibility-overlay';
        overlay.style.cssText =
            'position:fixed;top:0;left:0;width:100%;height:100%;z-index:999999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

        // Create content card
        const card = document.createElement('div');
        card.style.cssText =
            'max-width:500px;padding:2rem;margin:1rem;background:#0a0a0f;color:#ffffff;border-radius:12px;border:1px solid rgba(255,255,255,0.1);text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5)';

        // Icon
        const icon = document.createElement('div');
        icon.textContent = 'Music';
        icon.style.cssText = 'font-size:3rem;margin-bottom:1rem;color:#ef4444;';

        // Heading
        const heading = document.createElement('h1');
        heading.textContent = 'Browser Not Supported';
        heading.style.cssText =
            'font-size:1.5rem;font-weight:600;margin-bottom:1rem;color:#ffffff;';

        // Message with escaped content
        const message = document.createElement('p');
        const missingText = escapedMissing.join(', ');
        message.innerHTML =
            'Rhythm Chamber requires a modern browser with the following features:<br><br>' +
            '<strong style="color: #ef4444;">Missing: ' +
            missingText +
            '</strong>';
        message.style.cssText = 'color:rgba(255,255,255,0.7);line-height:1.6;margin-bottom:1.5rem;';

        // Browser list
        const browserList = document.createElement('div');
        browserList.innerHTML =
            '<strong style="color: #ffffff;">Supported browsers:</strong><br>' +
            '<span style="color: rgba(255, 255, 255, 0.7);">Chrome 90+, Edge 90+, Firefox 90+,<br>Safari 14.5+, iOS Safari 14.5+</span>';
        browserList.style.cssText =
            'background:rgba(255,255,255,0.05);padding:1rem;border-radius:8px;margin-bottom:1.5rem;font-size:0.9rem;';

        // Action text
        const actionText = document.createElement('p');
        actionText.textContent = 'Please update your browser or try a different one to continue.';
        actionText.style.cssText = 'color:rgba(255,255,255,0.5);font-size:0.85rem;margin-bottom:0;';

        // Assemble card
        card.appendChild(icon);
        card.appendChild(heading);
        card.appendChild(message);
        card.appendChild(browserList);
        card.appendChild(actionText);
        overlay.appendChild(card);

        // Clear existing content and show overlay
        if (document.body) {
            document.body.innerHTML = '';
            document.body.appendChild(overlay);
            // Immediately throw to prevent any further script execution
            throw new Error('Browser compatibility check failed: ' + missing.join(', '));
        } else {
            // If body doesn't exist yet, we need to block document parsing
            // Use document.write to synchronously inject the error message
            // This prevents any subsequent scripts from executing
            const html = [
                '<!DOCTYPE html>',
                '<html>',
                '<head>',
                '<meta charset="UTF-8">',
                '<title>Browser Not Supported - Rhythm Chamber</title>',
                '<style>',
                'body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0a0a0f;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}',
                '.card{max-width:500px;padding:2rem;margin:1rem;background:#0a0a0f;border-radius:12px;border:1px solid rgba(255,255,255,0.1);text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5)}',
                '.icon{font-size:3rem;margin-bottom:1rem;color:#ef4444}',
                'h1{font-size:1.5rem;font-weight:600;margin-bottom:1rem;color:#fff}',
                '.message{color:rgba(255,255,255,0.7);line-height:1.6;margin-bottom:1.5rem}',
                '.missing{color:#ef4444;font-weight:bold}',
                '.browser-list{background:rgba(255,255,255,0.05);padding:1rem;border-radius:8px;margin-bottom:1.5rem;font-size:0.9rem}',
                '.action{color:rgba(255,255,255,0.5);font-size:0.85rem;margin-bottom:0}',
                '</style>',
                '</head>',
                '<body>',
                '<div class="card">',
                '<div class="icon">Music</div>',
                '<h1>Browser Not Supported</h1>',
                '<p class="message">Rhythm Chamber requires a modern browser with the following features:<br><br>',
                '<span class="missing">Missing: ' + escapeHtml(missing.join(', ')) + '</span></p>',
                '<div class="browser-list"><strong>Supported browsers:</strong><br>',
                '<span>Chrome 90+, Edge 90+, Firefox 90+<br>Safari 14.5+, iOS Safari 14.5+</span></div>',
                '<p class="action">Please update your browser or try a different one to continue.</p>',
                '</div>',
                '</body>',
                '</html>',
            ].join('\n');

            document.write(html);
            document.close();

            // Throw to ensure execution stops even if document.write is blocked
            throw new Error('Browser compatibility check failed: ' + missing.join(', '));
        }
    }

    // Run compatibility check
    const result = checkBrowserSupport();

    if (!result.allSupported) {
        showBrowserUpgradeMessage(result.missing);
        // This line won't be reached due to the throw in showBrowserUpgradeMessage
    } else {
        // Mark as passed for the main application to verify
        window.__COMPATIBILITY_PASSED__ = true;
        console.log('[Compatibility] All required features detected.');
    }
})();
