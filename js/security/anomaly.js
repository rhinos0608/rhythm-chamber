/**
 * Anomaly Detection Module
 * Behavioral detection and rate limiting for Rhythm Chamber
 * 
 * Provides rate limiting, failed attempt tracking, geographic anomaly detection,
 * suspicious activity checks, and adaptive lockout thresholds
 */

const FAILED_ATTEMPTS_KEY = 'rhythm_chamber_failed_attempts';
const IP_HISTORY_KEY = 'rhythm_chamber_ip_history';

/**
 * SHA-256 hash of data
 * 
 * @param {string} data - Data to hash
 * @returns {Promise<string>} Hex-encoded hash
 */
async function hashData(data) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Client-side rate limiting check
 * Tracks requests in memory (resets on page reload)
 * 
 * @param {string} key - Rate limit bucket key
 * @param {number} maxPerMinute - Maximum requests per minute
 * @returns {boolean} True if rate limited (should block)
 */
const rateLimitBuckets = {};

/**
 * Client-side rate limiting check
 * Tracks requests in memory (resets on page reload)
 * 
 * ⚠️ SECURITY NOTE - DEFENSE IN DEPTH ONLY ⚠️
 * 
 * This client-side rate limiting can be bypassed by:
 * 1. Opening DevTools and overriding: Security.isRateLimited = () => false
 * 2. Clearing the in-memory buckets
 * 3. Refreshing the page (buckets reset)
 * 
 * REAL protection MUST come from server-side rate limits on:
 * - OpenRouter API (per-key limits configured in their dashboard)
 * - Qdrant Cloud (per-collection limits)
 * - Spotify API (enforced by Spotify)
 * 
 * This exists to:
 * 1. Prevent accidental API exhaustion by normal users
 * 2. Provide helpful UX messaging ("slow down, you're being rate limited")
 * 3. Slow down casual inspection (not determined attackers)
 * 
 * @param {string} key - Rate limit bucket key
 * @param {number} maxPerMinute - Maximum requests per minute
 * @returns {boolean} True if rate limited (should block)
 */
function isRateLimited(key, maxPerMinute = 5) {
    const now = Date.now();
    const windowMs = 60000; // 1 minute

    if (!rateLimitBuckets[key]) {
        rateLimitBuckets[key] = [];
    }

    // Remove old entries
    rateLimitBuckets[key] = rateLimitBuckets[key].filter(
        timestamp => now - timestamp < windowMs
    );

    if (rateLimitBuckets[key].length >= maxPerMinute) {
        console.warn(`[Security] Rate limited: ${key}`);
        return true;
    }

    rateLimitBuckets[key].push(now);
    return false;
}

/**
 * Track failed API attempts for anomaly detection
 * Includes truncated IP hash for geographic pattern detection
 * 
 * @param {string} operation - Operation that failed (e.g., 'embedding', 'qdrant')
 * @param {string} reason - Failure reason
 */
async function recordFailedAttempt(operation, reason = '') {
    try {
        const stored = localStorage.getItem(FAILED_ATTEMPTS_KEY);
        const attempts = stored ? JSON.parse(stored) : [];

        // Generate a truncated hash of connection info for geographic detection
        // We don't store actual IPs - just a hash for pattern matching
        const connectionHash = await hashData(
            `${navigator.language}:${Intl.DateTimeFormat().resolvedOptions().timeZone}:${screen.width}x${screen.height}`
        );

        // Add new attempt with connection fingerprint
        attempts.push({
            operation,
            reason,
            timestamp: Date.now(),
            connectionHash: connectionHash.slice(0, 16), // Truncated for privacy
            userAgent: navigator.userAgent.slice(0, 50)
        });

        // Keep only last 24 hours
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const filtered = attempts.filter(a => a.timestamp > oneDayAgo);

        localStorage.setItem(FAILED_ATTEMPTS_KEY, JSON.stringify(filtered));

        // Also track IP history for geographic anomaly detection
        await recordConnectionHash(connectionHash.slice(0, 16));
    } catch (e) {
        console.error('[Security] Failed to record attempt:', e);
    }
}

/**
 * Track connection hashes for geographic anomaly detection
 */
async function recordConnectionHash(hash) {
    try {
        const stored = localStorage.getItem(IP_HISTORY_KEY);
        const history = stored ? JSON.parse(stored) : [];

        history.push({
            hash,
            timestamp: Date.now()
        });

        // Keep last 100 connection records
        const trimmed = history.slice(-100);
        localStorage.setItem(IP_HISTORY_KEY, JSON.stringify(trimmed));
    } catch (e) {
        // Ignore - non-critical
    }
}

/**
 * Count distinct geographic patterns (connection hashes) in recent history
 */
function countRecentGeoChanges() {
    try {
        const stored = localStorage.getItem(IP_HISTORY_KEY);
        if (!stored) return 0;

        const history = JSON.parse(stored);
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        const recentHashes = new Set(
            history
                .filter(h => h.timestamp > oneHourAgo)
                .map(h => h.hash)
        );

        return recentHashes.size;
    } catch (e) {
        return 0;
    }
}

/**
 * Check for suspicious activity patterns
 * Includes geographic anomaly detection for proxy/VPN attacks
 * 
 * @param {string} operation - Operation to check
 * @param {number} threshold - Max failures before lockout (default: 5)
 * @returns {Promise<{blocked: boolean, failureCount: number, message: string}>}
 */
async function checkSuspiciousActivity(operation, threshold = 5) {
    try {
        const stored = localStorage.getItem(FAILED_ATTEMPTS_KEY);
        if (!stored) return { blocked: false, failureCount: 0, message: '' };

        const attempts = JSON.parse(stored);
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

        // Count recent failures for this operation
        const recentFailures = attempts.filter(
            a => a.operation === operation && a.timestamp > oneDayAgo
        );

        // Check for geographic anomalies (rapid location changes)
        const geoChanges = countRecentGeoChanges();
        const hasGeoAnomaly = geoChanges > 3; // >3 distinct locations in 1 hour is suspicious

        // Lower threshold if geographic anomaly detected (proxy attack pattern)
        const effectiveThreshold = hasGeoAnomaly ? Math.floor(threshold / 2) : threshold;

        if (recentFailures.length >= effectiveThreshold) {
            return {
                blocked: true,
                failureCount: recentFailures.length,
                geoAnomaly: hasGeoAnomaly,
                message: hasGeoAnomaly
                    ? `Geographic anomaly detected: ${geoChanges} locations in 1h with ${recentFailures.length} failures. Security lockout active.`
                    : `Security lockout: ${recentFailures.length} failed ${operation} attempts in 24h. Please wait or clear app data.`
            };
        }

        return {
            blocked: false,
            failureCount: recentFailures.length,
            geoAnomaly: hasGeoAnomaly,
            message: ''
        };
    } catch (e) {
        return { blocked: false, failureCount: 0, message: '' };
    }
}

/**
 * Clear security lockout (for user-initiated reset)
 */
function clearSecurityLockout() {
    localStorage.removeItem(FAILED_ATTEMPTS_KEY);
    localStorage.removeItem(IP_HISTORY_KEY);
    console.log('[Security] Lockout cleared');
}

/**
 * Adaptive lockout threshold calculation
 * Accounts for travel patterns to reduce false positives
 * @param {number} baseThreshold - Default threshold
 * @param {string} operation - Operation being checked
 * @returns {number} Adjusted threshold
 */
function calculateAdaptiveThreshold(baseThreshold, operation) {
    const geoChanges = countRecentGeoChanges();

    // Get timing pattern of geo changes
    const stored = localStorage.getItem(IP_HISTORY_KEY);
    if (!stored || geoChanges <= 3) {
        return baseThreshold; // Normal threshold
    }

    try {
        const history = JSON.parse(stored);
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        const recentEntries = history.filter(h => h.timestamp > oneHourAgo);

        if (recentEntries.length < 2) {
            return baseThreshold;
        }

        // Calculate average time between geo changes
        let totalGaps = 0;
        for (let i = 1; i < recentEntries.length; i++) {
            totalGaps += recentEntries[i].timestamp - recentEntries[i - 1].timestamp;
        }
        const avgGap = totalGaps / (recentEntries.length - 1);

        // Travel pattern: changes spread over 10+ minutes each
        // Attack pattern: rapid changes within seconds
        if (avgGap > 10 * 60 * 1000) { // > 10 min between changes = likely travel
            console.log('[Security] Detected travel pattern - increasing tolerance');
            return Math.floor(baseThreshold * 1.5);
        } else if (avgGap < 60 * 1000) { // < 1 min = suspicious
            console.warn('[Security] Rapid geo changes detected - reducing threshold');
            return Math.floor(baseThreshold / 2);
        }

        return baseThreshold;
    } catch (e) {
        return baseThreshold;
    }
}

// Export functions
export {
    // Rate limiting
    isRateLimited,

    // Failed attempt tracking
    recordFailedAttempt,
    recordConnectionHash,

    // Geographic anomaly detection
    countRecentGeoChanges,

    // Suspicious activity checks
    checkSuspiciousActivity,

    // Lockout management
    clearSecurityLockout,

    // Adaptive thresholds
    calculateAdaptiveThreshold
};