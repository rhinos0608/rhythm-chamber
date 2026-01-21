---
path: /Users/rhinesharar/rhythm-chamber/tests/unit/session-manager.test.js
type: test
updated: 2026-01-21
status: active
---

# session-manager.test.js

## Purpose

Unit tests for the session lifecycle management service, covering session creation, retrieval, deletion, and tab synchronization functionality.

## Exports

None

## Dependencies

- [[session-manager]]
- [[event-bus]]
- [[data-version]]
- [[storage]]
- vitest

## Used By

TBD

## Notes

Uses comprehensive mocks for Storage, EventBus, DataVersion, localStorage, sessionStorage, and window objects. Provides helper function `createMockSession()` for test data generation.