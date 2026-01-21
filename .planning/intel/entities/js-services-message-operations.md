---
path: /Users/rhinesharar/rhythm-chamber/js/services/message-operations.js
type: service
updated: 2026-01-21
status: active
---

# message-operations.js

## Purpose

Handles chat message operations including regeneration, deletion, editing, and query context generation. Separates message manipulation concerns from chat orchestration logic. Provides intelligent data-driven responses by analyzing user messages against streaming history to generate relevant context.

## Exports

- `MessageOperations` - Main service object for message operations
- `init(dependencies)` - Initialize service with DataQuery, TokenCounter, Functions, RAG dependencies
- `setUserContext(context)` - Set user context for message operations
- `setStreamsData(streams)` - Set streaming history data for query operations
- `regenerateLastResponse(conversationHistory, sendMessageFn, options)` - Remove last assistant response and regenerate from user message
- `deleteMessage(index, conversationHistory)` - Delete specific message from conversation history
- `editMessage(index, newText, conversationHistory, sendMessageFn, options)` - Edit user message and regenerate response
- `generateQueryContext(message)` - Analyze user message and generate relevant data context from streams
- `generateFallbackResponse(message, queryContext)` - Generate intelligent fallback when API unavailable using user data
- `getSemanticContext(message, limit)` - Get semantic context from RAG if configured
- `calculateTokenUsage(params)` - Calculate token usage for requests
- `getRecommendedTokenAction(tokenInfo)` - Get recommended action based on token usage
- `truncateToTarget(params, targetTokens)` - Truncate request to target token count

## Dependencies

- [[js-settings]] - Configuration management for LLM settings
- [[js-services-data-version]] - Data version checking for regeneration context validation
- Internal dependencies injected via init: DataQuery, TokenCounter, Functions, RAG

## Used By

TBD

## Notes

Key feature: Analyzes natural language queries to extract time periods, artists, and comparisons, then generates structured data context for LLM. Enables "data-driven conversations" where the AI can answer specific questions about listening history.