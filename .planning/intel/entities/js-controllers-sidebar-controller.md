---
path: /Users/rhinesharar/rhythm-chamber/js/controllers/sidebar-controller.js
type: controller
updated: 2026-01-21
status: active
---

# sidebar-controller.js

## Purpose

Manages chat sidebar state and session list. Handles session rendering, actions (rename, delete, export), and visibility controls. Uses AppState for reactive state management.

## Exports

- `SidebarController` - Sidebar controller service
- `updateVisibility(appState)` - Update sidebar visibility based on data state
- `renderSessionList()` - Render session list in sidebar
- `handleSessionAction(id, action)` - Handle session actions (rename, delete, export)
- `toggleSidebar()` - Toggle sidebar open/closed state

## Dependencies

- [[js-state-app-state]] - Reactive state management for sidebar state
- [[js-storage]] - Session storage operations
- Internal chat services for session management

## Used By

TBD

## Notes

Key feature: Auto-hides sidebar when no data available. Shows session list with last message preview and timestamp. Supports session actions via dropdown menu. Responsive design works on mobile.