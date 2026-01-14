/**
 * Function Calling Facade Module
 * 
 * Unified entry point for all function calling capabilities.
 * Re-exports schemas and provides centralized execute() function.
 * 
 * HNW Considerations:
 * - Hierarchy: Single entry point for all function operations
 * - Network: Centralizes error handling and logging
 * - Wave: Consistent async execution with retry logic
 */

// ==========================================
// Unified Execute Function
// ==========================================

/**
 * Execute a function call against the user's streaming data
 * Routes to appropriate executor based on function name
 * 
 * @param {string} functionName - Name of the function to execute
 * @param {Object} args - Arguments passed by the LLM
 * @param {Array} streams - User's streaming data
 * @returns {Promise<Object>} Result to send back to the LLM
 */
async function executeFunction(functionName, args, streams) {
    const validation = window.FunctionValidation;
    const retry = window.FunctionRetry;

    // Template functions don't require user streams
    const templateFunctionNames = window.TemplateFunctionNames || [];

    if (templateFunctionNames.includes(functionName)) {
        const executor = window.TemplateExecutors?.[functionName];
        if (!executor) {
            return { error: `Unknown template function: ${functionName}` };
        }

        try {
            return await Promise.resolve(executor(args));
        } catch (err) {
            return { error: `Template function error: ${err.message}` };
        }
    }

    // Validate streams for data functions
    const streamsValidation = validation?.validateStreams(streams) || { valid: streams?.length > 0 };
    if (!streamsValidation.valid) {
        return { error: streamsValidation.error || "No streaming data available." };
    }

    // Validate DataQuery is available
    const dataQueryValidation = validation?.validateDataQuery() || { valid: !!window.DataQuery };
    if (!dataQueryValidation.valid) {
        return { error: dataQueryValidation.error || "DataQuery module not loaded." };
    }

    // Find executor
    const allExecutors = {
        ...window.DataExecutors,
        ...window.AnalyticsExecutors
    };

    const executor = allExecutors[functionName];
    if (!executor) {
        return { error: `Unknown function: ${functionName}` };
    }

    // Execute with retry logic
    if (retry?.withRetry) {
        try {
            return await retry.withRetry(
                () => Promise.resolve(executor(args, streams)),
                functionName
            );
        } catch (err) {
            return { error: `Failed to execute ${functionName}: ${err.message}` };
        }
    }

    // Fallback without retry
    try {
        return await Promise.resolve(executor(args, streams));
    } catch (err) {
        return { error: `Failed to execute ${functionName}: ${err.message}` };
    }
}

// ==========================================
// Schema Aggregation
// ==========================================

/**
 * Get all available function schemas
 * Combines data, template, and analytics schemas
 */
function getAllSchemas() {
    return [
        ...(window.DataQuerySchemas || []),
        ...(window.TemplateQuerySchemas || []),
        ...(window.AnalyticsQuerySchemas || [])
    ];
}

/**
 * Get core data query schemas only
 */
function getDataSchemas() {
    return window.DataQuerySchemas || [];
}

/**
 * Get template schemas only
 */
function getTemplateSchemas() {
    return window.TemplateQuerySchemas || [];
}

/**
 * Get analytics schemas only
 */
function getAnalyticsSchemas() {
    return window.AnalyticsQuerySchemas || [];
}

// ==========================================
// Function Discovery
// ==========================================

/**
 * Get list of all available function names
 */
function getAvailableFunctions() {
    return getAllSchemas().map(s => s.function.name);
}

/**
 * Get schemas filtered by enabled tools setting
 * Returns only schemas for tools the user has enabled
 * @returns {Array} Enabled function schemas
 */
function getEnabledSchemas() {
    const allSchemas = getAllSchemas();

    // Check if Settings module is available
    if (!window.Settings?.getEnabledTools) {
        return allSchemas; // All enabled by default
    }

    const enabledTools = window.Settings.getEnabledTools();

    // null means all tools are enabled
    if (enabledTools === null) {
        return allSchemas;
    }

    // Filter to only enabled tools
    const filtered = allSchemas.filter(schema =>
        enabledTools.includes(schema.function.name)
    );

    console.log(`[Functions] Using ${filtered.length}/${allSchemas.length} enabled tools`);
    return filtered;
}

/**
 * Check if a function exists
 */
function hasFunction(name) {
    return getAllSchemas().some(s => s.function.name === name);
}

/**
 * Get function schema by name
 */
function getFunctionSchema(name) {
    return getAllSchemas().find(s => s.function.name === name);
}

// ==========================================
// Public API
// ==========================================

// ES Module export
export const Functions = {
    // Execution
    execute: executeFunction,

    // Schema access
    schemas: [], // Populated after load
    allSchemas: [], // Populated after load
    templateSchemas: [], // Populated after load

    // Schema getters (dynamic)
    getAllSchemas,
    getEnabledSchemas,
    getDataSchemas,
    getTemplateSchemas,
    getAnalyticsSchemas,

    // Discovery
    getAvailableFunctions,
    hasFunction,
    getFunctionSchema
};

// Keep window global for backwards compatibility
if (typeof window !== 'undefined') {
    window.Functions = Functions;
}

// Populate static schema arrays after all modules load
document.addEventListener('DOMContentLoaded', () => {
    Functions.schemas = getDataSchemas();
    Functions.templateSchemas = getTemplateSchemas();
    Functions.allSchemas = getAllSchemas();

    console.log(`[Functions] Loaded ${Functions.allSchemas.length} function schemas`);
});

// Also try to populate immediately if DOM is already loaded
if (document.readyState !== 'loading') {
    setTimeout(() => {
        Functions.schemas = getDataSchemas();
        Functions.templateSchemas = getTemplateSchemas();
        Functions.allSchemas = getAllSchemas();

        console.log(`[Functions] Loaded ${Functions.allSchemas.length} function schemas`);
    }, 0);
}

console.log('[Functions] Facade module loaded');

