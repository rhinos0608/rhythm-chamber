/**
 * Performance Tab Updates
 *
 * Handles updating the performance tab with current metrics.
 *
 * @module observability/updates/performance
 */

import { PerformanceProfiler, PerformanceCategory } from '../../services/performance-profiler.js';

/**
 * Update performance tab with current metrics
 * @param {HTMLElement} container - Dashboard container
 */
export function updatePerformanceTab(container) {
    if (!PerformanceProfiler) return;

    for (const category of Object.values(PerformanceCategory)) {
        const stats = PerformanceProfiler.getStatistics(category);

        updateElement(container, `perf-${category}-avg`,
            `${stats.avgDuration.toFixed(2)} ms`);
        updateElement(container, `perf-${category}-p95`,
            `${stats.p95Duration.toFixed(2)} ms`);
        updateElement(container, `perf-${category}-count`, stats.count);
    }
}

/**
 * Update element content
 * @param {HTMLElement} container - Dashboard container
 * @param {string} id - Element ID
 * @param {string} content - New content
 */
function updateElement(container, id, content) {
    const element = container.querySelector(`#${id}`);
    if (element) {
        element.textContent = content;
    }
}
