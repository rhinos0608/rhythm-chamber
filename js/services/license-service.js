/**
 * License Verification Service
 *
 * Provides server-side license validation for production builds.
 * This service prepares the infrastructure for license verification
 * that can be called from a server endpoint or during client startup.
 *
 * HNW Considerations:
 * - Hierarchy: Service layer for license operations
 * - Network: Async verification with caching and fallback
 * - Wave: Graceful degradation for offline scenarios
 *
 * @module services/license-service
 */

import { ConfigLoader } from './config-loader.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('LicenseService');

// License storage keys
const LICENSE_STORAGE_KEY = 'rhythm_chamber_license';
const LICENSE_CACHE_KEY = 'rhythm_chamber_license_cache';
const LICENSE_VERIFICATION_ENDPOINT_KEY = 'license_verification_endpoint';

// Default verification endpoint (can be overridden via config)
const DEFAULT_VERIFICATION_ENDPOINT = 'https://api.rhythmchamber.com/license/verify';

// Cache duration for verified licenses (24 hours)
const VERIFICATION_CACHE_DURATION = 24 * 60 * 60 * 1000;

/**
 * Check if license verification is enabled for this build
 * @returns {boolean} True if verification is required
 */
function isVerificationEnabled() {
    return ConfigLoader.get('PRODUCTION_BUILD', false) === true ||
        ConfigLoader.get('PAYMENT_MODE', '') === 'production' ||
        ConfigLoader.get('ENABLE_LICENSE_VERIFICATION', false) === true;
}

/**
 * Get the license verification endpoint
 * @returns {string} Verification endpoint URL
 */
function getVerificationEndpoint() {
    return ConfigLoader.get(LICENSE_VERIFICATION_ENDPOINT_KEY, DEFAULT_VERIFICATION_ENDPOINT);
}

/**
 * Get the stored license from localStorage
 * @returns {Object|null} Parsed license or null
 */
function getStoredLicense() {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
        return null;
    }

    try {
        const licenseData = localStorage.getItem(LICENSE_STORAGE_KEY);
        if (licenseData) {
            return JSON.parse(licenseData);
        }
    } catch (e) {
        logger.warn('Failed to read stored license:', e);
    }

    return null;
}

/**
 * Save license to localStorage
 * @param {Object} license - License data to save
 */
function saveStoredLicense(license) {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
        return;
    }

    try {
        localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(license));
    } catch (e) {
        // Handle quota exceeded errors specifically
        if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
            logger.error('localStorage quota exceeded, unable to save license');
        } else {
            logger.warn('Failed to save license:', e);
        }
    }
}

/**
 * Get cached verification result
 * @returns {Object|null} Cached verification or null
 */
function getCachedVerification() {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
        return null;
    }

    try {
        const cacheData = localStorage.getItem(LICENSE_CACHE_KEY);
        if (cacheData) {
            const cached = JSON.parse(cacheData);
            // Check if cache is still valid
            if (cached.timestamp && (Date.now() - cached.timestamp) < VERIFICATION_CACHE_DURATION) {
                return cached;
            }
        }
    } catch (e) {
        logger.warn('Failed to read verification cache:', e);
    }

    return null;
}

/**
 * Save verification result to cache
 * @param {Object} verification - Verification result to cache
 */
function saveVerificationCache(verification) {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
        return;
    }

    try {
        const cached = {
            ...verification,
            timestamp: Date.now()
        };
        localStorage.setItem(LICENSE_CACHE_KEY, JSON.stringify(cached));
    } catch (e) {
        // Handle quota exceeded errors specifically
        if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
            logger.warn('localStorage quota exceeded, unable to cache verification');
        } else {
            logger.warn('Failed to save verification cache:', e);
        }
    }
}

/**
 * Clear verification cache
 */
function clearVerificationCache() {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
        return;
    }

    try {
        localStorage.removeItem(LICENSE_CACHE_KEY);
    } catch (e) {
        logger.warn('Failed to clear verification cache:', e);
    }
}

/**
 * Verify a license key against the server
 *
 * @param {string} licenseKey - License key to verify
 * @param {Object} options - Verification options
 * @param {AbortSignal} [options.signal] - AbortSignal for cancellation
 * @param {boolean} [options.force=false] - Force verification bypassing cache
 * @returns {Promise<Object>} Verification result
 */
async function verifyLicenseKey(licenseKey, options = {}) {
    const { signal, force = false } = options;

    if (!licenseKey || typeof licenseKey !== 'string') {
        return {
            valid: false,
            error: 'INVALID_KEY',
            message: 'License key is required and must be a string'
        };
    }

    // Check cache first (unless forced)
    if (!force) {
        const cached = getCachedVerification();
        if (cached && cached.licenseKey === licenseKey) {
            logger.info('Using cached license verification');
            return {
                valid: cached.valid,
                tier: cached.tier,
                license: cached.license,
                cached: true
            };
        }
    }

    const endpoint = getVerificationEndpoint();

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'RhythmChamber/1.0'
            },
            body: JSON.stringify({
                licenseKey,
                timestamp: Date.now(),
                // Include fingerprint for additional validation
                fingerprint: generateDeviceFingerprint()
            }),
            signal
        });

        if (!response.ok) {
            if (response.status === 404) {
                return {
                    valid: false,
                    error: 'NOT_FOUND',
                    message: 'License key not found'
                };
            }
            if (response.status === 410) {
                return {
                    valid: false,
                    error: 'REVOKED',
                    message: 'License key has been revoked'
                };
            }
            throw new Error(`Verification failed: ${response.status}`);
        }

        const result = await response.json();

        if (result.valid && result.license) {
            // Cache successful verification
            saveVerificationCache({
                valid: true,
                licenseKey,
                tier: result.license.tier,
                license: result.license
            });

            // Store license locally
            saveStoredLicense(result.license);

            return {
                valid: true,
                tier: result.license.tier,
                license: result.license,
                verifiedAt: result.verifiedAt || new Date().toISOString()
            };
        }

        return {
            valid: false,
            error: result.error || 'INVALID',
            message: result.message || 'License key is invalid'
        };

    } catch (e) {
        if (e.name === 'AbortError') {
            return {
                valid: false,
                error: 'ABORTED',
                message: 'Verification was cancelled'
            };
        }

        // Network error - fall back to local validation
        logger.warn('License verification failed, falling back to local validation:', e);

        const localResult = await verifyLicenseLocally(licenseKey);

        // Cache the local verification result to avoid repeated failures
        if (localResult.valid) {
            saveVerificationCache({
                valid: true,
                licenseKey,
                tier: localResult.tier,
                license: localResult.license,
                local: true
            });
        }

        return localResult;
    }
}

/**
 * Verify a license key locally (offline fallback)
 * This is less secure but allows the app to function without server access
 *
 * @param {string} licenseKey - License key to verify locally
 * @returns {Promise<Object>} Verification result
 */
async function verifyLicenseLocally(licenseKey) {
    try {
        // Try to parse the license key as JSON (for developer/test keys)
        const parsed = JSON.parse(atob(licenseKey));

        if (parsed.tier && (parsed.tier === 'chamber' || parsed.tier === 'sovereign')) {
            const license = {
                tier: parsed.tier,
                activatedAt: parsed.activatedAt || new Date().toISOString(),
                validUntil: parsed.validUntil || null,
                local: true // Mark as locally verified
            };

            saveStoredLicense(license);

            return {
                valid: true,
                tier: license.tier,
                license,
                local: true,
                warning: 'License verified locally (no server connection)'
            };
        }

        return {
            valid: false,
            error: 'INVALID_FORMAT',
            message: 'License key format is invalid'
        };

    } catch (e) {
        return {
            valid: false,
            error: 'PARSE_ERROR',
            message: 'Could not parse license key'
        };
    }
}

/**
 * Verify the currently stored license against the server
 * This is called on app startup in production builds
 *
 * @param {Object} options - Verification options
 * @param {AbortSignal} [options.signal] - AbortSignal for cancellation
 * @returns {Promise<Object>} Verification result
 */
async function verifyStoredLicense(options = {}) {
    const stored = getStoredLicense();

    if (!stored) {
        return {
            valid: false,
            error: 'NO_LICENSE',
            message: 'No license stored'
        };
    }

    // Check expiry locally first
    if (stored.validUntil) {
        const expiryDate = new Date(stored.validUntil);
        if (expiryDate < new Date()) {
            return {
                valid: false,
                error: 'EXPIRED',
                message: 'License has expired',
                tier: stored.tier
            };
        }
    }

    // If verification is disabled, accept local license
    if (!isVerificationEnabled()) {
        return {
            valid: true,
            tier: stored.tier,
            license: stored,
            local: true
        };
    }

    // Verify with server
    const cached = getCachedVerification();
    if (cached && !options.force) {
        return {
            valid: cached.valid,
            tier: cached.tier,
            license: cached.license,
            cached: true
        };
    }

    // For production, we'd verify with server here
    // For now, return local validation
    return {
        valid: true,
        tier: stored.tier,
        license: stored,
        local: true,
        warning: 'Server verification not yet implemented'
    };
}

/**
 * Activate a license key
 * Verifies and stores the license
 *
 * @param {string} licenseKey - License key to activate
 * @param {Object} options - Activation options
 * @returns {Promise<Object>} Activation result
 */
async function activateLicense(licenseKey, options = {}) {
    const result = await verifyLicenseKey(licenseKey, options);

    if (result.valid) {
        // Emit activation event
        if (typeof window !== 'undefined') {
            const event = new CustomEvent('licenseActivated', {
                detail: {
                    tier: result.tier,
                    license: result.license
                }
            });
            window.dispatchEvent(event);
        }

        logger.info(`License activated: ${result.tier} tier`);
    }

    return result;
}

/**
 * Deactivate the current license (remove local storage)
 * @returns {Promise<Object>} Deactivation result
 */
async function deactivateLicense() {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
        return { success: false, error: 'NO_STORAGE' };
    }

    try {
        localStorage.removeItem(LICENSE_STORAGE_KEY);
        clearVerificationCache();

        // Emit deactivation event
        const event = new CustomEvent('licenseDeactivated');
        window.dispatchEvent(event);

        logger.info('License deactivated');
        return { success: true };
    } catch (e) {
        logger.warn('Failed to deactivate license:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Generate a device fingerprint for license binding
 * This is a simple fingerprint - production should use a more robust solution
 * @returns {string} Device fingerprint hash
 */
function generateDeviceFingerprint() {
    if (typeof window === 'undefined') {
        return 'server';
    }

    // Simple fingerprint based on available browser features
    const components = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset()
    ];

    // Simple hash function
    const str = components.join('|');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }

    return Math.abs(hash).toString(36);
}

/**
 * Check if current license needs re-verification
 * @returns {boolean} True if re-verification is needed
 */
function needsReverification() {
    const cached = getCachedVerification();
    if (!cached) {
        return true;
    }

    const age = Date.now() - cached.timestamp;
    return age >= VERIFICATION_CACHE_DURATION;
}

/**
 * Get license status summary
 * @returns {Promise<Object>} License status
 */
async function getLicenseStatus() {
    const stored = getStoredLicense();

    if (!stored) {
        return {
            hasLicense: false,
            tier: 'sovereign',
            verified: false
        };
    }

    const verification = await verifyStoredLicense();

    return {
        hasLicense: true,
        tier: stored.tier,
        verified: verification.valid,
        validUntil: stored.validUntil || null,
        isExpired: stored.validUntil ? new Date(stored.validUntil) < new Date() : false
    };
}

// ==========================================
// Public API
// ==========================================

export const LicenseService = {
    // Verification
    verifyLicenseKey,
    verifyStoredLicense,
    verifyLicenseLocally,
    activateLicense,
    deactivateLicense,

    // Status
    getLicenseStatus,
    getStoredLicense,
    saveStoredLicense,
    needsReverification,
    isVerificationEnabled,

    // Cache management
    getCachedVerification,
    saveVerificationCache,
    clearVerificationCache,

    // Utilities
    generateDeviceFingerprint,
    getVerificationEndpoint
};

logger.info('Module loaded - License verification service initialized');
