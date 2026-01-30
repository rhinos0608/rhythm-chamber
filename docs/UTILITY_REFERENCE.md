# Utility Reference

> **Auto-generated** by docs-sync tool
> **Generated:** 2026-01-30T16:48:34.637Z
> **Total Utilities:** 35

This reference provides detailed information about all utility modules in the application.

## Overview

Utilities are shared helper functions and modules used across the application.

## Utilities

### Adaptive Rate Limiter

**File:** `js/utils/adaptive-rate-limiter.js`

**Lines:** 387

**Named Exports:** 11

**Default Exports:** 1

**Functions:** 11

---

### Common

**File:** `js/utils/common.js`

**Lines:** 353

**Named Exports:** 12

**Functions:** 11

---

### Lock Manager

**File:** `js/utils/concurrency/lock-manager.js`

**Lines:** 493

**Named Exports:** 7

**Default Exports:** 1

**Classes:** 5

**Functions:** 16

---

### Mutex

**File:** `js/utils/concurrency/mutex.js`

**Lines:** 164

**Named Exports:** 2

**Default Exports:** 1

**Classes:** 2

---

### Crypto Hashing

**File:** `js/utils/crypto-hashing.js`

**Lines:** 106

**Named Exports:** 4

**Classes:** 1

**Functions:** 3

---

### Error Handling

**File:** `js/utils/error-handling.js`

**Lines:** 141

**Named Exports:** 26

**Default Exports:** 1

**Dependencies:**

- `js/utils/error-handling/error-classifier.js`
- `js/utils/error-handling/error-formatter.js`
- `js/utils/error-handling/error-recovery.js`

---

### Error Classifier

**File:** `js/utils/error-handling/error-classifier.js`

**Lines:** 635

**Named Exports:** 10

**Functions:** 12

**Dependencies:**

- `js/utils/error-handling/error-sanitizer.js`

---

### Error Formatter

**File:** `js/utils/error-handling/error-formatter.js`

**Lines:** 114

**Named Exports:** 3

**Functions:** 3

**Dependencies:**

- `js/utils/error-handling/error-classifier.js`
- `js/utils/error-handling/error-sanitizer.js`

---

### Error Recovery

**File:** `js/utils/error-handling/error-recovery.js`

**Lines:** 254

**Named Exports:** 7

**Functions:** 7

**Dependencies:**

- `js/utils/error-handling/error-classifier.js`
- `js/utils/error-handling/error-sanitizer.js`

---

### Error Sanitizer

**File:** `js/utils/error-handling/error-sanitizer.js`

**Lines:** 133

**Named Exports:** 5

**Functions:** 3

---

### Focus Trap

**File:** `js/utils/focus-trap.js`

**Lines:** 437

**Named Exports:** 3

**Default Exports:** 1

**Classes:** 1

**Functions:** 4

---

### Html Escape

**File:** `js/utils/html-escape.js`

**Lines:** 190

**Named Exports:** 6

**Default Exports:** 1

**Functions:** 6

---

### Input Validation

**File:** `js/utils/input-validation.js`

**Lines:** 398

**Named Exports:** 1

**Default Exports:** 1

**Functions:** 8

---

### Logger

**File:** `js/utils/logger.js`

**Lines:** 316

**Named Exports:** 12

**Functions:** 11

---

### Parser

**File:** `js/utils/parser.js`

**Lines:** 106

**Named Exports:** 1

**Default Exports:** 1

**Functions:** 1

**Dependencies:**

- `js/utils/html-escape.js`

---

### Resilient Retry

**File:** `js/utils/resilient-retry.js`

**Lines:** 436

**Named Exports:** 15

**Default Exports:** 1

**Classes:** 1

**Functions:** 8

---

### Result

**File:** `js/utils/result.js`

**Lines:** 212

**Named Exports:** 3

**Default Exports:** 1

**Functions:** 2

---

### Retry Manager

**File:** `js/utils/retry-manager.js`

**Lines:** 89

**Named Exports:** 43

---

### Index

**File:** `js/utils/retry-manager/index.js`

**Lines:** 198

**Named Exports:** 43

**Default Exports:** 1

**Dependencies:**

- `js/utils/retry-manager/retry-config.js`
- `js/utils/retry-manager/retry-config.js`
- `js/utils/retry-manager/retry-strategies.js`
- `js/utils/retry-manager/retry-strategies.js`
- `js/utils/retry-manager/retry-executor-core.js`
- `js/utils/retry-manager/retry-executor-patterns.js`

---

### Retry Config

**File:** `js/utils/retry-manager/retry-config.js`

**Lines:** 245

**Named Exports:** 5

**Functions:** 2

---

### Retry Executor Core

**File:** `js/utils/retry-manager/retry-executor-core.js`

**Lines:** 305

**Named Exports:** 4

**Classes:** 1

**Functions:** 3

**Dependencies:**

- `js/utils/retry-manager/retry-config.js`
- `js/utils/retry-manager/retry-strategies.js`

---

### Retry Executor Patterns

**File:** `js/utils/retry-manager/retry-executor-patterns.js`

**Lines:** 274

**Named Exports:** 11

**Functions:** 11

**Dependencies:**

- `js/utils/retry-manager/retry-config.js`
- `js/utils/retry-manager/retry-strategies.js`
- `js/utils/retry-manager/retry-executor-core.js`

---

### Retry Monitoring

**File:** `js/utils/retry-manager/retry-monitoring.js`

**Lines:** 267

**Named Exports:** 10

**Classes:** 1

**Functions:** 9

**Dependencies:**

- `js/utils/retry-manager/retry-config.js`

---

### Retry Strategies

**File:** `js/utils/retry-manager/retry-strategies.js`

**Lines:** 196

**Named Exports:** 14

**Functions:** 14

**Dependencies:**

- `js/utils/retry-manager/retry-config.js`

---

### Safe Json

**File:** `js/utils/safe-json.js`

**Lines:** 183

**Named Exports:** 5

**Default Exports:** 1

**Functions:** 4

---

### Secure Logger

**File:** `js/utils/secure-logger.js`

**Lines:** 200

**Named Exports:** 5

**Functions:** 5

---

### Stream Buffer

**File:** `js/utils/stream-buffer.js`

**Lines:** 202

**Named Exports:** 2

**Default Exports:** 1

**Classes:** 1

**Functions:** 1

---

### Timeout Wrapper

**File:** `js/utils/timeout-wrapper.js`

**Lines:** 259

**Named Exports:** 8

**Classes:** 1

**Functions:** 6

---

### Validation

**File:** `js/utils/validation.js`

**Lines:** 229

**Named Exports:** 32

**Functions:** 3

**Dependencies:**

- `js/utils/validation/message-validator.js`
- `js/utils/validation/regex-validator.js`
- `js/utils/validation/schema-validator.js`
- `js/utils/validation/format-validators.js`
- `js/utils/validation/storage-validators.js`
- `js/utils/validation/type-guards.js`

---

### Format Validators

**File:** `js/utils/validation/format-validators.js`

**Lines:** 139

**Named Exports:** 4

**Functions:** 3

---

### Message Validator

**File:** `js/utils/validation/message-validator.js`

**Lines:** 311

**Named Exports:** 5

**Functions:** 4

**Dependencies:**

- `js/utils/crypto-hashing.js`

---

### Regex Validator

**File:** `js/utils/validation/regex-validator.js`

**Lines:** 294

**Named Exports:** 5

---

### Schema Validator

**File:** `js/utils/validation/schema-validator.js`

**Lines:** 279

**Named Exports:** 4

**Functions:** 1

**Dependencies:**

- `js/utils/validation/regex-validator.js`

---

### Storage Validators

**File:** `js/utils/validation/storage-validators.js`

**Lines:** 202

**Named Exports:** 4

**Functions:** 5

**Dependencies:**

- `js/utils/validation/schema-validator.js`

---

### Type Guards

**File:** `js/utils/validation/type-guards.js`

**Lines:** 128

**Named Exports:** 7

**Functions:** 7

---

