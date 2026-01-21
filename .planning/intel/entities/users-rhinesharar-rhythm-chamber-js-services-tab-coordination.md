---
path: /Users/rhinesharar/rhythm-chamber/js/services/tab-coordination.js
type: service
updated: 2026-01-21
status: active
---

# tab-coordination.js

## Purpose

Cross-tab coordination service using BroadcastChannel with deterministic leader election to prevent data corruption from multiple tabs (HNW architecture).

## Exports

- **TabCoordinator** - Main coordinator class managing cross-tab communication, leader election, and state synchronization

## Dependencies

- [[vector-clock]]
- [[wave-telemetry]]
- [[event-bus]]
- [[device-detection]]
- [[shared-worker-coordinator]]
- [[security]]

## Used By

TBD

## Notes

- Implements adaptive election window based on device performance (300-600ms)
- Uses VectorClock for deterministic ordering to eliminate clock skew
- Part of HNW (Hardware Neural Wave) architecture for multi-tab safety