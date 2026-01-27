# Architecture Layers

This document describes the three-layer architecture used in Rhythm Chamber to separate concerns and maintain clear boundaries between business logic, application orchestration, and infrastructure implementation.

## Overview

```
┌─────────────────────────────────────────────────────────┐
│  Business Logic Layer                                   │
│  - WHAT to do                                           │
│  - Pure functions, no side effects                      │
│  - No infrastructure references                         │
├─────────────────────────────────────────────────────────┤
│  Application Logic Layer                                │
│  - HOW to coordinate                                    │
│  - Orchestrates business rules                          │
│  - No direct infrastructure calls                       │
├─────────────────────────────────────────────────────────┤
│  Infrastructure Layer                                   │
│  - HOW TO IMPLEMENT                                     │
│  - Low-level operations (IndexedDB, Workers, etc.)      │
│  - No business logic                                    │
└─────────────────────────────────────────────────────────┘
```

## Layer Responsibilities

### 1. Business Logic Layer (WHAT)

**Location:** `js/architecture/*-business-layer.js`

**Responsibilities:**
- Define what data is valid
- Define business rules and invariants
- Pure functions with no side effects
- No knowledge of storage mechanisms

**Example:**
```javascript
// Business layer: Define valid vector structure
export function validateVectorDimensions(vector, expectedDimensions) {
    if (!vector || !Array.isArray(vector)) {
        return { isValid: false, error: 'not_an_array' };
    }
    if (vector.length !== expectedDimensions) {
        return { isValid: false, error: 'dimension_mismatch' };
    }
    return { isValid: true };
}
```

**What it does NOT do:**
- No IndexedDB calls
- No SharedArrayBuffer references
- No Worker creation
- No localStorage access

### 2. Application Logic Layer (HOW)

**Location:** `js/architecture/*-application-layer.js`

**Responsibilities:**
- Orchestrate business rule application
- Transform data between layers
- Sequence operations
- Prepare data for infrastructure

**Example:**
```javascript
// Application layer: Prepare session for saving
export function prepareSessionForSave(sessionData, maxSaved) {
    // Apply business rules (filter messages)
    const messages = filterMessagesForStorage(sessionData.messages, maxSaved);

    // Generate title using business logic
    const title = generateSessionTitle(messages, sessionData.title);

    // Build metadata
    const metadata = buildSessionMetadata(sessionData);

    // Return object ready for infrastructure layer
    return { id: sessionData.id, title, messages, metadata };
}
```

**What it does NOT do:**
- No direct IndexedDB/SQLite calls
- No direct localStorage calls
- No network requests
- Pure data transformations only

### 3. Infrastructure Layer (HOW TO IMPLEMENT)

**Location:** `js/architecture/*-infrastructure-layer.js`, `js/storage/`

**Responsibilities:**
- Implement low-level storage operations
- Handle SharedArrayBuffer creation
- Manage IndexedDB transactions
- Worker lifecycle management

**Example:**
```javascript
// Infrastructure layer: Create shared memory buffer
export function createSharedVectorBuffer(dimensions, count) {
    if (!isSharedArrayBufferAvailable()) {
        return { success: false, error: 'unavailable' };
    }
    const byteLength = dimensions * count * 4; // Float32
    const buffer = new SharedArrayBuffer(byteLength);
    return { success: true, buffer, byteLength };
}
```

**What it does NOT do:**
- No business rule validation
- No data filtering/transformation beyond serialization
- Assumes inputs are pre-validated

## Layer Contracts

### Business Layer Contract

**Input:** Plain data structures (arrays, objects)
**Output:** Validation results ({ isValid, error?, ... })
**Dependencies:** None

**Example contract:**
```javascript
// validateVectorDimensions(vector: number[], expected: number): ValidationResult
```

### Application Layer Contract

**Input:** Business domain objects (sessions, vectors, etc.)
**Output:** Data structures ready for infrastructure
**Dependencies:** Business layer only

**Example contract:**
```javascript
// prepareSessionForSave(sessionData: SessionData, maxSaved: number): SessionSaveFormat
```

### Infrastructure Layer Contract

**Input:** Pre-formatted data structures
**Output:** Storage results or infrastructure errors
**Dependencies:** Browser APIs only

**Example contract:**
```javascript
// createSharedVectorBuffer(dimensions: number, count: number): InfrastructureResult
```

## Correct Usage Patterns

### Pattern 1: Vector Storage Flow

```javascript
// 1. Business layer validates (WHAT)
const validation = validateVectorConsistency(vectors);
if (!validation.isValid) {
    throw new Error(validation.error);
}

// 2. Infrastructure layer implements (HOW TO)
const bufferResult = createSharedVectorBuffer(
    validation.dimensions,
    vectors.length
);
```

### Pattern 2: Session Persistence Flow

```javascript
// 1. Application layer orchestrates (HOW)
const prepared = prepareSessionForSave(sessionData, 100);

// 2. Infrastructure layer persists (HOW TO IMPLEMENT)
await Storage.saveSession(prepared);
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Business Logic in Infrastructure

```javascript
// BAD: Infrastructure layer doing validation
function saveVector(vector) {
    if (vector.length !== 384) {  // Business rule in infrastructure!
        throw new Error('Invalid dimensions');
    }
    return indexedDB.put(vector);
}

// GOOD: Validate first, then save
function saveVector(vector) {
    const validation = validateVectorDimensions(vector, 384);  // Business layer
    if (!validation.isValid) throw new Error(validation.error);
    return indexedDB.put(vector);  // Infrastructure layer
}
```

### Anti-Pattern 2: Infrastructure in Business Logic

```javascript
// BAD: Business logic knows about IndexedDB
function validateVector(id) {
    const vector = await indexedDB.get(id);  // Infrastructure call!
    return vector.length === 384;
}

// GOOD: Accept data as parameter
function validateVector(vector) {
    return vector.length === 384;
}
```

### Anti-Pattern 3: Skipped Application Layer

```javascript
// BAD: Business logic calling infrastructure directly
async function saveSession(sessionData) {
    const messages = filterMessages(sessionData.messages);  // Business rule
    await indexedDB.put({ ...sessionData, messages });       // Infrastructure
}

// GOOD: Use application layer to orchestrate
async function saveSession(sessionData) {
    const prepared = prepareSessionForSave(sessionData);  // Application layer
    await indexedDB.put(prepared);                         // Infrastructure layer
}
```

## Testing Each Layer

### Business Layer Tests

Test with plain data - no mocks needed:

```javascript
test('validates vector dimensions', () => {
    const result = validateVectorDimensions([1, 2, 3], 3);
    expect(result.isValid).toBe(true);
});
```

### Application Layer Tests

Test orchestration - no storage mocks needed:

```javascript
test('prepares session for save', () => {
    const prepared = prepareSessionForSave({ id: 'test', messages: [...] }, 100);
    expect(prepared.messages.length).toBeLessThanOrEqual(100);
});
```

### Infrastructure Layer Tests

Test with infrastructure mocks or real APIs:

```javascript
test('creates SharedArrayBuffer', () => {
    const result = createSharedVectorBuffer(384, 10);
    expect(result.buffer).toBeInstanceOf(SharedArrayBuffer);
});
```

## File Organization

```
js/architecture/
├── vector-store-business-layer.js       # Vector validation rules
├── vector-store-infrastructure-layer.js # SharedArrayBuffer, IndexedDB
├── session-persistence-application-layer.js  # Session preparation
└── ARCHITECTURE.md                      # This file

js/storage/
├── indexeddb.js                         # Low-level IndexedDB operations
├── fallback-backend.js                  # Fallback storage implementation
└── ...                                  # Other infrastructure

js/services/
├── session-manager/
│   ├── session-state.js                 # State management
│   ├── session-persistence.js           # Uses application layer
│   └── ...
└── ...
```

## Migration Guide

When refactoring existing code to use layers:

1. **Identify mixed concerns** - Look for functions that validate AND persist
2. **Extract business rules** - Move validation to business layer
3. **Create orchestration** - Add application layer functions
4. **Update infrastructure** - Ensure infrastructure only does low-level work
5. **Update tests** - Add tests for each layer independently

## References

- [vector-store-business-layer.js](./vector-store-business-layer.js) - Vector validation
- [vector-store-infrastructure-layer.js](./vector-store-infrastructure-layer.js) - Shared memory operations
- [session-persistence-application-layer.js](./session-persistence-application-layer.js) - Session preparation
