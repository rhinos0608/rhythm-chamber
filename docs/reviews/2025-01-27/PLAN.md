# Remediation Plan

## Phase 1 - Foundation (Decoupling & Utilities) ✅ COMPLETE

### Completed Tasks

1. ✅ **Concurrency Utilities Extraction**: Created `js/utils/concurrency/` with Mutex, LockManager
2. ✅ **EventBus Decentralization**: Services now register their own schemas dynamically
3. ✅ **Data Processing Extraction**: Created `js/utils/parser.js` and `js/utils/stream-buffer.js`

---

## Phase 2 - Core Refactoring

### Goal

Address architectural "hot spots": God objects, layer violations, and duplication in worker management.

### Tasks

#### 1. Refactor TabCoordination: Separate Protocol from Coordination

Split `js/services/tab-coordination.js` (96KB) into:

- `js/services/tab-protocol.js` - Low-level BroadcastChannel/MessagePort protocol, nonces, signatures
- `js/services/tab-coordination.js` - High-level leader election, state sync, write authority

#### 2. Invert Storage Dependency

Remove the upward dependency from `js/storage/indexeddb.js` → `TabCoordinator`:

- Create a `WriteAuthorityProvider` interface/callback pattern
- TabCoordinator registers itself as the provider during init
- IndexedDB queries the provider without knowing it's TabCoordinator

#### 3. Standardize Worker Management

Extract common patterns from `pattern-worker-pool.js` and `shared-worker-coordinator.js`:

- Create `js/workers/base-worker-manager.js` with heartbeat, lifecycle, error handling
- Refactor both coordinators to extend/use the base
- Unify message schema structure

#### 4. Fix SharedWorker Zombie Leader Race

Address the 10-second zombie leader window:

- Reduce stale connection cleanup interval
- Implement faster dead-leader detection via heartbeat timeout
- Handle unreliable `MessagePort.close` events with fallback detection

---

## Phase 3 - Cleanup & Stabilization (Future)

1. Replace manual action delegation in `app.js` with a registry pattern
2. Remove legacy "migration" code and dead constants
3. Comprehensive test coverage for refactored modules
