---
path: /Users/rhinesharar/rhythm-chamber/js/services/tool-call-handling-service.js
type: service
updated: 2026-01-21
status: active
---

# tool-call-handling-service.js

## Purpose

Handles LLM-requested tool calls with fallback support for models without native function calling. Extracted from chat.js to separate tool call concerns from chat orchestration.

## Exports

- **ToolCallHandlingService** - Main service object containing initialization, execution, retry logic, and strategy management for tool calls

## Dependencies

- [[native-strategy]]
- [[prompt-injection-strategy]]
- [[intent-extraction-strategy]]
- [[timeout-budget-manager]]
- [[provider-health-authority]]

## Used By

TBD

## Notes

Service uses retry logic with exponential backoff for transient errors. Supports multiple tool calling strategies (native, prompt injection, intent extraction) based on model capabilities. Maintains backward compatibility with CircuitBreaker through ProviderHealthAuthority.