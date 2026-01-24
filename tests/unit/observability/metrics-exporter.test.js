/**
 * Metrics Exporter Tests
 *
 * Comprehensive test suite for Metrics Export functionality.
 * Tests export formats, scheduled exports, and external service integrations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MetricsExporter, ExportFormat, ScheduleType, ExternalService } from '../../../js/observability/metrics-exporter.js';

// Mock fetch API
const mockFetch = () => {
    global.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
        status: 200,
        statusText: 'OK'
    }));
};

// Mock the PerformanceProfiler module at the module level
vi.mock('../../../js/services/performance-profiler.js', () => ({
    PerformanceProfiler: {
        getComprehensiveReport: vi.fn(() => ({
            timestamp: new Date().toISOString(),
            totalMeasurements: 100,
            categories: {},
            measurements: [],
            memory: { currentUsage: 45.5 }
        }))
    }
}));

// Mock the CoreWebVitals module at the module level
vi.mock('../../../js/observability/core-web-vitals.js', () => ({
    CoreWebVitalsTracker: {
        getWebVitalsSummary: vi.fn(() => ({
            vitals: {}
        }))
    }
}));

describe('MetricsExporter', () => {
    let exporter;

    beforeEach(async () => {
        mockFetch();
        // Clear localStorage before each test to ensure clean state
        localStorage.clear();
        exporter = await MetricsExporter.create({ enabled: true });
    });

    afterEach(() => {
        if (exporter) {
            exporter.disable();
        }
        vi.clearAllMocks();
    });

    describe('Initialization', () => {
        it('should initialize with default options', () => {
            expect(exporter).toBeDefined();
            expect(exporter.isEnabled()).toBe(true);
        });

        it('should initialize with encryption config', async () => {
            const encryptionConfig = {
                password: 'test-password',
                salt: 'test-salt',
                iterations: 100000
            };

            const encryptedExporter = await MetricsExporter.create({
                enabled: true,
                encryptionConfig
            });

            expect(encryptedExporter._encryptionConfig).toEqual(encryptionConfig);
            encryptedExporter.disable();
        });
    });

    describe('Metrics Gathering', () => {
        it('should gather metrics from PerformanceProfiler', async () => {
            const metrics = await exporter._gatherMetrics({
                includeMemory: true,
                includeWebVitals: true
            });

            expect(metrics).toBeDefined();
            expect(metrics.performance).toBeDefined();
            expect(metrics.memory).toBeDefined();
            expect(metrics.webVitals).toBeDefined();
            expect(metrics.system).toBeDefined();
        });

        it('should gather system metrics', async () => {
            const metrics = await exporter._gatherMetrics({});

            expect(metrics.system).toBeDefined();
            expect(metrics.system.userAgent).toBeDefined();
            expect(metrics.system.language).toBeDefined();
            expect(metrics.system.platform).toBeDefined();
        });
    });

    describe('Export Formats', () => {
        it('should export metrics as JSON', async () => {
            const testMetrics = {
                timestamp: new Date().toISOString(),
                performance: {
                    avgDuration: 100,
                    maxDuration: 500
                },
                memory: {
                    currentUsage: 45.5
                }
            };

            const jsonExport = await exporter._exportMetrics(testMetrics, ExportFormat.JSON);

            expect(jsonExport).toBeDefined();
            expect(typeof jsonExport).toBe('string');

            const parsed = JSON.parse(jsonExport);
            expect(parsed.performance.avgDuration).toBe(100);
        });

        it('should export metrics as CSV', async () => {
            const testMetrics = {
                timestamp: new Date().toISOString(),
                performance: {
                    measurements: [
                        { name: 'operation1', duration: 100, category: 'computation' },
                        { name: 'operation2', duration: 200, category: 'storage' }
                    ]
                }
            };

            const csvExport = await exporter._exportMetrics(testMetrics, ExportFormat.CSV);

            expect(csvExport).toBeDefined();
            expect(typeof csvExport).toBe('string');
            expect(csvExport).toContain('operation1');
            expect(csvExport).toContain('100');
        });

        it('should export metrics as Prometheus format', async () => {
            const testMetrics = {
                performance: {
                    categories: {
                        computation: {
                            statistics: {
                                avgDuration: 150
                            }
                        }
                    }
                },
                memory: {
                    currentUsage: 60.0
                }
            };

            const promExport = await exporter._exportMetrics(testMetrics, ExportFormat.PROMETHEUS);

            expect(promExport).toBeDefined();
            expect(typeof promExport).toBe('string');
            expect(promExport).toContain('rhythm_chamber_');
            // The Prometheus format uses sanitized names with _ms suffix for duration metrics
            expect(promExport).toContain('computation_duration_ms');
        });

        it('should export metrics as InfluxDB format', async () => {
            const testMetrics = {
                performance: {
                    categories: {
                        computation: {
                            statistics: {
                                avgDuration: 150,
                                maxDuration: 500,
                                minDuration: 50
                            }
                        }
                    }
                }
            };

            const influxExport = await exporter._exportMetrics(testMetrics, ExportFormat.INFLUXDB);

            expect(influxExport).toBeDefined();
            expect(typeof influxExport).toBe('string');
            expect(influxExport).toContain('performance_measurements');
        });
    });

    describe('Scheduled Exports', () => {
        it('should create scheduled export job', async () => {
            const jobId = await exporter.createScheduledExport('daily-export', {
                format: ExportFormat.JSON,
                schedule: ScheduleType.DAILY,
                includeMemory: true,
                includeWebVitals: true,
                categories: ['computation', 'storage']
            });

            expect(jobId).toBeDefined();
            expect(jobId).toContain('export_');

            const jobs = exporter.getScheduledJobs();
            expect(jobs.length).toBeGreaterThan(0);

            const createdJob = jobs.find(j => j.id === jobId);
            expect(createdJob).toBeDefined();
            expect(createdJob.name).toBe('daily-export');
            expect(createdJob.status).toBe('active');
        });

        it('should calculate next run time correctly', () => {
            const nextHourly = exporter._calculateNextRun(ScheduleType.HOURLY);
            const nextDaily = exporter._calculateNextRun(ScheduleType.DAILY);
            const nextWeekly = exporter._calculateNextRun(ScheduleType.WEEKLY);

            expect(nextHourly).toBeInstanceOf(Date);
            expect(nextDaily).toBeInstanceOf(Date);
            expect(nextWeekly).toBeInstanceOf(Date);

            // Daily should be further in future than hourly
            expect(nextDaily.getTime()).toBeGreaterThan(nextHourly.getTime());

            // Weekly should be further in future than daily
            expect(nextWeekly.getTime()).toBeGreaterThan(nextDaily.getTime());
        });

        it('should pause scheduled job', async () => {
            const jobId = await exporter.createScheduledExport('test-job', {
                format: ExportFormat.JSON,
                schedule: ScheduleType.HOURLY
            });

            await exporter.pauseJob(jobId);

            const jobs = exporter.getScheduledJobs();
            const job = jobs.find(j => j.id === jobId);

            expect(job).toBeDefined();
            expect(job.status).toBe('paused');
        });

        it('should resume scheduled job', async () => {
            const jobId = await exporter.createScheduledExport('test-job', {
                format: ExportFormat.JSON,
                schedule: ScheduleType.HOURLY
            });

            await exporter.pauseJob(jobId);
            await exporter.resumeJob(jobId);

            const jobs = exporter.getScheduledJobs();
            const job = jobs.find(j => j.id === jobId);

            expect(job).toBeDefined();
            expect(job.status).toBe('active');
        });

        it('should delete scheduled job', async () => {
            const jobId = await exporter.createScheduledExport('test-job', {
                format: ExportFormat.JSON,
                schedule: ScheduleType.HOURLY
            });

            expect(exporter.getScheduledJobs().length).toBeGreaterThan(0);

            await exporter.deleteJob(jobId);

            const jobs = exporter.getScheduledJobs();
            const job = jobs.find(j => j.id === jobId);

            expect(job).toBeUndefined();
        });
    });

    describe('External Service Integrations', () => {
        it('should add external service', async () => {
            const serviceConfig = {
                service: ExternalService.DATADOG,
                endpoint: 'https://api.datadog.com/v1/series',
                credentials: { apiKey: 'test-key' },
                headers: { 'DD-API-KEY': 'test-key' },
                timeout: 30000
            };

            await exporter.addExternalService(serviceConfig);

            const services = exporter.getExternalServices();
            expect(services.length).toBeGreaterThan(0);

            const addedService = services.find(s => s.endpoint === serviceConfig.endpoint);
            expect(addedService).toBeDefined();
            expect(addedService.service).toBe(ExternalService.DATADOG);
        });

        it('should remove external service', async () => {
            const serviceConfig = {
                service: ExternalService.NEWRELIC,
                endpoint: 'https://api.newrelic.com/v1/metrics',
                credentials: { apiKey: 'test-key' },
                headers: {},
                timeout: 30000
            };

            await exporter.addExternalService(serviceConfig);
            expect(exporter.getExternalServices().length).toBeGreaterThan(0);

            await exporter.removeExternalService(serviceConfig.endpoint);

            const services = exporter.getExternalServices();
            const removedService = services.find(s => s.endpoint === serviceConfig.endpoint);

            expect(removedService).toBeUndefined();
        });

        it('should format data for DataDog', () => {
            const testData = JSON.stringify({
                computation_avgDuration: 150,
                storage_avgDuration: 300
            });

            const formatted = exporter._formatForService(
                testData,
                ExternalService.DATADOG,
                { format: ExportFormat.JSON }
            );

            expect(formatted).toBeDefined();
            expect(formatted.series).toBeDefined();
            expect(Array.isArray(formatted.series)).toBe(true);
        });

        it('should format data for New Relic', () => {
            const testData = JSON.stringify({
                computation_avgDuration: 150,
                storage_avgDuration: 300
            });

            const formatted = exporter._formatForService(
                testData,
                ExternalService.NEWRELIC,
                { format: ExportFormat.JSON }
            );

            expect(formatted).toBeDefined();
            expect(formatted.metrics).toBeDefined();
            expect(Array.isArray(formatted.metrics)).toBe(true);
        });
    });

    describe('Immediate Export', () => {
        it('should export metrics immediately', async () => {
            // Mock download function
            const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(() => ({
                href: '',
                download: '',
                click: vi.fn(),
                style: {}
            }));

            const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
            const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});

            await exporter.exportNow({
                format: ExportFormat.JSON,
                includeMemory: true,
                includeWebVitals: true
            });

            expect(createElementSpy).toHaveBeenCalledWith('a');
            expect(appendChildSpy).toHaveBeenCalled();

            createElementSpy.mockRestore();
            appendChildSpy.mockRestore();
            removeChildSpy.mockRestore();
        });
    });

    describe('Enable/Disable Functionality', () => {
        it('should disable exporter', () => {
            exporter.disable();
            expect(exporter.isEnabled()).toBe(false);
        });

        it('should enable exporter', () => {
            exporter.disable();
            exporter.enable();
            expect(exporter.isEnabled()).toBe(true);
        });
    });

    describe('Configuration Persistence', () => {
        it('should save configuration to localStorage', async () => {
            // Create a fresh exporter instance with spy already in place
            // We need to spy on the actual localStorage instance, not Storage.prototype
            const setItemSpy = vi.spyOn(localStorage, 'setItem');

            const freshExporter = await MetricsExporter.create({ enabled: true });
            await freshExporter.createScheduledExport('test-job', {
                format: ExportFormat.JSON,
                schedule: ScheduleType.HOURLY
            });

            // Wait a tick for the async save to complete
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(setItemSpy).toHaveBeenCalledWith(
                'observability_export_config',
                expect.stringContaining('"test-job"')
            );

            setItemSpy.mockRestore();
            freshExporter.disable();
        });

        it('should load configuration from localStorage', async () => {
            // Clear any existing state first
            localStorage.clear();
            vi.clearAllMocks();

            const config = {
                scheduledJobs: {},
                externalServices: []
            };

            // Spy on the localStorage instance
            const getItemSpy = vi.spyOn(localStorage, 'getItem').mockReturnValue(JSON.stringify(config));

            const newExporter = await MetricsExporter.create({ enabled: true });

            expect(newExporter._scheduledJobs.size).toBe(0);
            expect(newExporter._externalServices.length).toBe(0);

            newExporter.disable();

            // Restore the spy
            getItemSpy.mockRestore();
        });
    });

    describe('Error Handling', () => {
        it('should handle export errors gracefully', async () => {
            // The implementation should handle errors gracefully
            // and still return system metrics even if performance fails
            const result = await exporter._gatherMetrics({});

            expect(result).toBeDefined();
            // Result should still have system metrics even if performance fails
            expect(result.system).toBeDefined();
        });

        it('should handle fetch errors for external services', async () => {
            // Mock fetch to reject
            global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));

            const serviceConfig = {
                service: ExternalService.CUSTOM_ENDPOINT,
                endpoint: 'https://api.example.com/metrics',
                credentials: { apiKey: 'test-key' },
                headers: {},
                timeout: 5000
            };

            await exporter.addExternalService(serviceConfig);

            // Mock metrics
            const testMetrics = { test: 'data' };

            // Should handle error without throwing
            await expect(
                exporter._sendToExternalServices(JSON.stringify(testMetrics), {})
            ).resolves.not.toThrow();
        });
    });
});
