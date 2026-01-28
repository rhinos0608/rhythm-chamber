# Test File Merger Plan

## Files to Merge

1. **Original**: `tests/unit/observability/metrics-exporter/metrics-formatters.test.js` (51 tests)
2. **New**: `tests/unit/observability/metrics-formatters-new.test.js` (48 tests)

## Analysis

### Test Coverage Comparison

| Feature | Original (51 tests) | New (48 tests) | Status |
|---------|---------------------|----------------|---------|
| **Constructor** | 2 tests | 0 tests | Keep from Original |
| **JSON Formatting** | 3 tests | 4 tests | **MERGE** |
| **CSV Formatting** | 4 tests | 5 tests | **MERGE** |
| **Prometheus Formatting** | 5 tests | 4 tests | **MERGE** |
| **InfluxDB Formatting** | 3 tests | 3 tests | **MERGE** |
| **StatsD Formatting** | 3 tests | 4 tests | **MERGE** |
| **Datadog Formatting** | 3 tests | 3 tests | **MERGE** |
| **New Relic Formatting** | 3 tests | 3 tests | **MERGE** |
| **Label Formatting** | 4 tests | 3 tests | **MERGE** |
| **Metric Name Sanitization** | 4 tests | 3 tests | **MERGE** |
| **Metrics Flattening** | 3 tests | 3 tests | **MERGE** |
| **CSV Value Escaping** | 4 tests | 2 tests | **MERGE** |
| **Utility Methods** | 6 tests | 6 tests | **MERGE** |
| **Format Routing** | 2 tests | 2 tests | **MERGE** |

### Unique Tests in Original File

1. **Constructor tests** (2 tests) - Not present in new file
2. **Circular reference handling** (different expectations)
3. **Null memory values** for Prometheus
4. **Specific error message** for unsupported format

### Unique Tests in New File

1. **Empty metrics handling** (every formatter) - Comprehensive edge case coverage
2. **Specific value assertions** (e.g., exact timestamps, specific metric names)
3. **CLScore web vital** testing (original only has LCP/FID)
4. **Better test descriptions** (more specific)

### Duplicate Tests (Same Purpose, Different Implementation)

Most tests overlap but have different assertions:

| Test Purpose | Original Approach | New Approach | Decision |
|--------------|-------------------|--------------|----------|
| JSON basic format | Parse and compare | Parse and compare | **Keep both** (different assertions) |
| JSON circular ref | Should not throw | Should throw | **Investigate** - conflict |
| CSV quotes | Escape double quotes | Escape double quotes | **Keep both** |
| CSV null values | Empty string | Empty string | **Keep one** |
| Prometheus format | Check structure | Check exact lines | **Keep both** |
| Prometheus web vitals | Check rating label | Check exact output | **Keep both** |
| InfluxDB format | Check components | Check exact lines | **Keep both** |
| StatsD format | Check structure | Check exact lines | **Keep both** |
| Empty metrics (all formatters)** | Not tested | Tested for all | **ADD from new** |

## Merge Strategy

### 1. Add Missing Unique Tests from New File

The new file has comprehensive **empty metrics** tests that the original lacks:
- `should handle empty metrics` for: JSON, CSV, Prometheus, InfluxDB, StatsD, Datadog, New Relic

**Action**: ADD all empty metrics tests from new file

### 2. Add Constructor Tests

The original has 2 constructor tests that the new file lacks.

**Action**: KEEP from original

### 3. Resolve Conflicts

#### Circular Reference Test Conflict

- **Original**: "should either throw or handle gracefully" - expects JSON.parse() not to throw
- **New**: "should throw on circular references" - expects formatAsJSON() to throw

**Investigation needed**: Which behavior is correct?

Looking at the implementation expectation:
- New file's test is more explicit about expected behavior
- Original's test is ambiguous ("either throw or handle")

**Decision**: Keep new file's test (more explicit), but verify implementation matches

### 4. Merge Tests with Different Assertions

Many tests cover the same functionality but with different assertions:

**Example - Prometheus formatting**:
- Original: Checks for "# HELP", "# TYPE", "gauge" strings
- New: Checks for exact metric names and values

**Decision**: KEEP BOTH - they test different aspects

### 5. Add Missing Web Vitals

Original tests LCP and FID only.
New tests LCP, FID, and CLS.

**Action**: Add CLS test from new file

### 6. Utility Methods

Both files test utility methods similarly. Keep the more comprehensive versions.

## Final Test Count Estimate

- Original unique: 2 (constructor)
- New unique: 7 (empty metrics tests)
- Merged/combined: ~50 (keeping both versions where they add value)
- **Total: ~59 tests**

## Execution Plan

1. Read original file
2. Add missing sections from new file:
   - Empty metrics tests for each formatter
   - CLS web vital test
   - Any other unique tests
3. Keep all original tests
4. Keep all new tests that add value (different assertions)
5. Resolve naming conflicts (ensure unique test names)
6. Verify no duplicate test names
7. Run tests to confirm all pass
8. Delete `-new` file
9. Commit with descriptive message

## File Structure After Merge

```
describe('MetricsFormatters', () => {
    beforeEach(() => { ... });

    describe('constructor', () => {
        // 2 tests from original
    });

    describe('formatAsJSON', () => {
        // 3 from original + 4 from new
        // Note: circular ref test uses new's version (explicit throw)
    });

    describe('formatAsCSV', () => {
        // 4 from original + 5 from new
        // All unique assertions
    });

    describe('formatAsPrometheus', () => {
        // 5 from original + 4 from new
        // All unique assertions
    });

    // ... and so on for all formatters
});
```
