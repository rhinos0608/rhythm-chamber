---
path: /Users/rhinesharar/rhythm-chamber/js/services/function-calling-fallback.js
type: service
updated: 2026-01-22
status: active
---

# function-calling-fallback.js

## Purpose

Implements a 4-level fallback network for function calling when native tool_calls are not supported by the LLM provider/model, with levels ranging from native OpenAI-style tool calls to direct query intent extraction.

## Exports

- `CAPABILITY_LEVELS` - Constants defining the 4 fallback levels (NATIVE, PROMPT_INJECTION, REGEX_PARSING, DIRECT_QUERY)
- `detectCapabilityLevel(provider, model)` - Detects the function calling capability level for a given provider/model combination
- `supportsNativeFunctionCalling(provider, model)` - Checks if a provider/model supports native tool_calls
- `buildFunctionDefinitionsText(functions)` - Converts function definitions to text format for prompt injection
- `buildPromptInjectionAddition(functions, systemPrompt)` - Builds the prompt injection addition with function definitions
- `buildLevel2Request(messages, functions, systemPrompt)` - Builds a Level 2 (prompt injection) request
- `parseFunctionCallsFromText(text)` - Parses function calls from XML-style `<function_call>` tags
- `extractQueryIntent(userMessage, availableFunctions)` - Extracts query intent using regex patterns
- `executeFunctionCalls(functionCalls, context)` - Executes parsed function calls
- `buildFunctionResultsMessage(results)` - Builds message from function execution results
- `handleFunctionCallingWithFallback(messages, functions, provider, model, context)` - Main orchestrator that tries all 4 fallback levels
- `FunctionCallingFallback` - Main class providing the fallback function calling interface

## Dependencies

- [[functions/index]]

## Used By

TBD

## Notes

The fallback hierarchy is Level 1 (native tool_calls) → Level 2 (prompt injection with `<function_call>` tags) → Level 3 (regex parsing from natural language) → Level 4 (direct intent extraction). Contains provider-specific model capability lists for openrouter, gemini, ollama, and lmstudio.