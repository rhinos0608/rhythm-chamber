---
path: /Users/rhinesharar/rhythm-chamber/js/services/tab-coordination.js
type: service
updated: 2026-01-21
status: active
---

# tab-coordination.js

## Purpose

Cross-tab coordination service using BroadcastChannel with deterministic leader election to prevent data corruption from multiple tabs (part of HNW architecture).

## Exports

- `TabCoordinator` - Main coordinator class handling cross-tab communication, leader election, and state synchronization

## Dependencies

- [[vector-clock.js]]
- [[wave-telemetry.js]]
- [[event-bus.js]]
- [[device-detection.js]]
- [[shared-worker-coordinator.js]]
- [[security/index.js]]
- [[app-state.js]]
- [[html-escape.js]]

## Used By

TBD

## Notes

Implements adaptive election window based on device performance (300-600ms range). Uses VectorClock for deterministic ordering to eliminate clock skew issues between tabs.