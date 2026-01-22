---
path: /Users/rhinesharar/rhythm-chamber/js/workers/shared-worker-coordinator.js
type: service
updated: 2026-01-22
status: active
---

# shared-worker-coordinator.js

## Purpose

Client-side coordinator for SharedWorker fallback when BroadcastChannel is unavailable, providing seamless API compatibility with TabCoordination.

## Exports

- `SharedWorkerCoordinator` - Main coordinator module with unified message interface, automatic reconnection, heartbeat monitoring, and graceful degradation

## Dependencies

- [[timeouts.js]] (WORKER_TIMEOUTS configuration)

## Used By

TBD

## Notes

Implements BroadcastChannel-compatible API surface with automatic reconnection on worker death and liveness detection via heartbeat. Falls back gracefully if SharedWorker is unavailable in the browser.