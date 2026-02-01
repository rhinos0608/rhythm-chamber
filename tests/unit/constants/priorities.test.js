/**
 * Tests for priorities.js constants
 *
 * These tests verify that all priority levels are properly defined.
 * Following TDD approach - tests written before implementation.
 */

import { describe, it, expect } from 'vitest';
import { PRIORITY, RECOVERY_PRIORITY } from '../../../js/constants/priorities.js';

describe('constants/priorities.js', () => {
  describe('PRIORITY', () => {
    it('should define CRITICAL priority', () => {
      expect(PRIORITY.CRITICAL).toBeDefined();
      expect(typeof PRIORITY.CRITICAL).toBe('number');
    });

    it('should define HIGH priority', () => {
      expect(PRIORITY.HIGH).toBeDefined();
      expect(typeof PRIORITY.HIGH).toBe('number');
    });

    it('should define NORMAL priority', () => {
      expect(PRIORITY.NORMAL).toBeDefined();
      expect(typeof PRIORITY.NORMAL).toBe('number');
    });

    it('should define LOW priority', () => {
      expect(PRIORITY.LOW).toBeDefined();
      expect(typeof PRIORITY.LOW).toBe('number');
    });

    it('should have priorities in descending order', () => {
      expect(PRIORITY.CRITICAL).toBeLessThan(PRIORITY.HIGH);
      expect(PRIORITY.HIGH).toBeLessThan(PRIORITY.NORMAL);
      expect(PRIORITY.NORMAL).toBeLessThan(PRIORITY.LOW);
    });

    it('should have documented values', () => {
      // Lower numbers = higher priority (for queue sorting)
      expect(PRIORITY.CRITICAL).toBe(1);
      expect(PRIORITY.HIGH).toBe(2);
      expect(PRIORITY.NORMAL).toBe(3);
      expect(PRIORITY.LOW).toBe(4);
    });
  });

  describe('RECOVERY_PRIORITY', () => {
    it('should define CRITICAL priority', () => {
      expect(RECOVERY_PRIORITY.CRITICAL).toBeDefined();
      expect(typeof RECOVERY_PRIORITY.CRITICAL).toBe('number');
    });

    it('should define HIGH priority', () => {
      expect(RECOVERY_PRIORITY.HIGH).toBeDefined();
      expect(typeof RECOVERY_PRIORITY.HIGH).toBe('number');
    });

    it('should define MEDIUM priority', () => {
      expect(RECOVERY_PRIORITY.MEDIUM).toBeDefined();
      expect(typeof RECOVERY_PRIORITY.MEDIUM).toBe('number');
    });

    it('should define LOW priority', () => {
      expect(RECOVERY_PRIORITY.LOW).toBeDefined();
      expect(typeof RECOVERY_PRIORITY.LOW).toBe('number');
    });

    it('should have priorities in descending order', () => {
      expect(RECOVERY_PRIORITY.CRITICAL).toBeGreaterThan(RECOVERY_PRIORITY.HIGH);
      expect(RECOVERY_PRIORITY.HIGH).toBeGreaterThan(RECOVERY_PRIORITY.MEDIUM);
      expect(RECOVERY_PRIORITY.MEDIUM).toBeGreaterThan(RECOVERY_PRIORITY.LOW);
    });

    it('should have documented values', () => {
      // Higher numbers = more important (for recovery sorting)
      expect(RECOVERY_PRIORITY.CRITICAL).toBe(100);
      expect(RECOVERY_PRIORITY.HIGH).toBe(75);
      expect(RECOVERY_PRIORITY.MEDIUM).toBe(50);
      expect(RECOVERY_PRIORITY.LOW).toBe(25);
    });
  });
});
