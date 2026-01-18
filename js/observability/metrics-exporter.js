/**
 * Metrics Export Framework
 *
 * Provides comprehensive metrics export and scheduling functionality.
 * Supports multiple export formats (JSON, CSV, Prometheus) and external service integrations.
 *
 * @module MetricsExporter
 * @author Rhythm Chamber Architecture Team
 * @version 1.0.0
 */

/**
 * Export format types
 * @readonly
 * @enum {string}
 */
export const ExportFormat = Object.freeze({
    JSON: 'json',
    CSV: 'csv',
    PROMETHEUS: 'prometheus',
    INFLUXDB: 'influxdb'
});

/**
 * Export schedule types
 * @readonly
 * @enum {string}
 */
export const ScheduleType = Object.freeze({
    IMMEDIATE: 'immediate',
    HOURLY: 'hourly',
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly'
});

/**
 * External service integration types
 * @readonly
 * @enum {string}
 */
export const ExternalService = Object.freeze({
    DATADOG: 'datadog',
    NEWRELIC: 'newrelic',
    PROMETHEUS_PUSHGATEWAY: 'prometheus_pushgateway',
    CUSTOM_ENDPOINT: 'custom_endpoint'
});

/**
 * Export configuration
 * @typedef {Object} ExportConfig
 * @property {ExportFormat} format - Export format
 * @property {ScheduleType} schedule - Export schedule
 * @property {Array<string>} categories - Categories to export
 * @property {Object} filters - Export filters
 * @property {boolean} includeMemory - Include memory metrics
 * @property {boolean} includeWebVitals - Include web vitals
 * @property {number} aggregationWindow - Aggregation window in minutes
 */

/**
 * External service configuration
 * @typedef {Object} ExternalServiceConfig
 * @property {ExternalService} service - Service type
 * @property {string} endpoint - Service endpoint URL
 * @property {Object} credentials - Service credentials (encrypted)
 * @property {Object} headers - Additional HTTP headers
 * @property {number} timeout - Request timeout in milliseconds
 */

/**
 * Export job record
 * @typedef {Object} ExportJob
 * @property {string} id - Job ID
 * @property {string} name - Job name
 * @property {ExportConfig} config - Export configuration
 * @property {Date} nextRun - Next scheduled run time
 * @property {Date} lastRun - Last run time
 * @property {string} status - Job status
 * @property {number} successCount - Success count
 * @property {number} failureCount - Failure count
 */

/**
 * Metrics Exporter Class
 */
export class MetricsExporter {
    /**
     * @private
     * @type {boolean}
     */
    _enabled = true;

    /**
     * @private
     * @type {Map<string, ExportJob>}
     */
    _scheduledJobs = new Map();

    /**
     * @private
     * @type {Array<ExternalServiceConfig>}
     */
    _externalServices = [];

    /**
     * @private
     * @type {Object}
     */
    _storageKey = 'observability_export_config';

    /**
     * @private
     * @type {Object}
     */
    _encryptionConfig = null;

    /**
     * @private
     * @type {number|null}
     */
    _schedulerInterval = null;

    /**
     * Initialize the Metrics Exporter
     * @public
     * @param {Object} options - Configuration options
     * @param {boolean} options.enabled - Whether exporter is enabled
     * @param {Object} options.encryptionConfig - Configuration for credential encryption
     */
    constructor({ enabled = true, encryptionConfig = null } = {}) {
        this._enabled = enabled;
        this._encryptionConfig = encryptionConfig;
    }

    /**
     * Async initialization factory method
     * @public
     * @static
     * @param {Object} options - Configuration options
     * @returns {Promise<MetricsExporter>} Initialized metrics exporter
     */
    static async create({ enabled = true, encryptionConfig = null } = {}) {
        const instance = new MetricsExporter({ enabled, encryptionConfig });
        await instance._loadConfiguration();
        if (instance._enabled) {
            instance._startScheduler();
        }
        return instance;
    }

    /**
     * Load configuration from storage
     * @private
     */
    async _loadConfiguration() {
        try {
            const stored = localStorage.getItem(this._storageKey);
            if (stored) {
                const config = JSON.parse(stored);

                // Revive Date instances for scheduled jobs
                const jobEntries = Object.entries(config.scheduledJobs || {});
                const revivedJobs = jobEntries.map(([id, job]) => {
                    const revivedJob = { ...job };
                    if (job.nextRun) {
                        revivedJob.nextRun = new Date(job.nextRun);
                    }
                    if (job.lastRun) {
                        revivedJob.lastRun = new Date(job.lastRun);
                    }
                    return [id, revivedJob];
                });

                this._scheduledJobs = new Map(revivedJobs);

                // Decrypt external service credentials
                this._externalServices = await this._decryptExternalServices(config.externalServices || []);
            }
        } catch (error) {
            console.warn('[MetricsExporter] Failed to load configuration:', error);
        }
    }

    /**
     * Save configuration to storage
     * @private
     */
    async _saveConfiguration() {
        try {
            // Encrypt external service credentials before saving
            const encryptedServices = await this._encryptExternalServices(this._externalServices);

            const config = {
                scheduledJobs: Object.fromEntries(this._scheduledJobs),
                externalServices: encryptedServices
            };
            localStorage.setItem(this._storageKey, JSON.stringify(config));
        } catch (error) {
            console.error('[MetricsExporter] Failed to save configuration:', error);
        }
    }

    /**
     * Start job scheduler
     * @private
     */
    _startScheduler() {
        // Only start if not already running
        if (this._schedulerInterval) {
            return;
        }

        // Check every minute for jobs to run
        this._schedulerInterval = setInterval(() => {
            this._checkScheduledJobs();
        }, 60000);
    }

    /**
     * Check and run scheduled jobs
     * @private
     */
    async _checkScheduledJobs() {
        const now = new Date();

        for (const [jobId, job] of this._scheduledJobs) {
            if (job.status === 'paused') continue;

            if (job.nextRun && now >= job.nextRun) {
                await this._executeJob(job);
            }
        }
    }

    /**
     * Execute export job
     * @private
     * @param {ExportJob} job - Job to execute
     */
    async _executeJob(job) {
        try {
            // Gather metrics from PerformanceProfiler and CoreWebVitals
            const metrics = await this._gatherMetrics(job.config);

            // Export in configured format
            const exportedData = await this._exportMetrics(metrics, job.config.format);

            // Send to external services if configured
            if (this._externalServices.length > 0) {
                await this._sendToExternalServices(exportedData, job.config, metrics);
            }

            // Download/export file
            await this._downloadExport(exportedData, job.config.format, job.name);

            // Update job status
            job.lastRun = new Date();
            job.nextRun = this._calculateNextRun(job.config.schedule);
            job.successCount++;

        } catch (error) {
            console.error(`[MetricsExporter] Job execution failed: ${job.name}`, error);
            job.failureCount++;
        }

        await this._saveConfiguration();
    }

    /**
     * Gather metrics based on configuration
     * @private
     * @param {ExportConfig} config - Export configuration
     * @returns {Object} Gathered metrics
     */
    async _gatherMetrics(config) {
        const metrics = {
            timestamp: new Date().toISOString(),
            performance: {},
            webVitals: {},
            memory: {},
            system: {}
        };

        // Get performance metrics
        if (window.PerformanceProfiler) {
            const perfReport = window.PerformanceProfiler.getComprehensiveReport();
            metrics.performance = perfReport;

            if (config.includeMemory) {
                metrics.memory = perfReport.memory || {};
            }
        }

        // Get web vitals
        if (config.includeWebVitals && window.CoreWebVitalsTracker) {
            metrics.webVitals = window.CoreWebVitalsTracker.getWebVitalsSummary();
        }

        // System metrics
        metrics.system = {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            cookieEnabled: navigator.cookieEnabled,
            onLine: navigator.onLine,
            deviceMemory: navigator.deviceMemory,
            hardwareConcurrency: navigator.hardwareConcurrency
        };

        return metrics;
    }

    /**
     * Export metrics in specified format
     * @private
     * @param {Object} metrics - Metrics to export
     * @param {ExportFormat} format - Export format
     * @returns {string} Formatted export data
     */
    async _exportMetrics(metrics, format) {
        switch (format) {
            case ExportFormat.JSON:
                return this._exportAsJSON(metrics);

            case ExportFormat.CSV:
                return this._exportAsCSV(metrics);

            case ExportFormat.PROMETHEUS:
                return this._exportAsPrometheus(metrics);

            case ExportFormat.INFLUXDB:
                return this._exportAsInfluxDB(metrics);

            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }

    /**
     * Export metrics as JSON
     * @private
     * @param {Object} metrics - Metrics to export
     * @returns {string} JSON formatted data
     */
    _exportAsJSON(metrics) {
        return JSON.stringify(metrics, null, 2);
    }

    /**
     * Export metrics as CSV
     * @private
     * @param {Object} metrics - Metrics to export
     * @returns {string} CSV formatted data
     */
    _exportAsCSV(metrics) {
        const rows = [];

        // Flatten metrics for CSV export
        const flatMetrics = this._flattenMetrics(metrics);

        // Add header
        const headers = Object.keys(flatMetrics[0] || {});
        rows.push(headers.join(','));

        // Add data rows
        for (const metric of flatMetrics) {
            const values = headers.map(header => {
                const value = metric[header];

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
            });
            rows.push(values.join(','));
        }

        return rows.join('\n');
    }

    /**
     * Flatten metrics for CSV export
     * @private
     * @param {Object} metrics - Metrics to flatten
     * @returns {Array<Object>} Flattened metrics
     */
    _flattenMetrics(metrics) {
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
     * Export metrics as Prometheus format
     * @private
     * @param {Object} metrics - Metrics to export
     * @returns {string} Prometheus formatted data
     */
    _exportAsPrometheus(metrics) {
        const lines = [];

        // Performance metrics
        if (metrics.performance?.categories) {
            for (const [category, data] of Object.entries(metrics.performance.categories)) {
                if (data.statistics) {
                    const metricName = this._sanitizePrometheusName(`rhythm_chamber_${category}_duration_ms`);
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
                    const metricName = this._sanitizePrometheusName(`rhythm_chamber_web_vital_${vitalType}`);
                    lines.push(`# HELP ${metricName} Web Vital ${vitalType}`);
                    lines.push(`# TYPE ${metricName} gauge`);
                    lines.push(`${metricName}{rating="${vitalData.latest.rating}"} ${vitalData.latest.value}`);
                }
            }
        }

        // Memory metrics
        if (metrics.memory?.currentUsage !== null) {
            const metricName = this._sanitizePrometheusName('rhythm_chamber_memory_usage_percent');
            lines.push(`# HELP ${metricName} Memory usage percentage`);
            lines.push(`# TYPE ${metricName} gauge`);
            lines.push(`${metricName} ${metrics.memory.currentUsage}`);
        }

        return lines.join('\n');
    }

    /**
     * Export metrics as InfluxDB line protocol
     * @private
     * @param {Object} metrics - Metrics to export
     * @returns {string} InfluxDB formatted data
     */
    _exportAsInfluxDB(metrics) {
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
     * Download/export data as file
     * @private
     * @param {string} data - Data to download
     * @param {ExportFormat} format - Export format
     * @param {string} jobName - Job name for filename
     */
    async _downloadExport(data, format, jobName) {
        const mimeTypes = {
            [ExportFormat.JSON]: 'application/json',
            [ExportFormat.CSV]: 'text/csv',
            [ExportFormat.PROMETHEUS]: 'text/plain',
            [ExportFormat.INFLUXDB]: 'text/plain'
        };

        const extensions = {
            [ExportFormat.JSON]: 'json',
            [ExportFormat.CSV]: 'csv',
            [ExportFormat.PROMETHEUS]: 'prom',
            [ExportFormat.INFLUXDB]: 'txt'
        };

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `rhythm-chamber-metrics-${jobName}-${timestamp}.${extensions[format]}`;

        const blob = new Blob([data], { type: mimeTypes[format] });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Send data to external services
     * @private
     * @param {string} data - Data to send (formatted string)
     * @param {ExportConfig} config - Export configuration
     * @param {Object} rawMetrics - Raw metrics object for JSON parsing
     */
    async _sendToExternalServices(data, config, rawMetrics = null) {
        for (const serviceConfig of this._externalServices) {
            try {
                await this._sendToService(data, serviceConfig, config, rawMetrics);
            } catch (error) {
                console.error(`[MetricsExporter] Failed to send to ${serviceConfig.service}:`, error);
            }
        }
    }

    /**
     * Send to specific external service
     * @private
     * @param {string} data - Data to send
     * @param {ExternalServiceConfig} serviceConfig - Service configuration
     * @param {ExportConfig} exportConfig - Export configuration
     * @param {Object} rawMetrics - Raw metrics object for JSON parsing
     */
    async _sendToService(data, serviceConfig, exportConfig, rawMetrics = null) {
        const requestData = this._formatForService(data, serviceConfig.service, exportConfig, rawMetrics);

        const response = await fetch(serviceConfig.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...serviceConfig.headers
            },
            body: JSON.stringify(requestData),
            signal: AbortSignal.timeout(serviceConfig.timeout || 30000)
        });

        if (!response.ok) {
            throw new Error(`Service returned ${response.status}: ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * Format data for specific service
     * @private
     * @param {string} data - Formatted data (string)
     * @param {ExternalService} service - Service type
     * @param {ExportConfig} config - Export configuration
     * @param {Object} rawMetrics - Raw metrics object for JSON parsing
     * @returns {Object} Formatted data
     */
    _formatForService(data, service, config, rawMetrics = null) {
        switch (service) {
            case ExternalService.DATADOG:
                return {
                    series: this._formatAsDatadogSeries(rawMetrics || data)
                };

            case ExternalService.NEWRELIC:
                return {
                    metrics: this._formatAsNewRelicMetrics(rawMetrics || data)
                };

            case ExternalService.PROMETHEUS_PUSHGATEWAY:
                return data; // Prometheus format

            default:
                return { data };
        }
    }

    /**
     * Format as Datadog series
     * @private
     * @param {Object|string} data - Raw metrics object or JSON string
     * @returns {Array} Datadog series format
     */
    _formatAsDatadogSeries(data) {
        const metrics = typeof data === 'string' ? JSON.parse(data) : data;
        const series = [];

        // Convert metrics to Datadog series format
        for (const [key, value] of Object.entries(metrics)) {
            if (typeof value === 'number') {
                series.push({
                    metric: `rhythm_chamber.${key}`,
                    points: [[Date.now() / 1000, value]],
                    type: 'gauge'
                });
            }
        }

        return series;
    }

    /**
     * Format as New Relic metrics
     * @private
     * @param {Object|string} data - Raw metrics object or JSON string
     * @returns {Array} New Relic metrics format
     */
    _formatAsNewRelicMetrics(data) {
        const metrics = typeof data === 'string' ? JSON.parse(data) : data;
        const nrMetrics = [];

        for (const [key, value] of Object.entries(metrics)) {
            if (typeof value === 'number') {
                nrMetrics.push({
                    name: `rhythm_chamber.${key}`,
                    value: value,
                    timestamp: Date.now(),
                    type: 'gauge'
                });
            }
        }

        return nrMetrics;
    }

    /**
     * Calculate next run time based on schedule
     * @private
     * @param {ScheduleType} schedule - Schedule type
     * @returns {Date} Next run time
     */
    _calculateNextRun(schedule) {
        const now = new Date();

        switch (schedule) {
            case ScheduleType.HOURLY:
                return new Date(now.getTime() + 3600000);

            case ScheduleType.DAILY:
                return new Date(now.getTime() + 86400000);

            case ScheduleType.WEEKLY:
                return new Date(now.getTime() + 604800000);

            case ScheduleType.MONTHLY:
                const nextMonth = new Date(now);
                nextMonth.setMonth(nextMonth.getMonth() + 1);
                return nextMonth;

            default:
                return now;
        }
    }

    /**
     * Create scheduled export job
     * @public
     * @param {string} name - Job name
     * @param {ExportConfig} config - Export configuration
     * @returns {Promise<string>} Job ID
     */
    async createScheduledExport(name, config) {
        const job = {
            id: `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name,
            config,
            nextRun: this._calculateNextRun(config.schedule),
            lastRun: null,
            status: 'active',
            successCount: 0,
            failureCount: 0
        };

        this._scheduledJobs.set(job.id, job);
        await this._saveConfiguration();

        return job.id;
    }

    /**
     * Pause scheduled export job
     * @public
     * @param {string} jobId - Job ID
     */
    async pauseJob(jobId) {
        const job = this._scheduledJobs.get(jobId);
        if (job) {
            job.status = 'paused';
            await this._saveConfiguration();
        }
    }

    /**
     * Resume scheduled export job
     * @public
     * @param {string} jobId - Job ID
     */
    async resumeJob(jobId) {
        const job = this._scheduledJobs.get(jobId);
        if (job) {
            job.status = 'active';
            job.nextRun = this._calculateNextRun(job.config.schedule);
            await this._saveConfiguration();
        }
    }

    /**
     * Delete scheduled export job
     * @public
     * @param {string} jobId - Job ID
     */
    async deleteJob(jobId) {
        this._scheduledJobs.delete(jobId);
        await this._saveConfiguration();
    }

    /**
     * Export metrics immediately (one-time export)
     * @public
     * @param {ExportConfig} config - Export configuration
     * @returns {Promise<string>} Exported data
     */
    async exportNow(config) {
        const metrics = await this._gatherMetrics(config);
        const exportedData = await this._exportMetrics(metrics, config.format);
        await this._downloadExport(exportedData, config.format, 'immediate');
        return exportedData;
    }

    /**
     * Add external service integration
     * @public
     * @param {ExternalServiceConfig} serviceConfig - Service configuration
     */
    async addExternalService(serviceConfig) {
        this._externalServices.push(serviceConfig);
        await this._saveConfiguration();
    }

    /**
     * Remove external service integration
     * @public
     * @param {string} endpoint - Service endpoint
     */
    async removeExternalService(endpoint) {
        this._externalServices = this._externalServices.filter(
            s => s.endpoint !== endpoint
        );
        await this._saveConfiguration();
    }

    /**
     * Get all scheduled jobs
     * @public
     * @returns {Array<ExportJob>} All scheduled jobs
     */
    getScheduledJobs() {
        return Array.from(this._scheduledJobs.values());
    }

    /**
     * Get external services
     * @public
     * @returns {Array<ExternalServiceConfig>} External services
     */
    getExternalServices() {
        return [...this._externalServices];
    }

    /**
     * Enable exporter
     * @public
     */
    enable() {
        this._enabled = true;
        this._startScheduler();
        console.log('[MetricsExporter] Enabled');
    }

    /**
     * Disable exporter
     * @public
     */
    disable() {
        this._enabled = false;

        // Stop the scheduler
        if (this._schedulerInterval) {
            clearInterval(this._schedulerInterval);
            this._schedulerInterval = null;
        }

        console.log('[MetricsExporter] Disabled');
    }

    /**
     * Check if enabled
     * @public
     * @returns {boolean} True if enabled
     */
    isEnabled() {
        return this._enabled;
    }

    /**
     * Sanitize name for Prometheus metric compatibility
     * @private
     * @param {string} name - Name to sanitize
     * @returns {string} Sanitized name
     */
    _sanitizePrometheusName(name) {
        // Replace invalid characters with underscores
        let sanitized = name.replace(/[^a-zA-Z0-9_:]/g, '_');

        // Ensure first character matches [a-zA-Z_:]
        if (!/^[a-zA-Z_:]/.test(sanitized)) {
            sanitized = '_' + sanitized;
        }

        return sanitized;
    }

    /**
     * Encrypt external service credentials
     * @private
     * @param {Array<ExternalServiceConfig>} services - Services to encrypt
     * @returns {Promise<Array<ExternalServiceConfig>>} Services with encrypted credentials
     */
    async _encryptExternalServices(services) {
        if (!this._encryptionConfig) {
            return services;
        }

        try {
            const encryptedServices = [];

            for (const service of services) {
                const encryptedService = { ...service };

                if (service.credentials && Object.keys(service.credentials).length > 0) {
                    // Generate encryption key
                    const key = await this._deriveEncryptionKey();

                    // Encrypt credentials
                    const iv = crypto.getRandomValues(new Uint8Array(12));
                    const encodedCredentials = new TextEncoder().encode(JSON.stringify(service.credentials));

                    const encryptedData = await crypto.subtle.encrypt(
                        { name: 'AES-GCM', iv },
                        key,
                        encodedCredentials
                    );

                    // Store encrypted data with IV
                    encryptedService.credentials = {
                        encrypted: Array.from(new Uint8Array(encryptedData)),
                        iv: Array.from(iv),
                        algorithm: 'AES-GCM'
                    };
                }

                encryptedServices.push(encryptedService);
            }

            return encryptedServices;
        } catch (error) {
            console.error('[MetricsExporter] Failed to encrypt credentials:', error);
            // Return unencrypted services as fallback
            return services;
        }
    }

    /**
     * Decrypt external service credentials
     * @private
     * @param {Array<ExternalServiceConfig>} services - Services to decrypt
     * @returns {Promise<Array<ExternalServiceConfig>>} Services with decrypted credentials
     */
    async _decryptExternalServices(services) {
        if (!this._encryptionConfig) {
            return services;
        }

        try {
            const decryptedServices = [];

            for (const service of services) {
                const decryptedService = { ...service };

                if (service.credentials?.encrypted) {
                    // Generate decryption key
                    const key = await this._deriveEncryptionKey();

                    // Decrypt credentials
                    const iv = new Uint8Array(service.credentials.iv);
                    const encryptedData = new Uint8Array(service.credentials.encrypted);

                    const decryptedData = await crypto.subtle.decrypt(
                        { name: 'AES-GCM', iv },
                        key,
                        encryptedData
                    );

                    const decodedCredentials = new TextDecoder().decode(decryptedData);
                    decryptedService.credentials = JSON.parse(decodedCredentials);
                }

                decryptedServices.push(decryptedService);
            }

            return decryptedServices;
        } catch (error) {
            console.error('[MetricsExporter] Failed to decrypt credentials:', error);
            // Return services as-is (potentially with encrypted credentials)
            return services;
        }
    }

    /**
     * Derive encryption key from configuration
     * @private
     * @returns {Promise<CryptoKey>} Derived encryption key
     */
    async _deriveEncryptionKey() {
        if (!this._encryptionConfig) {
            throw new Error('Encryption config not provided');
        }

        const { salt, iterations = 100000 } = this._encryptionConfig;

        // Import password as key
        const passwordKey = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(this._encryptionConfig.password),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        // Derive encryption key
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: new TextEncoder().encode(salt),
                iterations,
                hash: 'SHA-256'
            },
            passwordKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }
}

// Lazy singleton initialization
let MetricsExporterSingleton = null;

/**
 * Get or create the MetricsExporter singleton instance
 * @public
 * @returns {Promise<MetricsExporter>} Singleton instance
 */
export async function getMetricsExporter() {
    if (!MetricsExporterSingleton) {
        MetricsExporterSingleton = await MetricsExporter.create();
    }
    return MetricsExporterSingleton;
}

// Export the getter function
export default getMetricsExporter;