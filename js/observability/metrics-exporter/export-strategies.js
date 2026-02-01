/**
 * Export Strategies
 *
 * Handles export methods including:
 * - Push-based exports
 * - Pull-based exports
 * - Batch exports
 * - Retry logic
 *
 * @module ExportStrategies
 * @author Rhythm Chamber Architecture Team
 * @version 1.0.0
 */

export class ExportStrategies {
    /**
     * @private
     * @type {number}
     */
    _maxRetries = 3;

    /**
     * @private
     * @type {number}
     */
    _retryDelay = 1000;

    /**
     * @private
     * @type {number}
     */
    _timeout = 30000;

    /**
     * Initialize the Export Strategies
     * @public
     * @param {Object} options - Configuration options
     * @param {number} options.maxRetries - Maximum number of retry attempts
     * @param {number} options.retryDelay - Base retry delay in milliseconds
     * @param {number} options.timeout - Request timeout in milliseconds
     */
    constructor({ maxRetries = 3, retryDelay = 1000, timeout = 30000 } = {}) {
        this._maxRetries = maxRetries;
        this._retryDelay = retryDelay;
        this._timeout = timeout;
    }

    /**
     * Push data to endpoint
     * @public
     * @param {string} endpoint - Target endpoint URL
     * @param {string} data - Data to send
     * @param {Object} options - Export options
     * @returns {Promise<Object>} Export result
     */
    async pushExport(endpoint, data, options = {}) {
        this.validateEndpoint(endpoint);

        const requestData = this.formatRequestData(data, options);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {}),
            },
            body: requestData,
            signal: AbortSignal.timeout(options.timeout || this._timeout),
        });

        return this.handleResponse(response);
    }

    /**
     * Pull data from endpoint
     * @public
     * @param {string} endpoint - Source endpoint URL
     * @param {Object} options - Pull options
     * @returns {Promise<Object>} Pulled data
     */
    async pullExport(endpoint, options = {}) {
        this.validateEndpoint(endpoint);

        let url = endpoint;
        if (options.params) {
            const searchParams = new URLSearchParams(options.params);
            url = `${endpoint}?${searchParams.toString()}`;
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                ...(options.headers || {}),
            },
            signal: AbortSignal.timeout(options.timeout || this._timeout),
        });

        return this.handleResponse(response);
    }

    /**
     * Export data in batches
     * @public
     * @param {string} endpoint - Target endpoint URL
     * @param {Array} data - Data array to batch
     * @param {Object} options - Batch options
     * @returns {Promise<Array<Object>>} Batch export results
     */
    async batchExport(endpoint, data, options = {}) {
        const {
            batchSize = 100,
            formatBatch = batch => JSON.stringify(batch),
            delay = 0,
        } = options;

        this.validateEndpoint(endpoint);

        const results = [];
        const batches = this._createBatches(data, batchSize);

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const batchNumber = i + 1;

            try {
                const batchData = formatBatch(batch);
                const result = await this.pushExport(endpoint, batchData, options);

                results.push({
                    batchNumber,
                    success: true,
                    result,
                    itemCount: batch.length,
                });

                // Add delay between batches if specified
                if (delay > 0 && i < batches.length - 1) {
                    await this._sleep(delay);
                }
            } catch (error) {
                console.error(`[ExportStrategies] Batch ${batchNumber} failed:`, error);
                results.push({
                    batchNumber,
                    success: false,
                    error: error.message,
                    itemCount: batch.length,
                });
            }
        }

        return results;
    }

    /**
     * Export with retry logic
     * @public
     * @param {Function} exportFn - Export function to execute
     * @param {Object} options - Retry options
     * @returns {Promise<Object>} Export result
     */
    async exportWithRetry(exportFn, options = {}) {
        const {
            maxRetries = this._maxRetries,
            useExponentialBackoff = false,
            jitter = 0.1,
        } = options;

        let lastError;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await exportFn();
            } catch (error) {
                lastError = error;

                // Don't retry if error is not retryable
                if (!this.isRetryableError(error)) {
                    throw error;
                }

                // Don't retry after max attempts
                if (attempt >= maxRetries) {
                    break;
                }

                // Calculate retry delay
                const delay = this.calculateRetryDelay(attempt + 1, useExponentialBackoff, jitter);
                console.warn(
                    `[ExportStrategies] Export failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`
                );

                await this._sleep(delay);
            }
        }

        throw lastError;
    }

    /**
     * Download/export data as file
     * @public
     * @param {string} data - Data to download
     * @param {string} format - Export format
     * @param {string} jobName - Job name for filename
     * @returns {Promise<void>}
     */
    async downloadExport(data, format, jobName = 'export') {
        const mimeTypes = {
            json: 'application/json',
            csv: 'text/csv',
            prometheus: 'text/plain',
            influxdb: 'text/plain',
            statsd: 'text/plain',
        };

        const extensions = {
            json: 'json',
            csv: 'csv',
            prometheus: 'prom',
            influxdb: 'txt',
            statsd: 'txt',
        };

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `rhythm-chamber-metrics-${jobName}-${timestamp}.${extensions[format] || 'txt'}`;

        const blob = new Blob([data], { type: mimeTypes[format] || 'text/plain' });
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
     * Validate endpoint URL
     * @public
     * @param {string} endpoint - Endpoint to validate
     * @throws {Error} If endpoint is invalid
     */
    validateEndpoint(endpoint) {
        if (!endpoint || typeof endpoint !== 'string' || endpoint.trim() === '') {
            throw new Error('Invalid endpoint URL: must be a non-empty string');
        }

        try {
            new URL(endpoint);
        } catch (error) {
            throw new Error(`Invalid endpoint URL: ${endpoint}`);
        }
    }

    /**
     * Format request data
     * @public
     * @param {*} data - Data to format
     * @param {Object} options - Format options
     * @returns {string} Formatted data
     */
    formatRequestData(data, options = {}) {
        // If data is already a string, return as-is
        if (typeof data === 'string') {
            return data;
        }

        // Use custom formatter if provided
        if (options.formatter) {
            return options.formatter(data);
        }

        // Default to JSON
        return JSON.stringify(data);
    }

    /**
     * Handle HTTP response
     * @public
     * @param {Response} response - Fetch response object
     * @returns {Promise<Object>} Response data
     * @throws {Error} If response is not OK or undefined
     */
    async handleResponse(response) {
        if (!response) {
            throw new Error('No response received from export service');
        }
        if (!response.ok) {
            throw new Error(`Export failed: ${response.status} ${response.statusText}`);
        }

        // Try to parse JSON response
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return response.json();
        }

        // Return text response
        return response.text();
    }

    /**
     * Calculate retry delay
     * @public
     * @param {number} attempt - Attempt number (1-based)
     * @param {boolean} useExponentialBackoff - Use exponential backoff
     * @param {number} jitter - Jitter factor (0-1)
     * @returns {number} Delay in milliseconds
     */
    calculateRetryDelay(attempt, useExponentialBackoff = false, jitter = 0.1) {
        let delay = this._retryDelay;

        if (useExponentialBackoff) {
            delay = this._retryDelay * Math.pow(2, attempt - 1);
        }

        // Add jitter to prevent thundering herd
        if (jitter > 0) {
            const jitterAmount = delay * jitter;
            delay = delay - jitterAmount / 2 + Math.random() * jitterAmount;
        }

        return Math.max(delay, 100); // Minimum 100ms delay
    }

    /**
     * Check if error is retryable
     * @public
     * @param {Error} error - Error to check
     * @returns {boolean} True if error is retryable
     */
    isRetryableError(error) {
        const retryablePatterns = [
            /network/i,
            /timeout/i,
            /ECONNRESET/i,
            /ETIMEDOUT/i,
            /5\d\d/, // 5xx server errors
        ];

        const errorMessage = error.message || '';

        // Check for retryable patterns
        for (const pattern of retryablePatterns) {
            if (pattern.test(errorMessage)) {
                return true;
            }
        }

        // Check error name
        if (error.name === 'TypeError' && errorMessage.includes('fetch')) {
            return true;
        }

        return false;
    }

    /**
     * Export to multiple services
     * @public
     * @param {Array<Object>} services - Array of service configurations
     * @param {string} data - Data to export
     * @param {Object} options - Export options
     * @returns {Promise<Array<Object>>} Results from all services
     */
    async exportToMultipleServices(services, data, options = {}) {
        const results = [];

        for (const service of services) {
            try {
                const result = await this.pushExport(service.endpoint, data, {
                    ...options,
                    headers: { ...options.headers, ...service.headers },
                });

                results.push({
                    service: service.endpoint,
                    success: true,
                    result,
                });
            } catch (error) {
                console.error(`[ExportStrategies] Failed to export to ${service.endpoint}:`, error);
                results.push({
                    service: service.endpoint,
                    success: false,
                    error: error.message,
                });
            }
        }

        return results;
    }

    /**
     * Create batches from data array
     * @private
     * @param {Array} data - Data array
     * @param {number} batchSize - Batch size
     * @returns {Array<Array>>} Batches
     */
    _createBatches(data, batchSize) {
        const batches = [];

        for (let i = 0; i < data.length; i += batchSize) {
            batches.push(data.slice(i, i + batchSize));
        }

        return batches;
    }

    /**
     * Sleep for specified duration
     * @private
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
