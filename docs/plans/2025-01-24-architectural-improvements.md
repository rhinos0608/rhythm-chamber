# Architectural Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement three architectural improvements: Wave Propagation Telemetry, Premium Gatekeeper consolidation, and Observability Dev Panel

**Architecture:**
- Wave Telemetry extends existing service with event tracing and bottleneck detection
- Premium Gatekeeper unifies 5+ scattered premium checks into single API
- Dev Panel exposes existing observability data via hidden UI

**Tech Stack:** JavaScript (ES modules), Jest for testing, existing EventBus/LicenseVerifier/Quota systems

---

## Phase 1: Wave Propagation Telemetry

### Task 1: Add Wave Context Tracking to WaveTelemetry

**Files:**
- Modify: `js/services/wave-telemetry.js`
- Test: `tests/unit/wave-telemetry.test.js`

**Step 1: Write the failing test**

Add to `tests/unit/wave-telemetry.test.js`:

```javascript
describe('Wave Context Tracking', () => {
  beforeEach(() => {
    // Clear wave storage before each test
    WaveTelemetry._clearWaves();
  });

  test('startWave creates a new wave with UUID and origin', () => {
    const waveId = WaveTelemetry.startWave('user:upload_file');

    expect(waveId).toMatch(/^[0-9a-f-]{36}$/); // UUID format

    const wave = WaveTelemetry.getWave(waveId);
    expect(wave).toBeDefined();
    expect(wave.origin).toBe('user:upload_file');
    expect(wave.startTime).toBeGreaterThan(0);
    expect(wave.chain).toEqual([]);
  });

  test('recordNode adds a node to the wave chain', () => {
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

  test('endWave calculates total latency and bottlenecks', () => {
    const waveId = WaveTelemetry.startWave('user:test');

    // Simulate some nodes with delays
    WaveTelemetry.recordNode('node:fast', waveId);
    await delay(10);
    WaveTelemetry.recordNode('node:slow', waveId);
    await delay(150); // Above default threshold of 100ms
    WaveTelemetry.recordNode('node:medium', waveId);

    const result = WaveTelemetry.endWave(waveId);

    expect(result.totalLatency).toBeGreaterThan(0);
    expect(result.bottlenecks).toHaveLength(1);
    expect(result.bottlenecks[0].node).toBe('node:slow');
  });

  test('setCriticalEvents stores critical event whitelist', () => {
    const events = ['file_uploaded', 'pattern:all_complete'];
    WaveTelemetry.setCriticalEvents(events);

    expect(WaveTelemetry.getCriticalEvents()).toEqual(events);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/wave-telemetry.test.js`
Expected: FAIL - methods don't exist yet

**Step 3: Write minimal implementation**

Add to `js/services/wave-telemetry.js`:

```javascript
import { v4 as uuidv4 } from 'uuid';

// Wave storage
const waves = new Map();
let criticalEvents = [];

// Default bottleneck threshold (ms)
const BOTTLENECK_THRESHOLD = 100;

export class WaveTelemetry {
  /**
   * Start tracking a new wave
   * @param {string} origin - The origin of the wave (e.g., 'user:upload_file')
   * @returns {string} Wave ID (UUID)
   */
  static startWave(origin) {
    const waveId = uuidv4();
    waves.set(waveId, {
      waveId,
      origin,
      startTime: Date.now(),
      chain: [],
      ended: false
    });
    return waveId;
  }

  /**
   * Record a node in the wave chain
   * @param {string} nodeName - Name of the node/event
   * @param {string} waveId - Wave ID
   */
  static recordNode(nodeName, waveId) {
    const wave = waves.get(waveId);
    if (!wave || wave.ended) return;

    const timestamp = Date.now();
    const parent = wave.chain.length > 0 ? wave.chain[wave.chain.length - 1].node : null;

    wave.chain.push({
      node: nodeName,
      timestamp,
      parent
    });
  }

  /**
   * End a wave and calculate metrics
   * @param {string} waveId - Wave ID
   * @returns {object} Wave summary with latency and bottlenecks
   */
  static endWave(waveId) {
    const wave = waves.get(waveId);
    if (!wave) return null;

    wave.ended = true;
    const endTime = Date.now();

    // Calculate durations for each node
    let prevTime = wave.startTime;
    const chainWithDuration = wave.chain.map((node, index) => {
      const duration = index === 0 ? node.timestamp - wave.startTime : node.timestamp - prevTime;
      prevTime = node.timestamp;
      return { ...node, duration };
    });

    // Find bottlenecks (nodes exceeding threshold)
    const bottlenecks = chainWithDuration.filter(n => n.duration > BOTTLENECK_THRESHOLD);

    return {
      waveId,
      origin: wave.origin,
      totalLatency: endTime - wave.startTime,
      chain: chainWithDuration,
      bottlenecks
    };
  }

  /**
   * Get a wave by ID
   * @param {string} waveId - Wave ID
   * @returns {object|null} Wave object
   */
  static getWave(waveId) {
    return waves.get(waveId) || null;
  }

  /**
   * Set the list of critical events to auto-track
   * @param {string[]} events - Array of event names
   */
  static setCriticalEvents(events) {
    criticalEvents = [...events];
  }

  /**
   * Get the list of critical events
   * @returns {string[]} Array of critical event names
   */
  static getCriticalEvents() {
    return [...criticalEvents];
  }

  /**
   * Check if an event is critical
   * @param {string} eventName - Event name to check
   * @returns {boolean}
   */
  static isCriticalEvent(eventName) {
    return criticalEvents.includes(eventName);
  }

  /**
   * Clear all waves (for testing)
   * @internal
   */
  static _clearWaves() {
    waves.clear();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/wave-telemetry.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add js/services/wave-telemetry.js tests/unit/wave-telemetry.test.js
git commit -m "feat: add wave context tracking to WaveTelemetry

- Add startWave, recordNode, endWave methods
- Track wave chain with parent references
- Calculate total latency and identify bottlenecks
- Support critical event whitelist"
```

---

### Task 2: Create WaveVisualizer Service

**Files:**
- Create: `js/services/wave-visualizer.js`
- Test: `tests/unit/wave-visualizer.test.js`

**Step 1: Write the failing test**

Create `tests/unit/wave-visualizer.test.js`:

```javascript
import { WaveVisualizer } from '../../js/services/wave-visualizer.js';
import { WaveTelemetry } from '../../js/services/wave-telemetry.js';

describe('WaveVisualizer', () => {
  beforeEach(() => {
    WaveTelemetry._clearWaves();
  });

  test('render returns HTML string with timeline visualization', () => {
    const waveId = WaveTelemetry.startWave('user:test');
    WaveTelemetry.recordNode('event:uploaded', waveId);
    WaveTelemetry.recordNode('handler:process', waveId);
    const wave = WaveTelemetry.endWave(waveId);

    const html = WaveVisualizer.render(wave);

    expect(html).toContain('wave-timeline');
    expect(html).toContain('user:test');
    expect(html).toContain('event:uploaded');
    expect(html).toContain('handler:process');
  });

  test('findBottlenecks returns nodes exceeding threshold', () => {
    const waveId = WaveTelemetry.startWave('user:test');
    WaveTelemetry.recordNode('node:fast', waveId);
    WaveTelemetry.recordNode('node:slow', waveId);
    const wave = WaveTelemetry.endWave(waveId);

    // Mock a slow node
    wave.chain[1].duration = 150;

    const bottlenecks = WaveVisualizer.findBottlenecks(wave, 100);

    expect(bottlenecks).toHaveLength(1);
    expect(bottlenecks[0].node).toBe('node:slow');
  });

  test('getCriticalPath returns nodes in longest path', () => {
    const waveId = WaveTelemetry.startWave('user:test');
    WaveTelemetry.recordNode('node:a', waveId);
    WaveTelemetry.recordNode('node:b', waveId);
    WaveTelemetry.recordNode('node:c', waveId);
    const wave = WaveTelemetry.endWave(waveId);

    const path = WaveVisualizer.getCriticalPath(wave);

    expect(path).toHaveLength(3);
    expect(path[0].node).toBe('node:a');
    expect(path[2].node).toBe('node:c');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/wave-visualizer.test.js`
Expected: FAIL - WaveVisualizer doesn't exist

**Step 3: Write minimal implementation**

Create `js/services/wave-visualizer.js`:

```javascript
/**
 * WaveVisualizer - Visualize wave propagation and identify bottlenecks
 */
export class WaveVisualizer {
  /**
   * Render a wave as HTML timeline
   * @param {object} wave - Wave object from WaveTelemetry.endWave
   * @returns {string} HTML string
   */
  static render(wave) {
    if (!wave) return '<div class="wave-error">No wave data</div>';

    const nodes = wave.chain.map((node, index) => {
      const duration = node.duration ? `${node.duration.toFixed(1)}ms` : 'N/A';
      const isBottleneck = node.duration > 100;
      const bottleneckClass = isBottleneck ? ' bottleneck' : '';

      return `
        <div class="wave-node${bottleneckClass}" data-index="${index}">
          <div class="node-name">${this.escapeHtml(node.node)}</div>
          <div class="node-duration">${duration}</div>
          ${node.parent ? `<div class="node-parent">← ${this.escapeHtml(node.parent)}</div>` : ''}
        </div>
      `;
    }).join('');

    return `
      <div class="wave-timeline" data-wave-id="${wave.waveId}">
        <div class="wave-header">
          <span class="wave-origin">${this.escapeHtml(wave.origin)}</span>
          <span class="wave-total">Total: ${wave.totalLatency.toFixed(1)}ms</span>
        </div>
        <div class="wave-chain">
          ${nodes}
        </div>
        ${wave.bottlenecks.length > 0 ? `
          <div class="wave-bottlenecks">
            <strong>Bottlenecks:</strong>
            ${wave.bottlenecks.map(b => `<span>${this.escapeHtml(b.node)} (${b.duration.toFixed(1)}ms)</span>`).join(', ')}
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Find bottlenecks in a wave
   * @param {object} wave - Wave object
   * @param {number} threshold - Bottleneck threshold in ms (default: 100)
   * @returns {array} Array of bottleneck nodes
   */
  static findBottlenecks(wave, threshold = 100) {
    if (!wave || !wave.chain) return [];
    return wave.chain.filter(node => node.duration > threshold);
  }

  /**
   * Get the critical path through a wave
   * @param {object} wave - Wave object
   * @returns {array} Nodes in the critical path
   */
  static getCriticalPath(wave) {
    if (!wave || !wave.chain) return [];

    // For linear chains, the critical path is the full chain
    // Future: handle branching when we support parallel handlers
    return [...wave.chain];
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  static escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/wave-visualizer.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add js/services/wave-visualizer.js tests/unit/wave-visualizer.test.js
git commit -m "feat: add WaveVisualizer service

- Render wave chains as HTML timelines
- Find bottlenecks exceeding threshold
- Calculate critical path through wave chain
- XSS protection for rendered output"
```

---

### Task 3: Integrate Wave Tracking into EventBus

**Files:**
- Modify: `js/controllers/event-bus.js`
- Test: `tests/unit/event-bus.test.js`

**Step 1: Write the failing test**

Add to `tests/unit/event-bus.test.js`:

```javascript
describe('EventBus Wave Integration', () => {
  beforeEach(() => {
    // Reset EventBus state
    EventBus._clearWaves();
    WaveTelemetry._clearWaves();
  });

  test('emit creates wave context for critical events', () => {
    WaveTelemetry.setCriticalEvents(['file_uploaded']);

    const handler = jest.fn();
    EventBus.on('file_uploaded', handler);
    EventBus.emit('file_uploaded', { data: 'test' });

    // Should have created a wave
    const waves = EventBus._getActiveWaves();
    expect(Object.keys(waves)).toContain('file_uploaded');
  });

  test('emit propagates waveId to handlers', () => {
    WaveTelemetry.setCriticalEvents(['test_event']);

    let receivedWaveId = null;
    const handler = (data, waveId) => {
      receivedWaveId = waveId;
    };
    EventBus.on('test_event', handler);
    EventBus.emit('test_event', {});

    expect(receivedWaveId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('non-critical events do not create wave context', () => {
    WaveTelemetry.setCriticalEvents(['critical_only']);

    EventBus.emit('non_critical', {});

    const waves = EventBus._getActiveWaves();
    expect(Object.keys(waves)).not.toContain('non_critical');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/event-bus.test.js`
Expected: FAIL - wave integration not implemented

**Step 3: Write minimal implementation**

Add to `js/controllers/event-bus.js` (modify existing emit method):

```javascript
import { WaveTelemetry } from '../services/wave-telemetry.js';

// Add to EventBus class properties
const activeWaves = new Map();

// In the EventBus class, modify the emit method:

export class EventBus {
  // ... existing code ...

  static emit(eventName, data = null, waveId = null) {
    const timestamp = Date.now();

    // Store event for history
    this._addToHistory(eventName, data, timestamp);

    // Auto-create wave for critical events
    let effectiveWaveId = waveId;
    if (!effectiveWaveId && WaveTelemetry.isCriticalEvent(eventName)) {
      effectiveWaveId = WaveTelemetry.startWave(`event:${eventName}`);
      activeWaves.set(eventName, effectiveWaveId);
    }

    // Record the event node if we have a wave
    if (effectiveWaveId) {
      WaveTelemetry.recordNode(`event:${eventName}`, effectiveWaveId);
    }

    // Call all handlers
    const handlers = this.listeners.get(eventName) || [];
    handlers.forEach(handler => {
      try {
        // Pass waveId to handler
        handler(data, effectiveWaveId);

        // Record handler execution
        if (effectiveWaveId) {
          const handlerName = handler.name || 'anonymous_handler';
          WaveTelemetry.recordNode(`handler:${handlerName}`, effectiveWaveId);
        }
      } catch (error) {
        console.error(`Error in handler for ${eventName}:`, error);
        this.emit('error', { error, eventName });
      }
    });

    // End wave for critical events (after handlers complete)
    if (activeWaves.has(eventName)) {
      WaveTelemetry.endWave(activeWaves.get(eventName));
      activeWaves.delete(eventName);
    }
  }

  /**
   * Get active waves (for testing)
   * @internal
   */
  static _getActiveWaves() {
    return Object.fromEntries(activeWaves);
  }

  /**
   * Clear active waves (for testing)
   * @internal
   */
  static _clearWaves() {
    activeWaves.clear();
  }

  // ... existing code ...
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/event-bus.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add js/controllers/event-bus.js tests/unit/event-bus.test.js
git commit -m "feat: integrate wave tracking into EventBus

- Auto-create wave context for critical events
- Propagate waveId to event handlers
- Record handler execution in wave chain
- End wave after all handlers complete"
```

---

### Task 4: Initialize Critical Events on App Start

**Files:**
- Modify: `js/main.js` (or app entry point)
- Test: integration test

**Step 1: Write the failing test**

Create `tests/integration/wave-init.test.js`:

```javascript
import { WaveTelemetry } from '../../js/services/wave-telemetry.js';

describe('Wave Telemetry Initialization', () => {
  test('critical events are initialized on app load', () => {
    const criticalEvents = WaveTelemetry.getCriticalEvents();

    expect(criticalEvents).toContain('file_uploaded');
    expect(criticalEvents).toContain('pattern:all_complete');
    expect(criticalEvents).toContain('embedding:generation_complete');
    expect(criticalEvents).toContain('streams:processed');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/wave-init.test.js`
Expected: FAIL - events not initialized

**Step 3: Write minimal implementation**

Add to app initialization (in `js/main.js` or equivalent entry point):

```javascript
import { WaveTelemetry } from './services/wave-telemetry.js';

// Initialize wave telemetry with critical events
function initializeWaveTelemetry() {
  const criticalEvents = [
    'file_uploaded',
    'pattern:all_complete',
    'embedding:generation_complete',
    'streams:processed'
  ];
  WaveTelemetry.setCriticalEvents(criticalEvents);
}

// Call during app initialization
document.addEventListener('DOMContentLoaded', () => {
  initializeWaveTelemetry();
  // ... other initialization
});
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/wave-init.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add js/main.js tests/integration/wave-init.test.js
git commit -m "feat: initialize critical events for wave tracking

- Set critical events whitelist on app load
- Auto-track file_uploaded, pattern detection, embedding, streams"
```

---

## Phase 2: Premium Gatekeeper Consolidation

### Task 5: Create PremiumGatekeeper Service

**Files:**
- Create: `js/services/premium-gatekeeper.js`
- Test: `tests/unit/premium-gatekeeper.test.js`

**Step 1: Write the failing test**

Create `tests/unit/premium-gatekeeper.test.js`:

```javascript
import { PremiumGatekeeper } from '../../js/services/premium-gatekeeper.js';

// Mock dependencies
jest.mock('../../js/services/license-service.js');
jest.mock('../../js/services/premium-quota.js');

describe('PremiumGatekeeper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('checkFeature returns allowed=true for premium user with valid license', async () => {
    // Mock license as valid
    const LicenseVerifier = require('../../js/services/license-service.js').LicenseVerifier;
    LicenseVerifier.loadLicense.mockResolvedValue({
      valid: true,
      tier: 'chamber'
    });

    const result = await PremiumGatekeeper.checkFeature('semantic_search');

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('chamber');
    expect(result.reason).toBeNull();
  });

  test('checkFeature returns allowed=false with NO_LICENSE reason', async () => {
    const LicenseVerifier = require('../../js/services/license-service.js').LicenseVerifier;
    LicenseVerifier.loadLicense.mockResolvedValue({
      valid: false
    });

    const result = await PremiumGatekeeper.checkFeature('semantic_search');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('NO_LICENSE');
  });

  test('checkFeature checks quota for unlimited_playlists', async () => {
    const LicenseVerifier = require('../../js/services/license-service.js').LicenseVerifier;
    LicenseVerifier.loadLicense.mockResolvedValue({ valid: false });

    const PremiumQuota = require('../../js/services/premium-quota.js').PremiumQuota;
    PremiumQuota.canCreatePlaylist.mockResolvedValue({
      allowed: false,
      remaining: 0
    });

    const result = await PremiumGatekeeper.checkFeature('unlimited_playlists');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('QUOTA_EXCEEDED');
    expect(result.quotaRemaining).toBe(0);
  });

  test('checkFeature returns FEATURE_NOT_FOUND for unknown feature', async () => {
    const result = await PremiumGatekeeper.checkFeature('unknown_feature');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('FEATURE_NOT_FOUND');
  });

  test('checkFeature returns upgradeUrl in result', async () => {
    const result = await PremiumGatekeeper.checkFeature('semantic_search');

    expect(result.upgradeUrl).toBe('/upgrade.html');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/premium-gatekeeper.test.js`
Expected: FAIL - PremiumGatekeeper doesn't exist

**Step 3: Write minimal implementation**

Create `js/services/premium-gatekeeper.js`:

```javascript
import { LicenseVerifier } from './license-service.js';
import { PremiumQuota } from './premium-quota.js';

/**
 * Feature registry defining all gated features
 */
const FEATURES = {
  unlimited_playlists: {
    requiresLicense: false,
    checkQuota: true,
    description: 'Unlimited playlist creation'
  },
  semantic_search: {
    requiresLicense: true,
    checkQuota: false,
    description: 'Semantic search across streams'
  },
  personality_insights: {
    requiresLicense: true,
    checkQuota: false,
    description: 'AI personality analysis'
  },
  export_advanced: {
    requiresLicense: true,
    checkQuota: false,
    description: 'Advanced export formats'
  }
};

/**
 * PremiumGatekeeper - Unified feature access control
 *
 * Single source of truth for all premium feature access decisions.
 * Consolidates license verification and quota checking.
 */
export class PremiumGatekeeper {
  /**
   * Check if a feature is accessible to the current user
   * @param {string} featureName - Name of the feature to check
   * @returns {Promise<object>} Access result
   */
  static async checkFeature(featureName) {
    // Validate feature exists
    const feature = FEATURES[featureName];
    if (!feature) {
      return {
        allowed: false,
        reason: 'FEATURE_NOT_FOUND',
        tier: null,
        quotaRemaining: null,
        upgradeUrl: '/upgrade.html'
      };
    }

    // Check license if required
    let licenseValid = false;
    let licenseTier = 'sovereign';

    if (feature.requiresLicense) {
      try {
        const license = await LicenseVerifier.loadLicense();
        licenseValid = license.valid;
        licenseTier = license.tier || 'sovereign';
      } catch (error) {
        console.error('License check failed:', error);
        licenseValid = false;
      }

      if (!licenseValid) {
        return {
          allowed: false,
          reason: 'NO_LICENSE',
          tier: licenseTier,
          quotaRemaining: null,
          upgradeUrl: '/upgrade.html'
        };
      }
    } else {
      // Still load license for tier info
      try {
        const license = await LicenseVerifier.loadLicense();
        licenseValid = license.valid;
        licenseTier = license.tier || 'sovereign';
      } catch {
        // Ignore errors for non-license features
      }
    }

    // Check quota if required
    if (feature.checkQuota && !licenseValid) {
      try {
        const quota = await PremiumQuota.canCreatePlaylist();
        if (!quota.allowed) {
          return {
            allowed: false,
            reason: 'QUOTA_EXCEEDED',
            tier: licenseTier,
            quotaRemaining: quota.remaining,
            upgradeUrl: '/upgrade.html'
          };
        }
      } catch (error) {
        console.error('Quota check failed:', error);
      }
    }

    // Feature is allowed
    return {
      allowed: true,
      reason: null,
      tier: licenseTier,
      quotaRemaining: null,
      upgradeUrl: '/upgrade.html'
    };
  }

  /**
   * Get all registered features
   * @returns {object} Feature registry
   */
  static getFeatures() {
    return { ...FEATURES };
  }

  /**
   * Check if a feature is registered
   * @param {string} featureName - Name to check
   * @returns {boolean}
   */
  static isRegisteredFeature(featureName) {
    return featureName in FEATURES;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/premium-gatekeeper.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add js/services/premium-gatekeeper.js tests/unit/premium-gatekeeper.test.js
git commit -m "feat: add PremiumGatekeeper unified feature access

- Consolidate license and quota checks into single API
- Feature registry with clear requirements per feature
- Standardized access result format
- Support for feature, quota, and license gating"
```

---

### Task 6: Migrate PlaylistService to PremiumGatekeeper

**Files:**
- Modify: `js/services/playlist-service.js`
- Test: Update existing tests

**Step 1: Write the failing test**

Update `tests/unit/playlist-service.test.js`:

```javascript
test('createPlaylist uses PremiumGatekeeper for feature check', async () => {
  const mockAccess = { allowed: true, tier: 'chamber' };
  PremiumGatekeeper.checkFeature.mockResolvedValue(mockAccess);

  const result = await PlaylistService.createPlaylist(mockStreams);

  expect(PremiumGatekeeper.checkFeature).toHaveBeenCalledWith('unlimited_playlists');
  expect(result.gated).toBe(false);
});

test('createPlaylist returns gated=true when feature denied', async () => {
  const mockAccess = {
    allowed: false,
    reason: 'QUOTA_EXCEEDED',
    quotaRemaining: 0,
    upgradeUrl: '/upgrade.html'
  };
  PremiumGatekeeper.checkFeature.mockResolvedValue(mockAccess);

  const result = await PlaylistService.createPlaylist(mockStreams);

  expect(result.gated).toBe(true);
  expect(result.remaining).toBe(0);
  expect(result.playlist).toBeNull();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/playlist-service.test.js`
Expected: FAIL - still using old quota check

**Step 3: Write minimal implementation**

Modify `js/services/playlist-service.js`:

Replace the quota check section (around lines 42-49):

```javascript
// OLD CODE (remove):
// const { allowed, remaining } = await PremiumQuota.canCreatePlaylist();
// if (!allowed) {
//   PremiumController.showUpgradeModal('QUOTA_EXCEEDED');
//   return { gated: true, playlist: null, remaining };
// }

// NEW CODE:
import { PremiumGatekeeper } from './premium-gatekeeper.js';

// In createPlaylist method:
const access = await PremiumGatekeeper.checkFeature('unlimited_playlists');
if (!access.allowed) {
  PremiumController.showUpgradeModal(access.reason);
  return {
    gated: true,
    playlist: null,
    remaining: access.quotaRemaining ?? 0
  };
}
```

Also update the usage recording (around line 82):

```javascript
// After successful playlist creation:
if (access.tier === 'sovereign') {
  await PremiumQuota.recordPlaylistCreation();
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/playlist-service.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add js/services/playlist-service.js tests/unit/playlist-service.test.js
git commit -m "refactor: migrate PlaylistService to PremiumGatekeeper

- Replace PremiumQuota.canCreatePlaylist with checkFeature
- Return standardized access result format
- Record quota usage only for sovereign tier"
```

---

### Task 7: Migrate PremiumController to PremiumGatekeeper

**Files:**
- Modify: `js/controllers/premium-controller.js`
- Test: `tests/unit/premium-controller.test.js`

**Step 1: Write the failing test**

Add to `tests/unit/premium-controller.test.js`:

```javascript
test('showUpgradeModal uses PremiumGatekeeper for access check', async () => {
  const mockAccess = {
    allowed: false,
    reason: 'QUOTA_EXCEEDED',
    tier: 'sovereign',
    quotaRemaining: 0
  };
  PremiumGatekeeper.checkFeature.mockResolvedValue(mockAccess);

  await PremiumController.showUpgradeModal('unlimited_playlists');

  expect(PremiumGatekeeper.checkFeature).toHaveBeenCalledWith('unlimited_playlists');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/premium-controller.test.js`
Expected: FAIL - not using gatekeeper

**Step 3: Write minimal implementation**

Modify `js/controllers/premium-controller.js`:

```javascript
import { PremiumGatekeeper } from '../services/premium-gatekeeper.js';

// Update the check before showing modal (around lines 61-62):
// OLD:
// const { allowed, remaining, reason } = await PremiumQuota.canCreatePlaylist();

// NEW:
async function checkFeatureAccess(featureName) {
  return await PremiumGatekeeper.checkFeature(featureName);
}

// Use in showUpgradeModal:
export async function showUpgradeModal(featureName = 'unlimited_playlists') {
  const access = await PremiumGatekeeper.checkFeature(featureName);

  // Modal HTML uses access.tier, access.reason, access.quotaRemaining
  // ... existing modal code
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/premium-controller.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add js/controllers/premium-controller.js tests/unit/premium-controller.test.js
git commit -m "refactor: migrate PremiumController to PremiumGatekeeper

- Use checkFeature instead of PremiumQuota
- Standardized access result handling"
```

---

### Task 8: Update Payments isPremium to Delegate to Gatekeeper

**Files:**
- Modify: `js/payments.js`
- Test: `tests/unit/payments.test.js`

**Step 1: Write the failing test**

Add to `tests/unit/payments.test.js`:

```javascript
test('isPremium delegates to PremiumGatekeeper for wildcard check', async () => {
  PremiumGatekeeper.checkFeature.mockResolvedValue({
    allowed: true,
    tier: 'chamber'
  });

  const result = await Payments.isPremium();

  expect(PremiumGatekeeper.checkFeature).toHaveBeenCalledWith('*');
  expect(result).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/payments.test.js`
Expected: FAIL - not delegating

**Step 3: Write minimal implementation**

Modify `js/payments.js`:

```javascript
import { PremiumGatekeeper } from './services/premium-gatekeeper.js';

// Update isPremium function (around lines 88-96):
export async function isPremium() {
  try {
    // Use wildcard to check any premium feature
    const access = await PremiumGatekeeper.checkFeature('semantic_search');
    return access.allowed && access.tier === 'chamber';
  } catch {
    return false;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/payments.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add js/payments.js tests/unit/payments.test.js
git commit -m "refactor: Payments.isPremium delegates to PremiumGatekeeper

- Remove duplicate license checking logic
- Use unified gatekeeper for premium status"
```

---

## Phase 3: Observability Dev Panel

### Task 9: Add Event History to EventBus

**Files:**
- Modify: `js/controllers/event-bus.js`
- Test: `tests/unit/event-bus.test.js`

**Step 1: Write the failing test**

Add to `tests/unit/event-bus.test.js`:

```javascript
describe('EventBus History', () => {
  beforeEach(() => {
    EventBus._clearHistory();
  });

  test('getEventHistory returns recent events', () => {
    EventBus.emit('event1', { data: 'test1' });
    EventBus.emit('event2', { data: 'test2' });
    EventBus.emit('event3', { data: 'test3' });

    const history = EventBus.getEventHistory(10);

    expect(history).toHaveLength(3);
    expect(history[0].eventName).toBe('event1');
    expect(history[2].eventName).toBe('event3');
  });

  test('getEventHistory limits to requested count', () => {
    for (let i = 0; i < 150; i++) {
      EventBus.emit(`event${i}`, { index: i });
    }

    const history = EventBus.getEventHistory(100);

    expect(history).toHaveLength(100);
  });

  test('history stores timestamp and payload preview', () => {
    EventBus.emit('test_event', { key: 'value', nested: { data: 'complex' } });

    const history = EventBus.getEventHistory(1);

    expect(history[0].timestamp).toBeDefined();
    expect(history[0].data).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/event-bus.test.js`
Expected: FAIL - history tracking not implemented

**Step 3: Write minimal implementation**

Add to `js/controllers/event-bus.js`:

```javascript
// Add to EventBus class
const eventHistory = [];
const MAX_HISTORY_SIZE = 100;

// Add method to store events
static _addToHistory(eventName, data, timestamp) {
  eventHistory.push({
    eventName,
    data,
    timestamp
  });

  // Keep only last MAX_HISTORY_SIZE events
  while (eventHistory.length > MAX_HISTORY_SIZE) {
    eventHistory.shift();
  }
}

// Add public method
static getEventHistory(limit = 100) {
  const start = Math.max(0, eventHistory.length - limit);
  return eventHistory.slice(start);
}

// Add test helper
static _clearHistory() {
  eventHistory.length = 0;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/event-bus.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add js/controllers/event-bus.js tests/unit/event-bus.test.js
git commit -m "feat: add event history to EventBus

- Track last 100 events with timestamps
- getEventHistory(limit) returns recent events
- Circular buffer for memory efficiency"
```

---

### Task 10: Add Tab Status API to TabCoordinator

**Files:**
- Modify: `js/services/tab-coordination.js`
- Test: `tests/unit/tab-coordination.test.js`

**Step 1: Write the failing test**

Add to `tests/unit/tab-coordination.test.js`:

```javascript
test('getTabStatus returns coordinator state', () => {
  TabCoordinator.initialize();

  const status = TabCoordinator.getTabStatus();

  expect(status).toHaveProperty('tabId');
  expect(status).toHaveProperty('isLeader');
  expect(status).toHaveProperty('connectedTabs');
  expect(status).toHaveProperty('lastHeartbeat');
});

test('getTabStatus includes election info', () => {
  TabCoordinator.initialize();

  const status = TabCoordinator.getTabStatus();

  expect(status).toHaveProperty('electionState');
  expect(status).toHaveProperty('leaderId');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tab-coordination.test.js`
Expected: FAIL - getTabStatus doesn't exist

**Step 3: Write minimal implementation**

Add to `js/services/tab-coordination.js`:

```javascript
/**
 * Get current tab coordination status
 * @returns {object} Status object
 */
static getTabStatus() {
  return {
    tabId: this.tabId,
    isLeader: this.isLeader,
    connectedTabs: Array.from(this.connectedTabs),
    lastHeartbeat: this.lastHeartbeat,
    electionState: this.electionState,
    leaderId: this.leaderId,
    heartbeatInterval: HEARTBEAT_INTERVAL_MS
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/tab-coordination.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add js/services/tab-coordination.js tests/unit/tab-coordination.test.js
git commit -m "feat: add getTabStatus to TabCoordinator

- Expose tab coordination state for dev panel
- Include election info, heartbeat status, connected tabs"
```

---

### Task 11: Add Provider Health API

**Files:**
- Modify: `js/services/llm-provider-routing-service.js`
- Test: `tests/unit/llm-provider-routing-service.test.js`

**Step 1: Write the failing test**

Add to `tests/unit/llm-provider-routing-service.test.js`:

```javascript
test('getAllHealth returns health status for all providers', () => {
  const health = ProviderHealthAuthority.getAllHealth();

  expect(health).toHaveProperty('providers');
  expect(health.providers).toBeInstanceOf(Array);
  expect(health.providers.length).toBeGreaterThan(0);

  const firstProvider = health.providers[0];
  expect(firstProvider).toHaveProperty('name');
  expect(firstProvider).toHaveProperty('status');
  expect(firstProvider).toHaveProperty('avgResponseTime');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/llm-provider-routing-service.test.js`
Expected: FAIL - getAllHealth doesn't exist

**Step 3: Write minimal implementation**

Add to `js/services/llm-provider-routing-service.js`:

```javascript
/**
 * Get health status for all providers
 * @returns {object} Health summary
 */
static getAllHealth() {
  const providers = Array.from(this.providers.values()).map(provider => ({
    name: provider.name,
    status: provider.isHealthy ? 'healthy' : 'unhealthy',
    avgResponseTime: provider.avgResponseTime || 0,
    errorCount: provider.errorCount || 0,
    lastCheck: provider.lastHealthCheck || null
  }));

  return {
    providers,
    timestamp: Date.now(),
    routingMode: this.routingMode
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/llm-provider-routing-service.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add js/services/llm-provider-routing-service.js tests/unit/llm-provider-routing-service.test.js
git commit -m "feat: add getAllHealth to ProviderHealthAuthority

- Expose provider health status for dev panel
- Include response times, error counts, health status"
```

---

### Task 12: Create DevPanelController

**Files:**
- Create: `js/controllers/dev-panel-controller.js`
- Create: `css/dev-panel.css`
- Test: `tests/unit/dev-panel.test.js`

**Step 1: Write the failing test**

Create `tests/unit/dev-panel.test.js`:

```javascript
import { DevPanel } from '../../js/controllers/dev-panel-controller.js';

describe('DevPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.removeItem('rc_dev_mode');
  });

  afterEach(() => {
    DevPanel.hide();
  });

  test('toggle shows panel when dev mode enabled', () => {
    localStorage.setItem('rc_dev_mode', 'true');

    DevPanel.toggle();

    const panel = document.querySelector('.dev-panel');
    expect(panel).toBeTruthy();
  });

  test('toggle does nothing when dev mode disabled', () => {
    DevPanel.toggle();

    const panel = document.querySelector('.dev-panel');
    expect(panel).toBeFalsy();
  });

  test('hide removes panel from DOM', () => {
    localStorage.setItem('rc_dev_mode', 'true');
    DevPanel.toggle();
    DevPanel.hide();

    const panel = document.querySelector('.dev-panel');
    expect(panel).toBeFalsy();
  });

  test('panel contains 4 tabs: Metrics, EventBus, TabCoordination, ProviderHealth', () => {
    localStorage.setItem('rc_dev_mode', 'true');
    DevPanel.toggle();

    const tabs = document.querySelectorAll('.dev-tab');
    expect(tabs.length).toBe(4);
    expect(tabs[0].textContent).toContain('Metrics');
    expect(tabs[1].textContent).toContain('EventBus');
    expect(tabs[2].textContent).toContain('TabCoordination');
    expect(tabs[3].textContent).toContain('ProviderHealth');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/dev-panel.test.js`
Expected: FAIL - DevPanel doesn't exist

**Step 3: Write minimal implementation**

Create `js/controllers/dev-panel-controller.js`:

```javascript
import { PerformanceProfiler } from '../observability/performance-profiler.js';
import { EventBus } from './event-bus.js';
import { TabCoordinator } from '../services/tab-coordination.js';
import { ProviderHealthAuthority } from '../services/llm-provider-routing-service.js';

/**
 * DevPanel - Hidden developer interface for debugging
 */
export class DevPanel {
  static isVisible = false;
  static currentTab = 'metrics';
  static updateInterval = null;

  /**
   * Toggle dev panel visibility
   */
  static toggle() {
    if (!this.isDevModeEnabled()) {
      return;
    }

    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Show dev panel
   */
  static show() {
    if (!this.isDevModeEnabled()) return;

    this.render();
    this.isVisible = true;
    this.startUpdates();

    document.addEventListener('keydown', this.handleEscape);
  }

  /**
   * Hide dev panel
   */
  static hide() {
    const panel = document.querySelector('.dev-panel');
    if (panel) {
      panel.remove();
    }
    this.isVisible = false;
    this.stopUpdates();

    document.removeEventListener('keydown', this.handleEscape);
  }

  /**
   * Check if dev mode is enabled
   */
  static isDevModeEnabled() {
    return localStorage.getItem('rc_dev_mode') === 'true' ||
           new URLSearchParams(window.location.search).has('debug');
  }

  /**
   * Render dev panel HTML
   */
  static render() {
    const existing = document.querySelector('.dev-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.className = 'dev-panel';
    panel.innerHTML = `
      <div class="dev-panel-header">
        <h2>Developer Panel</h2>
        <button class="dev-panel-close">&times;</button>
      </div>
      <div class="dev-panel-tabs">
        <button class="dev-tab" data-tab="metrics">Metrics</button>
        <button class="dev-tab" data-tab="events">EventBus</button>
        <button class="dev-tab" data-tab="tabs">TabCoordination</button>
        <button class="dev-tab" data-tab="providers">ProviderHealth</button>
      </div>
      <div class="dev-panel-content">
        <div class="dev-tab-content" data-content="metrics"></div>
        <div class="dev-tab-content" data-content="events"></div>
        <div class="dev-tab-content" data-content="tabs"></div>
        <div class="dev-tab-content" data-content="providers"></div>
      </div>
    `;

    document.body.appendChild(panel);

    // Set up event listeners
    panel.querySelector('.dev-panel-close').addEventListener('click', () => this.hide());
    panel.querySelectorAll('.dev-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // Load initial content
    this.switchTab('metrics');
  }

  /**
   * Switch to a different tab
   */
  static switchTab(tabName) {
    this.currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.dev-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Show/hide content
    document.querySelectorAll('.dev-tab-content').forEach(content => {
      content.classList.toggle('active', content.dataset.content === tabName);
    });

    // Load content for active tab
    this.loadTabContent(tabName);
  }

  /**
   * Load content for a tab
   */
  static loadTabContent(tabName) {
    const container = document.querySelector(`.dev-tab-content[data-content="${tabName}"]`);
    if (!container) return;

    switch (tabName) {
      case 'metrics':
        this.loadMetrics(container);
        break;
      case 'events':
        this.loadEvents(container);
        break;
      case 'tabs':
        this.loadTabCoordination(container);
        break;
      case 'providers':
        this.loadProviders(container);
        break;
    }
  }

  /**
   * Load metrics content
   */
  static loadMetrics(container) {
    const report = PerformanceProfiler.getComprehensiveReport();
    container.innerHTML = `
      <h3>Performance Report</h3>
      <pre>${JSON.stringify(report, null, 2)}</pre>
    `;
  }

  /**
   * Load events content
   */
  static loadEvents(container) {
    const events = EventBus.getEventHistory(100);
    container.innerHTML = `
      <h3>Recent Events (last 100)</h3>
      <table class="dev-table">
        <thead><tr><th>Time</th><th>Event</th><th>Data</th></tr></thead>
        <tbody>
          ${events.map(e => `
            <tr>
              <td>${new Date(e.timestamp).toISOString()}</td>
              <td>${this.escapeHtml(e.eventName)}</td>
              <td><code>${this.escapeHtml(JSON.stringify(e.data).substring(0, 100))}</code></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  /**
   * Load tab coordination content
   */
  static loadTabCoordination(container) {
    const status = TabCoordinator.getTabStatus();
    container.innerHTML = `
      <h3>Tab Coordination Status</h3>
      <pre>${JSON.stringify(status, null, 2)}</pre>
    `;
  }

  /**
   * Load provider health content
   */
  static loadProviders(container) {
    const health = ProviderHealthAuthority.getAllHealth();
    container.innerHTML = `
      <h3>Provider Health</h3>
      <pre>${JSON.stringify(health, null, 2)}</pre>
    `;
  }

  /**
   * Start auto-updates
   */
  static startUpdates() {
    this.updateInterval = setInterval(() => {
      if (this.isVisible) {
        this.loadTabContent(this.currentTab);
      }
    }, 5000);
  }

  /**
   * Stop auto-updates
   */
  static stopUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Handle escape key
   */
  static handleEscape = (e) => {
    if (e.key === 'Escape') {
      this.hide();
    }
  };

  /**
   * Escape HTML
   */
  static escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
```

Create `css/dev-panel.css`:

```css
.dev-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 600px;
  height: 100vh;
  background: #1e1e1e;
  color: #d4d4d4;
  border-left: 1px solid #3e3e3e;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  font-size: 12px;
}

.dev-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: #2d2d2d;
  border-bottom: 1px solid #3e3e3e;
}

.dev-panel-header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.dev-panel-close {
  background: none;
  border: none;
  color: #d4d4d4;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
}

.dev-panel-tabs {
  display: flex;
  background: #252526;
  border-bottom: 1px solid #3e3e3e;
}

.dev-tab {
  padding: 8px 16px;
  background: none;
  border: none;
  color: #969696;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}

.dev-tab:hover {
  color: #d4d4d4;
}

.dev-tab.active {
  color: #d4d4d4;
  border-bottom-color: #007acc;
}

.dev-panel-content {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.dev-tab-content {
  display: none;
}

.dev-tab-content.active {
  display: block;
}

.dev-table {
  width: 100%;
  border-collapse: collapse;
}

.dev-table th,
.dev-table td {
  padding: 4px 8px;
  text-align: left;
  border-bottom: 1px solid #3e3e3e;
}

.dev-table th {
  background: #2d2d2d;
  font-weight: 600;
}

.dev-table code {
  background: #2d2d2d;
  padding: 2px 4px;
  border-radius: 2px;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/dev-panel.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add js/controllers/dev-panel-controller.js css/dev-panel.css tests/unit/dev-panel.test.js
git commit -m "feat: add DevPanel controller

- Hidden developer panel with 4 tabs
- Metrics: PerformanceProfiler data
- EventBus: Last 100 events
- TabCoordination: Tab status
- ProviderHealth: Provider status
- 5-second auto-refresh"
```

---

### Task 13: Add Keyboard Shortcut for Dev Panel

**Files:**
- Modify: `js/main.js` (or app entry point)
- Test: integration test

**Step 1: Write the failing test**

Create `tests/integration/dev-panel-shortcut.test.js`:

```javascript
import { DevPanel } from '../../js/controllers/dev-panel-controller.js';

describe('Dev Panel Keyboard Shortcut', () => {
  beforeEach(() => {
    localStorage.setItem('rc_dev_mode', 'true');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    DevPanel.hide();
    localStorage.removeItem('rc_dev_mode');
  });

  test('Ctrl+Shift+D toggles dev panel', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'D',
      ctrlKey: true,
      shiftKey: true
    });

    window.dispatchEvent(event);

    expect(DevPanel.isVisible).toBe(true);
  });

  test('Cmd+Shift+D toggles dev panel on Mac', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'D',
      metaKey: true,
      shiftKey: true
    });

    window.dispatchEvent(event);

    expect(DevPanel.isVisible).toBe(true);
  });

  test('shortcut does nothing when dev mode disabled', () => {
    localStorage.removeItem('rc_dev_mode');

    const event = new KeyboardEvent('keydown', {
      key: 'D',
      ctrlKey: true,
      shiftKey: true
    });

    window.dispatchEvent(event);

    expect(DevPanel.isVisible).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/dev-panel-shortcut.test.js`
Expected: FAIL - shortcut handler not set up

**Step 3: Write minimal implementation**

Add to `js/main.js`:

```javascript
import { DevPanel } from './controllers/dev-panel-controller.js';

/**
 * Set up keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+D or Cmd+Shift+D
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      DevPanel.toggle();
    }
  });
}

// Call during app initialization
document.addEventListener('DOMContentLoaded', () => {
  setupKeyboardShortcuts();
  // ... other initialization
});
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/dev-panel-shortcut.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add js/main.js tests/integration/dev-panel-shortcut.test.js
git commit -m "feat: add keyboard shortcut for Dev Panel

- Ctrl+Shift+D (Windows/Linux) or Cmd+Shift+D (Mac) toggles panel
- Only works when dev mode enabled"
```

---

### Task 14: Add Production Build Check to Disable Dev Panel

**Files:**
- Modify: `js/controllers/dev-panel-controller.js`
- Test: `tests/unit/dev-panel.test.js`

**Step 1: Write the failing test**

Add to `tests/unit/dev-panel.test.js`:

```javascript
test('isDevModeEnabled returns false in production build', () => {
  // Mock production build
  const originalBuild = window.__BUILD__;
  Object.defineProperty(window, '__BUILD__', { value: 'production', writable: true });

  localStorage.setItem('rc_dev_mode', 'true');
  const isEnabled = DevPanel.isDevModeEnabled();

  Object.defineProperty(window, '__BUILD__', { value: originalBuild, writable: true });

  expect(isEnabled).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/dev-panel.test.js`
Expected: FAIL - no production check

**Step 3: Write minimal implementation**

Modify `js/controllers/dev-panel-controller.js`:

```javascript
/**
 * Check if dev mode is enabled
 */
static isDevModeEnabled() {
  // Always disabled in production builds
  if (window.__BUILD__ === 'production') {
    return false;
  }

  return localStorage.getItem('rc_dev_mode') === 'true' ||
         new URLSearchParams(window.location.search).has('debug');
}
```

Also ensure build process sets `window.__BUILD__` (add to build config if needed).

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/dev-panel.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add js/controllers/dev-panel-controller.js tests/unit/dev-panel.test.js
git commit -m "feat: disable Dev Panel in production builds

- Check window.__BUILD__ === 'production'
- Prevent dev panel access in production"
```

---

## Final Tasks

### Task 15: Run Full Test Suite

**Step 1:** Run all tests

```bash
npm test
```

**Step 2:** Verify all tests pass

Expected: All tests pass

**Step 3:** Fix any failures

If tests fail, debug and fix issues before proceeding.

**Step 4:** Commit (if any fixes needed)

```bash
git add .
git commit -m "test: fix failing tests after architectural improvements"
```

---

### Task 16: Manual Testing Checklist

**Step 1:** Start application

```bash
npm start
```

**Step 2:** Enable dev mode

```javascript
// In browser console:
localStorage.setItem('rc_dev_mode', 'true')
```

**Step 3:** Test wave telemetry

- Upload a file
- Check console for wave tracking output
- Verify bottlenecks are logged

**Step 4:** Test premium gatekeeper

- Try creating a playlist as free user
- Verify upgrade modal shows correctly
- Check feature access logic

**Step 5:** Test dev panel

- Press `Ctrl+Shift+D`
- Verify all 4 tabs load
- Check data updates every 5 seconds
- Verify `Escape` closes panel

**Step 6:** Test production mode

- Set `window.__BUILD__ = 'production'`
- Verify dev panel doesn't open
- Remove and verify it works again

---

## Success Criteria

After completing all tasks:

- [ ] Wave Telemetry tracks critical events through event chain
- [ ] WaveVisualizer renders timeline and identifies bottlenecks
- [ ] All premium checks use PremiumGatekeeper.checkFeature()
- [ ] Dev Panel opens with `Ctrl+Shift+D` when dev mode enabled
- [ ] All 4 tabs display correct data
- [ ] Production builds disable dev panel
- [ ] All tests pass (100+ tests)
- [ ] No console errors
