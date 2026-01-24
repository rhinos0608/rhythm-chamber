import { describe, it, expect, beforeEach } from 'vitest';
import { WaveTelemetry } from '../../js/services/wave-telemetry.js';

describe('Wave Context Tracking', () => {
  beforeEach(() => {
    // Clear wave storage before each test
    WaveTelemetry._clearWaves();
  });

  it('startWave creates a new wave with UUID and origin', () => {
    const waveId = WaveTelemetry.startWave('user:upload_file');

    expect(waveId).toMatch(/^[0-9a-f-]{36}$/); // UUID format

    const wave = WaveTelemetry.getWave(waveId);
    expect(wave).toBeDefined();
    expect(wave.origin).toBe('user:upload_file');
    expect(wave.startTime).toBeGreaterThan(0);
    expect(wave.chain).toEqual([]);
  });

  it('recordNode adds a node to the wave chain', () => {
    const waveId = WaveTelemetry.startWave('user:test');
    const startTime = Date.now();

    WaveTelemetry.recordNode('event:test_event', waveId);
    WaveTelemetry.recordNode('handler:test_handler', waveId);

    const wave = WaveTelemetry.getWave(waveId);
    expect(wave.chain).toHaveLength(2);
    expect(wave.chain[0].node).toBe('event:test_event');
    expect(wave.chain[0].parent).toBeNull();
    expect(wave.chain[1].node).toBe('handler:test_handler');
    expect(wave.chain[1].parent).toBe('event:test_event');
  });

  it('endWave calculates total latency and bottlenecks', () => {
    const waveId = WaveTelemetry.startWave('user:test');

    // Simulate some nodes with delays
    WaveTelemetry.recordNode('node:fast', waveId);
    // Mock a delay by setting timestamps manually
    const wave = WaveTelemetry.getWave(waveId);
    wave.chain[0].timestamp = Date.now();

    // Add slow node
    WaveTelemetry.recordNode('node:slow', waveId);
    wave.chain[1].timestamp = wave.chain[0].timestamp + 150; // 150ms delay

    // Add medium node
    WaveTelemetry.recordNode('node:medium', waveId);
    wave.chain[2].timestamp = wave.chain[1].timestamp + 50;

    const result = WaveTelemetry.endWave(waveId);

    expect(result.totalLatency).toBeGreaterThan(0);
    expect(result.bottlenecks).toHaveLength(1);
    expect(result.bottlenecks[0].node).toBe('node:slow');
  });

  it('setCriticalEvents stores critical event whitelist', () => {
    const events = ['file_uploaded', 'pattern:all_complete'];
    WaveTelemetry.setCriticalEvents(events);

    expect(WaveTelemetry.getCriticalEvents()).toEqual(events);
  });
});
