---
path: /Users/rhinesharar/rhythm-chamber/js/chat.js
type: module
updated: 2026-01-21
status: active
---

# chat.js

## Purpose

Central chat orchestration module that coordinates API calls, prompt building, and function calling while delegating specialized concerns to focused service modules.

## Exports

- **Chat**: Main chat orchestration class that manages conversation flow, tool calling, and LLM interactions

## Dependencies

[[logger]], [[native-strategy]], [[prompt-injection-strategy]], [[intent-extraction-strategy]], [[module-registry]], [[config-loader]], [[turn-queue]], [[timeout-budget-manager]], [[wave-telemetry]], [[llm-provider-routing-service]], [[token-counting-service]], [[tool-call-handling-service]], [[fallback-response-service]], [[circuit-breaker]], [[function-calling-fallback]], [[functions]], [[message-operations]], [[session-manager]], [[token-counter]], [[prompts]], [[storage]], [[patterns]], [[personality]], [[parser]], [[data-query]], [[provider-interface]], [[settings]], [[conversation-orchestrator]], [[message-lifecycle-coordinator]]

## Used By

TBD

## Notes

This is a coordination facade that delegates to specialized services per HNW (High-level Network Wrestling) architecture pattern. It does not directly manage session state, message operations, or LLM calls—those are delegated to focused service modules.