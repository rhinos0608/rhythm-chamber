# TabCoordination Refactoring Plan

**Date:** 2026-01-26
**Status:** Analysis Complete - Implementation Pending
**Priority:** Medium
**Complexity:** High
**Estimated Effort:** 40-60 hours

---

## Executive Summary

The TabCoordination service is a **God Object** (2,696 lines, 100KB) with excessive complexity and multiple responsibilities. This document provides a detailed refactoring plan to decompose it into focused, single-responsibility modules.

### Current State
- **File Size:** 100KB
- **Line Count:** 2,696 lines
- **Responsibilities:** 8 distinct areas
- **Dependencies:** 8 imports, 5 dependents
- **Cyclomatic Complexity:** Estimated >200

### Target State
- **6 focused modules** (200-400 lines each)
- **Clear separation of concerns**
- **Testable components**
- **Maintainable architecture**

---

## 1. File Analysis

### 1.1 Current File Statistics

```
File: /Users/rhinesharar/rhythm-chamber/js/services/tab-coordination.js
Size: 100KB
Lines: 2,696
Imports: 8 modules
Exported API: 28 methods
Message Types: 8
Event Schemas: 3
State Variables: 40+
```

### 1.2 Dependency Map

#### Imports (8 modules)
```javascript
// Ordered by line number
1.  VectorClock          // Logical clock for conflict detection
2.  WaveTelemetry        // Performance monitoring
3.  EventBus             // Event publishing/subscription
4.  DeviceDetection      // Mobile/network detection
5.  SharedWorkerCoordinator // Fallback transport
6.  Crypto              // Message signing
7.  AppState            // Global application state
8.  escapeHtml          // XSS prevention
```

#### Dependents (5 files)
```javascript
1.  js/main.js                  // Application initialization
2.  js/app.js                   // Main app logic
3.  js/storage/indexeddb.js     // Database operations
4.  js/storage/write-ahead-log.js // Write-ahead logging
5.  js/services/event-bus.js    // Event coordination
```

---

## 2. Responsibility Analysis

### 2.1 Identified Responsibilities

| # | Responsibility | Lines | Complexity |
|---|----------------|-------|------------|
| 1 | Leader Election (deterministic) | ~300 | High |
| 2 | Secure Channel Management | ~400 | High |
| 3 | Heartbeat/Health Monitoring | ~350 | Medium |
| 4 | Write Authority Enforcement | ~200 | Low |
| 5 | Tab State Coordination | ~250 | Medium |
| 6 | Cross-Tab Event Routing | ~300 | Medium |
| 7 | Message Validation & Rate Limiting | ~400 | High |
| 8 | Event Replay Coordination | ~200 | Medium |

### 2.2 Responsibility Details

#### 1. Leader Election Protocol
**Lines:** ~300
**Key Functions:**
- `init()`, `initWithBroadcastChannel()`, `initWithSharedWorker()`
- `initiateReElection()`
- `claimPrimary()`
- `calculateElectionWindow()`
- `calibrateClockSkew()`

**State:**
```javascript
electionCandidates: Set
receivedPrimaryClaim: boolean
electionAborted: boolean
hasConcededLeadership: boolean
electionTimeout: number
```

**Concerns:**
- Complex election logic mixed with initialization
- Clock skew calibration tightly coupled
- No separation between BroadcastChannel and SharedWorker paths

#### 2. Secure Channel Management
**Lines:** ~400
**Key Functions:**
- `sendMessage()`, `sendMessageInternal()`
- `createMessageHandler()`
- `isKeySessionActive()`
- `processMessageQueue()`
- `startSecurityReadyWatcher()`

**State:**
```javascript
messageQueue: Array
isProcessingQueue: boolean
securityReadyCheckInterval: number
securityReadyNotified: boolean
usedNonces: Map
```

**Concerns:**
- Message validation, signing, and queuing mixed together
- Replay protection (nonce tracking) coupled with channel logic
- No clear separation between transport and security

#### 3. Heartbeat/Health Monitoring
**Lines:** ~350
**Key Functions:**
- `startHeartbeat()`, `stopHeartbeat()`
- `startHeartbeatMonitor()`, `stopHeartbeatMonitor()`
- `sendHeartbeat()`

**State:**
```javascript
heartbeatInterval: number
heartbeatCheckInterval: number
lastLeaderHeartbeat: number
lastLeaderVectorClock: Object
lastHeartbeatSentTime: number
heartbeatInProgress: boolean
```

**Concerns:**
- Heartbeat sending and monitoring in same module
- Clock skew tracking mixed with heartbeat logic
- No clear separation between leader and follower responsibilities

#### 4. Write Authority Enforcement
**Lines:** ~200
**Key Functions:**
- `isWriteAllowed()`
- `getAuthorityLevel()`
- `assertWriteAuthority()`
- `disableWriteOperations()`
- `onAuthorityChange()`

**State:**
```javascript
isPrimaryTab: boolean
hasCalledSecondaryMode: boolean
hasConcededLeadership: boolean
authorityChangeListeners: Array
```

**Concerns:**
- UI manipulation (disableWriteOperations) mixed with authority logic
- Authority state scattered across multiple variables
- No centralized authority state machine

#### 5. Tab State Coordination
**Lines:** ~250
**Key Functions:**
- `handleSecondaryMode()`
- `enterSafeMode()`
- `broadcastSafeModeChange()`
- `showSafeModeWarningFromRemote()`
- `hideSafeModeWarning()`

**State:**
```javascript
lastVisibilityCheckTime: number
debugMode: boolean
```

**Concerns:**
- Safe mode management mixed with tab coordination
- UI manipulation (warnings) coupled with state management
- No clear state transition diagram

#### 6. Cross-Tab Event Routing
**Lines:** ~300
**Key Functions:**
- `startWatermarkBroadcast()`, `stopWatermarkBroadcast()`
- `broadcastWatermark()`
- `updateEventWatermark()`, `getEventWatermark()`
- `getKnownWatermarks()`
- `requestEventReplay()`

**State:**
```javascript
lastEventWatermark: number
knownWatermarks: Map
watermarkBroadcastInterval: number
```

**Concerns:**
- Event replay logic mixed with routing
- Watermark tracking coupled with event bus
- No clear separation between routing and replay

#### 7. Message Validation & Rate Limiting
**Lines:** ~400
**Key Functions:**
- `validateMessageStructure()`
- `isRateLimited()`
- `isNonceFresh()`
- `isInBootstrapWindow()`
- `allowUnsignedMessage()`
- `pruneStaleRemoteSequences()`

**State:**
```javascript
messageRateTracking: Map
globalMessageCount: number
burstMessageCount: number
remoteSequences: Map
outOfOrderCount: number
```

**Concerns:**
- Multiple validation concerns (structure, rate, replay) mixed
- No clear validation pipeline
- Rate limiting logic scattered

#### 8. Event Replay Coordination
**Lines:** ~200
**Key Functions:**
- `handleReplayRequest()`
- `handleReplayResponse()`
- `needsReplay()`
- `autoReplayIfNeeded()`

**Concerns:**
- Tightly coupled with EventBus
- No clear replay strategy interface
- Mixed with watermark tracking

---

## 3. Extraction Plan

### 3.1 Module Decomposition

#### Module 1: LeaderElectionProtocol
**Purpose:** Deterministic leader election using candidate announcement

**File:** `js/services/coordination/leader-election-protocol.js`
**Estimated Size:** 300 lines

**Responsibilities:**
- Manage election lifecycle (announce, collect, resolve)
- Determine winner using deterministic ordering (lowest tab ID)
- Handle re-election after primary failure
- Coordinate with clock skew calibration

**Extracted Functions:**
```javascript
// Core election logic
initiateElection()
announceCandidate(tabId)
collectCandidate(tabId)
resolveElection(candidates)
abortElection()
// Re-election
triggerReElection()
// Clock skew
calibrateClockSkew()
getClockSkew()
// Election window
calculateElectionWindow()
```

**Extracted State:**
```javascript
electionCandidates: Set
receivedPrimaryClaim: boolean
electionAborted: boolean
electionTimeout: number
ELECTION_WINDOW_MS: number
```

**Dependencies:**
```javascript
VectorClock (for deterministic ordering)
DeviceDetection (for adaptive timing)
```

**Interface:**
```javascript
class LeaderElectionProtocol {
    constructor(transport, config)
    async initiate()
    async announceCandidate()
    async triggerReElection()
    getWinner(candidates)
    abort()
    isElectionActive()
    getClockSkew()
}
```

**Constants:**
```javascript
MESSAGE_TYPES.CANDIDATE
MESSAGE_TYPES.CLAIM_PRIMARY
MESSAGE_TYPES.RELEASE_PRIMARY
```

---

#### Module 2: SecureChannelManager
**Purpose:** Secure message transport with authentication and replay protection

**File:** `js/services/coordination/secure-channel-manager.js`
**Estimated Size:** 400 lines

**Responsibilities:**
- Message signing and verification
- Replay attack prevention (nonce tracking)
- Message queuing during session initialization
- Origin validation
- Bootstrap window management

**Extracted Functions:**
```javascript
// Sending
sendMessage(message, options)
sendSignedMessage(message)
sendUnsignedMessage(message)
queueMessage(message)
processQueue()
// Receiving
verifyMessage(message)
validateSignature(message)
checkNonce(nonce)
validateOrigin(message)
// Session management
waitForSessionReady()
isSessionReady()
enableBootstrapWindow()
disableBootstrapWindow()
```

**Extracted State:**
```javascript
messageQueue: Array
isProcessingQueue: boolean
securityReadyCheckInterval: number
usedNonces: Map
MODULE_INIT_TIME: number
unsignedMessageCount: number
```

**Dependencies:**
```javascript
Crypto (for signing)
```

**Interface:**
```javascript
class SecureChannelManager {
    constructor(transport, config)
    async send(message, options)
    async verify(message)
    queueMessage(message)
    async processQueue()
    isSessionReady()
    enableBootstrapWindow()
    disableBootstrapWindow()
    clearNonces()
}
```

**Constants:**
```javascript
NONCE_EXPIRY_MS: 60000
CLEANUP_THRESHOLD: 500
MAX_UNSIGNED_MESSAGES: 3
BOOTSTRAP_WINDOW_MS: 2000
```

---

#### Module 3: HeartbeatMonitor
**Purpose:** Leader health monitoring with adaptive timing

**File:** `js/services/coordination/heartbeat-monitor.js`
**Estimated Size:** 350 lines

**Responsibilities:**
- Send periodic heartbeats (leader)
- Monitor leader health (follower)
- Detect leader failure with skew tolerance
- Adaptive timing for mobile/network conditions
- Visibility-aware failover

**Extracted Functions:**
```javascript
// Leader
startSendingHeartbeat()
stopSendingHeartbeat()
sendHeartbeat()
// Follower
startMonitoringHeartbeat()
stopMonitoringHeartbeat()
checkHeartbeat()
isHeartbeatMissed()
// Timing
calculateAdaptiveInterval()
getVisibilityWait()
// Clock skew
updateClockSkew(remoteTimestamp)
adjustTimestamp(localTimestamp)
isWithinSkewTolerance(timestamp1, timestamp2)
```

**Extracted State:**
```javascript
heartbeatInterval: number
heartbeatCheckInterval: number
lastHeartbeatTime: number
lastLeaderVectorClock: Object
heartbeatInProgress: boolean
clockSkewTracker: Object
```

**Dependencies:**
```javascript
DeviceDetection (for adaptive timing)
VectorClock (for conflict detection)
WaveTelemetry (for monitoring)
```

**Interface:**
```javascript
class HeartbeatMonitor {
    constructor(transport, config, role)
    start()
    stop()
    sendHeartbeat()
    getLastHeartbeatTime()
    getClockSkew()
    isMissed()
    setRole(role) // 'leader' | 'follower'
}
```

**Constants:**
```javascript
HEARTBEAT_INTERVAL_MS: 3000
MAX_MISSED_HEARTBEATS: 2
CLOCK_SKEW_TOLERANCE_MS: 2000
HEARTBEAT_STORAGE_KEY: 'rhythm_chamber_leader_heartbeat'
```

---

#### Module 4: WriteAuthorityManager
**Purpose:** Centralized write authority enforcement and state management

**File:** `js/services/coordination/write-authority-manager.js`
**Estimated Size:** 200 lines

**Responsibilities:**
- Track write authority state (primary/secondary)
- Provide authority checking API
- Notify listeners of authority changes
- Enforce write authority assertions
- Manage safe mode state

**Extracted Functions:**
```javascript
// Authority state
isPrimary()
isWriteAllowed()
getAuthorityLevel()
assertWriteAuthority(operation)
// State management
setPrimary(isPrimary)
enterSecondaryMode()
// Safe mode
enterSafeMode(reason)
exitSafeMode()
// Notifications
onAuthorityChange(callback)
notifyAuthorityChange()
```

**Extracted State:**
```javascript
isPrimaryTab: boolean
hasCalledSecondaryMode: boolean
hasConcededLeadership: boolean
authorityChangeListeners: Array
safeModeEnabled: boolean
safeModeReason: string
```

**Dependencies:**
```javascript
EventBus (for publishing authority changes)
AppState (for safe mode state)
```

**Interface:**
```javascript
class WriteAuthorityManager {
    constructor(config)
    isPrimary()
    isWriteAllowed()
    getAuthorityLevel()
    assertWriteAuthority(operation)
    setPrimary(isPrimary)
    enterSecondaryMode()
    enterSafeMode(reason)
    exitSafeMode()
    onAuthorityChange(callback)
    hasConcededLeadership()
}
```

**Constants:**
```javascript
None (all state is dynamic)
```

---

#### Module 5: TabStateCoordinator
**Purpose:** Tab lifecycle state management and UI feedback

**File:** `js/services/coordination/tab-state-coordinator.js`
**Estimated Size:** 250 lines

**Responsibilities:**
- Track tab lifecycle (init, active, cleanup)
- Manage UI state for primary/secondary mode
- Handle wake-from-sleep detection
- Coordinate visibility changes
- Show/hide warnings and modals

**Extracted Functions:**
```javascript
// Lifecycle
initialize()
cleanup()
// State
setTabState(state, metadata)
getTabState()
// UI feedback
showMultiTabWarning()
hideMultiTabWarning()
showSafeModeWarning(reason)
hideSafeModeWarning()
disableWriteOperations()
enableWriteOperations()
// Wake detection
setupWakeDetection()
cleanupWakeDetection()
handleVisibilityChange()
```

**Extracted State:**
```javascript
tabState: string
lastVisibilityCheckTime: number
wakeDetectionCleanup: Function
debugMode: boolean
```

**Dependencies:**
```javascript
DeviceDetection (for visibility monitoring)
WriteAuthorityManager (for authority state)
```

**Interface:**
```javascript
class TabStateCoordinator {
    constructor(authorityManager, config)
    initialize()
    cleanup()
    setTabState(state, metadata)
    getTabState()
    showWarning(type, message)
    hideWarning(type)
    disableWriteOperations()
    enableWriteOperations()
}
```

**Constants:**
```javascript
SLEEP_DETECTION_THRESHOLD_MS: 30000
```

---

#### Module 6: CrossTabEventBus
**Purpose:** Cross-tab event routing and replay coordination

**File:** `js/services/coordination/cross-tab-event-bus.js`
**Estimated Size:** 300 lines

**Responsibilities:**
- Broadcast event watermarks
- Track watermarks from all tabs
- Coordinate event replay between tabs
- Request replay from primary
- Handle replay requests/responses

**Extracted Functions:**
```javascript
// Watermark management
startWatermarkBroadcast()
stopWatermarkBroadcast()
broadcastWatermark()
updateWatermark(watermark)
getWatermark()
getKnownWatermarks()
// Replay
requestReplay(fromWatermark)
handleReplayRequest(requestingTabId, fromWatermark)
handleReplayResponse(events)
needsReplay()
autoReplayIfNeeded()
```

**Extracted State:**
```javascript
lastEventWatermark: number
knownWatermarks: Map
watermarkBroadcastInterval: number
isPrimaryTab: boolean
```

**Dependencies:**
```javascript
EventBus (for event replay)
SecureChannelManager (for messaging)
```

**Interface:**
```javascript
class CrossTabEventBus {
    constructor(transport, eventBus, secureChannel)
    start()
    stop()
    updateWatermark(watermark)
    getWatermark()
    getKnownWatermarks()
    async requestReplay(fromWatermark)
    async handleReplayRequest(requestingTabId, fromWatermark)
    async handleReplayResponse(events)
    needsReplay()
    async autoReplayIfNeeded()
}
```

**Constants:**
```javascript
WATERMARK_BROADCAST_MS: 5000
MESSAGE_TYPES.EVENT_WATERMARK
MESSAGE_TYPES.REPLAY_REQUEST
MESSAGE_TYPES.REPLAY_RESPONSE
```

---

#### Module 7: MessageValidator
**Purpose:** Centralized message validation and rate limiting

**File:** `js/services/coordination/message-validator.js`
**Estimated Size:** 400 lines

**Responsibilities:**
- Validate message structure against schema
- Rate limiting per message type
- Burst protection
- Sequence validation (duplicate/out-of-order detection)
- Prototype pollution prevention
- Depth and size limits

**Extracted Functions:**
```javascript
// Structure validation
validateStructure(message)
validateSchema(message, schema)
validateDepth(message, maxDepth)
validateSize(message, maxSize)
validatePrototypePollution(message)
// Rate limiting
isRateLimited(messageType)
checkRateLimit(messageType)
checkBurstLimit()
checkGlobalLimit()
cleanupRateTracking()
// Sequence validation
validateSequence(message)
isDuplicate(message)
isOutOfOrder(message)
pruneStaleSequences()
```

**Extracted State:**
```javascript
messageRateTracking: Map
globalMessageCount: number
burstMessageCount: number
globalWindowStart: number
burstWindowStart: number
remoteSequences: Map
remoteSequenceTimestamps: Map
outOfOrderCount: number
```

**Dependencies:**
```javascript
None (pure validation logic)
```

**Interface:**
```javascript
class MessageValidator {
    constructor(config)
    validate(message)
    checkRateLimit(messageType)
    validateSequence(message)
    getRateLimitStatus()
    getSequenceStatus()
    reset()
    clearTracking()
}
```

**Constants:**
```javascript
MAX_MESSAGE_SIZE: 1048576 (1MB)
MAX_DEPTH: 10
GLOBAL_RATE_LIMIT: 50
BURST_RATE_LIMIT: 10
BURST_WINDOW_MS: 100
REMOTE_SEQUENCE_MAX_AGE_MS: 300000
```

**Message Schemas:**
```javascript
MESSAGE_SCHEMA: {
  CANDIDATE: { required: [...], optional: [...] },
  CLAIM_PRIMARY: { required: [...], optional: [...] },
  RELEASE_PRIMARY: { required: [...], optional: [...] },
  HEARTBEAT: { required: [...], optional: [...] },
  EVENT_WATERMARK: { required: [...], optional: [...] },
  REPLAY_REQUEST: { required: [...], optional: [...] },
  REPLAY_RESPONSE: { required: [...], optional: [...] },
  SAFE_MODE_CHANGED: { required: [...], optional: [...] }
}
```

---

### 3.2 Module Interaction Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    TabCoordinator (Facade)                   │
│  - Coordinates all modules                                  │
│  - Provides unified public API                              │
│  - Manages module lifecycle                                 │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐  ┌─────────────────┐  ┌────────────────┐
│LeaderElection │  │ SecureChannel   │  │ Heartbeat      │
│Protocol       │  │ Manager         │  │ Monitor        │
└───────────────┘  └─────────────────┘  └────────────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐  ┌─────────────────┐  ┌────────────────┐
│Message        │  │ WriteAuthority  │  │ TabState       │
│Validator      │  │ Manager         │  │ Coordinator    │
└───────────────┘  └─────────────────┘  └────────────────┘
                            │
                            ▼
                    ┌─────────────────┐
                    │ CrossTabEventBus │
                    └─────────────────┘
```

---

## 4. Interface Contracts

### 4.1 Transport Interface

All modules communicate through a unified transport interface:

```javascript
/**
 * Unified transport interface for cross-tab communication
 * Supports both BroadcastChannel and SharedWorker
 */
class CoordinationTransport {
    /**
     * Send a message to other tabs
     * @param {Object} message - Message to send
     */
    postMessage(message)

    /**
     * Register message handler
     * @param {string} type - Message type ('message')
     * @param {Function} handler - Message handler
     */
    addEventListener(type, handler)

    /**
     * Unregister message handler
     * @param {string} type - Message type
     * @param {Function} handler - Message handler
     */
    removeEventListener(type, handler)

    /**
     * Close transport connection
     */
    close()

    /**
     * Get transport type
     * @returns {string} 'BroadcastChannel' | 'SharedWorker'
     */
    getType()
}
```

### 4.2 Message Format

All messages follow a standard format:

```javascript
{
    // Required fields
    type: string,           // Message type (MESSAGE_TYPES.*)
    tabId: string,          // Source tab ID
    timestamp: number,      // Unix timestamp

    // Optional security fields
    senderId: string,       // Sender tab ID (for sequence tracking)
    seq: number,            // Sequence number
    nonce: string,          // Unique nonce for replay protection
    origin: string,         // Origin for validation
    vectorClock: Object,    // Vector clock for conflict detection

    // Message-specific fields
    ...payload              // Type-specific payload
}
```

### 4.3 Event Interface

Modules emit events for coordination:

```javascript
// Leader election events
'leader:election:started'  // { electionId }
'leader:election:complete'  // { winner, candidates }
'leader:election:aborted'  // { reason }

// Authority events
'authority:changed'         // { isPrimary, level, mode }
'authority:safe_mode'       // { enabled, reason }

// Heartbeat events
'heartbeat:missed'          // { lastSeen, skew }
'heartbeat:recovered'       // { interval }

// Replay events
'replay:started'           // { fromWatermark }
'replay:complete'          // { eventCount }
'replay:failed'            // { error }
```

---

## 5. Migration Path

### 5.1 Phased Approach

#### Phase 1: Foundation (No behavior changes)
**Duration:** 1-2 days
**Risk:** Low

1. Create new directory structure:
   ```
   js/services/coordination/
   ```

2. Create transport interface:
   - `coordination-transport.js`
   - Unified interface for BroadcastChannel/SharedWorker

3. Create configuration module:
   - `coordination-config.js`
   - Centralize all constants and timing config

4. Update imports in tab-coordination.js
   - No behavior changes, only reorganization

**Success Criteria:**
- All tests pass
- No functional changes
- Configuration is centralized

---

#### Phase 2: Extract Validation
**Duration:** 1-2 days
**Risk:** Low-Medium

1. Create `message-validator.js`
2. Move validation functions:
   - `validateMessageStructure()`
   - `isRateLimited()`
   - `isNonceFresh()`
   - `pruneStaleRemoteSequences()`

3. Update tab-coordination.js:
   - Import MessageValidator
   - Delegate validation calls

4. Add tests for MessageValidator

**Success Criteria:**
- All validation tests pass
- Rate limiting works correctly
- No performance regression

---

#### Phase 3: Extract Secure Channel
**Duration:** 2-3 days
**Risk:** Medium

1. Create `secure-channel-manager.js`
2. Move messaging functions:
   - `sendMessage()`
   - `sendMessageInternal()`
   - `processMessageQueue()`
   - `startSecurityReadyWatcher()`

3. Update tab-coordination.js:
   - Import SecureChannelManager
   - Delegate message sending

4. Update message handler to use validator

**Success Criteria:**
- Message signing/verification works
- Queue processing works correctly
- Bootstrap window managed properly

---

#### Phase 4: Extract Heartbeat Monitor
**Duration:** 2-3 days
**Risk:** Medium

1. Create `heartbeat-monitor.js`
2. Move heartbeat functions:
   - `startHeartbeat()`, `stopHeartbeat()`
   - `startHeartbeatMonitor()`, `stopHeartbeatMonitor()`
   - `sendHeartbeat()`

3. Move clock skew tracking
4. Update tab-coordination.js:
   - Import HeartbeatMonitor
   - Delegate heartbeat calls

**Success Criteria:**
- Leader sends heartbeats correctly
- Followers monitor and detect failures
- Clock skew compensation works

---

#### Phase 5: Extract Write Authority
**Duration:** 1-2 days
**Risk:** Low

1. Create `write-authority-manager.js`
2. Move authority functions:
   - `isWriteAllowed()`
   - `getAuthorityLevel()`
   - `assertWriteAuthority()`
   - `onAuthorityChange()`

3. Move safe mode functions
4. Update tab-coordination.js:
   - Import WriteAuthorityManager
   - Delegate authority calls

**Success Criteria:**
- Authority checks work correctly
- Safe mode triggered properly
- Authority listeners notified

---

#### Phase 6: Extract Tab State Coordinator
**Duration:** 1-2 days
**Risk:** Low

1. Create `tab-state-coordinator.js`
2. Move UI/state functions:
   - `handleSecondaryMode()`
   - `disableWriteOperations()`
   - `showSafeModeWarningFromRemote()`
   - Setup wake detection

3. Update tab-coordination.js:
   - Import TabStateCoordinator
   - Delegate UI calls

**Success Criteria:**
- UI updates correctly
- Wake detection works
- No UI bugs

---

#### Phase 7: Extract Leader Election
**Duration:** 2-3 days
**Risk:** High

1. Create `leader-election-protocol.js`
2. Move election functions:
   - `initiateElection()`
   - `triggerReElection()`
   - `claimPrimary()`
   - `calibrateClockSkew()`

3. Update tab-coordination.js:
   - Import LeaderElectionProtocol
   - Delegate election calls

4. Thorough testing of election scenarios

**Success Criteria:**
- Elections work deterministically
- Re-elections after failure
- No split-brain scenarios

---

#### Phase 8: Extract Cross-Tab Event Bus
**Duration:** 1-2 days
**Risk:** Medium

1. Create `cross-tab-event-bus.js`
2. Move replay functions:
   - `startWatermarkBroadcast()`
   - `requestEventReplay()`
   - `handleReplayRequest()`
   - `handleReplayResponse()`

3. Update tab-coordination.js:
   - Import CrossTabEventBus
   - Delegate replay calls

**Success Criteria:**
- Watermark broadcasting works
- Event replay functions correctly
- No missing events

---

#### Phase 9: Create Facade
**Duration:** 1-2 days
**Risk:** Low

1. Create new `tab-coordinator.js` (singular)
2. Implement as facade pattern:
   - Import all modules
   - Delegate to modules
   - Maintain backward-compatible API

3. Update all dependents:
   - Change import from `tab-coordination` to `tab-coordinator`
   - Verify all functionality works

4. Deprecate old file:
   - Rename to `tab-coordination.js.deprecated`
   - Add migration notice

**Success Criteria:**
- All dependents work without changes
- Backward-compatible API
- No breaking changes

---

#### Phase 10: Cleanup
**Duration:** 1 day
**Risk:** Low

1. Remove deprecated file
2. Update documentation
3. Add architecture diagrams
4. Final testing

**Success Criteria:**
- Code is clean and documented
- All tests pass
- Documentation complete

---

### 5.2 Rollback Strategy

Each phase is independently reversible:

```javascript
// If Phase N fails:
git revert <commit-hash>

// Or use feature flags:
const USE_NEW_COORDINATION = false;

if (USE_NEW_COORDINATION) {
    // Use new modular approach
} else {
    // Use old monolithic approach
}
```

---

## 6. Test Strategy

### 6.1 Unit Tests

#### MessageValidator Tests
```javascript
describe('MessageValidator', () => {
    test('rejects malformed messages')
    test('enforces rate limits')
    test('detects duplicate messages')
    test('detects out-of-order messages')
    test('prevents prototype pollution')
    test('enforces size limits')
    test('enforces depth limits')
    test('prunes stale sequences')
})
```

#### SecureChannelManager Tests
```javascript
describe('SecureChannelManager', () => {
    test('signs messages correctly')
    test('verifies signatures')
    test('queues messages when session not ready')
    test('processes queue when session ready')
    test('prevents replay attacks via nonce tracking')
    test('enforces bootstrap window')
    test('rate limits unsigned messages')
})
```

#### HeartbeatMonitor Tests
```javascript
describe('HeartbeatMonitor', () => {
    test('leader sends periodic heartbeats')
    test('follower monitors leader heartbeat')
    test('detects missed heartbeat')
    test('adjusts for clock skew')
    test('uses adaptive timing on mobile')
    test('waits longer when page hidden')
})
```

#### WriteAuthorityManager Tests
```javascript
describe('WriteAuthorityManager', () => {
    test('tracks primary/secondary state')
    test('prevents write when secondary')
    test('notifies authority change listeners')
    test('enters safe mode on error')
    test('prevents split-brain via conceded flag')
})
```

#### LeaderElectionProtocol Tests
```javascript
describe('LeaderElectionProtocol', () => {
    test('elects lowest tab ID as winner')
    test('handles concurrent elections')
    test('aborts election when claim received')
    test('triggers re-election on primary failure')
    test('calibrates clock skew before election')
})
```

#### CrossTabEventBus Tests
```javascript
describe('CrossTabEventBus', () => {
    test('broadcasts watermark periodically')
    test('tracks watermarks from all tabs')
    test('requests replay when needed')
    test('handles replay request from secondary')
    test('handles replay response from primary')
})
```

---

### 6.2 Integration Tests

#### Multi-Tab Scenarios
```javascript
describe('Multi-Tab Coordination', () => {
    test('two tabs - one becomes primary, one secondary')
    test('three tabs - deterministic winner')
    test('primary closes - secondary promotes')
    test('network partition - splits and heals')
    test('simultaneous open - no split-brain')
    test('wake from sleep - re-election triggered')
})
```

#### Message Flow Tests
```javascript
describe('Message Flow', () => {
    test('candidate messages collected during election')
    test('heartbeat messages update last seen time')
    test('replay request/response flow')
    test('safe mode broadcast to all tabs')
})
```

#### Authority Tests
```javascript
describe('Authority Enforcement', () => {
    test('secondary tab cannot write to storage')
    test('secondary tab cannot send chat messages')
    test('secondary tab cannot upload files')
    test('authority change updates UI correctly')
})
```

---

### 6.3 Performance Tests

```javascript
describe('Performance', () => {
    test('election completes within 1 second')
    test('heartbeat detection within 10 seconds')
    test('message validation under 1ms')
    test('rate limiting under 0.1ms')
    test('nonce lookup under 0.1ms')
})
```

---

### 6.4 Adversarial Tests

```javascript
describe('Security', () => {
    test('rejects messages from wrong origin')
    test('rejects replayed messages')
    test('rejects oversized messages')
    test('rejects deeply nested messages')
    test('rejects prototype pollution attempts')
    test('rate limits message flooding')
    test('rate limits burst attacks')
})
```

---

## 7. Risks and Mitigations

### 7.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Breaking existing functionality | High | Medium | Comprehensive test suite, phased rollout |
| Performance regression | Medium | Low | Benchmark before/after each phase |
| Split-brain scenarios | High | Low | Thorough election testing, rollback plan |
| Memory leaks | Medium | Low | Memory profiling, leak detection tests |
| Race conditions | High | Medium | Concurrent testing, timeout handling |

### 7.2 Operational Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Deployment complexity | Medium | Medium | Feature flags, gradual rollout |
| Rollback difficulty | High | Low | Independent phases, git revert |
| Documentation gaps | Low | Medium | Update docs with each phase |
| Team coordination | Medium | Low | Clear phase ownership |

---

## 8. Success Metrics

### 8.1 Code Quality Metrics

**Before Refactoring:**
- File size: 100KB
- Lines of code: 2,696
- Cyclomatic complexity: ~200
- Responsibilities: 8
- Test coverage: Unknown

**After Refactoring (Target):**
- Largest file: ~400 lines
- Average file size: ~15KB
- Average complexity: ~20
- Responsibilities per module: 1
- Test coverage: >80%

### 8.2 Performance Metrics

- Election time: <1s (no change)
- Heartbeat detection: <10s (no change)
- Message validation: <1ms (no change)
- Memory usage: No increase

### 8.3 Maintainability Metrics

- Time to add feature: Reduced by 50%
- Time to fix bug: Reduced by 50%
- Code review time: Reduced by 30%
- Onboarding time: Reduced by 40%

---

## 9. Implementation Checklist

### Phase 1: Foundation
- [ ] Create `js/services/coordination/` directory
- [ ] Create `coordination-transport.js`
- [ ] Create `coordination-config.js`
- [ ] Centralize all constants
- [ ] Update imports in tab-coordination.js
- [ ] Run tests

### Phase 2: Validation
- [ ] Create `message-validator.js`
- [ ] Move validation functions
- [ ] Add unit tests
- [ ] Update tab-coordination.js
- [ ] Run tests

### Phase 3: Secure Channel
- [ ] Create `secure-channel-manager.js`
- [ ] Move messaging functions
- [ ] Add unit tests
- [ ] Update tab-coordination.js
- [ ] Run tests

### Phase 4: Heartbeat
- [ ] Create `heartbeat-monitor.js`
- [ ] Move heartbeat functions
- [ ] Add unit tests
- [ ] Update tab-coordination.js
- [ ] Run tests

### Phase 5: Write Authority
- [ ] Create `write-authority-manager.js`
- [ ] Move authority functions
- [ ] Add unit tests
- [ ] Update tab-coordination.js
- [ ] Run tests

### Phase 6: Tab State
- [ ] Create `tab-state-coordinator.js`
- [ ] Move state functions
- [ ] Add unit tests
- [ ] Update tab-coordination.js
- [ ] Run tests

### Phase 7: Leader Election
- [ ] Create `leader-election-protocol.js`
- [ ] Move election functions
- [ ] Add unit tests
- [ ] Update tab-coordination.js
- [ ] Run integration tests

### Phase 8: Event Bus
- [ ] Create `cross-tab-event-bus.js`
- [ ] Move replay functions
- [ ] Add unit tests
- [ ] Update tab-coordination.js
- [ ] Run tests

### Phase 9: Facade
- [ ] Create new `tab-coordinator.js`
- [ ] Implement facade pattern
- [ ] Update dependents
- [ ] Run full test suite
- [ ] Performance benchmarks

### Phase 10: Cleanup
- [ ] Remove deprecated file
- [ ] Update documentation
- [ ] Add architecture diagrams
- [ ] Final testing
- [ ] Deploy

---

## 10. Documentation Plan

### 10.1 Code Documentation

Each module will have:
- JSDoc comments for all public methods
- Usage examples in docstrings
- Type annotations where applicable
- README.md in coordination/ directory

### 10.2 Architecture Documentation

Create:
- Module interaction diagram
- Data flow diagram
- State machine diagram for authority
- Sequence diagrams for key scenarios

### 10.3 Migration Guide

For developers consuming TabCoordinator:
- API remains the same (backward compatible)
- No code changes required for dependents
- Performance characteristics unchanged

---

## 11. Conclusion

This refactoring plan decomposes the TabCoordination God Object into 7 focused modules with clear responsibilities. The phased approach minimizes risk while allowing for incremental improvement.

### Key Benefits

1. **Maintainability:** Each module is ~300 lines vs 2,696
2. **Testability:** Modules can be tested in isolation
3. **Clarity:** Single responsibility per module
4. **Flexibility:** Easy to modify individual concerns
5. **Safety:** Backward compatible via facade pattern

### Next Steps

1. Review and approve this plan
2. Assign phase owners
3. Create feature branch
4. Begin Phase 1 implementation
5. Continuously test and measure

---

**Document Version:** 1.0
**Last Updated:** 2026-01-26
**Status:** Ready for Review
