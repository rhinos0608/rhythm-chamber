/**
 * Security Module - Traditional Script Loader
 * 
 * This file loads the modular security system and sets up window.Security
 * for backward compatibility with existing code.
 * 
 * ARCHITECTURE:
 * - js/security/encryption.js - Cryptographic operations (AES-GCM, PBKDF2)
 * - js/security/token-binding.js - XSS protection (device fingerprinting, token binding)
 * - js/security/anomaly.js - Behavioral detection (rate limiting, anomaly detection)
 * - js/security/index.js - Unified facade that sets up window.Security
 * - js/security.js - This file (backward compatibility loader)
 */

(function () {
    'use strict';

    // Create a script loader for the security modules
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.type = 'module';
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
    }

    // Load all security modules in order
    // The index.js will set up window.Security
    Promise.all([
        loadScript('js/security/encryption.js'),
        loadScript('js/security/token-binding.js'),
        loadScript('js/security/anomaly.js'),
        loadScript('js/security/recovery-handlers.js'),
        loadScript('js/security/index.js')
    ]).then(() => {
        console.log('[Security] All security modules loaded successfully');
    }).catch(err => {
        console.error('[Security] Failed to load security modules:', err);

        // Fallback: Create minimal security object to prevent crashes
        if (!window.Security) {
            window.Security = {
                obfuscate: (v) => v,
                deobfuscate: (v) => v,
                hashData: async () => 'fallback',
                encryptData: async (d) => d,
                decryptData: async (d) => d,
                isRateLimited: () => false,
                recordFailedAttempt: async () => { },
                checkSuspiciousActivity: async () => ({ blocked: false, failureCount: 0, message: '' }),
                clearSecurityLockout: () => { },
                ErrorContext: {
                    create: (code, rootCause, details) => ({ code, rootCause, details, timestamp: Date.now() })
                }
            };
            console.warn('[Security] Loaded minimal fallback');
        }
    });
})();
