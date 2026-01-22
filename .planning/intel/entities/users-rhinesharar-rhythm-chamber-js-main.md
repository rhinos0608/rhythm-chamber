---
path: /Users/rhinesharar/rhythm-chamber/js/main.js
type: module
updated: 2026-01-22
status: active
---

# main.js

## Purpose

Main application entry point that orchestrates security initialization, module imports, and application startup in dependency order.

## Exports

None

## Dependencies

[[logger]], [[security]], [[config-loader]], [[utils]], [[module-registry]], [[storage/keys]], [[storage/indexeddb]], [[storage/config-api]], [[storage/migration]], [[storage/sync-strategy]], [[storage/profiles]], [[storage]], [[app-state]], [[patterns]], [[personality]], [[data-query]], [[prompts]], [[parser]], [[genre-enrichment]], [[token-counter]], [[provider-interface]], [[openrouter]], [[lmstudio]], [[gemini]], [[spotify]], [[settings]], [[chat]], [[conversation-orchestrator]], [[message-lifecycle-coordinator]], [[cards]], [[retry]], [[validation]], [[data-queries]], [[template-queries]], [[analytics-queries]], [[data-executors]], [[template-executors]], [[analytics-executors]], [[functions]], [[tab-coordination]], [[session-manager]], [[message-operations]], [[worker-coordinator]], [[event-bus]], [[event-log-store]], [[chat-ui-controller]], [[sidebar-controller]], [[view-controller]], [[file-upload-controller]], [[spotify-controller]], [[demo-controller]], [[reset-controller]], [[demo-data]], [[template-profiles]], [[profile-synthesizer]], [[operation-lock]], [[payments]], [[pricing]], [[quota-monitor]], [[circuit-breaker]], [[secure-token-store]], [[data-version]], [[function-calling-fallback]], [[profile-description-generator]], [[llm-provider-routing-service]], [[token-counting-service]], [[tool-call-handling-service]], [[fallback-response-service]], [[error-boundary]]

## Used By

TBD

## Notes

Performs security validation first and enters Safe Mode if context is not secure. Configures logging before any other imports.