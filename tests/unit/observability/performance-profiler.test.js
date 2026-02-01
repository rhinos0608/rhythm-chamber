/**
 * Enhanced Performance Profiler Tests
 *
 * Comprehensive test suite for enhanced Performance Profiler functionality.
 * Tests memory profiling, performance budgets, degradation detection, and comprehensive reporting.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PerformanceProfiler,
  PerformanceCategory,
} from '../../../js/services/performance-profiler.js';

// Mock performance API with measure entry simulation
const mockPerformanceAPI = () => {
  const mockEntries = [];

  global.performance = {
    mark: vi.fn(),
    measure: vi.fn(name => {
      // Create a mock measure entry
      mockEntries.push({
        name,
        startTime: 0,
        duration: Math.random() * 100 + 10, // Random duration between 10-110ms
        entryType: 'measure',
      });
    }),
    getEntriesByName: vi.fn(name => {
      // Return entries matching the name
      return mockEntries.filter(e => e.name === name);
    }),
    getEntriesByType: vi.fn(() => []),
    now: vi.fn(() => Date.now()),
    memory: {
      usedJSHeapSize: 50000000, // 50MB
      totalJSHeapSize: 100000000, // 100MB
      jsHeapSizeLimit: 200000000, // 200MB
    },
    clearMarks: vi.fn(),
    clearMeasures: vi.fn(() => {
      // Clear all mock entries
      mockEntries.length = 0;
    }),
  };
};

describe('Enhanced PerformanceProfiler', () => {
  let profiler;

  beforeEach(() => {
    mockPerformanceAPI();
    profiler = new PerformanceProfiler({ enabled: true, maxMeasurements: 100 });
  });

  afterEach(() => {
    if (profiler) {
      profiler.clearMeasurements();
      profiler.clearDegradationAlerts();
    }
    vi.clearAllMocks();
  });

  describe('Memory Profiling', () => {
    it('should take memory snapshot', () => {
      const snapshot = profiler.takeMemorySnapshot();

      expect(snapshot).toBeDefined();
      expect(snapshot.id).toBeDefined();
      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.usedJSHeapSize).toBe(50000000);
      expect(snapshot.totalJSHeapSize).toBe(100000000);
      expect(snapshot.jsHeapSizeLimit).toBe(200000000);
      expect(snapshot.usagePercentage).toBe(25); // 50/200 = 25%
    });

    it('should calculate memory usage percentage correctly', () => {
      const snapshot = profiler.takeMemorySnapshot();
      const expectedPercentage = (50000000 / 200000000) * 100;

      expect(snapshot.usagePercentage).toBe(expectedPercentage);
    });

    it('should store memory snapshots with pruning', () => {
      const maxSnapshots = 5;
      const smallProfiler = new PerformanceProfiler({
        enabled: true,
        maxMeasurements: 10,
        maxSnapshots,
      });

      // Take more snapshots than limit
      for (let i = 0; i < 10; i++) {
        smallProfiler.takeMemorySnapshot({ snapshot: i });
      }

      // Check that old snapshots were pruned
      const snapshots = smallProfiler._memorySnapshots;
      expect(snapshots.length).toBeLessThanOrEqual(maxSnapshots);

      smallProfiler.disable();
    });

    it('should get memory statistics', () => {
      profiler.takeMemorySnapshot();
      profiler.takeMemorySnapshot();
      profiler.takeMemorySnapshot();

      const stats = profiler.getMemoryStatistics();

      expect(stats).toBeDefined();
      expect(stats.snapshotCount).toBe(3);
      expect(stats.currentUsage).toBeDefined();
      expect(stats.averageUsage).toBeDefined();
      expect(stats.peakUsage).toBeDefined();
      expect(stats.usageTrend).toBeDefined();
    });

    it('should detect memory usage trend', () => {
      // Take snapshots with increasing usage
      for (let i = 0; i < 5; i++) {
        profiler.takeMemorySnapshot();
      }

      const stats = profiler.getMemoryStatistics();

      expect(stats.usageTrend).toBe('stable'); // Should be stable for flat values
    });
  });

  describe('Performance Budgets', () => {
    it('should set performance budget for category', () => {
      profiler.setPerformanceBudget(PerformanceCategory.COMPUTATION, {
        threshold: 500,
        action: 'warn',
        degradationThreshold: 50,
      });

      const budget = profiler._performanceBudgets.get(PerformanceCategory.COMPUTATION);

      expect(budget).toBeDefined();
      expect(budget.threshold).toBe(500);
      expect(budget.action).toBe('warn');
    });

    it('should create degradation alert when budget exceeded', () => {
      profiler.setPerformanceBudget(PerformanceCategory.STORAGE, {
        threshold: 100,
        action: 'error',
        degradationThreshold: 50,
      });

      // Create measurement that exceeds budget
      const measurement = {
        id: 'test-measurement',
        name: 'slow-operation',
        category: PerformanceCategory.STORAGE,
        duration: 200, // Exceeds 100ms threshold
        timestamp: Date.now(),
        metadata: {},
      };

      profiler._checkPerformanceBudget(measurement);

      const alerts = profiler.getDegradationAlerts();
      const budgetAlert = alerts.find(a => a.category === PerformanceCategory.STORAGE);

      expect(budgetAlert).toBeDefined();
      expect(budgetAlert.severity).toBe('critical');
      expect(budgetAlert.message).toContain('budget exceeded');
    });
  });

  describe('Performance Degradation Detection', () => {
    it('should establish performance baseline', () => {
      // Create some measurements first
      for (let i = 0; i < 15; i++) {
        profiler.startOperation(`baseline-test-${i}`, {
          category: PerformanceCategory.COMPUTATION,
        })();

        profiler.measure(`baseline-test-${i}`, 'mark1', 'mark2', {
          category: PerformanceCategory.COMPUTATION,
        });
      }

      profiler.establishBaseline(PerformanceCategory.COMPUTATION, 10);

      const baseline = profiler._baselinePerformance.get(PerformanceCategory.COMPUTATION);

      expect(baseline).toBeDefined();
      expect(baseline.length).toBe(10);
    });

    it('should detect performance degradation', () => {
      // Set up baseline
      for (let i = 0; i < 10; i++) {
        const measurement = {
          id: `baseline-${i}`,
          name: 'fast-operation',
          category: PerformanceCategory.COMPUTATION,
          duration: 100, // Fast baseline
          timestamp: Date.now(),
          metadata: {},
        };
        profiler._storeMeasurement(measurement);
      }

      profiler.establishBaseline(PerformanceCategory.COMPUTATION, 10);

      // Create degraded measurement (75% slower than baseline)
      const degradedMeasurement = {
        id: 'degraded',
        name: 'slow-operation',
        category: PerformanceCategory.COMPUTATION,
        duration: 175, // 75% slower than 100ms baseline
        timestamp: Date.now(),
        metadata: {},
      };

      profiler._checkPerformanceDegradation(degradedMeasurement);

      const alerts = profiler.getDegradationAlerts();
      const degradationAlert = alerts.find(a => a.category === PerformanceCategory.COMPUTATION);

      expect(degradationAlert).toBeDefined();
      expect(degradationAlert.severity).toBe('warning');
      expect(degradationAlert.message).toContain('degradation detected');
    });

    it('should create critical alert for severe degradation', () => {
      // Set up baseline
      for (let i = 0; i < 10; i++) {
        const measurement = {
          id: `baseline-${i}`,
          name: 'fast-operation',
          category: PerformanceCategory.CHAT,
          duration: 100,
          timestamp: Date.now(),
          metadata: {},
        };
        profiler._storeMeasurement(measurement);
      }

      profiler.establishBaseline(PerformanceCategory.CHAT, 10);

      // Create severely degraded measurement (150% slower)
      const severelyDegraded = {
        id: 'severely-degraded',
        name: 'very-slow-operation',
        category: PerformanceCategory.CHAT,
        duration: 250, // 150% slower than 100ms baseline
        timestamp: Date.now(),
        metadata: {},
      };

      profiler._checkPerformanceDegradation(severelyDegraded);

      const alerts = profiler.getDegradationAlerts();
      const criticalAlert = alerts.find(a => a.severity === 'critical');

      expect(criticalAlert).toBeDefined();
    });
  });

  describe('Memory Degradation Detection', () => {
    it('should detect high memory usage', () => {
      // Mock high memory usage
      performance.memory = {
        usedJSHeapSize: 170000000, // 170MB
        totalJSHeapSize: 180000000,
        jsHeapSizeLimit: 200000000, // 200MB
      };

      // Create several snapshots to establish average
      for (let i = 0; i < 10; i++) {
        performance.memory.usedJSHeapSize = 160000000 + i * 1000000;
        profiler.takeMemorySnapshot({ automatic: true });
      }

      // Take final snapshot that exceeds threshold
      performance.memory.usedJSHeapSize = 170000000;
      const snapshot = profiler.takeMemorySnapshot();

      const alerts = profiler.getDegradationAlerts();
      const memoryAlerts = alerts.filter(a => a.category === 'memory');

      expect(memoryAlerts.length).toBeGreaterThan(0);
      expect(memoryAlerts[0].message).toContain('High memory usage');
    });
  });

  describe('Comprehensive Performance Report', () => {
    it('should generate comprehensive report', () => {
      // Add some test data
      profiler.takeMemorySnapshot();
      const stopOp = profiler.startOperation('test-operation', {
        category: PerformanceCategory.PATTERN_DETECTION,
      });
      stopOp();

      const report = profiler.getComprehensiveReport();

      expect(report).toBeDefined();
      expect(report.timestamp).toBeDefined();
      expect(report.enabled).toBe(true);
      expect(report.totalMeasurements).toBeGreaterThan(0);
      expect(report.memory).toBeDefined();
      expect(report.degradation).toBeDefined();
      expect(report.budgets).toBeDefined();
      expect(report.memorySnapshots).toBeDefined();
    });

    it('should include degradation statistics in report', () => {
      // Create a degradation alert
      profiler.setPerformanceBudget(PerformanceCategory.EMBEDDING_GENERATION, {
        threshold: 100,
        action: 'warn',
      });

      const measurement = {
        id: 'slow-embed',
        name: 'slow-embedding',
        category: PerformanceCategory.EMBEDDING_GENERATION,
        duration: 200,
        timestamp: Date.now(),
        metadata: {},
      };

      profiler._checkPerformanceBudget(measurement);

      const report = profiler.getComprehensiveReport();

      expect(report.degradation).toBeDefined();
      expect(report.degradation.alerts).toBeDefined();
      expect(report.degradation.criticalCount).toBeDefined();
      expect(report.degradation.warningCount).toBeDefined();
    });

    it('should include budget status in report', () => {
      profiler.setPerformanceBudget(PerformanceCategory.UI_RENDERING, {
        threshold: 50,
        action: 'error',
      });

      // Add measurements
      for (let i = 0; i < 5; i++) {
        const measurement = {
          id: `ui-op-${i}`,
          name: 'ui-operation',
          category: PerformanceCategory.UI_RENDERING,
          duration: 30 + i * 10,
          timestamp: Date.now(),
          metadata: {},
        };
        profiler._storeMeasurement(measurement);
      }

      const report = profiler.getComprehensiveReport();

      expect(report.budgets).toBeDefined();
      expect(report.budgets[PerformanceCategory.UI_RENDERING]).toBeDefined();
    });
  });

  describe('Degradation Alert Management', () => {
    it('should get degradation alerts by severity', () => {
      // Add test alerts
      const criticalAlert = {
        id: 'critical-1',
        severity: 'critical',
        message: 'Critical issue',
        category: PerformanceCategory.COMPUTATION,
        timestamp: Date.now(),
        details: {},
      };

      const warningAlert = {
        id: 'warning-1',
        severity: 'warning',
        message: 'Warning issue',
        category: PerformanceCategory.STORAGE,
        timestamp: Date.now(),
        details: {},
      };

      profiler._addDegradationAlert(criticalAlert);
      profiler._addDegradationAlert(warningAlert);

      const criticalAlerts = profiler.getDegradationAlerts('critical');
      const warningAlerts = profiler.getDegradationAlerts('warning');

      expect(criticalAlerts.length).toBe(1);
      expect(warningAlerts.length).toBe(1);
      expect(criticalAlerts[0].severity).toBe('critical');
    });

    it('should clear degradation alerts', () => {
      // Add test alert
      const alert = {
        id: 'test-alert',
        severity: 'warning',
        message: 'Test alert',
        category: PerformanceCategory.CHAT,
        timestamp: Date.now(),
        details: {},
      };

      profiler._addDegradationAlert(alert);

      expect(profiler.getDegradationAlerts().length).toBe(1);

      profiler.clearDegradationAlerts();

      expect(profiler.getDegradationAlerts().length).toBe(0);
    });

    it('should prune old alerts when exceeding max', () => {
      const maxAlerts = 5;
      const smallProfiler = new PerformanceProfiler({
        enabled: true,
        maxMeasurements: 10,
        maxDegradationAlerts: maxAlerts,
      });

      // Add more alerts than limit
      for (let i = 0; i < 10; i++) {
        const alert = {
          id: `alert-${i}`,
          severity: 'warning',
          message: `Alert ${i}`,
          category: PerformanceCategory.COMPUTATION,
          timestamp: Date.now(),
          details: {},
        };
        smallProfiler._addDegradationAlert(alert);
      }

      const alerts = smallProfiler.getDegradationAlerts();
      expect(alerts.length).toBeLessThanOrEqual(maxAlerts);

      smallProfiler.disable();
    });
  });

  describe('Memory Profiling Control', () => {
    it('should enable memory profiling', () => {
      profiler.disableMemoryProfiling();
      profiler.enableMemoryProfiling();

      expect(profiler._memoryProfilingEnabled).toBe(true);
    });

    it('should disable memory profiling', () => {
      profiler.disableMemoryProfiling();

      expect(profiler._memoryProfilingEnabled).toBe(false);
    });

    it('should start automatic memory profiling interval', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval').mockReturnValue(12345);

      const stopFunction = profiler.startMemoryProfiling(10000);

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 10000);
      expect(typeof stopFunction).toBe('function');

      // Test stop function
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      stopFunction();
      expect(clearIntervalSpy).toHaveBeenCalledWith(12345);

      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    });

    it('should clear memory snapshots', () => {
      profiler.takeMemorySnapshot();
      profiler.takeMemorySnapshot();

      expect(profiler._memorySnapshots.length).toBeGreaterThan(0);

      profiler.clearMemorySnapshots();

      expect(profiler._memorySnapshots.length).toBe(0);
    });
  });

  describe('Statistics Calculation', () => {
    it('should calculate percentiles correctly', () => {
      // Add test measurements
      const durations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

      durations.forEach(duration => {
        const measurement = {
          id: `test-${duration}`,
          name: 'test-operation',
          category: PerformanceCategory.COMPUTATION,
          duration,
          timestamp: Date.now(),
          metadata: {},
        };
        profiler._storeMeasurement(measurement);
      });

      const stats = profiler.getStatistics(PerformanceCategory.COMPUTATION);

      expect(stats.count).toBe(10);
      expect(stats.minDuration).toBe(10);
      expect(stats.maxDuration).toBe(100);
      expect(stats.avgDuration).toBe(55); // (10+20+...+100) / 10
      expect(stats.medianDuration).toBe(55); // Average of middle values (50 + 60) / 2
      expect(stats.p95Duration).toBe(90); // 95th percentile
      expect(stats.p99Duration).toBe(100); // 99th percentile
    });

    it('should return zeros for empty measurements', () => {
      const stats = profiler.getStatistics(PerformanceCategory.EMBEDDING_GENERATION);

      expect(stats.count).toBe(0);
      expect(stats.totalDuration).toBe(0);
      expect(stats.avgDuration).toBe(0);
      expect(stats.minDuration).toBe(0);
      expect(stats.maxDuration).toBe(0);
    });
  });
});
