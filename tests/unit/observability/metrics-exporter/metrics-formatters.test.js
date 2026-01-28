/**
 * Tests for metrics-formatters.js
 *
 * Tests format conversions including:
 * - Export to different formats (JSON, Prometheus, StatsD, CSV, InfluxDB)
 * - Format transformations
 * - Label/tag formatting
 */

import { describe, it, test, expect, beforeEach } from 'vitest';
import { MetricsFormatters } from '../../../../js/observability/metrics-exporter/metrics-formatters.js';

describe('MetricsFormatters', () => {
    let formatters;
    let sampleMetrics;

    beforeEach(() => {
        formatters = new MetricsFormatters();

        sampleMetrics = {
            timestamp: '2024-01-15T10:30:00.000Z',
            performance: {
                measurements: [
                    { name: 'task1', duration: 100, category: 'performance', timestamp: Date.now() },
                    { name: 'task2', duration: 200, category: 'performance', timestamp: Date.now() }
                ],
                categories: {
                    'database': {
                        statistics: {
                            avgDuration: 150,
                            maxDuration: 200,
                            minDuration: 100
                        }
                    }
                }
            },
            webVitals: {
                vitals: {
                    'LCP': {
                        latest: { value: 2500, rating: 'good', timestamp: Date.now() }
                    },
                    'FID': {
                        latest: { value: 50, rating: 'good', timestamp: Date.now() }
                    }
                }
            },
            memory: {
                currentUsage: 65.5,
                peakUsage: 80.2
            },
            system: {
                userAgent: 'Mozilla/5.0',
                platform: 'MacIntel'
            }
        };
    });

    describe('constructor', () => {
        test('should create instance with default options', () => {
            expect(formatters).toBeInstanceOf(MetricsFormatters);
            expect(formatters._indentation).toBe(2);
        });

        test('should accept custom indentation', () => {
            const customFormatters = new MetricsFormatters({ indentation: 4 });
            expect(customFormatters._indentation).toBe(4);
        });
    });

    describe('formatAsJSON', () => {
        test('should format metrics as JSON', () => {
            const formatted = formatters.formatAsJSON(sampleMetrics);

            expect(typeof formatted).toBe('string');
            const parsed = JSON.parse(formatted);
            expect(parsed).toEqual(sampleMetrics);
        });

        test('should use custom indentation', () => {
            const customFormatters = new MetricsFormatters({ indentation: 4 });
            const formatted = customFormatters.formatAsJSON(sampleMetrics);

            expect(formatted).toContain('    '); // 4 spaces
        });

        test('should handle circular references gracefully', () => {
            const circularMetrics = { a: 1 };
            circularMetrics.self = circularMetrics;

            // Circular references should throw an error
            expect(() => formatters.formatAsJSON(circularMetrics)).toThrow();
        });
    });

    describe('formatAsCSV', () => {
        test('should format metrics as CSV', () => {
            const formatted = formatters.formatAsCSV(sampleMetrics);

            expect(typeof formatted).toBe('string');
            expect(formatted).toContain('timestamp');
            expect(formatted).toContain('category');
            expect(formatted).toContain('name');
        });

        test('should escape double quotes properly', () => {
            const metricsWithQuotes = {
                performance: {
                    measurements: [
                        { name: 'task "with quotes"', duration: 100, category: 'test', timestamp: Date.now() }
                    ]
                }
            };

            const formatted = formatters.formatAsCSV(metricsWithQuotes);

            expect(formatted).toContain('task ""with quotes""');
        });

        test('should handle null values', () => {
            const metricsWithNulls = {
                performance: {
                    measurements: [
                        { name: 'task1', duration: null, category: 'test', timestamp: Date.now() }
                    ]
                }
            };

            const formatted = formatters.formatAsCSV(metricsWithNulls);

            // Null values are escaped as empty strings (unquoted)
            expect(formatted).toContain(',,'); // Empty field between commas
        });

        test('should include header row', () => {
            const formatted = formatters.formatAsCSV(sampleMetrics);
            const lines = formatted.split('\n');

            expect(lines[0]).toContain('timestamp,category,name');
        });
    });

    describe('formatAsPrometheus', () => {
        test('should format metrics as Prometheus', () => {
            const formatted = formatters.formatAsPrometheus(sampleMetrics);

            expect(typeof formatted).toBe('string');
            expect(formatted).toContain('# HELP');
            expect(formatted).toContain('# TYPE');
            expect(formatted).toContain('gauge');
        });

        test('should sanitize metric names', () => {
            const formatted = formatters.formatAsPrometheus(sampleMetrics);

            expect(formatted).toMatch(/rhythm_chamber_[a-z_]+/);
        });

        test('should include HELP and TYPE headers', () => {
            const formatted = formatters.formatAsPrometheus(sampleMetrics);
            const lines = formatted.split('\n');

            expect(lines.some(line => line.startsWith('# HELP'))).toBe(true);
            expect(lines.some(line => line.startsWith('# TYPE'))).toBe(true);
        });

        test('should format web vitals with labels', () => {
            const formatted = formatters.formatAsPrometheus(sampleMetrics);

            expect(formatted).toMatch(/rating="good"/);
        });

        test('should handle null memory values', () => {
            const metricsWithNullMemory = {
                ...sampleMetrics,
                memory: { currentUsage: null }
            };

            const formatted = formatters.formatAsPrometheus(metricsWithNullMemory);

            // Should not emit invalid metrics
            expect(formatted).not.toMatch(/memory_usage_percent null/);
        });
    });

    describe('formatAsInfluxDB', () => {
        test('should format metrics as InfluxDB line protocol', () => {
            const formatted = formatters.formatAsInfluxDB(sampleMetrics);

            expect(typeof formatted).toBe('string');
            expect(formatted).toContain('performance_measurements');
        });

        test('should include tags and fields', () => {
            const formatted = formatters.formatAsInfluxDB(sampleMetrics);

            expect(formatted).toMatch(/category=[a-z]+/);
            expect(formatted).toMatch(/avg=/);
        });

        test('should include nanosecond timestamp', () => {
            const formatted = formatters.formatAsInfluxDB(sampleMetrics);

            expect(formatted).toMatch(/\d{19}/); // Nanosecond timestamp
        });
    });

    describe('formatAsStatsD', () => {
        test('should format metrics as StatsD', () => {
            const formatted = formatters.formatAsStatsD(sampleMetrics);

            expect(typeof formatted).toBe('string');
            expect(formatted).toContain('|gauge');
        });

        test('should use proper metric type suffixes', () => {
            const formatted = formatters.formatAsStatsD(sampleMetrics);

            expect(formatted).toContain('|gauge'); // StatsD format uses single pipe
        });

        test('should sanitize metric names', () => {
            const formatted = formatters.formatAsStatsD(sampleMetrics);

            // StatsD format uses underscores (sanitized from dots), colons as separators
            expect(formatted).toMatch(/\w+:[\w.]+/);
        });
    });

    describe('formatForDatadog', () => {
        test('should format metrics as Datadog series', () => {
            const formatted = formatters.formatForDatadog(sampleMetrics);

            expect(Array.isArray(formatted.series)).toBe(true);
            expect(formatted.series.length).toBeGreaterThan(0);
        });

        test('should include metric name and points', () => {
            const formatted = formatters.formatForDatadog(sampleMetrics);
            const firstSeries = formatted.series[0];

            expect(firstSeries).toHaveProperty('metric');
            expect(firstSeries).toHaveProperty('points');
            expect(firstSeries.points[0]).toHaveLength(2); // [timestamp, value]
        });

        test('should set metric type to gauge', () => {
            const formatted = formatters.formatForDatadog(sampleMetrics);
            const firstSeries = formatted.series[0];

            expect(firstSeries.type).toBe('gauge');
        });
    });

    describe('formatForNewRelic', () => {
        test('should format metrics as New Relic metrics', () => {
            const formatted = formatters.formatForNewRelic(sampleMetrics);

            expect(Array.isArray(formatted.metrics)).toBe(true);
            expect(formatted.metrics.length).toBeGreaterThan(0);
        });

        test('should include metric name, value, and timestamp', () => {
            const formatted = formatters.formatForNewRelic(sampleMetrics);
            const firstMetric = formatted.metrics[0];

            expect(firstMetric).toHaveProperty('name');
            expect(firstMetric).toHaveProperty('value');
            expect(firstMetric).toHaveProperty('timestamp');
        });

        test('should use rhythm_chamber prefix', () => {
            const formatted = formatters.formatForNewRelic(sampleMetrics);
            const firstMetric = formatted.metrics[0];

            expect(firstMetric.name).toMatch(/^rhythm_chamber\./);
        });
    });

    describe('formatLabels', () => {
        test('should format labels object to Prometheus format', () => {
            const labels = { env: 'prod', region: 'us-west' };
            const formatted = formatters.formatLabels(labels);

            expect(formatted).toBe('env="prod",region="us-west"');
        });

        test('should escape quotes in label values', () => {
            const labels = { message: 'Hello "World"' };
            const formatted = formatters.formatLabels(labels);

            expect(formatted).toBe('message="Hello \\"World\\""');
        });

        test('should handle empty labels', () => {
            const formatted = formatters.formatLabels({});
            expect(formatted).toBe('');
        });

        test('should sort labels alphabetically', () => {
            const labels = { z: '1', a: '2', m: '3' };
            const formatted = formatters.formatLabels(labels);

            expect(formatted).toBe('a="2",m="3",z="1"');
        });
    });

    describe('sanitizeMetricName', () => {
        test('should sanitize metric names for Prometheus', () => {
            const sanitized = formatters.sanitizeMetricName('invalid-name with spaces!');

            expect(sanitized).toBe('invalid_name_with_spaces_');
        });

        test('should ensure first character is valid', () => {
            const sanitized = formatters.sanitizeMetricName('123invalid');

            expect(sanitized).toBe('_123invalid');
        });

        test('should preserve valid characters', () => {
            const sanitized = formatters.sanitizeMetricName('valid_name_123');

            expect(sanitized).toBe('valid_name_123');
        });

        test('should handle colons and underscores', () => {
            const sanitized = formatters.sanitizeMetricName('metric:name_test');

            expect(sanitized).toBe('metric:name_test');
        });
    });

    describe('flattenMetrics', () => {
        test('should flatten nested metrics structure', () => {
            const nestedMetrics = {
                performance: {
                    measurements: [
                        { name: 'task1', duration: 100, category: 'perf', timestamp: Date.now() }
                    ]
                }
            };

            const flattened = formatters.flattenMetrics(nestedMetrics);

            expect(Array.isArray(flattened)).toBe(true);
            expect(flattened[0]).toHaveProperty('name');
            expect(flattened[0]).toHaveProperty('duration');
        });

        test('should include type field', () => {
            const flattened = formatters.flattenMetrics(sampleMetrics);

            expect(flattened.some(m => m.type === 'performance')).toBe(true);
            expect(flattened.some(m => m.type === 'web_vital')).toBe(true);
        });

        test('should handle empty metrics', () => {
            const flattened = formatters.flattenMetrics({});

            expect(flattened).toEqual([]);
        });
    });

    describe('escapeCSVValue', () => {
        test('should escape double quotes by doubling', () => {
            const escaped = formatters.escapeCSVValue('value "with" quotes');

            expect(escaped).toBe('"value ""with"" quotes"');
        });

        test('should wrap values in double quotes', () => {
            const escaped = formatters.escapeCSVValue('simple value');

            expect(escaped).toBe('"simple value"');
        });

        test('should handle null values', () => {
            const escaped = formatters.escapeCSVValue(null);

            expect(escaped).toBe('');
        });

        test('should convert numbers to strings', () => {
            const escaped = formatters.escapeCSVValue(42);

            expect(escaped).toBe('"42"');
        });
    });

    describe('getMimeType', () => {
        test('should return correct MIME types', () => {
            expect(formatters.getMimeType('json')).toBe('application/json');
            expect(formatters.getMimeType('csv')).toBe('text/csv');
            expect(formatters.getMimeType('prometheus')).toBe('text/plain');
            expect(formatters.getMimeType('influxdb')).toBe('text/plain');
        });

        test('should return text/plain for unknown formats', () => {
            expect(formatters.getMimeType('unknown')).toBe('text/plain');
        });
    });

    describe('getFileExtension', () => {
        test('should return correct file extensions', () => {
            expect(formatters.getFileExtension('json')).toBe('json');
            expect(formatters.getFileExtension('csv')).toBe('csv');
            expect(formatters.getFileExtension('prometheus')).toBe('prom');
            expect(formatters.getFileExtension('influxdb')).toBe('txt');
        });

        test('should return txt for unknown formats', () => {
            expect(formatters.getFileExtension('unknown')).toBe('txt');
        });
    });

    describe('formatTimestamp', () => {
        test('should format timestamp as ISO string', () => {
            const timestamp = Date.now();
            const formatted = formatters.formatTimestamp(timestamp);

            expect(typeof formatted).toBe('string');
            expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        });

        test('should handle Date objects', () => {
            const date = new Date();
            const formatted = formatters.formatTimestamp(date);

            expect(typeof formatted).toBe('string');
        });
    });

    describe('format', () => {
        test('should delegate to correct formatter', () => {
            const json = formatters.format(sampleMetrics, 'json');
            expect(JSON.parse(json)).toEqual(sampleMetrics);

            const csv = formatters.format(sampleMetrics, 'csv');
            expect(typeof csv).toBe('string');
            expect(csv).toContain('timestamp');

            const prometheus = formatters.format(sampleMetrics, 'prometheus');
            expect(prometheus).toContain('# HELP');
        });

        test('should throw error for unsupported format', () => {
            expect(() => {
                formatters.format(sampleMetrics, 'unsupported');
            }).toThrow('Unsupported export format: unsupported');
        });
    });
});
