---
path: /Users/rhinesharar/rhythm-chamber/js/controllers/chat-ui-controller.js
type: module
updated: 2026-01-21
status: active
---

# chat-ui-controller.js

## Purpose

Handles chat message display, streaming response rendering, and user input interactions. Separates UI concerns from business logic.

## Exports

- `ChatUIController` - Main controller class for chat UI operations

## Dependencies

- [[chat]]
- [[html-escape]]

## Used By

TBD

## Notes

Implements SSE sequence validation with reordering buffer for out-of-order chunks. Manages message container DOM updates and streaming text rendering.