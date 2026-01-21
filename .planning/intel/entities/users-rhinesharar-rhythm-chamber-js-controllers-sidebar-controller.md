---
path: /Users/rhinesharar/rhythm-chamber/js/controllers/sidebar-controller.js
type: controller
updated: 2026-01-21
status: active
---

# sidebar-controller.js

## Purpose

Handles sidebar state management, session list rendering, and session management UI interactions. Integrates with AppState for centralized reactive state management.

## Exports

- `SidebarController` - Controller module for sidebar functionality including initialization, event handling, session management, and view updates

## Dependencies

- [[js-storage]]
- [[js-chat]]
- [[controllers-chat-ui-controller]]
- [[js-token-counter]]
- [[state-app-state]]
- [[services-event-bus]]
- [[utils-html-escape]]

## Used By

TBD

## Notes

Uses HNW (Hybrid No-Workflow) integration pattern with AppState subscriptions. Implements lazy DOM initialization and unified storage fallback to localStorage. Manages session lifecycle including creation, deletion, and switching.