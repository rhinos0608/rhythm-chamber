/**
 * Premium Quota Service Tests
 *
 * Tests for playlist quota tracking, premium gating, and usage limits.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PremiumQuota } from '../../js/services/premium-quota.js';
import { ConfigLoader } from '../../js/services/config-loader.js';

// Mock ConfigLoader
vi.mock('../../js/services/config-loader.js', () => ({
    ConfigLoader: {
        get: vi.fn((key, defaultValue) => {
            // By default, return the default value (not production, not testing quota limits)
            return defaultValue;
        })
    }
}));

describe('PremiumQuota Service', () => {
    beforeEach(() => {
        // Clear localStorage before each test
        if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
            localStorage.clear();
        }
        // Reset internal cache
        PremiumQuota.resetQuota?.();
    });

    afterEach(() => {
        // Clean up after each test
        if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
            localStorage.clear();
        }
    });

    describe('QUOTA_LIMITS', () => {
        it('should have playlist_generation limit defined', () => {
            expect(PremiumQuota.QUOTA_LIMITS).toBeDefined();
            expect(PremiumQuota.QUOTA_LIMITS.playlist_generation).toBe(1);
        });
    });

    describe('canCreatePlaylist', () => {
        it('should allow playlist creation for MVP users', async () => {
            const result = await PremiumQuota.canCreatePlaylist();
            expect(result.allowed).toBe(true);
            // In MVP mode, everyone has unlimited (Infinity)
            expect(result.remaining).toBe(Infinity);
            expect(result.reason).toBeNull();
        });

        it('should track playlist usage count via setPlaylistCount', async () => {
            await PremiumQuota.resetQuota();

            // Use setPlaylistCount to directly set the count
            await PremiumQuota.setPlaylistCount(2);

            // Check that usage was tracked
            const status = await PremiumQuota.getQuotaStatus();
            expect(status.playlists.used).toBe(2);
        });
    });

    describe('recordPlaylistCreation', () => {
        it('should not track for MVP premium users', async () => {
            // Reset to known state
            await PremiumQuota.resetQuota();

            const initialStatus = await PremiumQuota.getQuotaStatus();
            const initialUsed = initialStatus.playlists.used;

            await PremiumQuota.recordPlaylistCreation();

            const newStatus = await PremiumQuota.getQuotaStatus();
            // In MVP mode, premium users don't have usage tracked
            expect(newStatus.playlists.used).toBe(initialUsed);
        });

        it('should return Infinity for MVP premium users', async () => {
            await PremiumQuota.resetQuota();

            const remaining = await PremiumQuota.recordPlaylistCreation();
            // In MVP mode, premium users have Infinity remaining
            expect(remaining).toBe(Infinity);
        });
    });

    describe('getQuotaStatus', () => {
        it('should return quota status for MVP users (unlimited by default)', async () => {
            await PremiumQuota.resetQuota();

            const status = await PremiumQuota.getQuotaStatus();
            // In MVP mode, everyone is premium by default
            expect(status.isPremium).toBe(true);
            expect(status.playlists.used).toBeGreaterThanOrEqual(0);
            // Premium users have Infinity limit
            expect(status.playlists.limit).toBe(Infinity);
        });

        it('should return correct remaining count', async () => {
            await PremiumQuota.resetQuota();
            let status = await PremiumQuota.getQuotaStatus();
            // In MVP mode, remaining is Infinity for premium users
            expect(status.playlists.remaining).toBe(Infinity);

            await PremiumQuota.setPlaylistCount(1);
            status = await PremiumQuota.getQuotaStatus();
            // Still Infinity because premium users have unlimited
            expect(status.playlists.remaining).toBe(Infinity);
        });
    });

    describe('resetQuota', () => {
        it('should reset quota to zero', async () => {
            await PremiumQuota.setPlaylistCount(1);
            await PremiumQuota.resetQuota();

            const status = await PremiumQuota.getQuotaStatus();
            expect(status.playlists.used).toBe(0);
        });
    });

    describe('setPlaylistCount', () => {
        it('should set playlist count to specific value', async () => {
            await PremiumQuota.setPlaylistCount(5);

            const status = await PremiumQuota.getQuotaStatus();
            expect(status.playlists.used).toBe(5);
        });

        it('should not allow negative values', async () => {
            await PremiumQuota.setPlaylistCount(-5);

            const status = await PremiumQuota.getQuotaStatus();
            expect(status.playlists.used).toBe(0);
        });
    });

    describe('Persistence', () => {
        it('should persist quota data to localStorage', async () => {
            await PremiumQuota.setPlaylistCount(3);

            const stored = localStorage.getItem('rhythm_chamber_quota');
            expect(stored).toBeDefined();

            const parsed = JSON.parse(stored);
            expect(parsed.playlists).toBe(3);
        });

        it('should store and retrieve quota data', async () => {
            // Clean slate
            await PremiumQuota.setPlaylistCount(0);

            // Set value
            await PremiumQuota.setPlaylistCount(5);

            // Verify through the API (which uses cache)
            const status = await PremiumQuota.getQuotaStatus();
            expect(status.playlists.used).toBe(5);
        });
    });
});
