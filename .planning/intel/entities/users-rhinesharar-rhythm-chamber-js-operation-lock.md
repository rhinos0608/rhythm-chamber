---
path: /Users/rhinesharar/rhythm-chamber/js/operation-lock.js
type: util
updated: 2026-01-22
status: active
---

# operation-lock.js

## Purpose

Provides mutual exclusion for destructive operations to prevent concurrent state corruption through an operation locking mechanism with guard, acquire, and timeout patterns.

## Exports

- **OperationLock** - Main lock system with static methods for isLocked, acquire, acquireWithTimeout, release, and forceRelease operations

## Dependencies

[[operation-lock-errors.js]]

## Used By

TBD

## Notes

Supports three usage patterns: Guard (quick check/abort), Acquire (blocking exclusive access), and Acquire with Timeout. Includes inline fallback error classes to ensure instanceof checks work correctly if external module fails. Part of HNW Hierarchy fix. Never use isLocked() as guard then immediately acquire() due to race condition.