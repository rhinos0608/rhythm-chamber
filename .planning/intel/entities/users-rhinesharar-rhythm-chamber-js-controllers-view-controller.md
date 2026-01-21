---
path: /Users/rhinesharar/rhythm-chamber/js/controllers/view-controller.js
type: component
updated: 2026-01-21
status: active
---

# view-controller.js

## Purpose

Manages view transitions and DOM updates for different application states, including upload, processing, reveal, and chat views.

## Exports

- **ViewController** - Main controller class/object for view management

## Dependencies

- [[chat.js]]
- [[profile-description-generator.js]]
- [[app-state.js]]
- [[sidebar-controller.js]]

## Used By

TBD

## Notes

Uses AppState for state management. Initializes DOM element references lazily on first use. Provides helper functions for safe list and tag rendering. Hides sidebar in non-chat views.