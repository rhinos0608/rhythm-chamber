import { describe, it, expect, beforeEach } from 'vitest';
import { WaveVisualizer } from '../../js/services/wave-visualizer.js';
import { WaveTelemetry } from '../../js/services/wave-telemetry.js';

describe('WaveVisualizer', () => {
  beforeEach(() => {
    WaveTelemetry._clearWaves();
  });

  it('render returns HTML string with timeline visualization', () => {
    const waveId = WaveTelemetry.startWave('user:test');
    WaveTelemetry.recordNode('event:uploaded', waveId);
    WaveTelemetry.recordNode('handler:process', waveId);
    const wave = WaveTelemetry.getWave(waveId);
    const summary = WaveTelemetry.endWave(waveId);

    const html = WaveVisualizer.render(wave, summary);

    expect(html).toContain('wave-timeline');
    expect(html).toContain('user:test');
    expect(html).toContain('event:uploaded');
    expect(html).toContain('handler:process');
  });

  it('findBottlenecks returns nodes exceeding threshold', () => {
    const waveId = WaveTelemetry.startWave('user:test');
    WaveTelemetry.recordNode('node:fast', waveId);
    WaveTelemetry.recordNode('node:slow', waveId);

    const wave = WaveTelemetry.getWave(waveId);
    // Manually set timestamps to create a bottleneck
    wave.chain[0].timestamp = Date.now();
    wave.chain[1].timestamp = wave.chain[0].timestamp + 150;

    const summary = WaveTelemetry.endWave(waveId);
    const bottlenecks = WaveVisualizer.findBottlenecks(wave, 100);

    expect(bottlenecks).toHaveLength(1);
    expect(bottlenecks[0].node).toBe('node:slow');
  });

  it('getCriticalPath returns nodes in longest path', () => {
    const waveId = WaveTelemetry.startWave('user:test');
    WaveTelemetry.recordNode('node:a', waveId);
    WaveTelemetry.recordNode('node:b', waveId);
    WaveTelemetry.recordNode('node:c', waveId);

    const wave = WaveTelemetry.getWave(waveId);
    const summary = WaveTelemetry.endWave(waveId);

    const path = WaveVisualizer.getCriticalPath(wave);

    expect(path).toHaveLength(3);
    expect(path[0].node).toBe('node:a');
    expect(path[2].node).toBe('node:c');
  });

  it('escapeHtml prevents XSS attacks', () => {
    const input = '<script>alert("xss")</script>';
    const escaped = WaveVisualizer.escapeHtml(input);

    expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('render highlights bottleneck nodes with bottleneck class', () => {
    const waveId = WaveTelemetry.startWave('user:test');
    WaveTelemetry.recordNode('node:fast', waveId);

    const wave = WaveTelemetry.getWave(waveId);
    wave.chain[0].timestamp = Date.now();

    WaveTelemetry.recordNode('node:slow', waveId);
    wave.chain[1].timestamp = wave.chain[0].timestamp + 150;

    const summary = WaveTelemetry.endWave(waveId);
    const html = WaveVisualizer.render(wave, summary);

    expect(html).toContain('bottleneck');
    expect(html).toContain('node:slow');
  });

  it('findBottlenecks returns empty array when no bottlenecks exist', () => {
    const waveId = WaveTelemetry.startWave('user:test');
    WaveTelemetry.recordNode('node:fast', waveId);

    const wave = WaveTelemetry.getWave(waveId);
    const summary = WaveTelemetry.endWave(waveId);

    const bottlenecks = WaveVisualizer.findBottlenecks(wave, 100);

    expect(bottlenecks).toEqual([]);
  });
});
