/**
 * PerformanceProfiler - Enhanced Chrome DevTools Performance Markers
 *
 * Provides unified performance profiling API for tracking application performance.
 * Integrates with Chrome DevTools Performance panel for detailed timing analysis.
 * Enhanced with memory profiling, operation budgets, and performance degradation detection.
 *
 * @module PerformanceProfiler
 * @author Rhythm Chamber Architecture Team
 * @version 2.0.0
 */

/**
 * Performance measurement category
 * @readonly
 * @enum {string}
 */
export const PerformanceCategory = Object.freeze({
    INITIALIZATION: 'initialization',
    STORAGE: 'storage',
    NETWORK: 'network',
    COMPUTATION: 'computation',
    UI_RENDERING: 'ui_rendering',
    CHAT: 'chat',
    PROVIDER: 'provider',
    PARSING: 'parsing',
    PATTERN_DETECTION: 'pattern_detection',
    ERROR_RECOVERY: 'error_recovery',
    TAB_COORDINATION: 'tab_coordination',
    EMBEDDING_GENERATION: 'embedding_generation',
    EMBEDDING_INITIALIZATION: 'embedding_initialization',
    OBSERVABILITY: 'observability'
});

/**
 * Performance budget configuration
 * @typedef {Object} PerformanceBudget
 * @property {number} threshold - Maximum duration in milliseconds
 * @property {string} action - Action to take when budget exceeded ('warn', 'error', 'adaptive')
 * @property {number} degradationThreshold - Percentage threshold for degradation detection
 */

/**
 * Memory snapshot record
 * @typedef {Object} MemorySnapshot
 * @property {string} id - Unique snapshot ID
 * @property {number} timestamp - Snapshot timestamp
 * @property {number} usedJSHeapSize - Used JavaScript heap size in bytes
 * @property {number} totalJSHeapSize - Total JavaScript heap size in bytes
 * @property {number} jsHeapSizeLimit - JavaScript heap size limit in bytes
 * @property {number} usagePercentage - Memory usage percentage
 * @property {Object} metadata - Additional metadata
 */

/**
 * Performance degradation alert
 * @typedef {Object} DegradationAlert
 * @property {string} id - Alert ID
 * @property {string} severity - Severity level ('warning', 'critical')
 * @property {string} message - Alert message
 * @property {string} category - Affected category
 * @property {number} timestamp - Alert timestamp
 * @property {Object} details - Detailed information
 */

/**
 * Performance measurement record
 * @typedef {Object} PerformanceMeasurement
 * @property {string} id - Unique measurement ID
 * @property {string} name - Measurement name
 * @property {PerformanceCategory} category - Measurement category
 * @property {number} startTime - Start timestamp (performance.now())
 * @property {number} endTime - End timestamp (performance.now())
 * @property {number} duration - Duration in milliseconds
 * @property {Object} metadata - Additional metadata
 * @property {string} timestamp - ISO timestamp of measurement
 */

/**
 * Performance marker options
 * @typedef {Object} MarkerOptions
 * @property {PerformanceCategory} category - Marker category
 * @property {Object} metadata - Additional metadata
 * @property {boolean} detailed - Whether to create detailed markers
 */

/**
 * PerformanceProfiler Class
 *
 * Provides unified performance profiling API with Chrome DevTools integration.
 */
export class PerformanceProfiler {
    /**
     * @private
     * @type {boolean}
     */
    _enabled = true;

    /**
     * @private
     * @type {Map<string, PerformanceMeasurement>}
     */
    _measurements = new Map();

    /**
     * @private
     * @type {Map<string, number>}
     */
    _activeMarkers = new Map();

    /**
     * @private
     * @type {Map<PerformanceCategory, Array<PerformanceMeasurement>>
     */
    _categoryMeasurements = new Map();

    /**
     * @private
     * @type {number}
     */
    _maxMeasurements = 1000;

    /**
     * @private
     * @type {Map<PerformanceCategory, PerformanceBudget>}
     */
    _performanceBudgets = new Map();

    /**
     * @private
     * @type {Array<MemorySnapshot>}
     */
    _memorySnapshots = [];

    /**
     * @private
     * @type {number}
     */
    _maxMemorySnapshots = 100;

    /**
     * @private
     * @type {Array<DegradationAlert>}
     */
    _degradationAlerts = [];

    /**
     * @private
     * @type {number}
     */
    _maxDegradationAlerts = 50;

    /**
     * @private
     * @type {Map<PerformanceCategory, Array<number>>}
     */
    _baselinePerformance = new Map();

    /**
     * @private
     * @type {boolean}
     */
    _memoryProfilingEnabled = true;

    /**
     * Initialize the PerformanceProfiler
     * @public
     * @param {Object} options - Configuration options
     * @param {boolean} options.enabled - Whether profiling is enabled
     * @param {number} options.maxMeasurements - Maximum measurements to store
     * @param {number} options.maxSnapshots - Maximum memory snapshots to store
     * @param {number} options.maxDegradationAlerts - Maximum degradation alerts to store
     */
    constructor({ enabled = true, maxMeasurements = 1000, maxSnapshots, maxDegradationAlerts } = {}) {
        this._enabled = enabled && this._isPerformanceAPIAvailable();
        this._maxMeasurements = maxMeasurements;
        if (maxSnapshots !== undefined) {
            this._maxMemorySnapshots = maxSnapshots;
        }
        if (maxDegradationAlerts !== undefined) {
            this._maxDegradationAlerts = maxDegradationAlerts;
        }

        // Initialize category measurements
        for (const category of Object.values(PerformanceCategory)) {
            this._categoryMeasurements.set(category, []);
        }

        // Create initial performance marks
        if (this._enabled) {
            this._initializeGlobalMarks();
        }

        performance.mark('performance-profiler-init');
    }

    /**
     * Check if Performance API is available
     * @private
     * @returns {boolean} True if Performance API available
     */
    _isPerformanceAPIAvailable() {
        return typeof performance !== 'undefined' &&
            typeof performance.mark === 'function' &&
            typeof performance.measure === 'function';
    }

    /**
     * Initialize global performance marks
     * @private
     */
    _initializeGlobalMarks() {
        // Application lifecycle marks
        performance.mark('app_init_start');

        // Core system marks
        this.mark('storage_init_start', PerformanceCategory.INITIALIZATION);
        this.mark('tab_coordination_init_start', PerformanceCategory.TAB_COORDINATION);
        this.mark('event_bus_init_start', PerformanceCategory.INITIALIZATION);

        // Provider marks
        for (const provider of ['openrouter', 'lmstudio', 'ollama']) {
            this.mark(`${provider}_init_start`, PerformanceCategory.PROVIDER);
        }
    }

    /**
     * Create a performance mark
     * @public
     * @param {string} name - Mark name
     * @param {MarkerOptions} options - Marker options
     * @returns {boolean} True if mark created successfully
     */
    mark(name, options = {}) {
        if (!this._enabled) return false;

        try {
            const categoryName = options.category || PerformanceCategory.COMPUTATION;
            const markName = this._generateMarkName(name, categoryName);

            performance.mark(markName);

            // Store metadata if provided
            if (options.metadata || options.detailed) {
                this._activeMarkers.set(markName, {
                    name,
                    category: categoryName,
                    metadata: options.metadata || {},
                    timestamp: Date.now()
                });
            }

            return true;
        } catch (error) {
            console.warn(`[PerformanceProfiler] Failed to create mark '${name}':`, error);
            return false;
        }
    }

    /**
     * Create a performance measure between two marks
     * @public
     * @param {string} name - Measure name
     * @param {string} startMark - Start mark name
     * @param {string} endMark - End mark name
     * @param {MarkerOptions} options - Measure options
     * @returns {PerformanceMeasurement|null} Measurement record or null
     */
    measure(name, startMark, endMark, options = {}) {
        if (!this._enabled) return null;

        try {
            const categoryName = options.category || PerformanceCategory.COMPUTATION;
            const measureName = this._generateMeasureName(name, categoryName);

            // Create performance measure
            performance.measure(measureName, startMark, endMark);

            // Get measurement data
            const entries = performance.getEntriesByName(measureName, 'measure');
            const entry = entries[entries.length - 1];

            if (!entry) {
                console.warn(`[PerformanceProfiler] No measure entries found for '${name}'`);
                return null;
            }

            // Create measurement record
            const measurement = this._createMeasurementRecord(name, categoryName, entry, options.metadata);

            // Store measurement
            this._storeMeasurement(measurement);

            // Clean up marks if detailed
            if (!options.detailed) {
                try {
                    performance.clearMarks(startMark);
                    performance.clearMarks(endMark);
                } catch (e) {
                    // Ignore cleanup errors
                }
            }

            return measurement;
        } catch (error) {
            console.warn(`[PerformanceProfiler] Failed to create measure '${name}':`, error);
            return null;
        }
    }

    /**
     * Start a timed operation
     * @public
     * @param {string} name - Operation name
     * @param {MarkerOptions} options - Operation options
     * @returns {Function} Stop function that returns measurement
     */
    startOperation(name, options = {}) {
        if (!this._enabled) {
            return () => null;
        }

        const categoryName = options.category || PerformanceCategory.COMPUTATION;
        const startMark = this._generateMarkName(`${name}_start`, categoryName);

        performance.mark(startMark);

        // Return stop function
        return (stopOptions = {}) => {
            const endMark = this._generateMarkName(`${name}_end`, categoryName);
            performance.mark(endMark);

            const measurement = this.measure(name, startMark, endMark, {
                category: categoryName,
                metadata: { ...options.metadata, ...stopOptions.metadata },
                detailed: stopOptions.detailed || options.detailed
            });

            return measurement;
        };
    }

    /**
     * Measure an async operation
     * @public
     * @param {string} name - Operation name
     * @param {Function} operation - Async operation to measure
     * @param {MarkerOptions} options - Operation options
     * @returns {Promise} Result of the operation
     */
    async measureAsync(name, operation, options = {}) {
        const stopOperation = this.startOperation(name, options);

        try {
            const result = await operation();
            return result;
        } finally {
            stopOperation();
        }
    }

    /**
     * Create measurement record from performance entry
     * @private
     * @param {string} name - Measurement name
     * @param {PerformanceCategory} category - Measurement category
     * @param {PerformanceEntry} entry - Performance entry
     * @param {Object} metadata - Additional metadata
     * @returns {PerformanceMeasurement} Measurement record
     */
    _createMeasurementRecord(name, category, entry, metadata = {}) {
        return {
            id: `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name,
            category,
            startTime: entry.startTime,
            endTime: entry.startTime + entry.duration,
            duration: entry.duration,
            metadata: metadata || {},
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Store measurement record with proactive pruning
     * @private
     * @param {PerformanceMeasurement} measurement - Measurement to store
     */
    _storeMeasurement(measurement) {
        // Proactive pruning at 90% capacity (before hitting limit)
        if (this._measurements.size >= this._maxMeasurements * 0.9) {
            this._pruneOldMeasurements();
        }

        // Store in main measurements map
        this._measurements.set(measurement.id, measurement);

        // Store in category measurements
        const categoryMeasurements = this._categoryMeasurements.get(measurement.category) || [];
        categoryMeasurements.push(measurement);
        this._categoryMeasurements.set(measurement.category, categoryMeasurements);

        // Time-based pruning: remove measurements older than 1 hour
        this._pruneOldMeasurementsByTime();
    }

    /**
     * Prune old measurements if exceeding max or by time
     * @private
     */
    _pruneOldMeasurements() {
        // Prune by count if exceeding max
        if (this._measurements.size > this._maxMeasurements) {
            // Remove oldest measurements from each category
            for (const [category, measurements] of this._categoryMeasurements) {
                while (measurements.length > this._maxMeasurements / Object.values(PerformanceCategory).length) {
                    const removed = measurements.shift();
                    this._measurements.delete(removed.id);
                }
            }
        }
    }

    /**
     * Prune old measurements by time (1 hour retention)
     * @private
     */
    _pruneOldMeasurementsByTime() {
        const oneHourAgo = Date.now() - 3600000; // 1 hour in milliseconds

        for (const [category, measurements] of this._categoryMeasurements) {
            const filtered = measurements.filter(m => {
                const measurementTime = new Date(m.timestamp).getTime();
                return measurementTime > oneHourAgo;
            });

            // Remove deleted measurements from main map
            const removed = measurements.filter(m => !filtered.includes(m));
            for (const measurement of removed) {
                this._measurements.delete(measurement.id);
            }

            this._categoryMeasurements.set(category, filtered);
        }
    }

    /**
     * Generate performance mark name
     * @private
     * @param {string} name - Base name
     * @param {PerformanceCategory} category - Category
     * @returns {string} Generated mark name
     */
    _generateMarkName(name, category) {
        return `rhythm_chamber_${category}_${name}`;
    }

    /**
     * Generate performance measure name
     * @private
     * @param {string} name - Base name
     * @param {PerformanceCategory} category - Category
     * @returns {string} Generated measure name
     */
    _generateMeasureName(name, category) {
        return `rhythm_chamber_${category}_${name}_measure`;
    }

    /**
     * Get all measurements
     * @public
     * @returns {Array<PerformanceMeasurement>} All measurements
     */
    getMeasurements() {
        return Array.from(this._measurements.values());
    }

    /**
     * Get measurements by category
     * @public
     * @param {PerformanceCategory} category - Category to filter by
     * @returns {Array<PerformanceMeasurement>} Category measurements
     */
    getMeasurementsByCategory(category) {
        return this._categoryMeasurements.get(category) || [];
    }

    /**
     * Get measurements by name
     * @public
     * @param {string} name - Measurement name
     * @returns {Array<PerformanceMeasurement>} Matching measurements
     */
    getMeasurementsByName(name) {
        return Array.from(this._measurements.values()).filter(m => m.name === name);
    }

    /**
     * Get performance statistics
     * @public
     * @param {PerformanceCategory} category - Category to get stats for (optional)
     * @returns {Object} Performance statistics
     */
    getStatistics(category = null) {
        const measurements = category
            ? this.getMeasurementsByCategory(category)
            : this.getMeasurements();

        if (measurements.length === 0) {
            return {
                count: 0,
                totalDuration: 0,
                avgDuration: 0,
                minDuration: 0,
                maxDuration: 0,
                medianDuration: 0,
                p95Duration: 0,
                p99Duration: 0
            };
        }

        const durations = measurements.map(m => m.duration).sort((a, b) => a - b);
        const totalDuration = durations.reduce((sum, d) => sum + d, 0);

        // Calculate median - average of two middle values for even-length arrays
        let medianDuration;
        const mid = Math.floor(durations.length / 2);
        if (durations.length % 2 === 0) {
            medianDuration = (durations[mid - 1] + durations[mid]) / 2;
        } else {
            medianDuration = durations[mid];
        }

        return {
            count: measurements.length,
            totalDuration,
            avgDuration: totalDuration / measurements.length,
            minDuration: durations[0],
            maxDuration: durations[durations.length - 1],
            medianDuration,
            p95Duration: durations[Math.floor((durations.length - 1) * 0.95)],
            p99Duration: durations[Math.min(Math.floor(durations.length * 0.99), durations.length - 1)]
        };
    }

    /**
     * Get performance report
     * @public
     * @returns {Object} Comprehensive performance report
     */
    getPerformanceReport() {
        const report = {
            timestamp: new Date().toISOString(),
            enabled: this._enabled,
            totalMeasurements: this._measurements.size,
            categories: {},
            slowestOperations: this._getSlowestOperations(10),
            statistics: this.getStatistics()
        };

        // Add per-category statistics
        for (const category of Object.values(PerformanceCategory)) {
            report.categories[category] = {
                measurements: this.getMeasurementsByCategory(category).length,
                statistics: this.getStatistics(category)
            };
        }

        return report;
    }

    /**
     * Get slowest operations
     * @private
     * @param {number} limit - Maximum number of operations to return
     * @returns {Array<PerformanceMeasurement>} Slowest operations
     */
    _getSlowestOperations(limit = 10) {
        return Array.from(this._measurements.values())
            .sort((a, b) => b.duration - a.duration)
            .slice(0, limit);
    }

    /**
     * Clear all measurements
     * @public
     */
    clearMeasurements() {
        this._measurements.clear();
        for (const category of Object.values(PerformanceCategory)) {
            this._categoryMeasurements.set(category, []);
        }
        console.log('[PerformanceProfiler] Cleared all measurements');
    }

    /**
     * Clear measurements by category
     * @public
     * @param {PerformanceCategory} category - Category to clear
     */
    clearMeasurementsByCategory(category) {
        const categoryMeasurements = this._categoryMeasurements.get(category) || [];
        for (const measurement of categoryMeasurements) {
            this._measurements.delete(measurement.id);
        }
        this._categoryMeasurements.set(category, []);
    }

    /**
     * Export measurements to JSON
     * @public
     * @returns {string} JSON export of measurements
     */
    exportToJSON() {
        const data = {
            version: '1.0.0',
            exportDate: new Date().toISOString(),
            measurements: Array.from(this._measurements.values()),
            report: this.getPerformanceReport()
        };
        return JSON.stringify(data, null, 2);
    }

    /**
     * Enable performance profiling
     * @public
     */
    enable() {
        if (!this._isPerformanceAPIAvailable()) {
            console.warn('[PerformanceProfiler] Performance API not available');
            return;
        }
        this._enabled = true;
        console.log('[PerformanceProfiler] Enabled');
    }

    /**
     * Disable performance profiling
     * @public
     */
    disable() {
        this._enabled = false;
        console.log('[PerformanceProfiler] Disabled');
    }

    /**
     * Check if profiling is enabled
     * @public
     * @returns {boolean} True if enabled
     */
    isEnabled() {
        return this._enabled;
    }

    /**
     * Take a memory snapshot
     * @public
     * @param {Object} metadata - Additional metadata
     * @returns {MemorySnapshot|null} Memory snapshot or null if unavailable
     */
    takeMemorySnapshot(metadata = {}) {
        if (!this._enabled || !this._memoryProfilingEnabled) {
            return null;
        }

        if (!performance.memory) {
            console.warn('[PerformanceProfiler] Memory API not available');
            return null;
        }

        try {
            const memory = performance.memory;
            const snapshot = {
                id: `memory_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                timestamp: Date.now(),
                usedJSHeapSize: memory.usedJSHeapSize,
                totalJSHeapSize: memory.totalJSHeapSize,
                jsHeapSizeLimit: memory.jsHeapSizeLimit,
                usagePercentage: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100,
                metadata
            };

            // Store snapshot with pruning
            this._memorySnapshots.push(snapshot);
            if (this._memorySnapshots.length > this._maxMemorySnapshots) {
                this._memorySnapshots.shift();
            }

            // Check for memory degradation
            this._checkMemoryDegradation(snapshot);

            return snapshot;
        } catch (error) {
            console.warn('[PerformanceProfiler] Failed to take memory snapshot:', error);
            return null;
        }
    }

    /**
     * Get memory statistics
     * @public
     * @returns {Object} Memory statistics
     */
    getMemoryStatistics() {
        if (this._memorySnapshots.length === 0) {
            return {
                snapshotCount: 0,
                currentUsage: null,
                averageUsage: null,
                peakUsage: null,
                usageTrend: 'unknown'
            };
        }

        const usages = this._memorySnapshots.map(s => s.usagePercentage);
        const current = this._memorySnapshots[this._memorySnapshots.length - 1];
        // Guard against division by zero
        const average = usages.length > 0 ? usages.reduce((sum, u) => sum + u, 0) / usages.length : 0;
        const peak = Math.max(...usages);

        // Determine trend
        const recent = usages.slice(-10);
        const older = usages.slice(0, 10);
        // Guard against division by zero
        const avgRecent = recent.length > 0 ? recent.reduce((sum, u) => sum + u, 0) / recent.length : 0;
        const avgOlder = older.length > 0 ? older.reduce((sum, u) => sum + u, 0) / older.length : 0;

        let trend = 'stable';
        if (avgRecent > avgOlder * 1.2) {
            trend = 'increasing';
        } else if (avgRecent < avgOlder * 0.8) {
            trend = 'decreasing';
        }

        return {
            snapshotCount: this._memorySnapshots.length,
            currentUsage: current.usagePercentage,
            averageUsage: average,
            peakUsage: peak,
            usageTrend: trend,
            currentBytes: {
                used: current.usedJSHeapSize,
                total: current.totalJSHeapSize,
                limit: current.jsHeapSizeLimit
            }
        };
    }

    /**
     * Set performance budget for a category
     * @public
     * @param {PerformanceCategory} category - Category to set budget for
     * @param {PerformanceBudget} budget - Budget configuration
     */
    setPerformanceBudget(category, budget) {
        this._performanceBudgets.set(category, {
            threshold: budget.threshold || 1000,
            action: budget.action || 'warn',
            degradationThreshold: budget.degradationThreshold || 50
        });
    }

    /**
     * Check performance budget for a measurement
     * @private
     * @param {PerformanceMeasurement} measurement - Measurement to check
     */
    _checkPerformanceBudget(measurement) {
        const budget = this._performanceBudgets.get(measurement.category);
        if (!budget) return;

        if (measurement.duration > budget.threshold) {
            const alert = {
                id: `budget_alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                severity: budget.action === 'error' ? 'critical' : 'warning',
                message: `Performance budget exceeded for ${measurement.category}: ${measurement.duration.toFixed(2)}ms > ${budget.threshold}ms`,
                category: measurement.category,
                timestamp: Date.now(),
                details: {
                    measurement: measurement.name,
                    duration: measurement.duration,
                    threshold: budget.threshold,
                    budgetAction: budget.action
                }
            };

            this._addDegradationAlert(alert);
        }
    }

    /**
     * Check for performance degradation
     * @private
     * @param {PerformanceMeasurement} measurement - Measurement to check
     */
    _checkPerformanceDegradation(measurement) {
        const baseline = this._baselinePerformance.get(measurement.category);
        if (!baseline || baseline.length < 5) return;

        const avgBaseline = baseline.reduce((sum, val) => sum + val, 0) / baseline.length;
        const degradation = ((measurement.duration - avgBaseline) / avgBaseline) * 100;

        const budget = this._performanceBudgets.get(measurement.category);
        const threshold = budget?.degradationThreshold || 50;

        if (degradation > threshold) {
            const alert = {
                id: `degradation_alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                severity: degradation > threshold * 2 ? 'critical' : 'warning',
                message: `Performance degradation detected in ${measurement.category}: ${degradation.toFixed(1)}% slower than baseline`,
                category: measurement.category,
                timestamp: Date.now(),
                details: {
                    measurement: measurement.name,
                    currentDuration: measurement.duration,
                    baselineDuration: avgBaseline,
                    degradation: degradation
                }
            };

            this._addDegradationAlert(alert);
        }
    }

    /**
     * Check for memory degradation
     * @private
     * @param {MemorySnapshot} snapshot - Memory snapshot
     */
    _checkMemoryDegradation(snapshot) {
        if (this._memorySnapshots.length < 5) return;

        const recentSnapshots = this._memorySnapshots.slice(-10);
        const avgUsage = recentSnapshots.reduce((sum, s) => sum + s.usagePercentage, 0) / recentSnapshots.length;
        const threshold = 80; // 80% memory usage threshold

        if (snapshot.usagePercentage > threshold && avgUsage > threshold * 0.8) {
            const alert = {
                id: `memory_alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                severity: snapshot.usagePercentage > 90 ? 'critical' : 'warning',
                message: `High memory usage detected: ${snapshot.usagePercentage.toFixed(1)}% of heap limit`,
                category: 'memory',
                timestamp: Date.now(),
                details: {
                    currentUsage: snapshot.usagePercentage,
                    usedBytes: snapshot.usedJSHeapSize,
                    totalBytes: snapshot.totalJSHeapSize,
                    limitBytes: snapshot.jsHeapSizeLimit
                }
            };

            this._addDegradationAlert(alert);
        }
    }

    /**
     * Add degradation alert with pruning
     * @private
     * @param {DegradationAlert} alert - Alert to add
     */
    _addDegradationAlert(alert) {
        this._degradationAlerts.push(alert);

        // Prune old alerts
        if (this._degradationAlerts.length > this._maxDegradationAlerts) {
            this._degradationAlerts.shift();
        }

        // Log critical alerts
        if (alert.severity === 'critical') {
            console.error(`[PerformanceProfiler] ${alert.message}`, alert.details);
        } else {
            console.warn(`[PerformanceProfiler] ${alert.message}`);
        }
    }

    /**
     * Get degradation alerts
     * @public
     * @param {string} severity - Filter by severity (optional)
     * @returns {Array<DegradationAlert>} Degradation alerts
     */
    getDegradationAlerts(severity = null) {
        if (severity) {
            return this._degradationAlerts.filter(alert => alert.severity === severity);
        }
        return [...this._degradationAlerts];
    }

    /**
     * Clear degradation alerts
     * @public
     */
    clearDegradationAlerts() {
        this._degradationAlerts = [];
        console.log('[PerformanceProfiler] Cleared degradation alerts');
    }

    /**
     * Establish performance baseline for a category
     * @public
     * @param {PerformanceCategory} category - Category to establish baseline for
     * @param {number} sampleSize - Number of measurements to use for baseline
     */
    establishBaseline(category, sampleSize = 10) {
        const measurements = this.getMeasurementsByCategory(category);
        const recent = measurements.slice(-sampleSize);

        if (recent.length >= sampleSize) {
            const durations = recent.map(m => m.duration);
            this._baselinePerformance.set(category, durations);
            console.log(`[PerformanceProfiler] Established baseline for ${category} with ${durations.length} samples`);
        }
    }

    /**
     * Get comprehensive performance report
     * @public
     * @returns {Object} Comprehensive performance report
     */
    getComprehensiveReport() {
        const baseReport = this.getPerformanceReport();

        return {
            ...baseReport,
            memory: this.getMemoryStatistics(),
            degradation: {
                alerts: this.getDegradationAlerts(),
                criticalCount: this.getDegradationAlerts('critical').length,
                warningCount: this.getDegradationAlerts('warning').length
            },
            budgets: this._getBudgetStatus(),
            memorySnapshots: this._memorySnapshots.slice(-20) // Last 20 snapshots
        };
    }

    /**
     * Get budget status for all categories
     * @private
     * @returns {Object} Budget status
     */
    _getBudgetStatus() {
        const budgets = {};

        for (const [category, budget] of this._performanceBudgets) {
            const measurements = this.getMeasurementsByCategory(category);
            const recent = measurements.slice(-10);

            if (recent.length > 0) {
                const avgDuration = recent.reduce((sum, m) => sum + m.duration, 0) / recent.length;
                const maxDuration = Math.max(...recent.map(m => m.duration));
                const budgetExceeded = recent.filter(m => m.duration > budget.threshold).length;

                budgets[category] = {
                    threshold: budget.threshold,
                    action: budget.action,
                    averageDuration: avgDuration,
                    maxDuration,
                    budgetExceededCount: budgetExceeded,
                    budgetExceededPercentage: (budgetExceeded / recent.length) * 100
                };
            }
        }

        return budgets;
    }

    /**
     * Set up automatic memory profiling interval
     * @public
     * @param {number} intervalMs - Interval in milliseconds
     * @returns {Function} Stop function
     */
    startMemoryProfiling(intervalMs = 30000) {
        if (!this._memoryProfilingEnabled) {
            return () => {};
        }

        const intervalId = setInterval(() => {
            this.takeMemorySnapshot({ automatic: true });
        }, intervalMs);

        return () => clearInterval(intervalId);
    }

    /**
     * Enable memory profiling
     * @public
     */
    enableMemoryProfiling() {
        this._memoryProfilingEnabled = true;
        console.log('[PerformanceProfiler] Memory profiling enabled');
    }

    /**
     * Disable memory profiling
     * @public
     */
    disableMemoryProfiling() {
        this._memoryProfilingEnabled = false;
        console.log('[PerformanceProfiler] Memory profiling disabled');
    }

    /**
     * Clear memory snapshots
     * @public
     */
    clearMemorySnapshots() {
        this._memorySnapshots = [];
        console.log('[PerformanceProfiler] Cleared memory snapshots');
    }
}

// Export singleton instance
const PerformanceProfilerSingleton = new PerformanceProfiler();
export default PerformanceProfilerSingleton;

// Convenience exports for common patterns
export const mark = (name, options) => PerformanceProfilerSingleton.mark(name, options);
export const measure = (name, startMark, endMark, options) => PerformanceProfilerSingleton.measure(name, startMark, endMark, options);
export const startOperation = (name, options) => PerformanceProfilerSingleton.startOperation(name, options);
export const measureAsync = (name, operation, options) => PerformanceProfilerSingleton.measureAsync(name, operation, options);
export const getPerformanceReport = () => PerformanceProfilerSingleton.getPerformanceReport();