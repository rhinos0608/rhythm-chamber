# Service Catalog

> **Auto-generated** by docs-sync tool
> **Generated:** 2026-01-30T15:13:37.966Z
> **Total Services:** 94

This catalog provides detailed information about all business logic services in the application.

## Overview

Services encapsulate business logic and data processing. They follow the HNW architecture pattern and communicate via the EventBus.

## Services

### Adaptive Circuit Breaker

**File:** `js/services/adaptive-circuit-breaker.js`

**Lines:** 513

**Named Exports:** 11

**Default Exports:** 1

**Functions:** 12

**Dependencies:**

- `js/services/event-bus.js`
- `js/services/timeout-error.js`

---

### Battery Aware Mode Selector

**File:** `js/services/battery-aware-mode-selector.js`

**Lines:** 330

**Named Exports:** 1

**Functions:** 7

**Dependencies:**

- `js/services/event-bus.js`

---

### Cascading Abort Controller

**File:** `js/services/cascading-abort-controller.js`

**Lines:** 409

**Named Exports:** 2

**Classes:** 2

**Functions:** 8

---

### Circuit Breaker

**File:** `js/services/circuit-breaker.js`

**Lines:** 314

**Named Exports:** 1

**Functions:** 10

**Dependencies:**

- `js/services/timeout-error.js`

---

### Config Loader

**File:** `js/services/config-loader.js`

**Lines:** 892

**Named Exports:** 1

**Functions:** 19

**Dependencies:**

- `js/utils/logger.js`

---

### Conversation Orchestrator

**File:** `js/services/conversation-orchestrator.js`

**Lines:** 287

**Named Exports:** 1

**Functions:** 9

**Dependencies:**

- `js/token-counter.js`
- `js/utils.js`

---

### Data Version

**File:** `js/services/data-version.js`

**Lines:** 224

**Named Exports:** 1

**Functions:** 6

**Dependencies:**

- `js/contracts/version-source.js`
- `js/state/app-state.js`

---

### Device Detection

**File:** `js/services/device-detection.js`

**Lines:** 736

**Named Exports:** 1

**Default Exports:** 1

**Functions:** 21

---

### Error Boundary

**File:** `js/services/error-boundary.js`

**Lines:** 582

**Named Exports:** 4

**Default Exports:** 1

**Classes:** 1

**Functions:** 4

**Dependencies:**

- `js/utils/html-escape.js`

---

### Error Recovery Coordinator

**File:** `js/services/error-recovery-coordinator.js`

**Lines:** 172

**Named Exports:** 7

**Classes:** 1

**Functions:** 3

**Dependencies:**

- `js/services/error-recovery/index.js`
- `js/services/event-bus.js`

---

### Constants

**File:** `js/services/error-recovery/constants.js`

**Lines:** 58

**Named Exports:** 5

**Dependencies:**

- `js/constants/priorities.js`
- `js/constants/api.js`
- `js/constants/limits.js`

---

### Index

**File:** `js/services/error-recovery/index.js`

**Lines:** 189

**Named Exports:** 9

**Functions:** 6

**Dependencies:**

- `js/services/error-recovery/recovery-strategies.js`
- `js/services/error-recovery/recovery-orchestration.js`
- `js/services/error-recovery/recovery-lock-manager.js`
- `js/services/error-recovery/constants.js`

---

### Recovery Lock Manager

**File:** `js/services/error-recovery/recovery-lock-manager.js`

**Lines:** 328

**Named Exports:** 1

**Classes:** 1

---

### Recovery Orchestration

**File:** `js/services/error-recovery/recovery-orchestration.js`

**Lines:** 487

**Named Exports:** 5

**Classes:** 1

**Functions:** 4

**Dependencies:**

- `js/services/error-recovery/constants.js`

---

### Recovery Strategies

**File:** `js/services/error-recovery/recovery-strategies.js`

**Lines:** 230

**Named Exports:** 1

**Classes:** 1

**Dependencies:**

- `js/services/error-recovery/constants.js`

---

### Event Bus

**File:** `js/services/event-bus.js`

**Lines:** 2

**Named Exports:** 1

---

### Index

**File:** `js/services/event-bus/index.js`

**Lines:** 550

**Named Exports:** 1

**Functions:** 31

**Dependencies:**

- `js/services/wave-telemetry.js`
- `js/storage/event-log-store.js`

---

### Fallback Response Service

**File:** `js/services/fallback-response-service.js`

**Lines:** 166

**Named Exports:** 1

**Functions:** 3

**Dependencies:**

- `js/settings.js`

---

### Config

**File:** `js/services/fallback/config.js`

**Lines:** 94

**Named Exports:** 4

**Functions:** 1

**Dependencies:**

- `js/services/provider-health-authority.js`

---

### Execution

**File:** `js/services/fallback/execution.js`

**Lines:** 265

**Named Exports:** 1

**Functions:** 3

**Dependencies:**

- `js/services/provider-health-authority.js`
- `js/providers/provider-interface.js`
- `js/services/fallback/priority.js`
- `js/services/fallback/health.js`
- `js/services/fallback/fallback-response.js`

---

### Fallback Response

**File:** `js/services/fallback/fallback-response.js`

**Lines:** 48

**Named Exports:** 1

**Functions:** 2

---

### Health

**File:** `js/services/fallback/health.js`

**Lines:** 186

**Named Exports:** 9

**Functions:** 9

**Dependencies:**

- `js/services/provider-health-authority.js`

---

### Index

**File:** `js/services/fallback/index.js`

**Lines:** 350

**Named Exports:** 3

**Default Exports:** 1

**Classes:** 1

**Dependencies:**

- `js/services/event-bus.js`
- `js/services/fallback/config.js`
- `js/services/fallback/health.js`
- `js/services/fallback/priority.js`
- `js/services/fallback/execution.js`

---

### Priority

**File:** `js/services/fallback/priority.js`

**Lines:** 111

**Named Exports:** 1

**Functions:** 1

**Dependencies:**

- `js/services/provider-health-authority.js`

---

### Function Calling Fallback

**File:** `js/services/function-calling-fallback.js`

**Lines:** 629

**Named Exports:** 12

**Functions:** 10

**Dependencies:**

- `js/functions/index.js`

---

### Lamport Clock

**File:** `js/services/lamport-clock.js`

**Lines:** 204

**Named Exports:** 1

**Functions:** 13

---

### Lemon Squeezy Service

**File:** `js/services/lemon-squeezy-service.js`

**Lines:** 913

**Named Exports:** 1

**Functions:** 19

**Dependencies:**

- `js/services/config-loader.js`
- `js/utils/logger.js`
- `js/security/license-verifier.js`

---

### License Service

**File:** `js/services/license-service.js`

**Lines:** 548

**Named Exports:** 1

**Functions:** 15

**Dependencies:**

- `js/services/config-loader.js`
- `js/utils/logger.js`

---

### Llm Api Orchestrator

**File:** `js/services/llm-api-orchestrator.js`

**Lines:** 309

**Named Exports:** 1

**Functions:** 11

**Dependencies:**

- `js/services/timeout-error.js`

---

### Llm Provider Routing Service

**File:** `js/services/llm-provider-routing-service.js`

**Lines:** 141

**Named Exports:** 1

**Functions:** 3

---

### Lock Policy Coordinator

**File:** `js/services/lock-policy-coordinator.js`

**Lines:** 430

**Named Exports:** 1

**Functions:** 14

**Dependencies:**

- `js/operation-lock.js`

---

### Message Error Handler

**File:** `js/services/message-error-handler.js`

**Lines:** 216

**Named Exports:** 1

**Functions:** 7

---

### Message Lifecycle Coordinator

**File:** `js/services/message-lifecycle-coordinator.js`

**Lines:** 752

**Named Exports:** 1

**Functions:** 13

**Dependencies:**

- `js/services/turn-queue.js`
- `js/services/timeout-budget-manager.js`
- `js/services/event-bus.js`
- `js/services/message-validator.js`
- `js/services/message-error-handler.js`
- `js/services/llm-api-orchestrator.js`
- `js/services/stream-processor.js`
- `js/services/error-boundary.js`

---

### Message Operations

**File:** `js/services/message-operations.js`

**Lines:** 498

**Named Exports:** 1

**Functions:** 14

**Dependencies:**

- `js/settings.js`
- `js/services/data-version.js`

---

### Message Validator

**File:** `js/services/message-validator.js`

**Lines:** 402

**Named Exports:** 1

**Classes:** 1

**Functions:** 9

---

### Pattern Comparison

**File:** `js/services/pattern-comparison.js`

**Lines:** 363

**Named Exports:** 1

**Functions:** 9

**Dependencies:**

- `js/services/event-bus.js`

---

### Pattern Stream

**File:** `js/services/pattern-stream.js`

**Lines:** 288

**Named Exports:** 1

**Functions:** 8

**Dependencies:**

- `js/services/event-bus.js`
- `js/patterns.js`

---

### Performance Profiler

**File:** `js/services/performance-profiler.js`

**Lines:** 1023

**Named Exports:** 7

**Default Exports:** 1

**Classes:** 1

---

### Playlist Generator

**File:** `js/services/playlist-generator.js`

**Lines:** 409

**Named Exports:** 1

**Functions:** 7

**Dependencies:**

- `js/services/event-bus.js`
- `js/spotify.js`

---

### Playlist Service

**File:** `js/services/playlist-service.js`

**Lines:** 181

**Named Exports:** 1

**Functions:** 3

**Dependencies:**

- `js/services/playlist-generator.js`
- `js/services/premium-gatekeeper.js`
- `js/services/premium-quota.js`
- `js/utils/logger.js`

---

### Premium Gatekeeper

**File:** `js/services/premium-gatekeeper.js`

**Lines:** 152

**Named Exports:** 1

**Functions:** 3

**Dependencies:**

- `js/services/license-service.js`
- `js/services/premium-quota.js`
- `js/utils/logger.js`

---

### Premium Quota

**File:** `js/services/premium-quota.js`

**Lines:** 335

**Named Exports:** 1

**Functions:** 11

**Dependencies:**

- `js/services/config-loader.js`
- `js/utils/logger.js`

---

### Profile Description Generator

**File:** `js/services/profile-description-generator.js`

**Lines:** 265

**Named Exports:** 1

**Functions:** 4

**Dependencies:**

- `js/services/config-loader.js`
- `js/settings.js`
- `js/providers/provider-interface.js`

---

### Profile Sharing

**File:** `js/services/profile-sharing.js`

**Lines:** 335

**Named Exports:** 1

**Functions:** 10

**Dependencies:**

- `js/services/event-bus.js`
- `js/providers/data-provider-interface.js`
- `js/storage.js`

---

### Provider Circuit Breaker

**File:** `js/services/provider-circuit-breaker.js`

**Lines:** 428

**Named Exports:** 1

**Functions:** 13

---

### Provider Fallback Chain

**File:** `js/services/provider-fallback-chain.js`

**Lines:** 26

**Named Exports:** 5

---

### Provider Health Authority

**File:** `js/services/provider-health-authority.js`

**Lines:** 908

**Named Exports:** 24

**Functions:** 28

**Dependencies:**

- `js/services/event-bus.js`

---

### Provider Health Monitor

**File:** `js/services/provider-health-monitor.js`

**Lines:** 563

**Named Exports:** 3

**Default Exports:** 1

**Classes:** 1

**Functions:** 2

**Dependencies:**

- `js/services/event-bus.js`
- `js/services/provider-health-authority.js`
- `js/services/timeout-error.js`

---

### Provider Notification Service

**File:** `js/services/provider-notification-service.js`

**Lines:** 512

**Named Exports:** 3

**Default Exports:** 1

**Classes:** 1

**Dependencies:**

- `js/services/event-bus.js`
- `js/settings.js`

---

### Session Lock Manager

**File:** `js/services/session-lock-manager.js`

**Lines:** 324

**Named Exports:** 1

**Default Exports:** 1

**Classes:** 1

**Dependencies:**

- `js/utils/concurrency/mutex.js`

---

### Session Manager

**File:** `js/services/session-manager.js`

**Lines:** 538

**Named Exports:** 6

**Classes:** 1

**Functions:** 4

**Dependencies:**

- `js/services/session-manager/index.js`
- `js/services/event-bus.js`
- `js/services/session-manager/session-lifecycle.js`

---

### Index

**File:** `js/services/session-manager/index.js`

**Lines:** 427

**Named Exports:** 13

**Functions:** 10

**Dependencies:**

- `js/services/session-manager/session-state.js`
- `js/services/session-manager/session-lifecycle.js`
- `js/services/session-manager/session-persistence.js`
- `js/storage.js`
- `js/services/error-boundary.js`

---

### Session Lifecycle

**File:** `js/services/session-manager/session-lifecycle.js`

**Lines:** 611

**Named Exports:** 15

**Functions:** 18

**Dependencies:**

- `js/services/event-bus.js`
- `js/storage.js`
- `js/storage/keys.js`
- `js/services/session-lock-manager.js`
- `js/state/app-state.js`
- `js/services/session-manager/session-persistence.js`

---

### Session Persistence

**File:** `js/services/session-manager/session-persistence.js`

**Lines:** 281

**Named Exports:** 7

**Functions:** 9

**Dependencies:**

- `js/services/session-manager/session-state.js`
- `js/storage.js`
- `js/state/app-state.js`
- `js/services/event-bus.js`

---

### Session State

**File:** `js/services/session-manager/session-state.js`

**Lines:** 409

**Named Exports:** 16

**Functions:** 17

**Dependencies:**

- `js/services/data-version.js`
- `js/state/app-state.js`
- `js/utils/concurrency/mutex.js`
- `js/constants/session.js`

---

### State Machine Coordinator

**File:** `js/services/state-machine-coordinator.js`

**Lines:** 424

**Named Exports:** 1

**Functions:** 10

---

### Storage Degradation Manager

**File:** `js/services/storage-degradation-manager.js`

**Lines:** 198

**Named Exports:** 3

**Default Exports:** 1

**Classes:** 1

**Dependencies:**

- `js/services/storage-degradation/index.js`

---

### Cleanup Strategies

**File:** `js/services/storage-degradation/cleanup-strategies.js`

**Lines:** 608

**Named Exports:** 2

**Classes:** 1

**Dependencies:**

- `js/storage.js`
- `js/services/storage-degradation/degradation-detector.js`

---

### Degradation Detector

**File:** `js/services/storage-degradation/degradation-detector.js`

**Lines:** 296

**Named Exports:** 2

**Classes:** 1

---

### Index

**File:** `js/services/storage-degradation/index.js`

**Lines:** 423

**Named Exports:** 3

**Default Exports:** 1

**Classes:** 1

**Dependencies:**

- `js/services/storage-degradation/degradation-detector.js`
- `js/services/storage-degradation/cleanup-strategies.js`
- `js/services/storage-degradation/tier-handlers.js`

---

### Tier Handlers

**File:** `js/services/storage-degradation/tier-handlers.js`

**Lines:** 534

**Named Exports:** 1

**Classes:** 1

**Dependencies:**

- `js/services/storage-degradation/degradation-detector.js`
- `js/services/storage-degradation/cleanup-strategies.js`
- `js/storage/keys.js`

---

### Stream Processor

**File:** `js/services/stream-processor.js`

**Lines:** 260

**Named Exports:** 1

**Functions:** 11

---

### Tab Coordination

**File:** `js/services/tab-coordination.js`

**Lines:** 2

**Named Exports:** 1

---

### Constants

**File:** `js/services/tab-coordination/constants.js`

**Lines:** 65

**Named Exports:** 5

**Functions:** 1

**Dependencies:**

- `js/services/vector-clock.js`

---

### Index

**File:** `js/services/tab-coordination/index.js`

**Lines:** 331

**Named Exports:** 14

**Functions:** 8

**Dependencies:**

- `js/services/tab-coordination/modules/authority.js`
- `js/services/tab-coordination/modules/election.js`
- `js/services/tab-coordination/modules/heartbeat.js`
- `js/services/tab-coordination/modules/watermark.js`
- `js/services/tab-coordination/modules/message-sender.js`
- `js/services/tab-coordination/modules/message-queue.js`
- `js/services/tab-coordination/modules/message-handler.js`
- `js/services/tab-coordination/modules/safe-mode.js`
- `js/services/tab-coordination/modules/monitoring.js`
- `js/services/tab-coordination/modules/sleep-detection.js`
- ... and 7 more

---

### Message Guards

**File:** `js/services/tab-coordination/message-guards.js`

**Lines:** 396

**Named Exports:** 12

**Functions:** 14

**Dependencies:**

- `js/services/tab-coordination/constants.js`

---

### Authority

**File:** `js/services/tab-coordination/modules/authority.js`

**Lines:** 219

**Named Exports:** 9

**Functions:** 11

**Dependencies:**

- `js/services/event-bus.js`
- `js/services/tab-coordination/constants.js`

---

### Election

**File:** `js/services/tab-coordination/modules/election.js`

**Lines:** 284

**Named Exports:** 13

**Functions:** 21

**Dependencies:**

- `js/services/event-bus.js`
- `js/services/tab-coordination/constants.js`
- `js/services/tab-coordination/timing.js`
- `js/services/tab-coordination/modules/authority.js`

---

### Heartbeat

**File:** `js/services/tab-coordination/modules/heartbeat.js`

**Lines:** 196

**Named Exports:** 10

**Functions:** 11

**Dependencies:**

- `js/services/device-detection.js`
- `js/services/wave-telemetry.js`
- `js/services/tab-coordination/constants.js`
- `js/services/tab-coordination/timing.js`
- `js/services/tab-coordination/modules/message-sender.js`
- `js/services/tab-coordination/modules/authority.js`
- `js/services/tab-coordination/modules/election.js`

---

### Message Handler

**File:** `js/services/tab-coordination/modules/message-handler.js`

**Lines:** 352

**Named Exports:** 3

**Functions:** 12

**Dependencies:**

- `js/state/app-state.js`
- `js/services/tab-coordination/constants.js`
- `js/services/tab-coordination/timing.js`
- `js/services/tab-coordination/modules/shared-state.js`
- `js/services/tab-coordination/message-guards.js`
- `js/services/tab-coordination/modules/message-sender.js`
- `js/services/tab-coordination/modules/authority.js`
- `js/services/tab-coordination/modules/election.js`
- `js/services/tab-coordination/modules/heartbeat.js`
- `js/services/tab-coordination/modules/watermark.js`
- ... and 1 more

---

### Message Queue

**File:** `js/services/tab-coordination/modules/message-queue.js`

**Lines:** 113

**Named Exports:** 8

**Functions:** 8

**Dependencies:**

- `js/services/tab-coordination/timing.js`
- `js/services/tab-coordination/modules/message-sender.js`
- `js/services/tab-coordination/modules/shared-state.js`

---

### Message Sender

**File:** `js/services/tab-coordination/modules/message-sender.js`

**Lines:** 143

**Named Exports:** 11

**Functions:** 12

**Dependencies:**

- `js/services/tab-coordination/constants.js`

---

### Monitoring

**File:** `js/services/tab-coordination/modules/monitoring.js`

**Lines:** 89

**Named Exports:** 4

**Functions:** 4

**Dependencies:**

- `js/services/device-detection.js`
- `js/services/tab-coordination/modules/sleep-detection.js`

---

### Safe Mode

**File:** `js/services/tab-coordination/modules/safe-mode.js`

**Lines:** 89

**Named Exports:** 3

**Functions:** 3

**Dependencies:**

- `js/services/tab-coordination/constants.js`
- `js/services/tab-coordination/modules/message-sender.js`
- `js/utils/html-escape.js`

---

### Shared State

**File:** `js/services/tab-coordination/modules/shared-state.js`

**Lines:** 61

**Named Exports:** 5

**Functions:** 4

**Dependencies:**

- `js/security/crypto.js`

---

### Sleep Detection

**File:** `js/services/tab-coordination/modules/sleep-detection.js`

**Lines:** 65

**Named Exports:** 1

**Functions:** 1

**Dependencies:**

- `js/services/tab-coordination/constants.js`
- `js/services/tab-coordination/modules/election.js`
- `js/services/tab-coordination/modules/authority.js`

---

### Transport Creation

**File:** `js/services/tab-coordination/modules/transport-creation.js`

**Lines:** 82

**Named Exports:** 2

**Functions:** 2

**Dependencies:**

- `js/services/tab-coordination/constants.js`
- `js/workers/shared-worker-coordinator.js`
- `js/services/tab-coordination/modules/message-sender.js`

---

### Watermark

**File:** `js/services/tab-coordination/modules/watermark.js`

**Lines:** 232

**Named Exports:** 14

**Functions:** 15

**Dependencies:**

- `js/services/event-bus.js`
- `js/storage/event-log-store.js`
- `js/services/tab-coordination/constants.js`
- `js/services/tab-coordination/modules/message-sender.js`
- `js/services/tab-coordination/modules/authority.js`

---

### Timing

**File:** `js/services/tab-coordination/timing.js`

**Lines:** 133

**Named Exports:** 8

**Functions:** 8

---

### Temporal Analysis

**File:** `js/services/temporal-analysis.js`

**Lines:** 430

**Named Exports:** 1

**Functions:** 11

**Dependencies:**

- `js/services/event-bus.js`

---

### Timeout Budget Manager

**File:** `js/services/timeout-budget-manager.js`

**Lines:** 614

**Named Exports:** 3

**Classes:** 2

**Functions:** 9

---

### Timeout Error

**File:** `js/services/timeout-error.js`

**Lines:** 413

**Named Exports:** 5

**Default Exports:** 1

**Classes:** 1

**Functions:** 3

---

### Token Counting Service

**File:** `js/services/token-counting-service.js`

**Lines:** 253

**Named Exports:** 1

**Functions:** 9

---

### Tool Call Handling Service

**File:** `js/services/tool-call-handling-service.js`

**Lines:** 797

**Named Exports:** 1

**Functions:** 12

**Dependencies:**

- `js/services/tool-strategies/native-strategy.js`
- `js/services/tool-strategies/prompt-injection-strategy.js`
- `js/services/tool-strategies/intent-extraction-strategy.js`
- `js/services/timeout-budget-manager.js`
- `js/services/provider-health-authority.js`

---

### Base Strategy

**File:** `js/services/tool-strategies/base-strategy.js`

**Lines:** 174

**Named Exports:** 1

**Default Exports:** 1

**Classes:** 1

**Dependencies:**

- `js/services/timeout-budget-manager.js`

---

### Index

**File:** `js/services/tool-strategies/index.js`

**Lines:** 12

**Named Exports:** 4

---

### Intent Extraction Strategy

**File:** `js/services/tool-strategies/intent-extraction-strategy.js`

**Lines:** 177

**Named Exports:** 1

**Default Exports:** 1

**Classes:** 1

**Dependencies:**

- `js/services/tool-strategies/base-strategy.js`

---

### Native Strategy

**File:** `js/services/tool-strategies/native-strategy.js`

**Lines:** 204

**Named Exports:** 1

**Default Exports:** 1

**Classes:** 1

**Dependencies:**

- `js/services/tool-strategies/base-strategy.js`

---

### Prompt Injection Strategy

**File:** `js/services/tool-strategies/prompt-injection-strategy.js`

**Lines:** 198

**Named Exports:** 1

**Default Exports:** 1

**Classes:** 1

**Dependencies:**

- `js/services/tool-strategies/base-strategy.js`

---

### Turn Queue

**File:** `js/services/turn-queue.js`

**Lines:** 520

**Named Exports:** 1

**Classes:** 1

**Functions:** 17

**Dependencies:**

- `js/chat.js`
- `js/constants/limits.js`
- `js/constants/delays.js`

---

### Vector Clock

**File:** `js/services/vector-clock.js`

**Lines:** 323

**Named Exports:** 3

**Classes:** 2

---

### Wave Telemetry

**File:** `js/services/wave-telemetry.js`

**Lines:** 427

**Named Exports:** 1

**Functions:** 16

**Dependencies:**

- `js/constants/percentages.js`
- `js/constants/delays.js`

---

### Wave Visualizer

**File:** `js/services/wave-visualizer.js`

**Lines:** 189

**Named Exports:** 1

**Functions:** 4

---

### Worker Coordinator

**File:** `js/services/worker-coordinator.js`

**Lines:** 585

**Named Exports:** 1

**Default Exports:** 1

**Functions:** 16

---

