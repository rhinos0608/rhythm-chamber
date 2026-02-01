/**
 * Tests for constants index.js
 *
 * These tests verify that all constants are properly exported.
 * Following TDD approach - tests written before implementation.
 */

import { describe, it, expect } from 'vitest';

describe('constants/index.js', () => {
  it('should export all constant modules', async () => {
    const constants = await import('../../../js/constants/index.js');

    // Verify all exports exist
    expect(constants.LIMITS).toBeDefined();
    expect(constants.QUOTA_THRESHOLDS).toBeDefined();
    expect(constants.CACHE_SIZES).toBeDefined();
    expect(constants.DELAYS).toBeDefined();
    expect(constants.POLL_INTERVALS).toBeDefined();
    expect(constants.RATE_LIMITS).toBeDefined();
    expect(constants.PRIORITY).toBeDefined();
    expect(constants.RECOVERY_PRIORITY).toBeDefined();
    expect(constants.API_LIMITS).toBeDefined();
    expect(constants.API_TIME_TO_LIVE).toBeDefined();
    expect(constants.HTTP_STATUS).toBeDefined();
    expect(constants.ANOMALY_THRESHOLD).toBeDefined();
    expect(constants.PERCENTAGE_MULTIPLIER).toBeDefined();
    expect(constants.SCORE_PRECISION).toBeDefined();
    expect(constants.COVERAGE_LEVELS).toBeDefined();
  });

  it('should export default object with all constants', async () => {
    const constants = await import('../../../js/constants/index.js');
    const exported = constants.default;

    expect(exported).toBeDefined();
    expect(exported.LIMITS).toBeDefined();
    expect(exported.DELAYS).toBeDefined();
    expect(exported.PRIORITY).toBeDefined();
    expect(exported.API_LIMITS).toBeDefined();
  });

  it('should have consistent values across exports', async () => {
    const constants = await import('../../../js/constants/index.js');

    // Verify that named exports match default exports
    expect(constants.LIMITS).toBe(constants.default.LIMITS);
    expect(constants.DELAYS).toBe(constants.default.DELAYS);
    expect(constants.PRIORITY).toBe(constants.default.PRIORITY);
  });
});
