---
path: /Users/rhinesharar/rhythm-chamber/js/controllers/view-controller.js
type: controller
updated: 2026-01-21
status: active
---

# view-controller.js

## Purpose

Manages view transitions and DOM updates for different application states. Handles switching between upload, processing, reveal (full data), lite reveal (Spotify snapshot), and chat views. Uses AppState for reactive state management.

## Exports

- `ViewController` - Main view controller service
- `showUpload()` - Show upload view
- `showProcessing(message)` - Show processing view with optional progress message
- `updateProgress(message, progress)` - Update progress message during processing
- `showReveal()` - Show personality reveal view (full data mode)
- `showLiteReveal()` - Show lite reveal view (Spotify quick snapshot mode)
- `showChat()` - Show chat view
- `populateScoreBreakdown(personality)` - Populate "How did we detect this?" explainer

## Dependencies

- [[js-chat]] - Initialize chat context with personality data
- [[js-services-profile-description-generator]] - Generate AI-powered personality descriptions
- [[js-state-app-state]] - Reactive state management
- [[js-controllers-sidebar-controller]] - Session list rendering and visibility
- Internal: Cards (for personality data)

## Used By

TBD

## Notes

Key feature: Supports both full data analysis and lite Spotify snapshot modes. Generates AI personality descriptions asynchronously with race condition prevention. Uses getActiveData() to transparently support both demo and normal modes.