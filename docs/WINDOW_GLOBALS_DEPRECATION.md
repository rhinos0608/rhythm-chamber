# Window Global Deprecation Audit

## Overview

This issue tracks the deprecation and eventual removal of legacy `window.X` global assignments in favor of proper ES module imports and `ModuleRegistry` access.

## Current Status

- **Phase**: v1.0 (Warnings introduced)
- **Target Removal**: v1.3
- **Deprecation Tracking**: Implemented in `js/window-globals-debug.js`

## Deprecated Globals

The following 124 globals are deprecated:

<details>
<summary>View full list</summary>

- AnalyticsExecutors
- AnalyticsQuerySchemas
- AppState
- Cards
- Chat
- ConversationOrchestrator
- ChatUIController
- CircuitBreaker
- Config
- ConfigAPI
- DataExecutors
- DataQuery
- DataQuerySchemas
- DataVersion
- DeadlockError
- DemoController
- DemoData
- DeviceBackup
- FallbackResponseService
- FileUploadController
- FunctionCallingFallback
- FunctionRetry
- FunctionValidation
- Functions
- GenreEnrichment
- IndexedDBCore
- LLMProviderRoutingService
- LMStudioProvider
- LocalOnlySync
- LockAcquisitionError
- LockForceReleaseError
- LockReleaseError
- LockTimeoutError
- MessageOperations
- MessageLifecycleCoordinator
- OpenRouterProvider
- OperationLock
- OperationQueue
- Parser
- Patterns
- Payments
- Personality
- ProfileDescriptionGenerator
- ProfileStorage
- ProfileSynthesizer
- ProfileSynthesizerClass
- Prompts
- ProviderCircuitBreaker
- ProviderInterface
- QUEUE_PRIORITY
- QUEUE_STATUS
- QueuedOperation
- QuotaMonitor
- RecoveryHandlers
- ResetController
- STORAGE_KEYS
- SecureTokenStore
- Security
- SecurityChecklist
- SessionManager
- Settings
- SidebarController
- Spotify
- SpotifyController
- Storage
- StorageCircuitBreaker
- SyncManager
- SyncStrategy
- TabCoordinator
- TemplateExecutors
- TemplateFunctionNames
- TemplateProfileStore
- TemplateProfileStoreClass
- TemplateQuerySchemas
- TimeoutError
- TimeoutWrapper
- TokenCounter
- TokenCountingService
- ToolCallHandlingService
- Transformers
- Utils
- VectorClock
- VectorClockModule
- VersionedData
- ViewController
- WaveTelemetry
- CoreWebVitalsTracker
- EventBus
- MetricsExporter
- ObservabilityController
- ObservabilityInit
- ObservabilitySettings
- PerformanceProfiler
- ProviderFallbackChain
- _sessionData
- _userContext
- clearSensitiveData
- confirmDeleteChat
- copyErrorReport
- executeReset
- hideDeleteChatModal
- hideResetConfirmModal
- isInSafeMode
- processMessageResponse
- showPrivacyDashboard
- transformers

</details>

## Migration Path

### For each deprecated global:

1. **Replace direct access**: `window.Storage` → `import { Storage } from './storage.js'`
2. **Or use ModuleRegistry**: `await ModuleRegistry.getModule('Storage')`
3. **Remove window assignment** from source module after all usages migrated

## How to Audit Usage

```javascript
// In dev console, after using the app:
window.printDeprecationSummary?.()

// Or get raw stats:
window.getDeprecationStats?.()
```

## Deprecation Timeline

| Version | Change |
|---------|--------|
| v1.0 | Console warnings on first access (current) |
| v1.1 | Upgrade to console.error level |
| v1.2 | Throw in strict mode (opt-in) |
| v1.3 | Remove window assignments |

## Priority Modules to Migrate

1. **High Impact** (frequently accessed):
   - Storage
   - Config / ConfigAPI
   - EventBus
   - Settings

2. **Medium Impact**:
   - Chat / SessionManager
   - OperationLock
   - Functions / FunctionValidation

3. **Lower Impact** (rarely accessed directly):
   - Parser / Patterns
   - Demo/Test utilities

## Labels

- `deprecation`
- `refactoring`
- `tech-debt`
