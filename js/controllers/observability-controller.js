/**
 * Observability Controller
 *
 * Manages the observability dashboard UI, including real-time metrics display,
 * performance charts, memory usage graphs, and export controls.
 *
 * @module ObservabilityController
 * @author Rhythm Chamber Architecture Team
 * @version 1.0.0
 */

import { PerformanceProfiler, PerformanceCategory } from '../services/performance-profiler.js';
import { CoreWebVitalsTracker, WebVitalType, PerformanceRating } from '../observability/core-web-vitals.js';
import { MetricsExporter, ExportFormat, ScheduleType, ExternalService } from '../observability/metrics-exporter.js';

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
     * Initialize the Observability Controller
     * @public
     * @param {HTMLElement} container - Container element for the dashboard
     * @param {Object} options - Configuration options
     * @param {number} options.updateInterval - Update interval in milliseconds
     */
    constructor(container = null, { updateInterval = 5000 } = {}) {
        this._container = container;
        this._updateInterval = updateInterval;
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
        // Listen for observability-related events
        document.addEventListener('observability:show', () => this.showDashboard());
        document.addEventListener('observability:hide', () => this.hideDashboard());
        document.addEventListener('observability:toggle', () => this.toggleDashboard());

        // Listen for settings modal events
        document.addEventListener('settings:observability', () => this.showDashboard());
    }

    /**
     * Create dashboard UI
     * @private
     */
    _createDashboardUI() {
        if (!this._container) {
            this._container = document.createElement('div');
            this._container.id = 'observability-dashboard';
            this._container.className = 'observability-dashboard';
            document.body.appendChild(this._container);
        }

        this._container.innerHTML = `
            <div class="observability-header">
                <h2>🔍 Observability Dashboard</h2>
                <button class="btn-close" data-action="hide-observability">✕</button>
            </div>

            <div class="observability-tabs">
                <button class="tab-btn active" data-tab="overview">Overview</button>
                <button class="tab-btn" data-tab="web-vitals">Web Vitals</button>
                <button class="tab-btn" data-tab="performance">Performance</button>
                <button class="tab-btn" data-tab="memory">Memory</button>
                <button class="tab-btn" data-tab="exports">Exports</button>
            </div>

            <div class="observability-content">
                ${this._createOverviewTab()}
                ${this._createWebVitalsTab()}
                ${this._createPerformanceTab()}
                ${this._createMemoryTab()}
                ${this._createExportsTab()}
            </div>

            <div class="observability-footer">
                <button class="btn btn-secondary" data-action="export-now">Export Now</button>
                <button class="btn btn-secondary" data-action="clear-metrics">Clear Metrics</button>
            </div>
        `;

        // Add tab switching
        this._setupTabs();
    }

    /**
     * Create overview tab content
     * @private
     * @returns {string} HTML content
     */
    _createOverviewTab() {
        return `
            <div class="tab-content active" data-tab="overview">
                <div class="metrics-grid">
                    <div class="metric-card">
                        <div class="metric-label">System Status</div>
                        <div class="metric-value" id="metric-system-status">Healthy</div>
                        <div class="metric-indicator good"></div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Active Measurements</div>
                        <div class="metric-value" id="metric-measurement-count">0</div>
                        <div class="metric-trend">Last 24h</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Memory Usage</div>
                        <div class="metric-value" id="metric-memory-usage">--%</div>
                        <div class="metric-trend" id="metric-memory-trend">Stable</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Degradation Alerts</div>
                        <div class="metric-value" id="metric-alert-count">0</div>
                        <div class="metric-indicator" id="metric-alert-indicator"></div>
                    </div>
                </div>

                <div class="chart-container">
                    <h3>Performance Overview</h3>
                    <canvas id="performance-overview-chart"></canvas>
                </div>

                <div class="alerts-section" id="alerts-section">
                    <h3>Recent Alerts</h3>
                    <div class="alerts-list" id="alerts-list">
                        <div class="no-alerts">No recent alerts</div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Create web vitals tab content
     * @private
     * @returns {string} HTML content
     */
    _createWebVitalsTab() {
        return `
            <div class="tab-content" data-tab="web-vitals">
                <div class="vitals-grid">
                    ${this._createVitalCard('LCP', 'Largest Contentful Paint', 'good')}
                    ${this._createVitalCard('FID', 'First Input Delay', 'good')}
                    ${this._createVitalCard('CLS', 'Cumulative Layout Shift', 'good')}
                    ${this._createVitalCard('INP', 'Interaction to Next Paint', 'good')}
                    ${this._createVitalCard('TTFB', 'Time to First Byte', 'good')}
                </div>

                <div class="vitals-details">
                    <h3>Vitals History</h3>
                    <canvas id="vitals-history-chart"></canvas>
                </div>
            </div>
        `;
    }

    /**
     * Create a single vital card
     * @private
     * @param {string} type - Vital type
     * @param {string} label - Vital label
     * @param {string} rating - Initial rating
     * @returns {string} HTML content
     */
    _createVitalCard(type, label, rating) {
        return `
            <div class="vital-card" data-vital="${type}">
                <div class="vital-header">
                    <div class="vital-name">${label}</div>
                    <div class="vital-rating ${rating}">${rating}</div>
                </div>
                <div class="vital-value" id="vital-${type}-value">--</div>
                <div class="vital-unit">ms</div>
                <div class="vital-threshold">
                    <span class="threshold-label">Target:</span>
                    <span class="threshold-value" id="vital-${type}-target">--</span>
                </div>
            </div>
        `;
    }

    /**
     * Create performance tab content
     * @private
     * @returns {string} HTML content
     */
    _createPerformanceTab() {
        return `
            <div class="tab-content" data-tab="performance">
                <div class="performance-categories">
                    ${Object.values(PerformanceCategory).map(category => `
                        <div class="category-section" data-category="${category}">
                            <h3>${this._formatCategoryName(category)}</h3>
                            <div class="category-stats">
                                <div class="stat">
                                    <span class="stat-label">Average:</span>
                                    <span class="stat-value" id="perf-${category}-avg">-- ms</span>
                                </div>
                                <div class="stat">
                                    <span class="stat-label">P95:</span>
                                    <span class="stat-value" id="perf-${category}-p95">-- ms</span>
                                </div>
                                <div class="stat">
                                    <span class="stat-label">Count:</span>
                                    <span class="stat-value" id="perf-${category}-count">0</span>
                                </div>
                            </div>
                            <div class="category-chart">
                                <canvas id="perf-${category}-chart"></canvas>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Create memory tab content
     * @private
     * @returns {string} HTML content
     */
    _createMemoryTab() {
        return `
            <div class="tab-content" data-tab="memory">
                <div class="memory-overview">
                    <div class="memory-gauge">
                        <canvas id="memory-gauge-canvas"></canvas>
                        <div class="memory-percentage" id="memory-percentage">--%</div>
                        <div class="memory-label">Heap Usage</div>
                    </div>
                    <div class="memory-stats">
                        <div class="memory-stat">
                            <span class="stat-label">Used:</span>
                            <span class="stat-value" id="memory-used">-- MB</span>
                        </div>
                        <div class="memory-stat">
                            <span class="stat-label">Total:</span>
                            <span class="stat-value" id="memory-total">-- MB</span>
                        </div>
                        <div class="memory-stat">
                            <span class="stat-label">Limit:</span>
                            <span class="stat-value" id="memory-limit">-- MB</span>
                        </div>
                        <div class="memory-stat">
                            <span class="stat-label">Trend:</span>
                            <span class="stat-value" id="memory-trend">--</span>
                        </div>
                    </div>
                </div>

                <div class="memory-history">
                    <h3>Memory Usage Over Time</h3>
                    <canvas id="memory-history-chart"></canvas>
                </div>
            </div>
        `;
    }

    /**
     * Create exports tab content
     * @private
     * @returns {string} HTML content
     */
    _createExportsTab() {
        return `
            <div class="tab-content" data-tab="exports">
                <div class="export-controls">
                    <h3>Immediate Export</h3>
                    <div class="export-form">
                        <div class="form-group">
                            <label for="export-format">Format:</label>
                            <select id="export-format">
                                <option value="json">JSON</option>
                                <option value="csv">CSV</option>
                                <option value="prometheus">Prometheus</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="export-memory" checked>
                                Include Memory Metrics
                            </label>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="export-vitals" checked>
                                Include Web Vitals
                            </label>
                        </div>
                        <button class="btn btn-primary" data-action="export-now">
                            Export Now
                        </button>
                    </div>
                </div>

                <div class="scheduled-exports">
                    <h3>Scheduled Exports</h3>
                    <div class="scheduled-list" id="scheduled-exports-list">
                        <div class="no-scheduled">No scheduled exports</div>
                    </div>
                    <button class="btn btn-secondary" data-action="add-scheduled-export">
                        Add Scheduled Export
                    </button>
                </div>

                <div class="external-services">
                    <h3>External Services</h3>
                    <div class="services-list" id="external-services-list">
                        <div class="no-services">No external services configured</div>
                    </div>
                    <button class="btn btn-secondary" data-action="add-external-service">
                        Add External Service
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Set up tab switching
     * @private
     */
    _setupTabs() {
        const tabs = this._container.querySelectorAll('.tab-btn');
        const contents = this._container.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tab;

                // Update active tab button
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Show target content
                contents.forEach(content => {
                    content.classList.remove('active');
                    if (content.dataset.tab === targetTab) {
                        content.classList.add('active');
                    }
                });

                // Update tab-specific content
                this._updateTabContent(targetTab);
            });
        });
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
        // System status
        const systemStatus = this._getSystemStatus();
        this._updateElement('metric-system-status', systemStatus.text);

        // Measurement count
        if (window.PerformanceProfiler) {
            const stats = window.PerformanceProfiler.getStatistics();
            this._updateElement('metric-measurement-count', stats.count);
        }

        // Memory usage
        if (window.PerformanceProfiler) {
            const memoryStats = window.PerformanceProfiler.getMemoryStatistics();
            this._updateElement('metric-memory-usage',
                `${memoryStats.currentUsage?.toFixed(1) || '--'}%`);
            this._updateElement('metric-memory-trend',
                memoryStats.usageTrend || 'Stable');
        }

        // Degradation alerts
        if (window.PerformanceProfiler) {
            const alerts = window.PerformanceProfiler.getDegradationAlerts();
            this._updateElement('metric-alert-count', alerts.length);

            const indicator = this._container.querySelector('#metric-alert-indicator');
            if (indicator) {
                const criticalCount = alerts.filter(a => a.severity === 'critical').length;
                indicator.className = `metric-indicator ${criticalCount > 0 ? 'critical' : alerts.length > 0 ? 'warning' : 'good'}`;
            }

            // Update alerts list
            this._updateAlertsList(alerts);
        }
    }

    /**
     * Update web vitals tab
     * @private
     */
    _updateWebVitalsTab() {
        if (!window.CoreWebVitalsTracker) return;

        const vitalsTypes = [WebVitalType.LCP, WebVitalType.FID, WebVitalType.CLS, WebVitalType.INP, WebVitalType.TTFB];

        vitalsTypes.forEach(type => {
            const metric = window.CoreWebVitalsTracker.getLatestMetric(type);

            if (metric) {
                this._updateElement(`vital-${type}-value`, metric.value.toFixed(2));

                const card = this._container.querySelector(`[data-vital="${type}"]`);
                if (card) {
                    const ratingElement = card.querySelector('.vital-rating');
                    if (ratingElement) {
                        ratingElement.className = `vital-rating ${metric.rating}`;
                        ratingElement.textContent = metric.rating;
                    }
                }
            }
        });
    }

    /**
     * Update performance tab
     * @private
     */
    _updatePerformanceTab() {
        if (!window.PerformanceProfiler) return;

        for (const category of Object.values(PerformanceCategory)) {
            const stats = window.PerformanceProfiler.getStatistics(category);

            this._updateElement(`perf-${category}-avg`,
                `${stats.avgDuration.toFixed(2)} ms`);
            this._updateElement(`perf-${category}-p95`,
                `${stats.p95Duration.toFixed(2)} ms`);
            this._updateElement(`perf-${category}-count`, stats.count);
        }
    }

    /**
     * Update memory tab
     * @private
     */
    _updateMemoryTab() {
        if (!window.PerformanceProfiler) return;

        const memoryStats = window.PerformanceProfiler.getMemoryStatistics();

        // Update gauge and stats
        this._updateElement('memory-percentage',
            `${memoryStats.currentUsage?.toFixed(1) || '--'}%`);

        if (memoryStats.currentBytes) {
            const bytes = memoryStats.currentBytes;
            this._updateElement('memory-used',
                `${(bytes.used / 1024 / 1024).toFixed(1)} MB`);
            this._updateElement('memory-total',
                `${(bytes.total / 1024 / 1024).toFixed(1)} MB`);
            this._updateElement('memory-limit',
                `${(bytes.limit / 1024 / 1024).toFixed(1)} MB`);
        }

        this._updateElement('memory-trend', memoryStats.usageTrend || '--');
    }

    /**
     * Update exports tab
     * @private
     */
    _updateExportsTab() {
        if (!window.MetricsExporter) return;

        // Update scheduled exports list
        const scheduledJobs = window.MetricsExporter.getScheduledJobs();
        const scheduledList = this._container.querySelector('#scheduled-exports-list');

        if (scheduledJobs.length === 0) {
            scheduledList.innerHTML = '<div class="no-scheduled">No scheduled exports</div>';
        } else {
            scheduledList.innerHTML = scheduledJobs.map(job => `
                <div class="scheduled-job" data-job-id="${job.id}">
                    <div class="job-name">${job.name}</div>
                    <div class="job-info">
                        <span>Format: ${job.config.format}</span>
                        <span>Schedule: ${job.config.schedule}</span>
                        <span>Status: ${job.status}</span>
                    </div>
                    <div class="job-actions">
                        <button class="btn btn-sm" data-action="pause-job" data-job-id="${job.id}">Pause</button>
                        <button class="btn btn-sm" data-action="delete-job" data-job-id="${job.id}">Delete</button>
                    </div>
                </div>
            `).join('');
        }

        // Update external services list
        const services = window.MetricsExporter.getExternalServices();
        const servicesList = this._container.querySelector('#external-services-list');

        if (services.length === 0) {
            servicesList.innerHTML = '<div class="no-services">No external services configured</div>';
        } else {
            servicesList.innerHTML = services.map(service => `
                <div class="service-config" data-endpoint="${service.endpoint}">
                    <div class="service-name">${service.service}</div>
                    <div class="service-endpoint">${service.endpoint}</div>
                    <div class="service-actions">
                        <button class="btn btn-sm" data-action="remove-service" data-endpoint="${service.endpoint}">Remove</button>
                    </div>
                </div>
            `).join('');
        }
    }

    /**
     * Update alerts list
     * @private
     * @param {Array} alerts - Array of alerts
     */
    _updateAlertsList(alerts) {
        const alertsList = this._container.querySelector('#alerts-list');

        if (alerts.length === 0) {
            alertsList.innerHTML = '<div class="no-alerts">No recent alerts</div>';
            return;
        }

        const recentAlerts = alerts.slice(-10).reverse();
        alertsList.innerHTML = recentAlerts.map(alert => `
            <div class="alert-item ${alert.severity}">
                <div class="alert-message">${alert.message}</div>
                <div class="alert-details">
                    <span class="alert-category">${alert.category}</span>
                    <span class="alert-time">${new Date(alert.timestamp).toLocaleTimeString()}</span>
                </div>
            </div>
        `).join('');
    }

    /**
     * Get system status
     * @private
     * @returns {Object} System status object
     */
    _getSystemStatus() {
        if (window.PerformanceProfiler) {
            const criticalAlerts = window.PerformanceProfiler.getDegradationAlerts('critical');
            const warningAlerts = window.PerformanceProfiler.getDegradationAlerts('warning');

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
        if (!window.MetricsExporter) {
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
            aggregationWindow: options.aggregationWindow || 5
        };

        try {
            await window.MetricsExporter.exportNow(config);
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
        if (window.PerformanceProfiler) {
            window.PerformanceProfiler.clearMeasurements();
        }

        if (window.CoreWebVitalsTracker) {
            window.CoreWebVitalsTracker.clearMetrics();
        }

        console.log('[ObservabilityController] Metrics cleared');
    }

    /**
     * Destroy the controller
     * @public
     */
    destroy() {
        this._stopUpdates();

        if (this._container && this._container.parentNode) {
            this._container.parentNode.removeChild(this._container);
        }

        console.log('[ObservabilityController] Destroyed');
    }
}

// Export singleton instance
const ObservabilityControllerSingleton = new ObservabilityController();
export default ObservabilityControllerSingleton;