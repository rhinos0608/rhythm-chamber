/**
 * Wave Visualizer Service
 *
 * Renders wave chains as HTML timelines and analyzes performance bottlenecks.
 * Provides visualization tools for wave telemetry data collected by WaveTelemetry.
 *
 * HNW Wave: Visual representation of wave propagation through the system
 * for debugging performance issues and identifying bottlenecks.
 *
 * @module services/wave-visualizer
 */

// ==========================================
// Constants
// ==========================================

const DEFAULT_BOTTLENECK_THRESHOLD = 100; // milliseconds

// ==========================================
// HTML Escape Utility
// ==========================================

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {string} str - The string to escape
 * @returns {string} The escaped string
 */
function escapeHtml(str) {
    if (typeof str !== 'string') {
        return '';
    }
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ==========================================
// Rendering Functions
// ==========================================

/**
 * Render a wave as an HTML timeline visualization
 * @param {Object} wave - The wave object from WaveTelemetry.getWave()
 * @param {Object} summary - The summary object from WaveTelemetry.endWave()
 * @returns {string} HTML string with timeline visualization
 */
function render(wave, summary) {
    if (!wave) {
        return '<div class="wave-timeline wave-error">No wave data available</div>';
    }

    const bottleneckNodes = new Set(
        (summary?.bottlenecks || []).map(b => b.node)
    );

    let html = '<div class="wave-timeline">';

    // Wave header
    html += '<div class="wave-header">';
    html += `<span class="wave-origin">${escapeHtml(wave.origin)}</span>`;
    if (summary?.totalLatency !== undefined) {
        html += `<span class="wave-latency">${summary.totalLatency}ms</span>`;
    }
    html += '</div>';

    // Wave chain
    html += '<div class="wave-chain">';

    for (let i = 0; i < wave.chain.length; i++) {
        const node = wave.chain[i];
        const isBottleneck = bottleneckNodes.has(node.node);

        html += '<div class="wave-node';
        if (isBottleneck) {
            html += ' bottleneck';
        }
        html += '">';

        html += `<span class="node-name">${escapeHtml(node.node)}</span>`;

        // Calculate latency for this node
        let latency = 0;
        if (i === 0) {
            latency = node.timestamp - wave.startTime;
        } else {
            latency = node.timestamp - wave.chain[i - 1].timestamp;
        }
        html += `<span class="node-latency">${latency}ms</span>`;

        html += '</div>';
    }

    html += '</div>'; // End wave-chain
    html += '</div>'; // End wave-timeline

    return html;
}

/**
 * Find nodes in the wave chain that exceed the given latency threshold
 * @param {Object} wave - The wave object from WaveTelemetry.getWave()
 * @param {number} threshold - Latency threshold in milliseconds (default: 100)
 * @returns {Array<{ node: string, latency: number }>} Array of bottleneck nodes
 */
function findBottlenecks(wave, threshold = DEFAULT_BOTTLENECK_THRESHOLD) {
    if (!wave || !wave.chain || wave.chain.length === 0) {
        return [];
    }

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

        if (latency > threshold) {
            bottlenecks.push({
                node: node.node,
                latency
            });
        }
    }

    // Sort by latency descending
    bottlenecks.sort((a, b) => b.latency - a.latency);

    return bottlenecks;
}

/**
 * Get the critical path through the wave chain
 * For linear chains, returns the full chain ordered by timestamp.
 * Future enhancement: handle branching with parallel paths.
 * @param {Object} wave - The wave object from WaveTelemetry.getWave()
 * @returns {Array<{ node: string, latency: number }>} Nodes in the critical path
 */
function getCriticalPath(wave) {
    if (!wave || !wave.chain || wave.chain.length === 0) {
        return [];
    }

    // For linear chains (current implementation), the critical path
    // is the entire chain with latency calculations
    const path = [];

    for (let i = 0; i < wave.chain.length; i++) {
        const node = wave.chain[i];
        let latency = 0;

        if (i === 0) {
            latency = node.timestamp - wave.startTime;
        } else {
            latency = node.timestamp - wave.chain[i - 1].timestamp;
        }

        path.push({
            node: node.node,
            latency
        });
    }

    return path;
}

// ==========================================
// Public API
// ==========================================

export const WaveVisualizer = {
    render,
    findBottlenecks,
    getCriticalPath,
    escapeHtml,
    DEFAULT_BOTTLENECK_THRESHOLD
};

console.log('[WaveVisualizer] Wave visualization service loaded');
