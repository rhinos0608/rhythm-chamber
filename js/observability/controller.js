/**
 * Observability Controller (Refactored Facade)
 *
 * Manages the observability dashboard UI, including real-time metrics display,
 * performance charts, memory usage graphs, and export controls.
 *
 * This is a facade that delegates to specialized modules while maintaining
 * backward compatibility with the original API.
 *
 * @module ObservabilityController
 * @author Rhythm Chamber Architecture Team
 * @version 2.0.0
 */

import { PerformanceProfiler } from '../services/performance-profiler.js';
import { CoreWebVitalsTracker } from './core-web-vitals.js';
import { MetricsExporter, ExportFormat, ScheduleType } from './metrics-exporter.js';

// UI modules
import * as DashboardUI from './ui/dashboard.js';
import { setupTabs } from './ui/tabs.js';
import { setupActions } from './ui/actions.js';

// Update modules
import { updateOverviewTab } from './updates/overview.js';
import { updateWebVitalsTab } from './updates/vitals.js';
import { updatePerformanceTab } from './updates/performance.js';
import { updateMemoryTab } from './updates/memory.js';
import { updateExportsTab } from './updates/exports.js';

/**
 * Observability Controller Class
 */
export class ObservabilityController {
    /**
     * @private
     * @type {HTMLElement|null}
     */
    _container = null;

    /**
     * @private
     * @type {number}
     */
    _updateInterval = 5000;

    /**
     * @private
     * @type {number|null}
     */
    _intervalId = null;

    /**
     * @private
     * @type {boolean}
     */
    _isDashboardVisible = false;

    /**
     * @private
     * @type {Function|null}
     */
    _onShowDashboard = null;

    /**
     * @private
     * @type {Function|null}
     */
    _onHideDashboard = null;

    /**
     * @private
     * @type {Function|null}
     */
    _onToggleDashboard = null;

    /**
     * @private
     * @type {Function|null}
     */
    _onSettingsObservability = null;

    /**
     * @private
     * @type {Function|null}
     * Maintained for backward compatibility with tests
     */
    _onActionClick = null;

    /**
     * @private
     * @type {Function|null}
     */
    _tabCleanup = null;

    /**
     * @private
     * @type {Function|null}
     */
    _actionsCleanup = null;

    /**
     * @private
     * @type {HTMLElement[]}
     * Maintained for backward compatibility with tests
     */
    _tabElements = [];

    /**
     * @private
     * @type {Function[]}
     * Maintained for backward compatibility with tests
     */
    _tabClickHandlers = [];

    /**
     * Initialize the Observability Controller
     * @public
     * @param {HTMLElement} container - Container element for the dashboard
     * @param {Object} options - Configuration options
     * @param {number} options.updateInterval - Update interval in milliseconds
     */
    constructor(container = null, { updateInterval = 5000 } = {}) {
        this._container = container;
        this._updateInterval = updateInterval;

        // Create bound event handlers for proper cleanup
        this._onShowDashboard = () => this.showDashboard();
        this._onHideDashboard = () => this.hideDashboard();
        this._onToggleDashboard = () => this.toggleDashboard();
        this._onSettingsObservability = () => this.showDashboard();
        this._onActionClick = () => {}; // Placeholder for backward compatibility
    }

    /**
     * Initialize the observability controller
     * @public
     * @param {Object} dependencies - Application dependencies
     */
    init(dependencies = {}) {
        console.log('[ObservabilityController] Initializing');

        // Set up event listeners
        this._setupEventListeners();

        // Create dashboard UI
        this._createDashboardUI();

        console.log('[ObservabilityController] Initialized');
    }

    /**
     * Set up event listeners
     * @private
     */
    _setupEventListeners() {
        // Listen for observability-related events using bound handlers
        document.addEventListener('observability:show', this._onShowDashboard);
        document.addEventListener('observability:hide', this._onHideDashboard);
        document.addEventListener('observability:toggle', this._onToggleDashboard);

        // Listen for settings modal events
        document.addEventListener('settings:observability', this._onSettingsObservability);
    }

    /**
     * Create dashboard UI
     * @private
     */
    _createDashboardUI() {
        this._container = DashboardUI.createDashboardUI(this._container);

        // Setup tabs and get references for backward compatibility
        const tabsResult = setupTabs(this._container, tabName => {
            this._updateTabContent(tabName);
        });
        this._tabCleanup = tabsResult.clear;
        this._tabElements = tabsResult.tabElements;
        this._tabClickHandlers = tabsResult.tabClickHandlers;

        // Setup actions
        this._actionsCleanup = setupActions(this._container, {
            onHide: () => this._hideObservability(),
            onExportNow: () => this._exportNow(),
            onClearMetrics: () => this._clearMetrics(),
            onAddScheduledExport: () => this._addScheduledExport(),
            onAddExternalService: () => this._addExternalService(),
            onPauseJob: jobId => this._pauseJob(jobId),
            onDeleteJob: jobId => this._deleteJob(jobId),
            onRemoveService: endpoint => this._removeService(endpoint),
        });
    }

    /**
     * Hide the observability dashboard
     * @private
     */
    _hideObservability() {
        this.hideDashboard();
    }

    /**
     * Export metrics now
     * @private
     */
    async _exportNow() {
        const formatSelect = this._container.querySelector('#export-format');
        const includeMemory = this._container.querySelector('#export-memory')?.checked ?? true;
        const includeVitals = this._container.querySelector('#export-vitals')?.checked ?? true;

        const format = formatSelect?.value || 'json';

        await this.exportNow(format, {
            includeMemory,
            includeWebVitals: includeVitals,
        });

        // Show feedback
        console.log('[ObservabilityController] Export initiated');
    }

    /**
     * Clear all metrics
     * @private
     */
    _clearMetrics() {
        if (confirm('Are you sure you want to clear all metrics? This action cannot be undone.')) {
            this.clearMetrics();
            console.log('[ObservabilityController] Metrics cleared by user');
        }
    }

    /**
     * Add a scheduled export
     * @private
     */
    _addScheduledExport() {
        console.log('[ObservabilityController] Add scheduled export - feature not implemented');
        // TODO: Implement scheduled export creation UI
    }

    /**
     * Add an external service
     * @private
     */
    _addExternalService() {
        console.log('[ObservabilityController] Add external service - feature not implemented');
        // TODO: Implement external service creation UI
    }

    /**
     * Pause a scheduled job
     * @private
     * @param {string} jobId - Job ID
     */
    _pauseJob(jobId) {
        // Input validation
        if (!jobId || typeof jobId !== 'string' || jobId.trim() === '') {
            console.warn('[ObservabilityController] Invalid jobId:', jobId);
            return;
        }

        if (!MetricsExporter) return;
        console.log(`[ObservabilityController] Pause job ${jobId}`);
        // TODO: Implement job pause functionality
    }

    /**
     * Delete a scheduled job
     * @private
     * @param {string} jobId - Job ID
     */
    _deleteJob(jobId) {
        // Input validation
        if (!jobId || typeof jobId !== 'string' || jobId.trim() === '') {
            console.warn('[ObservabilityController] Invalid jobId:', jobId);
            return;
        }

        if (!MetricsExporter) return;
        console.log(`[ObservabilityController] Delete job ${jobId}`);
        // TODO: Implement job deletion functionality
    }

    /**
     * Remove an external service
     * @private
     * @param {string} endpoint - Service endpoint
     */
    _removeService(endpoint) {
        // Input validation
        if (!endpoint || typeof endpoint !== 'string' || endpoint.trim() === '') {
            console.warn('[ObservabilityController] Invalid endpoint:', endpoint);
            return;
        }

        if (!MetricsExporter) return;
        console.log(`[ObservabilityController] Remove service ${endpoint}`);
        // TODO: Implement service removal functionality
    }

    /**
     * Update tab-specific content
     * @private
     * @param {string} tabName - Tab name
     */
    _updateTabContent(tabName) {
        switch (tabName) {
            case 'overview':
                this._updateOverviewTab();
                break;
            case 'web-vitals':
                this._updateWebVitalsTab();
                break;
            case 'performance':
                this._updatePerformanceTab();
                break;
            case 'memory':
                this._updateMemoryTab();
                break;
            case 'exports':
                this._updateExportsTab();
                break;
        }
    }

    /**
     * Update overview tab
     * @private
     */
    _updateOverviewTab() {
        updateOverviewTab(this._container);
    }

    /**
     * Update web vitals tab
     * @private
     */
    _updateWebVitalsTab() {
        updateWebVitalsTab(this._container);
    }

    /**
     * Update performance tab
     * @private
     */
    _updatePerformanceTab() {
        updatePerformanceTab(this._container);
    }

    /**
     * Update memory tab
     * @private
     */
    _updateMemoryTab() {
        updateMemoryTab(this._container);
    }

    /**
     * Update exports tab
     * @private
     */
    _updateExportsTab() {
        updateExportsTab(this._container);
    }

    /**
     * Show observability dashboard
     * @public
     */
    showDashboard() {
        if (this._container) {
            this._container.style.display = 'block';
            this._isDashboardVisible = true;
            this._startUpdates();
        }
    }

    /**
     * Hide observability dashboard
     * @public
     */
    hideDashboard() {
        if (this._container) {
            this._container.style.display = 'none';
            this._isDashboardVisible = false;
            this._stopUpdates();
        }
    }

    /**
     * Toggle observability dashboard
     * @public
     */
    toggleDashboard() {
        if (this._isDashboardVisible) {
            this.hideDashboard();
        } else {
            this.showDashboard();
        }
    }

    /**
     * Start automatic updates
     * @private
     */
    _startUpdates() {
        if (this._intervalId) return;

        this._intervalId = setInterval(() => {
            this._updateAllTabs();
        }, this._updateInterval);

        // Initial update
        this._updateAllTabs();
    }

    /**
     * Stop automatic updates
     * @private
     */
    _stopUpdates() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
    }

    /**
     * Update all tabs
     * @private
     */
    _updateAllTabs() {
        const activeTab = this._container.querySelector('.tab-btn.active');
        if (activeTab) {
            this._updateTabContent(activeTab.dataset.tab);
        }
    }

    /**
     * Export metrics immediately
     * @public
     * @param {ExportFormat} format - Export format
     * @param {Object} options - Export options
     */
    async exportNow(format = ExportFormat.JSON, options = {}) {
        if (!MetricsExporter) {
            console.error('[ObservabilityController] MetricsExporter not available');
            return;
        }

        const config = {
            format,
            schedule: ScheduleType.IMMEDIATE,
            categories: options.categories || [],
            filters: options.filters || {},
            includeMemory: options.includeMemory !== false,
            includeWebVitals: options.includeWebVitals !== false,
            aggregationWindow: options.aggregationWindow || 5,
        };

        try {
            await MetricsExporter.exportNow(config);
            console.log('[ObservabilityController] Export completed');
        } catch (error) {
            console.error('[ObservabilityController] Export failed:', error);
        }
    }

    /**
     * Clear all metrics
     * @public
     */
    clearMetrics() {
        if (PerformanceProfiler) {
            PerformanceProfiler.clearMeasurements();
        }

        if (CoreWebVitalsTracker) {
            CoreWebVitalsTracker.clearMetrics();
        }

        console.log('[ObservabilityController] Metrics cleared');
    }

    /**
     * Format category name for display
     * @private
     * @param {string} category - Category name
     * @returns {string} Formatted name
     */
    _formatCategoryName(category) {
        return category
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * Escape HTML to prevent XSS attacks
     * @private
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    _escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Get system status
     * @private
     * @returns {Object} System status object
     */
    _getSystemStatus() {
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
     * Update element content
     * @private
     * @param {string} id - Element ID
     * @param {string} content - New content
     */
    _updateElement(id, content) {
        const element = this._container.querySelector(`#${id}`);
        if (element) {
            element.textContent = content;
        }
    }

    /**
     * Destroy the controller
     * @public
     */
    destroy() {
        this._stopUpdates();

        // Remove event listeners using bound handlers
        this._removeEventListeners();

        // Clear tabs and actions
        if (this._tabCleanup) {
            this._tabCleanup();
            this._tabCleanup = null;
        }

        if (this._actionsCleanup) {
            this._actionsCleanup();
            this._actionsCleanup = null;
        }

        if (this._container && this._container.parentNode) {
            this._container.parentNode.removeChild(this._container);
        }

        // Null out handler properties to prevent memory leaks
        this._onShowDashboard = null;
        this._onHideDashboard = null;
        this._onToggleDashboard = null;
        this._onSettingsObservability = null;
        this._onActionClick = null;
        this._tabElements = [];
        this._tabClickHandlers = [];

        console.log('[ObservabilityController] Destroyed');
    }

    /**
     * Remove event listeners
     * @private
     */
    _removeEventListeners() {
        // Remove document event listeners using bound handlers
        if (this._onShowDashboard) {
            document.removeEventListener('observability:show', this._onShowDashboard);
        }
        if (this._onHideDashboard) {
            document.removeEventListener('observability:hide', this._onHideDashboard);
        }
        if (this._onToggleDashboard) {
            document.removeEventListener('observability:toggle', this._onToggleDashboard);
        }
        if (this._onSettingsObservability) {
            document.removeEventListener('settings:observability', this._onSettingsObservability);
        }
    }
}

// Export singleton instance
const ObservabilityControllerSingleton = new ObservabilityController();
export default ObservabilityControllerSingleton;
