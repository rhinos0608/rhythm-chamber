---
path: /Users/rhinesharar/rhythm-chamber/js/services/tool-call-handling-service.js
type: service
updated: 2026-01-21
status: active
---

# tool-call-handling-service.js

## Purpose

Handles LLM-requested tool calls with fallback support for models without native function calling. Separates tool call concerns from chat orchestration.

## Exports

- `ToolCallHandlingService` - Main service object with init, handleToolCalls, and strategy management methods

## Dependencies

- [[timeout-budget-manager]]
- [[native-strategy]]
- [[prompt-injection-strategy]]
- [[intent-extraction-strategy]]
- CircuitBreaker (injected)
- Functions (injected)
- SessionManager (injected)
- FunctionCallingFallback (injected)
- ConversationOrchestrator (injected)

## Used By

TBD

## Notes

Circuit breaker limits: max 5 function calls per turn, 30s timeout per function. Strategies include native tool calling, prompt injection fallback, and intent extraction fallback.