---
status: fixing
trigger: "Settings are NOT persisting after page refresh. Changing provider from Ollama to LM Studio doesn't save. Console error: 'Security session not ready outside bootstrap window - message dropped to prevent unsigned fallback' at tab-coordination.js:717"
created: "2025-01-21T12:00:00Z"
updated: "2025-01-21T12:30:00Z"
---

## Current Focus

hypothesis: getSettings() returns DEFAULTS instead of reading from IndexedDB when cache is empty
test: Verified at lines 176-184 of settings.js - when settingsMigrationComplete=true and _cachedSettings=null, it returns defaults
expecting: CONFIRMED - getSettings() does NOT read from IndexedDB when cache is empty
next_action: Fix getSettings() to populate cache from IndexedDB when empty

## Symptoms

expected: Settings saved via modal should persist to IndexedDB and be available after page refresh
actual: Settings appear to save (toast shows) but are not retained after refresh
errors: "Security session not ready outside bootstrap window - message dropped to prevent unsigned fallback" at tab-coordination.js:717
reproduction: Open settings modal, change provider from Ollama to LM Studio, click Save Changes, refresh page
started: Unknown - bug reported by user

## Eliminated

## Evidence

- timestamp: 2025-01-21T12:00:00Z
  checked: IndexedDBCore.put() function in js/storage/indexeddb.js
  found: Line 497 has `return; // No-op in non-strict mode` when checkWriteAuthority returns false
  implication: If write authority check fails, the put operation SILENTLY returns without writing and without throwing error

- timestamp: 2025-01-21T12:00:00Z
  checked: AUTHORITY_CONFIG.strictMode value
  found: strictMode is set to `false` at line 84 of indexeddb.js
  implication: When checkWriteAuthority returns false, put() silently returns instead of throwing an error

- timestamp: 2025-01-21T12:00:00Z
  checked: checkWriteAuthority() function
  found: Calls TabCoordinator?.isWriteAllowed?.() ?? true at line 108
  implication: If TabCoordinator.isWriteAllowed() returns false, write is denied

- timestamp: 2025-01-21T12:00:00Z
  checked: TabCoordinator.isWriteAllowed() implementation
  found: Returns isPrimaryTab variable (line 1553 of tab-coordination.js)
  implication: isPrimaryTab determines write permission

- timestamp: 2025-01-21T12:00:00Z
  checked: isPrimaryTab initial value
  found: Initialized to `true` at line 262 of tab-coordination.js
  implication: Single tab should have write permission by default

- timestamp: 2025-01-21T12:00:00Z
  checked: "Security session not ready" error location
  found: Error is from sendMessage() function for TabCoordination's own broadcast messages, not from settings storage
  implication: The console error is a red herring - related to tab coordination, not settings persistence

- timestamp: 2025-01-21T12:00:00Z
  checked: getSettings() function post-migration behavior
  found: At lines 182-184, when settingsMigrationComplete=true and _cachedSettings is null/falsy, it returns default settings without reading IndexedDB
  implication: The sync getSettings() cannot read IndexedDB (async), so it returns defaults when cache is empty

- timestamp: 2025-01-21T12:00:00Z
  checked: _cachedSettings initialization
  found: Line 65: `let _cachedSettings = null;` - cache starts empty on module load
  implication: On every page load, cache is empty until getSettingsAsync() is called

- timestamp: 2025-01-21T12:00:00Z
  checked: Who calls getSettingsAsync() on init
  found: Only called from saveSettings() at line 433. No initialization call found.
  implication: Cache is never populated on page load, only after saving settings once

## Resolution

root_cause: In js/settings.js, the getSettings() function returns DEFAULT settings from config.js when settingsMigrationComplete=true but _cachedSettings=null, instead of reading from IndexedDB. The _cachedSettings variable is only populated inside saveSettings(), but on page load it's null. Since getSettings() is sync, it can't await getSettingsAsync(), so it returns defaults instead of the user's saved settings.

The bug flow:
1. Page loads: _cachedSettings = null
2. User opens settings modal: showSettingsModal() calls getSettings() (sync)
3. getSettings() sees settingsMigrationComplete=true but _cachedSettings=null, returns defaults
4. User changes provider and saves - data IS written to IndexedDB
5. Page refresh: cache is null again, defaults are shown

fix:
1. Changed showSettingsModal() from sync to async function
2. Changed showSettingsModal() to use await getSettingsAsync() instead of getSettings()
3. Updated all callers of showSettingsModal() to await the async call:
   - settings.js line 1285 (in generateEmbeddings success handler)
   - settings.js line 1506 (in confirmSessionReset success handler)
   - app.js line 768 (in setupEventHandlers 'show-settings' handler)
4. Added warning in getSettings() when cache is empty post-migration to help catch similar bugs

verification: TBD - needs user testing
files_changed:
- js/settings.js: showSettingsModal() now async, uses getSettingsAsync(), added warning in getSettings()
- js/app.js: 'show-settings' handler now async and awaits showSettingsModal()
