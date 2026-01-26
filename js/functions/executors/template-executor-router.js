/**
 * Template Executor Router Module
 *
 * Handles routing and execution of template functions.
 * Template functions don't require user streaming data.
 *
 * Responsibilities:
 * - Identify template functions
 * - Route to template executors
 * - Handle template-specific errors
 * - Execute template functions safely
 *
 * @module TemplateExecutorRouter
 */

import { SchemaRegistry } from '../schema-registry.js';
import { TemplateExecutors } from './template-executors.js';

// ==========================================
// Public API
// ==========================================

/**
 * Template Executor Router
 * Handles template function execution
 */
export const TemplateExecutorRouter = {
    /**
     * Check if a function is a template function
     * Template functions don't require user streams
     *
     * @param {string} functionName - Function name to check
     * @returns {boolean} True if function is a template function
     */
    isTemplateFunction(functionName) {
        return SchemaRegistry.isTemplateFunction(functionName);
    },

    /**
     * Execute a template function
     * Template functions don't require user streaming data
     *
     * @param {string} functionName - Name of template function to execute
     * @param {Object} args - Normalized arguments
     * @returns {Promise<Object>} Result object or error object
     */
    async executeTemplate(functionName, args) {
        const executor = TemplateExecutors?.[functionName];
        
        if (!executor) {
            return { error: `Unknown template function: ${functionName}` };
        }

        try {
            const result = await Promise.resolve(executor(args));
            return result;
        } catch (err) {
            return { error: `Template function error: ${err.message}` };
        }
    },

    /**
     * Get all template function names
     * @returns {Array<string>} Template function names
     */
    getTemplateFunctionNames() {
        return SchemaRegistry.getTemplateSchemas().map(s => s.function.name);
    }
};

console.log('[TemplateExecutorRouter] Module loaded');
