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

/** @type {Map<string, { id: string, origin: string, startTime: number, endTime: number | null, chain: Array<{ node: string, parent: string | null, timestamp: number }> }>} */
const waves = new Map();

/** @type {string[]} */
let criticalEvents = [];

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
// Wave Context Tracking
// ==========================================

/**
 * Generate a UUID v4 for wave identification
 * @returns {string} A UUID v4 string
 */
function generateUUID() {
    // Use crypto.randomUUID if available (modern browsers), otherwise fall back to Math.random
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback implementation compatible with older environments
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Start a new wave context with a unique ID and origin
 * @param {string} origin - The origin of the wave (e.g., 'user:upload_file')
 * @returns {string} The wave ID (UUID)
 */
function startWave(origin) {
    const waveId = generateUUID();
    waves.set(waveId, {
        id: waveId,
        origin,
        startTime: Date.now(),
        endTime: null,
        chain: []
    });
    return waveId;
}

/**
 * Record a node in the wave chain with parent reference
 * @param {string} nodeName - The name of the node (e.g., 'event:test_event')
 * @param {string} waveId - The wave ID to add the node to
 */
function recordNode(nodeName, waveId) {
    const wave = waves.get(waveId);
    if (!wave) {
        console.warn(`[WaveTelemetry] Wave not found: ${waveId}`);
        return;
    }

    const parent = wave.chain.length > 0 ? wave.chain[wave.chain.length - 1].node : null;
    wave.chain.push({
        node: nodeName,
        parent,
        timestamp: Date.now()
    });
}

/**
 * End a wave and calculate total latency and bottlenecks
 * @param {string} waveId - The wave ID to end
 * @returns {{ totalLatency: number, bottlenecks: Array<{ node: string, latency: number }> } | null}
 */
function endWave(waveId) {
    const wave = waves.get(waveId);
    if (!wave) {
        console.warn(`[WaveTelemetry] Wave not found: ${waveId}`);
        return null;
    }

    wave.endTime = Date.now();

    // Calculate total latency based on the chain timestamps
    // If there are nodes, use the time from wave start to last node
    // Otherwise use endTime - startTime
    let totalLatency;
    if (wave.chain.length > 0) {
        const lastNode = wave.chain[wave.chain.length - 1];
        totalLatency = lastNode.timestamp - wave.startTime;
    } else {
        totalLatency = wave.endTime - wave.startTime;
    }

    // Calculate bottlenecks (nodes with latency > 100ms)
    const bottlenecks = [];
    for (let i = 0; i < wave.chain.length; i++) {
        const node = wave.chain[i];
        let latency = 0;

        if (i === 0) {
            // First node: time from wave start
            latency = node.timestamp - wave.startTime;
        } else {
            // Subsequent nodes: time from previous node
            latency = node.timestamp - wave.chain[i - 1].timestamp;
        }

        if (latency > 100) {
            bottlenecks.push({
                node: node.node,
                latency
            });
        }
    }

    // Sort bottlenecks by latency descending
    bottlenecks.sort((a, b) => b.latency - a.latency);

    return {
        totalLatency,
        bottlenecks
    };
}

/**
 * Get a wave by ID
 * @param {string} waveId - The wave ID
 * @returns {Object | undefined} The wave object or undefined if not found
 */
function getWave(waveId) {
    return waves.get(waveId);
}

/**
 * Set the critical events whitelist
 * @param {string[]} events - Array of critical event names
 */
function setCriticalEvents(events) {
    criticalEvents = [...events];
}

/**
 * Get the critical events whitelist
 * @returns {string[]} Array of critical event names
 */
function getCriticalEvents() {
    return [...criticalEvents];
}

/**
 * Check if an event is critical
 * @param {string} eventName - The event name to check
 * @returns {boolean} True if the event is critical
 */
function isCriticalEvent(eventName) {
    return criticalEvents.includes(eventName);
}

/**
 * Clear all waves (for testing)
 */
function clearWaves() {
    waves.clear();
    criticalEvents = [];
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

    // Wave Context Tracking
    startWave,
    recordNode,
    endWave,
    getWave,
    setCriticalEvents,
    getCriticalEvents,
    isCriticalEvent,
    _clearWaves: clearWaves,

    // Configuration (read-only)
    ANOMALY_THRESHOLD,
    MAX_SAMPLES
};

console.log('[WaveTelemetry] Wave timing instrumentation loaded');
