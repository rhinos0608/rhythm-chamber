# Functions/index.js Refactoring Plan

## Current State Analysis

**File:** `/Users/rhinesharar/rhythm-chamber/js/functions/index.js` (382 lines)

### Current Responsibilities (God Object)
1. **Function execution routing** (lines 50-137)
   - Template vs data function routing
   - Executor lookup and delegation
   - Retry logic coordination
   - Error handling and formatting

2. **Schema validation and normalization** (lines 151-228)
   - Required parameter checking
   - Type validation with coercion
   - Enum validation with case-insensitive matching
   - Argument normalization

3. **Retry logic delegation** (lines 120-136)
   - Delegates to FunctionRetry.withRetry
   - Fallback execution without retry

4. **Schema aggregation** (lines 238-315)
   - getAllSchemas() - combines 6 schema types
   - getDataSchemas(), getTemplateSchemas(), etc.
   - getEnabledSchemas() - filters by Settings

5. **Enabled tools filtering** (lines 293-315)
   - Integration with Settings.getEnabledTools()
   - Dynamic schema filtering

6. **Template vs data function routing** (lines 80-91)
   - TemplateFunctionNames constant
   - Separate execution paths

7. **Error handling and formatting** (throughout)
   - Consistent error response format
   - Validation error formatting

### Dependencies Found
- **6 Schema imports:** data, template, analytics, artifact, playlist, semantic
- **6 Executor imports:** matching the schema types
- **Utils:** validation, retry
- **Settings:** for enabled tools filtering

### Import Locations (4 files)
- `js/app.js`
- `js/settings.js`
- `js/main.js`
- `js/chat.js`

## Refactoring Strategy

### Phase 1: Create New Modules (Low Risk)

#### 1.1 SchemaRegistry Module
**Purpose:** Centralize schema aggregation and discovery

**Location:** `js/functions/schema-registry.js`

**Responsibilities:**
- Aggregate all 6 schema types
- Provide filtered access (all, enabled, by type)
- Function discovery (hasFunction, getFunctionSchema)
- Template function identification

**API:**
```javascript
export const SchemaRegistry = {
  getAllSchemas(),
  getEnabledSchemas(),
  getDataSchemas(),
  getTemplateSchemas(),
  getAnalyticsSchemas(),
  getArtifactSchemas(),
  getPlaylistSchemas(),
  getSemanticSchemas(),
  getAvailableFunctions(),
  hasFunction(name),
  getFunctionSchema(name),
  isTemplateFunction(name)
};
```

#### 1.2 FunctionValidator Module
**Purpose:** Schema validation and argument normalization

**Location:** `js/functions/function-validator.js`

**Responsibilities:**
- Validate function arguments against schema
- Required parameter checking
- Type validation with coercion
- Enum validation with case-insensitive matching
- Argument normalization

**API:**
```javascript
export const FunctionValidator = {
  validateFunctionArgs(functionName, args),
  validateStreams(streams),
  validateDataQuery()
};
```

#### 1.3 FunctionRetryHandler Module
**Purpose:** Centralize retry logic coordination

**Location:** `js/functions/function-retry-handler.js`

**Responsibilities:**
- Delegate to FunctionRetry.withRetry
- Execute with or without retry
- Handle retry-specific errors

**API:**
```javascript
export const FunctionRetryHandler = {
  executeWithRetry(executorFn, functionName),
  executeWithoutRetry(executorFn, functionName)
};
```

#### 1.4 TemplateExecutorRouter Module
**Purpose:** Handle template function execution

**Location:** `js/functions/executors/template-executor-router.js`

**Responsibilities:**
- Identify template functions
- Route to template executors
- Handle template-specific errors

**API:**
```javascript
export const TemplateExecutorRouter = {
  isTemplateFunction(functionName),
  executeTemplate(functionName, args)
};
```

#### 1.5 FunctionExecutor Module
**Purpose:** Orchestrate function execution

**Location:** `js/functions/function-executor.js`

**Responsibilities:**
- Execution routing coordination
- Abort signal handling
- Stream validation
- Executor lookup
- Error formatting

**API:**
```javascript
export const FunctionExecutor = {
  execute(functionName, args, streams, options)
};
```

### Phase 2: Refactor index.js to Facade

**New index.js structure:**
```javascript
// Import new modules
import { SchemaRegistry } from './schema-registry.js';
import { FunctionValidator } from './function-validator.js';
import { FunctionRetryHandler } from './function-retry-handler.js';
import { TemplateExecutorRouter } from './executors/template-executor-router.js';
import { FunctionExecutor } from './function-executor.js';

// Re-export for backward compatibility
export const Functions = {
  // Execution - delegates to FunctionExecutor
  execute: FunctionExecutor.execute,
  
  // Schema access - delegates to SchemaRegistry
  schemas: [],
  allSchemas: [],
  templateSchemas: [],
  getAllSchemas: SchemaRegistry.getAllSchemas,
  getEnabledSchemas: SchemaRegistry.getEnabledSchemas,
  getDataSchemas: SchemaRegistry.getDataSchemas,
  getTemplateSchemas: SchemaRegistry.getTemplateSchemas,
  getAnalyticsSchemas: SchemaRegistry.getAnalyticsSchemas,
  getArtifactSchemas: SchemaRegistry.getArtifactSchemas,
  
  // Discovery - delegates to SchemaRegistry
  getAvailableFunctions: SchemaRegistry.getAvailableFunctions,
  hasFunction: SchemaRegistry.hasFunction,
  getFunctionSchema: SchemaRegistry.getFunctionSchema
};
```

### Phase 3: Update Imports (Zero Breaking Changes)

**No changes needed** - all imports remain:
```javascript
import { Functions } from './functions/index.js';
```

The facade pattern ensures 100% backward compatibility.

### Phase 4: Testing

**Existing test:** `tests/unit/function-retry-delegation.test.js`
- Should pass without modifications (tests FunctionRetry directly)

**Verification:**
1. Run existing test suite
2. Manual testing of function execution
3. Verify all 4 import locations work correctly

## Implementation Order

### Step 1: SchemaRegistry (Low Risk)
- Create `js/functions/schema-registry.js`
- Extract schema aggregation functions
- Extract function discovery functions
- Add JSDoc documentation

### Step 2: FunctionValidator (Low Risk)
- Create `js/functions/function-validator.js`
- Extract validateFunctionArgs function
- Add JSDoc documentation

### Step 3: FunctionRetryHandler (Low Risk)
- Create `js/functions/function-retry-handler.js`
- Extract retry logic coordination
- Add JSDoc documentation

### Step 4: TemplateExecutorRouter (Low Risk)
- Create `js/functions/executors/template-executor-router.js`
- Extract template routing logic
- Add JSDoc documentation

### Step 5: FunctionExecutor (Medium Risk)
- Create `js/functions/function-executor.js`
- Extract main execution logic
- Integrate all new modules
- Add JSDoc documentation

### Step 6: Refactor index.js (Medium Risk)
- Replace implementation with facade
- Import all new modules
- Maintain 100% backward compatibility
- Update schema population logic

### Step 7: Testing (Critical)
- Run `npm test` for existing test suite
- Verify all imports work
- Manual testing if needed

## Success Criteria

1. ✅ All tests pass
2. ✅ No breaking changes to existing API
3. ✅ Reduced index.js complexity (< 100 lines)
4. ✅ Each module has single responsibility
5. ✅ Complete JSDoc documentation
6. ✅ No circular dependencies

## Risk Mitigation

**Low Risk:**
- SchemaRegistry - pure functions, no side effects
- FunctionValidator - pure functions, no side effects
- FunctionRetryHandler - delegates to existing code
- TemplateExecutorRouter - simple routing logic

**Medium Risk:**
- FunctionExecutor - orchestration logic
- index.js refactor - facade pattern

**Rollback Plan:**
- Keep original index.js as index.js.backup
- Git commit after each successful module extraction
- Can revert to working state at any point

## Estimated Timeline

- SchemaRegistry: 10 minutes
- FunctionValidator: 10 minutes
- FunctionRetryHandler: 5 minutes
- TemplateExecutorRouter: 5 minutes
- FunctionExecutor: 15 minutes
- index.js refactor: 10 minutes
- Testing: 10 minutes

**Total:** ~65 minutes
