/**
 * Genre Enrichment Premium Feature Gating
 *
 * Handles premium feature access control for metadata enrichment.
 * MVP: Premium gates disabled (all features available).
 * Production: Enforces premium access for API enrichment.
 *
 * Features:
 * - Premium access checking
 * - Upgrade modal display
 * - Feature flag configuration
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('GenreEnrichmentPremium');

// ==========================================
// Premium Feature Configuration
// ==========================================

/**
 * Premium feature flag for metadata enrichment.
 * MVP: Set to false to disable premium gate (allow all access).
 * Production: Set to true to enforce premium access.
 */
const ENRICHMENT_PREMIUM_ENABLED = false;

/**
 * Premium feature identifier for pricing system.
 */
const ENRICHMENT_FEATURE = 'metadata_enrichment';

// ==========================================
// Premium Access Control
// ==========================================

/**
 * Check if user has access to metadata enrichment (premium feature).
 *
 * MVP Behavior: Always returns true (no premium gate).
 * Production Behavior: Checks pricing feature access.
 *
 * @async
 * @returns {Promise<boolean>} True if user has access to enrichment features
 */
export async function checkEnrichmentAccess() {
    // MVP: Allow all access without premium check
    if (!ENRICHMENT_PREMIUM_ENABLED) {
        return true;
    }

    try {
        // Production: Check pricing feature access
        const { Pricing } = await import('../pricing.js');
        return Pricing.hasFeatureAccess(ENRICHMENT_FEATURE);
    } catch (e) {
        // If pricing system unavailable, allow access (fail-open)
        logger.warn('Failed to check premium access, allowing:', e);
        return true;
    }
}

/**
 * Show upgrade modal for metadata enrichment premium feature.
 *
 * Called when user attempts to access premium features without proper access.
 * Displays upgrade prompt through PremiumController.
 *
 * @async
 * @returns {Promise<void>}
 */
export async function showEnrichmentUpgradeModal() {
    try {
        const { PremiumController } = await import('../controllers/premium-controller.js');
        PremiumController.showUpgradeModal(ENRICHMENT_FEATURE);
    } catch (e) {
        logger.warn('Failed to show upgrade modal:', e);
    }
}

/**
 * Get the premium feature identifier.
 *
 * @returns {string} The feature identifier for pricing system
 */
export function getPremiumFeatureIdentifier() {
    return ENRICHMENT_FEATURE;
}

/**
 * Check if premium enforcement is enabled.
 *
 * @returns {boolean} True if premium gates are enforced
 */
export function isPremiumEnabled() {
    return ENRICHMENT_PREMIUM_ENABLED;
}
