---
path: /Users/rhinesharar/rhythm-chamber/js/services/message-lifecycle-coordinator.js
type: service
updated: 2026-01-21
status: active
---

# message-lifecycle-coordinator.js

## Purpose

Manages the complete message lifecycle including creation, mutation, and deletion. Coordinates with ConversationOrchestrator for context management and provides message processing with timeout budgeting.

## Exports

- `MessageLifecycleCoordinator` - Main coordinator object with `init()` and `sendMessage()` functions

## Dependencies

- [[turn-queue]]
- [[timeout-budget-manager]]
- [[session-manager]]
- [[conversation-orchestrator]]
- [[llm-provider-routing-service]]
- [[tool-call-handling-service]]
- [[token-counting-service]]
- [[fallback-response-service]]
- [[circuit-breaker]]
- [[module-registry]]
- [[settings]]
- [[config]]
- [[functions]]
- [[wave-telemetry]]

## Used By

TBD

## Notes

- HNW compliant with TurnQueue serialization for deterministic ordering
- Dependency injection via init() pattern
- Supports bypassQueue option for internal operations
- Client-side token counting to prevent context window limits
- Constants: CHAT_API_TIMEOUT_MS (60000), LOCAL_LLM_TIMEOUT_MS (90000), CHAT_FUNCTION_TIMEOUT_MS (30000)