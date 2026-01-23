/**
 * License Service Tests
 *
 * Tests for license verification infrastructure.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LicenseService } from '../../js/services/license-service.js';
import { ConfigLoader } from '../../js/services/config-loader.js';

// Mock ConfigLoader
vi.mock('../../js/services/config-loader.js', () => ({
    ConfigLoader: {
        get: vi.fn((key, defaultValue) => {
            return defaultValue; // Default: not production
        })
    }
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('LicenseService', () => {
    beforeEach(() => {
        // Clear localStorage before each test
        if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
            localStorage.clear();
        }
        vi.clearAllMocks();
    });

    afterEach(() => {
        if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
            localStorage.clear();
        }
    });

    describe('isVerificationEnabled', () => {
        it('should return false by default', () => {
            expect(LicenseService.isVerificationEnabled()).toBe(false);
        });

        it('should return true when PRODUCTION_BUILD is true', () => {
            vi.mocked(ConfigLoader.get).mockImplementation((key, defaultValue) => {
                if (key === 'PRODUCTION_BUILD') return true;
                return defaultValue;
            });

            expect(LicenseService.isVerificationEnabled()).toBe(true);

            // Reset mock
            vi.mocked(ConfigLoader.get).mockImplementation((key, defaultValue) => defaultValue);
        });
    });

    describe('getVerificationEndpoint', () => {
        it('should return default endpoint when not configured', () => {
            expect(LicenseService.getVerificationEndpoint()).toBe('https://api.rhythmchamber.com/license/verify');
        });

        it('should return custom endpoint when configured', () => {
            vi.mocked(ConfigLoader.get).mockImplementation((key, defaultValue) => {
                if (key === 'license_verification_endpoint') return 'https://custom.api.com/verify';
                return defaultValue;
            });

            expect(LicenseService.getVerificationEndpoint()).toBe('https://custom.api.com/verify');

            // Reset mock
            vi.mocked(ConfigLoader.get).mockImplementation((key, defaultValue) => defaultValue);
        });
    });

    describe('getStoredLicense', () => {
        it('should return null when no license stored', () => {
            const license = LicenseService.getStoredLicense();
            expect(license).toBeNull();
        });

        it('should return parsed license when stored', () => {
            const testLicense = {
                tier: 'chamber',
                activatedAt: '2026-01-21',
                validUntil: '2027-01-21'
            };
            localStorage.setItem('rhythm_chamber_license', JSON.stringify(testLicense));

            const license = LicenseService.getStoredLicense();
            expect(license).toEqual(testLicense);
        });

        it('should return null for invalid JSON', () => {
            localStorage.setItem('rhythm_chamber_license', 'invalid json');

            const license = LicenseService.getStoredLicense();
            expect(license).toBeNull();
        });
    });

    describe('saveStoredLicense', () => {
        it('should save license to localStorage', () => {
            const testLicense = {
                tier: 'chamber',
                activatedAt: '2026-01-21'
            };

            LicenseService.saveStoredLicense(testLicense);

            const stored = localStorage.getItem('rhythm_chamber_license');
            expect(stored).toBe(JSON.stringify(testLicense));
        });
    });

    describe('getCachedVerification', () => {
        it('should return null when no cache exists', () => {
            const cached = LicenseService.getCachedVerification();
            expect(cached).toBeNull();
        });

        it('should return cached verification when valid', () => {
            const cacheData = {
                valid: true,
                tier: 'chamber',
                license: { tier: 'chamber' },
                timestamp: Date.now()
            };
            localStorage.setItem('rhythm_chamber_license_cache', JSON.stringify(cacheData));

            const cached = LicenseService.getCachedVerification();
            expect(cached).toBeDefined();
            expect(cached.valid).toBe(true);
        });

        it('should return null for expired cache', () => {
            const cacheData = {
                valid: true,
                tier: 'chamber',
                license: { tier: 'chamber' },
                timestamp: Date.now() - (25 * 60 * 60 * 1000) // 25 hours ago
            };
            localStorage.setItem('rhythm_chamber_license_cache', JSON.stringify(cacheData));

            const cached = LicenseService.getCachedVerification();
            expect(cached).toBeNull();
        });
    });

    describe('verifyLicenseLocally', () => {
        it('should verify valid developer license key', async () => {
            // Create a developer license key
            const licenseData = { tier: 'chamber', activatedAt: '2026-01-21' };
            const licenseKey = btoa(JSON.stringify(licenseData));

            const result = await LicenseService.verifyLicenseLocally(licenseKey);

            expect(result.valid).toBe(true);
            expect(result.tier).toBe('chamber');
            expect(result.local).toBe(true);
        });

        it('should verify sovereign license key', async () => {
            const licenseData = { tier: 'sovereign', activatedAt: '2026-01-21' };
            const licenseKey = btoa(JSON.stringify(licenseData));

            const result = await LicenseService.verifyLicenseLocally(licenseKey);

            expect(result.valid).toBe(true);
            expect(result.tier).toBe('sovereign');
        });

        it('should reject invalid license key format', async () => {
            const result = await LicenseService.verifyLicenseLocally('not-valid-json');

            expect(result.valid).toBe(false);
            expect(result.error).toBe('PARSE_ERROR');
        });

        it('should reject license key with invalid tier', async () => {
            const licenseData = { tier: 'invalid_tier', activatedAt: '2026-01-21' };
            const licenseKey = btoa(JSON.stringify(licenseData));

            const result = await LicenseService.verifyLicenseLocally(licenseKey);

            expect(result.valid).toBe(false);
            expect(result.error).toBe('INVALID_FORMAT');
        });
    });

    describe('verifyStoredLicense', () => {
        it('should return no license error when none stored', async () => {
            const result = await LicenseService.verifyStoredLicense();

            expect(result.valid).toBe(false);
            expect(result.error).toBe('NO_LICENSE');
        });

        it('should validate stored license', async () => {
            const testLicense = {
                tier: 'chamber',
                activatedAt: '2026-01-21',
                validUntil: new Date(Date.now() + 86400000).toISOString()
            };
            localStorage.setItem('rhythm_chamber_license', JSON.stringify(testLicense));

            const result = await LicenseService.verifyStoredLicense();

            expect(result.valid).toBe(true);
            expect(result.tier).toBe('chamber');
        });

        it('should detect expired license', async () => {
            const testLicense = {
                tier: 'chamber',
                activatedAt: '2026-01-21',
                validUntil: new Date(Date.now() - 86400000).toISOString() // Yesterday
            };
            localStorage.setItem('rhythm_chamber_license', JSON.stringify(testLicense));

            const result = await LicenseService.verifyStoredLicense();

            expect(result.valid).toBe(false);
            expect(result.error).toBe('EXPIRED');
        });
    });

    describe('activateLicense', () => {
        it('should activate and store valid license', async () => {
            const licenseData = { tier: 'chamber', activatedAt: '2026-01-21' };
            const licenseKey = btoa(JSON.stringify(licenseData));

            const result = await LicenseService.activateLicense(licenseKey);

            expect(result.valid).toBe(true);
            expect(result.tier).toBe('chamber');

            // Check license was stored
            const stored = localStorage.getItem('rhythm_chamber_license');
            expect(stored).toBeDefined();
        });
    });

    describe('deactivateLicense', () => {
        it('should remove stored license', async () => {
            const testLicense = { tier: 'chamber', activatedAt: '2026-01-21' };
            localStorage.setItem('rhythm_chamber_license', JSON.stringify(testLicense));

            const result = await LicenseService.deactivateLicense();

            expect(result.success).toBe(true);
            expect(localStorage.getItem('rhythm_chamber_license')).toBeNull();
        });
    });

    describe('getLicenseStatus', () => {
        it('should return sovereign status when no license', async () => {
            const status = await LicenseService.getLicenseStatus();

            expect(status.hasLicense).toBe(false);
            expect(status.tier).toBe('sovereign');
            expect(status.verified).toBe(false);
        });

        it('should return chamber status with valid license', async () => {
            const testLicense = {
                tier: 'chamber',
                activatedAt: '2026-01-21',
                validUntil: new Date(Date.now() + 86400000).toISOString()
            };
            localStorage.setItem('rhythm_chamber_license', JSON.stringify(testLicense));

            const status = await LicenseService.getLicenseStatus();

            expect(status.hasLicense).toBe(true);
            expect(status.tier).toBe('chamber');
            expect(status.verified).toBe(true);
            expect(status.isExpired).toBe(false);
        });

        it('should detect expired license', async () => {
            const testLicense = {
                tier: 'chamber',
                activatedAt: '2026-01-21',
                validUntil: new Date(Date.now() - 86400000).toISOString()
            };
            localStorage.setItem('rhythm_chamber_license', JSON.stringify(testLicense));

            const status = await LicenseService.getLicenseStatus();

            expect(status.hasLicense).toBe(true);
            expect(status.isExpired).toBe(true);
        });
    });

    describe('generateDeviceFingerprint', () => {
        it('should generate consistent fingerprint', () => {
            const fp1 = LicenseService.generateDeviceFingerprint();
            const fp2 = LicenseService.generateDeviceFingerprint();

            expect(fp1).toBe(fp2);
            expect(typeof fp1).toBe('string');
            expect(fp1.length).toBeGreaterThan(0);
        });

        it('should return "server" when window is undefined', () => {
            const originalWindow = global.window;
            // @ts-expect-error - testing undefined window
            delete global.window;

            const fp = LicenseService.generateDeviceFingerprint();
            expect(fp).toBe('server');

            global.window = originalWindow;
        });
    });
});
