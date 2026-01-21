---
path: /Users/rhinesharar/rhythm-chamber/tests/unit/tool-call-handling-service.test.js
type: test
updated: 2026-01-21
status: active
---

# tool-call-handling-service.test.js

## Purpose

Unit tests for the tool call orchestration service, validating retry logic, fallback strategies, and error classification behavior.

## Exports

None

## Dependencies

- vitest (external)
- [[js-services-tool-call-handling-service-js]] (tested module)
- [[js-services-circuit-breaker-js]] (mocked)
- [[js-functions-index-js]] (mocked)
- [[js-services-session-manager-js]] (mocked)
- [[js-services-function-calling-fallback-js]] (mocked)
- [[js-services-timeout-budget-manager-js]] (mocked)
- [[js-services-conversation-orchestrator-js]] (mocked)

## Used By

Test runner (vitest)

## Notes

Uses vi.mock() to isolate the service under test. Mocks are reset before each test to ensure test isolation. Tests cover error classification, retry logic, and fallback mechanisms.