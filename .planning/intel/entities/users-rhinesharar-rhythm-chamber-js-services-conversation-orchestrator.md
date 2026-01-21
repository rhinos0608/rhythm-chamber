---
path: /Users/rhinesharar/rhythm-chamber/js/services/conversation-orchestrator.js
type: service
updated: 2026-01-21
status: active
---

# conversation-orchestrator.js

## Purpose

Manages conversation context and generates system prompts with user data and semantic context while enforcing token limits.

## Exports

- `ConversationOrchestrator` - Main orchestrator service with init, buildSystemPrompt, and context management methods

## Dependencies

- [[token-counter]]
- [[utils]]
- [[data-query]]
- [[rag]]

## Used By

TBD

## Notes

Read-only operations with HNW compliance; state isolation through owned userContext and streamsData; dependency injection via init().