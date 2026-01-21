---
path: /Users/rhinesharar/rhythm-chamber/js/main.js
type: module
updated: 2026-01-21
status: active
---

# main.js

## Purpose

Application entry point that orchestrates security initialization, module imports in dependency order, and startup coordination for the entire Rhythm Chamber application.

## Exports

None

## Dependencies

[[logger]], [[security/index]], [[window-globals-debug]], [[config-loader]], [[utils]], [[module-registry]], [[storage/keys]], [[storage/indexeddb]], [[storage/config-api]], [[storage/migration]], [[storage/sync-strategy]], [[storage/profiles]], [[storage]], [[state/app-state]], [[patterns]], [[personality]], [[data-query]], [[prompts]], [[parser]], [[genre-enrichment]], [[token-counter]], [[providers/provider-interface]], [[providers/openrouter]], [[providers/lmstudio]], [[providers/gemini]], [[spotify]], [[settings]], [[chat]], [[services/conversation-orchestrator]], [[services/message-lifecycle-coordinator]], [[cards]], [[functions/utils/retry]], [[functions/utils/validation]], [[functions/schemas/data-queries]], [[functions/schemas/template-queries]], [[functions/schemas/analytics-queries]], [[functions/executors/data-executors]], [[functions/executors/template-executors]], [[functions/executors/analytics-executors]], [[functions/index]], [[services/tab-coordination]], [[services/session-manager]], [[services/message-operations]], [[services/worker-coordinator]], [[services/event-bus]], [[storage/event-log-store]], [[controllers/chat-ui-controller]], [[controllers/sidebar-controller]], [[controllers/view-controller]], [[controllers/file-upload-controller]], [[controllers/spotify-controller]], [[controllers/demo-controller]], [[controllers/reset-controller]], [[demo-data]], [[template-profiles]], [[profile-synthesizer]], [[operation-lock]], [[payments]], [[pricing]], [[storage/quota-monitor]], [[services/circuit-breaker]], [[security/secure-token-store]], [[services/data-version]], [[services/function-calling-fallback]], [[services/profile-description-generator]], [[services/llm-provider-routing-service]], [[services/token-counting-service]], [[services/tool-call-handling-service]], [[services/fallback-response-service]], [[services/error-boundary]]

## Used By

TBD

## Notes

Performs security validation first, fails gracefully to Safe Mode if insecure context. Configures logger before all other imports. Modules imported in strict dependency order. No exports - pure initialization module.