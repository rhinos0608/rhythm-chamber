# Codebase Structure

**Analysis Date:** 2025-01-21

## Directory Layout

```
rhythm-chamber/
├── css/                    # Stylesheets
├── docs/                   # Documentation
│   └── user-journeys/      # User journey documentation
├── js/                     # Core application code (ES modules)
├── js/controllers/         # UI orchestration
├── js/embeddings/          # Embedding task management
├── js/functions/           # Function calling system
│   ├── executors/          # Tool executors
│   ├── schemas/            # Function schemas
│   └── utils/              # Function utilities
├── js/observability/       # Performance monitoring
├── js/providers/           # AI provider adapters
├── js/security/            # Security modules
├── js/services/            # Business logic services
├── js/services/tool-strategies/  # Tool execution strategies
├── js/state/               # State management
├── js/storage/             # Data persistence layer
├── js/utils/               # Utility functions
├── js/workers/             # Web workers
├── js/vendor/              # Third-party libraries
├── scripts/                # Build/dev scripts
├── tests/                  # Test files
│   ├── fixtures/           # Test data
│   ├── integration/        # Integration tests
│   └── unit/               # Unit tests
├── .planning/              # Planning documents
├── node_modules/           # Dependencies
└── test-results/           # Playwright test outputs
```

## Directory Purposes

**`js/`:**
- Purpose: Main application code (ES6 modules)
- Contains: Core logic, entry points, primary modules
- Key files: `main.js`, `app.js`, `chat.js`, `settings.js`, `rag.js`

**`js/controllers/`:**
- Purpose: UI orchestration and user interaction handling
- Contains: Controllers for specific UI areas
- Key files: `chat-ui-controller.js`, `view-controller.js`, `sidebar-controller.js`, `file-upload-controller.js`, `spotify-controller.js`, `demo-controller.js`, `reset-controller.js`, `observability-controller.js`

**`js/services/`:**
- Purpose: Cross-cutting business logic and coordination services
- Contains: State management, tab coordination, event bus, tool strategies
- Key files: `tab-coordination.js`, `session-manager.js`, `event-bus.js`, `conversation-orchestrator.js`, `message-lifecycle-coordinator.js`, `worker-coordinator.js`, `config-loader.js`, `error-recovery-coordinator.js`, `circuit-breaker.js`

**`js/storage/`:**
- Purpose: Data persistence layer with multi-tab safety
- Contains: IndexedDB wrapper, transaction management, caching
- Key files: `indexeddb.js`, `transaction.js`, `write-ahead-log.js`, `migration.js`, `event-log-store.js`, `quota-manager.js`, `lru-cache.js`

**`js/providers/`:**
- Purpose: AI provider abstraction (Bring Your Own AI)
- Contains: Adapters for different AI providers
- Key files: `provider-interface.js`, `openrouter.js`, `ollama-adapter.js`, `lmstudio.js`, `gemini.js`, `data-provider-interface.js`, `capabilities.js`

**`js/security/`:**
- Purpose: Security, encryption, and anomaly detection
- Contains: Encryption, token binding, recovery handlers
- Key files: `index.js`, `encryption.js`, `token-binding.js`, `anomaly.js`, `secure-token-store.js`, `recovery-handlers.js`

**`js/state/`:**
- Purpose: Centralized state management
- Contains: Application state with immutable snapshots
- Key files: `app-state.js`

**`js/functions/`:**
- Purpose: Function calling system for AI tools
- Contains: Schemas, executors, utilities
- Key files: `index.js`, schemas in `schemas/`, executors in `executors/`

**`js/workers/`:**
- Purpose: Web workers for heavy computation
- Contains: Pattern detection, vector search, embedding workers
- Key files: `pattern-worker-pool.js`, `pattern-worker.js`, `vector-search-worker.js`, `shared-worker.js`, `embedding-worker.js`

**`js/observability/`:**
- Purpose: Performance monitoring and metrics
- Contains: Core Web Vitals, profiling, metrics export
- Key files: `core-web-vitals.js`, `metrics-exporter.js`, `observability-settings.js`

**`tests/`:**
- Purpose: Test suites (Playwright E2E, Vitest unit)
- Contains: Unit tests, integration tests, fixtures
- Key files: Playwright config, test fixtures

## Key File Locations

**Entry Points:**
- `index.html`: Landing page and marketing
- `app.html`: Main application container
- `js/main.js`: Application bootstrap and security checks
- `js/app.js`: Controller initialization and routing

**Configuration:**
- `js/config.js`: Runtime configuration
- `js/config.example.js`: Configuration template
- `package.json`: Dependencies and scripts

**Core Logic:**
- `js/chat.js`: Chat orchestration and AI integration
- `js/rag.js`: Retrieval-augmented generation
- `js/patterns.js`: Music pattern detection
- `js/personality.js`: Personality classification
- `js/data-query.js`: Data querying logic

**State & Storage:**
- `js/state/app-state.js`: Centralized state management
- `js/storage/indexeddb.js`: Database operations
- `js/storage.js`: High-level storage API

**Testing:**
- `playwright.config.ts`: E2E test configuration
- `vitest.config.js`: Unit test configuration
- `tests/`: Test files and fixtures

## Naming Conventions

**Files:**
- kebab-case for multi-word files: `chat-ui-controller.js`, `provider-interface.js`
- Single-word modules: `chat.js`, `patterns.js`, `storage.js`
- Test files: `*.test.js`, `*.spec.js`
- Worker files: `*-worker.js`

**Directories:**
- Plural for collections: `controllers/`, `services/`, `providers/`, `workers/`
- Singular for concepts: `state/`, `storage/`, `security/`
- Descriptive compound names: `tool-strategies/`, `embeddings/`

**Modules:**
- ES module exports: `export { init }` for controllers
- Named exports: `export function` for utilities
- Default exports: Rare, prefer named exports

**Classes:**
- PascalCase: `class ConversationOrchestrator`, `class TabCoordinator`

**Constants:**
- UPPER_SNAKE_CASE: `INDEXEDDB_NAME`, `CHAT_API_TIMEOUT_MS`

## Where to Add New Code

**New Feature:**
- Primary code: `js/` for core modules
- Tests: `tests/unit/` for unit tests, `tests/integration/` for integration tests
- Controllers: `js/controllers/` if feature has UI components
- Services: `js/services/` for business logic

**New Controller:**
- Implementation: `js/controllers/{feature}-controller.js`
- Import in: `js/main.js` and `js/app.js`
- Initialize in: `initializeControllers()` function in `js/app.js`

**New Service:**
- Implementation: `js/services/{service-name}.js`
- Import in: Controllers or other services that need it
- Consider: Adding to ModuleRegistry if heavy/lazy-loaded

**New AI Provider:**
- Implementation: `js/providers/{provider-name}.js`
- Interface: Implement `ProviderInterface` pattern
- Register in: `js/providers/provider-interface.js`

**New Tool/Function:**
- Schema: `js/functions/schemas/{category}-queries.js`
- Executor: `js/functions/executors/{category}-executors.js`
- Register in: `js/functions/index.js`

**Utilities:**
- Shared helpers: `js/utils/{utility-name}.js`
- Utility functions: Pure functions, clear inputs/outputs

**Web Workers:**
- Implementation: `js/workers/{worker-name}.js`
- Coordination: Use `WorkerCoordinator` for lifecycle management
- Pool: Consider worker pool for multiple instances

## Special Directories

**`js/vendor/`:**
- Purpose: Third-party libraries not in npm
- Generated: No
- Committed: Yes

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes
- Committed: No

**`.planning/`:**
- Purpose: Planning documents and architecture analysis
- Generated: Partially (codebase analysis)
- Committed: Yes

**`test-results/`:**
- Purpose: Playwright test outputs and artifacts
- Generated: Yes
- Committed: No

**`docs/user-journeys/`:**
- Purpose: User journey documentation
- Generated: No
- Committed: Yes

---

*Structure analysis: 2025-01-21*