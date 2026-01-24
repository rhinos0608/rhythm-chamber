/**
 * Payments Module Tests
 *
 * Tests for premium access checking via PremiumGatekeeper.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Payments } from '../../js/payments.js';

// Mock dependencies
vi.mock('../../js/services/premium-gatekeeper.js', () => ({
    PremiumGatekeeper: {
        checkFeature: vi.fn()
    }
}));

vi.mock('../../js/services/config-loader.js', () => ({
    ConfigLoader: {
        get: vi.fn((key, defaultValue) => defaultValue)
    }
}));

vi.mock('../../js/security/license-verifier.js', () => ({
    LicenseVerifier: {
        loadLicense: vi.fn(),
        verifyLicense: vi.fn()
    }
}));

import { PremiumGatekeeper } from '../../js/services/premium-gatekeeper.js';
import { ConfigLoader } from '../../js/services/config-loader.js';

describe('Payments with PremiumGatekeeper', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ConfigLoader.get.mockImplementation((key, defaultValue) => defaultValue);
    });

    describe('isPremium', () => {
        it('delegates to PremiumGatekeeper for wildcard check', async () => {
            const mockAccess = { allowed: true, tier: 'chamber' };
            PremiumGatekeeper.checkFeature.mockResolvedValue(mockAccess);

            const result = await Payments.isPremium();

            expect(PremiumGatekeeper.checkFeature).toHaveBeenCalledWith('semantic_search');
            expect(result).toBe(true);
        });

        it('returns false when license not valid', async () => {
            const mockAccess = { allowed: false, tier: 'sovereign' };
            PremiumGatekeeper.checkFeature.mockResolvedValue(mockAccess);

            const result = await Payments.isPremium();

            expect(PremiumGatekeeper.checkFeature).toHaveBeenCalledWith('semantic_search');
            expect(result).toBe(false);
        });

        it('returns false when tier is not chamber', async () => {
            const mockAccess = { allowed: true, tier: 'curator' };
            PremiumGatekeeper.checkFeature.mockResolvedValue(mockAccess);

            const result = await Payments.isPremium();

            expect(result).toBe(false);
        });

        it('returns false on error', async () => {
            PremiumGatekeeper.checkFeature.mockRejectedValue(new Error('Gatekeeper error'));

            const result = await Payments.isPremium();

            expect(result).toBe(false);
        });
    });
});
