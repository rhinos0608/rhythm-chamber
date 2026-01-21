---
path: /Users/rhinesharar/rhythm-chamber/js/utils/focus-trap.js
type: util
updated: 2026-01-21
status: active
---

# focus-trap.js

## Purpose

Provides reusable focus management for modal dialogs and other focus-restricting UI components, ensuring WCAG 2.1 AA compliance for keyboard navigation (2.1.2 No Keyboard Trap).

## Exports

- `createFocusTrap` - Creates a focus trap instance with configurable activation/deactivation behavior
- `createModalFocusTrap` - Creates a focus trap specifically optimized for modal dialogs
- `setupModalFocusTrap` - One-time setup function for modal focus trap with Escape key handling
- `default` - Default export (alias for createFocusTrap)

## Dependencies

None

## Used By

TBD

## Notes

- Implements ARIA Authoring Practices Guide (APG) recommendations for focusable element detection
- Manages focus history stack for nested modal support and proper focus restoration
- Filters visually hidden elements from focusable element queries using computed styles and bounding box checks