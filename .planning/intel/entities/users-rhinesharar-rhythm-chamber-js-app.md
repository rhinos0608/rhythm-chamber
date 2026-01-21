---
path: /Users/rhinesharar/rhythm-chamber/js/app.js
type: module
updated: 2026-01-21
status: active
---

# app.js

## Purpose

Main application controller that orchestrates initialization of all modules, services, and controllers using the HNW modular architecture pattern.

## Exports

- **init**: Main application initialization function that sets up dependency checking, module registry, and core services

## Dependencies

[[security/index.js]], [[module-registry.js]], [[utils/html-escape.js]], [[state/app-state.js]], [[storage.js]], [[patterns.js]], [[personality.js]], [[data-query.js]], [[prompts.js]], [[token-counter.js]], [[functions/index.js]], [[cards.js]], [[spotify.js]], [[settings.js]], [[chat.js]], [[controllers/view-controller.js]], [[controllers/file-upload-controller.js]], [[controllers/spotify-controller.js]], [[controllers/demo-controller.js]], [[controllers/reset-controller.js]], [[controllers/sidebar-controller.js]], [[controllers/chat-ui-controller.js]], [[services/tab-coordination.js]], [[services/session-manager.js]], [[services/message-operations.js]], [[services/event-bus.js]], [[storage/event-log-store.js]], [[operation-lock.js]], [[services/circuit-breaker.js]], [[services/function-calling-fallback.js]], [[services/data-version.js]], [[demo-data.js]], [[template-profiles.js]], [[profile-synthesizer.js]]

## Used By

TBD

## Notes

Implements fail-fast dependency checking and must load security module first to enable Safe Mode functionality. Uses ES modules exclusively with no window.X dependencies.