---
path: /Users/rhinesharar/rhythm-chamber/js/chat.js
type: module
updated: 2026-01-21
status: active
---

# chat.js

## Purpose

Chat orchestration module coordinating API calls, prompt building, and function calling while delegating specialized concerns to service layer components.

## Exports

- **Chat**: Main chat controller class managing conversation flow, tool strategies, and message lifecycle

## Dependencies

[[js-services-tool-strategies-native-strategy]], [[js-services-tool-strategies-prompt-injection-strategy]], [[js-services-tool-strategies-intent-extraction-strategy]], [[module-registry]], [[js-services-config-loader]], [[js-services-turn-queue]], [[js-services-timeout-budget-manager]], [[js-services-wave-telemetry]], [[js-services-llm-provider-routing-service]], [[js-services-token-counting-service]], [[js-services-tool-call-handling-service]], [[js-services-fallback-response-service]], [[js-services-circuit-breaker]], [[js-services-function-calling-fallback]], [[js-services-message-operations]], [[js-services-session-manager]], [[token-counter]], [[prompts]], [[storage]], [[patterns]], [[personality]], [[parser]], [[data-query]], [[js-providers-provider-interface]], [[settings]], [[js-services-conversation-orchestrator]], [[js-services-message-lifecycle-coordinator]]

## Used By

TBD

## Notes

Implements HNW (Has-Needs-Wheres) compliant architecture with clear delegation boundaries. Session state management, message operations, and LLM calls are delegated to specialized services. Supports multiple tool strategies (Native, PromptInjection, IntentExtraction) for function calling.