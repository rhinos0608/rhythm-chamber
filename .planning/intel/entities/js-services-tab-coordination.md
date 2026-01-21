---
path: /Users/rhinesharar/rhythm-chamber/js/services/tab-coordination.js
type: service
updated: 2026-01-21
status: active
---

# tab-coordination.js

## Purpose

Cross-tab coordination using VectorClock for ordering and leader election. Implements message security verification pipeline with adaptive timing for mobile devices. Handles clock skew calibration and tracking.

## Exports

- `TabCoordinator` - Tab coordination service
- `init()` - Initialize tab coordination (BroadcastChannel or SharedWorker)
- `isLeader()` - Check if current tab is leader
- `broadcastMessage(message)` - Broadcast message to other tabs
- `onMessage(callback)` - Register message handler
- `getVectorClock()` - Get current vector clock state
- `mergeVectorClock(clock)` - Merge vector clock from another tab
- `getClockSkew()` - Get current clock skew estimate
- `calibrateClockSkew()` - Calibrate clock skew with leader

## Dependencies

- BroadcastChannel or SharedWorker - Cross-tab communication
- [[js-services-event-bus]] - Internal event coordination
- [[js-security-message-security]] - Message verification

## Used By

TBD

## Notes

Key feature: Leader election prevents duplicate work across tabs. VectorClock ensures causal ordering of messages. Adaptive timing increases intervals on mobile to save battery. Clock skew calibration handles system time differences between tabs.