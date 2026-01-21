---
path: /Users/rhinesharar/rhythm-chamber/js/controllers/sidebar-controller.js
type: component
updated: 2026-01-21
status: active
---

# sidebar-controller.js

## Purpose

Handles sidebar state, session list rendering, and session management UI with centralized state management via AppState.

## Exports

- `SidebarController` - Main controller class for sidebar functionality

## Dependencies

[[storage]], [[chat]], [[chat-ui-controller]], [[token-counter]], [[app-state]], [[event-bus]], [[html-escape]], [[utils]], [[storage/keys]], [[focus-trap]]

## Used By

TBD

## Notes

- Uses AppState for reactive state management with subscription-based updates
- Implements memory leak fixes for event listener cleanup
- Includes responsive design support with mobile overlay state synchronization