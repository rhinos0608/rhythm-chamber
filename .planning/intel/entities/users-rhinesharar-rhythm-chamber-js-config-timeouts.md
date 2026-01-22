---
path: /Users/rhinesharar/rhythm-chamber/js/config/timeouts.js
type: config
updated: 2026-01-22
status: active
---

# timeouts.js

## Purpose

Centralized timeout configuration module serving as the single source of truth for all timeout, interval, and delay constants across the application to ensure consistency and simplify configuration changes.

## Exports

- **LLM_TIMEOUTS** - Timeout constants for LLM provider operations (cloud APIs, local LLMs, function/tool execution, model listing)
- **NETWORK_TIMEOUTS** - Network and API request timeout values
- **WORKER_TIMEOUTS** - Worker coordination timeouts (heartbeats, reconnection, stale detection, leadership claims)
- **OPERATION_TIMEOUTS** - Operation and lock timeout values
- **RETRY_TIMEOUTS** - Retry and backoff delay configuration
- **STORAGE_TIMEOUTS** - Storage operation timeout constants
- **COORDINATION_TIMEOUTS** - Distributed coordination timeouts
- **OBSERVABILITY_TIMEOUTS** - Observability and monitoring interval values
- **CIRCUIT_BREAKER_TIMEOUTS** - Circuit breaker pattern timeout configuration
- **PATTERN_TIMEOUTS** - Various pattern-related timeout constants
- **default** - Default export (aliased as Timeouts)

## Dependencies

None

## Used By

TBD

## Notes

All timeout values are specified in milliseconds unless otherwise indicated. This module prevents inconsistent timeout values across different parts of the application by centralizing all constants.