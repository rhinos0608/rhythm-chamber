/**
 * Adaptive Rate Limiter with System Load Awareness
 *
 * Rate limiting that adapts to system performance and prevents event storms.
 * Uses EWMA (Exponentially Weighted Moving Average) for smooth rate adjustments.
 *
 * HNW Considerations:
 * - Hierarchy: Single authority for rate limiting decisions
 * - Network: Prevents cascade failures from event storms
 * - Wave: EWMA smooths rate changes over time
 *
 * @module utils/adaptive-rate-limiter
 */

// Default EventBus instance (fallback if not injected)
let defaultEventBus = null;

/**
 * Set the default EventBus for this module
 * @param {Object} eventBus - EventBus instance
 */
export function setDefaultEventBus(eventBus) {
    defaultEventBus = eventBus;
}

// ==========================================
// Rate Limiter Configuration
// ==========================================

/**
 * Default rate limiter configuration
 */
export const DEFAULT_CONFIG = {
    // Rate limits
    maxEventsPerSecond: 100,
    minEventsPerSecond: 10,

    // EWMA smoothing factor (0-1, lower = smoother)
    ewmaAlpha: 0.2,

    // System load thresholds
    cpuThresholdHigh: 80, // CPU % considered high load
    cpuThresholdLow: 50, // CPU % considered low load
    memoryThresholdHigh: 90, // Memory % considered high load
    latencyThresholdHigh: 100, // Event processing latency (ms) considered high

    // Rate adjustment factors
    rateDecreaseFactor: 0.5, // Decrease rate by 50% on high load
    rateIncreaseFactor: 1.1, // Increase rate by 10% on low load

    // Sampling
    sampleWindowMs: 1000, // Window for rate calculation
    performanceSampleSize: 50, // Number of latency samples to track
};

// ==========================================
// Rate Limiter State
// ==========================================

/**
 * Rate limiter instance
 * @typedef {Object} RateLimiterInstance
 * @property {string} name - Limiter name
 * @property {number} currentRate - Current rate limit (events/sec)
 * @property {number} targetRate - Target rate based on system load
 * @property {number} eventCount - Events in current window
 * @property {number} windowStart - Current window start timestamp
 * @property {Array<number>} latencySamples - Recent event processing latencies
 * @property {number} lastAdjustment - Last rate adjustment timestamp
 * @property {Object} config - Rate limiter configuration
 */

/**
 * Active rate limiters
 * @type {Map<string, RateLimiterInstance>}
 */
const limiters = new Map();

/**
 * System performance metrics
 * @type {Object}
 */
const systemMetrics = {
    cpuUsage: 0,
    memoryUsage: 0,
    eventLatency: 0,
    lastUpdate: Date.now(),
};

// ==========================================
// Rate Limiter Management
// ==========================================

/**
 * Create or get a rate limiter
 *
 * @param {string} name - Rate limiter name
 * @param {Object} config - Configuration override
 * @returns {RateLimiterInstance} Rate limiter instance
 */
export function createRateLimiter(name, config = {}) {
    if (!limiters.has(name)) {
        const cfg = { ...DEFAULT_CONFIG, ...config };

        limiters.set(name, {
            name,
            currentRate: cfg.maxEventsPerSecond,
            targetRate: cfg.maxEventsPerSecond,
            eventCount: 0,
            windowStart: Date.now(),
            latencySamples: [],
            lastAdjustment: Date.now(),
            config: cfg,
        });

        const DEBUG = globalThis.DEBUG ?? false;
        if (DEBUG) {
            console.log(
                `[AdaptiveRateLimiter] Rate limiter created: ${name} (max: ${cfg.maxEventsPerSecond} events/sec)`
            );
        }
    }

    return limiters.get(name);
}

/**
 * Check if an event should be allowed
 *
 * @param {string} name - Rate limiter name
 * @returns {{ allowed: boolean, currentRate: number, reason?: string }}
 */
export function checkLimit(name) {
    const limiter = limiters.get(name);
    if (!limiter) {
        // Create with default config if not exists
        return { allowed: true, currentRate: DEFAULT_CONFIG.maxEventsPerSecond };
    }

    const now = Date.now();
    const windowElapsed = now - limiter.windowStart;

    // Reset window if expired
    if (windowElapsed >= limiter.config.sampleWindowMs) {
        limiter.windowStart = now;
        limiter.eventCount = 0;

        // Adjust rate based on system performance
        adjustRate(limiter);
    }

    // Check if rate limit exceeded
    if (limiter.eventCount >= limiter.currentRate) {
        return {
            allowed: false,
            currentRate: limiter.currentRate,
            reason: `Rate limit exceeded (${limiter.eventCount}/${limiter.currentRate} events/sec)`,
        };
    }

    limiter.eventCount++;
    return {
        allowed: true,
        currentRate: limiter.currentRate,
    };
}

/**
 * Record event processing latency
 *
 * @param {string} name - Rate limiter name
 * @param {number} latencyMs - Processing latency in milliseconds
 */
export function recordLatency(name, latencyMs) {
    const limiter = limiters.get(name);
    if (!limiter) return;

    limiter.latencySamples.push(latencyMs);

    // Keep only recent samples
    if (limiter.latencySamples.length > limiter.config.performanceSampleSize) {
        limiter.latencySamples.shift();
    }
}

/**
 * Adjust rate based on system performance
 *
 * @param {RateLimiterInstance} limiter - Rate limiter instance
 * @param {Object} eventBus - Optional EventBus instance (HNW compliance)
 */
function adjustRate(limiter, eventBus = defaultEventBus) {
    const cfg = limiter.config;
    const now = Date.now();

    // Minimum 5 seconds between adjustments
    if (now - limiter.lastAdjustment < 5000) {
        return;
    }

    // Calculate average latency
    const avgLatency =
        limiter.latencySamples.length > 0
            ? limiter.latencySamples.reduce((a, b) => a + b, 0) / limiter.latencySamples.length
            : 0;

    // Determine system load state
    const highLoad =
        systemMetrics.cpuUsage >= cfg.cpuThresholdHigh ||
        systemMetrics.memoryUsage >= cfg.memoryThresholdHigh ||
        avgLatency >= cfg.latencyThresholdHigh;

    const lowLoad =
        systemMetrics.cpuUsage <= cfg.cpuThresholdLow &&
        systemMetrics.memoryUsage < cfg.memoryThresholdHigh &&
        avgLatency < cfg.latencyThresholdHigh;

    // Calculate target rate using EWMA
    if (highLoad) {
        limiter.targetRate = limiter.targetRate * cfg.rateDecreaseFactor;
    } else if (lowLoad) {
        limiter.targetRate = limiter.targetRate * cfg.rateIncreaseFactor;
    }

    // Clamp target rate to min/max
    limiter.targetRate = Math.max(
        cfg.minEventsPerSecond,
        Math.min(cfg.maxEventsPerSecond, limiter.targetRate)
    );

    // Apply EWMA smoothing to current rate
    // newRate = alpha * targetRate + (1 - alpha) * currentRate
    const newRate = cfg.ewmaAlpha * limiter.targetRate + (1 - cfg.ewmaAlpha) * limiter.currentRate;
    const oldRate = limiter.currentRate;
    limiter.currentRate = Math.round(newRate);
    limiter.lastAdjustment = now;

    // Log significant rate changes
    if (Math.abs(limiter.currentRate - oldRate) > 5) {
        const action = limiter.currentRate < oldRate ? 'decreased' : 'increased';
        const DEBUG = globalThis.DEBUG ?? false;
        if (DEBUG) {
            console.log(
                `[AdaptiveRateLimiter] ${limiter.name}: Rate ${action} ` +
                    `${oldRate} → ${limiter.currentRate} events/sec ` +
                    `(target: ${Math.round(limiter.targetRate)}, avg latency: ${Math.round(avgLatency)}ms)`
            );
        }

        // Emit rate adjustment event
        eventBus?.emit('ratelimit:adjustment', {
            limiter: limiter.name,
            oldRate,
            newRate: limiter.currentRate,
            targetRate: limiter.targetRate,
            avgLatency,
            systemLoad: {
                cpu: systemMetrics.cpuUsage,
                memory: systemMetrics.memoryUsage,
            },
        });
    }
}

/**
 * Update system metrics
 *
 * @param {Object} metrics - System performance metrics
 * @param {number} metrics.cpuUsage - CPU usage percentage (0-100)
 * @param {number} metrics.memoryUsage - Memory usage percentage (0-100)
 * @param {number} metrics.eventLatency - Event processing latency (ms)
 */
export function updateSystemMetrics(metrics) {
    if (metrics.cpuUsage !== undefined) {
        systemMetrics.cpuUsage = metrics.cpuUsage;
    }
    if (metrics.memoryUsage !== undefined) {
        systemMetrics.memoryUsage = metrics.memoryUsage;
    }
    if (metrics.eventLatency !== undefined) {
        systemMetrics.eventLatency = metrics.eventLatency;
    }
    systemMetrics.lastUpdate = Date.now();
}

/**
 * Get rate limiter status
 *
 * @param {string} name - Rate limiter name
 * @returns {Object} Rate limiter status
 */
export function getStatus(name) {
    const limiter = limiters.get(name);
    if (!limiter) {
        return {
            name,
            exists: false,
        };
    }

    const avgLatency =
        limiter.latencySamples.length > 0
            ? limiter.latencySamples.reduce((a, b) => a + b, 0) / limiter.latencySamples.length
            : 0;

    return {
        name,
        exists: true,
        currentRate: limiter.currentRate,
        targetRate: Math.round(limiter.targetRate),
        utilization: (limiter.eventCount / limiter.currentRate) * 100,
        avgLatency: Math.round(avgLatency),
        sampleCount: limiter.latencySamples.length,
        config: limiter.config,
    };
}

/**
 * Get all rate limiter statuses
 *
 * @returns {Object} Map of limiter names to status
 */
export function getAllStatus() {
    const statuses = {};
    for (const name of limiters.keys()) {
        statuses[name] = getStatus(name);
    }
    return statuses;
}

/**
 * Reset a rate limiter
 *
 * @param {string} name - Rate limiter name
 */
export function reset(name) {
    const limiter = limiters.get(name);
    if (limiter) {
        limiter.currentRate = limiter.config.maxEventsPerSecond;
        limiter.targetRate = limiter.config.maxEventsPerSecond;
        limiter.eventCount = 0;
        limiter.windowStart = Date.now();
        limiter.latencySamples = [];
        const DEBUG = globalThis.DEBUG ?? false;
        if (DEBUG) {
            console.log(`[AdaptiveRateLimiter] ${name}: Rate limiter reset`);
        }
    }
}

/**
 * Remove a rate limiter
 *
 * @param {string} name - Rate limiter name
 */
export function remove(name) {
    limiters.delete(name);
    const DEBUG = globalThis.DEBUG ?? false;
    if (DEBUG) {
        console.log(`[AdaptiveRateLimiter] ${name}: Rate limiter removed`);
    }
}

/**
 * Get system metrics
 *
 * @returns {Object} Current system metrics
 */
export function getSystemMetrics() {
    return { ...systemMetrics };
}

// Export
export default {
    DEFAULT_CONFIG,
    createRateLimiter,
    checkLimit,
    recordLatency,
    updateSystemMetrics,
    getStatus,
    getAllStatus,
    reset,
    remove,
    getSystemMetrics,
};

const DEBUG = globalThis.DEBUG ?? false;
if (DEBUG) {
    console.log('[AdaptiveRateLimiter] Module loaded with adaptive rate limiting');
}
