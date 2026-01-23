/**
 * Artifacts Facade Module
 * 
 * Unified entry point for the artifact subsystem.
 * Provides spec creation, validation, and rendering capabilities.
 * 
 * Usage:
 *   import { Artifacts } from './artifacts/index.js';
 *   
 *   const spec = Artifacts.createLineChart({ ... });
 *   const validation = Artifacts.validate(spec);
 *   if (validation.valid) {
 *       Artifacts.render(validation.sanitized, container);
 *   }
 * 
 * @module artifacts
 */

import { createLogger } from '../utils/logger.js';
import {
    ArtifactSpec,
    ARTIFACT_TYPES,
    FIELD_TYPES,
    createSpec,
    createLineChart,
    createBarChart,
    createTimeline,
    createTable
} from './artifact-spec.js';
import { ArtifactValidation, validateArtifactSpec } from './validation.js';
import { ArtifactRenderer, renderArtifact } from './renderer.js';

const logger = createLogger('Artifacts');

// ==========================================
// Unified API
// ==========================================

/**
 * Create and validate an artifact spec in one step
 * 
 * @param {Object} options - Spec options
 * @returns {{ valid: boolean, spec: Object|null, errors: string[] }}
 */
function create(options) {
    try {
        const spec = createSpec(options);
        const validation = validateArtifactSpec(spec);

        return {
            valid: validation.valid,
            spec: validation.sanitized,
            errors: validation.errors
        };
    } catch (err) {
        logger.error('Failed to create artifact', { error: err.message });
        return {
            valid: false,
            spec: null,
            errors: [err.message]
        };
    }
}

/**
 * Parse artifact spec from AI function call output
 * Validates and sanitizes the spec
 * 
 * @param {Object} rawSpec - Raw spec from function call
 * @returns {{ valid: boolean, spec: Object|null, errors: string[] }}
 */
function parseFromFunctionCall(rawSpec) {
    if (!rawSpec || typeof rawSpec !== 'object') {
        return {
            valid: false,
            spec: null,
            errors: ['Invalid artifact spec: not an object']
        };
    }

    const validation = validateArtifactSpec(rawSpec);

    if (!validation.valid) {
        logger.warn('Function call artifact failed validation', { errors: validation.errors });
    }

    return {
        valid: validation.valid,
        spec: validation.sanitized,
        errors: validation.errors
    };
}

/**
 * Check if a function call result contains an artifact
 * 
 * @param {Object} result - Function call result
 * @returns {boolean}
 */
function hasArtifact(result) {
    return result &&
        typeof result === 'object' &&
        result.artifact &&
        result.artifact.type === 'artifact';
}

/**
 * Extract artifact from function call result
 * 
 * @param {Object} result - Function call result
 * @returns {Object|null} Validated artifact spec or null
 */
function extractArtifact(result) {
    if (!hasArtifact(result)) {
        return null;
    }

    const parsed = parseFromFunctionCall(result.artifact);
    return parsed.valid ? parsed.spec : null;
}

// ==========================================
// Public API
// ==========================================

export const Artifacts = {
    // Type constants
    TYPES: ARTIFACT_TYPES,
    FIELD_TYPES,

    // Spec builders
    createSpec,
    createLineChart,
    createBarChart,
    createTimeline,
    createTable,

    // Unified creation
    create,

    // Validation
    validate: validateArtifactSpec,

    // Rendering
    render: renderArtifact,

    // Function call integration
    parseFromFunctionCall,
    hasArtifact,
    extractArtifact,

    // Sub-modules (for advanced usage)
    Spec: ArtifactSpec,
    Validation: ArtifactValidation,
    Renderer: ArtifactRenderer
};

// Also export individual items for tree-shaking
export {
    ARTIFACT_TYPES,
    FIELD_TYPES,
    createSpec,
    createLineChart,
    createBarChart,
    createTimeline,
    createTable,
    validateArtifactSpec,
    renderArtifact
};

logger.info('Artifacts facade loaded');
