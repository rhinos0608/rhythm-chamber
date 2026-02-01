/**
 * Dev Panel Controller
 *
 * Developer debugging panel with real-time observability data.
 * Accessible via Ctrl+Shift+D (Cmd+Shift+D on Mac).
 * Only enabled in dev mode or when ?debug=true URL param present.
 *
 * @module DevPanelController
 */

import { EventBus } from '../services/event-bus.js';
import { WaveTelemetry } from '../services/wave-telemetry.js';
import { StorageDegradationManager } from '../services/storage-degradation-manager.js';

const DEV_MODE_KEY = 'rc_dev_mode';
const UPDATE_INTERVAL_MS = 5000;

/**
 * DevPanelController - Main controller for the developer panel
 */
export class DevPanelController {
    static _instance = null;
    static _isVisible = false;
    static _container = null;
    static _activeTab = 'metrics';
    static _updateIntervalId = null;

    /**
     * Get singleton instance
     * @returns {DevPanelController}
     */
    static getInstance() {
        if (!DevPanelController._instance) {
            DevPanelController._instance = new DevPanelController();
        }
        return DevPanelController._instance;
    }

    /**
     * Check if dev mode is enabled
     * @returns {boolean}
     */
    static isDevModeEnabled() {
        // Check localStorage
        try {
            if (localStorage.getItem(DEV_MODE_KEY) === 'true') {
                return true;
            }
        } catch (e) {
            // localStorage might be disabled
        }

        // Check URL param
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('debug') === 'true') {
            return true;
        }

        return false;
    }

    /**
     * Toggle dev panel visibility
     */
    static toggle() {
        if (DevPanelController._isVisible) {
            DevPanelController.hide();
        } else {
            DevPanelController.show();
        }
    }

    /**
     * Show dev panel
     */
    static show() {
        if (!DevPanelController.isDevModeEnabled()) {
            console.warn('[DevPanel] Dev mode is not enabled');
            return;
        }

        if (DevPanelController._isVisible) {
            return;
        }

        DevPanelController._container = DevPanelController._createPanel();
        document.body.appendChild(DevPanelController._container);
        DevPanelController._isVisible = true;

        // Start auto-refresh
        DevPanelController._startAutoRefresh();

        // Render initial content
        DevPanelController._renderActiveTab();

        console.log('[DevPanel] Panel shown');
    }

    /**
     * Hide dev panel
     */
    static hide() {
        if (!DevPanelController._isVisible) {
            return;
        }

        if (DevPanelController._container) {
            DevPanelController._container.remove();
            DevPanelController._container = null;
        }

        DevPanelController._isVisible = false;
        DevPanelController._stopAutoRefresh();

        console.log('[DevPanel] Panel hidden');
    }

    /**
     * Create panel DOM element
     * @returns {HTMLElement}
     * @private
     */
    static _createPanel() {
        const panel = document.createElement('div');
        panel.id = 'rc-dev-panel';
        panel.className = 'rc-dev-panel';
        panel.innerHTML = `
            <div class="rc-dev-panel-header">
                <h2>Rhythm Chamber Dev Panel</h2>
                <button class="rc-dev-panel-close" data-action="close">&times;</button>
            </div>
            <div class="rc-dev-panel-tabs">
                <button class="rc-dev-tab ${DevPanelController._activeTab === 'metrics' ? 'active' : ''}" data-tab="metrics">Metrics</button>
                <button class="rc-dev-tab ${DevPanelController._activeTab === 'events' ? 'active' : ''}" data-tab="events">EventBus</button>
                <button class="rc-dev-tab ${DevPanelController._activeTab === 'storage' ? 'active' : ''}" data-tab="storage">Storage</button>
                <button class="rc-dev-tab ${DevPanelController._activeTab === 'health' ? 'active' : ''}" data-tab="health">Provider Health</button>
            </div>
            <div class="rc-dev-panel-content" id="rc-dev-panel-content"></div>
            <div class="rc-dev-panel-footer">
                Last updated: <span id="rc-dev-timestamp">-</span>
            </div>
        `;

        // Event listeners
        panel.addEventListener('click', e => {
            if (e.target.dataset.action === 'close') {
                DevPanelController.hide();
            } else if (e.target.dataset.tab) {
                DevPanelController._switchTab(e.target.dataset.tab);
            }
        });

        return panel;
    }

    /**
     * Switch active tab
     * @param {string} tabName
     * @private
     */
    static _switchTab(tabName) {
        DevPanelController._activeTab = tabName;

        // Update tab styles
        const tabs = DevPanelController._container.querySelectorAll('.rc-dev-tab');
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        DevPanelController._renderActiveTab();
    }

    /**
     * Render active tab content
     * @private
     */
    static _renderActiveTab() {
        const content = DevPanelController._container.querySelector('#rc-dev-panel-content');
        const timestamp = DevPanelController._container.querySelector('#rc-dev-timestamp');

        switch (DevPanelController._activeTab) {
            case 'metrics':
                content.innerHTML = DevPanelController._renderMetricsTab();
                break;
            case 'events':
                content.innerHTML = DevPanelController._renderEventsTab();
                break;
            case 'storage':
                content.innerHTML = DevPanelController._renderStorageTab();
                break;
            case 'health':
                content.innerHTML = DevPanelController._renderHealthTab();
                break;
        }

        if (timestamp) {
            timestamp.textContent = new Date().toLocaleTimeString();
        }
    }

    /**
     * Render Metrics tab
     * @returns {string}
     * @private
     */
    static _renderMetricsTab() {
        // Get wave telemetry data
        const telemetry = WaveTelemetry?.getSummary() || {};
        const activeWaves = telemetry.activeWaves || 0;
        const totalWaves = telemetry.totalWaves || 0;

        return `
            <div class="rc-dev-metrics">
                <h3>Application Metrics</h3>
                <div class="rc-dev-metric-grid">
                    <div class="rc-dev-metric">
                        <span class="rc-dev-metric-value">${activeWaves}</span>
                        <span class="rc-dev-metric-label">Active Waves</span>
                    </div>
                    <div class="rc-dev-metric">
                        <span class="rc-dev-metric-value">${totalWaves}</span>
                        <span class="rc-dev-metric-label">Total Waves</span>
                    </div>
                    <div class="rc-dev-metric">
                        <span class="rc-dev-metric-value">${telemetry.avgLatency || 0}</span>
                        <span class="rc-dev-metric-label">Avg Latency</span>
                    </div>
                </div>
                <h4>Recent Waves</h4>
                <pre class="rc-dev-code">${JSON.stringify(telemetry.recentWaves || [], null, 2)}</pre>
            </div>
        `;
    }

    /**
     * Render Events tab
     * @returns {string}
     * @private
     */
    static _renderEventsTab() {
        const events = EventBus?.getRecentEvents() || [];

        return `
            <div class="rc-dev-events">
                <h3>Recent Events</h3>
                <div class="rc-dev-event-list">
                    ${events
        .slice(0, 20)
        .map(
            e => `
                        <div class="rc-dev-event">
                            <span class="rc-dev-event-name">${e.name}</span>
                            <span class="rc-dev-event-time">${new Date(e.timestamp).toLocaleTimeString()}</span>
                        </div>
                    `
        )
        .join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render Storage tab
     * @returns {string}
     * @private
     */
    static _renderStorageTab() {
        const tier = StorageDegradationManager?.getCurrentTier() || 'unknown';
        const metrics = StorageDegradationManager?.getCurrentMetrics() || {};

        return `
            <div class="rc-dev-storage">
                <h3>Storage Status</h3>
                <div class="rc-dev-metric-grid">
                    <div class="rc-dev-metric">
                        <span class="rc-dev-metric-value">${tier}</span>
                        <span class="rc-dev-metric-label">Current Tier</span>
                    </div>
                    <div class="rc-dev-metric">
                        <span class="rc-dev-metric-value">${metrics.usagePercent || 0}</span>
                        <span class="rc-dev-metric-label">Usage</span>
                    </div>
                    <div class="rc-dev-metric">
                        <span class="rc-dev-metric-value">${metrics.available || 0}</span>
                        <span class="rc-dev-metric-label">Available</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render Provider Health tab
     * @returns {string}
     * @private
     */
    static _renderHealthTab() {
        return `
            <div class="rc-dev-health">
                <h3>Provider Health</h3>
                <p>Provider health monitoring coming soon.</p>
            </div>
        `;
    }

    /**
     * Start auto-refresh
     * @private
     */
    static _startAutoRefresh() {
        DevPanelController._stopAutoRefresh();
        DevPanelController._updateIntervalId = setInterval(() => {
            if (DevPanelController._isVisible) {
                DevPanelController._renderActiveTab();
            }
        }, UPDATE_INTERVAL_MS);
    }

    /**
     * Stop auto-refresh
     * @private
     */
    static _stopAutoRefresh() {
        if (DevPanelController._updateIntervalId) {
            clearInterval(DevPanelController._updateIntervalId);
            DevPanelController._updateIntervalId = null;
        }
    }
}
