---
path: /Users/rhinesharar/rhythm-chamber/js/controllers/sidebar-controller.js
type: controller
updated: 2026-01-21
status: active
---

# sidebar-controller.js

## Purpose

Manages sidebar UI state, session list rendering, and session management interactions using AppState for centralized reactive state management.

## Exports

- `SidebarController` - Controller singleton for sidebar state and UI operations

## Dependencies

- [[js-storage]]
- [[js-state-app-state]]
- [[js-services-event-bus]]
- [[js-controllers-chat-ui-controller]]
- [[js-token-counter]]

## Used By

TBD

## Notes

Integrates with HNW (Hardware Network Windows) pattern via AppState subscriptions. Uses lazy DOM initialization and persistent sidebar collapsed state.