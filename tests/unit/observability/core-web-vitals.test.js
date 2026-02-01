/**
 * Core Web Vitals Tests
 *
 * Comprehensive test suite for Core Web Vitals tracking functionality.
 * Tests metric collection, performance rating calculations, and export functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CoreWebVitalsTracker,
  WebVitalType,
  PerformanceRating,
} from '../../../js/observability/core-web-vitals.js';

// Mock performance API
const mockPerformanceAPI = () => {
  global.performance = {
    mark: vi.fn(),
    measure: vi.fn(),
    getEntriesByName: vi.fn(() => []),
    getEntriesByType: vi.fn(() => []),
  };

  // Add PerformanceEventTiming to window (required by _trackINP)
  global.window.PerformanceEventTiming = class PerformanceEventTiming {};

  // Create a proper mock class for PerformanceObserver
  global.PerformanceObserver = vi.fn(function (callback) {
    this.observe = vi.fn();
    this.disconnect = vi.fn();
  });
};

describe('CoreWebVitalsTracker', () => {
  let tracker;

  beforeEach(() => {
    mockPerformanceAPI();
    tracker = new CoreWebVitalsTracker({ enabled: true, maxMetrics: 100 });
  });

  afterEach(() => {
    if (tracker) {
      tracker.disable();
    }
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default options', () => {
      expect(tracker).toBeDefined();
      expect(tracker.isEnabled()).toBe(true);
    });

    it('should initialize with custom options', () => {
      const customTracker = new CoreWebVitalsTracker({
        enabled: true,
        maxMetrics: 50,
      });

      expect(customTracker.isEnabled()).toBe(true);
      customTracker.disable();
    });

    it('should initialize disabled when Performance API unavailable', () => {
      delete global.performance;
      const disabledTracker = new CoreWebVitalsTracker({ enabled: true });

      expect(disabledTracker.isEnabled()).toBe(false);
    });
  });

  describe('Metric Collection', () => {
    it('should track CLS (Cumulative Layout Shift) metrics', () => {
      const clsEntry = {
        entryType: 'layout-shift',
        hadRecentInput: false,
        value: 0.05,
        startTime: 1000,
      };

      // Simulate CLS tracking
      tracker._trackCLS(clsEntry);

      const clsMetric = tracker.getLatestMetric(WebVitalType.CLS);
      expect(clsMetric).toBeDefined();
      expect(clsMetric.type).toBe(WebVitalType.CLS);
      expect(clsMetric.value).toBe(0.05);
    });

    it('should track FID (First Input Delay) metrics', () => {
      const fidEntry = {
        entryType: 'first-input',
        name: 'click',
        startTime: 1000,
        processingStart: 1050,
        processingEnd: 1055,
        duration: 55,
      };

      // Simulate FID tracking
      tracker._trackFID(fidEntry);

      const fidMetric = tracker.getLatestMetric(WebVitalType.FID);
      expect(fidMetric).toBeDefined();
      expect(fidMetric.type).toBe(WebVitalType.FID);
      expect(fidMetric.value).toBe(50); // processingStart - startTime
    });

    it('should track LCP (Largest Contentful Paint) metrics', () => {
      const lcpEntry = {
        entryType: 'largest-contentful-paint',
        startTime: 2000,
        renderTime: 2000,
        loadTime: 2000,
        element: { tagName: 'IMG' },
        size: 100000,
      };

      // Simulate LCP tracking
      tracker._trackLCP(lcpEntry);

      const lcpMetric = tracker.getLatestMetric(WebVitalType.LCP);
      expect(lcpMetric).toBeDefined();
      expect(lcpMetric.type).toBe(WebVitalType.LCP);
      expect(lcpMetric.value).toBe(2000);
    });

    it('should track TTFB (Time to First Byte) metrics', () => {
      const navEntry = {
        entryType: 'navigation',
        requestStart: 500,
        responseStart: 700,
        domComplete: 1500,
        loadEventEnd: 1600,
      };

      // Mock performance.getEntriesByType to return our nav entry BEFORE tracking
      performance.getEntriesByType = vi.fn(() => [navEntry]);

      // Simulate TTFB tracking
      tracker._trackTTFB();

      const ttfbMetric = tracker.getLatestMetric(WebVitalType.TTFB);
      expect(ttfbMetric).toBeDefined();
      expect(ttfbMetric.type).toBe(WebVitalType.TTFB);
    });
  });

  describe('Performance Rating Calculation', () => {
    it('should rate CLS as good when value is 0.05', () => {
      const rating = tracker._calculateRating(WebVitalType.CLS, 0.05);
      expect(rating).toBe(PerformanceRating.GOOD.value);
    });

    it('should rate CLS as needs improvement when value is 0.15', () => {
      const rating = tracker._calculateRating(WebVitalType.CLS, 0.15);
      expect(rating).toBe(PerformanceRating.NEEDS_IMPROVEMENT.value);
    });

    it('should rate CLS as poor when value is 0.3', () => {
      const rating = tracker._calculateRating(WebVitalType.CLS, 0.3);
      expect(rating).toBe(PerformanceRating.POOR.value);
    });

    it('should rate FID as good when value is 50ms', () => {
      const rating = tracker._calculateRating(WebVitalType.FID, 50);
      expect(rating).toBe(PerformanceRating.GOOD.value);
    });

    it('should rate FID as poor when value is 500ms', () => {
      const rating = tracker._calculateRating(WebVitalType.FID, 500);
      expect(rating).toBe(PerformanceRating.POOR.value);
    });

    it('should rate LCP as good when value is 2000ms', () => {
      const rating = tracker._calculateRating(WebVitalType.LCP, 2000);
      expect(rating).toBe(PerformanceRating.GOOD.value);
    });

    it('should rate LCP as poor when value is 5000ms', () => {
      const rating = tracker._calculateRating(WebVitalType.LCP, 5000);
      expect(rating).toBe(PerformanceRating.POOR.value);
    });
  });

  describe('Metric Storage and Retrieval', () => {
    it('should store and retrieve metrics by type', () => {
      const clsEntry = {
        entryType: 'layout-shift',
        hadRecentInput: false,
        value: 0.05,
        startTime: 1000,
      };

      tracker._trackCLS(clsEntry);

      const clsMetrics = tracker.getMetrics(WebVitalType.CLS);
      expect(clsMetrics).toBeDefined();
      expect(clsMetrics.length).toBeGreaterThan(0);
    });

    it('should return empty array for non-existent metric types', () => {
      const metrics = tracker.getMetrics('non_existent_type');
      expect(metrics).toEqual([]);
    });

    it('should limit stored metrics to maxMetrics', () => {
      const limitedTracker = new CoreWebVitalsTracker({
        enabled: true,
        maxMetrics: 5,
      });

      // Add more metrics than limit
      for (let i = 0; i < 10; i++) {
        const clsEntry = {
          entryType: 'layout-shift',
          hadRecentInput: false,
          value: 0.01 * i,
          startTime: 1000 + i,
        };
        limitedTracker._trackCLS(clsEntry);
      }

      const clsMetrics = limitedTracker.getMetrics(WebVitalType.CLS);
      expect(clsMetrics.length).toBeLessThanOrEqual(5);

      limitedTracker.disable();
    });
  });

  describe('Web Vitals Summary', () => {
    it('should generate comprehensive web vitals summary', () => {
      const summary = tracker.getWebVitalsSummary();

      expect(summary).toBeDefined();
      expect(summary.timestamp).toBeDefined();
      expect(summary.enabled).toBe(true);
      expect(summary.vitals).toBeDefined();
    });

    it('should include statistics for each vital type', () => {
      // Add some test metrics
      const clsEntry = {
        entryType: 'layout-shift',
        hadRecentInput: false,
        value: 0.05,
        startTime: 1000,
      };

      tracker._trackCLS(clsEntry);

      const summary = tracker.getWebVitalsSummary();
      const clsData = summary.vitals[WebVitalType.CLS];

      expect(clsData).toBeDefined();
      expect(clsData.count).toBeGreaterThan(0);
      expect(clsData.statistics).toBeDefined();
    });
  });

  describe('Export Functionality', () => {
    it('should export metrics as JSON', () => {
      const jsonExport = tracker.exportToJSON();

      expect(jsonExport).toBeDefined();
      expect(typeof jsonExport).toBe('string');

      const parsed = JSON.parse(jsonExport);
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.exportDate).toBeDefined();
      expect(parsed.metrics).toBeDefined();
      expect(parsed.summary).toBeDefined();
    });

    it('should include all metric types in export', () => {
      // Add test metrics
      const clsEntry = {
        entryType: 'layout-shift',
        hadRecentInput: false,
        value: 0.05,
        startTime: 1000,
      };

      tracker._trackCLS(clsEntry);

      const jsonExport = tracker.exportToJSON();
      const parsed = JSON.parse(jsonExport);

      expect(parsed.metrics[WebVitalType.CLS]).toBeDefined();
      expect(parsed.metrics[WebVitalType.CLS].length).toBeGreaterThan(0);
    });
  });

  describe('Enable/Disable Functionality', () => {
    it('should disable tracking', () => {
      tracker.disable();
      expect(tracker.isEnabled()).toBe(false);
    });

    it('should enable tracking', () => {
      tracker.disable();
      tracker.enable();
      expect(tracker.isEnabled()).toBe(true);
    });

    it('should disconnect PerformanceObserver when disabled', () => {
      const disconnectSpy = vi.fn();

      // Create a new tracker with the disconnect spy already in place
      const TestObserver = vi.fn(function (callback) {
        this.observe = vi.fn();
        this.disconnect = disconnectSpy;
      });
      global.PerformanceObserver = TestObserver;

      const testTracker = new CoreWebVitalsTracker({ enabled: true, maxMetrics: 100 });
      testTracker.disable();

      expect(disconnectSpy).toHaveBeenCalled();
    });
  });

  describe('Clear Metrics Functionality', () => {
    it('should clear all stored metrics', () => {
      // Add test metrics
      const clsEntry = {
        entryType: 'layout-shift',
        hadRecentInput: false,
        value: 0.05,
        startTime: 1000,
      };

      tracker._trackCLS(clsEntry);

      expect(tracker.getMetrics(WebVitalType.CLS).length).toBeGreaterThan(0);

      tracker.clearMetrics();

      expect(tracker.getMetrics(WebVitalType.CLS).length).toBe(0);
    });

    it('should clear latest metrics', () => {
      const clsEntry = {
        entryType: 'layout-shift',
        hadRecentInput: false,
        value: 0.05,
        startTime: 1000,
      };

      tracker._trackCLS(clsEntry);

      expect(tracker.getLatestMetric(WebVitalType.CLS)).toBeDefined();

      tracker.clearMetrics();

      expect(tracker.getLatestMetric(WebVitalType.CLS)).toBeNull();
    });
  });

  describe('Get Rating Color', () => {
    it('should return green color for good rating', () => {
      const color = tracker.getRatingColor(PerformanceRating.GOOD.value);
      expect(color).toBe(PerformanceRating.GOOD.color);
    });

    it('should return yellow color for needs-improvement rating', () => {
      const color = tracker.getRatingColor(PerformanceRating.NEEDS_IMPROVEMENT.value);
      expect(color).toBe(PerformanceRating.NEEDS_IMPROVEMENT.color);
    });

    it('should return red color for poor rating', () => {
      const color = tracker.getRatingColor(PerformanceRating.POOR.value);
      expect(color).toBe(PerformanceRating.POOR.color);
    });

    it('should return gray color for unknown rating', () => {
      const color = tracker.getRatingColor('unknown');
      expect(color).toBe('#666');
    });
  });
});
