/**
 * Function Executor Module
 *
 * Orchestrates function execution routing and coordination.
 * Integrates all specialized modules for complete function execution.
 *
 * Responsibilities:
 * - Function execution routing coordination
 * - Abort signal handling
 * - Stream validation
 * - Executor lookup and delegation
 * - Error formatting and handling
 * - Template vs data function routing
 *
 * @module FunctionExecutor
 */

import { SchemaRegistry } from './schema-registry.js';
import { FunctionValidator } from './function-validator.js';
import { FunctionRetryHandler } from './function-retry-handler.js';
import { TemplateExecutorRouter } from './executors/template-executor-router.js';
import { DataExecutors } from './executors/data-executors.js';
import { AnalyticsExecutors } from './executors/analytics-executors.js';
import { ArtifactExecutors } from './executors/artifact-executors.js';
import { PlaylistExecutors } from './executors/playlist-executors.js';
import { SemanticExecutors } from './executors/semantic-executors.js';

// ==========================================
// Private Helpers
// ==========================================

/**
 * Execute a data function with streams
 * Data functions require user streaming data
 *
 * @param {string} functionName - Name of function to execute
 * @param {Object} args - Normalized arguments
 * @param {Array} streams - User's streaming data
 * @returns {Promise<Object>} Result object or error object
 */
async function executeDataFunction(functionName, args, streams) {
    // Validate streams for data functions
    const streamsValidation = FunctionValidator.validateStreams(streams);
    if (!streamsValidation.valid) {
        return { error: streamsValidation.error || "No streaming data available." };
    }

    // Validate DataQuery is available
    const dataQueryValidation = FunctionValidator.validateDataQuery();
    if (!dataQueryValidation.valid) {
        return { error: dataQueryValidation.error || "DataQuery module not loaded." };
    }

    // Find executor (includes artifact, playlist, and semantic executors)
    const allExecutors = {
        ...DataExecutors,
        ...AnalyticsExecutors,
        ...ArtifactExecutors,
        ...PlaylistExecutors,
        ...SemanticExecutors
    };

    const executor = allExecutors[functionName];
    if (!executor) {
        return { error: `Unknown function: ${functionName}` };
    }

    // Execute with retry logic if available
    if (FunctionRetryHandler.isRetryAvailable()) {
        try {
            return await FunctionRetryHandler.executeWithRetry(
                () => Promise.resolve(executor(args, streams)),
                functionName
            );
        } catch (err) {
            return { error: `Failed to execute ${functionName}: ${err.message}` };
        }
    }

    // Fallback without retry
    try {
        return await FunctionRetryHandler.executeWithoutRetry(
            () => Promise.resolve(executor(args, streams)),
            functionName
        );
    } catch (err) {
        return { error: `Failed to execute ${functionName}: ${err.message}` };
    }
}

// ==========================================
// Public API
// ==========================================

/**
 * Function Executor
 * Orchestrates function execution routing and coordination
 */
export const FunctionExecutor = {
    /**
     * Execute a function call against the user's streaming data
     * Routes to appropriate executor based on function name
     *
     * HNW Defensive: Validates arguments against schema to catch drift early
     *
     * Execution flow:
     * 1. Check for abort signal
     * 2. Validate function exists
     * 3. Validate and normalize arguments
     * 4. Route to template or data executor
     * 5. Execute with retry logic
     * 6. Format and return result
     *
     * @param {string} functionName - Name of the function to execute
     * @param {Object} args - Arguments passed by the LLM
     * @param {Array} streams - User's streaming data
     * @param {Object} [options] - Optional configuration
     * @param {AbortSignal} [options.signal] - AbortController signal for cancellation
     * @returns {Promise<Object>} Result to send back to the LLM
     */
    async execute(functionName, args, streams, options = {}) {
        const { signal } = options;

        // Check for abort before any processing
        if (signal?.aborted) {
            return { error: 'Operation cancelled', aborted: true };
        }

        // HNW Hierarchy: Check function exists before any processing
        if (!SchemaRegistry.hasFunction(functionName)) {
            console.warn(`[FunctionExecutor] Unknown function requested: ${functionName}`);
            return { error: `Unknown function: ${functionName}` };
        }

        // HNW Defensive: Validate arguments against schema
        const argsValidation = FunctionValidator.validateFunctionArgs(functionName, args);
        if (!argsValidation.valid) {
            console.warn(`[FunctionExecutor] Schema validation failed for ${functionName}:`, argsValidation.errors);
            return {
                error: `Invalid arguments for ${functionName}: ${argsValidation.errors.join(', ')}`,
                validationErrors: argsValidation.errors
            };
        }

        // Use normalized arguments (fixes enum case mismatches, type coercions)
        const normalizedArgs = argsValidation.normalizedArgs || args;

        // Template functions don't require user streams
        if (TemplateExecutorRouter.isTemplateFunction(functionName)) {
            return await TemplateExecutorRouter.executeTemplate(functionName, normalizedArgs);
        }

        // Data functions require streams
        return await executeDataFunction(functionName, normalizedArgs, streams);
    }
};

console.log('[FunctionExecutor] Module loaded');
