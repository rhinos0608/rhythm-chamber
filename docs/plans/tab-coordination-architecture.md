# TabCoordination Architecture Diagrams

## Current Architecture (Monolithic)

```
┌─────────────────────────────────────────────────────────────────┐
│                    TabCoordination (God Object)                  │
│                        2,696 lines, 100KB                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              All 8 Responsibilities Mixed Together      │    │
│  │                                                         │    │
│  │  • Leader Election                                      │    │
│  │  • Secure Messaging                                     │    │
│  │  • Heartbeat Monitoring                                  │    │
│  │  • Write Authority                                      │    │
│  │  • State Coordination                                   │    │
│  │  • Event Routing                                        │    │
│  │  • Message Validation                                   │    │
│  │  • Event Replay                                         │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                   │
│  Public API: 28 methods                                         │
│  State Variables: 40+                                            │
│  Dependencies: 8 imports, 5 dependents                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Target Architecture (Modular)

```
┌─────────────────────────────────────────────────────────────────┐
│                   TabCoordinator (Facade)                        │
│                      100-150 lines                              │
│  - Provides backward-compatible public API                       │
│  - Delegates to specialized modules                             │
│  - Coordinates module lifecycle                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌─────────────────┐   ┌────────────────┐
│LeaderElection │   │ SecureChannel   │   │ Message        │
│Protocol       │   │ Manager         │   │ Validator      │
│               │   │                 │   │                │
│• Elections    │   │• Signing        │   │• Structure     │
│• Re-election  │   │• Queuing        │   │• Rate limits   │
│• Clock skew   │   │• Replay protect │   │• Sequences     │
│               │   │• Bootstrap      │   │                │
│300 lines      │   │400 lines        │   │400 lines       │
└───────────────┘   └─────────────────┘   └────────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌─────────────────┐   ┌────────────────┐
│Heartbeat      │   │ WriteAuthority  │   │ TabState       │
│Monitor        │   │ Manager         │   │ Coordinator    │
│               │   │                 │   │                │
│• Send HB      │   │• Authority check│   │• UI state      │
│• Monitor HB   │   │• Safe mode      │   │• Warnings      │
│• Skew adjust  │   │• Notifications  │   │• Wake detect   │
│               │   │                 │   │                │
│350 lines      │   │200 lines        │   │250 lines       │
└───────────────┘   └─────────────────┘   └────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ CrossTabEventBus │
                    │                 │
                    │• Watermarks     │
                    │• Replay         │
                    │• Routing        │
                    │                 │
                    │300 lines        │
                    └─────────────────┘
```

---

## Module Interaction Flow

### Election Flow

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ Tab A (New)     │      │ Tab B (Existing)│      │ Tab C (Existing)│
└────────┬────────┘      └────────┬────────┘      └────────┬────────┘
         │                        │                        │
         │ 1. announceCandidate() │                        │
         ├───────────────────────┼───────────────────────>│
         │                        │                        │
         │ 2. collectCandidate()  │                        │
         │<──────────────────────┼───────────────────────┤
         │                        │                        │
         │ 3. resolveElection()   │                        │
         │   (deterministic:      │                        │
         │    lowest ID wins)     │                        │
         │                        │                        │
         │ 4. setPrimary(true)    │                        │
         │   [Tab A wins]         │                        │
         │                        │                        │
         │ 5. setPrimary(false)   │                        │
         ├───────────────────────┼───────────────────────>│
         │                        │                        │
         ▼                        ▼                        ▼
```

### Message Flow

```
┌─────────────────┐
│ Tab A (Sender)  │
└────────┬────────┘
         │
         │ 1. TabCoordinator.sendMessage()
         │
         ▼
┌─────────────────┐
│ SecureChannel   │
│ Manager         │
└────────┬────────┘
         │ 2. sign(message)
         │
         ▼
┌─────────────────┐
│ Message         │
│ Validator       │
└────────┬────────┘
         │ 3. validateStructure()
         │    checkRateLimit()
         │    generateNonce()
         │
         ▼
┌─────────────────┐
│ Coordination    │
│ Transport       │
└────────┬────────┘
         │ 4. postMessage(signed)
         │
         ▼
┌─────────────────────────────┐
│ BroadcastChannel/SharedWorker│
└────────┬────────────────────┘
         │
         │ 5. deliver to all tabs
         │
         ▼
┌─────────────────┐
│ Tab B (Receiver)│
└────────┬────────┘
         │
         │ 6. MessageValidator.validate()
         │
         ▼
┌─────────────────┐
│ SecureChannel   │
│ Manager         │
└────────┬────────┘
         │ 7. verifySignature()
         │    checkNonce()
         │
         ▼
┌─────────────────┐
│ Route to Handler│
│ (election/HB/   │
│  authority/etc) │
└─────────────────┘
```

### Authority Flow

```
┌─────────────────┐      ┌─────────────────┐
│ Tab A (Primary) │      │ Tab B (Secondary)│
└────────┬────────┘      └────────┬────────┘
         │                        │
         │ 1. isWriteAllowed()    │
         │   returns: true        │ 1. isWriteAllowed()
         │                        │    returns: false
         │ 2. Perform write       │
         │                        │
         │                        │ 2. assertWriteAuthority()
         │                        │    throws: WRITE_DENIED
         │                        │
         │                        │ 3. UI shows read-only
         │                        │    warning
         ▼                        ▼
```

### Heartbeat Flow

```
┌─────────────────┐                   ┌─────────────────┐
│ Tab A (Primary) │                   │ Tab B (Follower)│
└────────┬────────┘                   └────────┬────────┘
         │                                    │
         │ 1. HeartbeatMonitor.start()        │
         │    [sends HB every 3s]             │
         ├───────────────────────────────────>│
         │                                    │
         │ 2. {type: 'HEARTBEAT',              │
         │     tabId: 'Tab A',                │
         │     timestamp: 1234567890}         │
         │                                    │
         │                                    │ 3. HeartbeatMonitor.check()
         │                                    │    [every 3s]
         │                                    │
         │                                    │ 4. Update lastHeartbeatTime
         │                                    │
         │ 5. [Tab A closes]                  │
         │                                    │
         │                                    │ 6. No HB for 6s
         │                                    │
         │                                    │ 7. initiateReElection()
         │                                    │
         ▼                                    ▼
```

---

## Data Flow Diagram

### State Management

```
┌──────────────────────────────────────────────────────────┐
│                    Global State                          │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  LeaderElection:                                         │
│  • electionCandidates: Set<string>                       │
│  • receivedPrimaryClaim: boolean                         │
│  • electionAborted: boolean                              │
│                                                           │
│  SecureChannel:                                          │
│  • messageQueue: Array<Object>                           │
│  • usedNonces: Map<string, number>                       │
│                                                           │
│  HeartbeatMonitor:                                       │
│  • lastHeartbeatTime: number                             │
│  • clockSkewMs: number                                   │
│                                                           │
│  WriteAuthority:                                         │
│  • isPrimaryTab: boolean                                 │
│  • hasConcededLeadership: boolean                        │
│                                                           │
│  TabState:                                               │
│  • tabState: string                                      │
│  • lastVisibilityCheck: number                           │
│                                                           │
│  CrossTabEventBus:                                       │
│  • lastEventWatermark: number                            │
│  • knownWatermarks: Map<string, number>                  │
│                                                           │
│  MessageValidator:                                       │
│  • messageRateTracking: Map<string, Array>               │
│  • remoteSequences: Map<string, number>                  │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## Migration Timeline

```
Phase 1: Foundation           [====] 1-2 days
Phase 2: Validation          [====] 1-2 days
Phase 3: Secure Channel      [======] 2-3 days
Phase 4: Heartbeat           [======] 2-3 days
Phase 5: Write Authority     [====] 1-2 days
Phase 6: Tab State           [====] 1-2 days
Phase 7: Leader Election     [======] 2-3 days (HIGH RISK)
Phase 8: Event Bus           [====] 1-2 days
Phase 9: Facade              [====] 1-2 days
Phase 10: Cleanup            [==] 1 day

Total: 15-23 days (2-3 weeks)

Key: [=] Low risk, [==] Medium risk, [===] High risk
```

---

## Risk Matrix

```
Impact ↑
  H │   • Leader Election  │
    │                     │ • Split-Brain
  M │   • Secure Channel  │ • Performance
    │   • Heartbeat       │
  L │   • Validation      │ • Authority
    │   • Tab State       │ • Event Bus
    │                     │ • Facade
      ──────────────────────────────────────>
       L     M     H    Probability

Leader Election: High Impact, Medium Probability
Secure Channel: Medium Impact, Medium Probability
Heartbeat: Medium Impact, Low Probability
```

---

**This document provides visual aids for the detailed refactoring plan.**

For full details, see: `tab-coordination-refactoring-plan.md`
