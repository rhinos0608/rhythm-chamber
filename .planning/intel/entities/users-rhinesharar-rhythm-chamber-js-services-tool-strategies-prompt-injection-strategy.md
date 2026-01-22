---
path: /Users/rhinesharar/rhythm-chamber/js/services/tool-strategies/prompt-injection-strategy.js
type: service
updated: 2026-01-22
status: active
---

# prompt-injection-strategy.js

## Purpose

Handles function calls parsed from text responses using `<function_call>` tags as a fallback strategy for AI models that don't support native function calling (capability level 2/3).

## Exports

- `PromptInjectionStrategy` - Strategy class that extends BaseToolStrategy to handle prompt-injected function calls from text responses
- `default` - Default export of PromptInjectionStrategy

## Dependencies

- [[base-strategy.js]] - Base class for tool strategies

## Used By

TBD

## Notes

- Requires capability level 2 or higher
- Uses `FunctionCallingFallback.parseFunctionCallsFromText()` to extract function calls from text content
- Implements circuit breaker pattern to prevent cascading failures
- Accumulates partial results to persist work even when individual calls fail
- Confidence scoring scales with number of parsed calls (0.75 base, +0.02 per call, max 0.85)