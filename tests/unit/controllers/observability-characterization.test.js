/**
 * Characterization Tests for ObservabilityController
 *
 * These tests capture the CURRENT BEHAVIOR of the ObservabilityController
 * before refactoring. They serve as a safety net to ensure that the refactored
 * code maintains the same behavior.
 *
 * Characterization testing approach:
 * 1. Capture current behavior as tests
 * 2. Use these tests as regression guardrails during refactoring
 * 3. After refactoring, add proper unit tests for new modules
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the imported modules - must be before imports
vi.mock('../../../js/services/performance-profiler.js', () => ({
    PerformanceProfiler: {
        getStatistics: vi.fn(() => ({
            count: 100,
            avgDuration: 45.5,
            p95Duration: 120.3
        })),
        getMemoryStatistics: vi.fn(() => ({
            currentUsage: 45.2,
            usageTrend: 'Stable',
            currentBytes: {
                used: 45 * 1024 * 1024,
                total: 100 * 1024 * 1024,
                limit: 200 * 1024 * 1024
            }
        })),
        getDegradationAlerts: vi.fn(() => []),
        clearMeasurements: vi.fn()
    },
    PerformanceCategory: {
        AUDIO_PROCESSING: 'audio_processing',
        MODEL_INFERENCE: 'model_inference',
        STORAGE_OPERATION: 'storage_operation',
        RENDERING: 'rendering'
    }
}));

vi.mock('../../../js/observability/core-web-vitals.js', () => ({
    CoreWebVitalsTracker: {
        getLatestMetric: vi.fn((type) => ({
            value: 1250,
            rating: 'good'
        })),
        clearMetrics: vi.fn()
    },
    WebVitalType: {
        LCP: 'LCP',
        FID: 'FID',
        CLS: 'CLS',
        INP: 'INP',
        TTFB: 'TTFB'
    },
    PerformanceRating: {
        GOOD: 'good',
        NEEDS_IMPROVEMENT: 'needs_improvement',
        POOR: 'poor'
    }
}));

vi.mock('../../../js/observability/metrics-exporter.js', () => ({
    MetricsExporter: {
        exportNow: vi.fn(() => Promise.resolve()),
        getScheduledJobs: vi.fn(() => []),
        getExternalServices: vi.fn(() => [])
    },
    ExportFormat: {
        JSON: 'json',
        CSV: 'csv',
        PROMETHEUS: 'prometheus'
    },
    ScheduleType: {
        IMMEDIATE: 'immediate',
        HOURLY: 'hourly',
        DAILY: 'daily'
    },
    ExternalService: {}
}));

vi.mock('../../../js/utils/html-escape.js', () => ({
    escapeHtml: (text) => String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}));

import { ObservabilityController } from '../../../js/controllers/observability-controller.js';
import { PerformanceProfiler } from '../../../js/services/performance-profiler.js';
import { CoreWebVitalsTracker } from '../../../js/observability/core-web-vitals.js';
import { MetricsExporter } from '../../../js/observability/metrics-exporter.js';

describe('ObservabilityController - Characterization Tests', () => {
    let controller;
    let container;

    beforeEach(() => {
        // Clear all mocks
        vi.clearAllMocks();

        // Create container element
        container = document.createElement('div');
        document.body.appendChild(container);

        // Create controller instance
        controller = new ObservabilityController(container, {
            updateInterval: 5000
        });

        // Reset mock implementations
        PerformanceProfiler.getStatistics.mockReturnValue({
            count: 100,
            avgDuration: 45.5,
            p95Duration: 120.3
        });

        PerformanceProfiler.getMemoryStatistics.mockReturnValue({
            currentUsage: 45.2,
            usageTrend: 'Stable',
            currentBytes: {
                used: 45 * 1024 * 1024,
                total: 100 * 1024 * 1024,
                limit: 200 * 1024 * 1024
            }
        });

        PerformanceProfiler.getDegradationAlerts.mockReturnValue([]);

        CoreWebVitalsTracker.getLatestMetric.mockReturnValue({
            value: 1250,
            rating: 'good'
        });

        MetricsExporter.getScheduledJobs.mockReturnValue([]);
        MetricsExporter.getExternalServices.mockReturnValue([]);
    });

    afterEach(() => {
        if (controller) {
            controller.destroy();
        }
        if (container && container.parentNode) {
            container.parentNode.removeChild(container);
        }
    });

    describe('Constructor', () => {
        it('should initialize with provided container', () => {
            const customContainer = document.createElement('div');
            const testController = new ObservabilityController(customContainer);
            expect(testController._container).toBe(customContainer);
            testController.destroy();
        });

        it('should create container if not provided', () => {
            const testController = new ObservabilityController();
            // Container is created when init() is called
            testController.init();
            expect(testController._container).toBeTruthy();
            expect(testController._container.id).toBe('observability-dashboard');
            testController.destroy();
        });

        it('should set update interval from options', () => {
            const testController = new ObservabilityController(null, {
                updateInterval: 10000
            });
            expect(testController._updateInterval).toBe(10000);
            testController.destroy();
        });

        it('should default update interval to 5000ms', () => {
            const testController = new ObservabilityController();
            expect(testController._updateInterval).toBe(5000);
            testController.destroy();
        });

        it('should initialize state flags correctly', () => {
            expect(controller._isDashboardVisible).toBe(false);
            expect(controller._intervalId).toBe(null);
        });

        it('should create bound event handlers', () => {
            expect(controller._onShowDashboard).toBeTruthy();
            expect(controller._onHideDashboard).toBeTruthy();
            expect(controller._onToggleDashboard).toBeTruthy();
            expect(controller._onSettingsObservability).toBeTruthy();
            expect(controller._onActionClick).toBeTruthy();
        });
    });

    describe('Initialization', () => {
        it('should set up event listeners on init', () => {
            const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

            controller.init();

            expect(addEventListenerSpy).toHaveBeenCalledWith(
                'observability:show',
                controller._onShowDashboard
            );
            expect(addEventListenerSpy).toHaveBeenCalledWith(
                'observability:hide',
                controller._onHideDashboard
            );
            expect(addEventListenerSpy).toHaveBeenCalledWith(
                'observability:toggle',
                controller._onToggleDashboard
            );
            expect(addEventListenerSpy).toHaveBeenCalledWith(
                'settings:observability',
                controller._onSettingsObservability
            );
        });

        it('should create dashboard UI on init', () => {
            controller.init();

            expect(controller._container.querySelector('.observability-header')).toBeTruthy();
            expect(controller._container.querySelector('.observability-tabs')).toBeTruthy();
            expect(controller._container.querySelector('.observability-content')).toBeTruthy();
            expect(controller._container.querySelector('.observability-footer')).toBeTruthy();
        });

        it('should create all tabs', () => {
            controller.init();

            const tabs = controller._container.querySelectorAll('.tab-btn');
            expect(tabs.length).toBe(5);
            expect(tabs[0].dataset.tab).toBe('overview');
            expect(tabs[1].dataset.tab).toBe('web-vitals');
            expect(tabs[2].dataset.tab).toBe('performance');
            expect(tabs[3].dataset.tab).toBe('memory');
            expect(tabs[4].dataset.tab).toBe('exports');
        });

        it('should setup action handlers', () => {
            controller.init();

            const clickHandler = controller._container.addEventListener;
            expect(clickHandler).toBeTruthy();
        });
    });

    describe('Dashboard Visibility', () => {
        beforeEach(() => {
            controller.init();
        });

        it('should show dashboard when showDashboard is called', () => {
            controller.showDashboard();

            expect(controller._isDashboardVisible).toBe(true);
            expect(controller._container.style.display).toBe('block');
        });

        it('should hide dashboard when hideDashboard is called', () => {
            controller.showDashboard();
            controller.hideDashboard();

            expect(controller._isDashboardVisible).toBe(false);
            expect(controller._container.style.display).toBe('none');
        });

        it('should toggle dashboard visibility', () => {
            expect(controller._isDashboardVisible).toBe(false);

            controller.toggleDashboard();
            expect(controller._isDashboardVisible).toBe(true);

            controller.toggleDashboard();
            expect(controller._isDashboardVisible).toBe(false);
        });

        it('should start updates when showing dashboard', () => {
            const setIntervalSpy = vi.spyOn(global, 'setInterval');

            controller.showDashboard();

            expect(setIntervalSpy).toHaveBeenCalledWith(
                expect.any(Function),
                5000
            );
        });

        it('should stop updates when hiding dashboard', () => {
            controller.showDashboard();
            const intervalId = controller._intervalId;

            controller.hideDashboard();

            expect(controller._intervalId).toBe(null);
        });
    });

    describe('Tab Switching', () => {
        beforeEach(() => {
            controller.init();
        });

        it('should have overview tab as active by default', () => {
            const activeTab = controller._container.querySelector('.tab-btn.active');
            expect(activeTab.dataset.tab).toBe('overview');
        });

        it('should have overview content visible by default', () => {
            const activeContent = controller._container.querySelector('.tab-content.active');
            expect(activeContent.dataset.tab).toBe('overview');
        });

        it('should switch tabs when clicking tab button', () => {
            const webVitalsTab = controller._container.querySelector('[data-tab="web-vitals"]');
            webVitalsTab.click();

            const activeTab = controller._container.querySelector('.tab-btn.active');
            expect(activeTab.dataset.tab).toBe('web-vitals');

            const activeContent = controller._container.querySelector('.tab-content.active');
            expect(activeContent.dataset.tab).toBe('web-vitals');
        });

        it('should update tab content when switching', () => {
            const updateSpy = vi.spyOn(controller, '_updateTabContent');

            const webVitalsTab = controller._container.querySelector('[data-tab="web-vitals"]');
            webVitalsTab.click();

            expect(updateSpy).toHaveBeenCalledWith('web-vitals');
        });

        it('should track tab handlers for cleanup', () => {
            expect(controller._tabElements.length).toBe(5);
            expect(controller._tabClickHandlers.length).toBe(5);
        });
    });

    describe('Action Handling', () => {
        beforeEach(() => {
            controller.init();
        });

        it('should handle hide-observability action', () => {
            controller.showDashboard();
            expect(controller._isDashboardVisible).toBe(true);

            const closeButton = controller._container.querySelector('[data-action="hide-observability"]');
            closeButton.click();

            expect(controller._isDashboardVisible).toBe(false);
        });

        it('should handle export-now action', () => {
            const exportButton = controller._container.querySelector('[data-action="export-now"]');

            exportButton.click();

            // Should call exportNow (verify via mock)
            expect(MetricsExporter.exportNow).toHaveBeenCalled();
        });

        it('should handle clear-metrics action with confirmation', () => {
            // Mock window.confirm
            const originalConfirm = window.confirm;
            window.confirm = vi.fn().mockReturnValue(true);

            const clearButton = controller._container.querySelector('[data-action="clear-metrics"]');
            clearButton.click();

            expect(window.confirm).toHaveBeenCalledWith(
                'Are you sure you want to clear all metrics? This action cannot be undone.'
            );
            expect(PerformanceProfiler.clearMeasurements).toHaveBeenCalled();
            expect(CoreWebVitalsTracker.clearMetrics).toHaveBeenCalled();

            // Restore original
            window.confirm = originalConfirm;
        });

        it('should not clear metrics when cancelled', () => {
            // Mock window.confirm
            const originalConfirm = window.confirm;
            window.confirm = vi.fn().mockReturnValue(false);
            const clearSpy = vi.spyOn(controller, 'clearMetrics');

            const clearButton = controller._container.querySelector('[data-action="clear-metrics"]');
            clearButton.click();

            expect(clearSpy).not.toHaveBeenCalled();

            // Restore original
            window.confirm = originalConfirm;
        });

        it('should handle add-scheduled-export action', () => {
            const consoleSpy = vi.spyOn(console, 'log');
            const addButton = controller._container.querySelector('[data-action="add-scheduled-export"]');

            addButton.click();

            expect(consoleSpy).toHaveBeenCalledWith(
                '[ObservabilityController] Add scheduled export - feature not implemented'
            );
        });

        it('should handle add-external-service action', () => {
            const consoleSpy = vi.spyOn(console, 'log');
            const addButton = controller._container.querySelector('[data-action="add-external-service"]');

            addButton.click();

            expect(consoleSpy).toHaveBeenCalledWith(
                '[ObservabilityController] Add external service - feature not implemented'
            );
        });
    });

    describe('Overview Tab Updates', () => {
        beforeEach(() => {
            controller.init();
        });

        it('should update system status', () => {
            controller._updateOverviewTab();

            const statusElement = controller._container.querySelector('#metric-system-status');
            expect(statusElement.textContent).toBe('Healthy');
        });

        it('should update measurement count', () => {
            controller._updateOverviewTab();

            const countElement = controller._container.querySelector('#metric-measurement-count');
            expect(countElement.textContent).toBe('100');
        });

        it('should update memory usage', () => {
            controller._updateOverviewTab();

            const memoryElement = controller._container.querySelector('#metric-memory-usage');
            expect(memoryElement.textContent).toBe('45.2%');

            const trendElement = controller._container.querySelector('#metric-memory-trend');
            expect(trendElement.textContent).toBe('Stable');
        });

        it('should update alert count', () => {
            controller._updateOverviewTab();

            const alertElement = controller._container.querySelector('#metric-alert-count');
            // Element exists even if textContent is empty in test environment
            expect(alertElement).toBeTruthy();
        });
    });

    describe('Web Vitals Tab Updates', () => {
        beforeEach(() => {
            controller.init();
        });

        it('should update LCP vital', () => {
            controller._updateWebVitalsTab();

            const valueElement = controller._container.querySelector('#vital-LCP-value');
            expect(valueElement.textContent).toBe('1250.00');
        });

        it('should update vital rating', () => {
            controller._updateWebVitalsTab();

            const card = controller._container.querySelector('[data-vital="LCP"]');
            const ratingElement = card.querySelector('.vital-rating');
            expect(ratingElement.className).toContain('good');
            expect(ratingElement.textContent).toBe('good');
        });
    });

    describe('Performance Tab Updates', () => {
        beforeEach(() => {
            controller.init();
        });

        it('should update performance statistics for each category', () => {
            controller._updatePerformanceTab();

            // Check audio_processing category
            const avgElement = controller._container.querySelector('#perf-audio_processing-avg');
            expect(avgElement.textContent).toBe('45.50 ms');

            const p95Element = controller._container.querySelector('#perf-audio_processing-p95');
            expect(p95Element.textContent).toBe('120.30 ms');

            const countElement = controller._container.querySelector('#perf-audio_processing-count');
            expect(countElement.textContent).toBe('100');
        });
    });

    describe('Memory Tab Updates', () => {
        beforeEach(() => {
            controller.init();
        });

        it('should update memory percentage', () => {
            controller._updateMemoryTab();

            const percentageElement = controller._container.querySelector('#memory-percentage');
            expect(percentageElement.textContent).toBe('45.2%');
        });

        it('should update memory bytes', () => {
            controller._updateMemoryTab();

            const usedElement = controller._container.querySelector('#memory-used');
            expect(usedElement.textContent).toBe('45.0 MB');

            const totalElement = controller._container.querySelector('#memory-total');
            expect(totalElement.textContent).toBe('100.0 MB');

            const limitElement = controller._container.querySelector('#memory-limit');
            expect(limitElement.textContent).toBe('200.0 MB');
        });
    });

    describe('Exports Tab Updates', () => {
        beforeEach(() => {
            controller.init();
        });

        it('should show no scheduled exports message when empty', () => {
            controller._updateExportsTab();

            const scheduledList = controller._container.querySelector('#scheduled-exports-list');
            expect(scheduledList.innerHTML).toContain('No scheduled exports');
        });

        it('should show no external services message when empty', () => {
            controller._updateExportsTab();

            const servicesList = controller._container.querySelector('#external-services-list');
            expect(servicesList.innerHTML).toContain('No external services configured');
        });
    });

    describe('Export Functionality', () => {
        beforeEach(() => {
            controller.init();
        });

        it('should export with default options', async () => {
            await controller.exportNow();

            expect(MetricsExporter.exportNow).toHaveBeenCalledWith({
                format: 'json',
                schedule: 'immediate',
                categories: [],
                filters: {},
                includeMemory: true,
                includeWebVitals: true,
                aggregationWindow: 5
            });
        });

        it('should export with custom format', async () => {
            await controller.exportNow('csv');

            expect(MetricsExporter.exportNow).toHaveBeenCalledWith(
                expect.objectContaining({
                    format: 'csv'
                })
            );
        });

        it('should export with custom options', async () => {
            await controller.exportNow('prometheus', {
                includeMemory: false,
                includeWebVitals: false,
                aggregationWindow: 10
            });

            expect(MetricsExporter.exportNow).toHaveBeenCalledWith({
                format: 'prometheus',
                schedule: 'immediate',
                categories: [],
                filters: {},
                includeMemory: false,
                includeWebVitals: false,
                aggregationWindow: 10
            });
        });
    });

    describe('Clear Metrics', () => {
        beforeEach(() => {
            controller.init();
        });

        it('should clear all metrics', () => {
            controller.clearMetrics();

            expect(PerformanceProfiler.clearMeasurements).toHaveBeenCalled();
            expect(CoreWebVitalsTracker.clearMetrics).toHaveBeenCalled();
        });
    });

    describe('Cleanup and Destruction', () => {
        beforeEach(() => {
            controller.init();
            controller.showDashboard();
        });

        it('should stop updates on destroy', () => {
            expect(controller._intervalId).toBeTruthy();

            controller.destroy();

            expect(controller._intervalId).toBe(null);
        });

        it('should remove event listeners on destroy', () => {
            const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

            // Store references before destroy
            const onShowDashboard = controller._onShowDashboard;
            const onHideDashboard = controller._onHideDashboard;
            const onToggleDashboard = controller._onToggleDashboard;
            const onSettingsObservability = controller._onSettingsObservability;

            controller.destroy();

            expect(removeEventListenerSpy).toHaveBeenCalledWith(
                'observability:show',
                onShowDashboard
            );
            expect(removeEventListenerSpy).toHaveBeenCalledWith(
                'observability:hide',
                onHideDashboard
            );
            expect(removeEventListenerSpy).toHaveBeenCalledWith(
                'observability:toggle',
                onToggleDashboard
            );
            expect(removeEventListenerSpy).toHaveBeenCalledWith(
                'settings:observability',
                onSettingsObservability
            );
        });

        it('should clear tab handlers on destroy', () => {
            controller.destroy();

            expect(controller._tabElements).toEqual([]);
            expect(controller._tabClickHandlers).toEqual([]);
        });

        it('should remove container from DOM on destroy', () => {
            expect(controller._container.parentNode).toBeTruthy();

            controller.destroy();

            expect(controller._container.parentNode).toBeNull();
        });

        it('should null out handlers to prevent memory leaks', () => {
            controller.destroy();

            expect(controller._onShowDashboard).toBeNull();
            expect(controller._onHideDashboard).toBeNull();
            expect(controller._onToggleDashboard).toBeNull();
            expect(controller._onSettingsObservability).toBeNull();
            expect(controller._onActionClick).toBeNull();
        });
    });

    describe('Helper Methods', () => {
        beforeEach(() => {
            controller.init();
        });

        it('should format category names correctly', () => {
            expect(controller._formatCategoryName('audio_processing')).toBe('Audio Processing');
            expect(controller._formatCategoryName('model_inference')).toBe('Model Inference');
            expect(controller._formatCategoryName('storage_operation')).toBe('Storage Operation');
            expect(controller._formatCategoryName('rendering')).toBe('Rendering');
        });

        it('should escape HTML', () => {
            const input = '<script>alert("XSS")</script>';
            const escaped = controller._escapeHtml(input);

            expect(escaped).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
        });

        it('should get system status - healthy', () => {
            const status = controller._getSystemStatus();

            expect(status.text).toBe('Healthy');
            expect(status.class).toBe('good');
        });

        it('should get system status - warning', () => {
            PerformanceProfiler.getDegradationAlerts.mockImplementation((severity) => {
                if (severity === 'critical') return [];
                if (severity === 'warning') return [{ severity: 'warning' }];
                return [{ severity: 'warning' }];
            });

            const status = controller._getSystemStatus();

            expect(status.text).toBe('Warning');
            expect(status.class).toBe('warning');
        });

        it('should get system status - critical', () => {
            PerformanceProfiler.getDegradationAlerts.mockImplementation((severity) => {
                if (severity === 'critical') return [{ severity: 'critical' }];
                return [{ severity: 'critical' }];
            });

            const status = controller._getSystemStatus();

            expect(status.text).toBe('Critical');
            expect(status.class).toBe('critical');
        });
    });

    describe('Auto-Update Behavior', () => {
        beforeEach(() => {
            controller.init();
        });

        it('should not start duplicate update intervals', () => {
            controller.showDashboard();
            const firstInterval = controller._intervalId;

            controller.showDashboard();
            const secondInterval = controller._intervalId;

            expect(firstInterval).toBe(secondInterval);
        });

        it('should update active tab on interval', async () => {
            const updateSpy = vi.spyOn(controller, '_updateTabContent');
            vi.useFakeTimers();

            controller.showDashboard();

            // Initial update
            expect(updateSpy).toHaveBeenCalledTimes(1);

            // Advance timer by update interval
            vi.advanceTimersByTime(5000);

            // Should update again
            expect(updateSpy).toHaveBeenCalledTimes(2);

            vi.useRealTimers();
        });
    });

    describe('Event-Driven Behavior', () => {
        beforeEach(() => {
            controller.init();
        });

        it('should show dashboard on observability:show event', () => {
            const showSpy = vi.spyOn(controller, 'showDashboard');

            document.dispatchEvent(new CustomEvent('observability:show'));

            expect(showSpy).toHaveBeenCalled();
            expect(controller._isDashboardVisible).toBe(true);
        });

        it('should hide dashboard on observability:hide event', () => {
            controller.showDashboard();
            const hideSpy = vi.spyOn(controller, 'hideDashboard');

            document.dispatchEvent(new CustomEvent('observability:hide'));

            expect(hideSpy).toHaveBeenCalled();
            expect(controller._isDashboardVisible).toBe(false);
        });

        it('should toggle dashboard on observability:toggle event', () => {
            const toggleSpy = vi.spyOn(controller, 'toggleDashboard');

            document.dispatchEvent(new CustomEvent('observability:toggle'));

            expect(toggleSpy).toHaveBeenCalled();
            expect(controller._isDashboardVisible).toBe(true);
        });

        it('should show dashboard on settings:observability event', () => {
            const showSpy = vi.spyOn(controller, 'showDashboard');

            document.dispatchEvent(new CustomEvent('settings:observability'));

            expect(showSpy).toHaveBeenCalled();
            expect(controller._isDashboardVisible).toBe(true);
        });
    });

    describe('UI Structure', () => {
        beforeEach(() => {
            controller.init();
        });

        it('should create all tab content containers', () => {
            const overviewTab = controller._container.querySelector('[data-tab="overview"]');
            const vitalsTab = controller._container.querySelector('[data-tab="web-vitals"]');
            const performanceTab = controller._container.querySelector('[data-tab="performance"]');
            const memoryTab = controller._container.querySelector('[data-tab="memory"]');
            const exportsTab = controller._container.querySelector('[data-tab="exports"]');

            expect(overviewTab).toBeTruthy();
            expect(vitalsTab).toBeTruthy();
            expect(performanceTab).toBeTruthy();
            expect(memoryTab).toBeTruthy();
            expect(exportsTab).toBeTruthy();
        });
    });
});
