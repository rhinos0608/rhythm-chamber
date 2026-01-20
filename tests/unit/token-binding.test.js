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
        expect(failure.userMessage).toMatch(/HTTPS|localhost|Web Crypto/i);
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
        expect(fingerprint).toHaveLength(16);
        expect(sessionStorage.getItem('rhythm_chamber_session_salt')).not.toBeNull();
    });
});
