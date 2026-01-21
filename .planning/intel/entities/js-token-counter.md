---
path: /Users/rhinesharar/rhythm-chamber/js/token-counter.js
type: util
updated: 2026-01-21
status: active
---

# token-counter.js

## Purpose

Estimates token usage for OpenAI-style API requests using character-based estimation (1 token ≈ 4 characters). Helps prevent context window overflow and provides usage warnings.

## Exports

- `TokenCounter` - Token counting service
- `DEFAULT_CONTEXT_WINDOW` - Default 4096 tokens (configurable)
- `getContextWindow()` - Get context window from settings
- `countTokens(text)` - Count tokens in string (character-based estimation)
- `calculateRequestTokens(request)` - Calculate total tokens for request with breakdown
- `getRecommendedAction(tokenInfo)` - Get recommended action based on usage (truncate/warn/monitor)
- `truncateToTarget(request, targetTokens)` - Truncate request to target token count
- `resetDisplay()` - Reset token counter UI display

## Dependencies

- [[js-settings]] - Get configurable context window

## Used By

TBD

## Notes

Conservative estimation: 1 token ≈ 4 characters works well for most cases. Configurable context window via settings (default 4096). Warns at 50% (medium), 70% (high), 85% (critical) usage. Smart truncation removes RAG context first, then oldest messages while keeping recent ones.