/**
 * Overview Tab Updates
 *
 * Handles updating the overview tab with current metrics.
 *
 * @module observability/updates/overview
 */

import { PerformanceProfiler } from '../../services/performance-profiler.js';

/**
 * Update overview tab with current metrics
 * @param {HTMLElement} container - Dashboard container
 */
export function updateOverviewTab(container) {
    // System status
    const systemStatus = getSystemStatus();
    updateElement(container, 'metric-system-status', systemStatus.text);

    // Measurement count
    if (PerformanceProfiler) {
        const stats = PerformanceProfiler.getStatistics();
        updateElement(container, 'metric-measurement-count', stats.count);
    }

    // Memory usage
    if (PerformanceProfiler) {
        const memoryStats = PerformanceProfiler.getMemoryStatistics();
        updateElement(container, 'metric-memory-usage',
            `${memoryStats.currentUsage?.toFixed(1) || '--'}%`);
        updateElement(container, 'metric-memory-trend',
            memoryStats.usageTrend || 'Stable');
    }

    // Degradation alerts
    if (PerformanceProfiler) {
        const alerts = PerformanceProfiler.getDegradationAlerts();
        updateElement(container, 'metric-alert-count', alerts.length);

        const indicator = container.querySelector('#metric-alert-indicator');
        if (indicator) {
            const criticalCount = alerts.filter(a => a.severity === 'critical').length;
            indicator.className = `metric-indicator ${criticalCount > 0 ? 'critical' : alerts.length > 0 ? 'warning' : 'good'}`;
        }

        // Update alerts list
        updateAlertsList(container, alerts);
    }
}

/**
 * Get system status based on alerts
 * @returns {Object} System status object
 */
function getSystemStatus() {
    if (PerformanceProfiler) {
        const criticalAlerts = PerformanceProfiler.getDegradationAlerts('critical');
        const warningAlerts = PerformanceProfiler.getDegradationAlerts('warning');

        if (criticalAlerts.length > 0) {
            return { text: 'Critical', class: 'critical' };
        } else if (warningAlerts.length > 0) {
            return { text: 'Warning', class: 'warning' };
        }
    }

    return { text: 'Healthy', class: 'good' };
}

/**
 * Update alerts list
 * @param {HTMLElement} container - Dashboard container
 * @param {Array} alerts - Array of alerts
 */
function updateAlertsList(container, alerts) {
    const alertsList = container.querySelector('#alerts-list');

    if (alerts.length === 0) {
        alertsList.innerHTML = '<div class="no-alerts">No recent alerts</div>';
        return;
    }

    const recentAlerts = alerts.slice(-10).reverse();
    alertsList.innerHTML = recentAlerts.map(alert => `
        <div class="alert-item ${escapeHtml(alert.severity)}">
            <div class="alert-message">${escapeHtml(alert.message)}</div>
            <div class="alert-details">
                <span class="alert-category">${escapeHtml(alert.category)}</span>
                <span class="alert-time">${new Date(alert.timestamp).toLocaleTimeString()}</span>
            </div>
        </div>
    `).join('');
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

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
