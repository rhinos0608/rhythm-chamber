---
path: /Users/rhinesharar/rhythm-chamber/js/services/conversation-orchestrator.js
type: service
updated: 2026-01-21
status: active
---

# conversation-orchestrator.js

## Purpose

Manages conversation context and prompt generation for the chat system. Provides read-only access to conversation state, focusing on building system prompts with user data and enforcing token limits to prevent truncation of base instructions.

## Exports

- `ConversationOrchestrator` - Main service object for conversation orchestration
- `init(dependencies)` - Initialize with TokenCounter, DataQuery, RAG, Prompts dependencies
- `buildSystemPrompt(queryContext, semanticContext)` - Build system prompt with user data, enforcing token limits
- `generateQueryContext(message)` - Generate query context from user message using DataQuery
- `getUserContext()` - Get current user context (read-only)
- `setUserContext(context)` - Set user context for conversation
- `getStreamsData()` - Get streams data (read-only)
- `setStreamsData(streams)` - Set streaming data for query operations

## Dependencies

- [[js-token-counter]] - Token counting for context window management
- Internal dependencies injected via init: DataQuery, RAG, Prompts

## Used By

TBD

## Notes

Key feature: Enforces strict token limits (50% of context window for base prompt) to prevent truncation of system instructions. Implements smart context truncation for semantic context and query context to fit within budget.