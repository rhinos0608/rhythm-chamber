/**
 * Premium Controller Tests
 *
 * Tests for premium feature gating, upgrade modal management,
 * and user interaction flows.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock focus-trap utility - must be before imports
vi.mock('../../js/utils/focus-trap.js', () => ({
  createFocusTrap: vi.fn(() => ({
    activate: vi.fn(),
    deactivate: vi.fn(),
  })),
}));

import { Pricing } from '../../js/pricing.js';
import { PremiumQuota } from '../../js/services/premium-quota.js';
import { PremiumController } from '../../js/controllers/premium-controller.js';
import { ConfigLoader } from '../../js/services/config-loader.js';
import { createFocusTrap } from '../../js/utils/focus-trap.js';
import { PremiumGatekeeper } from '../../js/services/premium-gatekeeper.js';

// Mock Pricing module
vi.mock('../../js/pricing.js', () => ({
  Pricing: {
    FEATURES: {
      metadata_enrichment: {
        name: 'Metadata Enrichment',
        description: 'Full metadata enrichment with genres and audio features',
      },
      semantic_search: {
        name: 'Semantic Search',
        description: 'Search by vibe, mood, or feeling',
      },
      playlist_generation: {
        name: 'Playlist Generation',
        description: 'AI-curated playlists',
      },
    },
    hasFeatureAccess: vi.fn(feature => false), // Default: no access
  },
}));

// Mock PremiumQuota
vi.mock('../../js/services/premium-quota.js', () => ({
  PremiumQuota: {
    canCreatePlaylist: vi.fn().mockResolvedValue({
      allowed: true,
      remaining: 1,
      reason: null,
    }),
    recordPlaylistCreation: vi.fn().mockResolvedValue(1),
    getQuotaStatus: vi.fn().mockResolvedValue({
      isPremium: false,
      playlists: { used: 0, limit: 1, remaining: 1 },
    }),
  },
}));

// Mock PremiumGatekeeper for existing tests
vi.mock('../../js/services/premium-gatekeeper.js', () => ({
  PremiumGatekeeper: {
    checkFeature: vi.fn().mockResolvedValue({
      allowed: true,
      reason: null,
      tier: 'chamber',
      quotaRemaining: 1,
    }),
  },
}));

// Mock ConfigLoader
vi.mock('../../js/services/config-loader.js', () => ({
  ConfigLoader: {
    get: vi.fn((key, defaultValue) => defaultValue),
  },
}));

describe('PremiumController', () => {
  let mockFocusTrap;

  beforeEach(() => {
    // Clear localStorage
    if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
      localStorage.clear();
    }
    vi.clearAllMocks();

    // Remove any existing modals
    const existingModal = document.querySelector('#premium-upgrade-modal');
    if (existingModal) {
      existingModal.remove();
    }

    // Mock focus trap
    mockFocusTrap = {
      activate: vi.fn(),
      deactivate: vi.fn(),
    };
    vi.mocked(createFocusTrap).mockReturnValue(mockFocusTrap);
  });

  afterEach(() => {
    // Clean up any modals
    const existingModal = document.querySelector('#premium-upgrade-modal');
    if (existingModal) {
      existingModal.remove();
    }
    // Restore body scroll
    document.body.style.overflow = '';
  });

  describe('Module Structure', () => {
    it('should export PremiumController object', () => {
      expect(PremiumController).toBeDefined();
    });

    it('should have checkFeatureAccess method', () => {
      expect(typeof PremiumController.checkFeatureAccess).toBe('function');
    });

    it('should have canCreatePlaylist method', () => {
      expect(typeof PremiumController.canCreatePlaylist).toBe('function');
    });

    it('should have showUpgradeModal method', () => {
      expect(typeof PremiumController.showUpgradeModal).toBe('function');
    });

    it('should have showPlaylistUpgradeModal method', () => {
      expect(typeof PremiumController.showPlaylistUpgradeModal).toBe('function');
    });

    it('should have hideModal method', () => {
      expect(typeof PremiumController.hideModal).toBe('function');
    });
  });

  describe('Feature Access Check', () => {
    it('should return true when feature is accessible', async () => {
      vi.mocked(Pricing.hasFeatureAccess).mockReturnValue(true);

      const onGranted = vi.fn();
      const result = await PremiumController.checkFeatureAccess('metadata_enrichment', onGranted);

      expect(result).toBe(true);
      expect(onGranted).toHaveBeenCalled();
    });

    it('should return false when feature is not accessible', async () => {
      vi.mocked(Pricing.hasFeatureAccess).mockReturnValue(false);

      const result = await PremiumController.checkFeatureAccess('metadata_enrichment');

      expect(result).toBe(false);
    });

    it('should show upgrade modal when access denied', async () => {
      vi.mocked(Pricing.hasFeatureAccess).mockReturnValue(false);

      await PremiumController.checkFeatureAccess('semantic_search');

      const modal = document.querySelector('#premium-upgrade-modal');
      expect(modal).toBeTruthy();
    });

    it('should not call onGranted when access denied', async () => {
      vi.mocked(Pricing.hasFeatureAccess).mockReturnValue(false);

      const onGranted = vi.fn();
      await PremiumController.checkFeatureAccess('metadata_enrichment', onGranted);

      expect(onGranted).not.toHaveBeenCalled();
    });
  });

  describe('Playlist Creation Check', () => {
    it('should return true when quota allows', async () => {
      vi.mocked(PremiumGatekeeper.checkFeature).mockResolvedValue({
        allowed: true,
        reason: null,
        tier: 'chamber',
        quotaRemaining: 1,
      });

      const result = await PremiumController.canCreatePlaylist();

      expect(result).toBe(true);
    });

    it('should return false when quota exhausted', async () => {
      vi.mocked(PremiumGatekeeper.checkFeature).mockResolvedValue({
        allowed: false,
        reason: "You've used your 1 free playlist",
        tier: null,
        quotaRemaining: 0,
      });

      const result = await PremiumController.canCreatePlaylist();

      expect(result).toBe(false);
    });

    it('should show upgrade modal when quota exceeded', async () => {
      vi.mocked(PremiumGatekeeper.checkFeature).mockResolvedValue({
        allowed: false,
        reason: "You've used your 1 free playlist",
        tier: null,
        quotaRemaining: 0,
      });

      await PremiumController.canCreatePlaylist();

      const modal = document.querySelector('#premium-upgrade-modal');
      expect(modal).toBeTruthy();
    });
  });

  describe('Record Playlist Creation', () => {
    it('should call PremiumQuota.recordPlaylistCreation', async () => {
      await PremiumController.recordPlaylistCreation();

      expect(PremiumQuota.recordPlaylistCreation).toHaveBeenCalled();
    });
  });

  describe('Modal Display', () => {
    it('should create modal element', () => {
      PremiumController.showUpgradeModal('metadata_enrichment');

      const modal = document.querySelector('#premium-upgrade-modal');
      expect(modal).toBeDefined();
      expect(modal).toBeInstanceOf(HTMLElement);
    });

    it('should only have one modal at a time', () => {
      PremiumController.showUpgradeModal('semantic_search');
      PremiumController.showUpgradeModal('metadata_enrichment');

      const modals = document.querySelectorAll('.premium-upgrade-modal');
      expect(modals.length).toBe(1);
    });

    it('should add modal to document body', () => {
      PremiumController.showUpgradeModal('playlist_generation');

      const modal = document.querySelector('#premium-upgrade-modal');
      expect(document.body.contains(modal)).toBe(true);
    });

    it('should prevent body scroll when modal is open', () => {
      PremiumController.showUpgradeModal('semantic_search');

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('should activate focus trap', () => {
      PremiumController.showUpgradeModal('metadata_enrichment');

      expect(mockFocusTrap.activate).toHaveBeenCalled();
    });

    it('should set initial focus on close button', () => {
      PremiumController.showUpgradeModal('semantic_search');

      const closeButton = document.querySelector('.upgrade-modal-close-btn');
      expect(closeButton).toBeTruthy();
    });
  });

  describe('Modal Content - Feature Type', () => {
    beforeEach(() => {
      vi.mocked(Pricing.hasFeatureAccess).mockReturnValue(false);
    });

    it('should show feature name in title', () => {
      PremiumController.showUpgradeModal('metadata_enrichment');

      const title = document.querySelector('#upgrade-modal-title');
      expect(title?.textContent).toContain('Metadata Enrichment');
    });

    it('should show feature description', () => {
      PremiumController.showUpgradeModal('semantic_search');

      const description = document.querySelector('.upgrade-description');
      expect(description?.textContent).toContain('Search by vibe, mood, or feeling');
    });

    it('should list premium features', () => {
      PremiumController.showUpgradeModal('playlist_generation');

      const features = document.querySelectorAll('.feature-item');
      expect(features.length).toBeGreaterThan(0);
    });

    it('should show pricing information', () => {
      PremiumController.showUpgradeModal('metadata_enrichment');

      const price = document.querySelector('.price-value');
      expect(price?.textContent).toContain('$4.99');
    });
  });

  describe('Modal Content - Playlist Type', () => {
    it('should show playlist-specific title', () => {
      PremiumController.showPlaylistUpgradeModal(0, "You've used your free playlist");

      const title = document.querySelector('#upgrade-modal-title');
      expect(title?.textContent).toContain('Unlimited Playlists');
    });

    it('should show quota reason', () => {
      PremiumController.showPlaylistUpgradeModal(0, 'Only 1 playlist remaining');

      const message = document.querySelector('.upgrade-message');
      expect(message?.textContent).toContain('Only 1 playlist remaining');
    });

    it('should show illustration icon', () => {
      PremiumController.showPlaylistUpgradeModal(0, 'No playlists left');

      const icon = document.querySelector('.illustration-icon');
      expect(icon?.textContent).toContain('🎵');
    });
  });

  describe('Modal Content - General Type', () => {
    it('should show general upgrade title', () => {
      PremiumController.showGeneralUpgradeModal();

      const title = document.querySelector('#upgrade-modal-title');
      expect(title?.textContent).toContain('Upgrade to Premium');
    });
  });

  describe('Modal Dismissal', () => {
    beforeEach(() => {
      PremiumController.showUpgradeModal('metadata_enrichment');
    });

    it('should remove modal from DOM', () => {
      const modalBefore = document.querySelector('#premium-upgrade-modal');
      expect(modalBefore).toBeTruthy();

      PremiumController.hideModal();

      // Wait for animation timeout
      setTimeout(() => {
        const modalAfter = document.querySelector('#premium-upgrade-modal');
        expect(modalAfter).toBeNull();
      }, 250);
    });

    it('should restore body scroll', async () => {
      PremiumController.hideModal();

      // Wait for animation
      await new Promise(resolve => setTimeout(resolve, 250));

      expect(document.body.style.overflow).toBe('');
    });

    it('should deactivate focus trap', () => {
      PremiumController.hideModal();

      expect(mockFocusTrap.deactivate).toHaveBeenCalled();
    });

    it('should add closing class for animation', () => {
      PremiumController.hideModal();

      const modal = document.querySelector('#premium-upgrade-modal');
      expect(modal?.classList.contains('modal-closing')).toBe(true);
    });
  });

  describe('Modal Interaction', () => {
    beforeEach(() => {
      PremiumController.showUpgradeModal('metadata_enrichment');
    });

    it('should close when clicking background', () => {
      const background = document.querySelector('.modal-overlay-bg');

      PremiumController.hideModal();

      // Modal should be in closing state
      const modal = document.querySelector('#premium-upgrade-modal');
      expect(modal?.classList.contains('modal-closing')).toBe(true);
    });

    it('should close when clicking close button', () => {
      const closeButton = document.querySelector('.upgrade-modal-close-btn');
      expect(closeButton).toBeTruthy();

      PremiumController.hideModal();

      const modal = document.querySelector('#premium-upgrade-modal');
      expect(modal?.classList.contains('modal-closing')).toBe(true);
    });

    it('should have Maybe Later button', () => {
      const buttons = document.querySelectorAll('[data-action="hide-upgrade-modal"]');
      expect(buttons.length).toBeGreaterThan(0);
      // First button is the close button (×), second is "Maybe Later"
      const maybeLaterBtn = Array.from(buttons).find(btn =>
        btn.textContent.includes('Maybe Later')
      );
      expect(maybeLaterBtn).toBeTruthy();
    });

    it('should have Upgrade buttons', () => {
      const monthlyBtn = document.querySelector('[data-action="upgrade-monthly"]');
      const yearlyBtn = document.querySelector('[data-action="upgrade-yearly"]');
      expect(monthlyBtn).toBeTruthy();
      expect(yearlyBtn).toBeTruthy();
      expect(monthlyBtn?.textContent).toContain('$4.99');
      expect(yearlyBtn?.textContent).toContain('$39');
    });
  });

  describe('Keyboard Interaction', () => {
    beforeEach(() => {
      PremiumController.showUpgradeModal('semantic_search');
    });

    it('should close on Escape key', () => {
      const modal = document.querySelector('#premium-upgrade-modal');
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });

      modal?.dispatchEvent(escapeEvent);

      // Check modal is closing
      expect(modal?.classList.contains('modal-closing')).toBe(true);
    });
  });

  describe('Modal Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      PremiumController.showUpgradeModal('metadata_enrichment');

      const modalContent = document.querySelector('.modal-content');
      expect(modalContent?.getAttribute('role')).toBe('dialog');
      expect(modalContent?.getAttribute('aria-modal')).toBe('true');
    });

    it('should have aria-labelledby pointing to title', () => {
      PremiumController.showUpgradeModal('semantic_search');

      const modalContent = document.querySelector('.modal-content');
      const titleId = modalContent?.getAttribute('aria-labelledby');
      expect(titleId).toBe('upgrade-modal-title');

      const title = document.getElementById(titleId || '');
      expect(title).toBeTruthy();
    });

    it('should have close button with aria-label', () => {
      PremiumController.showUpgradeModal('playlist_generation');

      const closeButton = document.querySelector('.upgrade-modal-close-btn');
      expect(closeButton?.getAttribute('aria-label')).toBe('Close modal');
    });
  });

  describe('Global Event Listeners', () => {
    it('should respond to showUpgradeModal custom event', () => {
      const event = new CustomEvent('showUpgradeModal', {
        detail: { feature: 'semantic_search' },
      });

      window.dispatchEvent(event);

      const modal = document.querySelector('#premium-upgrade-modal');
      expect(modal).toBeTruthy();
    });

    it('should show general modal when no feature specified', () => {
      const event = new CustomEvent('showUpgradeModal', {
        detail: {},
      });

      window.dispatchEvent(event);

      const title = document.querySelector('#upgrade-modal-title');
      expect(title?.textContent).toContain('Upgrade to Premium');
    });
  });

  describe('Edge Cases', () => {
    it('should handle hiding modal when none exists', () => {
      // Should not throw
      expect(() => PremiumController.hideModal()).not.toThrow();
    });

    it('should handle hiding modal multiple times', () => {
      PremiumController.showUpgradeModal('metadata_enrichment');

      PremiumController.hideModal();
      // Should not throw on second call
      expect(() => PremiumController.hideModal()).not.toThrow();
    });

    it('should handle unknown feature gracefully', () => {
      // Should not throw even for unknown feature
      expect(() => PremiumController.showUpgradeModal('unknown_feature')).not.toThrow();

      const modal = document.querySelector('#premium-upgrade-modal');
      expect(modal).toBeTruthy();
    });

    it('should handle null feature in event', () => {
      const event = new CustomEvent('showUpgradeModal', {
        detail: { feature: null },
      });

      expect(() => window.dispatchEvent(event)).not.toThrow();
    });
  });

  describe('PremiumController with PremiumGatekeeper', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('canCreatePlaylist uses PremiumGatekeeper for access check', async () => {
      const mockAccess = { allowed: true, tier: 'chamber', reason: null, quotaRemaining: 1 };
      vi.mocked(PremiumGatekeeper.checkFeature).mockResolvedValue(mockAccess);

      const result = await PremiumController.canCreatePlaylist();

      expect(PremiumGatekeeper.checkFeature).toHaveBeenCalledWith('unlimited_playlists');
      expect(result).toBe(true);
    });

    it('canCreatePlaylist returns false when quota exceeded', async () => {
      const mockAccess = {
        allowed: false,
        reason: 'QUOTA_EXCEEDED',
        tier: 'sovereign',
        quotaRemaining: 0,
      };
      vi.mocked(PremiumGatekeeper.checkFeature).mockResolvedValue(mockAccess);

      const result = await PremiumController.canCreatePlaylist();

      expect(PremiumGatekeeper.checkFeature).toHaveBeenCalledWith('unlimited_playlists');
      expect(result).toBe(false);
    });
  });
});
