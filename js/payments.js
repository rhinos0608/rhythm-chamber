/**
 * Payments Module for Rhythm Chamber
 *
 * CURRENT STATUS: Free MVP (Stateless)
 * - All core features (Analysis, Chat, RAG) are FREE.
 * - No user accounts, no server storage.
 *
 * FUTURE MONETIZATION (Two-Tier Model):
 * - Tier 1: The Sovereign ($0) - Privacy & Viral Growth, 1 free playlist
 * - Tier 2: The Chamber ($4.99/mo or $39/yr) - Unlimited playlists, metadata, semantic search
 *
 * PRODUCTION BUILD:
 * - Set Config.PRODUCTION_BUILD = true OR
 * - Set Config.PAYMENT_MODE = 'production'
 * - This enables license verification for Chamber tier
 */

import { ConfigLoader } from './services/config-loader.js';
import { Settings } from './settings.js';
import { LicenseVerifier } from './security/license-verifier.js';
import { PremiumGatekeeper } from './services/premium-gatekeeper.js';

// ==========================================
// Production Build Detection
// ==========================================

/**
 * Check if this is a production release build
 * Set via Config.PRODUCTION_BUILD or Config.PAYMENT_MODE
 */
function isProductionBuild() {
    if (typeof window === 'undefined') return false;
    return ConfigLoader.get('PRODUCTION_BUILD', false) === true ||
        ConfigLoader.get('PAYMENT_MODE', '') === 'curator' ||
        ConfigLoader.get('PAYMENT_MODE', '') === 'chamber' ||
        ConfigLoader.get('PAYMENT_MODE', '') === 'production';
}

/**
 * Check actual license/entitlement status with cryptographic verification
 * Uses JWT signature verification to prevent client-side bypass
 * @returns {Promise<boolean>} True if user has valid license
 */
async function checkLicenseStatus() {
    // Check environment and storage availability
    if (typeof window === 'undefined') {
        return false;
    }

    if (typeof window.localStorage === 'undefined') {
        return false;
    }

    if (!window.crypto || !window.crypto.subtle) {
        console.warn('[Payments] Web Crypto API not available');
        return false;
    }

    try {
        // Use cryptographic verification
        const license = await LicenseVerifier.loadLicense();

        if (!license) {
            return false;
        }

        // LicenseVerifier.verifyLicense already checks:
        // - JWT signature (prevents tampering)
        // - Expiration (exp claim)
        // - Device binding (prevents sharing)
        // - Tier validity
        return license.valid;

    } catch (e) {
        // Handle verification errors
        console.warn('[Payments] License verification failed:', e);
        return false;
    }
}

/**
 * Check if user has premium access (Chamber tier)
 *
 * Now uses PremiumGatekeeper for unified feature access.
 * This consolidates license verification logic into a single source of truth.
 *
 * @returns {Promise<boolean>} True if user has premium access
 */
async function isPremium() {
    try {
        // Use PremiumGatekeeper to check any license-required feature
        const access = await PremiumGatekeeper.checkFeature('semantic_search');
        return access.allowed && access.tier === 'chamber';
    } catch {
        // Fallback to false on error
        return false;
    }
}

/**
 * Get premium status details
 * @returns {Promise<object>} Premium status info
 */
async function getPremiumStatus() {
    if (isProductionBuild()) {
        const hasLicense = await checkLicenseStatus();
        let activatedAt = null;
        let tier = 'sovereign';
        let expiresAt = null;

        if (hasLicense) {
            try {
                const license = await LicenseVerifier.loadLicense();
                if (license && license.valid) {
                    activatedAt = license.activatedAt;
                    tier = license.tier;
                    expiresAt = license.expiresAt;
                }
            } catch (e) {
                console.warn('[Payments] Failed to parse license for activation date:', e);
            }
        }

        const tierNames = {
            sovereign: 'The Sovereign',
            curator: 'The Curator',
            chamber: 'The Chamber'
        };

        return {
            active: hasLicense,
            plan: tier,
            tierName: tierNames[tier] || 'The Sovereign',
            productionBuild: true,
            activatedAt,
            expiresAt,
            description: hasLicense ? `${tierNames[tier]} Tier - Premium Features Enabled` : 'The Sovereign Tier - Upgrade for Premium Features'
        };
    }

    return {
        active: true,
        plan: 'mvp_free',
        tierName: 'The Sovereign',
        productionBuild: false,
        activatedAt: new Date().toISOString(),
        description: 'MVP Free Tier - All Features Enabled',
        note: 'Cryptographic license verification enabled for production builds'
    };
}

/**
 * Upgrade flow
 * In MVP, shows a toast explaining all features are free
 * In production, redirects to upgrade page or shows upgrade modal
 */
function upgradeToPremium() {
    if (isProductionBuild()) {
        // In production, redirect to upgrade page
        if (typeof window !== 'undefined') {
            window.location.href = 'upgrade.html';
        }
        return;
    }

    if (Settings?.showToast) {
        Settings.showToast("All features are free during MVP! Enjoy! 🎉");
    }
}

/**
 * Placeholder for activation (no-op for MVP)
 */
function activatePremium() {
    console.log("[Payments] All features enabled (MVP Free Tier)");
}

/**
 * Placeholder for deactivation (no-op for MVP)
 */
function deactivatePremium() {
    // No-op for MVP
}

/**
 * Placeholder for upgrade modal
 */
function showUpgradeModal() {
    upgradeToPremium();
}

/**
 * Placeholder to hide upgrade modal
 */
function hideUpgradeModal() {
    // No-op for MVP
}

/**
 * Handle payment return from Lemon Squeezy
 * Checks for license key and activates premium if payment successful
 * Uses cryptographic verification for secure license storage
 */
async function handlePaymentReturn() {
    // Use LicenseVerifier to check for valid license
    const license = await LicenseVerifier.loadLicense();

    if (license && license.valid) {
        return {
            success: true,
            status: 'success',
            tier: license.tier
        };
    }

    return { success: false, status: null };
}

// ES Module export
export const Payments = {
    isPremium,
    getPremiumStatus,
    upgradeToPremium,
    activatePremium,
    deactivatePremium,
    showUpgradeModal,
    hideUpgradeModal,
    handlePaymentReturn,

    // Lemon Squeezy checkout methods
    startMonthlyCheckout: async (options) => {
        const { LemonSqueezyService } = await import('./services/lemon-squeezy-service.js');
        return LemonSqueezyService.openMonthlyCheckout(options);
    },
    startYearlyCheckout: async (options) => {
        const { LemonSqueezyService } = await import('./services/lemon-squeezy-service.js');
        return LemonSqueezyService.openYearlyCheckout(options);
    },
    startLifetimeCheckout: async (options) => {
        const { LemonSqueezyService } = await import('./services/lemon-squeezy-service.js');
        return LemonSqueezyService.openLifetimeCheckout(options);
    },

    // Production build utilities
    isProductionBuild,
    checkLicenseStatus,

    // LicenseVerifier reference for direct access
    LicenseVerifier,

    // Available plans (informational) - Two-Tier Model
    PLANS: {
        sovereign: {
            name: 'The Sovereign',
            price: '$0',
            features: ['Full Local Analysis', 'BYOI Chat (Your Models/Keys)', 'Basic Cards', 'Personality Reveal', '100% Client-Side', '1 Free Playlist']
        },
        chamber: {
            name: 'The Chamber',
            price: '$4.99/mo or $39/yr',
            status: 'available',
            features: ['Unlimited Playlists', 'Metadata Enrichment', 'Semantic Search', 'AI Playlist Curator', 'Monthly Insights (coming soon)']
        }
    }
};


console.log('[Payments] Module loaded - Cryptographic license verification enabled');


