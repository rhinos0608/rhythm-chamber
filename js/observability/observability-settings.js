/**
 * Observability Settings Integration
 *
 * Provides observability-related settings UI and functions that integrate
 * with the main settings modal. This module extends the settings functionality
 * with performance monitoring and metrics export capabilities.
 *
 * @module ObservabilitySettings
 * @author Rhythm Chamber Architecture Team
 * @version 1.0.0
 */

import { Storage } from '../storage.js';
import { PerformanceProfiler } from '../services/performance-profiler.js';
import { CoreWebVitalsTracker } from './core-web-vitals.js';
import { MetricsExporter } from './metrics-exporter.js';
import { escapeHtml } from '../utils/html-escape.js';
import ObservabilityController from '../controllers/observability-controller.js';

/**
 * Initialize observability settings in the settings modal
 */
export function initObservabilitySettings() {
    // Add observability section to settings modal after it's created
    const settingsBody = document.querySelector('.settings-body');
    if (!settingsBody) return;

    // Check if observability section already exists
    if (document.getElementById('observability-section')) return;

    // Create observability section
    const observabilitySection = document.createElement('div');
    observabilitySection.className = 'settings-section';
    observabilitySection.id = 'observability-section';

    // SAFE: Static HTML template with no user input
    // SECURITY FIX: Replaced inline onclick/onchange with data-action/data-change pattern
    observabilitySection.innerHTML = `
        <h3>🔍 Observability & Performance</h3>
        <p class="settings-description">
            Monitor application performance, Core Web Vitals, and system health.
            Export metrics for external analysis tools.
        </p>

        <!-- Observability Dashboard Button -->
        <div class="settings-field">
            <button class="btn btn-primary" data-action="observability-show-dashboard">
                📊 Open Observability Dashboard
            </button>
            <span class="settings-hint">Real-time performance monitoring and metrics</span>
        </div>

        <!-- Performance Metrics Overview -->
        <div class="observability-overview">
            <div class="metric-card">
                <div class="metric-label">Web Vitals Status</div>
                <div class="metric-value" id="observability-vitals-status">Loading...</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Memory Usage</div>
                <div class="metric-value" id="observability-memory-status">Loading...</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Performance Score</div>
                <div class="metric-value" id="observability-performance-score">Loading...</div>
            </div>
        </div>

        <!-- Quick Export -->
        <div class="settings-field">
            <label for="observability-export-format">Quick Export</label>
            <select id="observability-export-format">
                <option value="json">JSON (Full Metrics)</option>
                <option value="csv">CSV (Spreadsheet)</option>
                <option value="prometheus">Prometheus (Monitoring)</option>
            </select>
            <button class="btn btn-secondary" data-action="observability-export-metrics">
                Export Now
            </button>
            <span class="settings-hint">Download current metrics snapshot</span>
        </div>

        <!-- Observability Settings -->
        <details class="settings-advanced">
            <summary>Advanced Observability Settings</summary>

            <div class="settings-field">
                <label>
                    <input type="checkbox" id="observability-enabled" checked data-change="observability-toggle-monitoring">
                    Enable Performance Monitoring
                </label>
                <span class="settings-hint">Track performance metrics with < 5% overhead</span>
            </div>

            <div class="settings-field">
                <label>
                    <input type="checkbox" id="observability-memory" checked data-change="observability-toggle-memory">
                    Enable Memory Profiling
                </label>
                <span class="settings-hint">Track memory usage trends (Chrome only)</span>
            </div>

            <div class="settings-field">
                <label for="observability-interval">Update Interval</label>
                <select id="observability-interval" data-change="observability-set-interval">
                    <option value="1000">1 second (Real-time)</option>
                    <option value="5000" selected>5 seconds (Standard)</option>
                    <option value="10000">10 seconds (Low overhead)</option>
                    <option value="30000">30 seconds (Minimal)</option>
                </select>
                <span class="settings-hint">Dashboard refresh rate (lower = more CPU)</span>
            </div>
        </details>
    `;

    // Find the storage management section and insert after it
    const storageSection = settingsBody.querySelector('.settings-section:nth-last-child(1)');
    if (storageSection && storageSection.parentNode) {
        storageSection.parentNode.insertBefore(observabilitySection, storageSection.nextSibling);
    } else {
        settingsBody.appendChild(observabilitySection);
    }

    // SECURITY FIX: Setup event delegation for data-action pattern (replaces inline onclick)
    setupEventDelegation(observabilitySection);

    // Initialize observability metrics
    updateObservabilityMetrics();
}

/**
 * Setup event delegation for observability settings
 * SECURITY FIX: Replaces inline onclick/onchange handlers with event delegation
 * @param {HTMLElement} container - Container element for delegation
 */
function setupEventDelegation(container) {
    // Handle click events for data-action
    container.addEventListener('click', e => {
        const button = e.target.closest('[data-action]');
        if (button) {
            const action = button.dataset.action;
            e.preventDefault();

            switch (action) {
                case 'observability-show-dashboard':
                    showDashboard();
                    break;
                case 'observability-export-metrics':
                    exportMetrics();
                    break;
            }
        }
    });

    // Handle change events for data-change
    container.addEventListener('change', e => {
        const element = e.target.closest('[data-change]');
        if (element) {
            const action = element.dataset.change;

            switch (action) {
                case 'observability-toggle-monitoring':
                    toggleMonitoring(element.checked);
                    break;
                case 'observability-toggle-memory':
                    toggleMemoryProfiling(element.checked);
                    break;
                case 'observability-set-interval':
                    setUpdateInterval(element.value);
                    break;
            }
        }
    });
}

/**
 * Update observability metrics display
 */
function updateObservabilityMetrics() {
    if (!PerformanceProfiler || !CoreWebVitalsTracker) return;

    // Update Web Vitals status
    const vitalsStatus = document.getElementById('observability-vitals-status');
    if (vitalsStatus) {
        const vitals = CoreWebVitalsTracker.getWebVitalsSummary();
        const vitalsCount = Object.values(vitals.vitals || {}).filter(v => v.latest).length;
        vitalsStatus.textContent = vitalsCount > 0 ? 'Active' : 'Loading...';
    }

    // Update Memory usage
    const memoryStatus = document.getElementById('observability-memory-status');
    if (memoryStatus) {
        const memoryStats = PerformanceProfiler.getMemoryStatistics();
        if (memoryStats.currentUsage !== null) {
            memoryStatus.textContent = `${memoryStats.currentUsage.toFixed(1)}%`;
            memoryStatus.style.color = memoryStats.currentUsage > 80 ? '#C00' : '#0C0';
        } else {
            memoryStatus.textContent = 'N/A';
        }
    }

    // Update Performance score
    const perfScore = document.getElementById('observability-performance-score');
    if (perfScore) {
        const stats = PerformanceProfiler.getStatistics();
        const score = calculatePerformanceScore(stats);
        perfScore.textContent = score;
        perfScore.style.color = score > 80 ? '#0C0' : score > 50 ? '#CC0' : '#C00';
    }
}

/**
 * Calculate performance score from statistics
 */
function calculatePerformanceScore(stats) {
    if (!stats || stats.count === 0) return 'N/A';

    // Simple score based on average duration
    const avgDuration = stats.avgDuration || 0;
    if (avgDuration < 100) return 'Excellent';
    if (avgDuration < 500) return 'Good';
    if (avgDuration < 1000) return 'Fair';
    return 'Poor';
}

/**
 * Show observability dashboard
 */
function showDashboard() {
    if (ObservabilityController) {
        ObservabilityController.showDashboard();
    } else {
        console.error('[ObservabilitySettings] ObservabilityController not available');
    }
}

/**
 * Export observability metrics
 */
async function exportMetrics() {
    if (!MetricsExporter) {
        console.error('[ObservabilitySettings] MetricsExporter not available');
        return;
    }

    const formatSelect = document.getElementById('observability-export-format');
    const format = formatSelect?.value || 'json';

    try {
        await ObservabilityController.exportNow(format, {
            includeMemory: true,
            includeWebVitals: true,
        });
        console.log('[ObservabilitySettings] Metrics exported successfully');
    } catch (error) {
        console.error('[ObservabilitySettings] Export failed:', error);
    }
}

/**
 * Toggle performance monitoring
 * HNW Hierarchy: Persists to IndexedDB for consistent settings source
 *
 * @param {boolean} enabled - Whether monitoring is enabled
 */
async function toggleMonitoring(enabled) {
    if (PerformanceProfiler) {
        if (enabled) {
            PerformanceProfiler.enable();
            console.log('[ObservabilitySettings] Performance monitoring enabled');
        } else {
            PerformanceProfiler.disable();
            console.log(
                '[ObservabilitySettings] Performance monitoring disabled (<5% CPU savings)'
            );
        }
    }

    if (CoreWebVitalsTracker) {
        if (enabled) {
            CoreWebVitalsTracker.enable();
        } else {
            CoreWebVitalsTracker.disable();
        }
    }

    // Save preference to IndexedDB (consistent with HNW settings cascade)
    if (Storage.setConfig) {
        try {
            await Storage.setConfig('observability_enabled', enabled);
        } catch (e) {
            console.warn('[ObservabilitySettings] Failed to save preference:', e);
        }
    }
}

/**
 * Toggle memory profiling
 */
function toggleMemoryProfiling(enabled) {
    if (PerformanceProfiler) {
        if (enabled) {
            PerformanceProfiler.enableMemoryProfiling();
        } else {
            PerformanceProfiler.disableMemoryProfiling();
        }
    }

    // Save preference
    localStorage.setItem('observability_memory', enabled);
}

/**
 * Set dashboard update interval
 */
function setUpdateInterval(intervalMs) {
    if (ObservabilityController) {
        // Update the controller's interval
        ObservabilityController._updateInterval = parseInt(intervalMs);
    }

    // Save preference
    localStorage.setItem('observability_interval', intervalMs);
}

/**
 * Load observability settings and apply them
 * HNW Hierarchy: Called on app init to respect saved preferences
 *
 * @returns {Promise<void>}
 */
async function loadObservabilitySettings() {
    let enabled = true; // Default: enabled

    // Try IndexedDB first
    if (Storage.getConfig) {
        try {
            const stored = await Storage.getConfig('observability_enabled');
            if (stored !== undefined && stored !== null) {
                enabled = stored;
            }
        } catch (e) {
            console.warn('[ObservabilitySettings] Failed to load preference:', e);
        }
    }

    // Apply the setting
    if (!enabled) {
        // Disable monitoring if user previously disabled
        if (PerformanceProfiler) {
            PerformanceProfiler.disable();
        }
        if (CoreWebVitalsTracker) {
            CoreWebVitalsTracker.disable();
        }
        console.log('[ObservabilitySettings] Monitoring disabled per user preference');
    }

    // Update checkbox state in UI if it exists
    const checkbox = document.getElementById('observability-enabled');
    if (checkbox) {
        checkbox.checked = enabled;
    }

    return enabled;
}

// Export observability settings API
export const ObservabilitySettings = {
    initObservabilitySettings,
    updateObservabilityMetrics,
    showDashboard,
    exportMetrics,
    toggleMonitoring,
    toggleMemoryProfiling,
    setUpdateInterval,
    loadObservabilitySettings,
};

console.log('[ObservabilitySettings] Module loaded');
