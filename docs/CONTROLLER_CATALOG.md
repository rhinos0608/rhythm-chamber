# Controller Catalog

> **Auto-generated** by docs-sync tool
> **Generated:** 2026-01-30T12:48:52.677Z
> **Total Controllers:** 21

This catalog provides detailed information about all UI controllers in the application.

## Overview

Controllers manage UI components and user interactions. Each controller is responsible for a specific aspect of the user interface.

## Controllers

### Artifact Renderer

**File:** `js/controllers/artifact-renderer.js`

**Lines:** 138

**Named Exports:** 1

**Functions:** 5

**Dependencies:**

- `js/artifacts/index.js`

---

### Chat Input Manager

**File:** `js/controllers/chat-input-manager.js`

**Lines:** 113

**Named Exports:** 1

**Functions:** 5

---

### Chat Ui Controller

**File:** `js/controllers/chat-ui-controller.js`

**Lines:** 80

**Named Exports:** 1

**Functions:** 1

**Dependencies:**

- `js/controllers/message-renderer.js`
- `js/controllers/streaming-message-handler.js`
- `js/controllers/message-actions.js`
- `js/controllers/artifact-renderer.js`
- `js/controllers/chat-input-manager.js`

---

### Custom Profile Controller

**File:** `js/controllers/custom-profile-controller.js`

**Lines:** 414

**Named Exports:** 1

**Dependencies:**

- `js/profile-synthesizer.js`
- `js/storage/profiles.js`
- `js/utils/focus-trap.js`
- `js/utils/html-escape.js`

---

### Demo Controller

**File:** `js/controllers/demo-controller.js`

**Lines:** 788

**Named Exports:** 1

**Functions:** 14

**Dependencies:**

- `js/patterns.js`
- `js/storage/indexeddb.js`
- `js/chat.js`
- `js/operation-lock.js`
- `js/contracts/version-source.js`

---

### Dev Panel Controller

**File:** `js/controllers/dev-panel-controller.js`

**Lines:** 329

**Named Exports:** 2

**Classes:** 1

**Dependencies:**

- `js/services/event-bus.js`
- `js/services/wave-telemetry.js`
- `js/services/storage-degradation-manager.js`

---

### File Upload Controller

**File:** `js/controllers/file-upload-controller.js`

**Lines:** 542

**Named Exports:** 1

**Functions:** 13

**Dependencies:**

- `js/services/error-boundary.js`

---

### Message Actions

**File:** `js/controllers/message-actions.js`

**Lines:** 251

**Named Exports:** 1

**Functions:** 5

**Dependencies:**

- `js/chat.js`

---

### Message Renderer

**File:** `js/controllers/message-renderer.js`

**Lines:** 95

**Named Exports:** 1

**Functions:** 2

**Dependencies:**

- `js/utils/html-escape.js`
- `js/utils/parser.js`
- `js/controllers/message-actions.js`

---

### Observability Controller

**File:** `js/controllers/observability-controller.js`

**Lines:** 18

**Named Exports:** 2

---

### Premium Controller

**File:** `js/controllers/premium-controller.js`

**Lines:** 459

**Named Exports:** 1

**Dependencies:**

- `js/pricing.js`
- `js/services/premium-quota.js`
- `js/services/premium-gatekeeper.js`
- `js/utils/focus-trap.js`
- `js/services/lemon-squeezy-service.js`
- `js/utils/html-escape.js`
- `js/settings/index.js`

---

### Reset Controller

**File:** `js/controllers/reset-controller.js`

**Lines:** 371

**Named Exports:** 1

**Functions:** 10

**Dependencies:**

- `js/utils/focus-trap.js`

---

### Sidebar Controller

**File:** `js/controllers/sidebar-controller.js`

**Lines:** 768

**Named Exports:** 1

**Functions:** 18

**Dependencies:**

- `js/storage.js`
- `js/chat.js`
- `js/controllers/chat-ui-controller.js`
- `js/token-counter.js`
- `js/state/app-state.js`
- `js/services/event-bus.js`
- `js/utils/html-escape.js`
- `js/utils.js`
- `js/storage/keys.js`
- `js/utils/focus-trap.js`

---

### Index

**File:** `js/controllers/sidebar/index.js`

**Lines:** 124

**Named Exports:** 4

**Default Exports:** 1

**Functions:** 2

**Dependencies:**

- `js/controllers/sidebar/state-controller.js`
- `js/controllers/sidebar/session-list-controller.js`
- `js/controllers/sidebar/session-actions-controller.js`
- `js/controllers/chat-ui-controller.js`
- `js/utils/html-escape.js`

---

### Mobile Responsiveness

**File:** `js/controllers/sidebar/mobile-responsiveness.js`

**Lines:** 86

**Named Exports:** 1

**Functions:** 5

---

### Session Actions Controller

**File:** `js/controllers/sidebar/session-actions-controller.js`

**Lines:** 369

**Named Exports:** 1

**Functions:** 13

**Dependencies:**

- `js/chat.js`
- `js/controllers/chat-ui-controller.js`
- `js/token-counter.js`
- `js/state/app-state.js`
- `js/controllers/sidebar/session-list-controller.js`
- `js/controllers/sidebar/state-controller.js`
- `js/utils/html-escape.js`

---

### Session List Controller

**File:** `js/controllers/sidebar/session-list-controller.js`

**Lines:** 251

**Named Exports:** 1

**Functions:** 14

**Dependencies:**

- `js/chat.js`
- `js/utils/html-escape.js`
- `js/constants/session.js`

---

### State Controller

**File:** `js/controllers/sidebar/state-controller.js`

**Lines:** 211

**Named Exports:** 1

**Functions:** 9

**Dependencies:**

- `js/storage.js`
- `js/state/app-state.js`
- `js/storage/keys.js`
- `js/controllers/sidebar/mobile-responsiveness.js`

---

### Spotify Controller

**File:** `js/controllers/spotify-controller.js`

**Lines:** 340

**Named Exports:** 1

**Functions:** 11

---

### Streaming Message Handler

**File:** `js/controllers/streaming-message-handler.js`

**Lines:** 450

**Named Exports:** 1

**Functions:** 12

**Dependencies:**

- `js/utils/stream-buffer.js`
- `js/utils/html-escape.js`
- `js/utils/parser.js`
- `js/controllers/message-actions.js`

---

### View Controller

**File:** `js/controllers/view-controller.js`

**Lines:** 520

**Named Exports:** 1

**Functions:** 12

**Dependencies:**

- `js/chat.js`
- `js/services/profile-description-generator.js`
- `js/state/app-state.js`
- `js/controllers/sidebar-controller.js`

---

