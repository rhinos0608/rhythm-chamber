/**
 * Observability Dashboard UI
 *
 * Handles creation of the main dashboard UI structure including
 * header, tabs, content area, and footer.
 *
 * @module observability/ui/dashboard
 */

import { PerformanceCategory } from '../../services/performance-profiler.js';

/**
 * Create the main dashboard UI structure
 * @param {HTMLElement} container - Container element
 * @returns {HTMLElement} The container element
 */
export function createDashboardUI(container) {
    if (!container) {
        container = document.createElement('div');
        container.id = 'observability-dashboard';
        container.className = 'observability-dashboard';
        document.body.appendChild(container);
    }

    container.innerHTML = `
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
            ${createOverviewTab()}
            ${createWebVitalsTab()}
            ${createPerformanceTab()}
            ${createMemoryTab()}
            ${createExportsTab()}
        </div>

        <div class="observability-footer">
            <button class="btn btn-secondary" data-action="export-now">Export Now</button>
            <button class="btn btn-secondary" data-action="clear-metrics">Clear Metrics</button>
        </div>
    `;

    return container;
}

/**
 * Create overview tab content
 * @returns {string} HTML content
 */
export function createOverviewTab() {
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
 * @returns {string} HTML content
 */
export function createWebVitalsTab() {
    return `
        <div class="tab-content" data-tab="web-vitals">
            <div class="vitals-grid">
                ${createVitalCard('LCP', 'Largest Contentful Paint', 'good', 'ms')}
                ${createVitalCard('FID', 'First Input Delay', 'good', 'ms')}
                ${createVitalCard('CLS', 'Cumulative Layout Shift', 'good', '')}
                ${createVitalCard('INP', 'Interaction to Next Paint', 'good', 'ms')}
                ${createVitalCard('TTFB', 'Time to First Byte', 'good', 'ms')}
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
 * @param {string} type - Vital type
 * @param {string} label - Vital label
 * @param {string} rating - Initial rating
 * @param {string} unit - Unit for the vital
 * @returns {string} HTML content
 */
export function createVitalCard(type, label, rating, unit = 'ms') {
    return `
        <div class="vital-card" data-vital="${type}">
            <div class="vital-header">
                <div class="vital-name">${label}</div>
                <div class="vital-rating ${rating}">${rating}</div>
            </div>
            <div class="vital-value" id="vital-${type}-value">--</div>
            <div class="vital-unit">${unit}</div>
            <div class="vital-threshold">
                <span class="threshold-label">Target:</span>
                <span class="threshold-value" id="vital-${type}-target">--</span>
            </div>
        </div>
    `;
}

/**
 * Create performance tab content
 * @returns {string} HTML content
 */
export function createPerformanceTab() {
    return `
        <div class="tab-content" data-tab="performance">
            <div class="performance-categories">
                ${Object.values(PerformanceCategory)
        .map(
            category => `
                    <div class="category-section" data-category="${category}">
                        <h3>${formatCategoryName(category)}</h3>
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
                `
        )
        .join('')}
            </div>
        </div>
    `;
}

/**
 * Create memory tab content
 * @returns {string} HTML content
 */
export function createMemoryTab() {
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
 * @returns {string} HTML content
 */
export function createExportsTab() {
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
 * Format category name for display
 * @param {string} category - Category name
 * @returns {string} Formatted name
 */
function formatCategoryName(category) {
    return category
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
