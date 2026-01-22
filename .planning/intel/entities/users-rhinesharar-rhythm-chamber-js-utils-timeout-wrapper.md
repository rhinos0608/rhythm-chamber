---
path: /Users/rhinesharar/rhythm-chamber/js/utils/timeout-wrapper.js
type: util
updated: 2026-01-22
status: active
---

# timeout-wrapper.js

## Purpose

Provides timeout-based recovery mechanisms with progressive escalation for async operations, preventing cascade failures and ensuring predictable timing behavior with fallback paths.

## Exports

- **TimeoutError**: Custom error class for timeout conditions with operation context
- **withTimeout**: Wraps a promise with configurable timeout and optional fallback
- **withProgressiveTimeout**: Implements progressive timeout strategy with escalating durations
- **createTimeoutWrapper**: Factory function for creating reusable timeout wrappers
- **raceWithTimeouts**: Races multiple operations with individual timeouts
- **createTimeoutAbortController**: Creates AbortController integrated with timeout
- **sleep**: Promise-based delay utility
- **TimeoutWrapper**: Class-based timeout wrapper with state management

## Dependencies

None

## Used By

TBD

## Notes

- All timeout functions include cleanup to prevent memory leaks
- Supports AbortController integration for cancellation
- HNW-aligned: single authority for timeout enforcement, prevents network cascade failures