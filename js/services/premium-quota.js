/**
 * Premium Quota Service
 *
 * Tracks usage of premium features for free tier users.
 * Manages the "1 free playlist" trial for sovereign tier.
 *
 * Quota Storage:
 * - Uses IndexedDB for persistence across sessions
 * - Tracks total playlist generations per user
 * - Premium users bypass all quota checks
 *
 * @module services/premium-quota
 */

import { ConfigLoader } from '../services/config-loader.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PremiumQuota');

// Quota limits for sovereign tier
const QUOTA_LIMITS = {
    playlist_generation: 1, // 1 free playlist for sovereign tier
    // Future quotas can be added here
};

// Storage key for quota data
const QUOTA_STORAGE_KEY = 'rhythm_chamber_quota';

// ==========================================
// Quota State
// ==========================================

let quotaCache = null;

// ==========================================
// Quota Management
// ==========================================

/**
 * Get quota data from storage or cache
 * @returns {Promise<Object>} Quota data with usage counts
 */
async function getQuotaData() {
    if (quotaCache) {
        return quotaCache;
    }

    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
        return { playlists: 0 };
    }

    try {
        const data = localStorage.getItem(QUOTA_STORAGE_KEY);
        if (data) {
            quotaCache = JSON.parse(data);
            return quotaCache;
        }
    } catch (e) {
        logger.warn('Failed to read quota data from localStorage:', e);
    }

    // Initialize with zero usage
    quotaCache = { playlists: 0 };
    return quotaCache;
}

/**
 * Save quota data to storage
 * @param {Object} data - Quota data to save
 */
async function saveQuotaData(data) {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
        quotaCache = data; // Update cache even without localStorage
        return;
    }

    try {
        // CRITICAL: Write to storage FIRST, then update cache on success only
        // This prevents cache desync if localStorage write fails (quota exceeded, privacy mode, etc.)
        localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(data));
        quotaCache = data; // Only update cache after successful storage write
    } catch (e) {
        logger.warn('Failed to save quota data to localStorage:', e);
        // HIGH: Do NOT update cache on failure - this prevents desync between cache and storage
        throw e; // Re-throw to allow caller to handle the failure
    }
}

/**
 * Check if user is premium (bypasses quota)
 * @returns {boolean} True if user has premium access
 */
function isPremiumUser() {
    // Check if production build with license verification
    if (ConfigLoader.get('PRODUCTION_BUILD', false)) {
        try {
            const licenseData = localStorage.getItem('rhythm_chamber_license');
            if (licenseData) {
                const license = JSON.parse(licenseData);
                if (license.tier === 'chamber' && license.validUntil) {
                    if (new Date(license.validUntil) > new Date()) {
                        return true;
                    }
                }
            }
        } catch (e) {
            logger.warn('Failed to check premium status:', e);
        }
        return false;
    }

    // MVP: Everyone is "premium" for testing
    // Set TEST_QUOTA_LIMITS to true to disable quota (testing mode)
    // Set TEST_QUOTA_LIMITS to false to enforce quota limits (production behavior)
    return ConfigLoader.get('TEST_QUOTA_LIMITS', false) === true;
}

/**
 * Check if user can create a playlist
 * @returns {Promise<{allowed: boolean, remaining: number, reason: string|null}>}
 */
async function canCreatePlaylist() {
    // Premium users always have access
    if (isPremiumUser()) {
        return { allowed: true, remaining: Infinity, reason: null };
    }

    const quota = await getQuotaData();
    const used = quota.playlists || 0;
    const limit = QUOTA_LIMITS.playlist_generation;
    const remaining = Math.max(0, limit - used);

    return {
        allowed: remaining > 0,
        remaining,
        reason: remaining === 0
            ? `You've used your ${limit} free playlist. Upgrade to Premium for unlimited playlists.`
            : null
    };
}

/**
 * Record a playlist creation
 * Should be called after successful playlist generation
 * @returns {Promise<number>} Remaining playlist count
 */
async function recordPlaylistCreation() {
    // Don't track for premium users
    if (isPremiumUser()) {
        return Infinity;
    }

    const quota = await getQuotaData();
    quota.playlists = (quota.playlists || 0) + 1;

    try {
        await saveQuotaData(quota);
    } catch (e) {
        // HIGH: If save fails, still return the computed remaining count
        // The cache wasn't updated (per saveQuotaData fix), so next read will get stale data
        // But the user's operation succeeded, so we acknowledge it
        logger.warn(`Playlist recorded but not persisted: ${e.message}`);
    }

    const remaining = Math.max(0, QUOTA_LIMITS.playlist_generation - quota.playlists);
    logger.info(`Playlist created. Remaining quota: ${remaining}`);

    return remaining;
}

/**
 * Get current quota status
 * @returns {Promise<Object>} Quota status with all counts
 */
async function getQuotaStatus() {
    const quota = await getQuotaData();
    const isPremium = isPremiumUser();

    return {
        isPremium,
        playlists: {
            used: quota.playlists || 0,
            limit: isPremium ? Infinity : QUOTA_LIMITS.playlist_generation,
            remaining: isPremium ? Infinity : Math.max(0, QUOTA_LIMITS.playlist_generation - (quota.playlists || 0))
        }
    };
}

/**
 * Reset quota data (for testing or admin purposes)
 * @returns {Promise<void>}
 */
async function resetQuota() {
    const resetData = { playlists: 0 };

    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
        quotaCache = resetData;
        return;
    }

    try {
        // CRITICAL: Write to storage FIRST, then update cache on success only
        localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(resetData));
        quotaCache = resetData;
        logger.info('Quota reset to zero');
    } catch (e) {
        logger.warn('Failed to reset quota:', e);
        // Do NOT update cache on failure - prevents desync
    }
}

/**
 * Set playlist count manually (for testing or migration)
 * @param {number} count - Playlist count to set
 * @returns {Promise<void>}
 */
async function setPlaylistCount(count) {
    const quota = await getQuotaData();
    quota.playlists = Math.max(0, count);
    await saveQuotaData(quota);
    logger.info(`Playlist count set to: ${count}`);
}

// ==========================================
// ES Module Export
// ==========================================

export const PremiumQuota = {
    // Quota checks
    canCreatePlaylist,
    getQuotaStatus,

    // Usage tracking
    recordPlaylistCreation,

    // Admin/Testing
    resetQuota,
    setPlaylistCount,

    // Limits (read-only)
    QUOTA_LIMITS
};


logger.info('Module loaded - Premium quota management initialized');
