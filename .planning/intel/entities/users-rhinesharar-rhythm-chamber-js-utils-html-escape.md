---
path: /Users/rhinesharar/rhythm-chamber/js/utils/html-escape.js
type: util
updated: 2026-01-21
status: active
---

# html-escape.js

## Purpose

Centralized HTML escaping utility to prevent XSS vulnerabilities by sanitizing user-generated content before DOM insertion.

## Exports

- **escapeHtml**: Escapes text for safe HTML context using DOM-based escaping
- **escapeHtmlAttr**: Escapes text for safe HTML attribute values with quote handling
- **escapeJs**: Escapes text for JavaScript string literals
- **safeHtml**: Tagged template literal for safe HTML construction
- **isPotentiallyDangerous**: Detects potentially dangerous HTML content
- **sanitizeHtml**: Sanitizes HTML while allowing safe tags
- **default**: Default export

## Dependencies

None

## Used By

TBD

## Notes

Uses DOM-based escaping for reliability. All user content must be escaped before innerHTML insertion.