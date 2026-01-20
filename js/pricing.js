/**
 * Pricing Tier Management
 *
 * Three-Pillar Model:
 * - Pillar 1: The Sovereign (Free) - Privacy & Viral Growth
 * - Pillar 2: The Curator ($19.99 one-time) - Data Power-User
 * - Pillar 3: The Chamber ($4.99/mo or $39/yr) - Convenience & Seamlessness
 */

import { ConfigLoader } from './services/config-loader.js';

// ==========================================
// Tier Definitions
// ==========================================

const TIERS = {
    sovereign: {
        name: 'The Sovereign',
        level: 1,
        price: '$0',
        features: [
            'full_local_analysis',
            'byoi_chat',
            'basic_cards',
            'personality_reveal',
            'demo_mode'
        ]
    },
    curator: {
        name: 'The Curator',
        level: 2,
        price: '$19.99 one-time',
        features: [
            'pkm_export',
            'relationship_resonance',
            'deep_enrichment',
            'metadata_fixer',
            'verified_badge'
        ]
    },
    chamber: {
        name: 'The Chamber',
        level: 3,
        price: '$4.99/mo or $39/yr',
        features: [
            'e2ee_sync',
            'chamber_portal',
            'managed_ai',
            'weekly_insights',
            'priority_support'
        ]
    }
};

// ==========================================
// Feature Definitions
// ==========================================

const FEATURES = {
    full_local_analysis: {
        name: 'Full Local Analysis',
        description: 'Complete pattern detection and personality classification',
        tier: 'sovereign'
    },
    byoi_chat: {
        name: 'BYOI Chat',
        description: 'Bring Your Own Intelligence - use local models or your own API keys',
        tier: 'sovereign'
    },
    basic_cards: {
        name: 'Basic Shareable Cards',
        description: 'Generate and share personality cards',
        tier: 'sovereign'
    },
    personality_reveal: {
        name: 'Personality Reveal',
        description: 'Discover your music personality type (Emotional Archaeologist, Mood Engineer, etc.)',
        tier: 'sovereign'
    },
    demo_mode: {
        name: 'Demo Mode',
        description: 'Try the app with pre-loaded sample data',
        tier: 'sovereign'
    },
    pkm_export: {
        name: 'PKM Export',
        description: 'Export to Obsidian, Notion, or Roam Research with bi-directional linking',
        tier: 'curator'
    },
    relationship_resonance: {
        name: 'Relationship Resonance Reports',
        description: 'Deep compatibility reports via private JSON exchange',
        tier: 'curator'
    },
    deep_enrichment: {
        name: 'Deep Enrichment',
        description: 'Fetch BPM, Key, Producer Credits from MusicBrainz/AcoustID',
        tier: 'curator'
    },
    metadata_fixer: {
        name: 'Metadata Fixer',
        description: 'Bulk editing interface for cleaning listening history',
        tier: 'curator'
    },
    verified_badge: {
        name: 'Verified Badge',
        description: 'Premium status indicator on shared cards',
        tier: 'curator'
    },
    e2ee_sync: {
        name: 'E2EE Sync',
        description: 'End-to-end encrypted multi-device sync',
        tier: 'chamber'
    },
    chamber_portal: {
        name: 'Chamber Portal',
        description: 'Private, password-protected web hosting for music identity cards',
        tier: 'chamber'
    },
    managed_ai: {
        name: 'Managed AI',
        description: 'Bundled cloud LLM tokens (no API key management)',
        tier: 'chamber'
    },
    weekly_insights: {
        name: 'Weekly Insight Emails',
        description: 'Proactive AI-generated digests of listening patterns',
        tier: 'chamber'
    },
    priority_support: {
        name: 'Priority Support',
        description: 'Faster response times for issues',
        tier: 'chamber'
    }
};

// ==========================================
// License Management
// ==========================================

/**
 * Get current user tier
 * @returns {string} Tier name ('sovereign', 'curator', 'chamber')
 */
function getCurrentTier() {
    if (typeof window === 'undefined') {
        return 'sovereign';
    }

    try {
        const licenseData = localStorage.getItem('rhythm_chamber_license');
        if (licenseData) {
            const license = JSON.parse(licenseData);

            if (license.tier && TIERS[license.tier]) {
                if (license.validUntil && new Date(license.validUntil) > new Date()) {
                    return license.tier;
                }

                if (!license.validUntil && license.tier === 'curator') {
                    return 'curator';
                }
            }
        }
    } catch (e) {
        console.warn('[Pricing] Failed to parse license:', e);
    }

    return 'sovereign';
}

/**
 * Check if user has access to a specific feature
 * @param {string} feature - Feature key (e.g., 'pkm_export')
 * @returns {boolean} True if user has access
 */
function hasFeatureAccess(feature) {
    const currentTier = getCurrentTier();
    const featureDefinition = FEATURES[feature];

    if (!featureDefinition) {
        console.warn(`[Pricing] Unknown feature: ${feature}`);
        return false;
    }

    const featureTier = featureDefinition.tier;
    const currentTierLevel = TIERS[currentTier]?.level || 1;
    const featureTierLevel = TIERS[featureTier]?.level || 1;

    return currentTierLevel >= featureTierLevel;
}

/**
 * Get all features available to current user
 * @returns {Array} Array of feature keys
 */
function getAvailableFeatures() {
    const currentTier = getCurrentTier();
    const availableFeatures = [];

    for (const tierKey in TIERS) {
        if (TIERS[tierKey].level <= TIERS[currentTier].level) {
            availableFeatures.push(...TIERS[tierKey].features);
        }
    }

    return [...new Set(availableFeatures)];
}

/**
 * Get tier information for current user
 * @returns {object} Tier info with name, level, price, features
 */
function getCurrentTierInfo() {
    const currentTier = getCurrentTier();
    return TIERS[currentTier];
}

/**
 * Get feature definition
 * @param {string} feature - Feature key
 * @returns {object|null} Feature definition
 */
function getFeatureDefinition(feature) {
    return FEATURES[feature] || null;
}

/**
 * Check if feature requires upgrade
 * @param {string} feature - Feature key
 * @returns {boolean} True if feature requires upgrade
 */
function requiresUpgrade(feature) {
    return !hasFeatureAccess(feature);
}

/**
 * Get upgrade path for feature
 * @param {string} feature - Feature key
 * @returns {string|null} Tier name required for feature
 */
function getRequiredTier(feature) {
    const featureDefinition = FEATURES[feature];
    return featureDefinition ? featureDefinition.tier : null;
}

/**
 * Show upgrade UI for feature
 * @param {string} feature - Feature key
 */
function showUpgradeUI(feature) {
    if (typeof window === 'undefined') {
        return;
    }

    const requiredTier = getRequiredTier(feature);
    if (!requiredTier) {
        return;
    }

    const tierInfo = TIERS[requiredTier];
    const event = new CustomEvent('showUpgradeModal', {
        detail: {
            feature,
            requiredTier,
            tierName: tierInfo.name,
            tierPrice: tierInfo.price,
            featureName: FEATURES[feature].name,
            featureDescription: FEATURES[feature].description
        }
    });

    window.dispatchEvent(event);
}

/**
 * Check if feature requires Chamber tier subscription
 * @param {string} feature - Feature key
 * @returns {boolean} True if feature requires Chamber tier
 */
function requiresSubscription(feature) {
    return getRequiredTier(feature) === 'chamber';
}

/**
 * Check if feature requires Curator tier one-time purchase
 * @param {string} feature - Feature key
 * @returns {boolean} True if feature requires Curator tier
 */
function requiresOneTimePurchase(feature) {
    return getRequiredTier(feature) === 'curator';
}

// ==========================================
// Migration Helpers
// ==========================================

/**
 * Migrate legacy license to new tier system
 * @param {object} legacyLicense - Old license format
 * @returns {object} New license format
 */
function migrateLegacyLicense(legacyLicense) {
    if (legacyLicense.isPremium && !legacyLicense.tier) {
        return {
            tier: 'curator',
            activatedAt: legacyLicense.activatedAt || legacyLicense.date,
            validUntil: null,
            migrated: true
        };
    }

    if (legacyLicense.cloudSync && !legacyLicense.tier) {
        return {
            tier: 'chamber',
            activatedAt: legacyLicense.activatedAt || legacyLicense.date,
            validUntil: legacyLicense.validUntil,
            migrated: true
        };
    }

    return legacyLicense;
}

// ==========================================
// Exports
// ==========================================

export const Pricing = {
    TIERS,
    FEATURES,
    getCurrentTier,
    getCurrentTierInfo,
    hasFeatureAccess,
    getAvailableFeatures,
    getFeatureDefinition,
    requiresUpgrade,
    getRequiredTier,
    showUpgradeUI,
    requiresSubscription,
    requiresOneTimePurchase,
    migrateLegacyLicense
};


console.log('[Pricing] Module loaded - Three-Pillar Model initialized');
