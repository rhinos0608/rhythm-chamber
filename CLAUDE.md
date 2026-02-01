# CLAUDE.md

> **Purpose**: Primary onboarding for AI agents working on this codebase
> **Deep dive**: [AGENT_CONTEXT.md](AGENT_CONTEXT.md) | **Contribution guide**: [CONTRIBUTING.md](CONTRIBUTING.md)

---

## WHAT — Rhythm Chamber

AI-powered music analytics that tells users what their Spotify listening history says about their personality. Like Spotify Wrapped but deeper, year-round, and conversational.

**Core values**: Privacy-first, 100% client-side, user-controlled AI providers (BYOI)

**Tech stack**: Modern vanilla JavaScript (ES6 modules) + IndexedDB + Web Workers + WASM semantic search

---

## WHY — Architecture Principles

### HNW Pattern (Hierarchical Network Wave)

```
★ Insight ─────────────────────────────────────
• Hierarchy: App → Controller → Service → Provider (follow the chain)
• Network: EventBus for cross-module communication (no tight coupling)
• Wave: TabCoordinator for cross-tab coordination (no conflicts)
─────────────────────────────────────────────────
```

**Implications**:

- ✅ Controllers call Services, Services call Providers
- ✅ Use EventBus for cross-module communication
- ❌ No circular dependencies or bypassing layers

### Zero-Backend Philosophy

Everything runs in the browser. No servers, no data transmission.

- Data storage: IndexedDB (encrypted)
- AI processing: User's chosen provider (local/cloud)
- Vector search: @xenova/transformers (100% local)

### BYOI Model (Bring Your Own Intelligence)

Users choose their AI provider. The app orchestrates, doesn't dictate.
**Key implication**: Always use the Provider abstraction layer — never hard-code API calls.

---

## HOW — Critical Rules

### Universally Required

1. **ES6 Modules Only** — No globals (`window.foo = ...` prevents tree-shaking)
2. **Documentation Sync** — Run `npm run docs:sync` before committing (pre-commit hook enforces)
3. **Security Review** — Any changes to `js/security/` require review (see [SECURITY.md](SECURITY.md))
4. **JSDoc for Public APIs** — Auto-generates [API.md](API.md) documentation

### Dependency Chain

```
js/
├── main.js              # Entry point
├── app.js               # Orchestrator
├── controllers/         # UI layer (21)
├── services/            # Business logic (94)
├── utils/               # Shared utilities (37)
├── storage/             # IndexedDB
├── security/            # Encryption (review required!)
└── providers/           # LLM adapters
```

### Before Committing

- [ ] Tests pass: `npm run test:unit` and `npm test` (E2E)
- [ ] Documentation synced: `npm run docs:sync`
- [ ] No accidental globals: `npm run lint:globals`
- [ ] Security reviewed if needed

---

## Progressive Disclosure

**Task-specific documentation** — Read these when relevant:

- **Adding features**: [CONTRIBUTING.md](CONTRIBUTING.md) - Branch strategy, commit format, PR process
- **Security requirements**: [SECURITY.md](SECURITY.md) - Threat model, encryption patterns
- **Component details**: [AGENT_CONTEXT.md](AGENT_CONTEXT.md) - All 53+ components documented
- **Testing**: [CONTRIBUTING.md](CONTRIBUTING.md)#testing - Unit and E2E setup
- **API reference**: [API.md](API.md) - Auto-generated from JSDoc
- **Development commands**: `package.json` scripts
- **Common patterns**: [AGENT_CONTEXT.md](AGENT_CONTEXT.md) - Storage, EventBus, OperationLock
- **MCP server**: [mcp-server/README.md](mcp-server/README.md) - Semantic search, architecture validation

---

**When in doubt**:

1. Check [AGENT_CONTEXT.md](AGENT_CONTEXT.md) for component details
2. Follow existing patterns in similar code
3. Use EventBus for communication, not direct calls
4. Test everything before committing

**Last Updated**: 2026-01-30
