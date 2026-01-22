---
path: /Users/rhinesharar/rhythm-chamber/js/state/app-state.js
type: module
updated: 2026-01-22
status: active
---

# app-state.js

## Purpose

Centralized state management for the application implementing HNW (Hierarchy-Network-Wave) design pattern with immutable state, subscriber notifications, and batched async updates.

## Exports

- **AppState** - Main state management API with get, set, subscribe, and update methods
- **INITIAL_STATE** - Default state shape defining view, data, lite mode, UI, operations, and demo domains
- **VALID_DOMAINS** - Array of valid domain names for state update validation

## Dependencies

None

## Used By

TBD

## Notes

Implements deep freeze for runtime immutability enforcement and batched notifications via Wave pattern. Demo mode data is completely isolated from main data domain to prevent cross-contamination. State domains include: view, data, lite, ui, operations, demo.