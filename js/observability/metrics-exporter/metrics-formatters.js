/**
 * Metrics Formatters
 *
 * Handles format conversions including:
 * - Export to different formats (JSON, Prometheus, StatsD, CSV, InfluxDB)
 * - Format transformations
 * - Label/tag formatting
 *
 * @module MetricsFormatters
 * @author Rhythm Chamber Architecture Team
 * @version 1.0.0
 */

export class MetricsFormatters {
    /**
     * @private
     * @type {number}
     */
    _indentation = 2;

    /**
     * Initialize the Metrics Formatters
     * @public
     * @param {Object} options - Configuration options
     * @param {number} options.indentation - JSON indentation spaces
     */
    constructor({ indentation = 2 } = {}) {
        this._indentation = indentation;
    }

    /**
     * Format metrics as JSON
     * @public
     * @param {Object} metrics - Metrics object
     * @returns {string} JSON formatted string
     */
    formatAsJSON(metrics) {
        try {
            return JSON.stringify(metrics, null, this._indentation);
        } catch (error) {
            throw new Error(`Failed to format as JSON: ${error.message}`);
        }
    }

    /**
     * Format metrics as CSV
     * @public
     * @param {Object} metrics - Metrics object
     * @returns {string} CSV formatted string
     */
    formatAsCSV(metrics) {
        const rows = [];

        // Flatten metrics for CSV export
        const flatMetrics = this.flattenMetrics(metrics);

        if (flatMetrics.length === 0) {
            return 'timestamp,category,name,duration,value,type\n';
        }

        // Add header
        const headers = Object.keys(flatMetrics[0]);
        rows.push(headers.join(','));

        // Add data rows
        for (const metric of flatMetrics) {
            const values = headers.map(header => {
                const value = metric[header];
                return this.escapeCSVValue(value);
            });
            rows.push(values.join(','));
        }

        return rows.join('\n');
    }

    /**
     * Format metrics as Prometheus format
     * @public
     * @param {Object} metrics - Metrics object
     * @returns {string} Prometheus formatted string
     */
    formatAsPrometheus(metrics) {
        const lines = [];

        // Performance metrics
        if (metrics.performance?.categories) {
            for (const [category, data] of Object.entries(metrics.performance.categories)) {
                if (data.statistics) {
                    const metricName = this.sanitizeMetricName(`rhythm_chamber_${category}_duration_ms`);
                    lines.push(`# HELP ${metricName} Duration for ${category}`);
                    lines.push(`# TYPE ${metricName} gauge`);
                    lines.push(`${metricName} ${data.statistics.avgDuration}`);
                }
            }
        }

        // Web vitals
        if (metrics.webVitals?.vitals) {
            for (const [vitalType, vitalData] of Object.entries(metrics.webVitals.vitals)) {
                if (vitalData.latest) {
                    const metricName = this.sanitizeMetricName(`rhythm_chamber_web_vital_${vitalType}`);
                    lines.push(`# HELP ${metricName} Web Vital ${vitalType}`);
                    lines.push(`# TYPE ${metricName} gauge`);
                    lines.push(`${metricName}{rating="${vitalData.latest.rating}"} ${vitalData.latest.value}`);
                }
            }
        }

        // Memory metrics
        if (metrics.memory?.currentUsage != null && typeof metrics.memory.currentUsage === 'number') {
            const metricName = this.sanitizeMetricName('rhythm_chamber_memory_usage_percent');
            lines.push(`# HELP ${metricName} Memory usage percentage`);
            lines.push(`# TYPE ${metricName} gauge`);
            lines.push(`${metricName} ${metrics.memory.currentUsage}`);
        }

        return lines.join('\n');
    }

    /**
     * Format metrics as InfluxDB line protocol
     * @public
     * @param {Object} metrics - Metrics object
     * @returns {string} InfluxDB formatted string
     */
    formatAsInfluxDB(metrics) {
        const lines = [];
        const timestamp = Date.now() * 1000000; // Convert to nanoseconds

        // Performance measurements
        if (metrics.performance?.categories) {
            for (const [category, data] of Object.entries(metrics.performance.categories)) {
                if (data.statistics) {
                    const tags = `category=${category}`;
                    const fields = `avg=${data.statistics.avgDuration},max=${data.statistics.maxDuration},min=${data.statistics.minDuration}`;
                    lines.push(`performance_measurements,${tags} ${fields} ${timestamp}`);
                }
            }
        }

        return lines.join('\n');
    }

    /**
     * Format metrics as StatsD format
     * @public
     * @param {Object} metrics - Metrics object
     * @returns {string} StatsD formatted string
     */
    formatAsStatsD(metrics) {
        const lines = [];

        // Performance metrics
        if (metrics.performance?.categories) {
            for (const [category, data] of Object.entries(metrics.performance.categories)) {
                if (data.statistics) {
                    const metricName = this.sanitizeMetricName(`rhythm_chamber.${category}.duration_ms`);
                    lines.push(`${metricName}:${data.statistics.avgDuration}|g`);
                }
            }
        }

        // Web vitals
        if (metrics.webVitals?.vitals) {
            for (const [vitalType, vitalData] of Object.entries(metrics.webVitals.vitals)) {
                if (vitalData.latest) {
                    const metricName = this.sanitizeMetricName(`rhythm_chamber.web_vitals.${vitalType}`);
                    lines.push(`${metricName}:${vitalData.latest.value}|g`);
                }
            }
        }

        // Memory metrics
        if (metrics.memory?.currentUsage != null) {
            const metricName = this.sanitizeMetricName('rhythm_chamber.memory.usage_percent');
            lines.push(`${metricName}:${metrics.memory.currentUsage}|g`);
        }

        return lines.join('\n');
    }

    /**
     * Format metrics for Datadog
     * @public
     * @param {Object} metrics - Metrics object
     * @returns {Object} Datadog series format
     */
    formatForDatadog(metrics) {
        const series = [];
        const now = Date.now() / 1000; // Unix timestamp

        // Flatten metrics to extract numeric values
        const flatMetrics = this._extractNumericMetrics(metrics);

        for (const [key, value] of Object.entries(flatMetrics)) {
            if (typeof value === 'number') {
                series.push({
                    metric: `rhythm_chamber.${key}`,
                    points: [[now, value]],
                    type: 'gauge'
                });
            }
        }

        return { series };
    }

    /**
     * Format metrics for New Relic
     * @public
     * @param {Object} metrics - Metrics object
     * @returns {Object} New Relic metrics format
     */
    formatForNewRelic(metrics) {
        const nrMetrics = [];
        const now = Date.now();

        // Flatten metrics to extract numeric values
        const flatMetrics = this._extractNumericMetrics(metrics);

        for (const [key, value] of Object.entries(flatMetrics)) {
            if (typeof value === 'number') {
                nrMetrics.push({
                    name: `rhythm_chamber.${key}`,
                    value: value,
                    timestamp: now,
                    type: 'gauge'
                });
            }
        }

        return { metrics: nrMetrics };
    }

    /**
     * Format labels for Prometheus
     * @public
     * @param {Object} labels - Label key-value pairs
     * @returns {string} Formatted labels string
     */
    formatLabels(labels) {
        const entries = Object.entries(labels)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => {
                const escapedValue = String(value).replace(/"/g, '\\"');
                return `${key}="${escapedValue}"`;
            });

        return entries.join(',');
    }

    /**
     * Sanitize metric name for Prometheus compatibility
     * @public
     * @param {string} name - Metric name
     * @returns {string} Sanitized name
     */
    sanitizeMetricName(name) {
        // Replace invalid characters with underscores
        let sanitized = name.replace(/[^a-zA-Z0-9_:]/g, '_');

        // Ensure first character matches [a-zA-Z_:]
        if (!/^[a-zA-Z_:]/.test(sanitized)) {
            sanitized = '_' + sanitized;
        }

        return sanitized;
    }

    /**
     * Flatten nested metrics structure
     * @public
     * @param {Object} metrics - Nested metrics object
     * @returns {Array<Object>} Flattened metrics array
     */
    flattenMetrics(metrics) {
        const flattened = [];

        // Flatten performance measurements
        if (metrics.performance?.measurements) {
            for (const measurement of metrics.performance.measurements) {
                flattened.push({
                    timestamp: measurement.timestamp,
                    category: measurement.category,
                    name: measurement.name,
                    duration: measurement.duration,
                    type: 'performance'
                });
            }
        }

        // Flatten web vitals
        if (metrics.webVitals?.vitals) {
            for (const [vitalType, vitalData] of Object.entries(metrics.webVitals.vitals)) {
                if (vitalData.latest) {
                    flattened.push({
                        timestamp: vitalData.latest.timestamp,
                        category: vitalType,
                        name: vitalType,
                        value: vitalData.latest.value,
                        rating: vitalData.latest.rating,
                        type: 'web_vital'
                    });
                }
            }
        }

        return flattened;
    }

    /**
     * Escape value for CSV format
     * @public
     * @param {*} value - Value to escape
     * @returns {string} Escaped CSV value
     */
    escapeCSVValue(value) {
        // Handle null/undefined
        if (value == null) {
            return '';
        }

        // Convert to string
        let strValue = String(value);

        // Escape double-quotes by doubling them
        strValue = strValue.replace(/"/g, '""');

        // Wrap in double quotes
        return `"${strValue}"`;
    }

    /**
     * Get MIME type for format
     * @public
     * @param {string} format - Export format
     * @returns {string} MIME type
     */
    getMimeType(format) {
        const mimeTypes = {
            json: 'application/json',
            csv: 'text/csv',
            prometheus: 'text/plain',
            influxdb: 'text/plain',
            statsd: 'text/plain'
        };

        return mimeTypes[format] || 'text/plain';
    }

    /**
     * Get file extension for format
     * @public
     * @param {string} format - Export format
     * @returns {string} File extension
     */
    getFileExtension(format) {
        const extensions = {
            json: 'json',
            csv: 'csv',
            prometheus: 'prom',
            influxdb: 'txt',
            statsd: 'txt'
        };

        return extensions[format] || 'txt';
    }

    /**
     * Format timestamp as ISO string
     * @public
     * @param {number|Date} timestamp - Timestamp to format
     * @returns {string} ISO formatted timestamp
     */
    formatTimestamp(timestamp) {
        const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
        return date.toISOString();
    }

    /**
     * Format metrics based on format type
     * @public
     * @param {Object} metrics - Metrics to format
     * @param {string} format - Format type
     * @returns {string} Formatted metrics
     */
    format(metrics, format) {
        switch (format) {
            case 'json':
                return this.formatAsJSON(metrics);

            case 'csv':
                return this.formatAsCSV(metrics);

            case 'prometheus':
                return this.formatAsPrometheus(metrics);

            case 'influxdb':
                return this.formatAsInfluxDB(metrics);

            case 'statsd':
                return this.formatAsStatsD(metrics);

            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }

    /**
     * Extract numeric metrics from nested structure
     * @private
     * @param {Object} metrics - Metrics object
     * @returns {Object} Flat object with numeric values
     */
    _extractNumericMetrics(metrics, prefix = '') {
        const result = {};

        for (const [key, value] of Object.entries(metrics)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;

            if (typeof value === 'number' && !isNaN(value)) {
                result[fullKey] = value;
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                Object.assign(result, this._extractNumericMetrics(value, fullKey));
            }
        }

        return result;
    }
}
