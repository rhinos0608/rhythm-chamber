# ADR-001: Testing Methodology

**Status:** Accepted
**Date:** 2025-01-29
**Context:** Phase 2-3 - God Objects Refactoring

## Context

We face a significant technical debt challenge: Multiple god objects throughout the codebase require refactoring to improve maintainability, testability, and clarity. The largest of these include:

- **IndexedDB** (1,348 lines) - Most complex storage layer
- **Observability Controller** (1,090 lines) - Performance monitoring and event tracking
- **Provider Interface** (1,102 lines) - AI provider orchestration
- **Local Vector Store** (1,099 lines) - Vector operations and similarity search
- **Provider Fallback Chain** (872 lines) - Provider health and fallback logic

These objects have evolved organically and contain critical business logic. Refactoring them carries substantial risk:

1. **No comprehensive test suite** exists for many modules
2. **Behavior is poorly documented** - code is the only specification
3. **Complex interactions** between modules may have implicit dependencies
4. **Production data** depends on exact current behavior
5. **Web Worker dependencies** complicate testing - code runs in worker threads, making traditional unit testing difficult

## Decision

We will use **characterization testing** before any refactoring work, combined with a **sophisticated Web Worker mock architecture**.

### Characterization Testing

**Characterization testing** means:
- Write tests that **document and lock in current behavior**
- Tests capture what the system **currently does**, not what it **should do**
- Use these tests as a safety net during refactoring
- Fix any bugs discovered **after** refactoring is complete

### Web Worker Mock Architecture

Given the heavy use of Web Workers in Rhythm Chamber (pattern detection, embeddings, vector search), we need a sophisticated mocking strategy:

**Mock Strategy:**
- **Create synchronous mock workers** that return pre-defined responses
- **Support async worker communication patterns** for realistic testing
- **Inject mock workers** via dependency injection for testability
- **Mock worker messages** to simulate real worker behavior
- **Provide deterministic responses** for consistent test results

## Implementation Approach

### Characterization Testing Process

1. **Before refactoring any module:**
   - Write comprehensive tests covering all code paths
   - Capture edge cases, error conditions, and boundary values
   - Document any "interesting" behaviors (even bugs)
   - Achieve >90% code coverage

2. **During refactoring:**
   - Run characterization tests continuously
   - Any test failure = unintended behavior change
   - Fix the refactoring, not the test

3. **After refactoring:**
   - Review characterization tests for bugs captured as "expected behavior"
   - Create new tests for correct behavior
   - Fix bugs and update tests
   - Use characterization tests as regression suite

### Web Worker Mock Implementation

**Example Mock Structure:**

```javascript
// tests/mocks/pattern-worker-mock.js
export class PatternWorkerMock {
  constructor() {
    this.messageQueue = [];
    this.responseMap = new Map();
  }

  // Mock postMessage to capture calls
  postMessage(message) {
    this.messageQueue.push(message);

    // Return pre-defined response based on message type
    const response = this.responseMap.get(message.type);
    if (response) {
      setTimeout(() => {
        this.onmessage({ data: response });
      }, 0);
    }
  }

  // Set up mock responses
  setMockResponse(type, response) {
    this.responseMap.set(type, response);
  }

  // Verify calls
  getMessageCount() {
    return this.messageQueue.length;
  }

  getLastMessage() {
    return this.messageQueue[this.messageQueue.length - 1];
  }
}
```

**Usage in Tests:**

```javascript
import { PatternWorkerMock } from './mocks/pattern-worker-mock.js';

describe('Pattern Detection', () => {
  let workerMock;

  beforeEach(() => {
    workerMock = new PatternWorkerMock();

    // Set up mock responses
    workerMock.setMockResponse('DETECT_ERAS', {
      type: 'ERAS_DETECTED',
      eras: [{ name: 'Emo Teen', start: '2020-01-01', end: '2020-12-31' }]
    });
  });

  it('should detect eras from streaming history', async () => {
    await detectEras(streams, { worker: workerMock });

    expect(workerMock.getMessageCount()).toBe(1);
    expect(workerMock.getLastMessage().type).toBe('DETECT_ERAS');
  });
});
```

## Consequences

### Positive

- **Ensures no behavior changes** during refactoring
- **Documents current behavior** explicitly
- **Provides safety net** for aggressive refactoring
- **Enables confidence** when working with complex, poorly understood code
- **Creates regression test suite** for future changes
- **Makes implicit dependencies** between modules visible
- **Enables testing of worker-dependent code** without actual workers
- **Provides deterministic test results** by controlling worker responses
- **Simplifies test setup** by removing worker thread complexity

### Negative

- **Adds test maintenance overhead** - tests must be updated along with code
- **May capture bugs as "expected behavior"** - requires careful post-refactoring review
- **Initial time investment** - slows start of refactoring work
- **Tests may be brittle** if they capture implementation details instead of behavior
- **Requires discipline** to avoid "fixing" bugs during characterization (tempting but dangerous)
- **Mock maintenance burden** - mocks must stay in sync with real worker interfaces
- **Potential for mock divergence** - mocks may not accurately reflect real worker behavior over time

## Mitigation Strategies

### Characterization Testing

1. **Document "interesting" behaviors** in test comments with `// INTERESTING:` prefix
2. **Post-refactoring sprint** specifically for reviewing characterization tests
3. **Separate characterization test suite** from behavioral tests
4. **Code review requirement** for all characterization tests
5. **Coverage thresholds** - must characterize >90% of code paths

### Worker Mocking

1. **Keep mocks simple** - Don't reproduce full worker logic in mocks
2. **Periodic integration tests** - Run tests with real workers to verify mocks
3. **Version mock interfaces** - Track worker API versions to detect drift
4. **Shared mock utilities** - Reusable mock components across tests
5. **Mock validation** - Verify mock behavior matches real worker behavior

## Results

### Test Coverage Achieved

- **Characterization Tests:** 250 tests capturing existing behavior
- **Unit Tests:** 160+ tests for new modules
- **Worker Mock Tests:** 45+ tests verifying mock accuracy
- **Overall Pass Rate:** 100% (all tests passing)

### Modules Successfully Refactored

1. **Observability Controller** - 58 characterization tests → 0 regressions
2. **Provider Fallback Chain** - 38 characterization tests → 0 regressions
3. **Provider Interface** - 36 characterization tests → 0 regressions
4. **Local Vector Store** - 53 characterization tests → 0 regressions
5. **IndexedDB Core** - 65 characterization tests → 0 regressions

## References

- Michael Feathers' "Working Effectively with Legacy Code"
- [REFACTORING.md](../../REFACTORING.md) - Refactoring history and patterns
- [TESTING.md](../../TESTING.md) - Comprehensive testing guide
- Worker Mock Implementation: `tests/mocks/worker-mock.js`
- Characterization Test Examples: `tests/unit/*characterization*.test.js`
