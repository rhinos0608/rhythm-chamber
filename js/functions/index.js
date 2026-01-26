/**
 * Function Calling Facade Module
 *
 * Unified entry point for all function calling capabilities.
 * Refactored from God object to focused modules with facade pattern.
 *
 * Architecture:
 * - SchemaRegistry: Schema aggregation and discovery
 * - FunctionValidator: Schema validation and normalization
 * - FunctionRetryHandler: Retry logic coordination
 * - TemplateExecutorRouter: Template function routing
 * - FunctionExecutor: Execution orchestration
 *
 * This facade maintains 100% backward compatibility with existing imports.
 *
 * HNW Considerations:
 * - Hierarchy: Single entry point for all function operations
 * - Network: Centralizes error handling and logging
 * - Wave: Consistent async execution with retry logic
 */

import { SchemaRegistry } from './schema-registry.js';
import { FunctionValidator } from './function-validator.js';
import { FunctionRetryHandler } from './function-retry-handler.js';
import { TemplateExecutorRouter } from './executors/template-executor-router.js';
import { FunctionExecutor } from './function-executor.js';

// ==========================================
// Initialization State (Must be first to avoid circular dependency)
// ==========================================

let isInitialized = false;

/**
 * Initialize schema arrays - must be called after all modules load
 * This breaks the circular dependency by deferring SchemaRegistry access
 * until after all modules have completed their imports
 *
 * Can be called explicitly, or will auto-defer to first access
 */
export function initialize() {
    if (isInitialized) {
        return;
    }
    isInitialized = true;

    try {
        Functions.schemas = SchemaRegistry.getAllSchemas();
        Functions.templateSchemas = SchemaRegistry.getTemplateSchemas();
        Functions.allSchemas = SchemaRegistry.getAllSchemas();

        console.log(`[Functions] Loaded ${Functions.allSchemas.length} function schemas (refactored architecture)`);
    } catch (error) {
        console.error('[Functions] Failed to initialize schema arrays:', error);
        // Set empty arrays to prevent undefined errors
        Functions.schemas = [];
        Functions.templateSchemas = [];
        Functions.allSchemas = [];
    }
}

/**
 * Lazy initialization helper
 * Auto-initializes on first access if not already initialized
 */
function ensureInitialized() {
    if (!isInitialized) {
        initialize();
    }
}

// ==========================================
// Unified Execute Function
// ==========================================

/**
 * Execute a function call against the user's streaming data
 * Routes to appropriate executor based on function name
 *
 * Delegates to FunctionExecutor.execute for actual implementation
 *
 * HNW Defensive: Validates arguments against schema to catch drift early
 *
 * @param {string} functionName - Name of the function to execute
 * @param {Object} args - Arguments passed by the LLM
 * @param {Array} streams - User's streaming data
 * @param {Object} [options] - Optional configuration
 * @param {AbortSignal} [options.signal] - AbortController signal for cancellation
 * @returns {Promise<Object>} Result to send back to the LLM
 */
async function executeFunction(functionName, args, streams, options = {}) {
    return await FunctionExecutor.execute(functionName, args, streams, options);
}

// ==========================================
// Schema Validation (Legacy Support)
// ==========================================

/**
 * Validate function arguments against schema definition
 * HNW Defensive: Catches schema drift and invalid LLM outputs
 *
 * @deprecated Use FunctionValidator.validateFunctionArgs directly
 * @param {string} functionName - Name of function
 * @param {Object} args - Arguments to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateFunctionArgs(functionName, args) {
    return FunctionValidator.validateFunctionArgs(functionName, args);
}

// ==========================================
// Schema Aggregation (Legacy Support)
// ==========================================

/**
 * Get all available function schemas
 * Combines data, template, analytics, artifact, and playlist schemas
 *
 * @deprecated Use SchemaRegistry.getAllSchemas directly
 */
function getAllSchemas() {
    ensureInitialized(); // Lazy initialization on first access
    return SchemaRegistry.getAllSchemas();
}

/**
 * Get artifact schemas only (visualization-producing functions)
 *
 * @deprecated Use SchemaRegistry.getArtifactSchemas directly
 */
function getArtifactSchemas() {
    ensureInitialized(); // Lazy initialization on first access
    return SchemaRegistry.getArtifactSchemas();
}

/**
 * Get core data query schemas only
 *
 * @deprecated Use SchemaRegistry.getDataSchemas directly
 */
function getDataSchemas() {
    ensureInitialized(); // Lazy initialization on first access
    return SchemaRegistry.getDataSchemas();
}

/**
 * Get template schemas only
 *
 * @deprecated Use SchemaRegistry.getTemplateSchemas directly
 */
function getTemplateSchemas() {
    ensureInitialized(); // Lazy initialization on first access
    return SchemaRegistry.getTemplateSchemas();
}

/**
 * Get analytics schemas only
 *
 * @deprecated Use SchemaRegistry.getAnalyticsSchemas directly
 */
function getAnalyticsSchemas() {
    ensureInitialized(); // Lazy initialization on first access
    return SchemaRegistry.getAnalyticsSchemas();
}

// ==========================================
// Function Discovery (Legacy Support)
// ==========================================

/**
 * Get list of all available function names
 *
 * @deprecated Use SchemaRegistry.getAvailableFunctions directly
 */
function getAvailableFunctions() {
    ensureInitialized(); // Lazy initialization on first access
    return SchemaRegistry.getAvailableFunctions();
}

/**
 * Get schemas filtered by enabled tools setting
 * Returns only schemas for tools the user has enabled
 *
 * @deprecated Use SchemaRegistry.getEnabledSchemas directly
 * @returns {Array} Enabled function schemas
 */
function getEnabledSchemas() {
    ensureInitialized(); // Lazy initialization on first access
    return SchemaRegistry.getEnabledSchemas();
}

/**
 * Check if a function exists
 *
 * @deprecated Use SchemaRegistry.hasFunction directly
 */
function hasFunction(name) {
    ensureInitialized(); // Lazy initialization on first access
    return SchemaRegistry.hasFunction(name);
}

/**
 * Get function schema by name
 *
 * @deprecated Use SchemaRegistry.getFunctionSchema directly
 */
function getFunctionSchema(name) {
    ensureInitialized(); // Lazy initialization on first access
    return SchemaRegistry.getFunctionSchema(name);
}

// ==========================================
// Public API
// ==========================================

// ES Module export - Facade pattern for backward compatibility
export const Functions = {
    // Execution - delegates to FunctionExecutor
    execute: executeFunction,

    // Schema access - static arrays populated on load
    schemas: [], // Populated after load
    allSchemas: [], // Populated after load
    templateSchemas: [], // Populated after load

    // Schema getters (dynamic) - delegates to SchemaRegistry
    getAllSchemas,
    getEnabledSchemas,
    getDataSchemas,
    getTemplateSchemas,
    getAnalyticsSchemas,
    getArtifactSchemas,

    // Discovery - delegates to SchemaRegistry
    getAvailableFunctions,
    hasFunction,
    getFunctionSchema
};

// Also export individual modules for direct access if needed
export { SchemaRegistry } from './schema-registry.js';
export { FunctionValidator } from './function-validator.js';
export { FunctionRetryHandler } from './function-retry-handler.js';
export { TemplateExecutorRouter } from './executors/template-executor-router.js';
export { FunctionExecutor } from './function-executor.js';

// ==========================================
// Auto-Initialization
// ==========================================

// Auto-initialize in browser after DOM ready (safe deferred initialization)
// Use typeof document check to prevent Node.js test failures
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // Browser environment - wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        // DOM is already loaded, initialize after current stack completes
        // Use setTimeout to defer until after all module imports complete
        setTimeout(initialize, 0);
    }
} else if (typeof window === 'undefined') {
    // Node.js environment - initialize after modules load
    // Defer to next tick to break circular dependency
    if (typeof process !== 'undefined' && process.nextTick) {
        process.nextTick(initialize);
    } else {
        setTimeout(initialize, 0);
    }
}

console.log('[Functions] Facade module loaded (refactored from God object)');
