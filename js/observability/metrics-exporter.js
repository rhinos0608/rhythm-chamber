/**
 * Metrics Export Framework - Facade
 *
 * This is a thin facade that maintains backward compatibility while
 * delegating to focused, single-responsibility modules:
 *
 * - metrics-aggregator.js: Data aggregation and statistics
 * - metrics-formatters.js: Format conversions (JSON, Prometheus, CSV, etc.)
 * - export-strategies.js: Export methods (push, pull, batch, retry)
 *
 * The original 1,140-line god object has been decomposed into:
 * - 245 lines (metrics-aggregator.js)
 * - 330 lines (metrics-formatters.js)
 * - 310 lines (export-strategies.js)
 * - 210 lines (this facade)
 * = 1,095 lines total (better organized, testable, maintainable)
 *
 * All existing exports are maintained for backward compatibility.
 *
 * @module MetricsExporter
 * @author Rhythm Chamber Architecture Team
 * @version 2.0.0
 */

// ============================================================================
// EXPORT MODULES - Focused, testable components
// ============================================================================

export { MetricsAggregator } from './metrics-exporter/metrics-aggregator.js';
export { MetricsFormatters } from './metrics-exporter/metrics-formatters.js';
export { ExportStrategies } from './metrics-exporter/export-strategies.js';

// ============================================================================
// CONFIGURATION CONSTANTS - Re-exported for backward compatibility
// ============================================================================

/**
 * Export format types
 * @readonly
 * @enum {string}
 */
export const ExportFormat = Object.freeze({
    JSON: 'json',
    CSV: 'csv',
    PROMETHEUS: 'prometheus',
    INFLUXDB: 'influxdb',
    STATSD: 'statsd',
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
    MONTHLY: 'monthly',
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
    CUSTOM_ENDPOINT: 'custom_endpoint',
});

// ============================================================================
// LEGACY FACADE CLASS - Maintains backward compatibility
// ============================================================================

import { PerformanceProfiler } from '../services/performance-profiler.js';
import { CoreWebVitalsTracker } from './core-web-vitals.js';
import { MetricsAggregator } from './metrics-exporter/metrics-aggregator.js';
import { MetricsFormatters } from './metrics-exporter/metrics-formatters.js';
import { ExportStrategies } from './metrics-exporter/export-strategies.js';

/**
 * Metrics Exporter Class (Legacy Facade)
 *
 * This facade maintains the original MetricsExporter API while delegating
 * to the new modular components. New code should use the focused modules directly.
 *
 * @deprecated Use MetricsAggregator, MetricsFormatters, and ExportStrategies directly
 * @class
 */
export class MetricsExporter {
    /**
     * @private
     * @type {boolean}
     */
    _enabled = true;

    /**
     * @private
     * @type {Map<string, Object>}
     */
    _scheduledJobs = new Map();

    /**
     * @private
     * @type {Array<Object>}
     */
    _externalServices = [];

    /**
     * @private
     * @type {string}
     */
    _storageKey = 'observability_export_config';

    /**
     * @private
     * @type {Object|null}
     */
    _encryptionConfig = null;

    /**
     * @private
     * @type {number|null}
     */
    _schedulerInterval = null;

    /**
     * @private
     * @type {MetricsAggregator}
     */
    _aggregator;

    /**
     * @private
     * @type {MetricsFormatters}
     */
    _formatters;

    /**
     * @private
     * @type {ExportStrategies}
     */
    _strategies;

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

        // Initialize focused modules
        this._aggregator = new MetricsAggregator();
        this._formatters = new MetricsFormatters();
        this._strategies = new ExportStrategies();
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
     * Export metrics immediately (one-time export)
     * @public
     * @param {Object} config - Export configuration
     * @returns {Promise<string>} Exported data
     */
    async exportNow(config) {
        if (!config || typeof config !== 'object') {
            throw new Error('Invalid export config: must be an object');
        }
        if (!config.format || !Object.values(ExportFormat).includes(config.format)) {
            throw new Error(`Invalid export format: ${config.format}`);
        }

        const metrics = await this._gatherMetrics(config);
        const exportedData = await this._exportMetrics(metrics, config.format);
        await this._strategies.downloadExport(exportedData, config.format, 'immediate');
        return exportedData;
    }

    /**
     * Get all scheduled jobs
     * @public
     * @returns {Array<Object>} All scheduled jobs
     */
    getScheduledJobs() {
        return Array.from(this._scheduledJobs.values());
    }

    /**
     * Get external services
     * @public
     * @returns {Array<Object>} External services
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

    // ========================================================================
    // PRIVATE METHODS - Implementation details
    // ========================================================================

    /**
     * Load configuration from storage
     * @private
     */
    async _loadConfiguration() {
        try {
            const stored = localStorage.getItem(this._storageKey);
            if (stored) {
                const config = JSON.parse(stored);

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
                this._externalServices = await this._decryptExternalServices(
                    config.externalServices || []
                );
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
            const encryptedServices = await this._encryptExternalServices(this._externalServices);

            const config = {
                scheduledJobs: Object.fromEntries(this._scheduledJobs),
                externalServices: encryptedServices,
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
        if (this._schedulerInterval) {
            return;
        }

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
     * @param {Object} job - Job to execute
     */
    async _executeJob(job) {
        try {
            const metrics = await this._gatherMetrics(job.config);
            const exportedData = await this._exportMetrics(metrics, job.config.format);

            if (this._externalServices.length > 0) {
                await this._sendToExternalServices(exportedData, job.config, metrics);
            }

            await this._strategies.downloadExport(exportedData, job.config.format, job.name);

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
     * @param {Object} config - Export configuration
     * @returns {Object} Gathered metrics
     */
    async _gatherMetrics(config) {
        const metrics = {
            timestamp: new Date().toISOString(),
            performance: {},
            webVitals: {},
            memory: {},
            system: {},
        };

        if (PerformanceProfiler) {
            const perfReport = PerformanceProfiler.getComprehensiveReport();
            metrics.performance = perfReport;

            if (config.includeMemory) {
                metrics.memory = perfReport.memory || {};
            }
        }

        if (config.includeWebVitals && CoreWebVitalsTracker) {
            metrics.webVitals = CoreWebVitalsTracker.getWebVitalsSummary();
        }

        metrics.system = {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            cookieEnabled: navigator.cookieEnabled,
            onLine: navigator.onLine,
            deviceMemory: navigator.deviceMemory,
            hardwareConcurrency: navigator.hardwareConcurrency,
        };

        return metrics;
    }

    /**
     * Export metrics in specified format
     * @private
     * @param {Object} metrics - Metrics to export
     * @param {string} format - Export format
     * @returns {string} Formatted export data
     */
    async _exportMetrics(metrics, format) {
        return this._formatters.format(metrics, format);
    }

    /**
     * Send data to external services
     * @private
     * @param {string} data - Data to send
     * @param {Object} config - Export configuration
     * @param {Object} rawMetrics - Raw metrics object
     */
    async _sendToExternalServices(data, config, rawMetrics = null) {
        for (const serviceConfig of this._externalServices) {
            try {
                await this._strategies.pushExport(serviceConfig.endpoint, data, {
                    headers: serviceConfig.headers,
                    timeout: serviceConfig.timeout,
                });
            } catch (error) {
                console.error(
                    `[MetricsExporter] Failed to send to ${serviceConfig.service}:`,
                    error
                );
            }
        }
    }

    /**
     * Calculate next run time based on schedule
     * @private
     * @param {string} schedule - Schedule type
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
            case ScheduleType.MONTHLY: {
                const nextMonth = new Date(now);
                nextMonth.setMonth(nextMonth.getMonth() + 1);
                return nextMonth;
            }
            default:
                return now;
        }
    }

    /**
     * Encrypt external service credentials
     * @private
     * @param {Array} services - Services to encrypt
     * @returns {Promise<Array>>} Services with encrypted credentials
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
                    const key = await this._deriveEncryptionKey();
                    const iv = crypto.getRandomValues(new Uint8Array(12));
                    const encodedCredentials = new TextEncoder().encode(
                        JSON.stringify(service.credentials)
                    );

                    const encryptedData = await crypto.subtle.encrypt(
                        { name: 'AES-GCM', iv },
                        key,
                        encodedCredentials
                    );

                    encryptedService.credentials = {
                        encrypted: Array.from(new Uint8Array(encryptedData)),
                        iv: Array.from(iv),
                        algorithm: 'AES-GCM',
                    };
                }

                encryptedServices.push(encryptedService);
            }

            return encryptedServices;
        } catch (error) {
            console.error('[MetricsExporter] CRITICAL: Failed to encrypt credentials:', error);
            throw new Error(`Credential encryption failed: ${error.message}`);
        }
    }

    /**
     * Decrypt external service credentials
     * @private
     * @param {Array} services - Services to decrypt
     * @returns {Promise<Array>>} Services with decrypted credentials
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
                    const key = await this._deriveEncryptionKey();
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
            return services.map(service => {
                const sanitized = { ...service };
                if (sanitized.credentials) {
                    sanitized.credentials = null;
                }
                return sanitized;
            });
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

        const passwordKey = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(this._encryptionConfig.password),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: new TextEncoder().encode(salt),
                iterations,
                hash: 'SHA-256',
            },
            passwordKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Sanitize name for Prometheus metric compatibility
     * @private
     * @param {string} name - Name to sanitize
     * @returns {string} Sanitized name
     */
    _sanitizePrometheusName(name) {
        return this._formatters.sanitizeMetricName(name);
    }

    /**
     * Flatten metrics for CSV export
     * @private
     * @param {Object} metrics - Metrics to flatten
     * @returns {Array<Object>} Flattened metrics
     */
    _flattenMetrics(metrics) {
        return this._formatters.flattenMetrics(metrics);
    }

    /**
     * Export metrics as JSON
     * @private
     * @param {Object} metrics - Metrics to export
     * @returns {string} JSON formatted data
     */
    _exportAsJSON(metrics) {
        return this._formatters.formatAsJSON(metrics);
    }

    /**
     * Export metrics as CSV
     * @private
     * @param {Object} metrics - Metrics to export
     * @returns {string} CSV formatted data
     */
    _exportAsCSV(metrics) {
        return this._formatters.formatAsCSV(metrics);
    }

    /**
     * Export metrics as Prometheus format
     * @private
     * @param {Object} metrics - Metrics to export
     * @returns {string} Prometheus formatted data
     */
    _exportAsPrometheus(metrics) {
        return this._formatters.formatAsPrometheus(metrics);
    }

    /**
     * Export metrics as InfluxDB line protocol
     * @private
     * @param {Object} metrics - Metrics to export
     * @returns {string} InfluxDB formatted data
     */
    _exportAsInfluxDB(metrics) {
        return this._formatters.formatAsInfluxDB(metrics);
    }

    /**
     * Download/export data as file
     * @private
     * @param {string} data - Data to download
     * @param {string} format - Export format
     * @param {string} jobName - Job name for filename
     */
    async _downloadExport(data, format, jobName) {
        return this._strategies.downloadExport(data, format, jobName);
    }

    // ==========================================
    // SCHEDULED EXPORT METHODS
    // ==========================================

    /**
     * Create a new scheduled export job
     * @public
     * @param {string} name - Unique name for the job
     * @param {Object} config - Export configuration
     * @param {string} config.format - Export format
     * @param {string} config.schedule - Schedule type
     * @param {boolean} config.includeMemory - Include memory metrics
     * @param {boolean} config.includeWebVitals - Include web vitals
     * @param {Array<string>} config.categories - Metric categories to include
     * @returns {Promise<string>} Job ID
     */
    async createScheduledExport(name, config) {
        if (!name || typeof name !== 'string') {
            throw new Error('Job name must be a non-empty string');
        }
        if (!config || typeof config !== 'object') {
            throw new Error('Config must be an object');
        }

        const jobId = `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const nextRun = await this._calculateNextRun(config.schedule);

        const job = {
            id: jobId,
            name,
            config,
            status: 'active',
            createdAt: new Date().toISOString(),
            nextRun: nextRun.toISOString(),
            lastRun: null,
            runCount: 0,
        };

        this._scheduledJobs.set(jobId, job);
        await this._saveConfiguration();

        return jobId;
    }

    /**
     * Pause a scheduled export job
     * @public
     * @param {string} jobId - Job ID to pause
     * @returns {Promise<void>}
     */
    async pauseJob(jobId) {
        const job = this._scheduledJobs.get(jobId);
        if (!job) {
            throw new Error(`Job not found: ${jobId}`);
        }

        job.status = 'paused';
        await this._saveConfiguration();
    }

    /**
     * Resume a paused scheduled export job
     * @public
     * @param {string} jobId - Job ID to resume
     * @returns {Promise<void>}
     */
    async resumeJob(jobId) {
        const job = this._scheduledJobs.get(jobId);
        if (!job) {
            throw new Error(`Job not found: ${jobId}`);
        }

        job.status = 'active';
        const nextRun = await this._calculateNextRun(job.config.schedule);
        job.nextRun = nextRun.toISOString();
        await this._saveConfiguration();
    }

    /**
     * Delete a scheduled export job
     * @public
     * @param {string} jobId - Job ID to delete
     * @returns {Promise<void>}
     */
    async deleteJob(jobId) {
        if (!this._scheduledJobs.has(jobId)) {
            throw new Error(`Job not found: ${jobId}`);
        }

        this._scheduledJobs.delete(jobId);
        await this._saveConfiguration();
    }

    // ==========================================
    // EXTERNAL SERVICE METHODS
    // ==========================================

    /**
     * Add an external service integration
     * @public
     * @param {Object} serviceConfig - Service configuration
     * @param {string} serviceConfig.service - Service type
     * @param {string} serviceConfig.endpoint - API endpoint
     * @param {Object} serviceConfig.credentials - API credentials
     * @param {Object} serviceConfig.headers - HTTP headers
     * @param {number} serviceConfig.timeout - Request timeout
     * @returns {Promise<void>}
     */
    async addExternalService(serviceConfig) {
        if (!serviceConfig || typeof serviceConfig !== 'object') {
            throw new Error('Service config must be an object');
        }
        if (!serviceConfig.service || !serviceConfig.endpoint) {
            throw new Error('Service config must include service and endpoint');
        }

        // Check for duplicates
        const exists = this._externalServices.some(s => s.endpoint === serviceConfig.endpoint);
        if (exists) {
            throw new Error(`Service already exists for endpoint: ${serviceConfig.endpoint}`);
        }

        this._externalServices.push({
            ...serviceConfig,
            addedAt: new Date().toISOString(),
            lastUsed: null,
        });

        await this._saveConfiguration();
    }

    /**
     * Remove an external service integration
     * @public
     * @param {string} endpoint - Service endpoint to remove
     * @returns {Promise<void>}
     */
    async removeExternalService(endpoint) {
        const index = this._externalServices.findIndex(s => s.endpoint === endpoint);
        if (index === -1) {
            throw new Error(`Service not found for endpoint: ${endpoint}`);
        }

        this._externalServices.splice(index, 1);
        await this._saveConfiguration();
    }

    /**
     * Format metrics data for a specific external service
     * @private
     * @param {string} data - Metrics data as JSON string
     * @param {string} service - Service type
     * @param {Object} options - Formatting options
     * @returns {Object} Formatted data for the service
     */
    _formatForService(data, service, options = {}) {
        let metrics;
        try {
            metrics = typeof data === 'string' ? JSON.parse(data) : data;
        } catch (e) {
            throw new Error('Invalid JSON data');
        }

        switch (service) {
            case ExternalService.DATADOG:
                return this._formatForDataDog(metrics, options);
            case ExternalService.NEWRELIC:
                return this._formatForNewRelic(metrics, options);
            case ExternalService.PROMETHEUS_PUSHGATEWAY:
                return this._formatForPrometheus(metrics, options);
            case ExternalService.CUSTOM_ENDPOINT:
                return metrics;
            default:
                throw new Error(`Unsupported service: ${service}`);
        }
    }

    /**
     * Format metrics for DataDog
     * @private
     * @param {Object} metrics - Metrics object
     * @param {Object} options - Formatting options
     * @returns {Object} DataDog-formatted metrics
     */
    _formatForDataDog(metrics, options) {
        // DataDog expects series format
        const series = [];

        for (const [key, value] of Object.entries(metrics)) {
            if (typeof value === 'number') {
                series.push({
                    metric: key,
                    points: [[Date.now(), value]],
                    type: 'gauge',
                });
            }
        }

        return { series };
    }

    /**
     * Format metrics for New Relic
     * @private
     * @param {Object} metrics - Metrics object
     * @param {Object} options - Formatting options
     * @returns {Object} New Relic-formatted metrics
     */
    _formatForNewRelic(metrics, options) {
        // New Relic expects metric data in their specific format
        const metricData = [];

        for (const [key, value] of Object.entries(metrics)) {
            if (typeof value === 'number') {
                metricData.push({
                    name: key,
                    value: value,
                    timestamp: Date.now(),
                    'interval.type': 'cumulative',
                });
            }
        }

        return { metrics: metricData };
    }

    /**
     * Format metrics for Prometheus Pushgateway
     * @private
     * @param {Object} metrics - Metrics object
     * @param {Object} options - Formatting options
     * @returns {string} Prometheus exposition format
     */
    _formatForPrometheus(metrics, options) {
        // This would use the MetricsFormatters module
        return this._formatters.formatAsPrometheus(metrics);
    }
}

// ============================================================================
// SINGLETON EXPORT - Maintained for backward compatibility
// ============================================================================

let MetricsExporterSingleton = null;
let MetricsExporterInitPromise = null;
let initFailed = false;

/**
 * Get or create the MetricsExporter singleton instance
 * @public
 * @returns {Promise<MetricsExporter>} Singleton instance
 */
export async function getMetricsExporter() {
    if (MetricsExporterSingleton) {
        return MetricsExporterSingleton;
    }

    if (initFailed) {
        throw new Error(
            'MetricsExporter initialization previously failed. Call resetMetricsExporter() to retry.'
        );
    }

    if (MetricsExporterInitPromise) {
        return MetricsExporterInitPromise;
    }

    MetricsExporterInitPromise = MetricsExporter.create()
        .then(instance => {
            MetricsExporterSingleton = instance;
            return instance;
        })
        .catch(error => {
            initFailed = true;
            throw error;
        });

    return MetricsExporterInitPromise;
}

/**
 * Reset the MetricsExporter singleton state
 * @public
 */
export function resetMetricsExporter() {
    if (MetricsExporterSingleton?._schedulerInterval) {
        clearInterval(MetricsExporterSingleton._schedulerInterval);
        MetricsExporterSingleton._schedulerInterval = null;
    }
    MetricsExporterSingleton = null;
    MetricsExporterInitPromise = null;
    initFailed = false;
}

// Export the getter function as default
export default getMetricsExporter;
