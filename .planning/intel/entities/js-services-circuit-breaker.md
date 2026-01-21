---
path: /Users/rhinesharar/rhythm-chamber/js/services/circuit-breaker.js
type: service
updated: 2026-01-21
status: active
---

# circuit-breaker.js

## Purpose

Implements circuit breaker pattern for function calling limits. Prevents runaway tool execution with timeout enforcement (5s per function) and circuit state management (open/half-open/closed). No call count limits - uses sequential async/await execution instead.

## Exports

- `CircuitBreaker` - Circuit breaker service
- `TIMEOUT_MS` - 5 second timeout per function
- `STATE` - Circuit states (CLOSED, OPEN, HALF_OPEN)
- `check()` - Check if function call is allowed
- `recordCall()` - Record a function call before execution
- `recordSuccess(functionName, durationMs)` - Record successful execution
- `recordFailure(functionName, error)` - Record failed execution
- `trip(reason)` - Trip the circuit breaker
- `resetTurn()` - Reset for new message turn
- `forceReset()` - Emergency reset
- `getStatus()` - Get current circuit breaker status
- `execute(functionName, fn)` - Execute function with circuit breaker protection
- `getErrorMessage(reason)` - Get user-friendly error message

## Dependencies

- None (standalone circuit breaker implementation)

## Used By

TBD

## Notes

Previously had MAX_CALLS_PER_TURN limit but removed per user request. Now uses sequential execution with only timeout and circuit open/close state enforcement. Provides 1 minute cooldown after circuit trips.