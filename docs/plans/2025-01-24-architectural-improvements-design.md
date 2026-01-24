# Architectural Improvements Design

**Date:** 2025-01-24
**Status:** Approved

## Overview

Three architectural improvements to address technical debt, developer experience, and observability gaps in Rhythm Chamber.

1. **Wave Propagation Telemetry** - Trace event flow through the system
2. **Premium Gatekeeper Consolidation** - Unify scattered premium feature checks
3. **Observability Dev Panel** - Expose debugging UI via keyboard shortcut

---

## 1. Wave Propagation Telemetry

### Problem

Current `WaveTelemetry` only tracks basic timing anomalies (heartbeat intervals). No visibility into:
- How events propagate through the system
- Critical path identification for performance
- Bottleneck detection in event chains

### Solution

Extend `js/services/wave-telemetry.js` with wave context tracking and visualization.

### Architecture

```
User Action → Event → Handlers → Side Effects
     ↓           ↓          ↓            ↓
  [startWave] [emit]   [recordNode]  [recordNode]
     ↓           ↓          ↓            ↓
              Wave Context (propagates via EventBus)
```

### Data Structure

```javascript
{
  waveId: 'uuid-v4',
  origin: 'user:upload_file',
  startTime: timestamp,
  chain: [
    { node: 'event:file_uploaded', timestamp: t1, parent: null, duration: null },
    { node: 'handler:parser.process_streams', timestamp: t2, parent: 'event:file_uploaded', duration: t2-t1 },
    { node: 'handler:patterns.detect', timestamp: t3, parent: 'parser.process_streams', duration: t3-t2 },
    { node: 'effect:ui.reveal_personality', timestamp: t4, parent: 'patterns.detect', duration: t4-t3 }
  ],
  totalLatency: t4 - t0,
  bottlenecks: [nodes where duration > threshold]
}
```

### API

```javascript
// Auto-instrumented for critical events
WaveTelemetry.setCriticalEvents(['file_uploaded', 'pattern:all_complete', ...]);

// Manual opt-in
const waveId = WaveTelemetry.startWave('user:custom_action');
WaveTelemetry.recordNode('processing_step', waveId);
WaveTelemetry.endWave(waveId);

// Visualization
WaveVisualizer.render(waveId); // Returns HTML for timeline view
WaveVisualizer.findBottlenecks(waveId); // Returns slowest nodes
```

### Critical Events (Auto-tracked)

- `file_uploaded` - Initial file processing
- `pattern:all_complete` - Pattern detection finished
- `embedding:generation_complete` - Embedding creation
- `streams:processed` - Stream parsing complete

### Files

- **Create:** `js/services/wave-visualizer.js`
- **Modify:** `js/services/wave-telemetry.js`
- **Modify:** `js/controllers/event-bus.js` - Inject wave context
- **Create:** `tests/unit/wave-visualizer.test.js`
- **Modify:** `tests/unit/wave-telemetry.test.js`

---

## 2. Premium Gatekeeper Consolidation

### Problem

Premium feature checks scattered across 5+ files:
- `js/payments.js` - `isPremium()`
- `js/services/premium-quota.js` - `canCreatePlaylist()`
- `js/services/license-service.js` - License verification
- `js/controllers/premium-controller.js` - Upgrade flow
- `js/services/playlist-service.js` - Quota checks

### Solution

Unified `PremiumGatekeeper` class as single source of truth.

### Architecture

```
┌─────────────────────────────────────────────┐
│          PremiumGatekeeper                   │
│  ┌─────────────────────────────────────┐    │
│  │ checkFeature(featureName)            │    │
│  │   → LicenseVerifier.loadLicense()    │    │
│  │   → PremiumQuota.getQuotaStatus()    │    │
│  │   → { allowed, reason, tier, ... }   │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
           ↓                ↓
    [LicenseVerifier] [PremiumQuota]
```

### API

```javascript
const access = await PremiumGatekeeper.checkFeature('semantic_search');
// Returns:
{
  allowed: boolean,
  reason: 'NO_LICENSE' | 'QUOTA_EXCEEDED' | 'LICENSE_EXPIRED' | 'FEATURE_NOT_FOUND',
  tier: 'sovereign' | 'chamber',
  quotaRemaining: number,
  upgradeUrl: '/upgrade.html'
}
```

### Feature Registry

```javascript
const FEATURES = {
  unlimited_playlists: { requiresLicense: false, checkQuota: true },
  semantic_search: { requiresLicense: true, checkQuota: false },
  personality_insights: { requiresLicense: true, checkQuota: false },
  export_advanced: { requiresLicense: true, checkQuota: false }
};
```

### Migration (Complete)

Replace all scattered checks:

| File | Before | After |
|------|--------|-------|
| `payments.js` | `isPremium()` | `PremiumGatekeeper.checkFeature('*')` |
| `premium-quota.js` | `canCreatePlaylist()` | `PremiumGatekeeper.checkFeature('unlimited_playlists')` |
| `playlist-service.js` | Direct quota check | `PremiumGatekeeper.checkFeature('unlimited_playlists')` |
| `premium-controller.js` | Mixed check | `PremiumGatekeeper.checkFeature(...)` |

### Files

- **Create:** `js/services/premium-gatekeeper.js`
- **Modify:** `js/payments.js`
- **Modify:** `js/services/premium-quota.js`
- **Modify:** `js/controllers/premium-controller.js`
- **Modify:** `js/services/playlist-service.js`
- **Create:** `tests/unit/premium-gatekeeper.test.js`

---

## 3. Observability Dev Panel

### Problem

ObservabilityController has rich data but no developer-facing UI for debugging in production/staging.

### Solution

Hidden developer panel accessible via keyboard shortcut.

### Activation

- **Keyboard:** `Ctrl+Shift+D` (or `Cmd+Shift+D` on Mac)
- **Persistence:** `localStorage.setItem('rc_dev_mode', 'true')`
- **Query param:** `?debug=true`
- **Production:** Disabled at build time

### UI Structure

Modal overlay with 4 tabs:

| Tab | Content | Data Source |
|-----|---------|-------------|
| Metrics | PerformanceProfiler data, Web Vitals | `PerformanceProfiler.getComprehensiveReport()` |
| EventBus | Last 100 events, timestamps, payloads | `EventBus.getEventHistory(100)` |
| TabCoordination | Connected tabs, heartbeat, election | `TabCoordinator.getTabStatus()` |
| ProviderHealth | LLM status, response times, errors | `ProviderHealthAuthority.getAllHealth()` |

### Required Extensions

```javascript
// EventBus - add event history (circular buffer)
EventBus.getEventHistory(limit);

// TabCoordinator - expose tab status
TabCoordinator.getTabStatus();

// ProviderHealthAuthority - expose health
ProviderHealthAuthority.getAllHealth();
```

### Files

- **Create:** `js/controllers/dev-panel-controller.js`
- **Modify:** `js/controllers/event-bus.js` - Add history tracking
- **Modify:** `js/services/tab-coordination.js` - Add status API
- **Modify:** `js/services/llm-provider-routing-service.js` - Add health API
- **Create:** `css/dev-panel.css`
- **Create:** `tests/unit/dev-panel.test.js`

---

## Implementation Order

1. **Wave Telemetry** (smallest, establishes patterns)
2. **Premium Gatekeeper** (medium, uses testing patterns)
3. **Dev Panel** (largest, depends on telemetry)

## Success Criteria

- Wave: Can trace critical event paths, identify bottlenecks
- Gatekeeper: Single API for all premium checks, all tests pass
- Dev Panel: `Ctrl+Shift+D` opens panel, shows real-time data
