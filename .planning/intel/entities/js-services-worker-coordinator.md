---
path: /Users/rhinesharar/rhythm-chamber/js/services/worker-coordinator.js
type: service
updated: 2026-01-21
status: active
---

# worker-coordinator.js

## Purpose

Centralized Web Worker lifecycle management with race condition prevention, automatic cleanup, and health monitoring. Provides single authority for all worker operations, coordinating worker communication via registry pattern with deterministic cleanup timing.

## Exports

- `WorkerCoordinator` - Main coordinator service
- `WorkerType` - Enum for worker types (PARSER, EMBEDDING, PATTERN, VECTOR_SEARCH, PATTERN_POOL)
- `registerWorker(type, options)` - Register a worker type with configuration
- `unregisterWorker(type)` - Unregister and clean up a worker type
- `createWorker(type, workerPath, initHandlers)` - Create/retrieve worker with race prevention
- `terminateWorker(type)` - Terminate specific worker
- `terminateAll()` - Terminate all registered workers (called on page unload)
- `cleanupIdleWorkers()` - Clean up idle non-persistent workers (>5 min idle)
- `resetHeartbeat(type)` - Reset heartbeat counter (called when worker responds)
- `getHealthStatus()` - Get health status of all workers
- `getRegistryInfo()` - Get registry information for debugging
- `getStats()` - Get statistics about worker usage
- `enableDebugMode()` - Enable detailed logging
- `disableDebugMode()` - Disable debug mode
- `init()` - Initialize the coordinator with default worker types
- `destroy()` - Cleanup the coordinator

## Dependencies

- None (core service with no dependencies)

## Used By

TBD

## Notes

Implements promise-based initialization to prevent race conditions. Provides automatic memory leak prevention with heartbeat monitoring (3 missed heartbeats = stale). Registers 5 default worker types: parser, embedding, pattern, vector_search, pattern_pool.