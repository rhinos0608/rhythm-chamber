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
 * - ES Modules (type="module" - handled by browser script loading)
 *
 * Target browsers: Chrome 90+, Edge 90+, Firefox 90+, Safari 14.5+, iOS 14.5+
 */

(function() {
    'use strict';

    // Flag for main.js to check
    window.__COMPATIBILITY_PASSED__ = false;

    /**
     * Safely test async/await support without causing parse errors
     * Uses new Function() to isolate the syntax test
     */
    function hasAsyncAwaitSupport() {
        try {
            // Create an async function dynamically - if the browser doesn't support
            // async/await, this will throw a SyntaxError
            var asyncTest = new Function(
                'return (async function() { return await Promise.resolve(true); })()'
            );
            return asyncTest() instanceof Promise;
        } catch (e) {
            return false;
        }
    }

    /**
     * Check all required browser features
     */
    function checkBrowserSupport() {
        var required = {
            'Web Crypto API': !!(window.crypto && window.crypto.subtle),
            'IndexedDB': !!window.indexedDB,
            'Promise': typeof Promise !== 'undefined',
            'async/await': hasAsyncAwaitSupport()
        };

        var missing = [];
        for (var feature in required) {
            if (!required[feature]) {
                missing.push(feature);
            }
        }

        return {
            allSupported: missing.length === 0,
            missing: missing
        };
    }

    /**
     * Display browser upgrade message with app-consistent styling
     */
    function showBrowserUpgradeMessage(missing) {
        // Create overlay div
        var overlay = document.createElement('div');
        overlay.id = 'compatibility-overlay';
        overlay.style.cssText = [
            'position: fixed',
            'top: 0',
            'left: 0',
            'width: 100%',
            'height: 100%',
            'z-index: 999999',
            'display: flex',
            'align-items: center',
            'justify-content: center',
            'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ].join(';');

        // Create content card
        var card = document.createElement('div');
        card.style.cssText = [
            'max-width: 500px',
            'padding: 2rem',
            'margin: 1rem',
            'background: #0a0a0f',
            'color: #ffffff',
            'border-radius: 12px',
            'border: 1px solid rgba(255, 255, 255, 0.1)',
            'text-align: center',
            'box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5)'
        ].join(';');

        // Icon
        var icon = document.createElement('div');
        icon.textContent = '🎵';
        icon.style.cssText = 'font-size: 3rem; margin-bottom: 1rem;';

        // Heading
        var heading = document.createElement('h1');
        heading.textContent = 'Browser Not Supported';
        heading.style.cssText = [
            'font-size: 1.5rem',
            'font-weight: 600',
            'margin-bottom: 1rem',
            'color: #ffffff'
        ].join(';');

        // Message
        var message = document.createElement('p');
        message.innerHTML = 'Rhythm Chamber requires a modern browser with the following features:<br><br>' +
            '<strong style="color: #ef4444;">Missing: ' + missing.join(', ') + '</strong>';
        message.style.cssText = [
            'color: rgba(255, 255, 255, 0.7)',
            'line-height: 1.6',
            'margin-bottom: 1.5rem'
        ].join(';');

        // Browser list
        var browserList = document.createElement('div');
        browserList.innerHTML = '<strong style="color: #ffffff;">Supported browsers:</strong><br>' +
            '<span style="color: rgba(255, 255, 255, 0.7);">Chrome 90+, Edge 90+, Firefox 90+,<br>Safari 14.5+, iOS Safari 14.5+</span>';
        browserList.style.cssText = [
            'background: rgba(255, 255, 255, 0.05)',
            'padding: 1rem',
            'border-radius: 8px',
            'margin-bottom: 1.5rem',
            'font-size: 0.9rem'
        ].join(';');

        // Action text
        var actionText = document.createElement('p');
        actionText.textContent = 'Please update your browser or try a different one to continue.';
        actionText.style.cssText = [
            'color: rgba(255, 255, 255, 0.5)',
            'font-size: 0.85rem',
            'margin-bottom: 0'
        ].join(';');

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
            // Prevent any script execution after this point
            throw new Error('Browser compatibility check failed: ' + missing.join(', '));
        } else {
            // If body doesn't exist yet, wait for DOMContentLoaded
            document.addEventListener('DOMContentLoaded', function() {
                document.body.innerHTML = '';
                document.body.appendChild(overlay);
                throw new Error('Browser compatibility check failed: ' + missing.join(', '));
            });
        }
    }

    // Run compatibility check
    var result = checkBrowserSupport();

    if (!result.allSupported) {
        showBrowserUpgradeMessage(result.missing);
        // This line won't be reached due to the throw in showBrowserUpgradeMessage
    } else {
        // Mark as passed for main.js to check
        window.__COMPATIBILITY_PASSED__ = true;
        console.log('[Compatibility] All required features detected.');
    }

})();
