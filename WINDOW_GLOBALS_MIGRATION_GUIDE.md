# Window Globals Migration Guide

## Executive Summary

This guide provides a comprehensive roadmap for migrating away from `window.*` global variables in the Rhythm Chamber codebase. The current architecture has 124 deprecated window globals across 141 JavaScript files. The migration strategy prioritizes ES module imports, leverages the existing `ModuleRegistry` for lazy-loaded modules, and utilizes the `AppState` for state management while maintaining backward compatibility during the transition.

## Current State Analysis

### Scope of Window Globals Usage

**Total Impact:**
- 124 deprecated window global variables
- 60 files assigning to window globals
- 100+ files accessing window globals
- 141 total JavaScript files in the codebase (~85% affected)

### Categories of Window Globals

#### 1. Core Infrastructure (High Priority)
- `Storage` - Central storage API
- `Config` / `ConfigAPI` - Configuration management
- `AppState` - State management
- `Settings` - User settings
- `EventBus` - Event system
- `Security` - Security functions

#### 2. Operation Management (High Priority)
- `OperationLock` - Distributed locking
- `OperationQueue` - Queued operations
- `IndexedDBCore` - Database operations
- `ProfileStorage` - Profile management

#### 3. Analysis & Processing (Medium Priority)
- `Patterns` - Pattern detection
- `Personality` - Personality classification
- `Parser` - Data parsing
- `DataQuery` - Data queries
- `RAG` - Retrieval augmented generation (lazy-loaded)

#### 4. Chat & AI (Medium Priority)
- `Chat` - Chat functionality
- `SessionManager` - Session management
- `ConversationOrchestrator` - Conversation orchestration
- `MessageLifecycleCoordinator` - Message coordination
- `Functions` - Function calling system

#### 5. Providers (Low Priority)
- `OpenRouterProvider` - OpenRouter integration
- `LMStudioProvider` - LM Studio integration
- `GeminiProvider` - Google Gemini integration
- `Ollama` / `OllamaProvider` - Ollama integration (lazy-loaded)

#### 6. Utilities (Low Priority)
- `Utils` - Utility functions
- `TokenCounter` - Token counting
- `Payments` - Payment processing
- `DemoData` - Demo data

### Current Access Patterns

#### Pattern 1: Optional Chaining (Safe Access)
```javascript
// Most common pattern - safe fallback
if (window.Storage?.getConfig) {
    const cached = await window.Storage.getConfig('key');
}
```

#### Pattern 2: Direct Assignment
```javascript
// At end of module files
window.Storage = Storage;
```

#### Pattern 3: Type Checking
```javascript
// Check if module exists before using
if (typeof window.OperationLock !== 'undefined') {
    // Use OperationLock
}
```

#### Pattern 4: Fallback Values
```javascript
// Provide fallback if not available
const settings = window.Settings?.getSettings() || {};
```

### Existing Infrastructure

#### ES Module Import System (Already in Place)
The codebase already uses ES6 modules extensively:
```javascript
// In main.js and other entry points
import { Storage } from './storage.js';
import { AppState } from './state/app-state.js';
import { EventBus } from './services/event-bus.js';
```

#### ModuleRegistry (For Lazy-Loaded Modules)
Existing system for dynamic module loading:
```javascript
// In main.js
ModuleRegistry.register('RAG', () => import('./rag.js'), 'RAG');
ModuleRegistry.register('Ollama', () => import('./ollama.js'), 'Ollama');

// Usage in other files
const RAG = await ModuleRegistry.getModule('RAG');
const lvs = ModuleRegistry.getModuleSync('LocalVectorStore');
```

#### AppState (Centralized State Management)
Existing HNW-based state management:
```javascript
// Subscribe to state changes
AppState.subscribe((state, changedDomains) => {
    // React to state changes
});

// Update state
AppState.update('data', { streams: newStreams });

// Get state
const current = AppState.get();
```

#### EventBus (Event-Driven Communication)
Existing typed event system:
```javascript
// Subscribe to events
EventBus.on('storage:updated', (payload) => {
    // Handle storage update
});

// Emit events
EventBus.emit('pattern:detected', { 
    patternName: 'genre', 
    result: data 
});
```

### Dependency Graph Analysis

```
Core Infrastructure (Foundation)
├── Storage ──────> IndexedDBCore, ConfigAPI
├── Security ─────> SecureTokenStore, RecoveryHandlers
├── AppState ─────> (no dependencies)
└── EventBus ─────> VectorClock, TabCoordinator

Core Infrastructure <─── All other modules depend on these

Operation Management
├── OperationLock ──────────────────────> EventBus
├── OperationQueue ─────────────────────> OperationLock
└── ProfileStorage ─────────────────────> Storage

Analysis & Processing
├── Patterns ───────────────────────────> Storage
├── Personality ────────────────────────> Patterns
├── Parser ─────────────────────────────> (minimal deps)
├── DataQuery ──────────────────────────> Storage
└── RAG (lazy) ─────────────────────────> LocalEmbeddings, LocalVectorStore

Chat & AI
├── Chat ───────────────────────────────> Storage, EventBus
├── SessionManager ─────────────────────> Storage, EventBus
├── ConversationOrchestrator ───────────> Multiple services
└── Functions ──────────────────────────> Multiple providers

Providers
├── OpenRouterProvider ─────────────────> ConfigAPI
├── LMStudioProvider ───────────────────> ConfigAPI
├── GeminiProvider ─────────────────────> ConfigAPI
└── OllamaProvider (lazy) ──────────────> Ollama

UI & Controllers
├── All Controllers ────────────────────> AppState, EventBus
└── Settings ───────────────────────────> Storage, ConfigAPI
```

## Migration Strategy

### Phase 1: Preparation (Week 1)

#### 1.1 Audit and Documentation
- [ ] Complete audit of all window global usage (done)
- [ ] Map dependencies between modules (done)
- [ ] Create migration tracking spreadsheet
- [ ] Identify critical path modules that must be migrated first

#### 1.2 Enhance Existing Infrastructure
- [ ] Ensure all modules have proper ES6 exports
- [ ] Add missing exports to modules that only assign to window
- [ ] Enhance ModuleRegistry with better error messages
- [ ] Add deprecation warnings for window global access

```javascript
// Add to window-globals-debug.js
const DEPRECATION_WARNINGS = {
    enabled: true,
    level: 'warn', // 'warn', 'error', 'strict'
};

function createDeprecationProxy(globalName, actualModule) {
    return new Proxy(actualModule, {
        get(target, prop) {
            if (DEPRECATION_WARNINGS.enabled) {
                console.warn(
                    `[DEPRECATION] window.${globalName} is deprecated. ` +
                    `Import the module directly instead. ` +
                    `Stack: ${new Error().stack}`
                );
            }
            return target[prop];
        }
    });
}
```

#### 1.3 Testing Infrastructure
- [ ] Add unit tests for ES module imports
- [ ] Add integration tests for ModuleRegistry
- [ ] Set up test coverage baseline
- [ ] Create test for window globals usage detection

### Phase 2: Core Infrastructure Migration (Week 2-3)

#### 2.1 Storage Layer (Highest Priority)

**Files to migrate:**
- `/js/storage.js` (main storage API)
- `/js/storage/indexeddb.js` (database core)
- `/js/storage/config-api.js` (configuration)
- `/js/storage/profiles.js` (profile storage)

**Before:**
```javascript
// In consuming modules
if (window.Storage?.getConfig) {
    const value = await window.Storage.getConfig('key');
}
```

**After:**
```javascript
// At top of consuming module
import { Storage } from './storage.js';

// In code
const value = await Storage.getConfig('key');
```

**Migration Steps:**
1. Add ES6 import to all files using `window.Storage`
2. Replace `window.Storage` with `Storage`
3. Keep window assignment for backward compatibility
4. Test thoroughly
5. Remove window assignment once all consumers migrated

#### 2.2 Configuration Management

**Files to migrate:**
- `/js/services/config-loader.js`
- `/js/config.example.js`

**Before:**
```javascript
const apiKey = window.Config?.openrouter?.apiKey;
```

**After:**
```javascript
import { ConfigLoader } from './services/config-loader.js';
const apiKey = ConfigLoader.get('openrouter.apiKey');
```

#### 2.3 Security Module

**Files to migrate:**
- `/js/security/index.js`
- `/js/security/secure-token-store.js`
- `/js/security/token-binding.js`

**Before:**
```javascript
if (window.Security?.encryptData) {
    const encrypted = await window.Security.encryptData(data);
}
```

**After:**
```javascript
import { Security } from './security/index.js';
const encrypted = await Security.encryptData(data);
```

### Security Facade Key Exports

#### KeyManager Keys (Phase 12+)

For storage encryption and message signing, use KeyManager's non-extractable keys:

```javascript
// Data encryption key (for storage encryption)
const dataKey = await Security.getDataEncryptionKey();

// Signing key (for message signing)
const signingKey = await Security.getSigningKey();

// KeyManager session key (non-extractable)
const sessionKey = await Security.getSessionKeyKM();
```

#### Legacy getSessionKey (Pre-Phase 12)

The legacy `Security.getSessionKey` uses Encryption.getSessionKey (extractable key material):
```javascript
// Old implementation - still works for backward compatibility
const sessionKey = await Security.getSessionKey();
```

**Migration:** Use `getSessionKeyKM` for new code requiring non-extractable keys.

### Phase 3: Operation Management Migration (Week 4)

#### 3.1 Operation Lock System

**Files to migrate:**
- `/js/operation-lock.js`
- `/js/operation-lock-errors.js`
- `/js/operation-queue.js`

**Before:**
```javascript
if (window.OperationLock) {
    const lockId = await window.OperationLock.acquire('operation');
    // ... do work ...
    window.OperationLock.release('operation', lockId);
}
```

**After:**
```javascript
import { OperationLock } from './operation-lock.js';
const lockId = await OperationLock.acquire('operation');
// ... do work ...
OperationLock.release('operation', lockId);
```

#### 3.2 State Management

**Enhance AppState usage:**

**Before:**
```javascript
// Direct window access
window.AppState.update('data', { streams: newStreams });
```

**After:**
```javascript
// Already using ES imports
import { AppState } from './state/app-state.js';
AppState.update('data', { streams: newStreams });
```

### Phase 4: Analysis & Processing Migration (Week 5)

#### 4.1 Core Analysis Modules

**Files to migrate:**
- `/js/patterns.js`
- `/js/personality.js`
- `/js/parser.js`
- `/js/data-query.js`

**Before:**
```javascript
const patterns = window.Patterns?.detectAllPatterns(streams, chunks);
```

**After:**
```javascript
import { Patterns } from './patterns.js';
const patterns = Patterns.detectAllPatterns(streams, chunks);
```

#### 4.2 Lazy-Loaded Modules (RAG, Ollama)

**These already use ModuleRegistry - just need to clean up window fallbacks:**

**Before:**
```javascript
const RAG = ModuleRegistry.getModuleSync('RAG') || 
           (window.RAG ?? null);
```

**After:**
```javascript
const RAG = ModuleRegistry.getModuleSync('RAG');
if (!RAG) {
    throw new Error('RAG module not loaded. Call loadHeavyModulesOnIntent() first.');
}
```

### Phase 5: Chat & AI Migration (Week 6)

#### 5.1 Chat System

**Files to migrate:**
- `/js/chat.js`
- `/js/services/session-manager.js`
- `/js/services/conversation-orchestrator.js`
- `/js/services/message-lifecycle-coordinator.js`

**Before:**
```javascript
if (window.Chat?.sendMessage) {
    await window.Chat.sendMessage(message);
}
```

**After:**
```javascript
import { Chat } from './chat.js';
await Chat.sendMessage(message);
```

#### 5.2 Function Calling System

**Files to migrate:**
- `/js/functions/index.js`
- `/js/functions/executors/*.js`
- `/js/functions/schemas/*.js`

**Before:**
```javascript
const executors = window.AnalyticsExecutors || {};
```

**After:**
```javascript
import { AnalyticsExecutors } from './functions/executors/analytics-executors.js';
```

### Phase 6: Providers Migration (Week 7)

#### 6.1 Provider Modules

**Files to migrate:**
- `/js/providers/provider-interface.js`
- `/js/providers/openrouter.js`
- `/js/providers/lmstudio.js`
- `/js/providers/gemini.js`

**Before:**
```javascript
const provider = window.Settings?.get?.()?.llm?.provider || 'openrouter';
```

**After:**
```javascript
import { Settings } from './settings.js';
const provider = Settings.get().llm.provider || 'openrouter';
```

### Phase 7: UI & Controllers Migration (Week 8)

#### 7.1 Controller Modules

**Files to migrate:**
- `/js/controllers/chat-ui-controller.js`
- `/js/controllers/sidebar-controller.js`
- `/js/controllers/view-controller.js`
- All other controllers

**Before:**
```javascript
if (typeof window.SidebarController?.hideDeleteChatModal === 'function') {
    window.SidebarController.hideDeleteChatModal();
}
```

**After:**
```javascript
import { SidebarController } from './controllers/sidebar-controller.js';
SidebarController.hideDeleteChatModal();
```

### Phase 8: Utilities & Cleanup (Week 9)

#### 8.1 Utility Modules

**Files to migrate:**
- `/js/utils.js`
- `/js/token-counter.js`
- `/js/payments.js`
- All other utility modules

#### 8.2 Remove Window Assignments

**Once all consumers are migrated:**

```javascript
// Remove from bottom of modules
// window.Storage = Storage; // REMOVE THIS
```

#### 8.3 Remove Deprecation Layer

```javascript
// Remove from window-globals-debug.js
// Remove proxy setup
// Remove warning system
```

## Recommended Patterns for Replacement

### Pattern 1: Direct ES Module Import (Preferred)

**Use when:** Module is always needed, no circular dependencies

```javascript
// At top of file
import { Storage } from './storage.js';
import { Settings } from './settings.js';

// In code
const value = await Storage.getConfig('key');
const settings = Settings.get();
```

**Benefits:**
- Static analysis support
- Tree-shaking possible
- Clear dependencies
- Better IDE support

### Pattern 2: ModuleRegistry (Lazy Loading)

**Use when:** Module is heavy, not always needed, or loaded on user intent

```javascript
// Register module (in main.js or bootstrap)
ModuleRegistry.register('RAG', () => import('./rag.js'), 'RAG');

// Use module
const RAG = await ModuleRegistry.getModule('RAG');
await RAG.initialize();
```

**Benefits:**
- Faster initial load
- Load on-demand
- Already in place for heavy modules
- Prevents circular dependencies

### Pattern 3: EventBus (Decoupled Communication)

**Use when:** Module needs to notify others without direct dependency

```javascript
// Import EventBus
import { EventBus } from './services/event-bus.js';

// Emit event
EventBus.emit('pattern:detected', { 
    patternName: 'genre', 
    result: data 
});

// In other module
EventBus.on('pattern:detected', (payload) => {
    // Handle event
});
```

**Benefits:**
- Loose coupling
- Multiple subscribers
- Already typed and documented
- Supports priority dispatch

### Pattern 4: AppState (Centralized State)

**Use when:** Multiple modules need access to shared state

```javascript
// Import AppState
import { AppState } from './state/app-state.js';

// Subscribe to changes
const unsubscribe = AppState.subscribe((state, changedDomains) => {
    if (changedDomains.includes('data')) {
        // React to data changes
    }
});

// Update state
AppState.update('data', { streams: newStreams });

// Get state
const current = AppState.get('data');
```

**Benefits:**
- Single source of truth
- Immutable state
- Predictable updates
- Already HNW-compliant

### Pattern 5: Dependency Injection (For Controllers)

**Use when:** Module needs to be testable or has multiple implementations

```javascript
// Define dependencies
export class ChatUIController {
    constructor(dependencies) {
        this.chat = dependencies.chat;
        this.settings = dependencies.settings;
        this.storage = dependencies.storage;
    }
    
    async sendMessage(message) {
        const settings = this.settings.get();
        return await this.chat.sendMessage(message, settings);
    }
}

// Initialize with dependencies
import { Chat } from './chat.js';
import { Settings } from './settings.js';
import { Storage } from './storage.js';

const controller = new ChatUIController({
    chat: Chat,
    settings: Settings,
    storage: Storage
});
```

**Benefits:**
- Testable (can inject mocks)
- Explicit dependencies
- Flexible implementation
- Better for complex modules

## Risk Mitigation

### Testing Strategy

#### 1. Unit Tests
- Test each module in isolation
- Mock dependencies
- Verify ES module exports work correctly

```javascript
// Example test
import { Storage } from './storage.js';

describe('Storage', () => {
    it('should export getConfig method', () => {
        expect(typeof Storage.getConfig).toBe('function');
    });
    
    it('should retrieve config values', async () => {
        const value = await Storage.getConfig('test-key');
        expect(value).toBeDefined();
    });
});
```

#### 2. Integration Tests
- Test module interactions
- Verify ModuleRegistry works correctly
- Test EventBus communication

#### 3. Regression Tests
- Capture current behavior
- Compare before/after migration
- Test critical user flows

#### 4. Manual Testing Checklist
- [ ] Application loads successfully
- [ ] File upload works
- [ ] Pattern detection works
- [ ] Chat functionality works
- [ ] Settings save/load correctly
- [ ] Profile management works
- [ ] Demo mode works
- [ ] All features in production work

### Rollback Strategy

#### Phase-by-Phase Rollback
- Each phase is independently reversible
- Keep window assignments until phase is complete
- Feature flags can enable/disable migrated code

```javascript
// Example feature flag
const USE_ES_IMPORTS = true; // Set to false to rollback

const Storage = USE_ES_IMPORTS 
    ? require('./storage.js').Storage 
    : window.Storage;
```

#### Monitoring
- Track error rates during migration
- Monitor performance metrics
- Watch for console warnings
- Check test coverage

### Common Pitfalls

#### 1. Circular Dependencies
**Problem:** Module A imports B, B imports A

**Solution:** 
- Use EventBus for communication
- Extract common functionality to module C
- Use dependency injection

#### 2. Missing Exports
**Problem:** Module doesn't export what window global provides

**Solution:**
```javascript
// Add proper export
export const Storage = { /* ... */ };

// For backward compatibility
if (typeof window !== 'undefined') {
    window.Storage = Storage;
}
```

#### 3. Async Initialization
**Problem:** Module used before it's initialized

**Solution:**
```javascript
// Export init function
export async function init() {
    // Initialize module
    return { isReady: true };
}

// Use in main.js
await ModuleName.init();
```

#### 4. Timing Issues
**Problem:** Module loaded too early/late

**Solution:**
- Use ModuleRegistry for lazy loading
- Document load order requirements
- Add ready checks

```javascript
export function isReady() {
    return !!internalState;
}
```

## Migration Checklist

### Pre-Migration
- [ ] All tests passing
- [ ] Test coverage baseline established
- [ ] Dependencies mapped
- [ ] Migration plan reviewed
- [ ] Rollback plan documented

### Phase 1: Preparation
- [ ] Deprecation warnings implemented
- [ ] All modules have ES6 exports
- [ ] ModuleRegistry enhanced
- [ ] Test infrastructure ready

### Phase 2: Core Infrastructure
- [ ] Storage migrated
- [ ] Config migrated
- [ ] Security migrated
- [ ] All tests passing

### Phase 3: Operation Management
- [ ] OperationLock migrated
- [ ] OperationQueue migrated
- [ ] ProfileStorage migrated
- [ ] All tests passing

### Phase 4: Analysis & Processing
- [ ] Patterns migrated
- [ ] Personality migrated
- [ ] Parser migrated
- [ ] DataQuery migrated
- [ ] All tests passing

### Phase 5: Chat & AI
- [ ] Chat migrated
- [ ] SessionManager migrated
- [ ] Functions migrated
- [ ] All tests passing

### Phase 6: Providers
- [ ] All providers migrated
- [ ] ModuleRegistry cleanup
- [ ] All tests passing

### Phase 7: UI & Controllers
- [ ] All controllers migrated
- [ ] All tests passing

### Phase 8: Cleanup
- [ ] Window assignments removed
- [ ] Deprecation layer removed
- [ ] Documentation updated
- [ ] Final test suite passing

### Post-Migration
- [ ] Performance benchmarks run
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Team training completed

## Code Examples

### Before/After Comparisons

#### Example 1: Storage Access

**Before:**
```javascript
// In genre-enrichment.js
export const GenreEnrichment = {
    async saveCache(genreCache) {
        if (window.Storage?.setConfig) {
            await window.Storage.setConfig('rhythm_chamber_genre_cache', genreCache);
        }
    }
};

window.GenreEnrichment = GenreEnrichment;
```

**After:**
```javascript
// In genre-enrichment.js
import { Storage } from './storage.js';

export const GenreEnrichment = {
    async saveCache(genreCache) {
        await Storage.setConfig('rhythm_chamber_genre_cache', genreCache);
    }
};

// No window assignment
```

#### Example 2: Security Operations

**Before:**
```javascript
// In rag.js
export const RAG = {
    async saveCheckpoint(checkpoint) {
        if (window.Security?.encryptData && window.Security?.getSessionKey) {
            const sessionKey = await window.Security.getSessionKey();
            const encrypted = await window.Security.encryptData(checkpoint, sessionKey);
            
            if (window.Storage?.setConfig) {
                await window.Storage.setConfig(CHECKPOINT_KEY, encrypted);
            }
        }
    }
};
```

**After:**
```javascript
// In rag.js
import { Security } from './security/index.js';
import { Storage } from './storage.js';

export const RAG = {
    async saveCheckpoint(checkpoint) {
        const sessionKey = await Security.getSessionKey();
        const encrypted = await Security.encryptData(checkpoint, sessionKey);
        await Storage.setConfig(CHECKPOINT_KEY, encrypted);
    }
};
```

#### Example 3: Optional Module with ModuleRegistry

**Before:**
```javascript
// In settings.js
export const Settings = {
    renderEmbeddingsSection() {
        const RAG = window.RAG;
        if (RAG?.isConfigured()) {
            return /* ... */;
        }
        return /* ... */;
    }
};
```

**After:**
```javascript
// In settings.js
import { ModuleRegistry } from './module-registry.js';

export const Settings = {
    renderEmbeddingsSection() {
        const RAG = ModuleRegistry.getModuleSync('RAG');
        if (RAG?.isConfigured()) {
            return /* ... */;
        }
        return /* ... */;
    }
};
```

#### Example 4: Event-Driven Communication

**Before:**
```javascript
// In pattern-worker-pool.js
export class PatternWorkerPool {
    handleFailure(error) {
        if (typeof window !== 'undefined' && window.EventBus?.emit) {
            window.EventBus.emit('pattern:worker_failure', {
                error: error.message
            });
        }
    }
}
```

**After:**
```javascript
// In pattern-worker-pool.js
import { EventBus } from '../services/event-bus.js';

export class PatternWorkerPool {
    handleFailure(error) {
        EventBus.emit('pattern:worker_failure', {
            error: error.message
        });
    }
}
```

#### Example 5: Settings Access

**Before:**
```javascript
// In providers/provider-interface.js
export const ProviderInterface = {
    getOpenRouterConfig() {
        const apiKey = window.Settings?.get?.()?.openrouter?.apiKey || 
                      window.Config?.apiKey;
        return { apiKey };
    }
};
```

**After:**
```javascript
// In providers/provider-interface.js
import { Settings } from '../settings.js';
import { ConfigLoader } from '../services/config-loader.js';

export const ProviderInterface = {
    getOpenRouterConfig() {
        const settings = Settings.get();
        const apiKey = settings.openrouter?.apiKey || 
                      ConfigLoader.get('openrouter.apiKey');
        return { apiKey };
    }
};
```

## Timeline & Milestones

### Week 1-2: Preparation & Core Infrastructure
- Migrate Storage, Config, Security
- **Milestone:** Core infrastructure uses ES imports

### Week 3-4: Operation Management
- Migrate OperationLock, OperationQueue, AppState
- **Milestone:** All state management uses ES imports

### Week 5-6: Analysis & Processing
- Migrate Patterns, Personality, Parser, DataQuery
- **Milestone:** Core analysis modules migrated

### Week 7-8: Chat & AI
- Migrate Chat, SessionManager, Functions
- **Milestone:** Chat system fully migrated

### Week 9-10: Providers & Controllers
- Migrate all providers and controllers
- **Milestone:** All UI and providers migrated

### Week 11-12: Cleanup & Documentation
- Remove window assignments
- Update documentation
- Final testing
- **Milestone:** Zero window globals

## Success Metrics

### Technical Metrics
- [ ] 0 window global assignments
- [ ] 0 window global accesses
- [ ] 100% ES module imports
- [ ] Test coverage > 80%
- [ ] Build size reduced by > 10%

### Quality Metrics
- [ ] No circular dependencies
- [ ] All modules properly exported
- [ ] Documentation complete
- [ ] Code review approved

### Performance Metrics
- [ ] Initial load time < 2s
- [ ] Time to interactive < 3s
- [ ] No regressions in core flows

## Conclusion

This migration guide provides a comprehensive, phased approach to eliminating window globals from the Rhythm Chamber codebase. By leveraging existing infrastructure (ES modules, ModuleRegistry, AppState, EventBus) and following the recommended patterns, the migration can be completed safely with minimal risk.

The key to success is:
1. **Take it phase by phase** - Don't try to migrate everything at once
2. **Test thoroughly** - Each phase should be fully tested before moving on
3. **Maintain backward compatibility** - Keep window assignments until all consumers are migrated
4. **Use the right pattern** - Choose the appropriate replacement pattern for each use case
5. **Document everything** - Keep track of what's been migrated and what's remaining

By following this guide, the codebase will be more maintainable, testable, and aligned with modern JavaScript best practices while maintaining the HNW architecture principles that make Rhythm Chamber robust.
