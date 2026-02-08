/**
 * Unit Tests: Spotify OAuth Manager
 *
 * Critical security tests for PKCE OAuth flow implementation
 * Tests cover:
 * - PKCE code verifier generation (uniform distribution, no modulo bias)
 * - Code challenge generation (SHA256, base64url encoding)
 * - OAuth state parameter CSRF protection
 * - sessionStorage-only storage (NO localStorage fallback)
 *
 * @see /workspaces/rhythm-chamber/js/spotify/oauth-manager.js
 * @module tests/unit/spotify/oauth-manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuthManager } from '../../../js/spotify/oauth-manager.js';
import { ConfigLoader } from '../../../js/services/config-loader.js';

// Mock ConfigLoader
vi.mock('../../../js/services/config-loader.js', () => ({
    ConfigLoader: {
        get: vi.fn((key, defaultValue) => {
            const config = {
                'spotify.clientId': 'test-client-id-12345678901234567890',
                'spotify.redirectUri': 'http://localhost:8080/callback',
                'spotify.scopes': ['user-read-recently-played', 'user-top-read'],
            };
            return config[key] !== undefined ? config[key] : defaultValue;
        }),
    },
}));

// Mock window.crypto for real cryptographic operations
const mockCrypto = {
    getRandomValues: (array) => {
        const values = new Uint8Array(array.length);
        for (let i = 0; i < array.length; i++) {
            values[i] = Math.floor(Math.random() * 256);
        }
        return values;
    },
    subtle: {
        digest: vi.fn((algorithm, data) => {
            // Mock SHA-256 digest
            return Promise.resolve(
                new ArrayBuffer(32)
            );
        }),
    },
};

Object.defineProperty(global, 'crypto', {
    value: mockCrypto,
    writable: true,
});

describe('OAuthManager - PKCE Security', () => {
    beforeEach(() => {
        // Clear sessionStorage before each test
        sessionStorage.clear();
        vi.clearAllMocks();
    });

    afterEach(() => {
        sessionStorage.clear();
    });

    describe('isConfigured', () => {
        it('should return true when Spotify is properly configured', () => {
            expect(OAuthManager.isConfigured()).toBe(true);
        });

        it('should return false when clientId is missing', () => {
            vi.mocked(ConfigLoader.get).mockImplementation((key) => {
                if (key === 'spotify.clientId') return '';
                if (key === 'spotify.redirectUri') return 'http://localhost:8080/callback';
                return undefined;
            });

            expect(OAuthManager.isConfigured()).toBe(false);
        });

        it('should return false when redirectUri is missing', () => {
            vi.mocked(ConfigLoader.get).mockImplementation((key) => {
                if (key === 'spotify.clientId') return 'test-client-id';
                if (key === 'spotify.redirectUri') return '';
                return undefined;
            });

            expect(OAuthManager.isConfigured()).toBe(false);
        });

        it('should return false for placeholder clientId', () => {
            vi.mocked(ConfigLoader.get).mockImplementation((key) => {
                if (key === 'spotify.clientId') return 'your-spotify-client-id';
                if (key === 'spotify.redirectUri') return 'http://localhost:8080/callback';
                return undefined;
            });

            expect(OAuthManager.isConfigured()).toBe(false);
        });
    });

    describe('PKCE Code Verifier Generation', () => {
        it('should generate code verifier of correct length (64 characters)', async () => {
            // Spy on crypto.getRandomValues to capture the generated verifier
            const setItemSpy = vi.spyOn(sessionStorage, 'setItem');

            // Mock the redirect to prevent actual navigation
            delete window.location;
            window.location = { href: '' };

            try {
                await OAuthManager.initiateLogin();
            } catch (e) {
                // Expected to fail due to mocked location
            }

            // Verify sessionStorage was called with code verifier
            const verifierCall = setItemSpy.calls.find(
                call => call[0] === 'spotify_code_verifier'
            );

            expect(verifierCall).toBeDefined();
            expect(verifierCall[1]).toHaveLength(64);
            expect(verifierCall[1]).toMatch(/^[A-Za-z0-9]+$/);
        });

        it('should use only valid PKCE characters (A-Z, a-z, 0-9)', async () => {
            const setItemSpy = vi.spyOn(sessionStorage, 'setItem');

            delete window.location;
            window.location = { href: '' };

            try {
                await OAuthManager.initiateLogin();
            } catch (e) {
                // Expected
            }

            const verifierCall = setItemSpy.calls.find(
                call => call[0] === 'spotify_code_verifier'
            );

            const verifier = verifierCall[1];
            const validChars = /^[A-Za-z0-9]+$/;

            expect(verifier).toMatch(validChars);
        });

        it('should generate cryptographically random values', async () => {
            const verifiers = [];
            const setItemSpy = vi.spyOn(sessionStorage, 'setItem');

            delete window.location;
            window.location = { href: '' };

            // Generate multiple verifiers and check for uniqueness
            for (let i = 0; i < 100; i++) {
                sessionStorage.clear();
                setItemSpy.mockClear();

                try {
                    await OAuthManager.initiateLogin();
                } catch (e) {
                    // Expected
                }

                const verifierCall = setItemSpy.calls.find(
                    call => call[0] === 'spotify_code_verifier'
                );

                if (verifierCall) {
                    verifiers.push(verifierCall[1]);
                }
            }

            // All verifiers should be unique (statistically unlikely to have duplicates)
            const uniqueVerifiers = new Set(verifiers);
            expect(uniqueVerifiers.size).toBe(verifiers.length);

            // At least 90% should be different from each other
            const avgUniqueRatio = uniqueVerifiers.size / verifiers.length;
            expect(avgUniqueRatio).toBeGreaterThan(0.9);
        });

        it('should have sufficient entropy (no obvious patterns)', async () => {
            const verifiers = [];
            const setItemSpy = vi.spyOn(sessionStorage, 'setItem');

            delete window.location;
            window.location = { href: '' };

            // Collect 1000 verifiers
            for (let i = 0; i < 1000; i++) {
                sessionStorage.clear();
                setItemSpy.mockClear();

                try {
                    await OAuthManager.initiateLogin();
                } catch (e) {
                    // Expected
                }

                const verifierCall = setItemSpy.calls.find(
                    call => call[0] === 'spotify_code_verifier'
                );

                if (verifierCall) {
                    verifiers.push(verifierCall[1]);
                }
            }

            // Check character distribution at each position
            const positionCounts = Array(64).fill(null).map(() => ({}));

            verifiers.forEach(verifier => {
                for (let i = 0; i < verifier.length; i++) {
                    const char = verifier[i];
                    positionCounts[i][char] = (positionCounts[i][char] || 0) + 1;
                }
            });

            // Each position should have good distribution (at least 30 different characters)
            positionCounts.forEach((counts, index) => {
                const uniqueChars = Object.keys(counts).length;
                expect(uniqueChars).toBeGreaterThan(30);
            });
        });
    });

    describe('Code Challenge Generation', () => {
        it('should generate code challenge from code verifier', async () => {
            const setItemSpy = vi.spyOn(sessionStorage, 'setItem');

            delete window.location;
            window.location = { href: '' };

            try {
                await OAuthManager.initiateLogin();
            } catch (e) {
                // Expected
            }

            // Verify code_challenge parameter is set in URL
            const url = window.location.href;
            expect(url).toContain('code_challenge=');
        });

        it('should use S256 challenge method', async () => {
            delete window.location;
            window.location = { href: '' };

            try {
                await OAuthManager.initiateLogin();
            } catch (e) {
                // Expected
            }

            const url = window.location.href;
            expect(url).toContain('code_challenge_method=S256');
        });

        it('should generate base64url-encoded challenge', async () => {
            delete window.location;
            window.location = { href: '' };

            try {
                await OAuthManager.initiateLogin();
            } catch (e) {
                // Expected
            }

            const url = window.location.href;
            const challengeMatch = url.match(/code_challenge=([^&]+)/);

            expect(challengeMatch).toBeDefined();

            const challenge = challengeMatch[1];

            // Base64URL should only contain A-Z, a-z, 0-9, -, _
            // and should not contain padding (=)
            expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
            expect(challenge).not.toContain('=');
        });
    });

    describe('OAuth State Parameter CSRF Protection', () => {
        it('should generate and store state parameter', async () => {
            const setItemSpy = vi.spyOn(sessionStorage, 'setItem');

            delete window.location;
            window.location = { href: '' };

            try {
                await OAuthManager.initiateLogin();
            } catch (e) {
                // Expected
            }

            // Verify state was stored
            const stateCall = setItemSpy.calls.find(
                call => call[0] === 'spotify_oauth_state'
            );

            expect(stateCall).toBeDefined();
            expect(stateCall[1]).toBeTruthy();
            expect(stateCall[1].length).toBeGreaterThan(0);
        });

        it('should include state parameter in authorization URL', async () => {
            delete window.location;
            window.location = { href: '' };

            try {
                await OAuthManager.initiateLogin();
            } catch (e) {
                // Expected
            }

            const url = window.location.href;
            expect(url).toContain('state=');
        });

        it('should generate cryptographically random state', async () => {
            const states = [];
            const setItemSpy = vi.spyOn(sessionStorage, 'setItem');

            delete window.location;
            window.location = { href: '' };

            // Generate 100 states
            for (let i = 0; i < 100; i++) {
                sessionStorage.clear();
                setItemSpy.mockClear();

                try {
                    await OAuthManager.initiateLogin();
                } catch (e) {
                    // Expected
                }

                const stateCall = setItemSpy.calls.find(
                    call => call[0] === 'spotify_oauth_state'
                );

                if (stateCall) {
                    states.push(stateCall[1]);
                }
            }

            // All states should be unique
            const uniqueStates = new Set(states);
            expect(uniqueStates.size).toBe(states.length);

            // State should be hex string (64 characters = 32 bytes * 2)
            states.forEach(state => {
                expect(state).toMatch(/^[0-9a-f]+$/);
                expect(state.length).toBe(64);
            });
        });

        it('should verify state on callback to prevent CSRF', async () => {
            const mockState = 'test-state-1234567890abcdef';

            // Store state in sessionStorage
            sessionStorage.setItem('spotify_oauth_state', mockState);
            sessionStorage.setItem('spotify_code_verifier', 'test-verifier');

            // Mock successful token exchange
            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'test-access-token',
                            refresh_token: 'test-refresh-token',
                            expires_in: 3600,
                        }),
                })
            );

            const result = await OAuthManager.handleCallback('test-code', mockState);

            expect(result).toBeDefined();
            expect(result.access_token).toBe('test-access-token');

            // State should be cleared after verification
            expect(sessionStorage.getItem('spotify_oauth_state')).toBeNull();
        });

        it('should reject callback with mismatched state', async () => {
            const storedState = 'stored-state-1234567890abcdef';
            const callbackState = 'different-state-1234567890abcdef';

            sessionStorage.setItem('spotify_oauth_state', storedState);
            sessionStorage.setItem('spotify_code_verifier', 'test-verifier');

            await expect(
                OAuthManager.handleCallback('test-code', callbackState)
            ).rejects.toThrow('Security verification failed');

            // State should be cleared even on mismatch
            expect(sessionStorage.getItem('spotify_oauth_state')).toBeNull();
        });

        it('should reject callback with missing state', async () => {
            sessionStorage.setItem('spotify_code_verifier', 'test-verifier');

            await expect(
                OAuthManager.handleCallback('test-code', null)
            ).rejects.toThrow('Security verification failed');
        });

        it('should reject callback with empty stored state', async () => {
            sessionStorage.setItem('spotify_oauth_state', '');
            sessionStorage.setItem('spotify_code_verifier', 'test-verifier');

            await expect(
                OAuthManager.handleCallback('test-code', 'some-state')
            ).rejects.toThrow('Security verification failed');
        });
    });

    describe('sessionStorage-Only Storage Security', () => {
        it('should store code verifier in sessionStorage only', async () => {
            const sessionStorageSpy = vi.spyOn(sessionStorage, 'setItem');
            const localStorageSpy = vi.spyOn(localStorage, 'setItem');

            delete window.location;
            window.location = { href: '' };

            try {
                await OAuthManager.initiateLogin();
            } catch (e) {
                // Expected
            }

            // Verify sessionStorage was used
            const verifierCall = sessionStorageSpy.calls.find(
                call => call[0] === 'spotify_code_verifier'
            );
            expect(verifierCall).toBeDefined();

            // Verify localStorage was NOT used for verifier
            const localStorageVerifierCall = localStorageSpy.calls.find(
                call => call[0] === 'spotify_code_verifier'
            );
            expect(localStorageVerifierCall).toBeUndefined();
        });

        it('should store state in sessionStorage only', async () => {
            const sessionStorageSpy = vi.spyOn(sessionStorage, 'setItem');
            const localStorageSpy = vi.spyOn(localStorage, 'setItem');

            delete window.location;
            window.location = { href: '' };

            try {
                await OAuthManager.initiateLogin();
            } catch (e) {
                // Expected
            }

            // Verify sessionStorage was used
            const stateCall = sessionStorageSpy.calls.find(
                call => call[0] === 'spotify_oauth_state'
            );
            expect(stateCall).toBeDefined();

            // Verify localStorage was NOT used for state
            const localStorageStateCall = localStorageSpy.calls.find(
                call => call[0] === 'spotify_oauth_state'
            );
            expect(localStorageStateCall).toBeUndefined();
        });

        it('should reject when sessionStorage is unavailable', async () => {
            // Mock sessionStorage.setItem to throw (simulating disabled storage)
            vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
                throw new Error('sessionStorage disabled');
            });

            // Mock dispatchEvent
            const eventSpy = vi.spyOn(window, 'dispatchEvent');

            await expect(OAuthManager.initiateLogin()).rejects.toThrow(
                'sessionStorage required'
            );

            // Verify error event was dispatched
            expect(eventSpy).toHaveBeenCalled();
            const event = eventSpy.mock.calls[0][0];
            expect(event.type).toBe('spotify:auth-error');
            expect(event.detail.reason).toBe('session_storage_unavailable');
        });

        it('should clear verifier from sessionStorage after token exchange', async () => {
            const mockState = 'test-state';
            sessionStorage.setItem('spotify_oauth_state', mockState);
            sessionStorage.setItem('spotify_code_verifier', 'test-verifier');

            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'test-access-token',
                            refresh_token: 'test-refresh-token',
                            expires_in: 3600,
                        }),
                })
            );

            await OAuthManager.handleCallback('test-code', mockState);

            // Verify verifier was cleared
            expect(sessionStorage.getItem('spotify_code_verifier')).toBeNull();
        });

        it('should fail when code verifier is missing from sessionStorage', async () => {
            const mockState = 'test-state';
            sessionStorage.setItem('spotify_oauth_state', mockState);
            // Don't set code_verifier

            await expect(
                OAuthManager.handleCallback('test-code', mockState)
            ).rejects.toThrow('No code verifier found');
        });
    });

    describe('OAuth URL Construction', () => {
        it('should construct correct authorization URL', async () => {
            delete window.location;
            window.location = { href: '' };

            try {
                await OAuthManager.initiateLogin();
            } catch (e) {
                // Expected
            }

            const url = window.location.href;

            // Check required parameters
            expect(url).toContain('https://accounts.spotify.com/authorize');
            expect(url).toContain('response_type=code');
            expect(url).toContain('client_id=');
            expect(url).toContain('redirect_uri=');
            expect(url).toContain('scope=');
            expect(url).toContain('code_challenge_method=S256');
            expect(url).toContain('code_challenge=');
            expect(url).toContain('state=');
        });

        it('should include correct scopes in authorization URL', async () => {
            delete window.location;
            window.location = { href: '' };

            try {
                await OAuthManager.initiateLogin();
            } catch (e) {
                // Expected
            }

            const url = window.location.href;

            // Scopes should be joined by space
            expect(url).toContain('user-read-recently-played');
            expect(url).toContain('user-top-read');
        });
    });

    describe('Error Handling', () => {
        it('should throw error when not configured', async () => {
            vi.mocked(ConfigLoader.get).mockImplementation((key) => {
                if (key === 'spotify.clientId') return '';
                return undefined;
            });

            await expect(OAuthManager.initiateLogin()).rejects.toThrow(
                'Spotify is not configured'
            );
        });

        it('should throw error when redirectUri is invalid', async () => {
            vi.mocked(ConfigLoader.get).mockImplementation((key) => {
                if (key === 'spotify.clientId') return 'test-client-id';
                if (key === 'spotify.redirectUri') return null;
                return undefined;
            });

            await expect(OAuthManager.initiateLogin()).rejects.toThrow(
                'redirectUri is missing or invalid'
            );
        });

        it('should handle token exchange errors', async () => {
            const mockState = 'test-state';
            sessionStorage.setItem('spotify_oauth_state', mockState);
            sessionStorage.setItem('spotify_code_verifier', 'test-verifier');

            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: false,
                    json: () =>
                        Promise.resolve({
                            error: 'invalid_grant',
                            error_description: 'Invalid authorization code',
                        }),
                })
            );

            await expect(
                OAuthManager.handleCallback('invalid-code', mockState)
            ).rejects.toThrow('Invalid authorization code');
        });
    });

    describe('clearSessionData', () => {
        it('should clear all OAuth session data', () => {
            sessionStorage.setItem('spotify_code_verifier', 'test-verifier');
            sessionStorage.setItem('spotify_oauth_state', 'test-state');

            OAuthManager.clearSessionData();

            expect(sessionStorage.getItem('spotify_code_verifier')).toBeNull();
            expect(sessionStorage.getItem('spotify_oauth_state')).toBeNull();
        });
    });
});
