# Agent & Skills Ecosystem Summary

**Last Updated:** 2026-01-26
**Version:** 1.0.0

---

## Overview

The Rhythm Chamber project includes a sophisticated agent and skills ecosystem designed for development workflows, code analysis, security auditing, and testing.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     AGENT & SKILLS ECOSYSTEM                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────┐      ┌──────────────────┐                    │
│  │     SKILLS       │ ───▶ │     AGENTS       │                    │
│  │  (Supporting)    │      │  (Orchestrate)   │                    │
│  └──────────────────┘      └──────────────────┘                    │
│         │                          │                                 │
│         ▼                          ▼                                 │
│  ┌──────────────────────────────────────────────┐                  │
│  │              EXTERNAL MCP TOOLS               │                  │
│  │  PAL, Context7, Web Search, ZAI, ZRead       │                  │
│  └──────────────────────────────────────────────┘                  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Agents (4 Total)

| Agent | Purpose | Category |
|-------|---------|----------|
| `refactoring-planner` | Code smell analysis and refactoring with design patterns | Development |
| `dependency-mapper` | Dependency graphs, cycle detection, coupling analysis | Development |
| **`security-auditor`** | **NEW: OWASP vulnerability detection, security control validation** | Security |
| **`test-generator`** | **NEW: Unit/integration test generation from AST** | Testing |

---

## Skills (5 Total)

### Existing Skills (2)

| Skill | Purpose | Category |
|-------|---------|----------|
| `ast-parser` | Extracts structured AST data (functions, classes, imports) | Code Analysis |
| `code-scanner` | Scans for security patterns, code smells, technical debt | Code Analysis |

### New Skills (3)

| Skill | Purpose | Category |
|-------|---------|----------|
| **`security-validator`** | **NEW: Validates crypto, input, session security controls** | Security |
| **`test-builder`** | **NEW: Builds individual test cases and mock utilities** | Testing |
| **`coverage-analyzer`** | **NEW: Analyzes test coverage and identifies gaps** | Testing |

---

## New Security-Auditor Agent

### Location
`.claude/agents/security-auditor/SKILL.md`

### Capabilities

| Command | Description |
|---------|-------------|
| `audit-security` | Perform comprehensive security audit |
| `scan-vulnerabilities` | Scan for OWASP Top 10, ReDoS, XSS vulnerabilities |
| `validate-controls` | Validate security controls (crypto, input, session) |
| `check-supply-chain` | Audit dependencies for known vulnerabilities |
| `generate-report` | Generate security audit report with remediation |

### 6-Phase Process

1. **Discover** - Map security-relevant assets
2. **Scan** - Detect vulnerabilities (OWASP Top 10, ReDoS, XSS, CSRF)
3. **Validate** - Verify security controls are properly implemented
4. **Assess** - Calculate risk scores and prioritize remediation
5. **Report** - Generate comprehensive security reports
6. **Track** - Maintain security posture over time

### OWASP Top 10 Coverage

| Category | Detection Pattern | Severity |
|----------|-------------------|----------|
| A01 - Broken Access Control | Missing auth checks, IDOR | CRITICAL |
| A02 - Cryptographic Failures | Weak crypto, hardcoded keys | CRITICAL |
| A03 - Injection | SQL, NoSQL, XSS, command injection | CRITICAL |
| A04 - Insecure Design | Missing security headers | HIGH |
| A05 - Security Misconfiguration | Debug mode, verbose errors | MEDIUM |
| A06 - Vulnerable Components | Outdated dependencies | HIGH |
| A07 - Auth Failures | Weak passwords, session fixation | HIGH |
| A08 - Data Integrity | Insecure deserialization | HIGH |
| A09 - Logging Failures | Sensitive data in logs | MEDIUM |
| A10 - SSRF | URL parsing without validation | HIGH |

### Supporting Skills
- `code-scanner` - For initial security pattern detection
- `security-validator` - For detailed security control validation

---

## New Test-Generator Agent

### Location
`.claude/agents/test-generator/SKILL.md`

### Capabilities

| Command | Description |
|---------|-------------|
| `generate-tests` | Generate unit tests from AST analysis |
| `analyze-coverage` | Analyze test coverage and identify gaps |
| `generate-edge-cases` | Generate edge case and boundary tests |
| `generate-integration-tests` | Generate integration tests for workflows |
| `generate-mocks` | Generate mock utilities for dependencies |

### 5-Phase Process

1. **Analyze** - AST-based function discovery
2. **Generate** - Create test cases (happy path, edge cases, errors, async)
3. **Mock** - Generate mocks for external dependencies
4. **Integrate** - Organize tests into coherent suites
5. **Verify** - Analyze and report on coverage

### Test Categories

| Category | Description | Examples |
|----------|-------------|----------|
| Happy Path | Normal expected usage | Valid inputs, typical flows |
| Edge Cases | Boundary conditions | Empty, null, min/max values |
| Error Cases | Exception handling | Invalid inputs, error conditions |
| Async Cases | Promise behavior | Resolve, reject, timeout |
| Integration | Cross-module interactions | Real workflow scenarios |
| Performance | Stress testing | Large inputs, repeated operations |
| Security | Attack vectors | XSS, injection, ReDoS |

### Coverage Targets

| Metric | Target |
|--------|--------|
| Line Coverage | ≥ 80% |
| Branch Coverage | ≥ 75% |
| Function Coverage | ≥ 90% |
| Statement Coverage | ≥ 80% |

### Supporting Skills
- `ast-parser` - For extracting testable functions
- `test-builder` - For building individual test cases
- `coverage-analyzer` - For coverage gap analysis

---

## New Supporting Skills

### Security Validator Skill

**Location:** `.claude/skills/security-validator/SKILL.md`

Validates security controls and cryptographic implementations:

| Control Type | Validation Checks |
|--------------|-------------------|
| Crypto | Algorithm selection, key generation, IV/nonce, key storage, KDF, salt |
| Input | Allowlist patterns, length limits, type checking, ReDoS protection |
| Output | HTML escaping, JSON encoding, URL encoding |
| Session | Token binding, expiration, secure storage, HTTPS requirement |

### Test Builder Skill

**Location:** `.claude/skills/test-builder/SKILL.md`

Builds individual test cases and utilities:

| Test Type | Template |
|-----------|----------|
| Pure Function | Synchronous function tests |
| Async Function | Promise/async-await tests |
| Class Method | Instance method tests |
| Event Handler | Event emission tests |

### Coverage Analyzer Skill

**Location:** `.claude/skills/coverage-analyzer/SKILL.md`

Analyzes test coverage and identifies gaps:

| Metric | Definition | Target |
|--------|------------|--------|
| Line Coverage | Executable lines executed | ≥ 80% |
| Branch Coverage | Code branches executed | ≥ 75% |
| Function Coverage | Functions called | ≥ 90% |
| Statement Coverage | Statements executed | ≥ 80% |

---

## Integration Patterns

### Agent-to-Agent Invocation

```
security-auditor
  ├── invokes: code-scanner
  └── invokes: security-validator

test-generator
  ├── invokes: ast-parser
  ├── invokes: test-builder
  └── invokes: coverage-analyzer
```

### Agent-to-Skill Integration

```
┌─────────────────────────────────────────────────────┐
│              Security Auditor Workflow               │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1. code-scanner    → Initial security patterns     │
│  2. ast-parser      → Analyze crypto structure      │
│  3. security-validator → Validate controls          │
│  4. Generate Report → Remediation recommendations    │
│                                                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│              Test Generator Workflow                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1. ast-parser        → Extract testable functions  │
│  2. code-scanner      → Find untested patterns      │
│  3. test-builder      → Generate test code          │
│  4. coverage-analyzer → Identify coverage gaps      │
│  5. Generate Tests    → Full test suite             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## CLI Usage

### Security Auditor

```bash
# Full security audit
node .claude/agents/security-auditor/auditor.js js/ --full

# OWASP scan only
node .claude/agents/security-auditor/auditor.js js/ --owasp

# Validate controls
node .claude/agents/security-auditor/auditor.js js/security/ --validate

# Generate report
node .claude/agents/security-auditor/auditor.js js/ --report > security-report.md

# Filter by severity
node .claude/agents/security-auditor/auditor.js js/ --severity=CRITICAL,HIGH --json
```

### Test Generator

```bash
# Generate unit tests
node .claude/agents/test-generator/generator.js js/utils/validation.js --unit

# Analyze coverage
node .claude/agents/test-generator/generator.js js/services/ --coverage

# Generate edge cases
node .claude/agents/test-generator/generator.js js/utils/validation.js --edge-cases

# Generate all tests
node .claude/agents/test-generator/generator.js js/ --all
```

---

## Research Sources

### Security Best Practices

- **[AI Agent Security: Best Practices Guide 2025](https://www.digitalapplied.com/blog/ai-agent-security-best-practices-2025)** - 19% of AI-generated code contains security vulnerabilities
- **[2025 Enterprise AI Agent Security Checklist Guide](https://sparkco.ai/blog/2025-enterprise-ai-agent-security-checklist-guide)** - Comprehensive security checklist
- **[AI Agent Security Risks](https://www.mintmcp.com/blog/ai-agent-security-risks)** - 15-25% of AI code has vulnerabilities
- **[Secure Code Audits in 2025](https://www.codeant.ai/blogs/source-code-audit-checklist-best-practices-for-secure-code)** - Audit checklist and best practices
- **[OWASP Top 10 2025](https://owasp.org/www-project-top-10/)** - Web application security risks

### Testing Best Practices

- **[Protecting a TypeScript Codebase with AI Test Generation](https://www.startearly.ai/post/protecting-typescript-codebase-with-ai-test-generation)** - Achieved 88% coverage, 96% success rate
- **[TypeScript AI Unit Test Generators: Tusk vs Cursor vs Claude](https://blog.usetusk.ai/blog/comparing-ai-agents-for-unit-test-generation-typescript)** - April 2025 comparison
- **[AI Unit Testing: A Detailed Guide](https://testomat.io/blog/ai-unit-testing-a-detailed-guide/)** - August 2025 comprehensive guide
- **[How to Generate Test Cases With AI](https://www.testmu.ai/blog/generate-test-cases-with-ai/)** - January 2026, latest practices

---

## File Structure

```
.claude/
├── agents/
│   ├── refactoring-planner/
│   │   └── SKILL.md
│   ├── dependency-mapper/
│   │   ├── SKILL.md
│   │   └── dependency-analyzer.js
│   ├── security-auditor/              # NEW
│   │   ├── SKILL.md
│   │   └── auditor.js
│   └── test-generator/                # NEW
│       ├── SKILL.md
│       └── generator.js
├── skills/
│   ├── ast-parser/
│   │   ├── SKILL.md
│   │   └── parser.js
│   ├── code-scanner/
│   │   ├── SKILL.md
│   │   └── scanner.js
│   ├── security-validator/            # NEW
│   │   └── SKILL.md
│   ├── test-builder/                  # NEW
│   │   └── SKILL.md
│   └── coverage-analyzer/             # NEW
│       └── SKILL.md
```

---

## Quick Reference

### When to Use Each Agent

| Situation | Use Agent |
|-----------|-----------|
| Found a security issue | `security-auditor` |
| Need to audit crypto implementation | `security-auditor → validate-controls` |
| Pre-deployment security check | `security-auditor → audit-security` |
| Adding new features without tests | `test-generator → generate-tests` |
| Low test coverage on a module | `test-generator → analyze-coverage` |
| Edge case testing needed | `test-generator → generate-edge-cases` |
| Code smells detected | `refactoring-planner` |
| Circular dependency suspected | `dependency-mapper` |

---

## Roadmap

### Potential Future Agents

| Agent | Purpose | Priority |
|-------|---------|----------|
| `documentation-auditor` | API documentation completeness | Medium |
| `performance-analyzer` | Performance bottleneck detection | Medium |
| `accessibility-checker` | WCAG compliance verification | Low |
| `migration-planner` | Framework/library migration plans | Low |

### Potential Future Skills

| Skill | Purpose | Priority |
|-------|---------|----------|
| `api-documentor` | Generate API docs from AST | Medium |
| `benchmark-runner` | Performance benchmarking | Medium |
| `a11y-tester` | Accessibility test generation | Low |

---

## Summary

The expanded Rhythm Chamber agent and skills ecosystem now includes:

- **4 Agents** (2 new): refactoring-planner, dependency-mapper, security-auditor, test-generator
- **5 Skills** (3 new): ast-parser, code-scanner, security-validator, test-builder, coverage-analyzer
- **Comprehensive security coverage**: OWASP Top 10, ReDoS, XSS, CSRF, supply chain
- **Complete testing pipeline**: AST-based test generation, mock creation, coverage analysis

`★ Insight ─────────────────────────────────────`
**1. Composable Agent Architecture**: Each agent invokes supporting skills (ast-parser, code-scanner) rather than duplicating functionality. This creates a reusable toolkit where complex workflows are built from simple primitives.

**2. Security-First Testing**: The test-generator agent includes security-focused test generation (XSS, injection, ReDoS), reflecting the research finding that 15-25% of AI-generated code contains security vulnerabilities.

**3. Coverage-Driven Development**: The coverage-analyzer skill identifies gaps before test generation, ensuring tests are written for actual uncovered paths rather than duplicating existing coverage.
`─────────────────────────────────────────────────`
