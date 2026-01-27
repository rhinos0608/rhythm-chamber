/**
 * Token Binding Unit Tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const originalCrypto = globalThis.crypto;

function stubCrypto(stub) {
    Object.defineProperty(globalThis, 'crypto', {
        value: stub,
        configurable: true
    });
}

function restoreCrypto() {
    if (originalCrypto) {
        Object.defineProperty(globalThis, 'crypto', {
            value: originalCrypto,
            configurable: true
        });
    } else {
        delete globalThis.crypto;
    }
}


describe('TokenBinding', () => {
    beforeEach(() => {
        vi.resetModules();
        sessionStorage.clear();
        localStorage.clear();
    });

    afterEach(() => {
        restoreCrypto();
    });

    it('soft fails with guidance when crypto is unavailable', async () => {
        stubCrypto({
            getRandomValues: vi.fn()
        });

        const TokenBinding = await import('../../js/security/token-binding.js');
        const result = await TokenBinding.createTokenBinding('test-token');

        expect(result).toBe(false);
        const failure = TokenBinding.getTokenBindingFailure();
        expect(failure).toBeTruthy();
        // Error message should indicate secure context is needed
        expect(failure.userMessage).toMatch(/secure|Cryptographic|unavailable/i);
    });

    it('initializes session salt when generating fingerprint', async () => {
        const digestBuffer = new Uint8Array(32).fill(1).buffer;

        stubCrypto({
            getRandomValues: (array) => {
                array.fill(7);
                return array;
            },
            subtle: {
                digest: vi.fn(async () => digestBuffer)
            }
        });

        const TokenBinding = await import('../../js/security/token-binding.js');
        sessionStorage.removeItem('rhythm_chamber_session_salt');

        const fingerprint = await TokenBinding.generateDeviceFingerprint();
        // SECURITY FIX (C1): Full SHA-256 output is 64 hex chars (256 bits)
        expect(fingerprint).toHaveLength(64);
        expect(sessionStorage.getItem('rhythm_chamber_session_salt')).not.toBeNull();
    });

    // SECURITY FIX (C3): Tests for sessionStorage usage (XSS mitigation)
    describe('XSS Prevention (C3 Fix)', () => {
        beforeEach(async () => {
            // Setup secure crypto stub
            const digestBuffer = new Uint8Array(32).fill(1).buffer;
            stubCrypto({
                getRandomValues: (array) => {
                    array.fill(7);
                    return array;
                },
                subtle: {
                    digest: vi.fn(async () => digestBuffer)
                }
            });

            // Ensure secure context
            Object.defineProperty(window, 'isSecureContext', {
                value: true,
                configurable: true
            });
        });

        it('stores token bindings in sessionStorage, not localStorage', async () => {
            const TokenBinding = await import('../../js/security/token-binding.js');
            const testToken = 'test-access-token-12345';

            // Create a token binding
            const result = await TokenBinding.createTokenBinding(testToken);
            expect(result).toBe(true);

            // Verify it's in sessionStorage
            const sessionKey = 'rhythm_chamber_token_binding_' + testToken;
            expect(sessionStorage.getItem(sessionKey)).not.toBeNull();

            // Verify it's NOT in localStorage (XSS prevention)
            expect(localStorage.getItem(sessionKey)).toBeNull();
        });

        it('verifies token bindings from sessionStorage', async () => {
            const TokenBinding = await import('../../js/security/token-binding.js');
            const testToken = 'another-test-token-67890';

            // Create and verify binding
            await TokenBinding.createTokenBinding(testToken);
            const verification = await TokenBinding.verifyTokenBinding(testToken);

            expect(verification.valid).toBe(true);
        });

        it('clears token bindings from sessionStorage', async () => {
            const TokenBinding = await import('../../js/security/token-binding.js');
            const testToken = 'clearable-token-abc';

            // Create a binding
            await TokenBinding.createTokenBinding(testToken);
            const sessionKey = 'rhythm_chamber_token_binding_' + testToken;
            expect(sessionStorage.getItem(sessionKey)).not.toBeNull();

            // Clear the binding
            const cleared = TokenBinding.clearTokenBinding(testToken);
            expect(cleared).toBe(true);
            expect(sessionStorage.getItem(sessionKey)).toBeNull();
        });

        it('device ID remains in localStorage (non-sensitive, for stability)', async () => {
            const TokenBinding = await import('../../js/security/token-binding.js');

            // Generate fingerprint to trigger device ID creation
            await TokenBinding.generateDeviceFingerprint();

            // Device ID should be in localStorage for stability across sessions
            const deviceId = localStorage.getItem('rhythm_chamber_device_id');
            expect(deviceId).not.toBeNull();
            expect(deviceId).toMatch(/^[a-f0-9-]+$/); // UUID format
        });

        it('session salt is stored in sessionStorage', async () => {
            const TokenBinding = await import('../../js/security/token-binding.js');

            // Trigger session salt creation
            const salt = TokenBinding.getSessionSalt();
            expect(salt).not.toBeNull();

            // Verify salt is in sessionStorage
            expect(sessionStorage.getItem('rhythm_chamber_session_salt')).not.toBeNull();
        });

        it('XSS cannot extract token bindings from localStorage after storage', async () => {
            const TokenBinding = await import('../../js/security/token-binding.js');
            const testToken = 'xss-protected-token-xyz';

            await TokenBinding.createTokenBinding(testToken);

            // Simulate XSS attempting to read from localStorage
            const localStorageKeys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('rhythm_chamber_token_binding_')) {
                    localStorageKeys.push(key);
                }
            }

            // XSS should find no token bindings in localStorage
            expect(localStorageKeys).toHaveLength(0);
        });

        it('token bindings are cleared when session ends (tab close)', async () => {
            const TokenBinding = await import('../../js/security/token-binding.js');
            const testToken = 'session-bound-token-123';

            await TokenBinding.createTokenBinding(testToken);

            // Verify binding exists
            const sessionKey = 'rhythm_chamber_token_binding_' + testToken;
            expect(sessionStorage.getItem(sessionKey)).not.toBeNull();

            // Simulate tab close by clearing sessionStorage
            sessionStorage.clear();

            // Verification should fail after session ends
            const verification = await TokenBinding.verifyTokenBinding(testToken);
            expect(verification.valid).toBe(false);
            expect(verification.reason).toBe('no_binding');
        });
    });

    // SECURITY FIX (C1): Tests for full 256-bit device fingerprint
    describe('Device Fingerprint Full 256-bit (C1 Fix)', () => {
        beforeEach(async () => {
            // Setup secure crypto stub
            const digestBuffer = new Uint8Array(32).fill(0xAB);
            stubCrypto({
                getRandomValues: (array) => {
                    array.fill(7);
                    return array;
                },
                subtle: {
                    digest: vi.fn(async () => digestBuffer)
                }
            });

            // Ensure secure context
            Object.defineProperty(window, 'isSecureContext', {
                value: true,
                configurable: true
            });
        });

        it('generates 64-character hex string (256 bits) for device fingerprint', async () => {
            const TokenBinding = await import('../../js/security/token-binding.js');
            const fingerprint = await TokenBinding.generateDeviceFingerprint();

            // SHA-256 produces 32 bytes = 64 hex characters (256 bits)
            expect(fingerprint).toHaveLength(64);
            expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
        });

        it('does NOT truncate fingerprint to 16 characters', async () => {
            const TokenBinding = await import('../../js/security/token-binding.js');
            const fingerprint = await TokenBinding.generateDeviceFingerprint();

            // Before fix: fingerprint was truncated to 16 chars (64 bits)
            // After fix: fingerprint is full 64 chars (256 bits)
            expect(fingerprint.length).toBeGreaterThan(16);
            expect(fingerprint).toHaveLength(64);
        });

        it('stores full 256-bit fingerprint in token binding', async () => {
            const TokenBinding = await import('../../js/security/token-binding.js');
            const testToken = 'full-fingerprint-token';

            await TokenBinding.createTokenBinding(testToken);

            const sessionKey = 'rhythm_chamber_token_binding_' + testToken;
            const bindingJson = sessionStorage.getItem(sessionKey);
            expect(bindingJson).not.toBeNull();

            const binding = JSON.parse(bindingJson);
            expect(binding.fingerprint).toHaveLength(64);
            expect(binding.fingerprint).toMatch(/^[0-9a-f]{64}$/);
        });

        it('verifies token binding using full 256-bit fingerprint', async () => {
            const TokenBinding = await import('../../js/security/token-binding.js');
            const testToken = 'verify-full-fp-token';

            await TokenBinding.createTokenBinding(testToken);
            const verification = await TokenBinding.verifyTokenBinding(testToken);

            expect(verification.valid).toBe(true);
        });

        it('rejects token binding when fingerprint does not match full 256 bits', async () => {
            const TokenBinding = await import('../../js/security/token-binding.js');
            const testToken = 'mismatch-fp-token';

            await TokenBinding.createTokenBinding(testToken);

            const sessionKey = 'rhythm_chamber_token_binding_' + testToken;
            const bindingJson = sessionStorage.getItem(sessionKey);
            const binding = JSON.parse(bindingJson);

            // Tamper with the fingerprint by changing one character
            const tamperedFingerprint = binding.fingerprint.substring(0, 63) + '0';
            binding.fingerprint = tamperedFingerprint;
            sessionStorage.setItem(sessionKey, JSON.stringify(binding));

            const verification = await TokenBinding.verifyTokenBinding(testToken);
            expect(verification.valid).toBe(false);
            expect(verification.reason).toBe('fingerprint_mismatch');
        });
    });
});
