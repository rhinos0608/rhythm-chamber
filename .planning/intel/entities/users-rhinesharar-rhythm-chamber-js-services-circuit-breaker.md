---
path: /Users/rhinesharar/rhythm-chamber/js/services/circuit-breaker.js
type: service
updated: 2026-01-22
status: active
---

# circuit-breaker.js

## Purpose

Implements circuit breaker pattern for function calling to prevent runaway tool execution with timeout enforcement and state-based call throttling.

## Exports

- `CircuitBreaker` - Circuit breaker service with check/recordCall/recordSuccess/recordFailure/recordTrip/reset/newTurn API

## Dependencies

None

## Used By

TBD

## Notes

- Sequential function calls (no per-turn count limit)
- 5s timeout per function, 1-minute cooldown after trip
- States: CLOSED (normal) → OPEN (rejecting) → HALF_OPEN (testing)
- HNW-patterned: single authority, cascade prevention, per-turn reset