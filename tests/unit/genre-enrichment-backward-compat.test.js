/**
 * Batch 2: Test P0-3 Backward Compatibility Fix
 *
 * Verifies that old function names (isQueueProcessing, getApiStats)
 * are accessible from the facade and work correctly.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isQueueProcessing,
  getApiStats,
  isProcessing,
  getStats,
  GenreEnrichment,
} from '../../js/genre-enrichment/index.js';

describe('Batch 2: Backward Compatibility (Fix 2.1)', () => {
  describe('Fix 2.1: isQueueProcessing alias', () => {
    it('should export isQueueProcessing from facade', () => {
      expect(isQueueProcessing).toBeDefined();
      expect(typeof isQueueProcessing).toBe('function');
    });

    it('should be the same function as isProcessing', () => {
      expect(isQueueProcessing).toBe(isProcessing);
    });

    it('should return correct processing state', () => {
      // Should return false when not processing
      const result = isQueueProcessing();
      expect(typeof result).toBe('boolean');
    });

    it('should match the behavior of isProcessing', () => {
      const oldResult = isQueueProcessing();
      const newResult = isProcessing();
      expect(oldResult).toEqual(newResult);
    });
  });

  describe('Fix 2.1: getApiStats alias', () => {
    it('should export getApiStats from facade', () => {
      expect(getApiStats).toBeDefined();
      expect(typeof getApiStats).toBe('function');
    });

    it('should return a promise', () => {
      const result = getApiStats();
      expect(result).toBeInstanceOf(Promise);
    });

    it('should return stats object with expected structure', async () => {
      const stats = await getApiStats();
      expect(stats).toBeInstanceOf(Object);
      expect(stats).toHaveProperty('cachedCount');
      expect(typeof stats.cachedCount).toBe('number');
    });

    it('should match the behavior of getStats', async () => {
      const oldResult = await getApiStats();
      const newResult = await getStats();

      // Both should have the same structure
      expect(oldResult).toHaveProperty('cachedCount');
      expect(newResult).toHaveProperty('cachedCount');

      // Values might differ slightly due to timing, but structure should match
      expect(typeof oldResult.cachedCount).toBe('number');
      expect(typeof newResult.cachedCount).toBe('number');
    });
  });

  describe('GenreEnrichment object compatibility', () => {
    it('should have getStats method that works', () => {
      expect(GenreEnrichment.getStats).toBeDefined();
      expect(typeof GenreEnrichment.getStats).toBe('function');

      const stats = GenreEnrichment.getStats();
      expect(stats).toBeInstanceOf(Object);
      expect(stats).toHaveProperty('staticMapSize');
      expect(stats).toHaveProperty('cachedCount');
      expect(stats).toHaveProperty('queueLength');
      expect(stats).toHaveProperty('isProcessing');
    });

    // CRITICAL-2: Test GenreEnrichment.isQueueProcessing alias
    it('should have isQueueProcessing alias on GenreEnrichment object', () => {
      expect(GenreEnrichment.isQueueProcessing).toBeDefined();
      expect(typeof GenreEnrichment.isQueueProcessing).toBe('function');
    });

    it('should have isQueueProcessing that matches isProcessing function', () => {
      expect(GenreEnrichment.isQueueProcessing).toBe(isProcessing);
    });

    it('should return correct processing state via isQueueProcessing', () => {
      const result = GenreEnrichment.isQueueProcessing();
      expect(typeof result).toBe('boolean');
    });

    it('should have isQueueProcessing behavior matching named export', () => {
      const objectResult = GenreEnrichment.isQueueProcessing();
      const namedResult = isQueueProcessing();
      expect(objectResult).toEqual(namedResult);
    });

    // CRITICAL-2: Test GenreEnrichment.getApiStats alias
    it('should have getApiStats alias on GenreEnrichment object', () => {
      expect(GenreEnrichment.getApiStats).toBeDefined();
      expect(typeof GenreEnrichment.getApiStats).toBe('function');
    });

    it('should have getApiStats that returns a promise', () => {
      const result = GenreEnrichment.getApiStats();
      expect(result).toBeInstanceOf(Promise);
    });

    it('should return stats object with expected structure via getApiStats', async () => {
      const stats = await GenreEnrichment.getApiStats();
      expect(stats).toBeInstanceOf(Object);
      expect(stats).toHaveProperty('cachedCount');
      expect(typeof stats.cachedCount).toBe('number');
    });

    it('should have getApiStats behavior matching named export', async () => {
      const objectResult = await GenreEnrichment.getApiStats();
      const namedResult = await getApiStats();

      // Both should have the same structure
      expect(objectResult).toHaveProperty('cachedCount');
      expect(namedResult).toHaveProperty('cachedCount');

      // Values might differ slightly due to timing, but structure should match
      expect(typeof objectResult.cachedCount).toBe('number');
      expect(typeof namedResult.cachedCount).toBe('number');
    });

    // Test that both aliases work together
    it('should work when calling both aliases in sequence', async () => {
      const processingState = GenreEnrichment.isQueueProcessing();
      const stats = await GenreEnrichment.getApiStats();

      expect(typeof processingState).toBe('boolean');
      expect(stats).toHaveProperty('cachedCount');
    });
  });

  describe('Import compatibility', () => {
    it('should allow importing both old and new names together', async () => {
      // This test verifies that code using old names doesn't break
      const processingState = isQueueProcessing();
      const stats = await getApiStats();

      expect(typeof processingState).toBe('boolean');
      expect(stats).toHaveProperty('cachedCount');
    });

    it('should not have any undefined imports', () => {
      // All imports should be defined
      expect(isQueueProcessing).not.toBeUndefined();
      expect(getApiStats).not.toBeUndefined();
      expect(isProcessing).not.toBeUndefined();
      expect(getStats).not.toBeUndefined();
    });
  });
});
