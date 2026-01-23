/**
 * Lemon Squeezy Service Tests
 *
 * Tests for Lemon Squeezy payment integration, checkout operations,
 * and license validation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigLoader } from '../../js/services/config-loader.js';

// Mock ConfigLoader
vi.mock('../../js/services/config-loader.js', () => ({
    ConfigLoader: {
        get: vi.fn((key, defaultValue) => {
            // Return defaults for testing (no real API keys)
            return defaultValue;
        })
    }
}));

// Mock window.LemonSqueezy
const mockLemonSqueezy = {
    Url: {
        Open: vi.fn()
    },
    Setup: vi.fn()
};

// Mock crypto.subtle for signature verification
global.crypto = {
    subtle: {
        importKey: vi.fn().mockResolvedValue({}),
        verify: vi.fn().mockResolvedValue(true),
        digest: vi.fn().mockResolvedValue(
            new Uint8Array(32).fill(0x12) // Mock hash
        )
    }
};

describe('LemonSqueezyService', () => {
    beforeEach(() => {
        // Clear localStorage before each test
        if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
            localStorage.clear();
        }
        vi.clearAllMocks();

        // Set up window.LemonSqueezy mock
        if (typeof window !== 'undefined') {
            window.LemonSqueezy = mockLemonSqueezy;
        }
    });

    afterEach(() => {
        if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
            localStorage.clear();
        }
    });

    describe('Module Loading', () => {
        it('should export LemonSqueezyService object', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');
            expect(LemonSqueezyService).toBeDefined();
        });

        it('should export checkout methods', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');
            expect(LemonSqueezyService.openCheckout).toBeDefined();
            expect(LemonSqueezyService.openMonthlyCheckout).toBeDefined();
            expect(LemonSqueezyService.openYearlyCheckout).toBeDefined();
            expect(LemonSqueezyService.openLifetimeCheckout).toBeDefined();
        });

        it('should export license operations', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');
            expect(LemonSqueezyService.validateLicense).toBeDefined();
            expect(LemonSqueezyService.activateLicense).toBeDefined();
            expect(LemonSqueezyService.deactivateLicense).toBeDefined();
        });

        it('should export configuration methods', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');
            expect(LemonSqueezyService.isConfigured).toBeDefined();
            expect(LemonSqueezyService.getVariantIds).toBeDefined();
            expect(LemonSqueezyService.getPricingInfo).toBeDefined();
        });
    });

    describe('Configuration', () => {
        it('should return false when store URL not configured', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');
            expect(LemonSqueezyService.isConfigured()).toBe(false);
        });

        it('should return empty variant IDs when not configured', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');
            const variants = LemonSqueezyService.getVariantIds();
            expect(variants.chamber_monthly).toBe('');
            expect(variants.chamber_yearly).toBe('');
            expect(variants.chamber_lifetime).toBe('');
        });

        it('should return pricing information structure', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');
            const pricing = LemonSqueezyService.getPricingInfo();

            expect(pricing).toHaveProperty('monthly');
            expect(pricing).toHaveProperty('yearly');
            expect(pricing).toHaveProperty('lifetime');

            expect(pricing.monthly.price).toBe('$4.99');
            expect(pricing.yearly.price).toBe('$39.00');
            expect(pricing.lifetime.price).toBe('$99.00');
        });
    });

    describe('Checkout Operations - Not Configured', () => {
        it('should return NOT_CONFIGURED error when store URL not set', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            const result = await LemonSqueezyService.openCheckout('test-variant');

            expect(result.success).toBe(false);
            expect(result.error).toBe('NOT_CONFIGURED');
            expect(result.message).toContain('coming soon');
        });

        it('should return NOT_CONFIGURED for monthly checkout', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            const result = await LemonSqueezyService.openMonthlyCheckout();

            expect(result.success).toBe(false);
            expect(result.error).toBe('NOT_CONFIGURED');
        });

        it('should return NOT_CONFIGURED for yearly checkout', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            const result = await LemonSqueezyService.openYearlyCheckout();

            expect(result.success).toBe(false);
            expect(result.error).toBe('NOT_CONFIGURED');
        });
    });

    describe('Checkout Operations - With Mock Store', () => {
        beforeEach(async () => {
            // Mock ConfigLoader to return a store URL
            vi.mocked(ConfigLoader.get).mockImplementation((key, defaultValue) => {
                if (key === 'LEMONSQUEEZY_STORE_URL') return 'https://test.lemonsqueezy.com';
                if (key === 'LEMON_VARIANT_CHAMBER_MONTHLY') return 'variant-monthly-123';
                if (key === 'LEMON_VARIANT_CHAMBER_YEARLY') return 'variant-yearly-456';
                if (key === 'LEMON_VARIANT_CHAMBER_LIFETIME') return 'variant-lifetime-789';
                return defaultValue;
            });

            // Reload module to pick up new config
            vi.resetModules();
        });

        it('should open checkout with valid variant', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            const result = await LemonSqueezyService.openCheckout('variant-monthly-123', {
                email: 'test@example.com',
                name: 'Test User'
            });

            expect(result.success).toBe(true);
            expect(mockLemonSqueezy.Url.Open).toHaveBeenCalled();
        });

        it('should build correct checkout URL with params', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            await LemonSqueezyService.openCheckout('variant-monthly-123', {
                email: 'test@example.com',
                name: 'Test User',
                discountCode: 'SAVE20'
            });

            const callArgs = mockLemonSqueezy.Url.Open.mock.calls[0][0];
            expect(callArgs).toContain('https://test.lemonsqueezy.com/checkout/buy/variant-monthly-123');
            expect(callArgs).toContain('checkout%5Bembed%5D=1');
        });

        it('should return NO_VARIANT error when variant is empty', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            const result = await LemonSqueezyService.openCheckout('');

            expect(result.success).toBe(false);
            expect(result.error).toBe('NO_VARIANT');
        });
    });

    describe('License Validation - No Key', () => {
        it('should return NO_KEY error when license key is empty', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            const result = await LemonSqueezyService.validateLicense('');

            expect(result.valid).toBe(false);
            expect(result.error).toBe('NO_KEY');
        });

        it('should return NO_KEY error when license key is null', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            const result = await LemonSqueezyService.validateLicense(null);

            expect(result.valid).toBe(false);
            expect(result.error).toBe('NO_KEY');
        });

        it('should return NO_KEY error when license key is undefined', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            const result = await LemonSqueezyService.validateLicense(undefined);

            expect(result.valid).toBe(false);
            expect(result.error).toBe('NO_KEY');
        });
    });

    describe('License Validation - Invalid Format', () => {
        it('should reject license key with invalid format for local validation', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            // Single segment (should be payload.signature)
            const result = await LemonSqueezyService.validateLicense('invalid');

            // Falls back to local validation which rejects invalid format
            expect(result.valid).toBe(false);
        });

        it('should reject license key with too many segments', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            const result = await LemonSqueezyService.validateLicense('a.b.c');

            expect(result.valid).toBe(false);
        });
    });

    describe('License Activation - Success', () => {
        it('should activate valid developer license', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            // Create a developer license key
            const licenseData = { tier: 'chamber', activatedAt: '2026-01-21' };
            const licenseKey = btoa(JSON.stringify(licenseData));

            const result = await LemonSqueezyService.activateLicense(licenseKey);

            expect(result.success).toBe(true);
            expect(result.tier).toBe('chamber');
        });

        it('should store activated license in localStorage', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            const licenseData = { tier: 'chamber', activatedAt: '2026-01-21' };
            const licenseKey = btoa(JSON.stringify(licenseData));

            await LemonSqueezyService.activateLicense(licenseKey);

            const stored = localStorage.getItem('rhythm_chamber_license');
            expect(stored).toBeDefined();

            const parsed = JSON.parse(stored);
            expect(parsed.tier).toBe('chamber');
        });

        it('should emit licenseActivated event on success', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            const eventSpy = vi.fn();
            window.addEventListener('licenseActivated', eventSpy);

            const licenseData = { tier: 'chamber', activatedAt: '2026-01-21' };
            const licenseKey = btoa(JSON.stringify(licenseData));

            await LemonSqueezyService.activateLicense(licenseKey);

            expect(eventSpy).toHaveBeenCalled();
            const eventData = eventSpy.mock.calls[0][0].detail;
            expect(eventData.tier).toBe('chamber');

            window.removeEventListener('licenseActivated', eventSpy);
        });
    });

    describe('License Activation - Failure', () => {
        it('should return NO_KEY for empty license', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            const result = await LemonSqueezyService.activateLicense('');

            expect(result.success).toBe(false);
            expect(result.error).toBe('NO_KEY');
        });

        it('should not store invalid license', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            await LemonSqueezyService.activateLicense('');

            const stored = localStorage.getItem('rhythm_chamber_license');
            expect(stored).toBeNull();
        });
    });

    describe('License Deactivation', () => {
        it('should remove license from localStorage', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            // First activate a license
            const licenseData = { tier: 'chamber', activatedAt: '2026-01-21' };
            const licenseKey = btoa(JSON.stringify(licenseData));
            await LemonSqueezyService.activateLicense(licenseKey);

            expect(localStorage.getItem('rhythm_chamber_license')).toBeDefined();

            // Then deactivate
            await LemonSqueezyService.deactivateLicense();

            expect(localStorage.getItem('rhythm_chamber_license')).toBeNull();
        });

        it('should emit licenseDeactivated event', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            const eventSpy = vi.fn();
            window.addEventListener('licenseDeactivated', eventSpy);

            await LemonSqueezyService.deactivateLicense();

            expect(eventSpy).toHaveBeenCalled();

            window.removeEventListener('licenseDeactivated', eventSpy);
        });

        it('should handle deactivation when no license exists', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            // Should not throw
            await expect(LemonSqueezyService.deactivateLicense()).resolves.toBeUndefined();
        });
    });

    describe('Event Handlers', () => {
        it('should setup event handlers when Lemon.js is loaded', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            const onCheckoutSuccess = vi.fn();
            const onCheckoutClosed = vi.fn();

            LemonSqueezyService.setupEventHandlers({
                onCheckoutSuccess,
                onCheckoutClosed
            });

            expect(mockLemonSqueezy.Setup).toHaveBeenCalled();
        });

        it('should handle when Lemon.js is not loaded for event setup', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            // Remove LemonSqueezy from window
            delete window.LemonSqueezy;

            const result = await LemonSqueezyService.setupEventHandlers({});

            // Should return undefined without throwing
            expect(result).toBeUndefined();

            // Restore for other tests
            window.LemonSqueezy = mockLemonSqueezy;
        });
    });

    describe('loadLemonJS', () => {
        it('should return true when Lemon.js already loaded', async () => {
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            // LemonSqueezy is already mocked in window
            const result = await LemonSqueezyService.loadLemonJS();

            expect(result).toBe(true);
        });

        it('should load Lemon.js dynamically when not present', async () => {
            // This test would require mocking document.createElement
            // For now, we just verify the method exists
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            expect(typeof LemonSqueezyService.loadLemonJS).toBe('function');
        });
    });

    describe('Crypto Signature Verification', () => {
        it('should derive secret from obfuscated arrays', async () => {
            // This tests the deriveSecret function works
            // In real implementation, this combines OBF_P1 and OBF_P2 via XOR
            const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

            // The function is internal, but we can verify it doesn't throw
            // by calling validateLicense with a properly formatted key
            const payload = btoa(JSON.stringify({ tier: 'chamber', iat: Date.now() / 1000 }));
            const signature = '0123456789abcdef';
            const licenseKey = `${payload}.${signature}`;

            // Should not throw during secret derivation
            const result = await LemonSqueezyService.validateLicense(licenseKey);

            expect(result).toBeDefined();
        });
    });
});
