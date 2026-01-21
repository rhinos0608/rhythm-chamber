---
path: /Users/rhinesharar/rhythm-chamber/js/services/tool-strategies/native-strategy.js
type: service
updated: 2026-01-21
status: active
---

# native-strategy.js

## Purpose

Handles native OpenAI-style tool_calls from LLM responses at capability level 1, executing function calls with circuit breaker protection and error handling.

## Exports

- `NativeToolStrategy` - Strategy class for processing native tool_calls from LLM responses
- `default` - Default export of NativeToolStrategy

## Dependencies

- [[base-strategy.js]] - BaseToolStrategy parent class

## Used By

TBD

## Notes

Implements canHandle() with 0.95 confidence for native tool_calls, executes functions sequentially with circuit breaker checks, emits tool_start/tool_end progress events, handles argument parsing errors gracefully