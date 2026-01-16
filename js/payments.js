/**
 * Payments Module for Rhythm Chamber
 *
 * CURRENT STATUS: Free MVP (Stateless)
 * - All core features (Analysis, Chat, RAG) are FREE.
 * - No user accounts, no server storage.
 *
 * FUTURE MONETIZATION:
 * - "Cloud Sync" for $2/month or $10 One-time.
 * - Pays for encrypted server storage and cross-device sync.
 *
 * PRODUCTION BUILD:
 * - Set Config.PRODUCTION_BUILD = true OR
 * - Set Config.PAYMENT_MODE = 'supporter'
 * - This enables license verification for Supporter tier
 */

// ==========================================
// Production Build Detection
// ==========================================

/**
 * Check if this is a production (Supporter) release build
 * Set via Config.PRODUCTION_BUILD or Config.PAYMENT_MODE
 */
function isProductionBuild() {
    if (typeof window === 'undefined') return false;
    const config = window.Config || {};
    return config.PRODUCTION_BUILD === true ||
        config.PAYMENT_MODE === 'supporter' ||
        config.PAYMENT_MODE === 'production';
}

/**
 * Check actual license/entitlement status
 * TODO: Implement server-side verification for production
 * @returns {boolean} True if user has valid license
 */
function checkLicenseStatus() {
    // Check localStorage for cached license
    const licenseData = localStorage.getItem('rhythm_chamber_license');
    if (licenseData) {
        try {
            const license = JSON.parse(licenseData);
            // Simple expiry check - production should verify server-side
            if (license.validUntil && new Date(license.validUntil) > new Date()) {
                return true;
            }
        } catch (e) {
            console.warn('[Payments] Invalid license data:', e);
        }
    }

    // No valid license found
    return false;
}

/**
 * Check if user has premium access
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
        return {
            active: hasLicense,
            plan: hasLicense ? 'supporter' : 'free',
            productionBuild: true,
            activatedAt: hasLicense ? localStorage.getItem('rhythm_chamber_license_date') : null,
            description: hasLicense ? 'Supporter Tier - Premium Features Enabled' : 'Free Tier - Upgrade for Premium Features'
        };
    }

    return {
        active: true,
        plan: 'mvp_free',
        productionBuild: false,
        activatedAt: new Date().toISOString(),
        description: 'MVP Free Tier - All Features Enabled',
        note: 'For production, implement server-side verification'
    };
}

/**
 * Placeholder for upgrade flow
 * In MVP, shows a toast explaining all features are free
 */
function upgradeToPremium() {
    if (isProductionBuild()) {
        // In production, redirect to payment page
        const config = window.Config || {};
        const paymentUrl = config.PAYMENT_URL || 'https://rhythm-chamber.com/upgrade';
        window.open(paymentUrl, '_blank');
        return;
    }

    if (window.Settings?.showToast) {
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
    upgradeToPremium(); // Just show toast for MVP
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

    // Available plans (informational)
    PLANS: {
        mvp_free: {
            name: 'MVP Core',
            price: '$0',
            features: ['Full Analysis', 'Chat', 'Semantic Search (BYO Keys)', 'Local Storage']
        },
        supporter: {
            name: 'Supporter',
            price: '$39 one-time OR $19 first year, then $9/year',
            features: ['Obsidian/Notion Export', 'Relationship Compatibility Reports', 'Verified Badge', 'Friend Compare']
        },
        cloud_sync: {
            name: 'Cloud Sync',
            price: '$2/mo or $10/life',
            status: 'coming_soon',
            features: ['Encrypted Cloud Backup', 'Cross-Device Sync', 'Web Access']
        }
    }
};

// Keep window global for backwards compatibility
if (typeof window !== 'undefined') {
    window.Payments = Payments;
}

console.log('[Payments] Module loaded');

