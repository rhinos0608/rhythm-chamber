# Validation Utils Migration Guide

Quick reference for migrating to the fixed validation utils.

## What Changed?

### 1. Hash Function Upgrade (CRIT-003)
- **Old:** 32-bit FNV-1a hash (high collision rate)
- **New:** 256-bit SHA-256 hash (negligible collision rate)
- **Impact:** Hash functions now return `Promise<string>` (async)

### 2. LRU Cache Fix (CRIT-001)
- **Old:** FIFO cache (evicted oldest inserted)
- **New:** True LRU cache (evicts least recently used)
- **Impact:** Better cache behavior, fewer false positives

### 3. ReDoS Protection (CRIT-002)
- **Old:** No regex pattern validation
- **New:** Pattern validation + timeout protection
- **Impact:** Prevents catastrophic backtracking attacks

### 4. HTML Escaping Rename (CRIT-004)
- **Old:** `sanitizeHTML()` - misleading name
- **New:** `escapeHTMLEntities()` - accurate name with warnings
- **Impact:** Clear documentation prevents misuse

## Migration Checklist

### Step 1: Update Import Statements (if needed)

No changes needed - all exports maintained.

### Step 2: Make Validation Functions Async

Find all calls to these functions and add `await`:

```javascript
// BEFORE
validateMessage(message)
trackProcessedMessage(message)
removeProcessedMessage(message)

// AFTER
await validateMessage(message)
await trackProcessedMessage(message)
await removeProcessedMessage(message)
```

### Step 3: Update Function Signatures

Make any function that calls the validation utils async:

```javascript
// BEFORE
function processMessage(message) {
    const result = validateMessage(message);
    if (result.valid) {
        trackProcessedMessage(message);
    }
}

// AFTER
async function processMessage(message) {
    const result = await validateMessage(message);
    if (result.valid) {
        await trackProcessedMessage(message);
    }
}
```

### Step 4: Update HTML Escaping Calls (Optional)

The old name still works, but consider updating:

```javascript
// OLD (deprecated but works)
const safe = sanitizeHTML(userInput);

// NEW (recommended)
const safe = escapeHTMLEntities(userInput);
```

## Common Patterns

### Pattern 1: Message Validation

```javascript
// BEFORE
function handleMessage(message) {
    const result = validateMessage(message);
    if (!result.valid) {
        console.error(result.error);
        return;
    }
    trackProcessedMessage(message);
    process(message);
}

// AFTER
async function handleMessage(message) {
    const result = await validateMessage(message);
    if (!result.valid) {
        console.error(result.error);
        return;
    }
    await trackProcessedMessage(message);
    process(message);
}
```

### Pattern 2: Message Regeneration

```javascript
// BEFORE
function regenerateMessage(originalMessage) {
    removeProcessedMessage(originalMessage);
    const newMessage = generateNewMessage();
    trackProcessedMessage(newMessage);
    return newMessage;
}

// AFTER
async function regenerateMessage(originalMessage) {
    await removeProcessedMessage(originalMessage);
    const newMessage = generateNewMessage();
    await trackProcessedMessage(newMessage);
    return newMessage;
}
```

### Pattern 3: Batch Processing

```javascript
// BEFORE
function processMessages(messages) {
    const results = [];
    for (const msg of messages) {
        const result = validateMessage(msg);
        if (result.valid) {
            trackProcessedMessage(msg);
            results.push(process(msg));
        }
    }
    return results;
}

// AFTER
async function processMessages(messages) {
    const results = [];
    for (const msg of messages) {
        const result = await validateMessage(msg);
        if (result.valid) {
            await trackProcessedMessage(msg);
            results.push(process(msg));
        }
    }
    return results;
}
```

## Testing Your Changes

After migrating, verify:

1. ✅ All validation functions are awaited
2. ✅ Error handling still works with async
3. ✅ Message duplicate detection works
4. ✅ LRU cache behavior is correct
5. ✅ No unhandled promise rejections

## Need Help?

- See detailed summary: `docs/plans/2026-01-26-validation-utils-security-fixes-complete.md`
- See test suite: `tests/unit/validation-utils-fixes.test.js`
- See fixed code: `js/utils/validation.js`

## Rollback Plan (If Needed)

If issues arise, the old synchronous hash function is still available as a fallback in the code. Contact the development team for assistance.
