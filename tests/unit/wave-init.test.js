/**
 * Wave Telemetry Initialization Tests
 *
 * Tests that critical events are properly initialized during app startup.
 *
 * @module tests/unit/wave-init.test.js
 */

import { describe, test, expect, beforeEach } from 'vitest';

import { WaveTelemetry } from '../../js/services/wave-telemetry.js';

describe('Wave Telemetry Initialization', () => {
  beforeEach(() => {
    // Clear waves and reset critical events before each test
    WaveTelemetry._clearWaves();
  });

  test('critical events can be set and retrieved', () => {
    // Set the critical events as the initialization function would
    const criticalEvents = [
      'file_uploaded',
      'pattern:all_complete',
      'embedding:generation_complete',
      'streams:processed',
    ];
    WaveTelemetry.setCriticalEvents(criticalEvents);

    // Verify the events were set correctly
    const retrievedEvents = WaveTelemetry.getCriticalEvents();

    expect(retrievedEvents).toContain('file_uploaded');
    expect(retrievedEvents).toContain('pattern:all_complete');
    expect(retrievedEvents).toContain('embedding:generation_complete');
    expect(retrievedEvents).toContain('streams:processed');
  });

  test('isCriticalEvent correctly identifies critical events', () => {
    const criticalEvents = [
      'file_uploaded',
      'pattern:all_complete',
      'embedding:generation_complete',
      'streams:processed',
    ];
    WaveTelemetry.setCriticalEvents(criticalEvents);

    // Test critical events return true
    expect(WaveTelemetry.isCriticalEvent('file_uploaded')).toBe(true);
    expect(WaveTelemetry.isCriticalEvent('pattern:all_complete')).toBe(true);
    expect(WaveTelemetry.isCriticalEvent('embedding:generation_complete')).toBe(true);
    expect(WaveTelemetry.isCriticalEvent('streams:processed')).toBe(true);

    // Test non-critical events return false
    expect(WaveTelemetry.isCriticalEvent('other_event')).toBe(false);
  });
});
