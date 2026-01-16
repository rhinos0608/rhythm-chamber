/**
 * Wave Telemetry Service
 * 
 * Instruments actual timing of wave-based operations and detects anomalies.
 * Used for monitoring heartbeat intervals, event loop timing, and other
 * periodic operations.
 * 
 * HNW Wave: Provides visibility into timing patterns and variance
 * to detect scheduling issues and performance degradation.
 * 
 * @module services/wave-telemetry
 */

// ==========================================
// Configuration
// ==========================================

const ANOMALY_THRESHOLD = 0.20; // 20% variance triggers anomaly
const MAX_SAMPLES = 100;        // Keep last 100 samples per metric

// ==========================================
// State
// ==========================================

/** @type {Map<string, { samples: number[], expected: number | null }>} */
const metrics = new Map();

// ==========================================
// Core Functions
// ==========================================

/**
 * Record an actual timing measurement
 * @param {string} metric - Metric name (e.g., 'heartbeat_interval')
 * @param {number} actualMs - Actual measured time in milliseconds
 */
function record(metric, actualMs) {
    if (!Number.isFinite(actualMs) || actualMs < 0) {
        console.warn(`[WaveTelemetry] Invalid timing value for ${metric}: ${actualMs}`);
        return;
    }

    if (!metrics.has(metric)) {
        metrics.set(metric, { samples: [], expected: null });
    }

    const data = metrics.get(metric);
    data.samples.push(actualMs);

    // Keep only last MAX_SAMPLES samples
    if (data.samples.length > MAX_SAMPLES) {
        data.samples.shift();
    }
}

/**
 * Set the expected timing for a metric
 * @param {string} metric - Metric name
 * @param {number} expectedMs - Expected time in milliseconds
 */
function setExpected(metric, expectedMs) {
    if (!Number.isFinite(expectedMs) || expectedMs <= 0) {
        console.warn(`[WaveTelemetry] Invalid expected value for ${metric}: ${expectedMs}`);
        return;
    }

    if (!metrics.has(metric)) {
        metrics.set(metric, { samples: [], expected: expectedMs });
    } else {
        metrics.get(metric).expected = expectedMs;
    }
}

/**
 * Detect anomalies where actual timing varies from expected by more than threshold
 * @returns {Array<{ metric: string, expected: number, actual: number, variance: string }>}
 */
function detectAnomalies() {
    const anomalies = [];

    for (const [metric, data] of metrics) {
        // Need expected value and sufficient samples
        if (data.expected === null || data.samples.length < 10) {
            continue;
        }

        const avg = data.samples.reduce((a, b) => a + b, 0) / data.samples.length;
        const variance = Math.abs(avg - data.expected) / data.expected;

        if (variance > ANOMALY_THRESHOLD) {
            anomalies.push({
                metric,
                expected: data.expected,
                actual: Math.round(avg * 10) / 10,
                variance: (variance * 100).toFixed(1) + '%'
            });
            console.warn(`[WaveTelemetry] Anomaly detected for ${metric}: expected ${data.expected}ms, actual ${avg.toFixed(1)}ms (${(variance * 100).toFixed(1)}% variance)`);
        }
    }

    return anomalies;
}

/**
 * Get current status of all recorded metrics
 * @returns {Object} Status for each metric
 */
function getStatus() {
    const status = {};

    for (const [metric, data] of metrics) {
        const avg = data.samples.length > 0
            ? data.samples.reduce((a, b) => a + b, 0) / data.samples.length
            : null;

        const min = data.samples.length > 0 ? Math.min(...data.samples) : null;
        const max = data.samples.length > 0 ? Math.max(...data.samples) : null;

        status[metric] = {
            sampleCount: data.samples.length,
            expected: data.expected,
            average: avg !== null ? Math.round(avg * 10) / 10 : null,
            min: min !== null ? Math.round(min * 10) / 10 : null,
            max: max !== null ? Math.round(max * 10) / 10 : null,
            variance: (data.expected && avg)
                ? ((Math.abs(avg - data.expected) / data.expected) * 100).toFixed(1) + '%'
                : null
        };
    }

    return status;
}

/**
 * Reset all telemetry data
 */
function reset() {
    metrics.clear();
    console.log('[WaveTelemetry] All metrics cleared');
}

/**
 * Get raw samples for a specific metric (for debugging)
 * @param {string} metric - Metric name
 * @returns {number[] | null}
 */
function getSamples(metric) {
    return metrics.get(metric)?.samples || null;
}

// ==========================================
// Public API
// ==========================================

export const WaveTelemetry = {
    // Core operations
    record,
    setExpected,
    detectAnomalies,
    getStatus,

    // Lifecycle
    reset,

    // Debug
    getSamples,

    // Configuration (read-only)
    ANOMALY_THRESHOLD,
    MAX_SAMPLES
};

console.log('[WaveTelemetry] Wave timing instrumentation loaded');
