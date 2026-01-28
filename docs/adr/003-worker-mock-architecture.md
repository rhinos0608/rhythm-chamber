# ADR-003: Worker Mock Architecture

**Status:** Accepted
**Date:** 2025-01-29
**Context:** Phase 3 - Test Infrastructure Improvements

## Context

The codebase uses Web Workers extensively for parallel processing:

- **Pattern Worker Pool** - Manages worker lifecycle and task distribution
- **Metrics Exporter** - Offloads metrics processing to workers
- **Session Manager** - Uses workers for heavy computations

Tests were failing because Worker mocks were incomplete:

```javascript
// BROKEN MOCK - Returns null
onmessage = (event) => {
  this.onmessage({ data: null, type: 'message' })
}
```

This caused test failures like:

```
Expected: { pattern: 'swing', confidence: 0.95 }
Received: null
```

### Root Cause

The Worker mock was calling `onmessage` with `data: null` instead of returning actual message data. This meant:

1. **Tests passed** but didn't verify actual behavior
2. **Worker logic** was never actually tested
3. **Integration issues** were hidden by mock
4. **False confidence** in worker code quality

## Decision

Worker mocks **must return actual message data**, not null.

### Technical Implementation

**Correct Worker Mock:**

```javascript
class MockWorker {
  constructor() {
    this.onmessage = null
    this.onerror = null
  }

  postMessage(message) {
    // Simulate async worker response
    setTimeout(() => {
      if (this.onmessage) {
        this.onmessage({
          data: message,  // ← RETURN ACTUAL DATA
          type: 'message'
        })
      }
    }, 0)
  }

  terminate() {
    // Cleanup
  }
}
```

**Usage in Tests:**

```javascript
test('pattern worker processes swing detection', async () => {
  const worker = new PatternWorker()

  const result = await worker.process({
    type: 'swing',
    data: audioBuffer
  })

  // Now actually tests worker logic
  expect(result).toEqual({
    pattern: 'swing',
    confidence: expect.any(Number),
    timestamps: expect.any(Array)
  })
})
```

### Mock Requirements

All Worker mocks **must**:

1. **Return actual message data** - Never return null unless that's the actual behavior
2. **Simulate async execution** - Use setTimeout or Promise.resolve
3. **Call onmessage callback** - Mimic real Worker behavior
4. **Support postMessage** - Accept and process messages
5. **Handle errors** - Call onerror when appropriate
6. **Support terminate** - Allow cleanup

## Consequences

### Positive

- **Tests accurately reflect Worker behavior** - catch integration issues
- **Catches Worker bugs early** - tests verify actual logic
- **Documents Worker contract** - mock defines expected interface
- **Enables refactoring confidence** - tests ensure Worker behavior unchanged
- **Exposes hidden bugs** - null mocks hide problems, data mocks reveal them

### Negative

- **Mock more complex** - can't just return null, must provide realistic data
- **Test setup overhead** - need to prepare realistic test data
- **Mock maintenance** - must update mocks when Worker interface changes
- **May hide timing issues** - async simulation not perfect representation

## Implementation Guidelines

### 1. Create Realistic Test Data

```javascript
// GOOD: Realistic test data
const mockWorkerResponse = {
  pattern: 'swing',
  confidence: 0.95,
  timestamps: [0, 120, 240, 360]
}

// BAD: Null or empty data
const mockWorkerResponse = null
```

### 2. Test Worker Lifecycle

```javascript
test('worker lifecycle', async () => {
  const worker = new PatternWorker()

  // Test initialization
  expect(worker.state).toBe('idle')

  // Test processing
  const result = await worker.process(task)
  expect(result).toBeDefined()

  // Test cleanup
  worker.terminate()
  expect(worker.state).toBe('terminated')
})
```

### 3. Test Error Handling

```javascript
test('worker handles invalid input', async () => {
  const worker = new PatternWorker()

  await expect(worker.process(null)).rejects.toThrow(
    'Invalid input data'
  )
})
```

### 4. Test Message Passing

```javascript
test('worker receives and processes messages', async () => {
  const worker = new PatternWorker()
  const message = { type: 'analyze', data: audioBuffer }

  const response = await worker.postMessage(message)

  expect(response.type).toBe('result')
  expect(response.data).toBeDefined()
})
```

## Testing Strategy

### Unit Tests

- Mock Workers with realistic data
- Test Worker logic in isolation
- Verify message handling
- Test error conditions

### Integration Tests

- Use actual Workers where possible
- Test Worker Pool coordination
- Verify message passing between Workers
- Test Worker lifecycle management

### E2E Tests

- Test complete workflows with Workers
- Verify performance characteristics
- Test Worker cleanup and resource management

## Success Criteria

- All Worker tests pass with realistic data
- No Worker mocks return null (unless actual behavior)
- Tests catch Worker integration issues
- Worker code coverage >80%
- Worker refactoring doesn't break tests

## References

- Phase 3 Plan: `docs/plans/PHASE-3-GOD-OBJECTS-COMPLETE.md`
- Test Infrastructure: `tests/unit/workers/`
- Worker Implementation: `js/workers/pattern-worker-pool/`
