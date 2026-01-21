---
path: /Users/rhinesharar/rhythm-chamber/js/app.js
type: module
updated: 2026-01-21
status: active
---

# app.js

## Purpose

Main application controller that orchestrates initialization of all modules, services, and controllers using HNW modular architecture. Delegates to specialized components instead of being a God object.

## Exports

- `init()` - Main initialization function that sets up all modules, services, and controllers in proper order

## Dependencies

[[security/index.js]], [[module-registry.js]], [[state/app-state.js]], [[storage.js]], [[patterns.js]], [[personality.js]], [[data-query.js]], [[prompts.js]], [[token-counter.js]], [[functions/index.js]], [[cards.js]], [[spotify.js]], [[settings.js]], [[chat.js]], [[controllers/view-controller.js]], [[controllers/file-upload-controller.js]], [[controllers/spotify-controller.js]], [[controllers/demo-controller.js]], [[controllers/reset-controller.js]], [[controllers/sidebar-controller.js]], [[controllers/chat-ui-controller.js]], [[services/tab-coordination.js]], [[services/session-manager.js]], [[services/message-operations.js]], [[services/event-bus.js]], [[storage/event-log-store.js]], [[operation-lock.js]], [[services/circuit-breaker.js]], [[services/function-calling-fallback.js]], [[services/data-version.js]], [[demo-data.js]], [[template-profiles.js]], [[profile-synthesizer.js]]

## Used By

TBD

## Notes

Implements fail-fast security pattern with Security module loaded first. AppState initialization deferred to init() to prevent race conditions with Safe Mode checks.