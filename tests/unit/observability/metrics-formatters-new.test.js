/**
 * Unit Tests for Metrics Formatters
 * @module tests/unit/observability/metrics-formatters-new
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsFormatters } from '/Users/rhinesharar/rhythm-chamber/js/observability/metrics-exporter/metrics-formatters.js';

describe('Metrics Formatters', () => {
    let formatters;
    let sampleMetrics;

    beforeEach(() => {
        formatters = new MetricsFormatters({ indentation: 2 });

        sampleMetrics = {
            performance: {
                categories: {
                    embedding: {
                        statistics: {
                            avgDuration: 150,
                            maxDuration: 300,
                            minDuration: 50
                        }
                    },
                    search: {
                        statistics: {
                            avgDuration: 75,
                            maxDuration: 120,
                            minDuration: 30
                        }
                    }
                },
                measurements: [
                    { timestamp: 1234567890, category: 'embedding', name: 'embed-1', duration: 150 },
                    { timestamp: 1234567891, category: 'search', name: 'search-1', duration: 75 }
                ]
            },
            webVitals: {
                vitals: {
                    LCP: {
                        latest: { value: 2500, rating: 'good', timestamp: 1234567890 }
                    },
                    FID: {
                        latest: { value: 100, rating: 'good', timestamp: 1234567890 }
                    },
                    CLS: {
                        latest: { value: 0.1, rating: 'needs-improvement', timestamp: 1234567890 }
                    }
                }
            },
            memory: {
                currentUsage: 65.5
            }
        };
    });

    describe('JSON Formatting', () => {
        it('should format metrics as JSON', () => {
            const result = formatters.formatAsJSON(sampleMetrics);
            const parsed = JSON.parse(result);

            expect(parsed).toEqual(sampleMetrics);
        });

        it('should handle empty metrics', () => {
            const result = formatters.formatAsJSON({});
            const parsed = JSON.parse(result);

            expect(parsed).toEqual({});
        });

        it('should use custom indentation', () => {
            const customFormatter = new MetricsFormatters({ indentation: 4 });
            const result = customFormatter.formatAsJSON({ test: 'value' });

            expect(result).toContain('    ');
        });

        it('should throw on circular references', () => {
            const circular = {};
            circular.self = circular;

            expect(() => formatters.formatAsJSON(circular)).toThrow();
        });
    });

    describe('CSV Formatting', () => {
        it('should format metrics as CSV', () => {
            const result = formatters.formatAsCSV(sampleMetrics);
            const lines = result.split('\n');

            // Headers are based on actual flattened metrics
            expect(lines[0]).toContain('timestamp,category,name,duration,type');
            expect(lines.length).toBeGreaterThan(1);
        });

        it('should handle empty metrics', () => {
            const result = formatters.formatAsCSV({});
            const lines = result.split('\n');

            expect(lines[0]).toBe('timestamp,category,name,duration,value,type');
        });

        it('should escape CSV values', () => {
            const result = formatters.escapeCSVValue('value with "quotes"');
            expect(result).toBe('"value with ""quotes"""');
        });

        it('should handle null values', () => {
            const result = formatters.escapeCSVValue(null);
            expect(result).toBe(''); // Empty string, not quoted
        });

        it('should flatten performance measurements', () => {
            const result = formatters.formatAsCSV(sampleMetrics);
            expect(result).toContain('embedding');
            expect(result).toContain('search');
        });
    });

    describe('Prometheus Formatting', () => {
        it('should format metrics as Prometheus', () => {
            const result = formatters.formatAsPrometheus(sampleMetrics);
            const lines = result.split('\n');

            expect(lines).toContain('# HELP rhythm_chamber_embedding_duration_ms Duration for embedding');
            expect(lines).toContain('# TYPE rhythm_chamber_embedding_duration_ms gauge');
            expect(result).toContain('rhythm_chamber_embedding_duration_ms 150');
        });

        it('should format web vitals for Prometheus', () => {
            const result = formatters.formatAsPrometheus(sampleMetrics);
            expect(result).toContain('rhythm_chamber_web_vital_LCP{rating="good"} 2500');
            expect(result).toContain('rhythm_chamber_web_vital_FID{rating="good"} 100');
        });

        it('should format memory metrics for Prometheus', () => {
            const result = formatters.formatAsPrometheus(sampleMetrics);
            expect(result).toContain('rhythm_chamber_memory_usage_percent 65.5');
        });

        it('should handle empty metrics', () => {
            const result = formatters.formatAsPrometheus({});
            expect(result).toBe('');
        });
    });

    describe('InfluxDB Formatting', () => {
        it('should format metrics as InfluxDB line protocol', () => {
            const result = formatters.formatAsInfluxDB(sampleMetrics);
            const lines = result.split('\n');

            expect(lines[0]).toContain('performance_measurements,category=embedding');
            expect(lines[0]).toContain('avg=150,max=300,min=50');
        });

        it('should include nanosecond timestamp', () => {
            const result = formatters.formatAsInfluxDB(sampleMetrics);
            expect(result).toMatch(/\d{19}/); // Nanosecond timestamp
        });

        it('should handle empty metrics', () => {
            const result = formatters.formatAsInfluxDB({});
            expect(result).toBe('');
        });
    });

    describe('StatsD Formatting', () => {
        it('should format metrics as StatsD', () => {
            const result = formatters.formatAsStatsD(sampleMetrics);
            const lines = result.split('\n');

            // Dots are sanitized to underscores
            expect(lines).toContain('rhythm_chamber_embedding_duration_ms:150|gauge');
            expect(lines).toContain('rhythm_chamber_search_duration_ms:75|gauge');
        });

        it('should format web vitals for StatsD', () => {
            const result = formatters.formatAsStatsD(sampleMetrics);
            // Sanitization converts dots to underscores
            expect(result).toContain('rhythm_chamber_web_vitals_LCP:2500|gauge');
            expect(result).toContain('rhythm_chamber_web_vitals_CLS:0.1|gauge');
        });

        it('should format memory metrics for StatsD', () => {
            const result = formatters.formatAsStatsD(sampleMetrics);
            expect(result).toContain('usage_percent:65.5|gauge');
        });

        it('should handle empty metrics', () => {
            const result = formatters.formatAsStatsD({});
            expect(result).toBe('');
        });
    });

    describe('Datadog Formatting', () => {
        it('should format metrics for Datadog', () => {
            const result = formatters.formatForDatadog(sampleMetrics);

            expect(result).toHaveProperty('series');
            expect(Array.isArray(result.series)).toBe(true);
            // Datadog uses dot notation, not underscores
            expect(result.series.length).toBeGreaterThan(0);
        });

        it('should include metric name and points', () => {
            const result = formatters.formatForDatadog(sampleMetrics);
            const firstMetric = result.series[0];

            expect(firstMetric).toHaveProperty('metric');
            expect(firstMetric).toHaveProperty('points');
            // Datadog format uses dots
            expect(firstMetric.metric).toMatch(/rhythm_chamber\./);
        });

        it('should handle empty metrics', () => {
            const result = formatters.formatForDatadog({});
            expect(result.series).toEqual([]);
        });
    });

    describe('New Relic Formatting', () => {
        it('should format metrics for New Relic', () => {
            const result = formatters.formatForNewRelic(sampleMetrics);

            expect(result).toHaveProperty('metrics');
            expect(Array.isArray(result.metrics)).toBe(true);
            expect(result.metrics.length).toBeGreaterThan(0);
        });

        it('should include metric name and value', () => {
            const result = formatters.formatForNewRelic(sampleMetrics);
            const firstMetric = result.metrics[0];

            expect(firstMetric).toHaveProperty('name');
            expect(firstMetric).toHaveProperty('value');
            expect(firstMetric).toHaveProperty('timestamp');
            expect(firstMetric.name).toContain('rhythm_chamber');
        });

        it('should handle empty metrics', () => {
            const result = formatters.formatForNewRelic({});
            expect(result.metrics).toEqual([]);
        });
    });

    describe('Label Formatting', () => {
        it('should format labels for Prometheus', () => {
            const labels = { env: 'prod', region: 'us-west' };
            const result = formatters.formatLabels(labels);

            expect(result).toBe('env="prod",region="us-west"');
        });

        it('should sort labels alphabetically', () => {
            const labels = { z: 'last', a: 'first', m: 'middle' };
            const result = formatters.formatLabels(labels);

            expect(result).toBe('a="first",m="middle",z="last"');
        });

        it('should escape quotes in label values', () => {
            const labels = { message: 'Hello "World"' };
            const result = formatters.formatLabels(labels);

            expect(result).toBe('message="Hello \\"World\\""');
        });
    });

    describe('Metric Name Sanitization', () => {
        it('should sanitize metric names for Prometheus', () => {
            expect(formatters.sanitizeMetricName('test-metric')).toBe('test_metric');
            expect(formatters.sanitizeMetricName('test.metric')).toBe('test_metric');
            expect(formatters.sanitizeMetricName('test metric')).toBe('test_metric');
        });

        it('should prefix names starting with invalid characters', () => {
            expect(formatters.sanitizeMetricName('123-metric')).toBe('_123_metric');
            expect(formatters.sanitizeMetricName('-metric')).toBe('_metric');
        });

        it('should preserve valid characters', () => {
            expect(formatters.sanitizeMetricName('valid_metric_123')).toBe('valid_metric_123');
            expect(formatters.sanitizeMetricName('valid:metric')).toBe('valid:metric');
        });
    });

    describe('Metrics Flattening', () => {
        it('should flatten performance measurements', () => {
            const result = formatters.flattenMetrics(sampleMetrics);

            // Should have 2 performance measurements + 3 web vitals = 5 total
            expect(result.length).toBeGreaterThanOrEqual(2);
            expect(result[0]).toHaveProperty('category', 'embedding');
            expect(result[1]).toHaveProperty('category', 'search');
        });

        it('should flatten web vitals', () => {
            const result = formatters.flattenMetrics(sampleMetrics);
            const webVitals = result.filter(m => m.type === 'web_vital');

            expect(webVitals.length).toBe(3);
            expect(webVitals[0]).toHaveProperty('rating');
        });

        it('should handle empty metrics', () => {
            const result = formatters.flattenMetrics({});
            expect(result).toEqual([]);
        });
    });

    describe('Utility Methods', () => {
        it('should return correct MIME type for format', () => {
            expect(formatters.getMimeType('json')).toBe('application/json');
            expect(formatters.getMimeType('csv')).toBe('text/csv');
            expect(formatters.getMimeType('prometheus')).toBe('text/plain');
        });

        it('should return default MIME type for unknown format', () => {
            expect(formatters.getMimeType('unknown')).toBe('text/plain');
        });

        it('should return correct file extension for format', () => {
            expect(formatters.getFileExtension('json')).toBe('json');
            expect(formatters.getFileExtension('csv')).toBe('csv');
            expect(formatters.getFileExtension('prometheus')).toBe('prom');
        });

        it('should return default file extension for unknown format', () => {
            expect(formatters.getFileExtension('unknown')).toBe('txt');
        });

        it('should format timestamp as ISO string', () => {
            const timestamp = 1234567890000;
            const result = formatters.formatTimestamp(timestamp);

            expect(result).toBe('2009-02-13T23:31:30.000Z');
        });

        it('should accept Date object', () => {
            const date = new Date('2009-02-13T23:31:30.000Z');
            const result = formatters.formatTimestamp(date);

            expect(result).toBe('2009-02-13T23:31:30.000Z');
        });
    });

    describe('Format Routing', () => {
        it('should route to correct formatter', () => {
            expect(formatters.format(sampleMetrics, 'json')).toContain('embedding');
            expect(formatters.format(sampleMetrics, 'csv')).toContain('timestamp,category');
            expect(formatters.format(sampleMetrics, 'prometheus')).toContain('# HELP');
        });

        it('should throw on unsupported format', () => {
            expect(() => formatters.format(sampleMetrics, 'unsupported')).toThrow();
        });
    });
});
