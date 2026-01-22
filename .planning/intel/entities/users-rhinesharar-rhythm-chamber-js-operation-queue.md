---
path: /Users/rhinesharar/rhythm-chamber/js/operation-queue.js
type: util
updated: 2026-01-22
status: active
---

# operation-queue.js

## Purpose

Provides queuing and retry logic for non-critical operations that can be deferred when locks are held, implementing the Operation Lock Contract.

## Exports

- **OperationQueue**: Main queue class for managing deferred operations with priority-based execution
- **QueuedOperation**: Represents a single queued operation with retry logic and timeout handling
- **QUEUE_PRIORITY**: Priority levels enum (LOW, NORMAL, HIGH, CRITICAL)
- **QUEUE_STATUS**: Operation status enum (PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED)

## Dependencies

- [[operation-lock.js]]
- [[operation-lock-errors.js]]

## Used By

TBD

## Notes

Operations use `OperationLock.acquireWithTimeout()` to ensure proper lock management. Failed operations due to `LockAcquisitionError` are automatically retried up to `maxAttempts` times with configurable `retryDelay`.