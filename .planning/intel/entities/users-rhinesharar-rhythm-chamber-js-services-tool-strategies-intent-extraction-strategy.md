---
path: /Users/rhinesharar/rhythm-chamber/js/services/tool-strategies/intent-extraction-strategy.js
type: service
updated: 2026-01-22
status: active
---

# intent-extraction-strategy.js

## Purpose

Extracts intent from user messages and executes functions directly as a fallback when models cannot produce structured function calls.

## Exports

- `IntentExtractionStrategy` - Strategy class that extracts query intent and executes function calls
- `default` - Default export of IntentExtractionStrategy

## Dependencies

- [[base-strategy.js]]

## Used By

TBD

## Notes

Contains HNW (Happy Null Watch) guards to verify FunctionCallingFallback and executeFunctionCalls availability before use. Returns low confidence scores (0.5-0.6) to defer to better strategies when possible.