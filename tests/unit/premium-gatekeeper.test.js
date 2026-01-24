/**
 * Premium Gatekeeper Service Tests
 *
 * Tests for unified feature access control consolidating
 * license verification and quota checking.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PremiumGatekeeper } from '../../js/services/premium-gatekeeper.js';

// Mock dependencies
vi.mock('../../js/services/license-service.js', () => ({
    LicenseService: {
        verifyStoredLicense: vi.fn(),
        getStoredLicense: vi.fn()
    }
}));

vi.mock('../../js/services/premium-quota.js', () => ({
    PremiumQuota: {
        canCreatePlaylist: vi.fn()
    }
}));

import { LicenseService } from '../../js/services/license-service.js';
import { PremiumQuota } from '../../js/services/premium-quota.js';

describe('PremiumGatekeeper', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('checkFeature for license-required features', () => {
        it('returns allowed=true for premium user with valid license', async () => {
            LicenseService.verifyStoredLicense.mockResolvedValue({
                valid: true,
                tier: 'chamber',
                license: { tier: 'chamber' }
            });

            const result = await PremiumGatekeeper.checkFeature('semantic_search');

            expect(result.allowed).toBe(true);
            expect(result.tier).toBe('chamber');
            expect(result.reason).toBeNull();
        });

        it('returns allowed=false with NO_LICENSE reason', async () => {
            LicenseService.verifyStoredLicense.mockResolvedValue({
                valid: false,
                error: 'NO_LICENSE'
            });

            const result = await PremiumGatekeeper.checkFeature('semantic_search');

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('NO_LICENSE');
        });
    });

    describe('checkFeature for quota features', () => {
        it('checks quota for unlimited_playlists', async () => {
            LicenseService.verifyStoredLicense.mockResolvedValue({ valid: false });
            LicenseService.getStoredLicense.mockReturnValue(null);
            PremiumQuota.canCreatePlaylist.mockResolvedValue({
                allowed: false,
                remaining: 0
            });

            const result = await PremiumGatekeeper.checkFeature('unlimited_playlists');

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('QUOTA_EXCEEDED');
            expect(result.quotaRemaining).toBe(0);
        });

        it('allows when quota available', async () => {
            LicenseService.verifyStoredLicense.mockResolvedValue({ valid: false });
            LicenseService.getStoredLicense.mockReturnValue(null);
            PremiumQuota.canCreatePlaylist.mockResolvedValue({
                allowed: true,
                remaining: 1
            });

            const result = await PremiumGatekeeper.checkFeature('unlimited_playlists');

            expect(result.allowed).toBe(true);
        });
    });

    describe('checkFeature for unknown features', () => {
        it('returns FEATURE_NOT_FOUND for unknown feature', async () => {
            const result = await PremiumGatekeeper.checkFeature('unknown_feature');

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('FEATURE_NOT_FOUND');
        });
    });

    describe('getFeatures', () => {
        it('returns all registered features', () => {
            const features = PremiumGatekeeper.getFeatures();

            expect(features).toHaveProperty('unlimited_playlists');
            expect(features).toHaveProperty('semantic_search');
            expect(features).toHaveProperty('personality_insights');
            expect(features).toHaveProperty('export_advanced');
        });
    });
});
