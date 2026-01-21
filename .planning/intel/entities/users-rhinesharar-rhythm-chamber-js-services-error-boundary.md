---
path: /Users/rhinesharar/rhythm-chamber/js/services/error-boundary.js
type: service
updated: 2026-01-21
status: active
---

# error-boundary.js

## Purpose

Provides React-style error boundaries for vanilla JavaScript, isolating widget crashes and rendering recovery UI with user-friendly error messages and retry functionality.

## Exports

- **ErrorBoundary** - Main boundary class for wrapping widget operations with error handling and recovery UI
- **createChatBoundary** - Factory function for creating chat-specific error boundaries
- **createCardBoundary** - Factory function for creating card widget error boundaries
- **installGlobalErrorHandler** - Global error handler installation for unhandled errors
- **default** - Default export (ErrorBoundary class)

## Dependencies

- [[html-escape.js]]

## Used By

TBD

## Notes

Uses centralized HTML escaping utility for security. Preserves original content for recovery. Supports custom error handlers and retry callbacks. Unique ID generation via static counter.