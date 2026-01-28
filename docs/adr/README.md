# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs) for Rhythm Chamber. ADRs document significant architectural decisions, their context, and consequences.

## Table of Contents

### Testing & Quality

1. [Testing Methodology](001-testing-methodology.md) - Characterization testing and worker mock architecture
2. [Architecture Decisions](002-architecture-decisions.md) - Key architectural patterns and decisions

---

## What is an ADR?

An Architecture Decision Record (ADR) is a document that describes an important architectural decision, its context, and consequences. ADRs:

- **Document decisions** - Capture what was decided and why
- **Provide context** - Explain the problem being solved
- **Show alternatives** - List options that were considered
- **Track consequences** - Describe positive and negative impacts

## ADR Template

```markdown
# ADR-XXX: [Decision Title]

**Status:** [Proposed | Accepted | Deprecated | Superseded]
**Date:** YYYY-MM-DD
**Context:** [Project phase or context]

## Context

[Describe the problem or situation that led to this decision]

## Decision

[Describe the decision that was made]

## Consequences

### Positive
- [List positive consequences]

### Negative
- [List negative consequences]

## Alternatives Considered

1. [Alternative 1] - [Why it wasn't chosen]
2. [Alternative 2] - [Why it wasn't chosen]

## References

- [Link to related documents]
```

## How to Write an ADR

1. **Use the template** - Copy the template above
2. **Be concise** - Focus on the essential information
3. **Provide context** - Explain why the decision was necessary
4. **List alternatives** - Show that options were considered
5. **Document consequences** - Both positive and negative
6. **Link to related docs** - Cross-reference other ADRs and documentation

## ADR Lifecycle

- **Proposed** - Draft stage, open for feedback
- **Accepted** - Decision made, implementation in progress
- **Deprecated** - No longer recommended but still in use
- **Superseded** - Replaced by a newer ADR

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| 001 | Testing Methodology | Accepted | 2025-01-29 |
| 002 | Architecture Decisions | Accepted | 2025-01-29 |

## Related Documentation

- [ARCHITECTURE.md](../../ARCHITECTURE.md) - System architecture overview
- [REFACTORING.md](../../REFACTORING.md) - Refactoring history and patterns
- [TESTING.md](../../TESTING.md) - Testing guide and methodologies
