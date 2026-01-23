/**
 * Artifact Validation Module
 * 
 * Validates ArtifactSpec objects against schema to prevent:
 * - Malicious or malformed specs
 * - Oversized data arrays
 * - Unknown field injection
 * - XSS via text fields
 * 
 * @module artifacts/validation
 */

import { createLogger } from '../utils/logger.js';
import {
    ARTIFACT_TYPES,
    FIELD_TYPES,
    MAX_DATA_ROWS,
    MAX_ANNOTATIONS,
    MAX_EXPLANATION_LINES
} from './artifact-spec.js';

const logger = createLogger('ArtifactValidation');

// ==========================================
// Allowed Fields (Strict Allowlist)
// ==========================================

const ALLOWED_TOP_LEVEL_FIELDS = new Set([
    'type',
    'artifactId',
    'title',
    'subtitle',
    'view',
    'data',
    'annotations',
    'explanation'
]);

const ALLOWED_VIEW_FIELDS = new Set([
    'kind',
    'x',
    'y',
    'series',
    'horizontal',
    'columns',
    'dateField',
    'labelField'
]);

const ALLOWED_AXIS_FIELDS = new Set([
    'field',
    'type',
    'domain'
]);

// ==========================================
// Validation Functions
// ==========================================

/**
 * Validate an ArtifactSpec object
 * 
 * @param {Object} spec - The spec to validate
 * @returns {{ valid: boolean, errors: string[], sanitized: Object|null }}
 */
export function validateArtifactSpec(spec) {
    const errors = [];

    // Basic type check
    if (!spec || typeof spec !== 'object') {
        return { valid: false, errors: ['Spec must be an object'], sanitized: null };
    }

    // Check for unknown top-level fields
    for (const key of Object.keys(spec)) {
        if (!ALLOWED_TOP_LEVEL_FIELDS.has(key)) {
            errors.push(`Unknown field: ${key}`);
        }
    }

    // Required fields
    if (spec.type !== 'artifact') {
        errors.push('type must be "artifact"');
    }

    if (!spec.artifactId || typeof spec.artifactId !== 'string') {
        errors.push('artifactId is required and must be a string');
    }

    if (!spec.title || typeof spec.title !== 'string') {
        errors.push('title is required and must be a string');
    }

    // Title length limit
    if (spec.title && spec.title.length > 200) {
        errors.push('title must be 200 characters or less');
    }

    // Subtitle validation (optional)
    if (spec.subtitle !== null && spec.subtitle !== undefined) {
        if (typeof spec.subtitle !== 'string') {
            errors.push('subtitle must be a string or null');
        } else if (spec.subtitle.length > 200) {
            errors.push('subtitle must be 200 characters or less');
        }
    }

    // View validation
    const viewErrors = validateView(spec.view);
    errors.push(...viewErrors);

    // Data validation
    const dataErrors = validateData(spec.data);
    errors.push(...dataErrors);

    // Annotations validation
    const annotationErrors = validateAnnotations(spec.annotations);
    errors.push(...annotationErrors);

    // Explanation validation
    const explanationErrors = validateExplanation(spec.explanation);
    errors.push(...explanationErrors);

    if (errors.length > 0) {
        logger.warn('Artifact validation failed', { errors, artifactId: spec.artifactId });
        return { valid: false, errors, sanitized: null };
    }

    // Create sanitized copy
    const sanitized = sanitizeSpec(spec);

    logger.debug('Artifact validation passed', { artifactId: spec.artifactId });
    return { valid: true, errors: [], sanitized };
}

/**
 * Validate the view configuration
 * 
 * @param {Object} view - View object
 * @returns {string[]} Array of error messages
 */
function validateView(view) {
    const errors = [];

    if (!view || typeof view !== 'object') {
        errors.push('view is required and must be an object');
        return errors;
    }

    // Check for unknown view fields
    for (const key of Object.keys(view)) {
        if (!ALLOWED_VIEW_FIELDS.has(key)) {
            errors.push(`Unknown view field: ${key}`);
        }
    }

    // Validate kind
    const validKinds = Object.values(ARTIFACT_TYPES);
    if (!view.kind || !validKinds.includes(view.kind)) {
        errors.push(`view.kind must be one of: ${validKinds.join(', ')}`);
    }

    // Validate axes for chart types
    if (view.kind === ARTIFACT_TYPES.LINE_CHART || view.kind === ARTIFACT_TYPES.BAR_CHART) {
        if (view.x) {
            errors.push(...validateAxis(view.x, 'x'));
        }
        if (view.y) {
            errors.push(...validateAxis(view.y, 'y'));
        }
    }

    // Validate columns for table type
    if (view.kind === ARTIFACT_TYPES.TABLE) {
        if (!Array.isArray(view.columns) || view.columns.length === 0) {
            errors.push('Table view requires columns array');
        } else {
            for (let i = 0; i < view.columns.length; i++) {
                const col = view.columns[i];
                if (!col.field || typeof col.field !== 'string') {
                    errors.push(`Column ${i} missing field`);
                }
                if (!col.label || typeof col.label !== 'string') {
                    errors.push(`Column ${i} missing label`);
                }
            }
        }
    }

    // Validate timeline fields
    if (view.kind === ARTIFACT_TYPES.TIMELINE) {
        if (!view.dateField || typeof view.dateField !== 'string') {
            errors.push('Timeline view requires dateField');
        }
        if (!view.labelField || typeof view.labelField !== 'string') {
            errors.push('Timeline view requires labelField');
        }
    }

    return errors;
}

/**
 * Validate an axis configuration
 * 
 * @param {Object} axis - Axis object
 * @param {string} name - Axis name (x or y)
 * @returns {string[]} Array of error messages
 */
function validateAxis(axis, name) {
    const errors = [];

    if (!axis || typeof axis !== 'object') {
        return errors; // Axis is optional
    }

    for (const key of Object.keys(axis)) {
        if (!ALLOWED_AXIS_FIELDS.has(key)) {
            errors.push(`Unknown ${name} axis field: ${key}`);
        }
    }

    if (axis.field && typeof axis.field !== 'string') {
        errors.push(`${name}.field must be a string`);
    }

    const validTypes = Object.values(FIELD_TYPES);
    if (axis.type && !validTypes.includes(axis.type)) {
        errors.push(`${name}.type must be one of: ${validTypes.join(', ')}`);
    }

    if (axis.domain !== undefined && axis.domain !== null) {
        if (!Array.isArray(axis.domain) || axis.domain.length !== 2) {
            errors.push(`${name}.domain must be [min, max] array`);
        } else if (typeof axis.domain[0] !== 'number' || typeof axis.domain[1] !== 'number') {
            errors.push(`${name}.domain values must be numbers`);
        }
    }

    return errors;
}

/**
 * Validate data array
 * 
 * @param {Array} data - Data array
 * @returns {string[]} Array of error messages
 */
function validateData(data) {
    const errors = [];

    if (!Array.isArray(data)) {
        errors.push('data must be an array');
        return errors;
    }

    if (data.length > MAX_DATA_ROWS) {
        errors.push(`data exceeds maximum of ${MAX_DATA_ROWS} rows (got ${data.length})`);
    }

    // Check data rows are objects
    for (let i = 0; i < Math.min(data.length, 10); i++) {
        if (data[i] && typeof data[i] !== 'object') {
            errors.push(`data[${i}] must be an object`);
        }
    }

    return errors;
}

/**
 * Validate annotations array
 * 
 * @param {Array} annotations - Annotations array
 * @returns {string[]} Array of error messages
 */
function validateAnnotations(annotations) {
    const errors = [];

    if (annotations === undefined || annotations === null) {
        return errors; // Optional
    }

    if (!Array.isArray(annotations)) {
        errors.push('annotations must be an array');
        return errors;
    }

    if (annotations.length > MAX_ANNOTATIONS) {
        errors.push(`annotations exceeds maximum of ${MAX_ANNOTATIONS}`);
    }

    for (let i = 0; i < annotations.length; i++) {
        const ann = annotations[i];
        if (!ann || typeof ann !== 'object') {
            errors.push(`annotation[${i}] must be an object`);
        } else if (!ann.label || typeof ann.label !== 'string') {
            errors.push(`annotation[${i}] must have a label string`);
        } else if (ann.label.length > 100) {
            errors.push(`annotation[${i}].label must be 100 characters or less`);
        }
    }

    return errors;
}

/**
 * Validate explanation array
 * 
 * @param {Array} explanation - Explanation lines
 * @returns {string[]} Array of error messages
 */
function validateExplanation(explanation) {
    const errors = [];

    if (explanation === undefined || explanation === null) {
        return errors; // Optional
    }

    if (!Array.isArray(explanation)) {
        errors.push('explanation must be an array');
        return errors;
    }

    if (explanation.length > MAX_EXPLANATION_LINES) {
        errors.push(`explanation exceeds maximum of ${MAX_EXPLANATION_LINES} lines`);
    }

    for (let i = 0; i < explanation.length; i++) {
        if (typeof explanation[i] !== 'string') {
            errors.push(`explanation[${i}] must be a string`);
        } else if (explanation[i].length > 500) {
            errors.push(`explanation[${i}] must be 500 characters or less`);
        }
    }

    return errors;
}

// ==========================================
// Sanitization
// ==========================================

/**
 * Escape HTML special characters
 * 
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    if (typeof str !== 'string') {
        return String(str);
    }
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Create a sanitized copy of the spec with HTML escaped
 * 
 * @param {Object} spec - Validated spec
 * @returns {Object} Sanitized copy
 */
function sanitizeSpec(spec) {
    const sanitized = {
        type: 'artifact',
        artifactId: escapeHtml(spec.artifactId),
        title: escapeHtml(spec.title),
        subtitle: spec.subtitle ? escapeHtml(spec.subtitle) : null,
        view: { ...spec.view },
        data: spec.data.slice(0, MAX_DATA_ROWS),
        annotations: (spec.annotations || []).slice(0, MAX_ANNOTATIONS).map(ann => ({
            ...ann,
            label: escapeHtml(ann.label)
        })),
        explanation: (spec.explanation || []).slice(0, MAX_EXPLANATION_LINES).map(escapeHtml)
    };

    // Sanitize column labels for tables
    if (sanitized.view.columns) {
        sanitized.view.columns = sanitized.view.columns.map(col => ({
            field: col.field,
            label: escapeHtml(col.label)
        }));
    }

    return sanitized;
}

// ==========================================
// Public API
// ==========================================

export const ArtifactValidation = {
    validate: validateArtifactSpec,
    escapeHtml,
    MAX_DATA_ROWS,
    MAX_ANNOTATIONS,
    MAX_EXPLANATION_LINES
};

logger.info('Module loaded');
