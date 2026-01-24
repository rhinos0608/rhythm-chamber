/**
 * Lemon Squeezy Payment Service for Rhythm Chamber
 *
 * Handles Lemon Squeezy overlay checkout integration with license key management.
 * Product IDs and API keys are configured via environment/config.
 *
 * HNW Architecture:
 * - Hierarchy: Service layer for payment operations
 * - Network: Async calls to Lemon Squeezy API with graceful fallback
 * - Wave: Offline-capable crypto validation for zero-backend
 *
 * @module services/lemon-squeezy-service
 */

import { ConfigLoader } from './config-loader.js';
import { createLogger } from '../utils/logger.js';
import { LicenseVerifier } from '../security/license-verifier.js';

const logger = createLogger('LemonSqueezyService');

// ==========================================
// Configuration (Placeholders - to be configured)
// ==========================================

/**
 * Lemon Squeezy Store URL
 * Format: https://yourstore.lemonsqueezy.com
 * Configured in config.json as lemonsqueezy.storeUrl
 */
const STORE_URL = ConfigLoader.get('lemonsqueezy.storeUrl', '');

/**
 * Lemon Squeezy API Key for license validation
 * NOTE: Not used when validationEndpoint is set (Worker mode)
 * TODO: Set in config if not using Cloudflare Worker
 */
const API_KEY = ConfigLoader.get('lemonsqueezy.apiKey', '');

/**
 * Variant IDs for Chamber tier
 * Configured in config.json as lemonsqueezy.variantMonthly, variantYearly, variantLifetime
 */
const VARIANT_IDS = {
    chamber_monthly: ConfigLoader.get('lemonsqueezy.variantMonthly', ''),
    chamber_yearly: ConfigLoader.get('lemonsqueezy.variantYearly', ''),
    chamber_lifetime: ConfigLoader.get('lemonsqueezy.variantLifetime', '')
};

/**
 * Validation endpoint (Cloudflare Worker or direct API)
 * Configured in config.json as lemonsqueezy.validationEndpoint
 * If set, uses Worker for secure validation
 * If empty, uses direct API with client-side key (not recommended for production)
 */
const VALIDATION_ENDPOINT = ConfigLoader.get('lemonsqueezy.validationEndpoint', '');

// Instance name for this installation
const INSTANCE_NAME = 'rhythm-chamber';

// ==========================================
// Lemon.js Integration
// ==========================================

/**
 * Load Lemon.js dynamically
 * @returns {Promise<boolean>} True if loaded successfully
 */
async function loadLemonJS() {
    if (window.LemonSqueezy) {
        return true; // Already loaded
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://app.lemonsqueezy.com/js/lemon.js';
        script.defer = true;
        script.onload = () => {
            logger.info('Lemon.js loaded successfully');
            resolve(true);
        };
        script.onerror = () => {
            logger.error('Failed to load Lemon.js');
            resolve(false);
        };
        document.head.appendChild(script);
    });
}

/**
 * Verify license key from checkout event via server-side validation
 * This prevents spoofing of checkout events by validating the key
 * against the Lemon Squeezy API or validation worker.
 * @param {string} licenseKey - The license key to verify
 * @returns {Promise<{valid: boolean, tier?: string, error?: string}>}
 */
async function verifyCheckoutLicense(licenseKey) {
    if (!licenseKey) {
        return { valid: false, error: 'No license key provided' };
    }

    try {
        // Try validating via the worker first (most secure)
        if (VALIDATION_ENDPOINT) {
            const response = await fetch(VALIDATION_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'validate',
                    licenseKey,
                    instanceName: INSTANCE_NAME
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.valid) {
                    return {
                        valid: true,
                        tier: data.tier || 'chamber',
                        instanceId: data.instanceId
                    };
                }
                return { valid: false, error: data.error || 'Invalid license' };
            }
        }

        // Fallback to direct API validation (less ideal, requires API key)
        if (API_KEY) {
            const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/activate', {
                method: 'POST',
                headers: {
                    'Accept': 'application/vnd.api+json',
                    'Content-Type': 'application/vnd.api+json',
                    'Authorization': `Bearer ${API_KEY}`
                },
                body: JSON.stringify({
                    license_key: licenseKey,
                    instance_name: INSTANCE_NAME
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.license_key?.status === 'active') {
                    return {
                        valid: true,
                        tier: 'chamber',
                        instanceId: data.instance?.id
                    };
                }
            }
        }

        // If no validation method is available, still allow the key
        // but mark it as unverified for UI warning
        logger.warn('No server-side validation available, license key unverified');
        return { valid: true, verified: false };
    } catch (error) {
        logger.error('License verification failed:', error);
        // On network failure, allow but mark as unverified
        return { valid: true, verified: false, error: error.message };
    }
}

/**
 * Initialize Lemon.js event handlers
 * @param {Object} handlers - Event handlers for checkout events
 */
function setupEventHandlers(handlers = {}) {
    if (!window.LemonSqueezy) {
        logger.warn('Lemon.js not loaded, cannot setup event handlers');
        return;
    }

    // Default handlers
    const defaultHandlers = {
        onCheckoutSuccess: async (data) => {
            logger.info('Checkout successful, verifying license key...');

            // SECURITY: Verify license key server-side before trusting it
            // This prevents spoofed checkout events from fake licenses
            const verification = await verifyCheckoutLicense(data.licenseKey);

            if (!verification.valid) {
                logger.error('License verification failed:', verification.error);
                // Notify handler of verification failure
                handlers.onCheckoutError?.({
                    error: 'VERIFICATION_FAILED',
                    message: verification.error || 'Could not verify license key'
                });
                return;
            }

            // Add verification status to data
            const verifiedData = {
                ...data,
                verified: verification.verified !== false, // true unless explicitly false
                tier: verification.tier || data.tier,
                instanceId: verification.instanceId
            };

            logger.info('License verified successfully:', verifiedData.tier);
            handlers.onCheckoutSuccess?.(verifiedData);
        },
        onCheckoutClosed: () => {
            logger.info('Checkout closed');
            handlers.onCheckoutClosed?.();
        }
    };

    // Setup LemonSqueezy event handler
    window.LemonSqueezy.Setup({
        eventHandler: (event) => {
            const eventName = event.event;
            const eventData = event.data || {};

            switch (eventName) {
                case 'Checkout.Success':
                    // Extract license key from event data
                    const licenseKey = eventData.meta?.license_key?.key ||
                                     eventData.license_key;

                    // SECURITY: Verify license key before processing
                    defaultHandlers.onCheckoutSuccess({
                        licenseKey,
                        orderId: eventData.order_number,
                        customerEmail: eventData.meta?.customer_email,
                        variantId: eventData.meta?.variant_id,
                        ...eventData
                    });
                    break;

                case 'Checkout.Close':
                    defaultHandlers.onCheckoutClosed();
                    break;

                default:
                    logger.debug('LemonSqueezy event:', eventName, eventData);
            }

            // Call custom handler if provided
            if (handlers[eventName]) {
                handlers[eventName](eventData);
            }
        }
    });

    logger.info('Lemon.js event handlers configured');
}

// ==========================================
// Checkout Operations
// ==========================================

/**
 * Open Lemon Squeezy overlay checkout
 *
 * @param {string} variantId - Lemon Squeezy variant ID
 * @param {Object} options - Additional options
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function openCheckout(variantId, options = {}) {
    const {
        email,
        name,
        discountCode,
        customData = {}
    } = options;

    // Check if store is configured
    if (!STORE_URL) {
        logger.warn('Lemon Squeezy store URL not configured');
        return {
            success: false,
            error: 'NOT_CONFIGURED',
            message: 'Payment integration coming soon! For now, enjoy the free tier.'
        };
    }

    // Check if variant ID is configured
    if (!variantId) {
        return {
            success: false,
            error: 'NO_VARIANT',
            message: 'Product variant not configured'
        };
    }

    try {
        // Ensure Lemon.js is loaded
        await loadLemonJS();

        if (!window.LemonSqueezy) {
            throw new Error('Failed to load Lemon.js');
        }

        // Build checkout URL
        let checkoutUrl = `${STORE_URL}/checkout/buy/${variantId}`;

        // Add query parameters for pre-filling
        const params = new URLSearchParams();

        if (email) params.set('checkout[email]', email);
        if (name) params.set('checkout[name]', name);
        if (discountCode) params.set('checkout[discount_code]', discountCode);

        // Enable overlay mode
        params.set('checkout[embed]', '1');

        // Add custom data (for webhooks)
        Object.entries(customData).forEach(([key, value]) => {
            params.set(`checkout[custom][${key}]`, String(value));
        });

        const queryString = params.toString();
        if (queryString) {
            checkoutUrl += `?${queryString}`;
        }

        // Open overlay checkout
        logger.info('Opening Lemon Squeezy checkout for variant:', variantId);
        window.LemonSqueezy.Url.Open(checkoutUrl);

        return { success: true };

    } catch (e) {
        logger.error('Checkout initiation failed:', e);
        return {
            success: false,
            error: 'CHECKOUT_FAILED',
            message: e.message || 'Failed to open checkout'
        };
    }
}

/**
 * Open monthly subscription checkout
 * @param {Object} options - Checkout options
 * @returns {Promise<Object>} Checkout result
 */
async function openMonthlyCheckout(options = {}) {
    return openCheckout(VARIANT_IDS.chamber_monthly, options);
}

/**
 * Open yearly subscription checkout
 * @param {Object} options - Checkout options
 * @returns {Promise<Object>} Checkout result
 */
async function openYearlyCheckout(options = {}) {
    return openCheckout(VARIANT_IDS.chamber_yearly, options);
}

/**
 * Open lifetime purchase checkout
 * @param {Object} options - Checkout options
 * @returns {Promise<Object>} Checkout result
 */
async function openLifetimeCheckout(options = {}) {
    return openCheckout(VARIANT_IDS.chamber_lifetime, options);
}

// ==========================================
// License Validation
// ==========================================

/**
 * Validate a license key
 * Uses Cloudflare Worker if configured, otherwise direct API
 *
 * @param {string} licenseKey - License key to validate
 * @param {string} instanceId - Instance ID for activation
 * @returns {Promise<Object>} Validation result
 */
async function validateLicense(licenseKey, instanceId = null) {
    if (!licenseKey) {
        return {
            valid: false,
            error: 'NO_KEY',
            message: 'License key is required'
        };
    }

    try {
        let result;

        if (VALIDATION_ENDPOINT) {
            // Use Cloudflare Worker for secure validation
            result = await validateViaWorker(licenseKey, instanceId);
        } else if (API_KEY) {
            // Direct API call (not recommended for production)
            result = await validateViaAPI(licenseKey, instanceId);
        } else {
            // No validation configured - try offline crypto validation
            result = await validateLocally(licenseKey);
        }

        return result;

    } catch (e) {
        logger.error('License validation failed:', e);
        return {
            valid: false,
            error: 'VALIDATION_ERROR',
            message: e.message
        };
    }
}

/**
 * Validate license via Cloudflare Worker (secure)
 * @param {string} licenseKey - License key
 * @param {string} instanceId - Instance ID
 * @returns {Promise<Object>} Validation result
 */
async function validateViaWorker(licenseKey, instanceId) {
    const response = await fetch(VALIDATION_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            action: 'validate',
            licenseKey,
            instanceId,
            instanceName: INSTANCE_NAME
        })
    });

    if (!response.ok) {
        throw new Error(`Worker returned ${response.status}`);
    }

    const data = await response.json();

    if (data.valid) {
        return {
            valid: true,
            tier: data.tier || 'chamber',
            instanceId: data.instanceId,
            expiresAt: data.expiresAt || null,
            activatedAt: data.activatedAt || null
        };
    }

    return {
        valid: false,
        error: data.error || 'INVALID',
        message: data.message || 'License key is invalid'
    };
}

/**
 * Validate license via Lemon Squeezy API directly
 * @param {string} licenseKey - License key
 * @param {string} instanceId - Instance ID
 * @returns {Promise<Object>} Validation result
 */
async function validateViaAPI(licenseKey, instanceId) {
    const url = instanceId
        ? `https://api.lemonsqueezy.com/v1/licenses/validate`
        : `https://api.lemonsqueezy.com/v1/licenses/activate`;

    const body = instanceId
        ? { license_key: licenseKey, instance_id: instanceId }
        : { license_key: licenseKey, instance_name: INSTANCE_NAME };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Accept': 'application/vnd.api+json',
            'Content-Type': 'application/vnd.api+json',
            'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();

    // Check for errors
    if (data.error) {
        return {
            valid: false,
            error: 'API_ERROR',
            message: data.error
        };
    }

    const licenseKeyData = data.license_key;

    // Check if license is active
    if (licenseKeyData.status !== 'active') {
        return {
            valid: false,
            error: 'INACTIVE',
            message: `License status: ${licenseKeyData.status}`
        };
    }

    // Check expiration
    if (licenseKeyData.expires_at) {
        const expiresAt = new Date(licenseKeyData.expires_at);
        if (expiresAt < new Date()) {
            return {
                valid: false,
                error: 'EXPIRED',
                message: 'License has expired'
            };
        }
    }

    return {
        valid: true,
        tier: 'chamber',
        instanceId: data.instance?.id,
        expiresAt: licenseKeyData.expires_at,
        activatedAt: licenseKeyData.created_at
    };
}

/**
 * Validate license locally using crypto (offline fallback)
 * For internally-generated licenses using HMAC signing
 * @param {string} licenseKey - License key
 * @returns {Promise<Object>} Validation result
 */
async function validateLocally(licenseKey) {
    try {
        // Parse JWT-like format: header.payload.signature (3 parts)
        // Legacy format: payload.signature (2 parts)
        const parts = licenseKey.split('.');

        if (parts.length !== 3 && parts.length !== 2) {
            return {
                valid: false,
                error: 'INVALID_FORMAT',
                message: 'Invalid license key format. Expected JWT format (header.payload.signature) or legacy format (payload.signature).'
            };
        }

        let header, payloadB64, signature, payload;

        if (parts.length === 3) {
            // Standard JWT format: header.payload.signature
            const [headerB64, payloadB64_jwt, signature_jwt] = parts;

            // Decode header
            try {
                const headerBytes = Uint8Array.from(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
                const headerJson = new TextDecoder().decode(headerBytes);
                header = JSON.parse(headerJson);
            } catch (e) {
                return {
                    valid: false,
                    error: 'INVALID_HEADER',
                    message: 'Invalid JWT header'
                };
            }

            payloadB64 = payloadB64_jwt;
            signature = signature_jwt;
        } else {
            // Legacy format: payload.signature
            [payloadB64, signature] = parts;
            header = { alg: 'HS256', typ: 'JWT' }; // Assume legacy format
        }

        // Decode payload
        const payloadBytes = Uint8Array.from(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
        const payloadJson = new TextDecoder().decode(payloadBytes);
        payload = JSON.parse(payloadJson);

        // Verify header algorithm
        if (header.alg !== 'HS256') {
            return {
                valid: false,
                error: 'UNSUPPORTED_ALGORITHM',
                message: `Unsupported algorithm: ${header.alg}. Expected HS256.`
            };
        }

        // Verify signature using derived secret
        // For JWT: sign header.payload
        // For legacy: sign payload only
        const dataToSign = parts.length === 3
            ? `${parts[0]}.${parts[1]}`  // header.payload
            : payloadB64;                // payload only (legacy)

        const isValid = await verifySignature(dataToSign, signature, payloadB64);

        if (!isValid) {
            return {
                valid: false,
                error: 'INVALID_SIGNATURE',
                message: 'License signature verification failed. Token may have been tampered with.'
            };
        }

        // Validate tier
        if (!payload.tier || !['sovereign', 'chamber', 'curator'].includes(payload.tier)) {
            return {
                valid: false,
                error: 'INVALID_TIER',
                message: `Invalid tier: ${payload.tier || 'undefined'}`
            };
        }

        // Check expiration
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
            return {
                valid: false,
                error: 'EXPIRED',
                message: `License expired at ${new Date(payload.exp * 1000).toISOString()}`
            };
        }

        // Check not before
        if (payload.nbf && payload.nbf > now) {
            return {
                valid: false,
                error: 'NOT_YET_VALID',
                message: `License not valid until ${new Date(payload.nbf * 1000).toISOString()}`
            };
        }

        return {
            valid: true,
            tier: payload.tier || 'chamber',
            instanceId: payload.instanceId || null,
            expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
            activatedAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
            features: payload.features || []
        };

    } catch (e) {
        logger.warn('License validation error:', e);
        return {
            valid: false,
            error: 'PARSE_ERROR',
            message: `Could not parse license key: ${e.message}`
        };
    }
}

/**
 * Verify HMAC signature of license payload
 * @param {string} dataToSign - Data that was signed (header.payload for JWT, payload for legacy)
 * @param {string} signature - Base64URL signature
 * @param {string} [payloadB64] - Payload for legacy compatibility
 * @returns {Promise<boolean>} True if signature is valid
 */
async function verifySignature(dataToSign, signature, payloadB64 = null) {
    try {
        // Derive secret from obfuscated storage
        const secret = await deriveSecret();

        // Import key
        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify']
        );

        // Handle Base64URL signature (JWT format)
        let signatureBytes;
        try {
            // Try Base64URL decoding first (JWT standard)
            const base64UrlSig = signature.replace(/-/g, '+').replace(/_/g, '/');
            signatureBytes = Uint8Array.from(atob(base64UrlSig), c => c.charCodeAt(0));
        } catch {
            // Fallback to hex format (legacy)
            signatureBytes = new Uint8Array(
                signature.match(/[\da-f]{2}/gi)?.map(h => parseInt(h, 16)) || []
            );
        }

        const dataBytes = new TextEncoder().encode(dataToSign);

        return await crypto.subtle.verify('HMAC', key, signatureBytes, dataBytes);

    } catch (e) {
        logger.warn('Signature verification failed:', e);
        return false;
    }
}

/**
 * Derive HMAC secret from obfuscated storage
 * Uses XOR encoding with environment binding
 * @returns {Promise<string>} Derived secret
 */
async function deriveSecret() {
    // Obfuscated key parts (XOR encoded)
    const OBF_P1 = [0x7f, 0x9a, 0x3c, 0xe5, 0x21, 0x88, 0x4d, 0xb2, 0x5c, 0x13, 0x77, 0xf4, 0x8e, 0x29, 0x6a, 0x41, 0xbc];
    const OBF_P2 = [0x42, 0xf7, 0x81, 0x1c, 0x99, 0x34, 0xaa, 0x5e, 0x35, 0x88, 0x1c, 0x9d, 0xb2, 0x74, 0x18, 0x5d, 0xcf];

    // XOR decode
    const combined = new Uint8Array(OBF_P1.length);
    for (let i = 0; i < OBF_P1.length; i++) {
        combined[i] = OBF_P1[i] ^ OBF_P2[i];
    }

    // Add environment binding (origin)
    const context = new TextEncoder().encode(window.location.origin);
    const result = new Uint8Array(combined.length + context.length);
    result.set(combined);
    result.set(context, combined.length);

    // Hash to create final secret
    const hash = await crypto.subtle.digest('SHA-256', result);
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

/**
 * Activate a license key (first-time activation)
 * Uses cryptographic verification and integrity-protected storage
 * @param {string} licenseKey - License key to activate
 * @returns {Promise<Object>} Activation result
 */
async function activateLicense(licenseKey) {
    if (!licenseKey) {
        return {
            success: false,
            error: 'NO_KEY'
        };
    }

    try {
        // First validate the key
        const validation = await validateLicense(licenseKey);

        if (!validation.valid) {
            return {
                success: false,
                error: validation.error,
                message: validation.message
            };
        }

        // Store with cryptographic verification via LicenseVerifier
        // This stores the signed JWT token with integrity checksum
        const stored = await LicenseVerifier.storeLicense(licenseKey, {
            instanceId: validation.instanceId,
            activatedAt: validation.activatedAt || new Date().toISOString(),
            expiresAt: validation.expiresAt,
            source: 'lemonsqueezy'
        });

        if (!stored) {
            logger.error('Failed to store license with integrity protection');
            return {
                success: false,
                error: 'STORAGE_FAILED',
                message: 'Failed to store license securely'
            };
        }

        // Also store legacy format for backward compatibility
        const licenseData = {
            tier: validation.tier,
            licenseKey: await hashKey(licenseKey), // Store hash, not raw key
            instanceId: validation.instanceId,
            activatedAt: validation.activatedAt || new Date().toISOString(),
            expiresAt: validation.expiresAt
        };

        localStorage.setItem('rhythm_chamber_license', JSON.stringify(licenseData));

        // Emit activation event
        const event = new CustomEvent('licenseActivated', {
            detail: { tier: validation.tier }
        });
        window.dispatchEvent(event);

        logger.info('License activated with cryptographic verification:', validation.tier);

        return {
            success: true,
            tier: validation.tier
        };

    } catch (e) {
        logger.error('License activation failed:', e);
        return {
            success: false,
            error: 'ACTIVATION_FAILED',
            message: e.message
        };
    }
}

/**
 * Hash a license key for storage (never store raw keys)
 * @param {string} key - License key to hash
 * @returns {Promise<string>} SHA-256 hash
 */
async function hashKey(key) {
    const data = new TextEncoder().encode(key);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Deactivate/remove current license
 * Clears both cryptographic storage and legacy format
 */
async function deactivateLicense() {
    // Clear cryptographic license storage
    LicenseVerifier.clearLicense();

    // Clear legacy format
    localStorage.removeItem('rhythm_chamber_license');

    const event = new CustomEvent('licenseDeactivated');
    window.dispatchEvent(event);

    logger.info('License deactivated (all formats cleared)');
}

// ==========================================
// Configuration Helpers
// ==========================================

/**
 * Check if Lemon Squeezy is properly configured
 * @returns {boolean} True if store URL is set
 */
function isConfigured() {
    return !!STORE_URL;
}

/**
 * Get configured variant IDs
 * @returns {Object} Variant ID mapping
 */
function getVariantIds() {
    return { ...VARIANT_IDS };
}

/**
 * Get pricing information for display
 * @returns {Object} Pricing details
 */
function getPricingInfo() {
    return {
        monthly: {
            variantId: VARIANT_IDS.chamber_monthly,
            price: '$4.99',
            interval: 'month',
            displayPrice: '$4.99/mo'
        },
        yearly: {
            variantId: VARIANT_IDS.chamber_yearly,
            price: '$39.00',
            interval: 'year',
            displayPrice: '$39/yr',
            savings: '35%',
            equivalentMonthly: '$3.25/mo'
        },
        lifetime: {
            variantId: VARIANT_IDS.chamber_lifetime,
            price: '$99.00',
            interval: 'lifetime',
            displayPrice: '$99 (one-time)'
        }
    };
}

// ==========================================
// Public API
// ==========================================

export const LemonSqueezyService = {
    // Checkout operations
    openCheckout,
    openMonthlyCheckout,
    openYearlyCheckout,
    openLifetimeCheckout,

    // License operations
    validateLicense,
    activateLicense,
    deactivateLicense,

    // Event handling
    loadLemonJS,
    setupEventHandlers,

    // Configuration
    isConfigured,
    getVariantIds,
    getPricingInfo,

    // Constants
    VARIANT_IDS,
    STORE_URL
};

logger.info('Module loaded - Lemon Squeezy payment service initialized', {
    configured: isConfigured(),
    variants: Object.keys(VARIANT_IDS).filter(k => VARIANT_IDS[k])
});
