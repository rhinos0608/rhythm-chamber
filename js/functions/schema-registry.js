/**
 * Schema Registry Module
 *
 * Centralizes schema aggregation and discovery for all function types.
 * Provides filtered access to schemas based on user settings.
 *
 * Responsibilities:
 * - Aggregate all 6 schema types (data, template, analytics, artifact, playlist, semantic)
 * - Provide filtered access (all, enabled, by type)
 * - Function discovery (hasFunction, getFunctionSchema)
 * - Template function identification
 *
 * @module SchemaRegistry
 */

import { DataQuerySchemas } from './schemas/data-queries.js';
import { TemplateQuerySchemas } from './schemas/template-queries.js';
import { AnalyticsQuerySchemas } from './schemas/analytics-queries.js';
import { ArtifactQuerySchemas } from './schemas/artifact-queries.js';
import { PlaylistQuerySchemas } from './schemas/playlist-queries.js';
import { SemanticQuerySchemas } from './schemas/semantic-queries.js';
import { Settings } from '../settings/index.js';

// ==========================================
// Private Helpers
// ==========================================

/**
 * Get all available function schemas
 * Combines data, template, analytics, artifact, playlist, and semantic schemas
 * @returns {Array<Object>} All function schemas
 */
function getAllSchemas() {
    return [
        ...(DataQuerySchemas || []),
        ...(TemplateQuerySchemas || []),
        ...(AnalyticsQuerySchemas || []),
        ...(ArtifactQuerySchemas || []),
        ...(PlaylistQuerySchemas || []),
        ...(SemanticQuerySchemas || [])
    ];
}

/**
 * Get list of template function names for identification
 * @returns {Array<string>} Template function names
 */
function getTemplateFunctionNames() {
    return TemplateQuerySchemas.map(s => s.function.name);
}

// ==========================================
// Public API
// ==========================================

/**
 * Schema Registry
 * Provides centralized schema aggregation and discovery
 */
export const SchemaRegistry = {
    /**
     * Get all available function schemas
     * Combines data, template, analytics, artifact, and playlist schemas
     * @returns {Array<Object>} All function schemas
     */
    getAllSchemas,

    /**
     * Get schemas filtered by enabled tools setting
     * Returns only schemas for tools the user has enabled
     * @returns {Array<Object>} Enabled function schemas
     */
    getEnabledSchemas() {
        const allSchemas = getAllSchemas();

        // Access Settings via ES module import (no window dependency)
        if (Settings?.getEnabledTools) {
            const enabledTools = Settings.getEnabledTools();

            // null means all tools are enabled
            if (enabledTools === null) {
                return allSchemas;
            }

            // Filter to only enabled tools
            const filtered = allSchemas.filter(schema =>
                enabledTools.includes(schema.function.name)
            );

            console.log(`[SchemaRegistry] Using ${filtered.length}/${allSchemas.length} enabled tools`);
            return filtered;
        }

        // Default: all schemas enabled
        return allSchemas;
    },

    /**
     * Get core data query schemas only
     * @returns {Array<Object>} Data query schemas
     */
    getDataSchemas() {
        return DataQuerySchemas || [];
    },

    /**
     * Get template schemas only
     * @returns {Array<Object>} Template query schemas
     */
    getTemplateSchemas() {
        return TemplateQuerySchemas || [];
    },

    /**
     * Get analytics schemas only
     * @returns {Array<Object>} Analytics query schemas
     */
    getAnalyticsSchemas() {
        return AnalyticsQuerySchemas || [];
    },

    /**
     * Get artifact schemas only (visualization-producing functions)
     * @returns {Array<Object>} Artifact query schemas
     */
    getArtifactSchemas() {
        return ArtifactQuerySchemas || [];
    },

    /**
     * Get playlist schemas only
     * @returns {Array<Object>} Playlist query schemas
     */
    getPlaylistSchemas() {
        return PlaylistQuerySchemas || [];
    },

    /**
     * Get semantic schemas only
     * @returns {Array<Object>} Semantic query schemas
     */
    getSemanticSchemas() {
        return SemanticQuerySchemas || [];
    },

    /**
     * Get list of all available function names
     * @returns {Array<string>} Function names
     */
    getAvailableFunctions() {
        return getAllSchemas().map(s => s.function.name);
    },

    /**
     * Check if a function exists
     * @param {string} name - Function name to check
     * @returns {boolean} True if function exists
     */
    hasFunction(name) {
        return getAllSchemas().some(s => s.function.name === name);
    },

    /**
     * Get function schema by name
     * @param {string} name - Function name
     * @returns {Object|undefined} Function schema or undefined
     */
    getFunctionSchema(name) {
        return getAllSchemas().find(s => s.function.name === name);
    },

    /**
     * Check if a function is a template function
     * Template functions don't require user streams
     * @param {string} functionName - Function name to check
     * @returns {boolean} True if function is a template function
     */
    isTemplateFunction(functionName) {
        return getTemplateFunctionNames().includes(functionName);
    }
};

console.log('[SchemaRegistry] Module loaded');
