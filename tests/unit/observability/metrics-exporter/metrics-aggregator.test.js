/**
 * Tests for metrics-aggregator.js
 *
 * Tests data aggregation logic including:
 * - Aggregating metrics from multiple sources
 * - Calculating statistics (mean, median, percentiles)
 * - Time-window aggregation
 */

import { describe, it, test, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { MetricsAggregator } from '../../../../js/observability/metrics-exporter/metrics-aggregator.js';

describe('MetricsAggregator', () => {
    let aggregator;

    beforeEach(() => {
        aggregator = new MetricsAggregator();
    });

    describe('constructor', () => {
        test('should create instance with default options', () => {
            expect(aggregator).toBeInstanceOf(MetricsAggregator);
            expect(aggregator._windowSize).toBe(60000); // 1 minute default
            expect(aggregator._metricsBuffer).toEqual([]);
        });

        test('should accept custom window size', () => {
            const customAggregator = new MetricsAggregator({ windowSize: 120000 });
            expect(customAggregator._windowSize).toBe(120000);
        });
    });

    describe('aggregateMetrics', () => {
        test('should aggregate metrics from multiple sources', () => {
            const metrics = {
                performance: {
                    measurements: [
                        { name: 'task1', duration: 100, timestamp: Date.now() },
                        { name: 'task2', duration: 200, timestamp: Date.now() }
                    ]
                },
                webVitals: {
                    vitals: {
                        LCP: { latest: { value: 2500, rating: 'good' } },
                        FID: { latest: { value: 50, rating: 'good' } }
                    }
                }
            };

            const aggregated = aggregator.aggregateMetrics(metrics);

            expect(aggregated).toHaveProperty('performance');
            expect(aggregated).toHaveProperty('webVitals');
            expect(aggregated.performance.count).toBe(2);
        });

        test('should handle empty metrics', () => {
            const aggregated = aggregator.aggregateMetrics({});
            expect(aggregated).toEqual({
                performance: { count: 0, total: 0, statistics: null },
                webVitals: { count: 0 },
                memory: { count: 0 }
            });
        });

        test('should filter by categories when provided', () => {
            const metrics = {
                performance: {
                    measurements: [
                        { name: 'task1', duration: 100, category: 'cat1', timestamp: Date.now() },
                        { name: 'task2', duration: 200, category: 'cat2', timestamp: Date.now() }
                    ]
                }
            };

            const aggregated = aggregator.aggregateMetrics(metrics, { categories: ['cat1'] });

            expect(aggregated.performance.count).toBe(1);
        });
    });

    describe('calculateStatistics', () => {
        test('should calculate mean for numeric array', () => {
            const values = [10, 20, 30, 40, 50];
            const stats = aggregator.calculateStatistics(values);

            expect(stats.mean).toBe(30);
            expect(stats.min).toBe(10);
            expect(stats.max).toBe(50);
            expect(stats.count).toBe(5);
        });

        test('should calculate median for odd-length array', () => {
            const values = [10, 20, 30, 40, 50];
            const stats = aggregator.calculateStatistics(values);

            expect(stats.median).toBe(30);
        });

        test('should calculate median for even-length array', () => {
            const values = [10, 20, 30, 40];
            const stats = aggregator.calculateStatistics(values);

            expect(stats.median).toBe(25); // (20 + 30) / 2
        });

        test('should calculate percentiles', () => {
            const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const stats = aggregator.calculateStatistics(values, [50, 90, 95]);

            expect(stats.percentiles[50]).toBe(5.5);
            expect(stats.percentiles[90]).toBeCloseTo(9.1, 1);
            expect(stats.percentiles[95]).toBeCloseTo(9.6, 1);
        });

        test('should calculate standard deviation', () => {
            const values = [2, 4, 4, 4, 5, 5, 7, 9];
            const stats = aggregator.calculateStatistics(values);

            expect(stats.stdDev).toBeCloseTo(2, 0);
        });

        test('should handle empty array', () => {
            const stats = aggregator.calculateStatistics([]);

            expect(stats).toEqual({
                count: 0,
                mean: 0,
                median: 0,
                min: 0,
                max: 0,
                stdDev: 0,
                percentiles: {}
            });
        });

        test('should handle single value', () => {
            const values = [42];
            const stats = aggregator.calculateStatistics(values);

            expect(stats.mean).toBe(42);
            expect(stats.median).toBe(42);
            expect(stats.min).toBe(42);
            expect(stats.max).toBe(42);
            expect(stats.stdDev).toBe(0);
        });
    });

    describe('aggregateByTimeWindow', () => {
        beforeAll(() => {
            jest.useFakeTimers();
        });

        afterAll(() => {
            jest.useRealTimers();
        });

        test('should aggregate metrics within time window', () => {
            const now = Date.now();
            const metrics = [
                { value: 10, timestamp: now - 30000 },
                { value: 20, timestamp: now - 20000 },
                { value: 30, timestamp: now - 10000 },
                { value: 40, timestamp: now } // Within window
            ];

            const aggregated = aggregator.aggregateByTimeWindow(metrics, now);

            expect(aggregated).toHaveLength(4);
            expect(aggregated[3].value).toBe(40);
        });

        test('should exclude metrics outside time window', () => {
            const now = Date.now();
            const metrics = [
                { value: 10, timestamp: now - 120000 }, // Outside 60s window
                { value: 20, timestamp: now - 30000 },
                { value: 30, timestamp: now }
            ];

            const aggregated = aggregator.aggregateByTimeWindow(metrics, now, 60000);

            expect(aggregated).toHaveLength(2);
            expect(aggregated.every(m => m.value !== 10)).toBe(true);
        });

        test('should calculate statistics for time window', () => {
            const now = Date.now();
            const metrics = [
                { value: 10, timestamp: now - 30000 },
                { value: 20, timestamp: now - 20000 },
                { value: 30, timestamp: now }
            ];

            const aggregated = aggregator.aggregateByTimeWindow(metrics, now);

            expect(aggregated.statistics.mean).toBe(20);
            expect(aggregated.statistics.count).toBe(3);
        });
    });

    describe('mergeMetrics', () => {
        test('should merge multiple metric arrays', () => {
            const metrics1 = [
                { name: 'task1', duration: 100 },
                { name: 'task2', duration: 200 }
            ];
            const metrics2 = [
                { name: 'task3', duration: 150 },
                { name: 'task4', duration: 250 }
            ];

            const merged = aggregator.mergeMetrics([metrics1, metrics2]);

            expect(merged).toHaveLength(4);
            expect(merged).toContainEqual(metrics1[0]);
            expect(merged).toContainEqual(metrics2[0]);
        });

        test('should handle empty arrays', () => {
            const merged = aggregator.mergeMetrics([[], []]);
            expect(merged).toEqual([]);
        });

        test('should handle single array', () => {
            const metrics = [{ name: 'task1', duration: 100 }];
            const merged = aggregator.mergeMetrics([metrics]);

            expect(merged).toEqual(metrics);
        });

        test('should remove duplicates based on timestamp', () => {
            const now = Date.now();
            const metrics1 = [{ name: 'task1', duration: 100, timestamp: now }];
            const metrics2 = [{ name: 'task1', duration: 100, timestamp: now }];

            const merged = aggregator.mergeMetrics([metrics1, metrics2]);

            expect(merged).toHaveLength(1);
        });
    });

    describe('filterMetrics', () => {
        test('should filter by category', () => {
            const metrics = [
                { category: 'performance', value: 100 },
                { category: 'memory', value: 200 },
                { category: 'performance', value: 150 }
            ];

            const filtered = aggregator.filterMetrics(metrics, { category: 'performance' });

            expect(filtered).toHaveLength(2);
            expect(filtered.every(m => m.category === 'performance')).toBe(true);
        });

        test('should filter by name pattern', () => {
            const metrics = [
                { name: 'task_load', value: 100 },
                { name: 'task_save', value: 200 },
                { name: 'other_task', value: 150 }
            ];

            const filtered = aggregator.filterMetrics(metrics, { namePattern: /^task_/ });

            expect(filtered).toHaveLength(2);
        });

        test('should filter by value range', () => {
            const metrics = [
                { value: 50 },
                { value: 100 },
                { value: 150 },
                { value: 200 }
            ];

            const filtered = aggregator.filterMetrics(metrics, { minValue: 100, maxValue: 150 });

            expect(filtered).toHaveLength(2);
            expect(filtered.every(m => m.value >= 100 && m.value <= 150)).toBe(true);
        });

        test('should combine multiple filters', () => {
            const metrics = [
                { category: 'performance', name: 'task_a', value: 100 },
                { category: 'performance', name: 'task_b', value: 200 },
                { category: 'memory', name: 'task_a', value: 100 }
            ];

            const filtered = aggregator.filterMetrics(metrics, {
                category: 'performance',
                minValue: 150
            });

            expect(filtered).toHaveLength(1);
            expect(filtered[0].name).toBe('task_b');
        });
    });

    describe('bufferMetrics', () => {
        beforeAll(() => {
            jest.useFakeTimers();
        });

        afterAll(() => {
            jest.useRealTimers();
        });

        test('should add metrics to buffer', () => {
            const metric = { name: 'task1', duration: 100 };
            aggregator.bufferMetrics(metric);

            expect(aggregator._metricsBuffer).toHaveLength(1);
            expect(aggregator._metricsBuffer[0]).toEqual(metric);
        });

        test('should add timestamp if not provided', () => {
            const metric = { name: 'task1', duration: 100 };
            aggregator.bufferMetrics(metric);

            expect(aggregator._metricsBuffer[0]).toHaveProperty('timestamp');
        });

        test('should prune old metrics from buffer', () => {
            const now = Date.now();
            aggregator.bufferMetrics({ name: 'old', duration: 50, timestamp: now - 120000 });
            aggregator.bufferMetrics({ name: 'new', duration: 100, timestamp: now - 30000 });

            aggregator.pruneBuffer(now);

            expect(aggregator._metricsBuffer).toHaveLength(1);
            expect(aggregator._metricsBuffer[0].name).toBe('new');
        });

        test('should clear buffer', () => {
            aggregator.bufferMetrics({ name: 'task1', duration: 100 });
            aggregator.bufferMetrics({ name: 'task2', duration: 200 });

            aggregator.clearBuffer();

            expect(aggregator._metricsBuffer).toHaveLength(0);
        });
    });

    describe('getBufferedMetrics', () => {
        test('should return all buffered metrics', () => {
            aggregator.bufferMetrics({ name: 'task1', duration: 100 });
            aggregator.bufferMetrics({ name: 'task2', duration: 200 });

            const buffered = aggregator.getBufferedMetrics();

            expect(buffered).toHaveLength(2);
        });

        test('should return copy of buffer', () => {
            aggregator.bufferMetrics({ name: 'task1', duration: 100 });
            const buffered = aggregator.getBufferedMetrics();

            buffered.push({ name: 'task2', duration: 200 });

            expect(aggregator._metricsBuffer).toHaveLength(1);
        });
    });

    describe('calculatePercentile', () => {
        test('should calculate 50th percentile (median)', () => {
            const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const p50 = aggregator.calculatePercentile(values, 50);

            expect(p50).toBe(5.5);
        });

        test('should calculate 90th percentile', () => {
            const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const p90 = aggregator.calculatePercentile(values, 90);

            expect(p90).toBeCloseTo(9.1, 1);
        });

        test('should calculate 95th percentile', () => {
            const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const p95 = aggregator.calculatePercentile(values, 95);

            expect(p95).toBeCloseTo(9.6, 1);
        });

        test('should calculate 99th percentile', () => {
            const values = Array.from({ length: 100 }, (_, i) => i + 1);
            const p99 = aggregator.calculatePercentile(values, 99);

            expect(p99).toBeCloseTo(99.35, 1);
        });

        test('should handle empty array', () => {
            const p50 = aggregator.calculatePercentile([], 50);
            expect(p50).toBe(0);
        });
    });

    describe('formatAggregatedMetrics', () => {
        test('should format aggregated metrics for export', () => {
            const aggregated = {
                performance: {
                    count: 10,
                    total: 1000,
                    statistics: {
                        mean: 100,
                        median: 95,
                        min: 50,
                        max: 150
                    }
                }
            };

            const formatted = aggregator.formatAggregatedMetrics(aggregated);

            expect(formatted).toHaveProperty('timestamp');
            expect(formatted.performance.summary.mean).toBe(100);
            expect(formatted.performance.summary.count).toBe(10);
        });

        test('should include metadata', () => {
            const aggregated = {
                performance: { count: 5 }
            };

            const formatted = aggregator.formatAggregatedMetrics(aggregated, {
                source: 'test',
                version: '1.0.0'
            });

            expect(formatted.metadata).toEqual({
                source: 'test',
                version: '1.0.0'
            });
        });
    });
});
