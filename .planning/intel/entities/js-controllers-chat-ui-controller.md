---
path: /Users/rhinesharar/rhythm-chamber/js/controllers/chat-ui-controller.js
type: controller
updated: 2026-01-21
status: active
---

# chat-ui-controller.js

## Purpose

UI controller for chat messages. Handles message rendering, SSE streaming sequence validation, markdown parsing, HTML escaping, and action buttons (regenerate, copy, edit, delete).

## Exports

- `ChatUIController` - Chat UI controller service
- `renderMessage(message, container)` - Render a single message to DOM
- `renderMessageContent(content, container)` - Render message content with markdown parsing
- `renderActionButtons(message, container)` - Render action buttons for messages
- `showTypingIndicator()` - Show typing indicator during streaming
- `hideTypingIndicator()` - Hide typing indicator
- `scrollToBottom()` - Scroll chat to bottom
- `setLoading(isLoading)` - Set loading state

## Dependencies

- markdown-it - Markdown parsing
- DOMPurify - HTML sanitization
- Internal chat services for message operations

## Used By

TBD

## Notes

Key feature: SSE sequence validation ensures streaming messages arrive in order. HTML escaping prevents XSS. Markdown rendering with code syntax highlighting. Action buttons only show for user messages (regenerate, edit, delete).