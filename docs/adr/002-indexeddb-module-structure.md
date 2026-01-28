# ADR-002: Module Structure for IndexedDB

**Status:** Proposed
**Date:** 2025-01-29
**Context:** Phase 3.2 - IndexedDB Refactoring

## Context

The IndexedDB storage module is the largest and most complex storage layer in the codebase:

- **1,348 lines** in a single file
- **Multiple responsibilities:**
  - Connection management and lifecycle
  - Schema migrations and upgrades
  - Transaction management
  - Read/write operations
  - Query building and indexing
  - Error handling and recovery
  - Performance monitoring
  - Encryption wrapper integration

This god object violates Single Responsibility Principle and is difficult to:

- **Test** - too many dependencies and interactions
- **Understand** - complex interwoven logic
- **Maintain** - changes risk breaking unrelated functionality
- **Extend** - adding features requires modifying core logic

## Decision

Split IndexedDB into **9 focused modules** using the facade pattern.

### Proposed Module Structure

```
js/storage/indexeddb/
├── index.js                    # Facade - public API
├── connection-manager.js       # DB connection lifecycle
├── schema-registry.js          # Schema definitions and versions
├── migration-runner.js         # Migration execution engine
├── transaction-manager.js      # Transaction lifecycle and modes
├── query-builder.js            # Complex query construction
├── index-manager.js            # Index creation and management
├── encryption-wrapper.js       # Encryption/decryption layer
├── error-handler.js            # Error mapping and recovery
└── performance-monitor.js      # Metrics and optimization
```

### Module Responsibilities

**1. Connection Manager** (~150 lines)
- Open/close database connections
- Connection pooling and reuse
- Connection health checks
- Reconnection logic

**2. Schema Registry** (~100 lines)
- Define database schema
- Store version history
- Object store definitions
- Index specifications

**3. Migration Runner** (~150 lines)
- Execute version migrations
- Migration rollback support
- Migration state tracking
- Data transformation during migration

**4. Transaction Manager** (~200 lines)
- Create transactions (read/write/readwrite)
- Transaction lifecycle management
- Transaction mode validation
- Batch operation support

**5. Query Builder** (~200 lines)
- Build complex queries
- Filter, sort, paginate
- Join operations (if supported)
- Query optimization hints

**6. Index Manager** (~150 lines)
- Create and delete indexes
- Index validation
- Auto-index policies
- Index performance metrics

**7. Encryption Wrapper** (~100 lines)
- Encrypt data before storage
- Decrypt data on retrieval
- Key management integration
- Encryption versioning

**8. Error Handler** (~150 lines)
- Map DOMException to app errors
- Retry logic for transient failures
- Constraint violation handling
- Error recovery strategies

**9. Performance Monitor** (~100 lines)
- Query performance tracking
- Slow query detection
- Index usage metrics
- Cache hit/miss ratios

### Facade Pattern

**index.js** provides backward-compatible API:

```javascript
// Public API unchanged
export class IndexedDBStorage {
  constructor(config) { /* delegates to modules */ }
  async connect() { /* Connection Manager */ }
  async put(store, data) { /* Transaction Manager */ }
  async get(store, key) { /* Query Builder */ }
  async query(store, filters) { /* Query Builder + Index Manager */ }
  async migrate(version) { /* Migration Runner */ }
  // ... all existing methods
}
```

## Alternatives Considered

### Alternative 1: Single File with Better Organization
**Description:** Keep one file but use sections and comments extensively

**Rejected because:**
- Still 1,348 lines - too large for effective navigation
- No separation of concerns at code level
- Cannot test modules independently
- Still violates SRP

### Alternative 2: Complete Rewrite
**Description:** Build new IndexedDB abstraction from scratch

**Rejected because:**
- Extremely high risk - could lose data or break production
- Time-intensive - delays other refactoring work
- Unknown edge cases in current implementation
- No clear benefit over modular refactoring

### Alternative 3: Leave as-is
**Description:** Accept the technical debt

**Rejected because:**
- Continuing maintenance burden
- Blocks other refactoring (dependencies)
- Test coverage will remain poor
- Technical debt compounds over time

## Consequences

### Positive

- **Each module <400 lines** - manageable and focused
- **Clear separation of concerns** - one responsibility per module
- **Facade maintains backward compatibility** - zero breaking changes
- **Independent testing** - each module can be unit tested
- **Parallel development** - different modules can be refactored independently
- **Better error handling** - specialized error handler module
- **Performance monitoring** - built-in metrics collection

### Negative

- **More files to navigate** - increased complexity in file structure
- **Import complexity** - may need to import from multiple modules
- **Inter-module dependencies** - need to manage dependencies carefully
- **Potential over-engineering** - some modules may be too small
- **Learning curve** - developers must understand new structure
- **Refactoring risk** - splitting code introduces bugs

## Migration Strategy

1. **Phase 1: Characterization Testing**
   - Write comprehensive tests for current IndexedDB
   - Achieve >90% coverage
   - Document all behaviors

2. **Phase 2: Create Module Structure**
   - Create new module files
   - Move code into appropriate modules
   - Ensure all tests pass

3. **Phase 3: Build Facade**
   - Create index.js with public API
   - Delegate to internal modules
   - Verify backward compatibility

4. **Phase 4: Incremental Improvement**
   - Optimize module boundaries
   - Improve inter-module communication
   - Enhance test coverage per module

## Success Criteria

- All existing tests pass
- Zero breaking changes to public API
- Each module <400 lines
- Each module has >80% test coverage
- No performance regression
- Documentation updated

## References

- ADR-001: Characterization Testing
- ADR-004: Facade Pattern for God Object Refactoring
- Phase 3.2 Plan: `docs/plans/PHASE-3-GOD-OBJECTS-COMPLETE.md`
