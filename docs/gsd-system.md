# GSD System: Development Methodology

**Version:** 1.8.0
**Status:** Active development methodology for Rhythm Chamber

---

## Overview

The **GSD (Get Shit Done)** system is an AI-orchestrated project management framework designed for systematic software development. It combines structured planning, wave-based parallel execution, and comprehensive verification to deliver complex projects through phases, plans, tasks, and waves.

**Core Philosophy:** Autonomous execution with strategic human verification checkpoints. The system automates everything possible while ensuring critical decisions and verifications involve human oversight.

---

## Hierarchy: Milestones → Phases → Plans → Tasks → Waves

```
Milestone (e.g., v0.9 Security Hardening)
    └── Phase (e.g., 09-key-foundation)
            ├── Plan 01 (Wave 1) ──┐
            ├── Plan 02 (Wave 1) ──┤─ Parallel Execution
            ├── Plan 03 (Wave 2) ──┘   (after Wave 1 complete)
            └── Plan 04 (Wave 3)       (after Wave 2 complete)
```

### Milestones
Major version markers (v0.9, v1.0, v1.1) that group multiple phases into shippable releases. Trigger archival, full PROJECT.md review, and git tagging.

### Phases
High-level milestones grouping related work with:
- Clear goals and requirements
- Success criteria
- Multiple plans (e.g., 09-01, 09-02, 09-03)
- Verification reports

### Plans
Specific executable units with:
- Frontmatter metadata (phase, wave, dependencies, autonomous flag)
- Objectives and context
- Atomic tasks
- Must-have verification criteria
- Result in SUMMARY.md files

### Tasks
Atomic units within plans:
- **Automatic**: Fully automated execution
- **Checkpoint**: Require human verification
- Committed individually to git

### Waves
Execution groups based on dependency analysis:
- **Wave 1**: No dependencies (parallel execution)
- **Wave 2+**: Depend on completed waves (sequential)
- Enable parallelization while respecting dependencies

---

## Key Workflows

### Primary Development Workflows

| Workflow | Purpose | Frequency |
|----------|---------|-----------|
| `execute-phase` | Execute all plans in a phase using wave-based parallelization | Most common (90%) |
| `execute-plan` | Execute single PLAN.md and create SUMMARY.md | Per plan |
| `verify-work` | User Acceptance Testing (UAT) with persistent state | Post-phase |
| `complete-milestone` | Mark shipped versions, create historical records | Per release |

### Planning Workflows

| Workflow | Purpose | When to Use |
|----------|---------|-------------|
| `new-milestone` | Initialize new milestone with phases and requirements | Starting new version |
| `plan-phase` | Create detailed plans for a phase with wave grouping | Before execution |
| `discuss-phase` | Facilitate structured discussion about requirements | Pre-planning |
| `discovery-phase` | Research and understand codebase before planning | Brownfield projects |

### Analysis Workflows

| Workflow | Purpose | Output |
|----------|---------|--------|
| `map-codebase` | Analyze existing codebase structure | Codebase documentation |
| `verify-phase` | Phase-level verification after plans complete | Verification reports |
| `diagnose-issues` | Systematic debugging workflow | Root cause analysis |

---

## File Structure

```
.planning/
├── PROJECT.md              # Living project context
├── STATE.md                # Current position and decisions
├── ROADMAP.md              # Phase-level planning
├── REQUIREMENTS.md         # Current milestone requirements
├── config.json             # Planning behavior configuration
├── MILESTONES.md           # Historical milestone records
│
├── phases/
│   ├── 09-key-foundation/
│   │   ├── 09-RESEARCH.md
│   │   ├── 09-01-PLAN.md
│   │   ├── 09-01-SUMMARY.md
│   │   └── 09-VERIFICATION.md
│   └── ...
│
├── research/
│   ├── STACK.md
│   ├── FEATURES.md
│   ├── ARCHITECTURE.md
│   └── SUMMARY.md
│
└── milestones/
    ├── v0.9-ROADMAP.md
    └── v0.9-REQUIREMENTS.md
```

---

## Naming Conventions

- **Phases**: `XX-descriptive-name` (e.g., `09-key-foundation`)
- **Plans**: `XX-YY-PLAN.md` (e.g., `09-01-PLAN.md`)
- **Summaries**: `XX-YY-SUMMARY.md`
- **Research**: `XX-RESEARCH.md` (phase-level)
- **Verification**: `XX-VERIFICATION.md` (phase-level)
- **Decimal phases**: `XX.Y-descriptive-name` (e.g., `01.1-hotfix`)

---

## Plan Frontmatter Schema

Every PLAN.md includes structured frontmatter:

```yaml
---
phase: 09-key-foundation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - js/security/key-manager.js
autonomous: true

must_haves:
  truths:
    - "KeyManager module creates non-extractable CryptoKey objects"
  artifacts:
    - path: "js/security/key-manager.js"
      provides: "Centralized key lifecycle management"
      exports: ["initializeSession", "getSessionKey"]
      min_lines: 150
  key_links:
    - from: "js/security/key-manager.js"
      to: "window.crypto.subtle"
      via: "Web Crypto API"
      pattern: "crypto\\.subtle\\.(importKey|deriveKey)"
---
```

---

## Key Patterns

### Autonomous Execution
Plans marked `autonomous: true` execute without checkpoints. Checkpoint plans pause for human verification at strategic points.

### Wave-Based Parallelization
```javascript
// Wave 1: Plans 01-02 execute in parallel
Promise.all([
  executePlan(09-01),
  executePlan(09-02)
])

// Wave 2: Plan 03 executes after Wave 1 complete
executePlan(09-03)
```

### Must-Haves Validation
- **Truths**: Verifiable facts about implementation
- **Artifacts**: Concrete deliverables with paths and requirements
- **Key Links**: Integration points with regex patterns

### Atomic Commits
Each task commits individually:
```bash
feat(09-01): create KeyManager module
fix(09-01): resolve secure context validation
test(09-01): add key derivation tests
```

---

## Verification and Testing

### User Acceptance Testing (UAT)
- Conversational testing with persistent state
- Extracts deliverables from SUMMARY.md files
- Tracks progress in UAT.md files (survives `/clear`)
- Feeds gaps back into planning via `--gaps-only`

### Phase Verification
- Automated verification against must-haves
- Integration testing across plans
- Gap identification and closure planning

### Verification Reports
Each phase creates VERIFICATION.md with:
- Score (N/M must-haves verified)
- Gap summaries
- Human verification checklist

---

## Current Usage in Rhythm Chamber

### v0.9 Security Hardening Milestone

**Status:** ✅ COMPLETE
**Phases:** 6 phases (Phases 9-14)
**Requirements:** 23/23 satisfied (100%)
**Integration Gaps Closed:** 3 critical gaps

| Phase | Name | Status | Plans |
|-------|------|--------|-------|
| 9 | Key Foundation | ✅ Complete | 4 |
| 10 | Storage Encryption | ⚠️ Superseded | 0 |
| 11 | Cross-Tab Security | ⚠️ Superseded | 0 |
| 12 | KeyManager Integration | ✅ Complete | 1 |
| 13 | Storage Encryption Impl | ✅ Complete | 4 |
| 14 | Cross-Tab Security Impl | ✅ Complete | 2 |

**Security Modules Created:**
- KeyManager (297 lines) - Non-extractable key lifecycle
- StorageEncryption (556 lines) - AES-GCM-256 encryption
- MessageSecurity (451 lines) - HMAC-SHA256 message signing

---

## Documentation Artifacts

| Artifact | Purpose | Created By |
|----------|---------|------------|
| PLAN.md | Executable plan with tasks and verification | Planner agent |
| SUMMARY.md | Completion record with metrics, commits, decisions | Executor agent |
| VERIFICATION.md | Phase verification results | Verifier agent |
| STATE.md | Current position and accumulated decisions | Orchestrator |
| RESEARCH.md | Phase research findings | Researcher agents |

---

## Key Strengths

1. **Systematic Progression** - Clear hierarchy prevents scope creep
2. **Dependency Management** - Wave system enables parallel execution
3. **Autonomous Execution** - Most work automated, humans verify strategically
4. **Comprehensive Documentation** - Every decision recorded for traceability
5. **Git Integration** - Atomic commits, clear history, milestone tagging
6. **Verification-First** - UAT survives context clears, feeds back to planning
7. **Security-Conscious** - Fail-closed defaults, explicit reasoning for security

---

## Additional Resources

**Planning System Location:** `~/.claude/get-shit-done/`

**Key References:**
- `workflows/execute-phase.md` - Phase execution orchestration
- `workflows/execute-plan.md` - Plan execution details
- `templates/summary.md` - Summary structure
- `references/checkpoints.md` - Checkpoint patterns
- `references/ui-brand.md` - Visual patterns and conventions

---

*GSD System Version: 1.8.0*
*Last Updated: 2026-01-21*
