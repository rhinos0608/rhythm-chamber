---
path: /Users/rhinesharar/rhythm-chamber/js/services/message-operations.js
type: service
updated: 2026-01-22
status: active
---

# message-operations.js

## Purpose

Handles chat message operations including regeneration, deletion, editing, and query context generation. Extracted from chat.js to separate message concerns from chat orchestration.

## Exports

- `MessageOperations` - Main service object containing all message operation functions
- `init(dependencies)` - Initialize service with injected dependencies
- `regenerateLastResponse(conversationHistory, sendMessageFn, options)` - Regenerate the last assistant response
- `deleteMessage(messageId, conversationHistory)` - Delete a specific message from conversation
- `editMessage(messageId, newContent, conversationHistory)` - Edit an existing message
- `generateQueryContext(userMessage, conversationHistory)` - Generate context for user queries

## Dependencies

- [[settings]]
- [[data-version]]
- DataQuery (injected)
- TokenCounter (injected)
- Functions (injected)
- RAG (injected)

## Used By

TBD

## Notes

Uses dependency injection pattern with init() function. Handles stale data context checks during regeneration.