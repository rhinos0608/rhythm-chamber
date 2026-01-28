/**
 * Memory Tab Updates
 *
 * Handles updating the memory tab with current metrics.
 *
 * @module observability/updates/memory
 */

import { PerformanceProfiler } from '../../services/performance-profiler.js';

/**
 * Update memory tab with current metrics
 * @param {HTMLElement} container - Dashboard container
 */
export function updateMemoryTab(container) {
    if (!PerformanceProfiler) return;

    const memoryStats = PerformanceProfiler.getMemoryStatistics();

    // Update gauge and stats
    updateElement(container, 'memory-percentage',
        `${memoryStats.currentUsage?.toFixed(1) || '--'}%`);

    if (memoryStats.currentBytes) {
        const bytes = memoryStats.currentBytes;
        updateElement(container, 'memory-used',
            `${(bytes.used / 1024 / 1024).toFixed(1)} MB`);
        updateElement(container, 'memory-total',
            `${(bytes.total / 1024 / 1024).toFixed(1)} MB`);
        updateElement(container, 'memory-limit',
            `${(bytes.limit / 1024 / 1024).toFixed(1)} MB`);
    }

    updateElement(container, 'memory-trend', memoryStats.usageTrend || '--');
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
