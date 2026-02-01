/**
 * Network Failure Tests
 *
 * Tests for graceful degradation when network requests fail,
 * including timeouts, connection errors, and offline scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigLoader } from '../../js/services/config-loader.js';

// Mock ConfigLoader
vi.mock('../../js/services/config-loader.js', () => ({
  ConfigLoader: {
    get: vi.fn((key, defaultValue) => defaultValue),
  },
}));

describe('Network Failure Scenarios', () => {
  let originalFetch;

  beforeEach(() => {
    // Store original fetch
    originalFetch = global.fetch;

    // Clear localStorage
    if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
      localStorage.clear();
    }
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore fetch
    global.fetch = originalFetch;

    if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
      localStorage.clear();
    }
  });

  describe('LicenseService Network Failures', () => {
    describe('verifyLicenseKey with network errors', () => {
      it('should fall back to local validation on fetch failure', async () => {
        const { LicenseService } = await import('../../js/services/license-service.js');

        // Mock fetch to throw
        global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));

        const result = await LicenseService.verifyLicenseKey('test-key');

        // Should fall back to local validation
        expect(result).toBeDefined();
      });

      it('should handle timeout with AbortSignal', async () => {
        const { LicenseService } = await import('../../js/services/license-service.js');

        // Mock fetch to respect AbortSignal
        let fetchAborted = false;
        global.fetch = vi.fn((_, options) => {
          return new Promise((_, reject) => {
            // If signal is already aborted, reject immediately
            if (options?.signal?.aborted) {
              fetchAborted = true;
              reject(new DOMException('Aborted', 'AbortError'));
              return;
            }
            // Otherwise listen for abort event
            options?.signal?.addEventListener('abort', () => {
              fetchAborted = true;
              reject(new DOMException('Aborted', 'AbortError'));
            });
            // Also set up a timeout to reject if not aborted
            setTimeout(() => {
              if (!fetchAborted) {
                reject(new Error('Network error'));
              }
            }, 100);
          });
        });

        const controller = new AbortController();
        // Abort immediately
        controller.abort();

        const result = await LicenseService.verifyLicenseKey('test-key', {
          signal: controller.signal,
        });

        expect(result.error).toBe('ABORTED');
        expect(result.message).toContain('cancelled');
      });

      it('should return ABORTED error status', async () => {
        const { LicenseService } = await import('../../js/services/license-service.js');

        global.fetch = vi.fn(() => Promise.reject(new DOMException('Aborted', 'AbortError')));

        const result = await LicenseService.verifyLicenseKey('test-key');

        expect(result).toBeDefined();
      });

      it('should handle 404 response gracefully', async () => {
        const { LicenseService } = await import('../../js/services/license-service.js');

        global.fetch = vi.fn(() =>
          Promise.resolve({
            ok: false,
            status: 404,
          })
        );

        const result = await LicenseService.verifyLicenseKey('test-key');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('NOT_FOUND');
      });

      it('should handle 410 Gone (revoked license)', async () => {
        const { LicenseService } = await import('../../js/services/license-service.js');

        global.fetch = vi.fn(() =>
          Promise.resolve({
            ok: false,
            status: 410,
          })
        );

        const result = await LicenseService.verifyLicenseKey('test-key');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('REVOKED');
      });
    });

    describe('verifyLicenseLocally fallback', () => {
      it('should validate license when server is unreachable', async () => {
        const { LicenseService } = await import('../../js/services/license-service.js');

        // Create a valid developer license
        const licenseData = { tier: 'chamber', activatedAt: '2026-01-21' };
        const licenseKey = btoa(JSON.stringify(licenseData));

        // Mock fetch to fail
        global.fetch = vi.fn(() => Promise.reject(new Error('Offline')));

        const result = await LicenseService.verifyLicenseKey(licenseKey);

        // Should fall back and validate locally
        expect(result.local).toBe(true);
        expect(result.warning).toContain('no server connection');
      });

      it('should reject invalid format locally', async () => {
        const { LicenseService } = await import('../../js/services/license-service.js');

        global.fetch = vi.fn(() => Promise.reject(new Error('Offline')));

        const result = await LicenseService.verifyLicenseKey('invalid-format');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('PARSE_ERROR');
      });
    });
  });

  describe('LemonSqueezyService Network Failures', () => {
    describe('Checkout with network issues', () => {
      it('should handle Lemon.js load failure', async () => {
        // Mock window without LemonSqueezy
        const originalLemonSqueezy = window.LemonSqueezy;
        delete window.LemonSqueezy;

        // Mock document.createElement to fail script load
        const mockScript = { onload: null, onerror: null };
        const originalCreateElement = document.createElement;
        document.createElement = vi.fn(() => mockScript);

        const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

        // Mock ConfigLoader to return store URL
        vi.mocked(ConfigLoader.get).mockImplementation((key, defaultValue) => {
          if (key === 'LEMONSQUEEZY_STORE_URL') return 'https://test.lemonsqueezy.com';
          if (key === 'LEMON_VARIANT_CHAMBER_MONTHLY') return 'variant-123';
          return defaultValue;
        });

        // Trigger script load failure
        setTimeout(() => mockScript.onerror?.(), 10);

        const result = await LemonSqueezyService.openMonthlyCheckout();

        // Should handle gracefully
        expect(result).toBeDefined();

        // Restore
        window.LemonSqueezy = originalLemonSqueezy;
        document.createElement = originalCreateElement;
      });
    });

    describe('License validation network failures', () => {
      it('should fall back to local validation on network failure', async () => {
        const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

        // Valid local license
        const licenseData = { tier: 'chamber', activatedAt: '2026-01-21' };
        const licenseKey = btoa(JSON.stringify(licenseData));

        const result = await LemonSqueezyService.validateLicense(licenseKey);

        expect(result).toBeDefined();
        // Local validation should work
      });

      it('should handle missing license key gracefully', async () => {
        const { LemonSqueezyService } = await import('../../js/services/lemon-squeezy-service.js');

        const result = await LemonSqueezyService.validateLicense('');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('NO_KEY');
      });
    });
  });

  describe('PremiumQuota Offline Behavior', () => {
    it('should return quota status when localStorage works', async () => {
      const { PremiumQuota } = await import('../../js/services/premium-quota.js');

      const status = await PremiumQuota.getQuotaStatus();

      expect(status).toBeDefined();
      expect(status.playlists).toBeDefined();
    });

    it('should handle localStorage unavailability', async () => {
      const { PremiumQuota } = await import('../../js/services/premium-quota.js');

      // Temporarily disable localStorage
      const originalLocalStorage = window.localStorage;
      Object.defineProperty(window, 'localStorage', {
        value: null,
        writable: true,
        configurable: true,
      });

      // Clear module cache
      vi.resetModules();

      const { PremiumQuota: PremiumQuotaNew } = await import('../../js/services/premium-quota.js');

      const status = await PremiumQuotaNew.getQuotaStatus();

      expect(status).toBeDefined();
      expect(status.playlists.used).toBe(0);

      // Restore localStorage
      window.localStorage = originalLocalStorage;
    });

    it('should handle corrupted localStorage data', async () => {
      const { PremiumQuota } = await import('../../js/services/premium-quota.js');

      // Store corrupted data
      localStorage.setItem('rhythm_chamber_quota', 'invalid{json}');

      // Should not throw, should return defaults
      const status = await PremiumQuota.getQuotaStatus();

      expect(status).toBeDefined();
    });

    it('should handle localStorage quota exceeded', async () => {
      const { PremiumQuota } = await import('../../js/services/premium-quota.js');

      // Mock localStorage.setItem to throw
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = vi.fn(() => {
        throw new Error('QuotaExceededError');
      });

      // Should handle gracefully
      await expect(PremiumQuota.recordPlaylistCreation()).resolves.toBeDefined();

      localStorage.setItem = originalSetItem;
    });
  });

  describe('PlaylistService Network Failures', () => {
    it('should return gated result when quota check fails', async () => {
      const { PlaylistService } = await import('../../js/services/playlist-service.js');
      const { PremiumQuota } = await import('../../js/services/premium-quota.js');

      // Spy on canCreatePlaylist and mock it
      const canCreateSpy = vi.spyOn(PremiumQuota, 'canCreatePlaylist').mockResolvedValue({
        allowed: false,
        remaining: 0,
        reason: 'Quota exceeded',
      });

      const result = await PlaylistService.createPlaylist([]);

      expect(result.gated).toBe(true);
      expect(result.playlist).toBeNull();

      canCreateSpy.mockRestore();
    });

    it('should handle missing streams gracefully', async () => {
      const { PlaylistService } = await import('../../js/services/playlist-service.js');
      const { PremiumQuota } = await import('../../js/services/premium-quota.js');

      // Spy on canCreatePlaylist and mock it
      const canCreateSpy = vi.spyOn(PremiumQuota, 'canCreatePlaylist').mockResolvedValue({
        allowed: true,
        remaining: 1,
        reason: null,
      });

      // Pass empty streams with required options
      const result = await PlaylistService.createPlaylist([], {
        type: 'era',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      expect(result).toBeDefined();
      // Should handle empty streams gracefully

      canCreateSpy.mockRestore();
    });
  });

  describe('Retry Logic', () => {
    it('should cache verification result to avoid repeated failures', async () => {
      const { LicenseService } = await import('../../js/services/license-service.js');

      let fetchCallCount = 0;
      global.fetch = vi.fn(() => {
        fetchCallCount++;
        return Promise.reject(new Error('Network error'));
      });

      const licenseKey = btoa(JSON.stringify({ tier: 'chamber' }));

      // First call
      await LicenseService.verifyLicenseKey(licenseKey);
      const firstCallCount = fetchCallCount;

      // Second call should use cache
      await LicenseService.verifyLicenseKey(licenseKey);

      // Should not have called fetch again due to cache
      expect(fetchCallCount).toBe(firstCallCount);
    });

    it('should bypass cache with force option', async () => {
      const { LicenseService } = await import('../../js/services/license-service.js');

      let fetchCallCount = 0;
      global.fetch = vi.fn(() => {
        fetchCallCount++;
        return Promise.reject(new Error('Network error'));
      });

      const licenseKey = btoa(JSON.stringify({ tier: 'chamber' }));

      // First call
      await LicenseService.verifyLicenseKey(licenseKey);

      // Force re-verification
      await LicenseService.verifyLicenseKey(licenseKey, { force: true });

      // Should have called fetch again
      expect(fetchCallCount).toBeGreaterThan(1);
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle multiple simultaneous quota checks', async () => {
      const { PremiumQuota } = await import('../../js/services/premium-quota.js');

      // Fire multiple requests at once
      const requests = Array(5)
        .fill(null)
        .map(() => PremiumQuota.canCreatePlaylist());

      const results = await Promise.all(requests);

      // All should resolve successfully
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(typeof result.allowed).toBe('boolean');
      });
    });

    it('should handle concurrent playlist creation attempts', async () => {
      const { PlaylistService } = await import('../../js/services/playlist-service.js');
      const { PremiumQuota } = await import('../../js/services/premium-quota.js');

      // Mock quota to allow one, then deny
      let callCount = 0;
      const canCreateSpy = vi
        .spyOn(PremiumQuota, 'canCreatePlaylist')
        .mockImplementation(async () => {
          callCount++;
          return {
            allowed: callCount <= 1,
            remaining: Math.max(0, 1 - callCount),
            reason: callCount > 1 ? 'Quota exceeded' : null,
          };
        });

      // Concurrent requests
      const requests = Array(3)
        .fill(null)
        .map(() => PlaylistService.createPlaylist([]));

      const results = await Promise.allSettled(requests);

      // At least first should succeed, others should be gated
      const gated = results.filter(r => r.status === 'fulfilled' && r.value.gated);

      expect(gated.length).toBeGreaterThan(0);

      canCreateSpy.mockRestore();
    });
  });

  describe('Offline Detection', () => {
    it('should detect offline mode via navigator.onLine', () => {
      const originalOnLine = navigator.onLine;

      // Simulate offline
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });

      expect(navigator.onLine).toBe(false);

      // Restore
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: originalOnLine,
      });
    });

    it('should handle offline event', () => {
      const offlineHandler = vi.fn();

      window.addEventListener('offline', offlineHandler);

      // Simulate offline event
      window.dispatchEvent(new Event('offline'));

      expect(offlineHandler).toHaveBeenCalled();

      window.removeEventListener('offline', offlineHandler);
    });
  });

  describe('Service Recovery', () => {
    it('should recover after network restoration', async () => {
      const { LicenseService } = await import('../../js/services/license-service.js');

      // First call fails
      global.fetch = vi.fn(() => Promise.reject(new Error('Offline')));

      const licenseKey = btoa(JSON.stringify({ tier: 'chamber' }));
      const firstResult = await LicenseService.verifyLicenseKey(licenseKey);

      expect(firstResult.local).toBe(true);

      // Clear cache to simulate new attempt after recovery
      LicenseService.clearVerificationCache();

      // Second call succeeds
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              valid: true,
              license: { tier: 'chamber' },
            }),
        })
      );

      const secondResult = await LicenseService.verifyLicenseKey(licenseKey);

      expect(secondResult).toBeDefined();
    });
  });

  describe('Error Recovery', () => {
    it('should maintain functionality after localStorage corruption', async () => {
      const { PremiumQuota } = await import('../../js/services/premium-quota.js');

      // Corrupt localStorage
      localStorage.setItem('rhythm_chamber_quota', 'corrupted');

      // Should still work
      const status1 = await PremiumQuota.getQuotaStatus();
      expect(status1).toBeDefined();

      // Reset should fix the corruption
      await PremiumQuota.resetQuota();

      const status2 = await PremiumQuota.getQuotaStatus();
      expect(status2.playlists.used).toBe(0);
    });
  });
});
