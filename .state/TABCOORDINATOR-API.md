# TabCoordinator Public API Reference

> **Last Updated:** 2026-01-30
> **API Version:** Stable (backward compatible via facade)
> **Public Methods:** 43+ methods documented

---

## Overview

TabCoordinator exposes a **stable public API** through the facade pattern. All internal module refactoring is hidden behind the facade, ensuring backward compatibility for consumers.

**Import:**
```javascript
import { TabCoordinator } from './js/services/tab-coordination/index.js';

// Or legacy import (still works)
import { TabCoordinator } from './js/services/tab-coordination.js';
```

**Usage Pattern:**
```javascript
// Initialize during app startup
await TabCoordinator.init();

// Check authority
if (TabCoordinator.isPrimary()) {
    // This tab has write authority
    TabCoordinator.assertWriteAuthority('data write');
    // ... perform write operations
}

// Cleanup on page unload
TabCoordinator.cleanup();
```

---

## API Categories

### 1. Lifecycle Methods (3 methods)

#### `TabCoordinator.init()`

**Purpose:** Initialize TabCoordinator and perform leader election

**Returns:** `Promise<boolean>` - `true` if this tab becomes primary, `false` if secondary

**Throws:**
- `Error` - If secure context not available (HTTPS/localhost required)

**Behavior:**
1. Register event schemas with EventBus
2. Initialize transport (BroadcastChannel → SharedWorker fallback)
3. Attach message handler to transport
4. Perform leader election:
   - Send CANDIDATE message
   - Wait for election window (5s production, 30s tests)
   - Compare vector clocks
   - Determine winner
5. Start heartbeat (if primary) or heartbeat monitor (if secondary)
6. Setup monitoring (sleep detection, health metrics)
7. Process message queue

**Example:**
```javascript
const isPrimary = await TabCoordinator.init();
if (isPrimary) {
    console.log('This tab is primary - has write authority');
} else {
    console.log('This tab is secondary - read-only mode');
}
```

**Notes:**
- Must be called during app initialization
- Only call once per page load
- Test environment: Set `sessionStorage.test_simulate_primary_tab` to force secondary mode

---

#### `TabCoordinator.cleanup()`

**Purpose:** Cleanup TabCoordinator resources and release primary status

**Returns:** `void`

**Behavior:**
1. If primary: Send RELEASE_PRIMARY message to other tabs
2. Stop heartbeat broadcasting
3. Stop watermark broadcasting
4. Cleanup election state
5. Clear message queue
6. Close transport

**Example:**
```javascript
window.addEventListener('beforeunload', () => {
    TabCoordinator.cleanup();
});
```

**Notes:**
- Automatically called on page unload (recommended)
- Releases primary status so other tabs can claim it
- Should be called explicitly for clean shutdown

---

### 2. Authority Methods (6 methods)

#### `TabCoordinator.isPrimary()`

**Purpose:** Check if this tab has primary authority (write access)

**Returns:** `boolean` - `true` if primary, `false` if secondary

**Example:**
```javascript
if (TabCoordinator.isPrimary()) {
    // Safe to perform write operations
    await writeToDatabase();
} else {
    console.warn('Cannot write - this tab is not primary');
}
```

**Notes:**
- Most commonly used authority check
- Faster than `getAuthorityLevel()` for simple boolean check
- Result can change over time (listen to `authority:change` event)

---

#### `TabCoordinator.getTabId()`

**Purpose:** Get unique identifier for this tab

**Returns:** `string` - Unique tab ID (UUID format)

**Example:**
```javascript
const tabId = TabCoordinator.getTabId();
console.log(`This tab ID: ${tabId}`);
```

**Notes:**
- Generated during TabCoordinator initialization
- Unique across all tabs (including cross-origin)
- Stable for tab lifetime (doesn't change)
- Used in vector clock comparison

---

#### `TabCoordinator.isWriteAllowed()`

**Purpose:** Alias for `isPrimary()` - check write permission

**Returns:** `boolean` - `true` if write operations allowed

**Example:**
```javascript
if (TabCoordinator.isWriteAllowed()) {
    await saveUserData();
}
```

**Notes:**
- Provided for semantic clarity (vs generic `isPrimary()`)
- Internally calls `Authority.getIsPrimaryTab()`

---

#### `TabCoordinator.assertWriteAuthority(operation)`

**Purpose:** Assert write authority, throw if not primary

**Parameters:**
- `operation` (string, optional) - Description of operation for error message

**Returns:** `void`

**Throws:**
- `Error` - If tab is not primary (write authority denied)
  - `error.code`: `'WRITE_AUTHORITY_DENIED'`
  - `error.isSecondaryTab`: `true`
  - `error.suggestion`: Helpful message for user

**Example:**
```javascript
try {
    TabCoordinator.assertWriteAuthority('save user settings');
    await saveSettings();
} catch (error) {
    if (error.code === 'WRITE_AUTHORITY_DENIED') {
        showNotification(error.suggestion);
    }
}
```

**Error Properties:**
```javascript
{
    code: 'WRITE_AUTHORITY_DENIED',
    isSecondaryTab: true,
    suggestion: 'Close other tabs or refresh this page to become primary'
}
```

**Notes:**
- Use before critical write operations
- Provides clear error messages to users
- Common pattern: "try assert, catch, show user-friendly message"

---

#### `TabCoordinator.getAuthorityLevel()`

**Purpose:** Get detailed authority level (not just boolean)

**Returns:** `'PRIMARY' | 'SECONDARY' | 'UNKNOWN'`

**Example:**
```javascript
const level = TabCoordinator.getAuthorityLevel();
switch (level) {
    case 'PRIMARY':
        console.log('This tab is primary');
        break;
    case 'SECONDARY':
        console.log('This tab is secondary');
        break;
    case 'UNKNOWN':
        console.log('Authority not yet determined');
        break;
}
```

**Notes:**
- More detailed than `isPrimary()` (handles UNKNOWN state)
- Useful for debugging or status displays
- Can be 'UNKNOWN' during election window

---

#### `TabCoordinator.onAuthorityChange(callback)`

**Purpose:** Subscribe to authority change events

**Parameters:**
- `callback` (function) - Called when authority changes
  - Parameters: `(newLevel, oldLevel)`
  - `newLevel`: `'PRIMARY' | 'SECONDARY' | 'UNKNOWN'`
  - `oldLevel`: Previous authority level

**Returns:** `void`

**Example:**
```javascript
TabCoordinator.onAuthorityChange((newLevel, oldLevel) => {
    console.log(`Authority changed: ${oldLevel} → ${newLevel}`);
    if (newLevel === 'PRIMARY') {
        enableWriteUI();
    } else {
        disableWriteUI();
    }
});
```

**Notes:**
- Use for reactive UI updates (enable/disable write buttons)
- Emits via EventBus internally
- Multiple callbacks supported (all called on change)

---

### 3. Timing Methods (2 methods)

#### `TabCoordinator.configureTiming(config)`

**Purpose:** Configure timing parameters for testing/tuning

**Parameters:**
- `config` (object) - Timing configuration
  - `electionWindowMs` (number) - Leader election window duration
  - `heartbeatIntervalMs` (number) - Heartbeat send interval
  - `maxMissedHeartbeats` (number) - Max missed heartbeats before failover

**Returns:** `void`

**Example:**
```javascript
// For testing: Use longer windows
TabCoordinator.configureTiming({
    electionWindowMs: 10000,
    heartbeatIntervalMs: 2000,
    maxMissedHeartbeats: 5
});
```

**Notes:**
- Only call before `TabCoordinator.init()`
-主要用于测试环境
- Production defaults: 5000ms election, 1000ms heartbeat, 3 missed

---

#### `TabCoordinator.getTimingConfig()`

**Purpose:** Get current timing configuration

**Returns:** Clone of `TimingConfig` object

**Example:**
```javascript
const config = TabCoordinator.getTimingConfig();
console.log(`Election window: ${config.electionWindowMs}ms`);
```

**Notes:**
- Returns cloned object (safe to modify without affecting internals)
- Useful for debugging timing issues

---

### 4. Device Detection Methods (5 methods)

#### `TabCoordinator.getClockSkew()`

**Purpose:** Get clock skew from other tabs (deprecated, returns 0)

**Returns:** `number` - Always returns `0`

**Notes:**
- **Deprecated:** Clock skew tracking removed in refactoring
- Kept for backward compatibility
- Returns `0` (no skew compensation)

---

#### `TabCoordinator.getClockSkewHistory()`

**Purpose:** Get clock skew history (deprecated, returns empty array)

**Returns:** `Array` - Always returns `[]`

**Notes:**
- **Deprecated:** Clock skew tracking removed
- Kept for backward compatibility

---

#### `TabCoordinator.resetClockSkewTracking()`

**Purpose:** Reset clock skew tracking (deprecated, no-op)

**Returns:** `void`

**Notes:**
- **Deprecated:** No-op method
- Kept for backward compatibility

---

#### `TabCoordinator.getAdaptiveTiming()`

**Purpose:** Get adaptive timing info (deprecated, returns null)

**Returns:** `null`

**Notes:**
- **Deprecated:** Adaptive timing removed
- Kept for backward compatibility

---

#### `TabCoordinator.getDeviceInfo()`

**Purpose:** Get device information (delegated to DeviceDetection)

**Returns:** Device info object

**Example:**
```javascript
const deviceInfo = TabCoordinator.getDeviceInfo();
console.log(deviceInfo);
// { hardwareConcurrency: 8, memory: 16, ... }
```

---

#### `TabCoordinator.getNetworkState()`

**Purpose:** Get network state (delegated to DeviceDetection)

**Returns:** Network state object

**Example:**
```javascript
const networkState = TabCoordinator.getNetworkState();
console.log(networkState);
// { effectiveType: '4g', rtt: 100, downlink: 10 }
```

---

#### `TabCoordinator.getHeartbeatQualityStats()`

**Purpose:** Get heartbeat quality statistics

**Returns:** Heartbeat quality metrics object

**Example:**
```javascript
const stats = TabCoordinator.getHeartbeatQualityStats();
console.log(stats);
// { missedHeartbeats: 0, averageLatency: 50, ... }
```

---

### 5. Vector Clock Methods (3 methods)

#### `TabCoordinator.getVectorClock()`

**Purpose:** Get current vector clock value

**Returns:** `number` - Current vector clock (integer)

**Example:**
```javascript
const clock = TabCoordinator.getVectorClock();
console.log(`Vector clock: ${clock}`);
```

**Notes:**
- Monotonically increasing integer
- Used for conflict resolution in leader election
- Incremented on each event

---

#### `TabCoordinator.getVectorClockState()`

**Purpose:** Get vector clock as JSON-serializable object

**Returns:** Object with vector clock state

**Example:**
```javascript
const state = TabCoordinator.getVectorClockState();
console.log(JSON.stringify(state));
```

---

#### `TabCoordinator.isConflict(remoteClock)`

**Purpose:** Check if remote vector clock is concurrent (conflict)

**Parameters:**
- `remoteClock` (number) - Remote vector clock value

**Returns:** `boolean` - `true` if concurrent, `false` if one is newer

**Example:**
```javascript
const localClock = TabCoordinator.getVectorClock();
const remoteClock = getRemoteClockFromMessage();
if (TabCoordinator.isConflict(remoteClock)) {
    console.warn('Concurrent events detected - using conflict resolution');
}
```

**Notes:**
- Used in leader election to compare candidate tabs
- Higher vector clock wins (deterministic conflict resolution)

---

### 6. Watermark & Replay Methods (6 methods)

#### `TabCoordinator.updateEventWatermark(id)`

**Purpose:** Update event watermark after writing event

**Parameters:**
- `id` (string) - Event ID to set as watermark

**Returns:** `Promise<void>`

**Example:**
```javascript
await writeEventToDatabase(eventId);
await TabCoordinator.updateEventWatermark(eventId);
```

**Notes:**
- Should be called after each write operation
- Broadcasts watermark to other tabs
- Enables replay detection for secondary tabs

---

#### `TabCoordinator.getEventWatermark()`

**Purpose:** Get current event watermark

**Returns:** `string` - Current watermark ID (or `null` if none)

**Example:**
```javascript
const watermark = TabCoordinator.getEventWatermark();
console.log(`Current watermark: ${watermark}`);
```

**Notes:**
- `null` if no events written yet
- Used to detect if replay is needed

---

#### `TabCoordinator.getKnownWatermarks()`

**Purpose:** Get all known watermarks from all tabs

**Returns:** Object mapping tab IDs to watermark values

**Example:**
```javascript
const watermarks = TabCoordinator.getKnownWatermarks();
console.log(watermarks);
// { tab1: 'event-123', tab2: 'event-124', ... }
```

**Notes:**
- Used for debugging cross-tab state
- Useful for detecting watermark gaps

---

#### `TabCoordinator.requestEventReplay(fromId)`

**Purpose:** Request event replay from primary tab

**Parameters:**
- `fromId` (string) - Event ID to start replay from

**Returns:** `Promise<void>`

**Example:**
```javascript
// Secondary tab detected watermark gap
const localWatermark = TabCoordinator.getEventWatermark();
const primaryWatermark = getPrimaryWatermark();
if (localWatermark !== primaryWatermark) {
    await TabCoordinator.requestEventReplay(localWatermark);
}
```

**Notes:**
- Only works if this tab is secondary
- Primary tab receives request and replays events
- Secondary tab updates its watermark after replay

---

#### `TabCoordinator.needsReplay()`

**Purpose:** Check if event replay is needed

**Returns:** `boolean` - `true` if watermark gap detected

**Example:**
```javascript
if (TabCoordinator.needsReplay()) {
    console.log('Watermark gap detected - requesting replay');
    await TabCoordinator.autoReplayIfNeeded();
}
```

**Notes:**
- Compares local watermark to primary watermark
- Returns `false` if this tab is primary

---

#### `TabCoordinator.autoReplayIfNeeded()`

**Purpose:** Automatically request replay if needed

**Returns:** `Promise<void>`

**Example:**
```javascript
// Call after becoming secondary (e.g., after authority change)
await TabCoordinator.autoReplayIfNeeded();
```

**Notes:**
- Idempotent: Safe to call multiple times
- No-op if no replay needed or if primary

---

### 7. Safe Mode Methods (1 method)

#### `TabCoordinator.broadcastSafeModeChange(isSafeMode)`

**Purpose:** Broadcast safe mode state change to all tabs

**Parameters:**
- `isSafeMode` (boolean) - New safe mode state

**Returns:** `void`

**Example:**
```javascript
// Emergency: Enable safe mode due to data corruption
TabCoordinator.broadcastSafeModeChange(true);

// Later: Recovery complete, disable safe mode
TabCoordinator.broadcastSafeModeChange(false);
```

**Notes:**
- All tabs receive SAFE_MODE message
- Used for emergency read-only mode
- Typically triggered by error detection systems

---

### 8. Message Guard Methods (5 methods)

#### `TabCoordinator.getOutOfOrderCount()`

**Purpose:** Get count of out-of-order messages received

**Returns:** `number` - Out-of-order message count

**Example:**
```javascript
const count = TabCoordinator.getOutOfOrderCount();
if (count > 10) {
    console.warn(`High out-of-order count: ${count}`);
}
```

**Notes:**
- Incremented when message arrives with stale sequence number
- Useful for detecting network issues

---

#### `TabCoordinator.resetOutOfOrderCount()`

**Purpose:** Reset out-of-order message counter

**Returns:** `void`

**Example:**
```javascript
TabCoordinator.resetOutOfOrderCount();
```

**Notes:**
- Useful for testing or periodic monitoring

---

#### `TabCoordinator.pruneStaleRemoteSequences()`

**Purpose:** Remove stale remote sequence tracking entries

**Returns:** `void`

**Parameters:** Uses `debugMode` flag from shared state

**Example:**
```javascript
TabCoordinator.pruneStaleRemoteSequences();
```

**Notes:**
- Called periodically to prevent memory leaks
- Only prunes if debug mode is enabled

---

#### `TabCoordinator.getRemoteSequenceCount()`

**Purpose:** Get count of tracked remote sequences

**Returns:** `number` - Remote sequence count

**Example:**
```javascript
const count = TabCoordinator.getRemoteSequenceCount();
console.log(`Tracking ${count} remote sequences`);
```

---

#### `TabCoordinator.getRateTracking()`

**Purpose:** Get message rate tracking data

**Returns:** Object with rate tracking info

**Example:**
```javascript
const tracking = TabCoordinator.getRateTracking();
console.log(tracking);
// { MESSAGE_TYPE: { count: 10, lastSent: timestamp }, ... }
```

---

### 9. Message Queue Methods (3 methods)

#### `TabCoordinator.getQueueSize()`

**Purpose:** Get current message queue size

**Returns:** `number` - Number of queued messages

**Example:**
```javascript
const size = TabCoordinator.getQueueSize();
console.log(`Queued messages: ${size}`);
```

**Notes:**
- Messages queued during bootstrap window
- Queue cleared after initialization

---

#### `TabCoordinator.getQueueInfo()`

**Purpose:** Get detailed message queue information

**Returns:** Object with queue details

**Example:**
```javascript
const info = TabCoordinator.getQueueInfo();
console.log(info);
// { size: 5, messages: [...], isKeySessionActive: true }
```

---

#### `TabCoordinator.processQueue()`

**Purpose:** Manually process message queue (usually automatic)

**Returns:** `Promise<void>`

**Example:**
```javascript
await TabCoordinator.processQueue();
```

**Notes:**
- Called automatically after initialization
- Manual call only needed for testing

---

### 10. Transport Methods (2 methods)

#### `TabCoordinator.getTransportType()`

**Purpose:** Get current transport type

**Returns:** `'broadcastchannel' | 'sharedworker' | 'none'`

**Example:**
```javascript
const transport = TabCoordinator.getTransportType();
console.log(`Using transport: ${transport}`);
```

**Notes:**
- `'broadcastchannel'` - Preferred (low latency)
- `'sharedworker'` - Fallback (private browsing, browser compatibility)
- `'none'` - No transport available (tab isolation)

---

#### `TabCoordinator.isUsingFallback()`

**Purpose:** Check if using fallback transport (SharedWorker)

**Returns:** `boolean` - `true` if using SharedWorker fallback

**Example:**
```javascript
if (TabCoordinator.isUsingFallback()) {
    console.warn('Using SharedWorker fallback - BroadcastChannel unavailable');
}
```

---

### 11. Message Validation Methods (3 methods)

#### `TabCoordinator.validateMessageStructure(message)`

**Purpose:** Validate message structure against schema

**Parameters:**
- `message` (object) - Message to validate

**Returns:** `boolean` - `true` if valid, `false` if invalid

**Example:**
```javascript
const message = { type: 'HEARTBEAT', tabId: '...' };
if (!TabCoordinator.validateMessageStructure(message)) {
    console.error('Invalid message structure');
    return;
}
```

---

#### `TabCoordinator.MESSAGE_SCHEMA`

**Purpose:** Message schema constant for validation

**Type:** Object (JSON schema)

**Example:**
```javascript
const schema = TabCoordinator.MESSAGE_SCHEMA;
// Use with validation libraries
```

---

#### `TabCoordinator.MESSAGE_TYPES`

**Purpose:** Message type constants

**Type:** Object with string values

**Values:**
- `CANDIDATE` - Candidate message during election
- `CLAIM_PRIMARY` - Claim primary status
- `RELEASE_PRIMARY` - Release primary status
- `HEARTBEAT` - Heartbeat from primary
- `WATERMARK` - Watermark update
- `REPLAY_REQUEST` - Request event replay
- `REPLAY_RESPONSE` - Replay data from primary
- `SAFE_MODE` - Safe mode broadcast

**Example:**
```javascript
const message = {
    type: TabCoordinator.MESSAGE_TYPES.HEARTBEAT,
    tabId: TabCoordinator.getTabId()
};
```

---

#### `TabCoordinator.getMessageRateLimit(type)`

**Purpose:** Get rate limit for message type

**Parameters:**
- `type` (string) - Message type

**Returns:** `number` - Max messages per second (or `undefined` if no limit)

**Example:**
```javascript
const limit = TabCoordinator.getMessageRateLimit('HEARTBEAT');
console.log(`Heartbeat rate limit: ${limit}/sec`);
```

---

### 12. Internal/Test Methods (2 methods)

#### `TabCoordinator._startHeartbeat()`

**Purpose:** **INTERNAL/TEST ONLY** - Start heartbeat broadcasting

**Returns:** `void`

**Notes:**
- Only for testing
- Do not use in production code
- Normally called automatically after election

---

#### `TabCoordinator._stopHeartbeat()`

**Purpose:** **INTERNAL/TEST ONLY** - Stop heartbeat broadcasting

**Returns:** `void`

**Notes:**
- Only for testing
- Do not use in production code

---

### 13. Standalone Exports (2 methods)

#### `debugMode` (export)

**Purpose:** Debug mode flag (shared across modules)

**Type:** `boolean` (writable)

**Example:**
```javascript
import { debugMode } from './js/services/tab-coordination/index.js';
debugMode = true; // Enable debug logging
```

**Notes:**
- Affects all TabCoordinator modules
- Useful for troubleshooting

---

#### `isKeySessionActive()` (export)

**Purpose:** Check if key session is active

**Returns:** `boolean`

**Example:**
```javascript
import { isKeySessionActive } from './js/services/tab-coordination/index.js';
if (isKeySessionActive()) {
    console.log('Key session active - enhanced security');
}
```

---

## Usage Patterns

### Pattern 1: Write Guard

```javascript
async function writeData(data) {
    TabCoordinator.assertWriteAuthority('write user data');
    await database.write(data);
}
```

### Pattern 2: Authority Change Listener

```javascript
TabCoordinator.onAuthorityChange((newLevel) => {
    updateUIForAuthority(newLevel);
});

function updateUIForAuthority(level) {
    const writeButton = document.getElementById('write-btn');
    writeButton.disabled = (level !== 'PRIMARY');
}
```

### Pattern 3: Event Replay (Secondary Tab)

```javascript
TabCoordinator.onAuthorityChange(async (newLevel) => {
    if (newLevel === 'SECONDARY') {
        await TabCoordinator.autoReplayIfNeeded();
    }
});
```

### Pattern 4: Cleanup

```javascript
// App initialization
await TabCoordinator.init();

// App shutdown
window.addEventListener('beforeunload', () => {
    TabCoordinator.cleanup();
});
```

---

## Type Definitions

```typescript
interface TabCoordinator {
    // Lifecycle
    init(): Promise<boolean>;
    cleanup(): void;

    // Authority
    isPrimary(): boolean;
    getTabId(): string;
    isWriteAllowed(): boolean;
    assertWriteAuthority(operation?: string): void;
    getAuthorityLevel(): 'PRIMARY' | 'SECONDARY' | 'UNKNOWN';
    onAuthorityChange(callback: (newLevel, oldLevel) => void): void;

    // Timing
    configureTiming(config: TimingConfig): void;
    getTimingConfig(): TimingConfig;

    // Device Detection
    getClockSkew(): number;
    getClockSkewHistory(): Array<number>;
    resetClockSkewTracking(): void;
    getAdaptiveTiming(): object | null;
    getDeviceInfo(): DeviceInfo;
    getNetworkState(): NetworkState;
    getHeartbeatQualityStats(): HeartbeatStats;

    // Vector Clock
    getVectorClock(): number;
    getVectorClockState(): object;
    isConflict(remoteClock: number): boolean;

    // Watermark & Replay
    updateEventWatermark(id: string): Promise<void>;
    getEventWatermark(): string | null;
    getKnownWatermarks(): Record<string, string>;
    requestEventReplay(fromId: string): Promise<void>;
    needsReplay(): boolean;
    autoReplayIfNeeded(): Promise<void>;

    // Safe Mode
    broadcastSafeModeChange(isSafeMode: boolean): void;

    // Message Guards
    getOutOfOrderCount(): number;
    resetOutOfOrderCount(): void;
    pruneStaleRemoteSequences(): void;
    getRemoteSequenceCount(): number;
    getRateTracking(): RateTracking;

    // Message Queue
    getQueueSize(): number;
    getQueueInfo(): QueueInfo;
    processQueue(): Promise<void>;

    // Transport
    getTransportType(): 'broadcastchannel' | 'sharedworker' | 'none';
    isUsingFallback(): boolean;

    // Message Validation
    validateMessageStructure(message: object): boolean;
    MESSAGE_SCHEMA: object;
    MESSAGE_TYPES: MessageTypes;
    getMessageRateLimit(type: string): number | undefined;

    // Internal/Test
    _startHeartbeat(): void;
    _stopHeartbeat(): void;
}
```

---

## Event Bus Integration

TabCoordinator emits typed events via EventBus:

### Authority Events

- `authority:change` - Fired when authority level changes
  - `{ level: 'PRIMARY' | 'SECONDARY' | 'UNKNOWN', previousLevel: string }`

### Watermark Events

- `watermark:update` - Fired when watermark updated
  - `{ watermarkId: string, tabId: string }`

### Message Events

- `message:received` - Fired when message received
  - `{ type: string, message: object }`

- `message:out-of-order` - Fired when out-of-order message detected
  - `{ message: object, expectedSequence: number, actualSequence: number }`

---

## Error Handling

All methods that throw errors use standard Error objects with additional properties:

```javascript
try {
    TabCoordinator.assertWriteAuthority('operation');
} catch (error) {
    console.error(error.code);        // 'WRITE_AUTHORITY_DENIED'
    console.error(error.message);     // User-friendly message
    console.error(error.suggestion);  // Actionable suggestion
}
```

---

## Constants

### MESSAGE_TYPES

```javascript
{
    CANDIDATE: 'CANDIDATE',
    CLAIM_PRIMARY: 'CLAIM_PRIMARY',
    RELEASE_PRIMARY: 'RELEASE_PRIMARY',
    HEARTBEAT: 'HEARTBEAT',
    WATERMARK: 'WATERMARK',
    REPLAY_REQUEST: 'REPLAY_REQUEST',
    REPLAY_RESPONSE: 'REPLAY_RESPONSE',
    SAFE_MODE: 'SAFE_MODE'
}
```

### MESSAGE_RATE_LIMITS

```javascript
{
    HEARTBEAT: 1,        // 1 per second
    WATERMARK: 10,       // 10 per second
    REPLAY_REQUEST: 2    // 2 per second
}
```

---

## Related Documentation

- **[TABCOORDINATOR-ARCHITECTURE.md](./TABCOORDINATOR-ARCHITECTURE.md)** - Architecture overview and module descriptions
- **[TABCOORDINATOR-CYCLES.md](./TABCOORDINATOR-CYCLES.md)** - Circular dependency documentation
- **[js/services/tab-coordination/index.js](../js/services/tab-coordination/index.js)** - Facade implementation

---

**Last Updated:** 2026-01-30
**API Version:** 1.0 (Stable)
**Public Methods Count:** 43+
**Backward Compatibility:** Guaranteed via facade pattern
