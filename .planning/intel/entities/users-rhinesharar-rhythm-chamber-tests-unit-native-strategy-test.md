---
path: /Users/rhinesharar/rhythm-chamber/tests/unit/native-strategy.test.js
type: test
updated: 2026-01-21
status: active
---

# native-strategy.test.js

## Purpose

Unit tests for the NativeToolStrategy class that validates native function calling detection, execution, error handling, and tool call transformation behavior using Vitest.

## Exports

None

## Dependencies

- vitest
- [[circuit-breaker]]
- [[functions]]
- [[session-manager]]
- [[timeout-budget-manager]]
- [[native-strategy]]

## Used By

TBD

## Notes

Uses comprehensive mocking of dependencies including CircuitBreaker, Functions, SessionManager, and TimeoutBudget. Tests cover strategy detection confidence scoring, permission validation, concurrent execution handling, tool call transformation, and various error scenarios.