/**
 * Core Web Vitals Tracking Module
 *
 * Tracks Google's Core Web Vitals metrics:
 * - CLS (Cumulative Layout Shift) - Measures visual stability
 * - FID (First Input Delay) - Measures interactivity
 * - LCP (Largest Contentful Paint) - Measures loading performance
 * - INP (Interaction to Next Paint) - Measures responsiveness
 * - TTFB (Time to First Byte) - Measures server response time
 *
 * @module CoreWebVitals
 * @author Rhythm Chamber Architecture Team
 * @version 1.0.0
 */

/**
 * Core Web Vital metric types
 * @readonly
 * @enum {string}
 */
export const WebVitalType = Object.freeze({
    CLS: 'cls',
    FID: 'fid',
    LCP: 'lcp',
    INP: 'inp',
    TTFB: 'ttfb',
    FCP: 'fcp',
    TTFBP: 'ttfb_plus' // TTFB + network latency
});

/**
 * Performance rating thresholds
 * @readonly
 * @enum {Object}
 */
export const PerformanceRating = Object.freeze({
    GOOD: { value: 'good', color: '#0C0', threshold: 0 },
    NEEDS_IMPROVEMENT: { value: 'needs-improvement', color: '#CC0', threshold: 1 },
    POOR: { value: 'poor', color: '#C00', threshold: 2 }
});

/**
 * Web Vital thresholds for rating
 */
const VITAL_THRESHOLDS = {
    [WebVitalType.CLS]: { good: 0.1, needsImprovement: 0.25 },
    [WebVitalType.FID]: { good: 100, needsImprovement: 300 },
    [WebVitalType.LCP]: { good: 2500, needsImprovement: 4000 },
    [WebVitalType.INP]: { good: 200, needsImprovement: 500 },
    [WebVitalType.TTFB]: { good: 800, needsImprovement: 1800 },
    [WebVitalType.FCP]: { good: 1800, needsImprovement: 3000 }
};

/**
 * Web Vital metric record
 * @typedef {Object} WebVitalMetric
 * @property {string} id - Unique metric ID
 * @property {WebVitalType} type - Metric type
 * @property {number} value - Metric value
 * @property {string} rating - Performance rating (good/needs-improvement/poor)
 * @property {number} timestamp - Timestamp of measurement
 * @property {Object} metadata - Additional metadata
 * @property {number} percentile - 95th percentile value (for aggregated metrics)
 */

/**
 * Core Web Vitals Tracker Class
 */
export class CoreWebVitalsTracker {
    /**
     * @private
     * @type {boolean}
     */
    _enabled = true;

    /**
     * @private
     * @type {Map<WebVitalType, Array<WebVitalMetric>>}
     */
    _metrics = new Map();

    /**
     * @private
     * @type {Map<WebVitalType, WebVitalMetric>}
     */
    _latestMetrics = new Map();

    /**
     * @private
     * @type {number}
     */
    _maxMetrics = 100;

    /**
     * @private
     * @type {Function|null}
     */
    _performanceObserver = null;

    /**
     * Initialize the Core Web Vitals Tracker
     * @public
     * @param {Object} options - Configuration options
     * @param {boolean} options.enabled - Whether tracking is enabled
     * @param {number} options.maxMetrics - Maximum metrics to store per type
     */
    constructor({ enabled = true, maxMetrics = 100 } = {}) {
        this._enabled = enabled && this._isPerformanceAPIAvailable();
        this._maxMetrics = maxMetrics;

        // Initialize metric arrays
        for (const vitalType of Object.values(WebVitalType)) {
            this._metrics.set(vitalType, []);
        }

        // Start tracking if enabled
        if (this._enabled) {
            this._initializeTracking();
        }
    }

    /**
     * Check if Performance API is available
     * @private
     * @returns {boolean} True if Performance API available
     */
    _isPerformanceAPIAvailable() {
        return typeof performance !== 'undefined' &&
            typeof PerformanceObserver !== 'undefined';
    }

    /**
     * Initialize performance tracking
     * @private
     */
    _initializeTracking() {
        try {
            // Create Performance Observer for various metrics
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    this._handlePerformanceEntry(entry);
                }
            });

            // Observe different metric types
            try {
                observer.observe({ type: 'layout-shift', buffered: true });
            } catch (e) {
                console.warn('[CoreWebVitals] Layout shift observation not supported');
            }

            try {
                observer.observe({ type: 'first-input', buffered: true });
            } catch (e) {
                console.warn('[CoreWebVitals] First input observation not supported');
            }

            try {
                observer.observe({ type: 'largest-contentful-paint', buffered: true });
            } catch (e) {
                console.warn('[CoreWebVitals] LCP observation not supported');
            }

            try {
                observer.observe({ type: 'navigation', buffered: true });
            } catch (e) {
                console.warn('[CoreWebVitals] Navigation observation not supported');
            }

            try {
                observer.observe({ type: 'paint', buffered: true });
            } catch (e) {
                console.warn('[CoreWebVitals] Paint observation not supported');
            }

            this._performanceObserver = observer;

            // Track INP (Interaction to Next Paint)
            this._trackINP();

            // Track TTFB manually
            this._trackTTFB();

        } catch (error) {
            console.error('[CoreWebVitals] Failed to initialize tracking:', error);
            this._enabled = false;
        }
    }

    /**
     * Handle performance entry
     * @private
     * @param {PerformanceEntry} entry - Performance entry
     */
    _handlePerformanceEntry(entry) {
        if (!this._enabled) return;

        try {
            switch (entry.entryType) {
                case 'layout-shift':
                    if (!entry.hadRecentInput) {
                        this._trackCLS(entry);
                    }
                    break;

                case 'first-input':
                    this._trackFID(entry);
                    break;

                case 'largest-contentful-paint':
                    this._trackLCP(entry);
                    break;

                case 'paint':
                    if (entry.name === 'first-contentful-paint') {
                        this._trackFCP(entry);
                    }
                    break;

                case 'navigation':
                    this._trackNavigation(entry);
                    break;
            }
        } catch (error) {
            console.warn('[CoreWebVitals] Error handling entry:', error);
        }
    }

    /**
     * Track Cumulative Layout Shift
     * @private
     * @param {PerformanceEntry} entry - Layout shift entry
     */
    _trackCLS(entry) {
        const existingMetrics = this._metrics.get(WebVitalType.CLS) || [];

        // Calculate cumulative CLS
        let clsValue = entry.value;
        if (existingMetrics.length > 0) {
            const latestValue = existingMetrics[existingMetrics.length - 1].value;
            clsValue = latestValue + entry.value;
        }

        const metric = this._createMetric(
            WebVitalType.CLS,
            clsValue,
            {
                entryType: entry.entryType,
                hadRecentInput: entry.hadRecentInput,
                startTime: entry.startTime,
                value: entry.value
            }
        );

        this._storeMetric(WebVitalType.CLS, metric);
    }

    /**
     * Track First Input Delay
     * @private
     * @param {PerformanceEntry} entry - First input entry
     */
    _trackFID(entry) {
        const metric = this._createMetric(
            WebVitalType.FID,
            entry.processingStart - entry.startTime,
            {
                eventType: entry.name,
                startTime: entry.startTime,
                processingStart: entry.processingStart,
                processingEnd: entry.processingEnd,
                duration: entry.duration
            }
        );

        this._storeMetric(WebVitalType.FID, metric);
    }

    /**
     * Track Largest Contentful Paint
     * @private
     * @param {PerformanceEntry} entry - LCP entry
     */
    _trackLCP(entry) {
        // LCP can change, so we replace the previous value
        const metric = this._createMetric(
            WebVitalType.LCP,
            entry.startTime,
            {
                element: entry.element?.tagName || 'unknown',
                url: entry.url || '',
                startTime: entry.startTime,
                renderTime: entry.renderTime || entry.startTime,
                loadTime: entry.loadTime || entry.startTime,
                size: entry.size || 0
            }
        );

        // Replace previous LCP metric (only keep latest)
        this._latestMetrics.set(WebVitalType.LCP, metric);
        this._metrics.set(WebVitalType.LLS, [metric]);
    }

    /**
     * Track First Contentful Paint
     * @private
     * @param {PerformanceEntry} entry - FCP entry
     */
    _trackFCP(entry) {
        const metric = this._createMetric(
            WebVitalType.FCP,
            entry.startTime,
            {
                name: entry.name,
                startTime: entry.startTime
            }
        );

        // Only store first FCP
        if (this._metrics.get(WebVitalType.FCP).length === 0) {
            this._storeMetric(WebVitalType.FCP, metric);
        }
    }

    /**
     * Track Interaction to Next Paint
     * @private
     */
    _trackINP() {
        // INP requires Event Timing API
        if (!('PerformanceEventTiming' in window)) {
            console.warn('[CoreWebVitals] PerformanceEventTiming not supported');
            return;
        }

        try {
            const observer = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                for (const entry of entries) {
                    if (entry.interactionId) {
                        this._handleINPEntry(entry);
                    }
                }
            });

            observer.observe({ type: 'event', buffered: true, durationThreshold: 0 });
        } catch (error) {
            console.warn('[CoreWebVitals] INP tracking not supported:', error);
        }
    }

    /**
     * Handle INP entry
     * @private
     * @param {PerformanceEntry} entry - Event timing entry
     */
    _handleINPEntry(entry) {
        const inpEntries = this._metrics.get(WebVitalType.INP) || [];

        const metric = this._createMetric(
            WebVitalType.INP,
            entry.duration + entry.processingStart - entry.startTime,
            {
                eventType: entry.name,
                interactionId: entry.interactionId,
                startTime: entry.startTime,
                processingStart: entry.processingStart,
                processingEnd: entry.processingEnd,
                duration: entry.duration
            }
        );

        // INP is the worst interaction (98th percentile)
        inpEntries.push(metric);

        // Keep only recent interactions (last 50)
        if (inpEntries.length > 50) {
            inpEntries.shift();
        }

        this._metrics.set(WebVitalType.INP, inpEntries);

        // Calculate 98th percentile
        const sorted = inpEntries.map(m => m.value).sort((a, b) => a - b);
        const p98Index = Math.floor(sorted.length * 0.98);
        const p98Value = sorted[p98Index] || sorted[sorted.length - 1];

        this._latestMetrics.set(WebVitalType.INP, {
            ...metric,
            value: p98Value,
            percentile: 98
        });
    }

    /**
     * Track Time to First Byte
     * @private
     */
    _trackTTFB() {
        const navigationEntry = performance.getEntriesByType('navigation')[0];
        if (!navigationEntry) {
            console.warn('[CoreWebVitals] No navigation entry found for TTFB');
            return;
        }

        const ttfb = navigationEntry.responseStart - navigationEntry.requestStart;
        const metric = this._createMetric(
            WebVitalType.TTFB,
            ttfb,
            {
                requestStart: navigationEntry.requestStart,
                responseStart: navigationEntry.responseStart,
                domComplete: navigationEntry.domComplete,
                loadEventEnd: navigationEntry.loadEventEnd
            }
        );

        this._storeMetric(WebVitalType.TTFB, metric);
    }

    /**
     * Track navigation entry
     * @private
     * @param {PerformanceEntry} entry - Navigation entry
     */
    _trackNavigation(entry) {
        // Additional navigation metrics can be tracked here
        if (entry.responseStart && entry.requestStart) {
            const ttfb = entry.responseStart - entry.requestStart;

            // Store TTFB if not already stored
            if (!this._latestMetrics.has(WebVitalType.TTFB)) {
                const metric = this._createMetric(
                    WebVitalType.TTFB,
                    ttfb,
                    {
                        requestStart: entry.requestStart,
                        responseStart: entry.responseStart,
                        domComplete: entry.domComplete,
                        loadEventEnd: entry.loadEventEnd
                    }
                );

                this._latestMetrics.set(WebVitalType.TTFB, metric);
                this._storeMetric(WebVitalType.TTFB, metric);
            }
        }
    }

    /**
     * Create metric record
     * @private
     * @param {WebVitalType} type - Metric type
     * @param {number} value - Metric value
     * @param {Object} metadata - Additional metadata
     * @returns {WebVitalMetric} Metric record
     */
    _createMetric(type, value, metadata = {}) {
        const rating = this._calculateRating(type, value);

        return {
            id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type,
            value,
            rating,
            timestamp: Date.now(),
            metadata
        };
    }

    /**
     * Calculate performance rating for a metric
     * @private
     * @param {WebVitalType} type - Metric type
     * @param {number} value - Metric value
     * @returns {string} Performance rating
     */
    _calculateRating(type, value) {
        const thresholds = VITAL_THRESHOLDS[type];
        if (!thresholds) {
            return PerformanceRating.GOOD.value;
        }

        if (value <= thresholds.good) {
            return PerformanceRating.GOOD.value;
        } else if (value <= thresholds.needsImprovement) {
            return PerformanceRating.NEEDS_IMPROVEMENT.value;
        } else {
            return PerformanceRating.POOR.value;
        }
    }

    /**
     * Store metric with automatic pruning
     * @private
     * @param {WebVitalType} type - Metric type
     * @param {WebVitalMetric} metric - Metric to store
     */
    _storeMetric(type, metric) {
        const metrics = this._metrics.get(type) || [];
        metrics.push(metric);

        // Prune old metrics if exceeding max
        if (metrics.length > this._maxMetrics) {
            metrics.shift();
        }

        this._metrics.set(type, metrics);
        this._latestMetrics.set(type, metric);
    }

    /**
     * Get latest metric for a type
     * @public
     * @param {WebVitalType} type - Metric type
     * @returns {WebVitalMetric|null} Latest metric or null
     */
    getLatestMetric(type) {
        return this._latestMetrics.get(type) || null;
    }

    /**
     * Get all metrics for a type
     * @public
     * @param {WebVitalType} type - Metric type
     * @returns {Array<WebVitalMetric>} All metrics for type
     */
    getMetrics(type) {
        return this._metrics.get(type) || [];
    }

    /**
     * Get all web vitals summary
     * @public
     * @returns {Object} Summary of all web vitals
     */
    getWebVitalsSummary() {
        const summary = {
            timestamp: Date.now(),
            enabled: this._enabled,
            vitals: {}
        };

        for (const vitalType of Object.values(WebVitalType)) {
            const latest = this._latestMetrics.get(vitalType);
            const allMetrics = this._metrics.get(vitalType) || [];

            summary.vitals[vitalType] = {
                latest: latest || null,
                count: allMetrics.length,
                statistics: this._calculateStatistics(allMetrics)
            };
        }

        return summary;
    }

    /**
     * Calculate statistics for metrics
     * @private
     * @param {Array<WebVitalMetric>} metrics - Array of metrics
     * @returns {Object} Statistics object
     */
    _calculateStatistics(metrics) {
        if (metrics.length === 0) {
            return { avg: 0, min: 0, max: 0, p95: 0, p99: 0 };
        }

        const values = metrics.map(m => m.value).sort((a, b) => a - b);
        const total = values.reduce((sum, v) => sum + v, 0);

        return {
            avg: total / values.length,
            min: values[0],
            max: values[values.length - 1],
            p95: values[Math.floor(values.length * 0.95)],
            p99: values[Math.floor(values.length * 0.99)]
        };
    }

    /**
     * Get performance rating color
     * @public
     * @param {string} rating - Performance rating
     * @returns {string} CSS color value
     */
    getRatingColor(rating) {
        switch (rating) {
            case PerformanceRating.GOOD.value:
                return PerformanceRating.GOOD.color;
            case PerformanceRating.NEEDS_IMPROVEMENT.value:
                return PerformanceRating.NEEDS_IMPROVEMENT.color;
            case PerformanceRating.POOR.value:
                return PerformanceRating.POOR.color;
            default:
                return '#666';
        }
    }

    /**
     * Check if tracking is enabled
     * @public
     * @returns {boolean} True if enabled
     */
    isEnabled() {
        return this._enabled;
    }

    /**
     * Enable web vitals tracking
     * @public
     */
    enable() {
        if (!this._enabled && this._isPerformanceAPIAvailable()) {
            this._enabled = true;
            this._initializeTracking();
            console.log('[CoreWebVitals] Enabled');
        }
    }

    /**
     * Disable web vitals tracking
     * @public
     */
    disable() {
        this._enabled = false;
        if (this._performanceObserver) {
            this._performanceObserver.disconnect();
            this._performanceObserver = null;
        }
        console.log('[CoreWebVitals] Disabled');
    }

    /**
     * Clear all stored metrics
     * @public
     */
    clearMetrics() {
        for (const vitalType of Object.values(WebVitalType)) {
            this._metrics.set(vitalType, []);
            this._latestMetrics.delete(vitalType);
        }
        console.log('[CoreWebVitals] Cleared all metrics');
    }

    /**
     * Export metrics to JSON
     * @public
     * @returns {string} JSON export
     */
    exportToJSON() {
        const data = {
            version: '1.0.0',
            exportDate: new Date().toISOString(),
            summary: this.getWebVitalsSummary(),
            metrics: {}
        };

        for (const vitalType of Object.values(WebVitalType)) {
            data.metrics[vitalType] = this._metrics.get(vitalType) || [];
        }

        return JSON.stringify(data, null, 2);
    }
}

// Export singleton instance
const CoreWebVitalsSingleton = new CoreWebVitalsTracker();
export default CoreWebVitalsSingleton;