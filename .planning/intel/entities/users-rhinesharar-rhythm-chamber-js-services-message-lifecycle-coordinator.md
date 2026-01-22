---
path: /Users/rhinesharar/rhythm-chamber/js/services/message-lifecycle-coordinator.js
type: service
updated: 2026-01-22
status: active
---

# message-lifecycle-coordinator.js

## Purpose

Manages message lifecycle operations including creation, mutation, and deletion while coordinating with ConversationOrchestrator for context management and ensuring deterministic turn ordering via TurnQueue serialization.

## Exports

- **MessageLifecycleCoordinator** - Main service class for coordinating message lifecycle operations

## Dependencies

- [[turn-queue]]
- [[timeout-budget-manager]]
- [[timeouts-config]]
- SessionManager (injected)
- ConversationOrchestrator (injected)
- LLMProviderRoutingService (injected)
- ToolCallHandlingService (injected)
- TokenCountingService (injected)
- FallbackResponseService (injected)
- CircuitBreaker (injected)
- ModuleRegistry (injected)
- Settings (injected)
- Config (injected)
- Functions (injected)
- WaveTelemetry (injected)
- MessageOperations (injected)

## Used By

TBD

## Notes

Implements HNW compliance with write operations and TurnQueue serialization. Uses dependency injection via init() pattern. Includes message deduplication through content hashing (FNV-1a inspired) and validation with size limits (50k char max). Tracks fallback notification state to prevent duplicate user notifications.