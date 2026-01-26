# ChatUIController Refactoring Plan

## Overview
Refactor the ChatUIController God object (825 lines) into focused, single-responsibility modules.

## Current Responsibilities (to be extracted)

### 1. Message Rendering (lines 61-116)
- `createMessageElement()` - Create DOM elements for messages
- `addMessage()` - Add messages to chat container
- Markdown parsing and HTML escaping
- Message container management

**Extract to:** `MessageRenderer` module

### 2. Streaming Message Updates (lines 347-597)
- `addLoadingMessage()` - Create loading placeholder
- `updateLoadingMessage()` - Update with streaming content
- `finalizeStreamedMessage()` - Parse markdown and finalize
- SSE sequence validation (lines 26-58)
- StreamBuffer integration

**Extract to:** `StreamingMessageHandler` module

### 3. Message Actions (lines 118-345)
- `addUserMessageActions()` - Edit/delete buttons
- `addAssistantMessageActions()` - Copy/regenerate/delete buttons
- `addErrorMessageActions()` - Retry button
- `enableEditMode()` - Edit mode UI and logic
- `restoreFocusToChatInput()` - Focus management

**Extract to:** `MessageActions` module

### 4. Artifact Rendering (lines 599-704)
- `hasArtifact()` - Check for artifacts
- `extractArtifact()` - Extract artifact spec
- `renderArtifact()` - Validate and render artifact
- `addArtifactToChat()` - Add to chat
- `processArtifactResult()` - Process function results

**Extract to:** `ArtifactRenderer` module (delegates to Artifacts)

### 5. Input Management (lines 706-781)
- `getInputValue()` - Get and validate input
- `clearInput()` - Clear input field
- `hideSuggestions()` - Hide suggestions panel
- `clearMessages()` - Clear all messages
- Input validation and sanitization
- Tool name validation

**Extract to:** `ChatInputManager` module

### 6. Token Display (lines 470-551)
- `updateTokenDisplay()` - Update token counter UI
- `showTokenWarning()` - Show warning messages
- Progress bar color coding
- Warning display management

**Extract to:** `TokenDisplayController` module

## New Module Structure

```
js/controllers/chat-ui/
├── message-renderer.js       # Message element creation
├── streaming-handler.js      # SSE streaming and buffering
├── message-actions.js        # Action button management
├── artifact-renderer.js      # Artifact validation and rendering
├── input-manager.js          # Input validation and focus
└── token-display.js          # Token counter UI
```

## Refactored ChatUIController

The refactored `chat-ui-controller.js` will:
1. Import all sub-modules
2. Re-export public APIs
3. Coordinate between modules
4. Handle cross-cutting concerns
5. Reduce to ~150-200 lines (from 825)

## Implementation Order

1. **MessageRenderer** - Foundation for all message display
2. **StreamingMessageHandler** - Streaming support
3. **MessageActions** - User interactions
4. **ArtifactRenderer** - Artifact support
5. **ChatInputManager** - Input handling
6. **TokenDisplayController** - Token UI
7. **Update ChatUIController** - Wire everything together

## Dependencies

Each module should:
- Import only what it needs
- Export clear, focused APIs
- Avoid circular dependencies
- Use JSDoc for documentation

## Testing Strategy

1. Visual testing - Ensure UI still works
2. Existing unit tests - Verify no regressions
3. Manual testing - Test all user interactions
4. Integration testing - Verify module coordination

## Success Criteria

- Each module < 200 lines
- Clear single responsibility
- No functionality loss
- All tests pass
- Visual testing confirms UI works
