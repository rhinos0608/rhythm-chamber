/**
 * Metrics Aggregator
 *
 * Handles data aggregation logic including:
 * - Aggregating metrics from multiple sources
 * - Calculating statistics (mean, median, percentiles)
 * - Time-window aggregation
 *
 * @module MetricsAggregator
 * @author Rhythm Chamber Architecture Team
 * @version 1.0.0
 */

export class MetricsAggregator {
    /**
     * @private
     * @type {number}
     */
    _windowSize = 60000; // 1 minute default

    /**
     * @private
     * @type {Array<Object>}
     */
    _metricsBuffer = [];

    /**
     * Initialize the Metrics Aggregator
     * @public
     * @param {Object} options - Configuration options
     * @param {number} options.windowSize - Time window size in milliseconds
     */
    constructor({ windowSize = 60000 } = {}) {
        this._windowSize = windowSize;
    }

    /**
     * Aggregate metrics from multiple sources
     * @public
     * @param {Object} metrics - Raw metrics object
     * @param {Object} filters - Optional filters
     * @returns {Object} Aggregated metrics
     */
    aggregateMetrics(metrics, filters = {}) {
        const aggregated = {
            performance: this._aggregatePerformance(metrics.performance, filters),
            webVitals: this._aggregateWebVitals(metrics.webVitals),
            memory: this._aggregateMemory(metrics.memory),
        };

        return aggregated;
    }

    /**
     * Calculate statistics for numeric values
     * @public
     * @param {Array<number>} values - Numeric values
     * @param {Array<number>} percentiles - Percentiles to calculate (e.g., [50, 90, 95])
     * @returns {Object} Statistics object
     */
    calculateStatistics(values, percentiles = []) {
        if (!values || values.length === 0) {
            return {
                count: 0,
                mean: 0,
                median: 0,
                min: 0,
                max: 0,
                stdDev: 0,
                percentiles: {},
            };
        }

        const sorted = [...values].sort((a, b) => a - b);
        const count = sorted.length;
        const sum = sorted.reduce((acc, val) => acc + val, 0);
        const mean = sum / count;

        const statistics = {
            count,
            mean,
            median: this._calculateMedian(sorted),
            min: sorted[0],
            max: sorted[count - 1],
            stdDev: this._calculateStdDev(sorted, mean),
            percentiles: {},
        };

        // Calculate requested percentiles
        for (const p of percentiles) {
            statistics.percentiles[p] = this.calculatePercentile(sorted, p);
        }

        return statistics;
    }

    /**
     * Aggregate metrics within a time window
     * @public
     * @param {Array<Object>} metrics - Array of metrics with timestamps
     * @param {number} currentTime - Current timestamp
     * @param {number} windowSize - Window size in milliseconds
     * @returns {Object} Windowed aggregation results
     */
    aggregateByTimeWindow(metrics, currentTime, windowSize = this._windowSize) {
        const windowStart = currentTime - windowSize;
        const windowed = metrics.filter(m => m.timestamp >= windowStart);

        const values = windowed.map(m => m.value || m.duration);
        const statistics = this.calculateStatistics(values);

        return {
            metrics: windowed,
            statistics,
            windowStart,
            windowEnd: currentTime,
            count: windowed.length,
        };
    }

    /**
     * Merge multiple metric arrays
     * @public
     * @param {Array<Array<Object>>} metricsArrays - Array of metric arrays
     * @returns {Array<Object>} Merged metrics
     */
    mergeMetrics(metricsArrays) {
        const merged = metricsArrays.flat();

        // Remove duplicates based on timestamp
        const seen = new Set();
        const unique = merged.filter(metric => {
            const key = metric.timestamp
                ? `${metric.name}-${metric.timestamp}`
                : `${metric.name}-${metric.value}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });

        return unique;
    }

    /**
     * Filter metrics based on criteria
     * @public
     * @param {Array<Object>} metrics - Metrics to filter
     * @param {Object} filters - Filter criteria
     * @returns {Array<Object>} Filtered metrics
     */
    filterMetrics(metrics, filters) {
        return metrics.filter(metric => {
            // Filter by category
            if (filters.category && metric.category !== filters.category) {
                return false;
            }

            // Filter by name pattern
            if (filters.namePattern && !filters.namePattern.test(metric.name)) {
                return false;
            }

            // Filter by value range
            if (filters.minValue !== undefined && metric.value < filters.minValue) {
                return false;
            }
            if (filters.maxValue !== undefined && metric.value > filters.maxValue) {
                return false;
            }

            // Filter by duration range
            if (filters.minDuration !== undefined && metric.duration < filters.minDuration) {
                return false;
            }
            if (filters.maxDuration !== undefined && metric.duration > filters.maxDuration) {
                return false;
            }

            return true;
        });
    }

    /**
     * Buffer metrics for time-window aggregation
     * @public
     * @param {Object} metric - Metric to buffer
     */
    bufferMetrics(metric) {
        const bufferedMetric = {
            ...metric,
            timestamp: metric.timestamp || Date.now(),
        };

        this._metricsBuffer.push(bufferedMetric);
    }

    /**
     * Prune old metrics from buffer
     * @public
     * @param {number} currentTime - Current timestamp
     */
    pruneBuffer(currentTime = Date.now()) {
        const windowStart = currentTime - this._windowSize;
        this._metricsBuffer = this._metricsBuffer.filter(m => m.timestamp >= windowStart);
    }

    /**
     * Clear metrics buffer
     * @public
     */
    clearBuffer() {
        this._metricsBuffer = [];
    }

    /**
     * Get buffered metrics
     * @public
     * @returns {Array<Object>} Copy of buffered metrics
     */
    getBufferedMetrics() {
        return [...this._metricsBuffer];
    }

    /**
     * Calculate percentile
     * @public
     * @param {Array<number>} sortedValues - Sorted numeric values
     * @param {number} percentile - Percentile to calculate (0-100)
     * @returns {number} Percentile value
     */
    calculatePercentile(sortedValues, percentile) {
        if (!sortedValues || sortedValues.length === 0) {
            return 0;
        }

        const index = (percentile / 100) * (sortedValues.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;

        if (upper >= sortedValues.length) {
            return sortedValues[sortedValues.length - 1];
        }

        return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
    }

    /**
     * Format aggregated metrics for export
     * @public
     * @param {Object} aggregated - Aggregated metrics
     * @param {Object} metadata - Optional metadata
     * @returns {Object} Formatted metrics
     */
    formatAggregatedMetrics(aggregated, metadata = {}) {
        const formatted = {
            timestamp: new Date().toISOString(),
            performance: {
                count: aggregated.performance?.count || 0,
                total: aggregated.performance?.total || 0,
                summary: aggregated.performance?.statistics || null,
            },
            webVitals: {
                count: aggregated.webVitals?.count || 0,
                vitals: aggregated.webVitals?.vitals || {},
            },
            memory: {
                count: aggregated.memory?.count || 0,
                summary: aggregated.memory?.statistics || null,
            },
        };

        if (Object.keys(metadata).length > 0) {
            formatted.metadata = metadata;
        }

        return formatted;
    }

    /**
     * Aggregate performance metrics
     * @private
     * @param {Object} performance - Performance metrics
     * @param {Object} filters - Filter criteria
     * @returns {Object} Aggregated performance metrics
     */
    _aggregatePerformance(performance, filters) {
        if (!performance?.measurements) {
            return { count: 0, total: 0, statistics: null };
        }

        let measurements = performance.measurements;

        // Apply category filter if specified
        if (filters.categories && filters.categories.length > 0) {
            measurements = measurements.filter(m => filters.categories.includes(m.category));
        }

        if (measurements.length === 0) {
            return { count: 0, total: 0, statistics: null };
        }

        const durations = measurements.map(m => m.duration);
        const statistics = this.calculateStatistics(durations);
        const total = durations.reduce((acc, val) => acc + val, 0);

        return {
            count: measurements.length,
            total,
            statistics,
        };
    }

    /**
     * Aggregate web vitals
     * @private
     * @param {Object} webVitals - Web vitals metrics
     * @returns {Object} Aggregated web vitals
     */
    _aggregateWebVitals(webVitals) {
        if (!webVitals?.vitals) {
            return { count: 0, vitals: {} };
        }

        const vitals = {};
        let count = 0;

        for (const [vitalType, vitalData] of Object.entries(webVitals.vitals)) {
            if (vitalData?.latest) {
                vitals[vitalType] = {
                    value: vitalData.latest.value,
                    rating: vitalData.latest.rating,
                    timestamp: vitalData.latest.timestamp,
                };
                count++;
            }
        }

        return { count, vitals };
    }

    /**
     * Aggregate memory metrics
     * @private
     * @param {Object} memory - Memory metrics
     * @returns {Object} Aggregated memory metrics
     */
    _aggregateMemory(memory) {
        if (!memory) {
            return { count: 0 };
        }

        const values = [];

        if (memory.currentUsage != null) {
            values.push(memory.currentUsage);
        }
        if (memory.peakUsage != null) {
            values.push(memory.peakUsage);
        }

        if (values.length === 0) {
            return { count: 0 };
        }

        const statistics = this.calculateStatistics(values);

        return {
            count: values.length,
            statistics,
        };
    }

    /**
     * Calculate median
     * @private
     * @param {Array<number>} sortedValues - Sorted numeric values
     * @returns {number} Median value
     */
    _calculateMedian(sortedValues) {
        const mid = Math.floor(sortedValues.length / 2);

        if (sortedValues.length % 2 === 0) {
            return (sortedValues[mid - 1] + sortedValues[mid]) / 2;
        }

        return sortedValues[mid];
    }

    /**
     * Calculate standard deviation
     * @private
     * @param {Array<number>} values - Numeric values
     * @param {number} mean - Mean value
     * @returns {number} Standard deviation
     */
    _calculateStdDev(values, mean) {
        const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
        const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / values.length;
        return Math.sqrt(variance);
    }
}
