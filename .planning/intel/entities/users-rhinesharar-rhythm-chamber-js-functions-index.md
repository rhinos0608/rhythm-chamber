---
path: /Users/rhinesharar/rhythm-chamber/js/functions/index.js
type: module
updated: 2026-01-21
status: active
---

# index.js

## Purpose

Unified entry point for all function calling capabilities. Provides centralized execute() function that routes to appropriate executors for data, template, and analytics queries with validation and retry logic.

## Exports

- `executeFunction()` - Main execution router for function calls with validation, abort checking, and error handling
- `hasFunction()` - Checks if a function exists in available schemas
- `validateFunctionArgs()` - Validates function arguments against their schemas
- `getAllSchemas()` - Returns all available function schemas
- `getTemplateFunctionNames()` - Returns list of template function names that don't require user streams

## Dependencies

[[settings]], [[data-query]], ./schemas/data-queries.js, ./schemas/template-queries.js, ./schemas/analytics-queries.js, ./utils/validation.js, ./utils/retry.js, ./executors/data-executors.js, ./executors/template-executors.js, ./executors/analytics-executors.js

## Used By

TBD

## Notes

- Template functions (defined via TemplateFunctionNames) don't require user streams
- Supports AbortSignal for cancellation
- Uses HNW (Hierarchy-Network-Wave) defensive programming patterns
- All async execution with retry logic via FunctionRetry