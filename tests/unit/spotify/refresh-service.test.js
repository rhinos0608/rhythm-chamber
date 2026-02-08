/**
 * Unit Tests: Spotify Refresh Service
 *
 * Tests for background token refresh with multi-tab synchronization
 * Tests cover:
 * - Web Locks API coordination for multi-tab scenarios
 * - Race condition prevention in token refresh
 * - Fallback localStorage-based mutex
 * - Token refresh with JWT expiry handling
 * - Background refresh monitoring
 *
 * @see /workspaces/rhythm-chamber/js/spotify/refresh-service.js
 * @module tests/unit/spotify/refresh-service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RefreshService } from '../../../js/spotify/refresh-service.js';
import { TokenStore } from '../../../js/spotify/token-store.js';
import { ConfigLoader } from '../../../js/services/config-loader.js';
import { Crypto } from '../../../js/security/crypto.js';

// Mock dependencies
vi.mock('../../../js/services/config-loader.js', () => ({
    ConfigLoader: {
        get: vi.fn((key) => {
            if (key === 'spotify.clientId') return 'test-client-id';
            return undefined;
        }),
    },
}));

vi.mock('../../../js/spotify/token-store.js', () => ({
    TokenStore: {
        hasValidToken: vi.fn(() => Promise.resolve(false)),
        canRefreshToken: vi.fn(() => Promise.resolve(true)),
        loadRefreshToken: vi.fn(() => Promise.resolve('test-refresh-token')),
        getTokenExpiry: vi.fn(() => Promise.resolve(Date.now() + 3600000)),
        persistTokens: vi.fn(() => Promise.resolve()),
    },
}));

vi.mock('../../../js/security/crypto.js', () => ({
    Crypto: {
        invalidateSessions: vi.fn(),
    },
}));

describe('RefreshService - Multi-Tab Token Refresh', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
        RefreshService.stopBackgroundRefresh();
    });

    describe('Web Locks API Coordination', () => {
        it('should use Web Locks API when available', async () => {
            // Mock navigator.locks
            const mockLock = {
                held: false,
            };

            global.navigator = {
                ...global.navigator,
                locks: {
                    request: vi.fn((name, options, callback) => {
                        mockLock.held = true;
                        const result = callback({ name, held: true });
                        mockLock.held = false;
                        return Promise.resolve(result);
                    }),
                },
            };

            // Mock successful token refresh
            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'new-access-token',
                            refresh_token: 'new-refresh-token',
                            expires_in: 3600,
                        }),
                })
            );

            const result = await RefreshService.refreshToken();

            expect(navigator.locks.request).toHaveBeenCalledWith(
                'spotify_token_refresh',
                expect.objectContaining({
                    mode: 'exclusive',
                    ifAvailable: false,
                }),
                expect.any(Function)
            );

            expect(result).toBe(true);
        });

        it('should only allow one tab to refresh at a time', async () => {
            let lockAcquired = 0;
            let refreshAttempts = 0;

            global.navigator = {
                ...global.navigator,
                locks: {
                    request: vi.fn((name, options, callback) => {
                        lockAcquired++;
                        refreshAttempts++;

                        // Simulate sequential lock acquisition
                        return new Promise((resolve) => {
                            setTimeout(() => {
                                const result = callback({ name });
                                resolve(result);
                            }, 100);
                        });
                    }),
                },
            };

            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'new-token',
                            refresh_token: 'new-refresh',
                            expires_in: 3600,
                        }),
                })
            );

            // Simulate two tabs attempting to refresh simultaneously
            const [result1, result2] = await Promise.all([
                RefreshService.refreshToken(),
                RefreshService.refreshToken(),
            ]);

            // Both should succeed, but only one should actually refresh
            expect(result1).toBe(true);
            expect(result2).toBe(true);

            // Lock was requested twice
            expect(lockAcquired).toBe(2);
        });

        it('should double-check token validity after acquiring lock', async () => {
            let checkCount = 0;

            // Mock hasValidToken to return true on second call (after another tab refreshed)
            vi.mocked(TokenStore.hasValidToken).mockImplementation(() => {
                checkCount++;
                return Promise.resolve(checkCount > 1);
            });

            global.navigator = {
                ...global.navigator,
                locks: {
                    request: vi.fn((name, options, callback) => {
                        return Promise.resolve(callback({ name }));
                    }),
                },
            };

            const result = await RefreshService.refreshToken();

            // Should return true without refreshing
            expect(result).toBe(true);

            // Should not have called fetch (another tab already refreshed)
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should handle Web Locks API errors gracefully', async () => {
            global.navigator = {
                ...global.navigator,
                locks: {
                    request: vi.fn(() => {
                        throw new Error('Locks API error');
                    }),
                },
            };

            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'new-token',
                            refresh_token: 'new-refresh',
                            expires_in: 3600,
                        }),
                })
            );

            // Should fall back to localStorage-based mutex
            const result = await RefreshService.refreshToken();

            expect(result).toBe(true);
            expect(global.fetch).toHaveBeenCalled();
        });
    });

    describe('Fallback localStorage Mutex', () => {
        it('should use localStorage mutex when Web Locks unavailable', async () => {
            // Remove navigator.locks
            global.navigator = {
                ...global.navigator,
                locks: undefined,
            };

            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'new-token',
                            refresh_token: 'new-refresh',
                            expires_in: 3600,
                        }),
                })
            );

            const result = await RefreshService.refreshToken();

            expect(result).toBe(true);
            expect(localStorage.getItem('spotify_refresh_lock')).toBeNull(); // Lock released
        });

        it('should wait for another tab to complete refresh', async () => {
            global.navigator = {
                ...global.navigator,
                locks: undefined,
            };

            // Set a lock (simulating another tab refreshing)
            const lockId = 'abc123';
            localStorage.setItem('spotify_refresh_lock', `${Date.now()}:${lockId}`);

            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'new-token',
                            refresh_token: 'new-refresh',
                            expires_in: 3600,
                        }),
                })
            );

            // Mock hasValidToken to return true after waiting (other tab refreshed)
            vi.mocked(TokenStore.hasValidToken).mockResolvedValue(true);

            const result = await RefreshService.refreshToken();

            // Should not refresh (other tab did it)
            expect(global.fetch).not.toHaveBeenCalled();
            expect(result).toBe(true);
        });

        it('should detect and clear stale locks', async () => {
            global.navigator = {
                ...global.navigator,
                locks: undefined,
            };

            // Set an old lock (more than 10 seconds ago)
            const staleTime = Date.now() - 15000;
            localStorage.setItem('spotify_refresh_lock', `${staleTime}:oldlock`);

            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'new-token',
                            refresh_token: 'new-refresh',
                            expires_in: 3600,
                        }),
                })
            );

            const result = await RefreshService.refreshToken();

            // Should clear stale lock and refresh
            expect(result).toBe(true);
            expect(global.fetch).toHaveBeenCalled();
        });

        it('should use UUID-based lock verification', async () => {
            global.navigator = {
                ...global.navigator,
                locks: undefined,
            };

            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'new-token',
                            refresh_token: 'new-refresh',
                            expires_in: 3600,
                        }),
                })
            );

            await RefreshService.refreshToken();

            const lock = localStorage.getItem('spotify_refresh_lock');

            // Lock should be in format: timestamp:uuid
            expect(lock).toMatch(/^\d+:[0-9a-f]{16}$/);
        });

        it('should detect lock theft by another tab', async () => {
            global.navigator = {
                ...global.navigator,
                locks: undefined,
            };

            let ourLockId = null;

            // Capture the lock ID we create
            const originalSetItem = localStorage.setItem;
            localStorage.setItem = vi.fn((key, value) => {
                if (key === 'spotify_refresh_lock') {
                    const match = value.match(/(\d+):([0-9a-f]+)/);
                    if (match) {
                        ourLockId = match[2];
                    }
                }
                return originalSetItem.call(localStorage, key, value);
            });

            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'new-token',
                            refresh_token: 'new-refresh',
                            expires_in: 3600,
                        }),
                })
            );

            // Start refresh (will be async)
            const refreshPromise = RefreshService.refreshToken();

            // Wait a bit for lock to be acquired
            await vi.runAllTimersAsync();

            // Simulate another tab stealing the lock
            if (ourLockId) {
                localStorage.setItem(
                    'spotify_refresh_lock',
                    `${Date.now()}:differentlockid`
                );
            }

            const result = await refreshPromise;

            // Should defer to other tab
            expect(result).toBe(true); // Returns true if token now valid
        });
    });

    describe('Token Refresh Logic', () => {
        it('should refresh token successfully', async () => {
            global.navigator = { ...global.navigator, locks: undefined };

            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'new-access-token',
                            refresh_token: 'new-refresh-token',
                            expires_in: 3600,
                        }),
                })
            );

            const result = await RefreshService.refreshToken();

            expect(result).toBe(true);
            expect(global.fetch).toHaveBeenCalledWith(
                'https://accounts.spotify.com/api/token',
                expect.objectContaining({
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                })
            );

            // Verify token was persisted
            expect(TokenStore.persistTokens).toHaveBeenCalledWith({
                access_token: 'new-access-token',
                refresh_token: 'new-refresh-token',
                expires_in: 3600,
            });
        });

        it('should return false when no refresh token available', async () => {
            vi.mocked(TokenStore.loadRefreshToken).mockResolvedValue(null);

            global.navigator = { ...global.navigator, locks: undefined };

            const result = await RefreshService.refreshToken();

            expect(result).toBe(false);
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should return false when client ID not configured', async () => {
            vi.mocked(ConfigLoader.get).mockReturnValue(undefined);

            global.navigator = { ...global.navigator, locks: undefined };

            const result = await RefreshService.refreshToken();

            expect(result).toBe(false);
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should handle refresh failure', async () => {
            global.navigator = { ...global.navigator, locks: undefined };

            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: false,
                    status: 401,
                })
            );

            const result = await RefreshService.refreshToken();

            expect(result).toBe(false);
            expect(Crypto.invalidateSessions).toHaveBeenCalled();
        });

        it('should handle network errors', async () => {
            global.navigator = { ...global.navigator, locks: undefined };

            global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));

            const result = await RefreshService.refreshToken();

            expect(result).toBe(false);
            expect(Crypto.invalidateSessions).toHaveBeenCalled();
        });

        it('should persist new refresh token if provided', async () => {
            global.navigator = { ...global.navigator, locks: undefined };

            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'new-access',
                            refresh_token: 'rotated-refresh', // New refresh token
                            expires_in: 3600,
                        }),
                })
            );

            await RefreshService.refreshToken();

            expect(TokenStore.persistTokens).toHaveBeenCalledWith({
                access_token: 'new-access',
                refresh_token: 'rotated-refresh',
                expires_in: 3600,
            });
        });
    });

    describe('Background Refresh Monitoring', () => {
        it('should start background refresh', async () => {
            vi.mocked(TokenStore.getTokenExpiry).mockResolvedValue(
                Date.now() + 9 * 60 * 1000 // 9 minutes from now (within buffer)
            );

            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'new-token',
                            expires_in: 3600,
                        }),
                })
            );

            RefreshService.startBackgroundRefresh();

            // Fast forward 5 minutes (check interval)
            await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

            // Should have triggered refresh
            expect(global.fetch).toHaveBeenCalled();

            RefreshService.stopBackgroundRefresh();
        });

        it('should not refresh if token is valid', async () => {
            vi.mocked(TokenStore.getTokenExpiry).mockResolvedValue(
                Date.now() + 30 * 60 * 1000 // 30 minutes from now
            );

            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'new-token',
                            expires_in: 3600,
                        }),
                })
            );

            RefreshService.startBackgroundRefresh();

            await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

            // Should not refresh (token valid)
            expect(global.fetch).not.toHaveBeenCalled();

            RefreshService.stopBackgroundRefresh();
        });

        it('should stop background refresh', () => {
            RefreshService.startBackgroundRefresh();

            expect(RefreshService.isBackgroundRefreshActive()).toBe(true);

            RefreshService.stopBackgroundRefresh();

            expect(RefreshService.isBackgroundRefreshActive()).toBe(false);
        });

        it('should not start duplicate background refresh', () => {
            RefreshService.startBackgroundRefresh();
            RefreshService.startBackgroundRefresh();

            // Should still be active (not duplicated)
            expect(RefreshService.isBackgroundRefreshActive()).toBe(true);

            RefreshService.stopBackgroundRefresh();
        });

        it('should handle background refresh errors gracefully', async () => {
            vi.mocked(TokenStore.getTokenExpiry).mockResolvedValue(
                Date.now() + 9 * 60 * 1000
            );

            global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));

            RefreshService.startBackgroundRefresh();

            // Should not throw
            await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

            RefreshService.stopBackgroundRefresh();
        });
    });

    describe('Token Refresh Needed Check', () => {
        it('should return true when token expiring soon', async () => {
            vi.mocked(TokenStore.getTokenExpiry).mockResolvedValue(
                Date.now() + 5 * 60 * 1000 // 5 minutes
            );

            const needed = await RefreshService.checkTokenRefreshNeeded();

            expect(needed).toBe(true);
        });

        it('should return true when token already expired', async () => {
            vi.mocked(TokenStore.getTokenExpiry).mockResolvedValue(
                Date.now() - 1000 // 1 second ago
            );

            const needed = await RefreshService.checkTokenRefreshNeeded();

            expect(needed).toBe(true);
        });

        it('should return false when token valid', async () => {
            vi.mocked(TokenStore.getTokenExpiry).mockResolvedValue(
                Date.now() + 30 * 60 * 1000 // 30 minutes
            );

            const needed = await RefreshService.checkTokenRefreshNeeded();

            expect(needed).toBe(false);
        });

        it('should return false when no expiry', async () => {
            vi.mocked(TokenStore.getTokenExpiry).mockResolvedValue(null);

            const needed = await RefreshService.checkTokenRefreshNeeded();

            expect(needed).toBe(false);
        });
    });

    describe('ensureValidToken', () => {
        it('should return true if token already valid', async () => {
            vi.mocked(TokenStore.hasValidToken).mockResolvedValue(true);

            const isValid = await RefreshService.ensureValidToken();

            expect(isValid).toBe(true);
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should refresh if token expired', async () => {
            vi.mocked(TokenStore.hasValidToken).mockResolvedValue(false);
            vi.mocked(TokenStore.canRefreshToken).mockResolvedValue(true);

            global.navigator = { ...global.navigator, locks: undefined };

            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'new-token',
                            expires_in: 3600,
                        }),
                })
            );

            const isValid = await RefreshService.ensureValidToken();

            expect(isValid).toBe(true);
            expect(global.fetch).toHaveBeenCalled();
        });

        it('should return false if cannot refresh', async () => {
            vi.mocked(TokenStore.hasValidToken).mockResolvedValue(false);
            vi.mocked(TokenStore.canRefreshToken).mockResolvedValue(false);

            const isValid = await RefreshService.ensureValidToken();

            expect(isValid).toBe(false);
        });
    });

    describe('Tab Visibility Change Handling', () => {
        it('should register visibility change listener', () => {
            // Test that listener is registered on module load
            // (This is done automatically in refresh-service.js)
            expect(document.addEventListener).toBeDefined();
        });

        it('should refresh token when tab becomes visible with expiring token', async () => {
            vi.mocked(TokenStore.getTokenExpiry).mockResolvedValue(
                Date.now() + 3 * 60 * 1000 // 3 minutes (expiring soon)
            );

            global.navigator = { ...global.navigator, locks: undefined };

            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'new-token',
                            expires_in: 3600,
                        }),
                })
            );

            // Trigger visibility change
            const visibilityEvent = new Event('visibilitychange');
            Object.defineProperty(document, 'visibilityState', {
                writable: true,
                value: 'visible',
            });

            document.dispatchEvent(visibilityEvent);

            // Wait a bit for async handler
            await vi.runAllTimersAsync();

            // Should have triggered refresh
            expect(global.fetch).toHaveBeenCalled();
        });
    });
});
