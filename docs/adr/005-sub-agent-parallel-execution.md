# ADR-005: Sub-Agent Parallel Execution Strategy

**Status:** Accepted
**Date:** 2025-01-29
**Context:** Phase 3 - God Objects Remediation

## Context

Phase 3 requires refactoring 40+ god objects across the codebase. Given the scope:

- **40+ objects** to refactor
- **20,000+ lines** of affected code
- **4-week timeline** for completion
- **Multiple developers/sub-agents** working in parallel

We need a systematic approach to:
1. Execute work efficiently with parallel execution
2. Avoid merge conflicts between concurrent work
3. Maintain code stability throughout refactoring
4. Ensure proper testing and documentation

### Risk Categories

**Low Risk:**
- Test infrastructure improvements
- Documentation updates
- Simple extraction methods
- Adding characterization tests

**Medium Risk:**
- Medium-complexity refactoring
- Facade creation
- Module splitting
- Consumer migration

**High Risk:**
- Core storage layers (IndexedDB, Session Manager)
- Worker architecture changes
- Performance-critical code
- Data migration logic

## Decision

Use **sub-agents with maximum 2-3 parallel workers** to balance speed and safety.

### Parallel Execution Strategy

```
Week 1: Test Infrastructure (Sequential)
├── Sub-Agent 1: Test Framework Setup
│   └── Must complete before other work
└── Sub-Agent 2: Characterization Tests
    └── Depends on test framework

Week 2: Low-Risk Refactoring + Documentation (2-3 Parallel)
├── Sub-Agent 1: Documentation (ADR creation, README updates)
├── Sub-Agent 2: Simple Refactoring (utils, helpers, validators)
└── Sub-Agent 3: Characterization Tests (for medium-risk modules)

Week 3: Medium-Risk Refactoring (Sequential or Limited Parallel)
├── Sub-Agent 1: Metrics Exporter Refactoring
├── Sub-Agent 2: Session Manager Refactoring
│   └── Starts after Metrics Exporter completes
└── Sub-Agent 3: Documentation and Test Updates

Week 4: High-Risk Refactoring (Sequential)
├── Sub-Agent 1: IndexedDB Refactoring
│   └── Only one high-risk task at a time
└── Sub-Agent 2: Testing and Verification
```

### Parallel Execution Rules

**1. Low-Risk Work Can Run in Parallel (2-3 workers)**

```yaml
parallel_tasks:
  - task: "Update README documentation"
    risk: low
    agent: "sub-agent-1"

  - task: "Refactor utility functions"
    risk: low
    agent: "sub-agent-2"

  - task: "Add characterization tests for helpers"
    risk: low
    agent: "sub-agent-3"
```

**2. Medium-Risk Work Requires Coordination**

```yaml
sequential_tasks:
  - task: "Refactor Metrics Exporter"
    risk: medium
    agent: "sub-agent-1"

  - task: "Refactor Session Manager"
    risk: medium
    agent: "sub-agent-2"
    depends_on: "Metrics Exporter"
    reason: "Shares common patterns, avoid merge conflicts"
```

**3. High-Risk Work Must Be Sequential**

```yaml
high_risk_tasks:
  - task: "Refactor IndexedDB"
    risk: high
    agent: "sub-agent-1"
    exclusive: true  # Only this task running

  - task: "Refactor Worker Pool"
    risk: high
    agent: "sub-agent-1"
    starts_after: "IndexedDB"
```

### Risk Assessment Criteria

**Low Risk (can parallelize):**
- Doesn't touch core business logic
- No database schema changes
- No API contract changes
- Isolated modules with few dependencies
- Documentation and tests
- Simple extraction methods

**Medium Risk (limited parallelization):**
- Touches multiple modules
- Some dependencies on other modules
- Moderate complexity
- Some consumers to update
- Facade creation

**High Risk (must be sequential):**
- Core storage layers
- Data migration logic
- Performance-critical code
- Many consumers affected
- Complex inter-module dependencies
- Worker architecture changes

### Conflict Prevention

**1. Branch Strategy**

```bash
# Each sub-agent works in feature branch
feature/refactor-metrics-exporter
feature/refactor-session-manager
feature/refactor-indexeddb

# Merge to main only after:
# - All tests pass
# - Code review complete
# - Documentation updated
```

**2. Module Ownership**

```yaml
module_ownership:
  metrics-exporter:
    owner: "sub-agent-1"
    files:
      - "js/observability/metrics-exporter/**"

  session-manager:
    owner: "sub-agent-2"
    files:
      - "js/services/session-manager/**"

  indexeddb:
    owner: "sub-agent-3"
    files:
      - "js/storage/indexeddb/**"
```

**3. Communication Protocol**

```yaml
before_starting:
  - "Check STATE.md for current position"
  - "Verify no conflicting work in progress"
  - "Claim modules in STATE.md"

after_completion:
  - "Update STATE.md with completion status"
  - "Create SUMMARY.md with results"
  - "Mark modules as completed"
```

## Execution Order by Week

### Week 1: Test Infrastructure (Sequential)

**Goal:** Establish solid testing foundation

**Tasks:**
1. Characterization test framework setup
2. Write characterization tests for all god objects
3. Achieve >90% coverage baseline
4. Document all current behaviors

**Parallelization:** None (must be sequential - test framework first)

### Week 2: Low-Risk Refactoring + Documentation (2-3 Parallel)

**Goal:** Quick wins and documentation

**Parallel Tasks:**
1. Create ADRs and update README (sub-agent-1)
2. Refactor utility modules (sub-agent-2)
3. Add characterization tests for medium-risk modules (sub-agent-3)

**Why Safe:** These tasks touch unrelated code

### Week 3: Medium-Risk Refactoring (Sequential or Limited Parallel)

**Goal:** Refactor complex but non-critical modules

**Tasks:**
1. Metrics Exporter refactoring (sub-agent-1)
2. Session Manager refactoring (sub-agent-2, starts after #1)
3. Pattern Worker Pool refactoring (sub-agent-3, starts after #2)

**Why Limited:** These modules share patterns and dependencies

### Week 4: High-Risk Refactoring (Sequential)

**Goal:** Refactor core storage layers

**Tasks:**
1. IndexedDB refactoring (sub-agent-1, exclusive)
2. Testing and verification (sub-agent-1, continues)
3. Performance validation (sub-agent-1, continues)

**Why Sequential:** Highest risk, must be careful

## Rationale

### Why Max 2-3 Parallel Workers?

**Too few (1 worker):**
- ✅ Zero merge conflicts
- ✅ Simple coordination
- ❌ Too slow for 4-week timeline
- ❌ Underutilizes resources

**Too many (5+ workers):**
- ✅ Fast execution
- ❌ Constant merge conflicts
- ❌ Complex coordination overhead
- ❌ High risk of breaking changes
- ❌ Difficult to track progress

**Just right (2-3 workers):**
- ✅ Balances speed and safety
- ✅ Manageable merge conflicts
- ✅ Clear module ownership
- ✅ Can parallelize low-risk work
- ✅ Sequentializes high-risk work

### Why Risk-Based Parallelization?

**Low-risk work:** Parallelize for speed
- Minimal conflicts
- Easy to fix if issues arise
- Quick wins build momentum

**Medium-risk work:** Limited parallelization
- Some dependencies exist
- Need coordination
- Can overlap if modules unrelated

**High-risk work:** Sequential for safety
- Core functionality must remain stable
- Errors are expensive
- Careful review required

## Success Criteria

- All 40+ god objects refactored
- Zero breaking changes to production
- Test coverage >90% maintained
- All merge conflicts resolved
- Documentation complete
- 4-week timeline met

## Monitoring and Tracking

**State Tracking:**

```json
{
  "phase": "3",
  "active_agents": 2,
  "current_tasks": [
    {
      "agent": "sub-agent-1",
      "task": "Refactor Metrics Exporter",
      "status": "in_progress",
      "branch": "feature/refactor-metrics-exporter"
    },
    {
      "agent": "sub-agent-2",
      "task": "Documentation updates",
      "status": "in_progress",
      "branch": "feature/documentation-updates"
    }
  ],
  "completed_modules": [
    "test-framework",
    "characterization-tests",
    "adr-docs"
  ]
}
```

**Progress Tracking:**

```markdown
## Phase 3 Progress

### Week 1: Test Infrastructure
- [x] Test framework setup
- [x] Characterization tests written
- [ ] Coverage verification

### Week 2: Low-Risk Refactoring
- [ ] ADR creation
- [ ] Utility refactoring
- [ ] Documentation updates

### Week 3: Medium-Risk Refactoring
- [ ] Metrics Exporter
- [ ] Session Manager
- [ ] Pattern Worker Pool

### Week 4: High-Risk Refactoring
- [ ] IndexedDB
- [ ] Final verification
```

## References

- ADR-001: Characterization Testing
- ADR-004: Facade Pattern for Refactoring
- Phase 3 Plan: `docs/plans/PHASE-3-GOD-OBJECTS-COMPLETE.md`
- STATE.md: Project state tracking
