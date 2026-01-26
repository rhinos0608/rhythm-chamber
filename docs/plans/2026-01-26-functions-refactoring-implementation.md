# Functions Module Refactoring Plan

## Overview
Refactor `js/functions/index.js` (382 lines) from a God object into focused, single-responsibility modules.

## Current State Analysis

### Responsibilities in index.js (7 total)
1. **Function execution routing** (lines 50-137)
2. **Schema validation and normalization** (lines 143-228)
3. **Schema aggregation** (lines 234-275)
4. **Enabled tools filtering** (lines 289-315)
5. **Template vs data routing** (lines 79-91)
6. **Error handling and formatting** (scattered throughout)
7. **Retry logic delegation** (lines 120-136)

### Dependencies
- Existing utils: `FunctionValidation`, `FunctionRetry`
- 6 executor types (data, template, analytics, artifact, playlist, semantic)
- 6 schema types (matching executors)
- Settings module for enabled tools

### Importing Files (5 files need update)
- js/app.js
- js/settings.js
- js/main.js
- js/chat.js
- js/services/function-calling-fallback.js

## Refactoring Architecture

```
js/functions/
├── index.js (facade - maintains backward compatibility)
├── core/
│   ├── FunctionExecutor.js (execution routing)
│   ├── FunctionValidator.js (schema validation, normalization)
│   ├── SchemaRegistry.js (schema aggregation, discovery)
│   ├── FunctionRetryHandler.js (retry logic wrapper)
│   └── TemplateExecutorRouter.js (template vs data routing)
└── [existing directories: executors/, schemas/, utils/]
```

## Module Specifications

### 1. SchemaRegistry.js
**Responsibility:** Schema aggregation and discovery
**Methods:**
- `getAllSchemas()` - Aggregate all 6 schema types
- `getArtifactSchemas()` - Artifact schemas only
- `getDataSchemas()` - Data query schemas only
- `getTemplateSchemas()` - Template schemas only
- `getAnalyticsSchemas()` - Analytics schemas only
- `getEnabledSchemas()` - Filter by Settings.enabledTools
- `hasFunction(name)` - Check if function exists
- `getFunctionSchema(name)` - Get schema by name
- `getAvailableFunctions()` - List all function names
- `isTemplateFunction(name)` - Check if template function

### 2. FunctionValidator.js
**Responsibility:** Schema validation and argument normalization
**Methods:**
- `validateFunctionArgs(functionName, args)` - Validate against schema
- `normalizeArgs(functionName, args)` - Type coercion, enum case fixing
- `validateRequiredParams(args, schema)` - Check required fields
- `validateParamTypes(args, schema)` - Type checking with coercion
- `validateEnums(args, schema)` - Enum validation with normalization

### 3. FunctionExecutor.js
**Responsibility:** Execution routing to appropriate executor
**Methods:**
- `execute(functionName, args, streams, options)` - Main execution
- `executeTemplateFunction(functionName, args)` - Template execution
- `executeDataFunction(functionName, args, streams)` - Data execution
- `findExecutor(functionName)` - Locate executor by name

### 4. FunctionRetryHandler.js
**Responsibility:** Retry logic wrapper
**Methods:**
- `executeWithRetry(fn, functionName, signal)` - Execute with retry
- `isRetryableError(error)` - Check if error should retry
- `shouldAbort(signal)` - Check for abort signal

### 5. TemplateExecutorRouter.js
**Responsibility:** Template vs data routing logic
**Methods:**
- `isTemplateFunction(functionName)` - Check if template
- `routeToExecutor(functionName, args, streams)` - Route based on type
- `validateTemplateRequirements()` - Check template prerequisites
- `validateDataRequirements(streams)` - Check data prerequisites

## Implementation Plan

### Phase 1: Create Core Modules (Priority: HIGH)
1. Create `js/functions/core/` directory
2. Implement SchemaRegistry.js
3. Implement FunctionValidator.js
4. Implement FunctionExecutor.js
5. Implement FunctionRetryHandler.js
6. Implement TemplateExecutorRouter.js

### Phase 2: Refactor index.js (Priority: HIGH)
1. Import new core modules
2. Replace implementations with facade calls
3. Maintain exact same public API
4. Add JSDoc documentation
5. Keep all exports identical

### Phase 3: Update Imports (Priority: MEDIUM)
1. Check all 5 importing files
2. Verify backward compatibility
3. No changes needed if API is identical

### Phase 4: Testing (Priority: CRITICAL)
1. Run existing unit tests
2. Run integration tests
3. Manual verification of function calling
4. Check console output for errors

### Phase 5: Documentation (Priority: LOW)
1. Update inline JSDoc
2. Add module-level documentation
3. Document refactoring changes

## Success Criteria

1. **Zero breaking changes** - All existing imports work identically
2. **All tests pass** - No regressions
3. **Improved maintainability** - Clear module boundaries
4. **Better testability** - Each module can be tested independently
5. **Reduced complexity** - Each module < 150 lines

## Risk Mitigation

1. **Backward compatibility** - Keep index.js as facade, don't change exports
2. **Incremental rollout** - One module at a time
3. **Test after each module** - Run tests after each creation
4. **Keep existing utils** - Don't break FunctionValidation, FunctionRetry

## Estimated Timeline

- Phase 1: 60 minutes (create 5 modules)
- Phase 2: 30 minutes (refactor index.js)
- Phase 3: 15 minutes (verify imports)
- Phase 4: 30 minutes (testing)
- Phase 5: 15 minutes (documentation)

**Total: ~150 minutes (2.5 hours)**

## Status Tracking

See `.state/functions-refactor-20250126.json` for real-time progress.
