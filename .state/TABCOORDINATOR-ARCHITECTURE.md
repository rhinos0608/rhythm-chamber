# TabCoordinator Architecture Overview

> **Last Updated:** 2026-01-30
> **Module Count:** 12 (verified)
> **Purpose:** Cross-tab coordination and leader election for multi-tab browser applications

---

## Executive Summary

TabCoordinator provides **deterministic leader election** and **cross-tab communication** for browser applications running multiple tabs simultaneously. It ensures only one tab acts as "primary" (write authority) while other tabs operate in "secondary" (read-only) mode.

**Key Features:**
- ✅ Deterministic leader election (vector clocks + transport layer)
- ✅ Automatic failover (primary detection, heartbeat monitoring)
- ✅ Event watermarking for replay (data consistency across tabs)
- ✅ Safe mode broadcasting (emergency read-only mode)
- ✅ Message queue processing (deferred message handling during bootstrap)
- ✅ Sleep/wake detection (recovery from browser sleep)

**Architecture Pattern:** Hierarchical Network Wave (HNW)
- **Hierarchy:** Clear authority levels (primary → secondary)
- **Network:** Message-based communication (BroadcastChannel → SharedWorker fallback)
- **Wave:** Leader election with vector clocks for conflict resolution

---

## Module List (12 Total)

All modules are located in `js/services/tab-coordination/modules/`:

### Core Authority (2 modules)

#### 1. **authority.js** (6,294 bytes)
**Purpose:** Primary tab authority management

**Responsibilities:**
- Track primary/secondary status (`isPrimaryTab`)
- Provide authority level API (`getAuthorityLevel()`)
- Emit authority change events via EventBus
- Coordinate write authority checks

**Key Exports:**
- `getIsPrimaryTab()` - Check if this tab is primary
- `setIsPrimaryTab(bool)` - Set primary status (internal)
- `getAuthorityLevel()` - Get authority level (PRIMARY/SECONDARY/UNKNOWN)
- `onAuthorityChange(callback)` - Subscribe to authority changes

**Dependencies:**
- EventBus (event emission)
- MESSAGE_TYPES, TAB_ID, vectorClock (constants)
- message-sender.js (lazy import to prevent cycle)

---

#### 2. **election.js** (6,762 bytes)
**Purpose:** Leader election algorithm and conflict resolution

**Responsibilities:**
- Coordinate leader election during startup
- Handle CANDIDATE, CLAIM_PRIMARY, RELEASE_PRIMARY messages
- Compare vector clocks for deterministic winner selection
- Manage secondary mode transition with watermark sync

**Key Exports:**
- `completeElection()` - Determine election winner after window
- `claimPrimary()` - Transition to primary role
- `handleSecondaryModeWithWatermark()` - Sync watermarks as secondary
- `cleanupElection()` - Cleanup election state

**Dependencies:**
- EventBus (message handling)
- authority.js (set/get primary status)
- watermark.js (lazy import to prevent cycle)
- message-sender.js (lazy import to prevent cycle)

**Lazy Import Strategy:**
```javascript
// election.js uses lazy import for watermark to break cycle
let Watermark;
async function getWatermark() {
    if (!Watermark) {
        const module = await import('./watermark.js');
        Watermark = module;
    }
    return Watermark;
}
```

---

### Coordination & Communication (5 modules)

#### 3. **heartbeat.js** (5,100 bytes)
**Purpose:** Heartbeat monitoring for primary/secondary liveness

**Responsibilities:**
- Send periodic heartbeat messages from primary tab
- Monitor heartbeat messages from primary (secondary tabs)
- Detect primary failure (heartbeat timeout)
- Trigger re-election when primary goes away

**Key Exports:**
- `startHeartbeat()` - Start heartbeat broadcasting (primary)
- `stopHeartbeat()` - Stop heartbeat broadcasting
- `startHeartbeatMonitor()` - Start monitoring (secondary)
- `getHeartbeatStats()` - Get heartbeat quality metrics

**Dependencies:**
- DeviceDetection (network quality tracking)
- WaveTelemetry (telemetry collection)
- message-sender.js (send heartbeat messages)

---

#### 4. **message-handler.js** (9,234 bytes)
**Purpose:** Incoming message processing and routing

**Responsibilities:**
- Create message handler for transport layer
- Route incoming messages to appropriate modules
- Validate message structure and signatures
- Handle message type routing (CANDIDATE, CLAIM_PRIMARY, HEARTBEAT, etc.)

**Key Exports:**
- `createMessageHandler()` - Create message handler function for transport

**Dependencies:**
- AppState (application state access)
- shared-state.js (debug mode)
- All message handling logic (type-based routing)

---

#### 5. **message-sender.js** (3,126 bytes)
**Purpose:** Outgoing message transport abstraction

**Responsibilities:**
- Send messages via BroadcastChannel or SharedWorker
- Provide transport layer abstraction
- Track transport type (BroadcastChannel vs SharedWorker)

**Key Exports:**
- `sendMessage(message, force)` - Send message to other tabs
- `getTransport()` - Get current transport instance
- `getTransportType()` - Get transport type string
- `isUsingFallback()` - Check if using SharedWorker fallback

**Dependencies:**
- TAB_ID, vectorClock (constants)
- Transport layer (BroadcastChannel → SharedWorker fallback)

---

#### 6. **message-queue.js** (2,520 bytes)
**Purpose:** Message queue for deferred processing during bootstrap

**Responsibilities:**
- Queue messages received during bootstrap window
- Process queued messages after initialization
- Provide queue size and info for debugging

**Key Exports:**
- `enqueueMessage(message)` - Add message to queue
- `processMessageQueue()` - Process all queued messages
- `getQueueSize()` - Get current queue size
- `getQueueInfo(isKeySessionActive)` - Get detailed queue info

**Dependencies:**
- timing.js (bootstrap window check)
- message-sender.js (send queued messages)
- shared-state.js (key session check)

---

#### 7. **transport-creation.js** (2,685 bytes)
**Purpose:** Transport initialization and fallback management

**Responsibilities:**
- Initialize BroadcastChannel transport
- Fallback to SharedWorker if BroadcastChannel unavailable
- Handle transport errors gracefully

**Key Exports:**
- `initializeTransport()` - Create and configure transport

**Dependencies:**
- CHANNEL_NAME (constant)
- SharedWorkerCoordinator (fallback transport)

---

### Data Consistency (2 modules)

#### 8. **watermark.js** (5,847 bytes)
**Purpose:** Event watermarking for cross-tab data consistency

**Responsibilities:**
- Track event watermarks for replay detection
- Broadcast watermark updates to other tabs
- Request event replay from primary tab
- Manage known watermarks from all tabs

**Key Exports:**
- `updateEventWatermark(id)` - Update local watermark
- `getEventWatermark()` - Get current watermark
- `getKnownWatermarks()` - Get all known watermarks
- `requestEventReplay(fromId)` - Request replay from primary
- `needsReplay()` - Check if replay is needed
- `autoReplayIfNeeded()` - Automatically replay events
- `cleanupWatermark()` - Cleanup watermark state

**Dependencies:**
- EventBus (watermark update events)
- EventLogStore (event log access)
- authority.js (check if primary for replay)
- message-sender.js (send watermark messages)

---

#### 9. **shared-state.js** (1,405 bytes)
**Purpose:** Shared state management between modules

**Responsibilities:**
- Manage debug mode flag (shared across modules)
- Track key session active state
- Provide centralized state access

**Key Exports:**
- `debugMode` - Debug mode flag
- `setDebugMode(bool)` - Set debug mode
- `isKeySessionActive()` - Check if key session is active

**Dependencies:**
- Crypto (secure context check)

---

### Monitoring & Safety (3 modules)

#### 10. **monitoring.js** (2,202 bytes)
**Purpose:** Health monitoring and telemetry

**Responsibilities:**
- Setup health monitoring for all subsystems
- Track tab coordination health metrics
- Emit monitoring events

**Key Exports:**
- `setupAllMonitoring()` - Initialize all monitoring

**Dependencies:**
- DeviceDetection (device info tracking)
- sleep-detection.js (wake from sleep monitoring)

---

#### 11. **safe-mode.js** (3,166 bytes)
**Purpose:** Safe mode broadcasting for emergency read-only state

**Responsibilities:**
- Broadcast safe mode changes to all tabs
- Handle safe mode messages
- Provide safe mode state API

**Key Exports:**
- `broadcastSafeModeChange(isSafeMode)` - Broadcast safe mode state
- `handleSafeModeMessage(message)` - Process safe mode messages

**Dependencies:**
- MESSAGE_TYPES, TAB_ID (constants)
- message-sender.js (send safe mode messages)
- html-escape utility (safe message formatting)

---

#### 12. **sleep-detection.js** (1,997 bytes)
**Purpose:** Wake from sleep detection and recovery

**Responsibilities:**
- Detect when browser wakes from sleep
- Trigger re-election after sleep
- Handle clock skew after sleep

**Key Exports:**
- `setupWakeFromSleepDetection()` - Initialize sleep detection

**Dependencies:**
- election.js (trigger re-election)
- authority.js (check primary status)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   TabCoordinator Facade                     │
│  (Public API: 43+ methods, backward compatibility layer)   │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
    ┌───────▼──────┐  ┌─────▼──────┐  ┌───▼────────┐
    │   Authority  │  │  Election  │  │ Heartbeat  │
    │   Module     │  │   Module   │  │  Module    │
    └──────────────┘  └────────────┘  └────────────┘
            │               │               │
    ┌───────▼──────┐  ┌─────▼──────┐  ┌───▼────────┐
    │   Watermark  │  │   Message  │  │   Message  │
    │   Module     │  │  Handler   │  │   Queue    │
    └──────────────┘  │   Module   │  │   Module   │
                      └────────────┘  └────────────┘
                            │
                ┌───────────┼───────────┐
                │           │           │
        ┌───────▼────┐ ┌───▼──────┐ ┌──▼────────┐
        │MessageSender│ │Transport │ │SharedState│
        │  Module     │ │Creation  │ │  Module   │
        └─────────────┘ └──────────┘ └───────────┘
                │
        ┌───────┴───────┐
        │               │
    ┌───▼───────┐  ┌───▼──────────┐
    │Monitoring │  │  Safe Mode   │
    │  Module   │  │   Module     │
    └───────────┘  └──────────────┘
```

---

## Communication Patterns

### 1. Leader Election Flow

```
Tab A Startup          Tab B Startup          Tab C Startup
     │                      │                      │
     ├─→ CANDIDATE ────────┼─────────────────────┤
     │                      │                      │
     ├─→ CLAIM_PRIMARY ────┼─────────────────────┤
     │  (highest vector     │                      │
     │   clock wins)        │                      │
     │                      │                      │
     │                      ├─→ HEARTBEAT ─────────┤
     │                      │  (primary announces) │
     │                      │                      │
     ├─→ HEARTBEATEmitter  │                      │
```

### 2. Message Routing Flow

```
Incoming Message
       │
       ├─→ MessageHandler (transport listener)
       │
       ├─→ Validate Structure
       │
       ├─→ Route by Type:
       │   ├─→ CANDIDATE → Election Module
       │   ├─→ CLAIM_PRIMARY → Election Module
       │   ├─→ HEARTBEAT → Heartbeat Module
       │   ├─→ WATERMARK → Watermark Module
       │   ├─→ SAFE_MODE → SafeMode Module
       │   └─→ REPLAY_REQUEST → Watermark Module
```

### 3. Event Watermark Flow

```
Primary Tab                    Secondary Tab
     │                              │
     ├─→ Write Event               │
     │  (update watermark)          │
     │                              │
     ├─→ Broadcast WATERMARK ──────┤
     │                              │
     │                              ├─→ Check Watermark
     │                              │  (needs replay?)
     │                              │
     │                              ├─→ REQUEST_REPLAY ──→
     │                              │                    │
     │  ←─────────────────────────┤  Replay Events      │
     │                              │
     │  ─────────────────────────→  │
```

---

## Runtime Circular Dependency Handling

TabCoordinator uses **lazy imports** to break static circular dependencies while allowing runtime cross-references. This is documented in detail in [TABCOORDINATOR-CYCLES.md](./TABCOORDINATOR-CYCLES.md).

**Key Cycles:**
1. **election.js ↔ watermark.js** (mutual lazy imports)
2. **authority.js → message-sender.js** (lazy import)
3. **sleep-detection.js → election.js + authority.js** (static imports, no cycle)

**Lazy Import Pattern:**
```javascript
// Instead of: import { Watermark } from './watermark.js';
// Use lazy import:
let Watermark;
async function getWatermark() {
    if (!Watermark) {
        const module = await import('./watermark.js');
        Watermark = module;
    }
    return Watermark;
}
```

**Technical Debt Note:**
> Lazy imports prevent static circular dependency errors but introduce runtime complexity. Future refactoring should consider an **event-driven architecture** to eliminate lazy imports entirely (e.g., Election emits events that Watermark subscribes to, rather than direct method calls).

---

## Cross-Tab Coordination Flow

### Primary Tab Responsibilities

1. **Write Authority:** All write operations (IndexedDB, localStorage)
2. **Heartbeat Broadcasting:** Send periodic HEARTBEAT messages
3. **Event Replay:** Respond to REPLAY_REQUEST from secondary tabs
4. **Watermark Broadcasting:** Announce watermark changes
5. **Safe Mode Broadcasting:** Announce safe mode changes

### Secondary Tab Responsibilities

1. **Read-Only Mode:** No write operations (assertWriteAuthority throws)
2. **Heartbeat Monitoring:** Watch for HEARTBEAT from primary
3. **Event Replay:** Request replay if watermark gap detected
4. **Re-election:** Trigger new election if primary fails

---

## Security Model

### Secure Context Requirement

TabCoordinator requires a **secure context** (HTTPS or localhost):

```javascript
// Crypto.isSecureContext() check in shared-state.js
if (!Crypto.isSecureContext()) {
    throw new Error('TabCoordinator requires secure context (HTTPS or localhost)');
}
```

**Rationale:** Cross-tab communication via BroadcastChannel and SharedWorker is only available in secure contexts. This prevents man-in-the-middle attacks on cross-tab messages.

### Message Validation

All incoming messages are validated:
- **Structure validation:** Schema check (MESSAGE_SCHEMA)
- **Nonce freshness:** Prevent replay attacks
- **Rate limiting:** Prevent message floods
- **Vector clock validation:** Detect concurrent events

---

## Transport Layer Fallback

TabCoordinator automatically falls back from BroadcastChannel to SharedWorker:

```
Primary Transport: BroadcastChannel
     │
     ├─→ Available? → Use BroadcastChannel
     │
     └─→ Not available? → Fallback to SharedWorker
            │
            └─→ SharedWorker unavailable? → No transport (tab isolation)
```

**Fallback Behavior:**
- **BroadcastChannel:** Preferred (lower latency, no worker overhead)
- **SharedWorker:** Fallback (browser compatibility, private browsing)
- **No Transport:** Tabs operate in isolation (no cross-tab coordination)

---

## Testing Support

TabCoordinator includes test environment detection:

```javascript
// Test marker in sessionStorage
const testMarker = sessionStorage.getItem('test_simulate_primary_tab');
if (testMarker) {
    console.log('[TabCoordination] Test mode: Simulating secondary tab');
    Authority.setIsPrimaryTab(false);
    await Election.handleSecondaryModeWithWatermark();
    return false;
}
```

**Test Modes:**
- **Primary simulation:** Default (no test marker)
- **Secondary simulation:** `test_simulate_primary_tab` marker set
- **Election window extended:** 30s in tests vs 5s in production

---

## Performance Characteristics

### Memory Usage

- **Module count:** 12 modules (~50KB total)
- **Message queue:** O(n) where n = queued messages (cleared after bootstrap)
- **Watermark storage:** O(t) where t = number of tabs (typically 1-10)

### Message Throughput

- **Heartbeat rate:** 1 message/second (primary tab)
- **Message rate limits:** Defined in MESSAGE_RATE_LIMITS
- **Queue processing:** Batch processing after bootstrap window

### CPU Usage

- **Election:** O(n) where n = candidate tabs (typically 1-5)
- **Vector clock comparison:** O(1) (single integer comparison)
- **Watermark replay:** O(m) where m = events to replay (typically small)

---

## Error Handling

### Primary Tab Failure

**Detection:** Heartbeat timeout (maxMissedHeartbeats)

**Recovery:**
1. Secondary tabs detect missing heartbeat
2. Trigger re-election (new CANDIDATE messages)
3. Highest vector clock wins
4. New primary starts heartbeat

### Network Partition

**Detection:** No heartbeat + no messages

**Recovery:**
- Tabs operate independently until partition heals
- On heal: Vector clock comparison detects conflict
- Highest vector clock wins (deterministic resolution)

### Transport Failure

**Detection:** Transport error event

**Recovery:**
- Attempt fallback to SharedWorker
- If unavailable: Operate in isolation (no coordination)
- On transport available: Rejoin coordination (send CANDIDATE)

---

## API Stability

**Stability Commitment:** TabCoordinator public API is **backward compatible** through the facade pattern.

**Guarantees:**
- ✅ No breaking changes to public API methods
- ✅ Module refactoring does not affect facade
- ✅ Deprecated methods marked with `@deprecated` JSDoc
- ✅ Internal module changes are implementation details

**Facade Pattern:**
```javascript
// Public API (stable)
const TabCoordinator = {
    isPrimary,
    getTabId,
    assertWriteAuthority,
    // ... 40+ methods
};

// Internal modules (can change without breaking users)
export { Authority, Election, Heartbeat, Watermark, ... };
```

---

## Related Documentation

- **[TABCOORDINATOR-API.md](./TABCOORDINATOR-API.md)** - Complete API reference (43+ methods)
- **[TABCOORDINATOR-CYCLES.md](./TABCOORDINATOR-CYCLES.md)** - Circular dependency documentation
- **[js/services/tab-coordination/index.js](../js/services/tab-coordination/index.js)** - Facade implementation
- **[js/services/tab-coordination/constants.js](../js/services/tab-coordination/constants.js)** - Constants and schemas

---

## Module Verification

**Verification Command:**
```bash
ls js/services/tab-coordination/modules/
# Expected output: 12 .js files
```

**Actual Modules (verified 2026-01-30):**
```
authority.js         (6,294 bytes)
election.js          (6,762 bytes)
heartbeat.js         (5,100 bytes)
message-handler.js   (9,234 bytes)
message-queue.js     (2,520 bytes)
message-sender.js    (3,126 bytes)
monitoring.js        (2,202 bytes)
safe-mode.js         (3,166 bytes)
shared-state.js      (1,405 bytes)
sleep-detection.js   (1,997 bytes)
transport-creation.js (2,685 bytes)
watermark.js         (5,847 bytes)
```

**Total:** 12 modules ✓

---

**Last Updated:** 2026-01-30
**Documentation Version:** 1.0
**Status:** Complete and verified
