/**
 * Payments Module for Rhythm Chamber
 *
 * CURRENT STATUS: Free MVP (Stateless)
 * - All core features (Analysis, Chat, RAG) are FREE.
 * - No user accounts, no server storage.
 *
 * FUTURE MONETIZATION (Three-Pillar Model):
 * - Pillar 1: The Sovereign ($0) - Privacy & Viral Growth
 * - Pillar 2: The Curator ($19.99 one-time) - Data Power-User
 * - Pillar 3: The Chamber ($4.99/mo or $39/yr) - Convenience & Seamlessness
 *
 * PRODUCTION BUILD:
 * - Set Config.PRODUCTION_BUILD = true OR
 * - Set Config.PAYMENT_MODE = 'production'
 * - This enables license verification for Curator and Chamber tiers
 */

import { ConfigLoader } from './services/config-loader.js';
import { Settings } from './settings.js';

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
 * Check actual license/entitlement status
 * TODO: Implement server-side verification for production
 * @returns {boolean} True if user has valid license
 */
function checkLicenseStatus() {
    // Check environment and storage availability
    if (typeof window === 'undefined') {
        return false;
    }

    if (typeof window.localStorage === 'undefined') {
        return false;
    }

    try {
        // Check localStorage for cached license
        const licenseData = localStorage.getItem('rhythm_chamber_license');
        if (licenseData) {
            const license = JSON.parse(licenseData);
            // Simple expiry check - production should verify server-side
            if (license.validUntil && new Date(license.validUntil) > new Date()) {
                return true;
            }

            if (!license.validUntil && license.tier === 'curator') {
                // Curator tier is one-time, no expiry
                return true;
            }
        }
    } catch (e) {
        // Handle localStorage access errors (SSR, storage disabled, quota exceeded, etc.)
        console.warn('[Payments] Cannot access localStorage:', e);
    }

    // No valid license found
    return false;
}

/**
 * Check if user has premium access (Curator or Chamber tier)
 *
 * HNW Note: Client-side entitlement = no real security.
 * For MVP, everything is free. For production, verify server-side.
 *
 * @returns {boolean} True if user has premium access
 */
function isPremium() {
    // Production build: Check actual license
    if (isProductionBuild()) {
        return checkLicenseStatus();
    }

    // MVP: Everything is free
    return true;
}

/**
 * Get premium status details
 * @returns {object} Premium status info
 */
function getPremiumStatus() {
    if (isProductionBuild()) {
        const hasLicense = checkLicenseStatus();
        let activatedAt = null;
        let tier = 'sovereign';

        if (hasLicense) {
            try {
                const licenseData = localStorage.getItem('rhythm_chamber_license');
                if (licenseData) {
                    const license = JSON.parse(licenseData);
                    // Extract activation date from license object
                    activatedAt = license.activatedAt || license.date || null;
                    tier = license.tier || 'sovereign';
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
        note: 'For production, implement server-side verification'
    };
}

/**
 * Placeholder for upgrade flow
 * In MVP, shows a toast explaining all features are free
 * In production, redirects to pricing page or shows upgrade modal
 */
function upgradeToPremium() {
    if (isProductionBuild()) {
        // In production, show upgrade modal with three-pillar options
        if (typeof window !== 'undefined') {
            const event = new CustomEvent('showPricingModal');
            window.dispatchEvent(event);
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
 * Placeholder for payment return handling
 */
function handlePaymentReturn() {
    // No-op for MVP - Stripe integration removed
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

    // Production build utilities
    isProductionBuild,
    checkLicenseStatus,

    // Available plans (informational) - Three-Pillar Model
    PLANS: {
        sovereign: {
            name: 'The Sovereign',
            price: '$0',
            features: ['Full Local Analysis', 'BYOI Chat (Your Models/Keys)', 'Basic Cards', 'Personality Reveal', '100% Client-Side']
        },
        curator: {
            name: 'The Curator',
            price: '$19.99 one-time',
            features: ['PKM Export (Obsidian/Notion)', 'Relationship Resonance Reports', 'Deep Enrichment (BPM/Key/Producer)', 'Metadata Fixer', 'Verified Badge']
        },
        chamber: {
            name: 'The Chamber',
            price: '$4.99/mo or $39/yr',
            status: 'coming_soon',
            features: ['E2EE Multi-Device Sync', 'Chamber Portal (Web Card Hosting)', 'Managed AI (Bundled Tokens)', 'Weekly Insight Emails', 'Priority Support']
        }
    }
};


console.log('[Payments] Module loaded - Three-Pillar Model');

