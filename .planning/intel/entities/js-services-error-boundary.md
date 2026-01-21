---
path: /Users/rhinesharar/rhythm-chamber/js/services/error-boundary.js
type: service
updated: 2026-01-21
status: active
---

# error-boundary.js

## Purpose

Provides React-style error boundaries for vanilla JavaScript widgets. Isolates widget crashes from affecting the whole app, shows user-friendly error UI with retry buttons, and preserves original content for recovery.

## Exports

- `ErrorBoundary` - Vanilla JS error boundary class
- `createChatBoundary(options)` - Create pre-configured error boundary for Chat widget
- `createCardBoundary(options)` - Create pre-configured error boundary for Card generator widget
- `installGlobalErrorHandler()` - Install global error handlers for uncaught errors

## Dependencies

- None (standalone error handling utility)

## Used By

TBD

## Notes

Key feature: Graceful degradation with retry functionality. Each boundary can wrap async operations and render recovery UI on failure. Global handlers catch uncaught errors and unhandled promise rejections.