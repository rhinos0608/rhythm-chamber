/**
 * Unit Tests: Spotify Token Store
 *
 * Tests for secure token persistence and retrieval
 * Tests cover:
 * - JWT token expiration validation
 * - Secure token storage with SecureTokenStore
 * - Token caching and persistence
 * - Token expiry calculation with JWT exp claim
 *
 * @see /workspaces/rhythm-chamber/js/spotify/token-store.js
 * @module tests/unit/spotify/token-store
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TokenStore } from '../../../js/spotify/token-store.js';

// Mock SecureTokenStore
const mockSecureTokenStore = {
    isAvailable: vi.fn(() => true),
    store: vi.fn(() => Promise.resolve(true)),
    retrieve: vi.fn(() => Promise.resolve(null)),
    retrieveWithOptions: vi.fn(() => Promise.resolve(null)),
    invalidate: vi.fn(() => Promise.resolve()),
};

vi.mock('../../../js/security/secure-token-store.js', () => ({
    SecureTokenStore: mockSecureTokenStore,
}));

describe('TokenStore - Token Persistence', () => {
    beforeEach(() => {
        // Clear static private fields by recreating class
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('persistTokens', () => {
        it('should persist access token to secure storage', async () => {
            const tokenData = {
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token',
                expires_in: 3600,
            };

            await TokenStore.persistTokens(tokenData);

            expect(mockSecureTokenStore.store).toHaveBeenCalledWith(
                'spotify_access_token',
                'test-access-token',
                expect.objectContaining({
                    expiresIn: 3600000, // 3600 seconds in ms
                    metadata: { source: 'spotify_oauth' },
                })
            );
        });

        it('should persist refresh token to secure storage', async () => {
            const tokenData = {
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token',
                expires_in: 3600,
            };

            await TokenStore.persistTokens(tokenData);

            expect(mockSecureTokenStore.store).toHaveBeenCalledWith(
                'spotify_refresh_token',
                'test-refresh-token',
                expect.objectContaining({
                    metadata: { source: 'spotify_oauth' },
                })
            );
        });

        it('should throw when secure store is unavailable', async () => {
            mockSecureTokenStore.isAvailable.mockReturnValue(false);

            const tokenData = {
                access_token: 'test-access-token',
                expires_in: 3600,
            };

            await expect(TokenStore.persistTokens(tokenData)).rejects.toThrow(
                'Secure token vault unavailable'
            );
        });

        it('should throw when access token storage fails', async () => {
            mockSecureTokenStore.store.mockResolvedValueOnce(false);

            const tokenData = {
                access_token: 'test-access-token',
                expires_in: 3600,
            };

            await expect(TokenStore.persistTokens(tokenData)).rejects.toThrow(
                'Failed to store Spotify access token securely'
            );
        });

        it('should throw when refresh token storage fails', async () => {
            mockSecureTokenStore.store
                .mockResolvedValueOnce(true) // access token succeeds
                .mockResolvedValueOnce(false); // refresh token fails

            const tokenData = {
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token',
                expires_in: 3600,
            };

            await expect(TokenStore.persistTokens(tokenData)).rejects.toThrow(
                'Failed to store Spotify refresh token securely'
            );
        });

        it('should cache tokens in memory', async () => {
            const tokenData = {
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token',
                expires_in: 3600,
            };

            mockSecureTokenStore.store.mockResolvedValue(true);

            await TokenStore.persistTokens(tokenData);

            // Verify tokens are cached by checking if subsequent calls hit secure store
            mockSecureTokenStore.retrieveWithOptions.mockResolvedValue({
                value: 'cached-token',
                expiresIn: 3600000,
            });

            const { token } = await TokenStore.loadAccessToken();

            // Should return cached token without calling secure store
            expect(token).toBe('test-access-token');
        });
    });

    describe('JWT Token Expiration Validation', () => {
        it('should extract exp claim from JWT token', async () => {
            // Create a mock JWT with exp claim
            const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
            const payload = btoa(
                JSON.stringify({
                    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
                })
            );
            const signature = 'test-signature';

            const jwtToken = `${header}.${payload}.${signature}`;

            const tokenData = {
                access_token: jwtToken,
                expires_in: 3600,
            };

            mockSecureTokenStore.store.mockResolvedValue(true);

            await TokenStore.persistTokens(tokenData);

            // Verify expiry was calculated from JWT exp claim
            const { expiry } = await TokenStore.loadAccessToken();

            // Expiry should be close to the JWT exp claim (within 1 second)
            const expectedExpiry = payload.exp * 1000;
            expect(Math.abs(expiry - expectedExpiry)).toBeLessThan(1000);
        });

        it('should fall back to calculated expiry when JWT parsing fails', async () => {
            const tokenData = {
                access_token: 'not-a-valid-jwt',
                expires_in: 3600,
            };

            mockSecureTokenStore.store.mockResolvedValue(true);

            await TokenStore.persistTokens(tokenData);

            const { expiry } = await TokenStore.loadAccessToken();

            // Should use calculated expiry (now + expires_in)
            const now = Date.now();
            expect(expiry).toBeGreaterThan(now);
            expect(expiry).toBeLessThanOrEqual(now + 3700 * 1000); // Allow some margin
        });

        it('should handle JWT with missing exp claim', async () => {
            const header = btoa(JSON.stringify({ alg: 'RS256' }));
            const payload = btoa(JSON.stringify({ /* no exp */ }));
            const signature = 'test';

            const jwtToken = `${header}.${payload}.${signature}`;

            const tokenData = {
                access_token: jwtToken,
                expires_in: 1800,
            };

            mockSecureTokenStore.store.mockResolvedValue(true);

            await TokenStore.persistTokens(tokenData);

            // Should fall back to calculated expiry
            const { expiry } = await TokenStore.loadAccessToken();
            expect(expiry).toBeTruthy();
        });

        it('should handle malformed JWT gracefully', async () => {
            const tokenData = {
                access_token: 'invalid.jwt.token',
                expires_in: 3600,
            };

            mockSecureTokenStore.store.mockResolvedValue(true);

            // Should not throw, should fall back to calculated expiry
            await expect(
                TokenStore.persistTokens(tokenData)
            ).resolves.not.toThrow();
        });

        it('should prefer JWT exp claim over expires_in for reliability', async () => {
            // Create JWT with exp claim that differs from expires_in
            const header = btoa(JSON.stringify({ alg: 'RS256' }));
            const jwtExpiry = Math.floor(Date.now() / 1000) + 7200; // 2 hours
            const payload = btoa(JSON.stringify({ exp: jwtExpiry }));
            const signature = 'test';

            const jwtToken = `${header}.${payload}.${signature}`;

            const tokenData = {
                access_token: jwtToken,
                expires_in: 3600, // 1 hour (different from JWT)
            };

            mockSecureTokenStore.store.mockResolvedValue(true);

            await TokenStore.persistTokens(tokenData);

            const { expiry } = await TokenStore.loadAccessToken();

            // Should use JWT exp claim (2 hours) not expires_in (1 hour)
            const expectedExpiry = jwtExpiry * 1000;
            expect(Math.abs(expiry - expectedExpiry)).toBeLessThan(1000);
        });

        it('should handle base64url padding correctly', async () => {
            // JWT with padding
            const header = btoa(JSON.stringify({ alg: 'RS256' }))
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, '');
            const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, '');
            const signature = 'test-signature';

            const jwtToken = `${header}.${payload}.${signature}`;

            const tokenData = {
                access_token: jwtToken,
                expires_in: 3600,
            };

            mockSecureTokenStore.store.mockResolvedValue(true);

            // Should handle base64url decoding correctly
            await expect(
                TokenStore.persistTokens(tokenData)
            ).resolves.not.toThrow();
        });
    });

    describe('loadAccessToken', () => {
        it('should return cached token if still valid', async () => {
            // First, persist a token
            const tokenData = {
                access_token: 'cached-token',
                expires_in: 3600,
            };

            mockSecureTokenStore.store.mockResolvedValue(true);
            await TokenStore.persistTokens(tokenData);

            // Now load it - should use cache
            const { token } = await TokenStore.loadAccessToken();

            expect(token).toBe('cached-token');
            expect(mockSecureTokenStore.retrieveWithOptions).not.toHaveBeenCalled();
        });

        it('should load from secure storage if cache is expired', async () => {
            // This test assumes cache was cleared or expired
            mockSecureTokenStore.retrieveWithOptions.mockResolvedValue({
                value: 'stored-token',
                expiresIn: 3600000,
            });

            const { token } = await TokenStore.loadAccessToken();

            expect(token).toBe('stored-token');
            expect(mockSecureTokenStore.retrieveWithOptions).toHaveBeenCalledWith(
                'spotify_access_token'
            );
        });

        it('should return null token when secure store is unavailable', async () => {
            mockSecureTokenStore.retrieveWithOptions = null;

            const { token, expiry } = await TokenStore.loadAccessToken();

            expect(token).toBeNull();
            expect(expiry).toBeNull();
        });

        it('should handle secure store retrieval errors', async () => {
            mockSecureTokenStore.retrieveWithOptions.mockImplementation(() => {
                throw new Error('Storage error');
            });

            const { token, expiry } = await TokenStore.loadAccessToken();

            expect(token).toBeNull();
        });
    });

    describe('loadRefreshToken', () => {
        it('should return cached refresh token', async () => {
            // Persist tokens first
            const tokenData = {
                access_token: 'access',
                refresh_token: 'cached-refresh',
                expires_in: 3600,
            };

            mockSecureTokenStore.store.mockResolvedValue(true);
            await TokenStore.persistTokens(tokenData);

            const token = await TokenStore.loadRefreshToken();

            expect(token).toBe('cached-refresh');
            expect(mockSecureTokenStore.retrieve).not.toHaveBeenCalled();
        });

        it('should load from secure storage if not cached', async () => {
            mockSecureTokenStore.retrieve.mockResolvedValue('stored-refresh-token');

            const token = await TokenStore.loadRefreshToken();

            expect(token).toBe('stored-refresh-token');
            expect(mockSecureTokenStore.retrieve).toHaveBeenCalledWith(
                'spotify_refresh_token'
            );
        });

        it('should return null when secure store is unavailable', async () => {
            mockSecureTokenStore.retrieve = null;

            const token = await TokenStore.loadRefreshToken();

            expect(token).toBeNull();
        });

        it('should handle retrieval errors gracefully', async () => {
            mockSecureTokenStore.retrieve.mockImplementation(() => {
                throw new Error('Storage error');
            });

            const token = await TokenStore.loadRefreshToken();

            expect(token).toBeNull();
        });
    });

    describe('hasValidToken', () => {
        it('should return true for valid non-expired token', async () => {
            const tokenData = {
                access_token: 'valid-token',
                expires_in: 3600,
            };

            mockSecureTokenStore.store.mockResolvedValue(true);
            await TokenStore.persistTokens(tokenData);

            const hasValid = await TokenStore.hasValidToken();

            expect(hasValid).toBe(true);
        });

        it('should return false for expired token', async () => {
            const tokenData = {
                access_token: 'expired-token',
                expires_in: -100, // Already expired
            };

            mockSecureTokenStore.store.mockResolvedValue(true);
            await TokenStore.persistTokens(tokenData);

            const hasValid = await TokenStore.hasValidToken();

            expect(hasValid).toBe(false);
        });

        it('should return false when no token exists', async () => {
            const hasValid = await TokenStore.hasValidToken();

            expect(hasValid).toBe(false);
        });

        it('should use 5 minute buffer for expiry check', async () => {
            // Token expiring in 4 minutes (within buffer)
            const tokenData = {
                access_token: 'expiring-soon-token',
                expires_in: 240, // 4 minutes
            };

            mockSecureTokenStore.store.mockResolvedValue(true);
            await TokenStore.persistTokens(tokenData);

            const hasValid = await TokenStore.hasValidToken();

            // Should be invalid due to buffer
            expect(hasValid).toBe(false);
        });

        it('should return true for token expiring in 6 minutes (outside buffer)', async () => {
            const tokenData = {
                access_token: 'valid-token',
                expires_in: 360, // 6 minutes
            };

            mockSecureTokenStore.store.mockResolvedValue(true);
            await TokenStore.persistTokens(tokenData);

            const hasValid = await TokenStore.hasValidToken();

            expect(hasValid).toBe(true);
        });
    });

    describe('canRefreshToken', () => {
        it('should return true when refresh token exists', async () => {
            const tokenData = {
                access_token: 'access',
                refresh_token: 'refresh',
                expires_in: 3600,
            };

            mockSecureTokenStore.store.mockResolvedValue(true);
            await TokenStore.persistTokens(tokenData);

            const canRefresh = await TokenStore.canRefreshToken();

            expect(canRefresh).toBe(true);
        });

        it('should return false when no refresh token', async () => {
            const canRefresh = await TokenStore.canRefreshToken();

            expect(canRefresh).toBe(false);
        });
    });

    describe('getAccessToken', () => {
        it('should return current access token', async () => {
            const tokenData = {
                access_token: 'current-token',
                expires_in: 3600,
            };

            mockSecureTokenStore.store.mockResolvedValue(true);
            await TokenStore.persistTokens(tokenData);

            const token = await TokenStore.getAccessToken();

            expect(token).toBe('current-token');
        });

        it('should return null when no token', async () => {
            const token = await TokenStore.getAccessToken();

            expect(token).toBeNull();
        });
    });

    describe('clearTokens', () => {
        it('should clear all tokens from secure storage', async () => {
            // Set up some tokens
            const tokenData = {
                access_token: 'access',
                refresh_token: 'refresh',
                expires_in: 3600,
            };

            mockSecureTokenStore.store.mockResolvedValue(true);
            await TokenStore.persistTokens(tokenData);

            // Clear them
            await TokenStore.clearTokens();

            // Verify secure store was called
            expect(mockSecureTokenStore.invalidate).toHaveBeenCalledWith(
                'spotify_access_token'
            );
            expect(mockSecureTokenStore.invalidate).toHaveBeenCalledWith(
                'spotify_refresh_token'
            );
        });

        it('should clear tokens from localStorage', async () => {
            localStorage.setItem('spotify_access_token', 'test');
            localStorage.setItem('spotify_refresh_token', 'test');
            localStorage.setItem('spotify_token_expiry', 'test');

            await TokenStore.clearTokens();

            expect(localStorage.getItem('spotify_access_token')).toBeNull();
            expect(localStorage.getItem('spotify_refresh_token')).toBeNull();
            expect(localStorage.getItem('spotify_token_expiry')).toBeNull();
        });

        it('should clear tokens from sessionStorage', async () => {
            sessionStorage.setItem('spotify_access_token', 'test');
            sessionStorage.setItem('spotify_refresh_token', 'test');
            sessionStorage.setItem('spotify_token_expiry', 'test');

            await TokenStore.clearTokens();

            expect(sessionStorage.getItem('spotify_access_token')).toBeNull();
            expect(sessionStorage.getItem('spotify_refresh_token')).toBeNull();
            expect(sessionStorage.getItem('spotify_token_expiry')).toBeNull();
        });

        it('should handle secure store unavailability', async () => {
            mockSecureTokenStore.invalidate = null;

            // Should not throw
            await expect(TokenStore.clearTokens()).resolves.not.toThrow();
        });

        it('should clear in-memory cache', async () => {
            const tokenData = {
                access_token: 'cached',
                refresh_token: 'refresh',
                expires_in: 3600,
            };

            mockSecureTokenStore.store.mockResolvedValue(true);
            await TokenStore.persistTokens(tokenData);

            // Clear tokens
            await TokenStore.clearTokens();

            // Try to get token - should be null
            const token = await TokenStore.getAccessToken();

            expect(token).toBeNull();
        });
    });

    describe('getTokenExpiry', () => {
        it('should return token expiry timestamp', async () => {
            const tokenData = {
                access_token: 'token',
                expires_in: 3600,
            };

            mockSecureTokenStore.store.mockResolvedValue(true);
            await TokenStore.persistTokens(tokenData);

            const expiry = await TokenStore.getTokenExpiry();

            expect(expiry).toBeTruthy();
            expect(expiry).toBeGreaterThan(Date.now());
        });

        it('should return null when no token', async () => {
            const expiry = await TokenStore.getTokenExpiry();

            expect(expiry).toBeNull();
        });
    });

    describe('ensureValidToken', () => {
        it('should return true for valid token', async () => {
            const tokenData = {
                access_token: 'valid-token',
                expires_in: 3600,
            };

            mockSecureTokenStore.store.mockResolvedValue(true);
            await TokenStore.persistTokens(tokenData);

            const isValid = await TokenStore.ensureValidToken();

            expect(isValid).toBe(true);
        });

        it('should return false for expired token', async () => {
            const tokenData = {
                access_token: 'expired-token',
                expires_in: -100,
            };

            mockSecureTokenStore.store.mockResolvedValue(true);
            await TokenStore.persistTokens(tokenData);

            const isValid = await TokenStore.ensureValidToken();

            expect(isValid).toBe(false);
        });

        it('should return false when no token exists', async () => {
            const isValid = await TokenStore.ensureValidToken();

            expect(isValid).toBe(false);
        });
    });
});
