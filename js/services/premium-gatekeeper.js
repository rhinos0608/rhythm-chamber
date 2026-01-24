/**
 * Premium Gatekeeper Service
 *
 * Unified feature access control consolidating license verification
 * and quota checking into a single API.
 *
 * @module services/premium-gatekeeper
 */

import { LicenseService } from './license-service.js';
import { PremiumQuota } from './premium-quota.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PremiumGatekeeper');

/**
 * Feature registry defining all gated features
 */
const FEATURES = {
  unlimited_playlists: {
    requiresLicense: false,
    checkQuota: true,
    description: 'Unlimited playlist creation'
  },
  semantic_search: {
    requiresLicense: true,
    checkQuota: false,
    description: 'Semantic search across streams'
  },
  personality_insights: {
    requiresLicense: true,
    checkQuota: false,
    description: 'AI personality analysis'
  },
  export_advanced: {
    requiresLicense: true,
    checkQuota: false,
    description: 'Advanced export formats'
  }
};

/**
 * Check if a feature is accessible to the current user
 * @param {string} featureName - Name of the feature to check
 * @returns {Promise<object>} Access result
 */
async function checkFeature(featureName) {
  // Validate feature exists
  const feature = FEATURES[featureName];
  if (!feature) {
    return {
      allowed: false,
      reason: 'FEATURE_NOT_FOUND',
      tier: null,
      quotaRemaining: null,
      upgradeUrl: '/upgrade.html'
    };
  }

  // Check license if required
  let licenseValid = false;
  let licenseTier = 'sovereign';

  if (feature.requiresLicense) {
    try {
      const verification = await LicenseService.verifyStoredLicense();
      licenseValid = verification.valid;
      licenseTier = verification.tier || 'sovereign';
    } catch (error) {
      logger.warn('License check failed:', error);
      licenseValid = false;
    }

    if (!licenseValid) {
      return {
        allowed: false,
        reason: 'NO_LICENSE',
        tier: licenseTier,
        quotaRemaining: null,
        upgradeUrl: '/upgrade.html'
      };
    }
  } else {
    // Still load license for tier info
    try {
      const stored = LicenseService.getStoredLicense();
      if (stored) {
        licenseValid = true;
        licenseTier = stored.tier || 'sovereign';
      }
    } catch {
      // Ignore errors for non-license features
    }
  }

  // Check quota if required (only for non-premium users)
  if (feature.checkQuota && !licenseValid) {
    try {
      const quota = await PremiumQuota.canCreatePlaylist();
      if (!quota.allowed) {
        return {
          allowed: false,
          reason: 'QUOTA_EXCEEDED',
          tier: licenseTier,
          quotaRemaining: quota.remaining,
          upgradeUrl: '/upgrade.html'
        };
      }
    } catch (error) {
      logger.warn('Quota check failed:', error);
    }
  }

  // Feature is allowed
  return {
    allowed: true,
    reason: null,
    tier: licenseTier,
    quotaRemaining: null,
    upgradeUrl: '/upgrade.html'
  };
}

/**
 * Get all registered features
 * @returns {object} Feature registry
 */
function getFeatures() {
  return { ...FEATURES };
}

/**
 * Check if a feature is registered
 * @param {string} featureName - Name to check
 * @returns {boolean}
 */
function isRegisteredFeature(featureName) {
  return featureName in FEATURES;
}

// ==========================================
// Public API
// ==========================================

export const PremiumGatekeeper = {
  checkFeature,
  getFeatures,
  isRegisteredFeature
};

logger.info('Module loaded - Premium gatekeeper initialized');
