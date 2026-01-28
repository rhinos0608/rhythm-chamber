# ADR-001: Characterization Testing for Refactoring

**Status:** Accepted
**Date:** 2025-01-29
**Context:** Phase 3 - God Objects Remediation

## Context

We face a significant technical debt challenge: 40+ god objects throughout the codebase require refactoring to improve maintainability, testability, and clarity. The largest of these include:

- **IndexedDB** (1,348 lines) - Most complex storage layer
- **Metrics Exporter** (1,224 lines) - Multiple responsibilities
- **Session Manager** (826 lines) - Lifecycle state tracking complexity
- **Pattern Worker Pool** (756 lines) - Worker management and scheduling

These objects have evolved organically and contain critical business logic. Refactoring them carries substantial risk:

1. **No comprehensive test suite** exists for many modules
2. **Behavior is poorly documented** - code is the only specification
3. **Complex interactions** between modules may have implicit dependencies
4. **Production data** depends on exact current behavior

## Decision

We will use **characterization testing** before any refactoring work.

**Characterization testing** means:
- Write tests that **document and lock in current behavior**
- Tests capture what the system **currently does**, not what it **should do**
- Use these tests as a safety net during refactoring
- Fix any bugs discovered **after** refactoring is complete

### Implementation Approach

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

## Consequences

### Positive

- **Ensures no behavior changes** during refactoring
- **Documents current behavior** explicitly
- **Provides safety net** for aggressive refactoring
- **Enables confidence** when working with complex, poorly understood code
- **Creates regression test suite** for future changes
- **Makes implicit dependencies** between modules visible

### Negative

- **Adds test maintenance overhead** - tests must be updated along with code
- **May capture bugs as "expected behavior"** - requires careful post-refactoring review
- **Initial time investment** - slows start of refactoring work
- **Tests may be brittle** if they capture implementation details instead of behavior
- **Requires discipline** to avoid "fixing" bugs during characterization (tempting but dangerous)

## Mitigation Strategies

1. **Document "interesting" behaviors** in test comments with `// INTERESTING:` prefix
2. **Post-refactoring sprint** specifically for reviewing characterization tests
3. **Separate characterization test suite** from behavioral tests
4. **Code review requirement** for all characterization tests
5. **Coverage thresholds** - must characterize >90% of code paths

## References

- Michael Feathers' "Working Effectively with Legacy Code"
- Phase 3 Plan: `docs/plans/PHASE-3-GOD-OBJECTS-COMPLETE.md`
- Test Infrastructure: `tests/unit/` and `tests/e2e/`
