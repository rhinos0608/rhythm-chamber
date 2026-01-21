---
path: /Users/rhinesharar/rhythm-chamber/js/utils.js
type: util
updated: 2026-01-21
status: active
---

# utils.js

## Purpose

Provides resilient network utilities with timeout support, exponential backoff retry logic, and request cancellation capabilities for HTTP operations.

## Exports

- `fetchWithTimeout()` - Fetch wrapper with timeout and external abort signal support
- `fetchWithRetry()` - Fetch with exponential backoff retry for configurable HTTP status codes
- `sleep()` - Promise-based delay utility

## Dependencies

None

## Used By

TBD

## Notes

Supports user-initiated request cancellation through external AbortSignal. Distinguishes between timeout and manual cancellation in error handling. Implements exponential backoff with configurable max delay ceiling.