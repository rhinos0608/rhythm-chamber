# Rhythm Chamber API Reference

This document provides API documentation for core modules in Rhythm Chamber. It is intended for developers who want to extend, integrate with, or understand the internal architecture of the application.

## Table of Contents

- [AppState](#appstate---centralized-state-management)
- [EventBus](#eventbus---event-driven-communication)
- [Storage](#storage---data-persistence-layer)
- [Security](#security---cryptography--threat-protection)
  - [Security Module](#security-module)
  - [Recent Security Fixes (v0.9)](#recent-security-fixes-v09)
  - [Recovery Handlers](#recovery-handlers---error-recovery)
- [IoC Container](#ioc-container---dependency-management)
- [Providers](#providers---ai-provider-interface)

---

## AppState - Centralized State Management

**Module:** `js/state/app-state.js`

The AppState module provides a centralized, immutable state management system following the HNW (Hierarchical Network Wave) architecture pattern.

### State Structure

```javascript
const INITIAL_STATE = {
    view: {
        current: 'upload',      // Current screen
        previous: null
    },
    data: {
        streams: null,          // Raw listening history
        chunks: null,           // Aggregated chunks
        patterns: null,         // Detected patterns
        personality: null,      // Personality classification
        dataHash: null
    },
    lite: {
        isLiteMode: false,
        liteData: null,
        litePatterns: null
    },
    ui: {
        sidebarCollapsed: false,
        currentSessionId: null
    },
    operations: {
        isProcessing: false,
        processingProgress: 0,
        processingMessage: '',
        error: null
    },
    demo: {
        isDemoMode: false,
        streams: null,
        patterns: null,
        personality: null
    }
};
```

### Public API

#### `AppState.init(initialOverrides)`

Initialize state with optional overrides.

```javascript
AppState.init({ view: { current: 'chat' } });
// Returns: Frozen initial state object
```

**Parameters:**
- `initialOverrides` (Object, optional): State properties to override

**Returns:** Frozen state object

---

#### `AppState.get(domain)`

Get current state (frozen snapshot).

```javascript
const fullState = AppState.get();
const viewState = AppState.get('view');
```

**Parameters:**
- `domain` (String, optional): Domain name ('view', 'data', 'lite', 'ui', 'operations', 'demo')

**Returns:** Frozen state object or domain

---

#### `AppState.update(domain, changes)`

Update a state domain with shallow merge.

```javascript
AppState.update('view', { current: 'chat' });
// Notifies all subscribers after update
```

**Parameters:**
- `domain` (String): Domain to update
- `changes` (Object): Properties to merge into domain

**Returns:** New frozen state

---

#### `AppState.subscribe(callback)`

Subscribe to state changes.

```javascript
const unsubscribe = AppState.subscribe((state, changedDomains) => {
    console.log('Domains changed:', changedDomains);
    console.log('New state:', state);
});

// Unsubscribe later
unsubscribe();
```

**Parameters:**
- `callback` (Function): Callback receiving `(state, changedDomains[])`

**Returns:** Unsubscribe function

---

### Domain Helper Methods

#### `AppState.setView(viewName)`
Set current view.

#### `AppState.setPersonality(personality)`
Set personality data.

#### `AppState.setStreams(streams)`
Set streams data with hash calculation.

#### `AppState.setChunks(chunks)`
Set chunks data.

#### `AppState.setPatterns(patterns)`
Set patterns data.

#### `AppState.setProcessing(isProcessing, message, progress)`
Set processing state.

#### `AppState.setError(error)`
Set error state.

#### `AppState.setLiteMode(liteData, litePatterns)`
Set lite mode data.

#### `AppState.setSidebarCollapsed(collapsed)`
Set sidebar collapsed state.

#### `AppState.getActiveData()`
Get active data (demo or real) transparently.

#### `AppState.reset()`
Reset state to initial values (preserves UI preferences).

---

## EventBus - Event-Driven Communication

**Module:** `js/services/event-bus.js`

EventBus provides a centralized publish-subscribe system with typed events, priority dispatch, circuit breaker protection, and health monitoring.

### Event Schemas

EventBus uses typed events with defined payload schemas:

```javascript
const EVENT_SCHEMAS = {
    'storage:updated': {
        description: 'Data saved to storage',
        payload: { store: 'string', key: 'string?', count: 'number?' }
    },
    'session:created': {
        description: 'New chat session created',
        payload: { sessionId: 'string', title: 'string?' }
    },
    'error:critical': {
        description: 'Critical error requiring user attention',
        payload: { message: 'string', code: 'string?', recoveryAction: 'string?' }
    }
    // ... see module for complete list
};
```

### Priority Levels

```javascript
EventBus.PRIORITY.CRITICAL  // 0 - Errors, security events
EventBus.PRIORITY.HIGH      // 1 - State changes, auth events
EventBus.PRIORITY.NORMAL    // 2 - Standard events
EventBus.PRIORITY.LOW       // 3 - Analytics, logging
```

### Public API

#### `EventBus.on(eventType, handler, options)`

Subscribe to an event type.

```javascript
const unsubscribe = EventBus.on('storage:updated', (payload, meta) => {
    console.log('Storage updated:', payload.store);
    console.log('Event metadata:', meta.timestamp, meta.sequenceNumber);
}, { priority: EventBus.PRIORITY.NORMAL, domain: 'global' });
```

**Parameters:**
- `eventType` (String): Event type (use `'*'` for all events)
- `handler` (Function): Callback receiving `(payload, eventMeta)`
- `options` (Object, optional):
  - `priority` (Number): Handler priority (lower = earlier)
  - `domain` (String): Domain filter ('global' receives all)

**Returns:** Unsubscribe function

---

#### `EventBus.once(eventType, handler, options)`

Subscribe to an event once (auto-unsubscribes).

```javascript
EventBus.once('session:created', (payload) => {
    console.log('First session created:', payload.sessionId);
});
```

---

#### `EventBus.off(eventType, handlerId)`

Unsubscribe a handler by ID.

```javascript
const id = EventBus.on('test', handler);
EventBus.off('test', id);
```

---

#### `EventBus.emit(eventType, payload, options)`

Emit an event to all subscribers.

```javascript
EventBus.emit('storage:updated', { store: 'streams', count: 100 }, {
    skipValidation: false,
    bypassCircuitBreaker: false,
    domain: 'global'
});
```

**Parameters:**
- `eventType` (String): Event type
- `payload` (Object, optional): Event payload
- `options` (Object, optional):
  - `skipValidation` (Boolean): Skip payload validation
  - `bypassCircuitBreaker` (Boolean): Skip circuit breaker checks
  - `domain` (String): Event domain for filtering

**Returns:** Boolean - true if any handlers were called

---

#### `EventBus.emitAsync(eventType, payload)`

Emit an event asynchronously (next tick).

```javascript
await EventBus.emitAsync('data:streams_loaded', { count: 50000 });
```

---

#### `EventBus.emitAndAwait(eventType, payload, options)`

Emit an event and await all async handlers sequentially.

```javascript
const result = await EventBus.emitAndAwait('session:loaded', { sessionId: 'abc' }, {
    stopOnError: false
});
// result: { handled: true, results: [...] }
```

---

#### `EventBus.emitParallel(eventType, payload, options)`

Emit an event and run all async handlers in parallel.

```javascript
const result = await EventBus.emitParallel('pattern:detected', patternData, {
    timeoutMs: 30000
});
```

---

### Debug & Diagnostics

#### `EventBus.setDebugMode(enabled)`
Enable/disable debug logging.

#### `EventBus.getTrace(limit)`
Get event trace for debugging (default 50 events).

#### `EventBus.getRegisteredEvents()`
Get all registered event types.

#### `EventBus.getSubscriberCount(eventType)`
Get subscriber count for an event type.

#### `EventBus.getSchemas()`
Get all available event schemas.

---

### Health Monitoring

#### `EventBus.getHealthStatus()`
Get comprehensive health status.

```javascript
const health = EventBus.getHealthStatus();
// Returns: {
//   status: 'healthy' | 'degraded' | 'critical',
//   failureRate: 0.05,
//   avgLatencyMs: 12,
//   handlerCount: 15,
//   stuckCount: 0,
//   pausedCount: 0,
//   totalEventsProcessed: 1250,
//   circuitBreaker: { ... }
// }
```

#### `EventBus.startHealthMonitoring()`
Start health monitoring heartbeat.

#### `EventBus.stopHealthMonitoring()`
Stop health monitoring.

#### `EventBus.resetHandler(handlerId)`
Reset a stuck or paused handler.

---

### Circuit Breaker

#### `EventBus.getCircuitBreakerStatus()`
Get circuit breaker status.

```javascript
// Returns: {
//   pendingEventCount: 12,
//   maxQueueSize: 1000,
//   queueUtilization: '1.2%',
//   stormActive: false,
//   eventsThisWindow: 25,
//   droppedCount: 0,
//   overflowStrategy: 'drop_low_priority'
// }
```

#### `EventBus.configureCircuitBreaker(config)`
Configure circuit breaker settings.

---

## Storage - Data Persistence Layer

**Module:** `js/storage.js`

Storage facade providing unified access to IndexedDB, localStorage, and encrypted configuration storage. Implements ACID guarantees via Write-Ahead Log.

### Storage Constants

```javascript
Storage.STORES = {
    STREAMS: 'streams',         // Raw listening history
    CHUNKS: 'chunks',           // Aggregated time chunks
    EMBEDDINGS: 'embeddings',   // Semantic embeddings
    PERSONALITY: 'personality', // Personality result
    SETTINGS: 'settings',       // Application settings
    CHAT_SESSIONS: 'chat_sessions', // Chat history
    CONFIG: 'config',           // Encrypted config
    TOKENS: 'tokens',           // Encrypted tokens
    MIGRATION: 'migration'      // Migration state
};
```

### Initialization

#### `Storage.init()`

Initialize storage and run migrations.

```javascript
await Storage.init();
// Opens IndexedDB, runs migration, initializes WAL
```

---

### Streams API

#### `Storage.saveStreams(streams)`
Save streaming data.

#### `Storage.getStreams()`
Get all streaming data.

#### `Storage.appendStreams(newStreams)`
Atomically append new streams to existing data.

#### `Storage.clearStreams()`
Clear all streaming data.

---

### Chunks API

#### `Storage.saveChunks(chunks)`
Save aggregated chunks.

#### `Storage.getChunks()`
Get all chunks.

---

### Personality API

#### `Storage.savePersonality(personality)`
Save personality classification.

#### `Storage.getPersonality()`
Get personality result.

---

### Settings API

#### `Storage.saveSetting(key, value)`
Save a setting.

#### `Storage.getSetting(key)`
Get a setting value.

---

### Chat Sessions API

#### `Storage.saveSession(session)`
Save or update a chat session.

#### `Storage.getSession(id)`
Get a specific session.

#### `Storage.getAllSessions()`
Get all sessions (sorted by update time).

#### `Storage.deleteSession(id)`
Delete a session.

#### `Storage.getSessionCount()`
Get total session count.

#### `Storage.clearAllSessions()`
Delete all sessions.

#### `Storage.clearExpiredSessions(maxAgeMs)`
Delete sessions older than specified age.

```javascript
const result = await Storage.clearExpiredSessions(30 * 24 * 60 * 60 * 1000);
// Deletes sessions not updated in 30 days
// Returns: { deleted: 5 }
```

**Parameters:**
- `maxAgeMs` (Number, optional): Maximum age in milliseconds (default: 30 days)

**Returns:** Object with `deleted` count

---

### Profiles API

#### `Storage.saveProfile(profile)`
Save a user profile.

#### `Storage.getAllProfiles()`
Get all profiles.

#### `Storage.getProfile(id)`
Get a specific profile.

#### `Storage.deleteProfile(id)`
Delete a profile.

#### `Storage.setActiveProfile(id)`
Set the active profile.

#### `Storage.getActiveProfileId()`
Get the active profile ID.

#### `Storage.getProfileCount()`
Get profile count.

#### `Storage.clearAllProfiles()`
Delete all profiles.

---

### Config & Tokens API

These methods delegate to ConfigAPI with automatic encryption for sensitive data.

#### `Storage.getConfig(key, defaultValue)`
Get configuration value.

#### `Storage.setConfig(key, value)`
Set configuration value (auto-encrypted if sensitive).

#### `Storage.removeConfig(key)`
Remove configuration value.

#### `Storage.getToken(key)`
Get encrypted token.

#### `Storage.setToken(key, value)`
Set encrypted token.

#### `Storage.removeToken(key)`
Remove encrypted token.

---

### Archival (Quota Management)

#### `Storage.archiveOldStreams(options)`
Archive streams older than cutoff date.

```javascript
const result = await Storage.archiveOldStreams({
    cutoffDate: new Date('2023-01-01'),
    dryRun: false
});
// Returns: { archived: 12500, kept: 50000, savedBytes: 5242880 }
```

#### `Storage.restoreFromArchive(options)`
Restore archived streams.

#### `Storage.getArchiveStats()`
Get archive statistics.

#### `Storage.clearArchive()`
Permanently clear archive.

---

### Utility Methods

#### `Storage.isReady()`
Check if Storage module is loaded.

#### `Storage.isInitialized()`
Check if IndexedDB is initialized.

#### `Storage.hasData()`
Check if any streaming data exists.

#### `Storage.getDataHash()`
Get hash of streaming data for staleness detection.

#### `Storage.clearAllData()`
Clear all application data (requires confirmation).

---

### Privacy Controls

#### `Storage.setSessionOnlyMode(enabled)`
Enable session-only mode (data cleared on tab close).

#### `Storage.isSessionOnlyMode()`
Check if session-only mode is active.

#### `Storage.clearSensitiveData()`
Clear sensitive data (raw streams, conversation, RAG credentials).

#### `Storage.getDataSummary()`
Get data summary (counts, sizes, settings).

---

### Consistency

#### `Storage.validateConsistency()`
Validate data consistency across stores.

```javascript
const validation = await Storage.validateConsistency();
// Returns: {
//   valid: true,
//   warnings: [],
//   fixes: [],
//   hasData: true,
//   hasPersonality: true
// }
```

---

### Transactions

#### `Storage.beginTransaction(callback)`

Begin an atomic transaction across storage backends.

```javascript
const result = await Storage.beginTransaction(async (tx) => {
    await tx.put(STORES.STREAMS, data);
    await tx.put(STORES.CHUNKS, chunks);
});
// Returns: { success: boolean, operationsCommitted: number }
```

---

### Migration

#### `Storage.migrateFromLocalStorage()`

Run localStorage to IndexedDB migration.

#### `Storage.rollbackMigration()`

Rollback migration to localStorage.

#### `Storage.getMigrationState()`

Get migration state and status.

---

### Sync Strategy (Phase 2)

#### `Storage.getSyncManager()`

Get the sync manager instance.

#### `Storage.getSyncStrategy()`

Get current sync strategy (LocalOnlySync or future strategies).

```javascript
const strategy = Storage.getSyncStrategy();
// Returns: SyncStrategy or null
```

#### `Storage.getSyncStatus()`

Get current sync status.

```javascript
const status = await Storage.getSyncStatus();
// Returns: { mode, lastSync, pending, message }
```

---

## Security - Cryptography & Threat Protection

**Module:** `js/security/index.js`

Security facade providing encryption, token binding, anomaly detection, and key management.

---

### Security Module

#### AES-GCM-256 Encryption

The `Crypto` module implements AES-GCM-256 encryption for sensitive data:

```javascript
import { encryptData, decryptData } from './security/crypto.js';

// Encrypt API keys
const encrypted = await encryptData(apiKey, keyMaterial);

// Decrypt with key derivation
const decrypted = await decryptData(encrypted, keyMaterial);
```

#### Key Derivation (PBKDF2)

Keys are derived using:
- 600,000 iterations (PBKDF2)
- Session salt + Spotify refresh token + session version
- SHA-256 HMAC

#### Token Binding

All token access requires device binding verification:

```javascript
import { SecureTokenStore } from './security/secure-token-store.js';

const tokenStore = new SecureTokenStore();
const token = await tokenStore.getToken(); // Automatic binding verification
```

---

### Recent Security Fixes (v0.9)

#### TOCTOU Race Condition
Added reservation mechanism to `QuotaManager.checkWriteFits()`:
- Space reserved before write operation
- 30-second auto-release for stale reservations
- Prevents concurrent write quota violations

#### CORS Validation
- Handle null origin from file:// URLs
- Fail closed when license verification unavailable
- State parameter validation for OAuth callbacks

#### Device Secret Race Condition
Protected device secret generation from race conditions during initialization.

---

### Initialization

#### `Security.init(options)`

Initialize all security modules via SecurityCoordinator.

```javascript
await Security.init({
    password: 'user-password-or-random',
    enablePrototypePollution: false
});
```

**Returns:** Initialization report with module status

---

#### `Security.isReady()`
Check if security is fully initialized.

#### `Security.isAvailable()`
Check if security is available (ready or degraded mode).

#### `Security.canEncrypt()`
Check if encryption operations are available.

#### `Security.waitForReady(timeoutMs)`
Wait for security to be ready.

---

#### `Security.getInitializationReport()`

Get detailed initialization report.

```javascript
const report = Security.getInitializationReport();
// Returns: { ready, available, canEncrypt, modules: {...} }
```

---

#### `Security.onReady(callback)`

Register callback for when security is ready.

```javascript
const unsubscribe = Security.onReady((report) => {
    console.log('Security ready:', report);
});
```

**Returns:** Unsubscribe function

---

#### `Security.Coordinator`

Direct access to SecurityCoordinator for advanced usage.

---

### Key Management (KeyManager)

Three types of non-extractable keys:

```javascript
// Session key - General crypto operations
const sessionKey = await Security.getSessionKeyKM();

// Data encryption key - Storage encryption (API keys, chat history)
const encKey = await Security.getDataEncryptionKey();

// Signing key - HMAC message signing (cross-tab)
const signingKey = await Security.getSigningKey();
```

#### `Security.initializeKeySession(password)`
Initialize key session with password.

#### `Security.clearKeySession()`
Clear all keys from memory.

#### `Security.isKeySessionActive()`
Check if key session is active.

---

### Storage Encryption

AES-GCM-256 encryption for sensitive data at rest.

#### `Security.StorageEncryption.encrypt(data, key)`
Encrypt data with AES-GCM-256.

```javascript
const encKey = await Security.getDataEncryptionKey();
const encrypted = await Security.StorageEncryption.encrypt('sensitive', encKey);
// Returns: { cipher: base64-string, iv: base64-string }
```

#### `Security.StorageEncryption.decrypt(encryptedData, key)`
Decrypt AES-GCM-256 data.

#### `Security.StorageEncryption.shouldEncrypt(key, value)`
Check if data should be encrypted (auto-classification).

#### `Security.StorageEncryption.migrateData(oldKey, newKey, encrypted)`
Migrate encrypted data to new key.

---

### Message Security

HMAC-SHA256 message signing for cross-tab communication.

#### `Security.MessageSecurity.signMessage(message, signingKey)`
Sign message with HMAC-SHA256.

```javascript
const signingKey = await Security.getSigningKey();
const message = { type: 'update', timestamp: Date.now() };
const signature = await Security.MessageSecurity.signMessage(message, signingKey);
```

#### `Security.MessageSecurity.verifyMessage(message, signature, signingKey)`
Verify HMAC-SHA256 signature.

#### `Security.MessageSecurity.validateTimestamp(message, maxAgeSeconds)`
Validate message freshness (default 5s).

#### `Security.MessageSecurity.sanitizeMessage(message)`
Remove sensitive fields from message.

#### `Security.MessageSecurity.isNonceUsed(nonce)`
Check if nonce was used before (replay prevention).

---

### Data Encryption Methods

#### `Security.encryptData(data, keyMaterial)`
Encrypt data using AES-GCM-256 with key derivation.

#### `Security.decryptData(encryptedData, keyMaterial)`
Decrypt data with derived key.

#### `Security.storeEncryptedCredentials(key, credentials)`
Store encrypted credentials with automatic key derivation.

#### `Security.getEncryptedCredentials(key)`
Retrieve encrypted credentials.

#### `Security.clearEncryptedCredentials(key)`
Clear encrypted credentials.

---

### Session Management

#### `Security.invalidateSessions()`
Invalidate all sessions (increments version).

#### `Security.getSessionVersion()`
Get current session version.

---

### Token Binding (XSS Protection)

Device fingerprint binding for access tokens.

#### `Security.checkSecureContext()`
Check if running in secure context (HTTPS/localhost).

```javascript
const check = Security.checkSecureContext();
// Returns: { secure: boolean, reason: string? }
```

#### `Security.generateDeviceFingerprint()`
Generate device fingerprint from browser attributes.

#### `Security.createTokenBinding(accessToken)`
Create token binding for access token.

#### `Security.verifyTokenBinding(token)`
Verify token binding matches current device.

#### `Security.clearTokenBinding()`
Clear token binding.

---

### Anomaly Detection

Rate limiting and geographic lockout detection.

#### `Security.isRateLimited(operation, maxAttempts)`
Check if operation is rate limited.

#### `Security.recordFailedAttempt(operation)`
Record a failed attempt.

#### `Security.checkSuspiciousActivity(operation)`
Check for suspicious activity patterns.

```javascript
const suspicious = await Security.checkSuspiciousActivity('embedding');
// Returns: { isSuspicious: boolean, geoAnomaly: boolean, ... }
```

#### `Security.calculateAdaptiveThreshold(baseThreshold, operation)`
Calculate adaptive threshold (travel-aware).

#### `Security.setTravelOverride(enabled)`
Set travel mode override (prevents lockouts during travel).

---

### Error Context

#### `Security.ErrorContext.create(code, rootCause, details)`
Create structured error context.

```javascript
const error = Security.ErrorContext.create('GEO_LOCKOUT', 'Too many location changes', {
    isLikelyTravel: true,
    cooldownMinutes: 60
});
// Returns: { code, rootCause, recoveryPath, userMessage, severity, ... }
```

---

### Utility Functions

#### `Security.generateRandomString(length)`
Generate cryptographically random string.

#### `Security.redactForLogging(obj, sensitiveKeys)`
Redact sensitive keys from object for logging.

#### `Security.getUserNamespace()`
Get user-specific namespace for data isolation.

#### `Security.isSessionValid()`
Check if session is still valid (not expired).

#### `Security.sanitizeObject(obj)`
Sanitize object to prevent prototype pollution.

#### `Security.safeJsonParse(jsonString)`
Safe JSON parse with prototype pollution protection.

#### `Security.enablePrototypePollutionProtection()`
Enable prototype pollution protection (freezes prototypes).

#### `Security.constantTimeCompare(a, b)`
Constant-time string comparison to prevent timing attacks.

```javascript
const isValid = Security.constantTimeCompare(storedToken, providedToken);
// Always compares all characters, preventing timing-based information leakage
```

---

### Recovery Handlers {#recovery-handlers---error-recovery}

Execute recovery paths for security errors.

#### `Security.executeRecovery(path, details)`

Execute a recovery handler for a given error code.

```javascript
Security.executeRecovery('reconnect_spotify', { reason: 'TOKEN_BINDING_FAIL' });
```

#### `Security.hasRecoveryHandler(path)`

Check if a recovery handler exists for a given path.

---

## IoC Container - Dependency Management {#ioc-container---dependency-management}

**Module:** `js/ioc-container.js`

Lightweight Inversion of Control container for dependency injection.

### Registration

#### `Container.register(name, dependencies, factory, lifecycle)`

Register a service with the container.

```javascript
Container.register('Storage', [], () => Storage);
Container.register('Chat', ['Storage', 'AppState'], (deps) => ({
    ...Chat,
    init: () => Chat.init(deps.Storage, deps.AppState)
}), 'singleton');
```

**Parameters:**
- `name` (String): Service name
- `dependencies` (Array, optional): Dependency names
- `factory` (Function): Factory function receiving resolved dependencies
- `lifecycle` (String): 'singleton' (default) or 'transient'

---

#### `Container.registerInstance(name, instance)`

Register an existing instance (useful for ES modules).

```javascript
Container.registerInstance('ModuleName', moduleObject);
```

---

### Resolution

#### `Container.resolve(name)`

Resolve a service by name.

```javascript
const chat = Container.resolve('Chat');
```

---

#### `Container.resolveAsync(name)`

Resolve a service asynchronously (for async factories).

```javascript
const service = await Container.resolveAsync('ServiceName');
```

---

#### `Container.resolveDependencies(names)`

Resolve multiple dependencies and return as object.

```javascript
const deps = Container.resolveDependencies(['Storage', 'AppState', 'Chat']);
// Returns: { Storage: ..., AppState: ..., Chat: ... }
```

---

#### `Container.initController(controllerName, depNames)`

Initialize a controller with dependencies.

```javascript
Container.initController('FileUploadController', [
    'Storage', 'AppState', 'OperationLock', 'Patterns', 'Personality'
]);
```

---

### Utility Methods

#### `Container.has(name)`

Check if service is registered.

#### `Container.getRegisteredServices()`

Get all registered service names.

#### `Container.clear()`

Clear all registrations (useful for testing).

#### `Container.createChild()`

Create isolated child container for testing.

---

## Providers - AI Provider Interface

**Module:** `js/providers/openrouter.js` (and similar for other providers)

Providers implement a consistent interface for AI model inference.

### Provider Interface

All providers implement the following interface:

```javascript
const Provider = {
    // Core API
    call: async (apiKey, config, messages, tools, onProgress) => response,
    callStreaming: async (apiKey, config, messages, tools, onToken) => response,

    // Utility
    validateApiKey: async (apiKey) => boolean,
    listModels: async (apiKey) => modelList,

    // Metadata
    name: 'provider-id',
    displayName: 'Provider Name',
    type: 'cloud' | 'local'
};
```

### OpenRouter Provider

**Module:** `js/providers/openrouter.js`

#### `OpenRouterProvider.call(apiKey, config, messages, tools, onProgress)`

Make a non-streaming API call to OpenRouter.

```javascript
const response = await OpenRouterProvider.call(
    'sk-or-v1-...',
    {
        model: 'openai/gpt-4o',
        maxTokens: 4096,
        temperature: 0.7
    },
    [
        { role: 'system', content: 'You are a music analyst.' },
        { role: 'user', content: 'Analyze my listening history.' }
    ],
    null  // No tools
);
```

**Parameters:**
- `apiKey` (String): OpenRouter API key
- `config` (Object): Provider configuration
  - `model` (String): Model identifier
  - `maxTokens` (Number): Max tokens in response
  - `temperature` (Number): Sampling temperature
  - `topP` (Number): Top-p sampling
  - `timeout` (Number): Request timeout (ms)
  - `apiUrl` (String): Custom API URL
- `messages` (Array): Chat messages array
- `tools` (Array, optional): Function calling tools
- `onProgress` (Function, optional): Progress callback

**Returns:** OpenAI-compatible response object

---

#### `OpenRouterProvider.callStreaming(apiKey, config, messages, tools, onToken)`

Make a streaming API call to OpenRouter.

```javascript
const response = await OpenRouterProvider.callStreaming(
    apiKey,
    config,
    messages,
    tools,
    (chunk) => {
        if (chunk.type === 'token') {
            console.log('Token:', chunk.token);
        } else if (chunk.type === 'thinking') {
            console.log('Thinking:', chunk.content);
        }
    }
);
```

**Progress callback types:**
- `{ type: 'token', token: string }` - Content token
- `{ type: 'thinking', content: string }` - Extended thinking
- `{ type: 'tool_call', toolCalls: array }` - Tool call

---

#### `OpenRouterProvider.validateApiKey(apiKey)`

Validate API key with a lightweight request.

```javascript
const isValid = await OpenRouterProvider.validateApiKey('sk-or-v1-...');
```

---

#### `OpenRouterProvider.listModels(apiKey)`

Get available models from OpenRouter.

```javascript
const models = await OpenRouterProvider.listModels(apiKey);
// Returns: [{ id, name, context_length, pricing }, ...]
```

---

### Gemini Provider

**Module:** `js/providers/gemini.js`

Implements the same interface with Gemini-specific defaults:

```javascript
import { GeminiProvider } from './providers/gemini.js';

const response = await GeminiProvider.call(apiKey, {
    model: 'gemini-2.0-flash-exp',
    maxTokens: 8192,
    temperature: 0.7
}, messages);
```

### Ollama Provider (Local)

**Module:** `js/providers/ollama-adapter.js`

For running models locally via Ollama:

```javascript
import { OllamaAdapter } from './providers/ollama-adapter.js';

const response = await OllamaAdapter.call(null, {
    model: 'llama3.2',
    apiUrl: 'http://localhost:11434/api'
}, messages);
```

### LM Studio Provider (Local)

**Module:** `js/providers/lmstudio.js`

For running models locally via LM Studio:

```javascript
import { LMStudioProvider } from './providers/lmstudio.js';

const response = await LMStudioProvider.call(null, {
    model: 'local-model',
    apiUrl: 'http://localhost:1234/v1'
}, messages);
```

---

## Common Patterns

### Subscribing to Events

```javascript
import { EventBus } from './services/event-bus.js';

const unsubscribe = EventBus.on('storage:updated', (payload, meta) => {
    console.log('Store updated:', payload.store);
});
```

### Reading State

```javascript
import { AppState } from './state/app-state.js';

const state = AppState.get();
const streams = state.data.streams;
```

### Updating State

```javascript
import { AppState } from './state/app-state.js';

AppState.update('operations', {
    isProcessing: true,
    processingMessage: 'Analyzing music...'
});
```

### Loading Data

```javascript
import { Storage } from './storage.js';

const streams = await Storage.getStreams();
const personality = await Storage.getPersonality();
```

### Encrypting Data

```javascript
import { Security } from './security/index.js';

const encKey = await Security.getDataEncryptionKey();
const encrypted = await Security.StorageEncryption.encrypt(apiKey, encKey);
await Storage.setConfig('openai.apiKey', encrypted);
```

### Calling AI Provider

```javascript
import { OpenRouterProvider } from './providers/openrouter.js';

const response = await OpenRouterProvider.call(
    apiKey,
    { model: 'openai/gpt-4o', maxTokens: 4096 },
    messages
);
```

---

## Type Definitions

### State Object

```typescript
interface AppState {
    view: {
        current: 'upload' | 'processing' | 'reveal' | 'lite-reveal' | 'chat',
        previous: string | null
    },
    data: {
        streams: Array<Stream> | null,
        chunks: Array<Chunk> | null,
        patterns: object | null,
        personality: Personality | null,
        dataHash: string | null
    },
    operations: {
        isProcessing: boolean,
        processingProgress: number,
        processingMessage: string,
        error: string | null
    }
}
```

### Event Metadata

```typescript
interface EventMeta {
    type: string,
    timestamp: number,
    priority: number,
    stormActive: boolean,
    domain: string,
    vectorClock: VectorClock,
    sequenceNumber: number,
    isReplay: boolean
}
```

### Storage Options

```typescript
interface StorageOptions {
    cutoffDate?: Date | number,
    dryRun?: boolean
}
```

---

**Last Updated:** 2026-01-23
**API Version:** v1.0
