/**
 * Pricing Tier Management
 *
 * Two-Tier Model:
 * - Tier 1: The Sovereign (Free) - Core features with 1 free playlist
 * - Tier 2: The Chamber (Premium) - Unlimited playlists, metadata enrichment, semantic search
 *
 * Premium Features:
 * - Unlimited playlist generation
 * - Metadata enrichment (genres, audio features, BPM/key)
 * - Semantic embeddings pipeline for "vibe-based" search
 * - Monthly AI music insights (post-MVP)
 */

import { createLogger } from './utils/logger.js';

const logger = createLogger('Pricing');

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
            'demo_mode',
            'playlist_generation_trial', // 1 free playlist
        ],
    },
    chamber: {
        name: 'The Chamber',
        level: 2,
        price: '$4.99/mo or $39/yr',
        features: [
            'unlimited_playlists',
            'metadata_enrichment',
            'semantic_embeddings',
            'ai_playlist_curator',
            'monthly_insights', // Coming post-MVP
        ],
    },
};

// ==========================================
// Feature Definitions
// ==========================================

const FEATURES = {
    // Free tier features
    full_local_analysis: {
        name: 'Full Local Analysis',
        description: 'Complete pattern detection and personality classification',
        tier: 'sovereign',
    },
    byoi_chat: {
        name: 'BYOI Chat',
        description: 'Bring Your Own Intelligence - use local models or your own API keys',
        tier: 'sovereign',
    },
    basic_cards: {
        name: 'Basic Shareable Cards',
        description: 'Generate and share personality cards',
        tier: 'sovereign',
    },
    personality_reveal: {
        name: 'Personality Reveal',
        description:
            'Discover your music personality type (Emotional Archaeologist, Mood Engineer, etc.)',
        tier: 'sovereign',
    },
    demo_mode: {
        name: 'Demo Mode',
        description: 'Try the app with pre-loaded sample data',
        tier: 'sovereign',
    },
    playlist_generation_trial: {
        name: 'Playlist Generation (Trial)',
        description: 'Create 1 playlist to experience the magic',
        tier: 'sovereign',
    },
    // Premium tier features
    unlimited_playlists: {
        name: 'Unlimited Playlists',
        description:
            'Create as many AI-curated playlists as you want — era-based, mood-based, time machine, and more',
        tier: 'chamber',
    },
    metadata_enrichment: {
        name: 'Metadata Enrichment',
        description:
            'Enrich your listening history with genres, audio features, BPM, key, and producer credits',
        tier: 'chamber',
    },
    semantic_embeddings: {
        name: 'Semantic Search',
        description:
            'Ask questions like "songs that feel like 3 AM existential crisis" — powered by local AI embeddings',
        tier: 'chamber',
    },
    ai_playlist_curator: {
        name: 'AI Playlist Curator',
        description:
            'Describe any mood or moment, and AI creates the perfect playlist from your history',
        tier: 'chamber',
    },
    monthly_insights: {
        name: 'Monthly AI Insights',
        description: 'Get a monthly email digest with new discoveries about your music evolution',
        tier: 'chamber',
        coming_soon: true,
    },
};

// ==========================================
// License Management
// ==========================================

/**
 * Get current user tier
 * @returns {string} Tier name ('sovereign', 'chamber')
 */
function getCurrentTier() {
    if (typeof window === 'undefined') {
        return 'sovereign';
    }

    try {
        const licenseData = localStorage.getItem('rhythm_chamber_license');
        if (licenseData) {
            const license = JSON.parse(licenseData);

            if (license.tier === 'chamber' && license.validUntil) {
                // Check if chamber subscription is still valid
                if (new Date(license.validUntil) > new Date()) {
                    return 'chamber';
                }
            }
        }
    } catch (e) {
        logger.warn('Failed to parse license', e);
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
        logger.warn(`Unknown feature: ${feature}`);
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
            featureDescription: FEATURES[feature].description,
        },
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
 * Check if feature requires subscription (all premium features are subscription now)
 * @param {string} feature - Feature key
 * @returns {boolean} True if feature requires Chamber tier
 */
function requiresOneTimePurchase(feature) {
    // All premium features are now subscription-based
    return false;
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
            migrated: true,
        };
    }

    if (legacyLicense.cloudSync && !legacyLicense.tier) {
        return {
            tier: 'chamber',
            activatedAt: legacyLicense.activatedAt || legacyLicense.date,
            validUntil: legacyLicense.validUntil,
            migrated: true,
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
    migrateLegacyLicense,
};

logger.info('Module loaded - Two-Tier Model initialized');
