---
path: /Users/rhinesharar/rhythm-chamber/js/main.js
type: module
updated: 2026-01-21
status: active
---

# main.js

## Purpose

Single ES Module entry point for the application. Handles security initialization (fail-fast), imports all modules in dependency order, and manages application startup.

## Exports

None

## Dependencies

[[js-security-index]], [[js-window-globals-debug]], [[js-services-config-loader]], [[js-utils]], [[js-module-registry]], [[js-storage-keys]], [[js-storage-indexeddb]], [[js-storage-config-api]], [[js-storage-migration]], [[js-storage-sync-strategy]], [[js-storage-profiles]], [[js-storage]], [[js-state-app-state]], [[js-patterns]], [[js-personality]], [[js-data-query]], [[js-prompts]], [[js-parser]], [[js-genre-enrichment]], [[js-token-counter]], [[js-providers-provider-interface]], [[js-providers-openrouter]], [[js-providers-lmstudio]], [[js-providers-gemini]], [[js-spotify]], [[js-settings]], [[js-chat]], [[js-services-conversation-orchestrator]], [[js-services-message-lifecycle-coordinator]], [[js-cards]], [[js-functions-utils-retry]], [[js-functions-utils-validation]], [[js-functions-schemas-data-queries]], [[js-functions-schemas-template-queries]], [[js-functions-schemas-analytics-queries]], [[js-functions-executors-data-executors]], [[js-functions-executors-template-executors]], [[js-functions-executors-analytics-executors]], [[js-functions-index]], [[js-services-tab-coordination]], [[js-services-session-manager]], [[js-services-message-operations]], [[js-services-worker-coordinator]], [[js-services-event-bus]], [[js-storage-event-log-store]], [[js-controllers-chat-ui-controller]], [[js-controllers-sidebar-controller]], [[js-controllers-view-controller]], [[js-controllers-file-upload-controller]], [[js-controllers-spotify-controller]], [[js-controllers-demo-controller]], [[js-controllers-reset-controller]], [[js-demo-data]], [[js-template-profiles]], [[js-profile-synthesizer]], [[js-operation-lock]], [[js-payments]], [[js-pricing]], [[js-storage-quota-monitor]], [[js-services-circuit-breaker]], [[js-security-secure-token-store]], [[js-services-data-version]], [[js-services-function-calling-fallback]], [[js-services-profile-description-generator]], [[js-services-llm-provider-routing-service]], [[js-services-token-counting-service]], [[js-services-tool-call-handling-service]], [[js-services-fallback-response-service]], [[js-services-error-boundary]]

## Used By

TBD

## Notes

Performs security context validation immediately before any other imports. Enters Safe Mode if security check fails rather than throwing. Heavy modules (Ollama, RAG, LocalVectorStore) are registered with ModuleRegistry for lazy loading.