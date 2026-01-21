---
path: /Users/rhinesharar/rhythm-chamber/js/utils.js
type: util
updated: 2026-01-21
status: active
---

# utils.js

## Purpose

Provides resilient network utilities with timeouts, retries, and circuit breaker for storage fallback operations. Implements fetch helpers with exponential backoff and authentication retry support.

## Exports

- `Utils` - Main utilities service
- `fetchWithTimeout(url, options, timeoutMs)` - Fetch with timeout and external abort signal
- `fetchWithRetry(url, options, retryConfig)` - Fetch with exponential backoff retry
- `fetchWithAuth(url, options, authConfig)` - Fetch with authentication retry (401 handling)
- `sleep(ms)` - Sleep utility for delays
- `simpleHash(data)` - Generate simple hash for data comparison
- `debounce(func, waitMs)` - Debounce function calls
- `formatDuration(seconds)` - Format duration for display
- `StorageCircuitBreaker` - Circuit breaker for storage fallback operations

## Dependencies

- fetch - HTTP requests
- AbortController - Timeout and cancellation

## Used By

TBD

## Notes

StorageCircuitBreaker prevents 4 serial timeout attempts (2+ min waits) during onboarding by failing fast after 2 consecutive failures. 30-second cooldown before retry. External abort signal support allows user-initiated cancellation.