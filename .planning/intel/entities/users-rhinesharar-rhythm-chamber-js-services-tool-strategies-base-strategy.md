---
path: /Users/rhinesharar/rhythm-chamber/js/services/tool-strategies/base-strategy.js
type: module
updated: 2026-01-22
status: active
---

# base-strategy.js

## Purpose

Base class implementing the Strategy pattern for function calling capability levels. Provides the interface that concrete tool strategies must implement to handle different LLM function calling capabilities.

## Exports

- **BaseToolStrategy** - Abstract base class for tool execution strategies
- **default** - Default export of BaseToolStrategy

## Dependencies

- [[timeout-budget-manager]]

## Used By

TBD

## Notes

Implements HNW (Hierarchy-Network-Wave) architecture pattern. Concrete strategies must implement `level` getter and `canHandle()` method. Provides `confidence()` helper for strategy voting mechanism.