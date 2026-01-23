/**
 * Artifact Specification Module
 * 
 * Defines the ArtifactSpec schema that AI function calls output.
 * Artifacts are scoped, ephemeral visualizations that appear inline in chat.
 * 
 * Design Philosophy (per user requirements):
 * - Artifacts answer questions, never introduce them
 * - Always scoped to specific question/time range
 * - Always narratively introduced by the AI
 * - Never browsable/galleried - live only in conversation threads
 * 
 * @module artifacts/artifact-spec
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('ArtifactSpec');

// ==========================================
// Artifact Type Constants
// ==========================================

/**
 * Supported artifact visualization types
 * New types require corresponding renderer implementation
 */
export const ARTIFACT_TYPES = Object.freeze({
    LINE_CHART: 'line_chart',
    BAR_CHART: 'bar_chart',
    TABLE: 'table',
    TIMELINE: 'timeline',
    HEATMAP: 'heatmap'
});

/**
 * Field type definitions for chart axes
 */
export const FIELD_TYPES = Object.freeze({
    TEMPORAL: 'temporal',      // Date/time values
    CATEGORICAL: 'categorical', // Discrete categories (artist names, etc.)
    QUANTITATIVE: 'quantitative' // Numeric values
});

// ==========================================
// Artifact Spec Defaults
// ==========================================

/**
 * Maximum data rows per artifact to prevent memory issues
 */
export const MAX_DATA_ROWS = 500;

/**
 * Maximum annotations per artifact
 */
export const MAX_ANNOTATIONS = 20;

/**
 * Maximum explanation lines
 */
export const MAX_EXPLANATION_LINES = 10;

// ==========================================
// Spec Builder
// ==========================================

/**
 * Create a validated ArtifactSpec object
 * 
 * @param {Object} options - Spec options
 * @param {string} options.kind - Visualization type (line_chart, bar_chart, etc.)
 * @param {string} options.title - Chart title
 * @param {Array} options.data - Data array
 * @param {Object} options.view - View configuration
 * @param {Array<string>} [options.explanation] - AI explanation lines
 * @param {string} [options.subtitle] - Optional subtitle
 * @param {Array} [options.annotations] - Optional annotations
 * @returns {Object} ArtifactSpec object
 */
export function createSpec({
    kind,
    title,
    data,
    view,
    explanation = [],
    subtitle = null,
    annotations = []
}) {
    const artifactId = `artifact_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const spec = {
        type: 'artifact',
        artifactId,
        title,
        subtitle,
        view: {
            kind,
            ...view
        },
        data: data || [],
        annotations: annotations || [],
        explanation: explanation || []
    };

    logger.debug('Created artifact spec', { artifactId, kind, dataRows: spec.data.length });

    return spec;
}

/**
 * Create a line chart spec
 * 
 * @param {Object} options - Chart options
 * @param {string} options.title - Chart title
 * @param {Array} options.data - Data array with x/y values
 * @param {string} options.xField - Field name for x-axis
 * @param {string} options.yField - Field name for y-axis
 * @param {string} [options.xType='temporal'] - X-axis type
 * @param {Array<number>} [options.yDomain] - Y-axis domain [min, max]
 * @param {Array<string>} [options.explanation] - Explanation lines
 * @param {Array} [options.annotations] - Point annotations
 * @returns {Object} ArtifactSpec
 */
export function createLineChart({
    title,
    data,
    xField,
    yField,
    xType = FIELD_TYPES.TEMPORAL,
    yDomain = null,
    explanation = [],
    annotations = []
}) {
    return createSpec({
        kind: ARTIFACT_TYPES.LINE_CHART,
        title,
        data,
        view: {
            x: { field: xField, type: xType },
            y: { field: yField, type: FIELD_TYPES.QUANTITATIVE, domain: yDomain },
            series: null
        },
        explanation,
        annotations
    });
}

/**
 * Create a bar chart spec
 * 
 * @param {Object} options - Chart options
 * @param {string} options.title - Chart title
 * @param {Array} options.data - Data array with category/value
 * @param {string} options.categoryField - Field name for categories
 * @param {string} options.valueField - Field name for values
 * @param {boolean} [options.horizontal=true] - Horizontal bars
 * @param {Array<string>} [options.explanation] - Explanation lines
 * @returns {Object} ArtifactSpec
 */
export function createBarChart({
    title,
    data,
    categoryField,
    valueField,
    horizontal = true,
    explanation = []
}) {
    return createSpec({
        kind: ARTIFACT_TYPES.BAR_CHART,
        title,
        data,
        view: {
            x: { field: horizontal ? valueField : categoryField, type: horizontal ? FIELD_TYPES.QUANTITATIVE : FIELD_TYPES.CATEGORICAL },
            y: { field: horizontal ? categoryField : valueField, type: horizontal ? FIELD_TYPES.CATEGORICAL : FIELD_TYPES.QUANTITATIVE },
            horizontal
        },
        explanation
    });
}

/**
 * Create a timeline spec
 * 
 * @param {Object} options - Timeline options
 * @param {string} options.title - Timeline title
 * @param {Array} options.events - Event array with date/label
 * @param {string} options.dateField - Field name for dates
 * @param {string} options.labelField - Field name for labels
 * @param {Array<string>} [options.explanation] - Explanation lines
 * @returns {Object} ArtifactSpec
 */
export function createTimeline({
    title,
    events,
    dateField,
    labelField,
    explanation = []
}) {
    return createSpec({
        kind: ARTIFACT_TYPES.TIMELINE,
        title,
        data: events,
        view: {
            dateField,
            labelField
        },
        explanation
    });
}

/**
 * Create a table spec
 * 
 * @param {Object} options - Table options
 * @param {string} options.title - Table title
 * @param {Array} options.data - Row data
 * @param {Array<{field: string, label: string}>} options.columns - Column definitions
 * @param {Array<string>} [options.explanation] - Explanation lines
 * @returns {Object} ArtifactSpec
 */
export function createTable({
    title,
    data,
    columns,
    explanation = []
}) {
    return createSpec({
        kind: ARTIFACT_TYPES.TABLE,
        title,
        data,
        view: {
            columns
        },
        explanation
    });
}

// ==========================================
// Public API
// ==========================================

export const ArtifactSpec = {
    // Types
    TYPES: ARTIFACT_TYPES,
    FIELD_TYPES,

    // Limits
    MAX_DATA_ROWS,
    MAX_ANNOTATIONS,
    MAX_EXPLANATION_LINES,

    // Builders
    createSpec,
    createLineChart,
    createBarChart,
    createTimeline,
    createTable
};

logger.info('Module loaded');
