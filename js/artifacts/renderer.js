/**
 * Artifact Renderer Module
 * 
 * Deterministic SVG renderer for artifact visualizations.
 * Renders validated ArtifactSpec objects into vanilla SVG elements.
 * No external dependencies - CSP-compliant.
 * 
 * Supported chart types:
 * - line_chart: Time series with optional annotations
 * - bar_chart: Horizontal/vertical bars
 * - table: Simple data table
 * - timeline: Event timeline with markers
 * - heatmap: Calendar-style intensity map
 * 
 * @module artifacts/renderer
 */

import { createLogger } from '../utils/logger.js';
import { ARTIFACT_TYPES } from './artifact-spec.js';

const logger = createLogger('ArtifactRenderer');

// ==========================================
// Constants
// ==========================================

const SVG_NS = 'http://www.w3.org/2000/svg';

const CHART_DEFAULTS = {
    width: 400,
    height: 200,
    padding: { top: 20, right: 20, bottom: 40, left: 50 },
    colors: {
        primary: '#8b5cf6',      // Purple accent
        secondary: '#06b6d4',    // Cyan 
        grid: 'rgba(255,255,255,0.1)',
        text: '#a1a1aa',
        background: 'rgba(0,0,0,0.2)',
        annotation: '#fbbf24'    // Amber for annotations
    },
    fontSize: {
        label: 11,
        title: 13,
        value: 10
    }
};

// ==========================================
// Main Render Function
// ==========================================

/**
 * Render an artifact spec to a DOM element
 * 
 * @param {Object} spec - Validated and sanitized ArtifactSpec
 * @param {HTMLElement} container - Container element to render into
 * @param {Object} [options] - Render options
 * @param {number} [options.width] - Override width
 * @param {number} [options.height] - Override height
 * @returns {HTMLElement} The rendered artifact element
 */
export function renderArtifact(spec, container, options = {}) {
    if (!spec || !container) {
        logger.error('Missing spec or container');
        return null;
    }

    // Defensive check: spec.view must exist before destructuring
    if (!spec.view || typeof spec.view !== 'object') {
        logger.error('Invalid spec: view property is missing or invalid', { artifactId: spec.artifactId });
        const errorMsg = document.createElement('div');
        errorMsg.className = 'artifact-error';
        errorMsg.textContent = 'Invalid artifact specification';
        container.appendChild(errorMsg);
        return null;
    }

    const { kind } = spec.view;

    logger.debug('Rendering artifact', { artifactId: spec.artifactId, kind });

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'artifact-card';
    wrapper.dataset.artifactId = spec.artifactId;

    // Add header
    const header = createHeader(spec);
    wrapper.appendChild(header);

    // Add chart content
    const chartContainer = document.createElement('div');
    chartContainer.className = 'artifact-content';

    try {
        switch (kind) {
            case ARTIFACT_TYPES.LINE_CHART:
                chartContainer.appendChild(renderLineChart(spec, options));
                break;
            case ARTIFACT_TYPES.BAR_CHART:
                chartContainer.appendChild(renderBarChart(spec, options));
                break;
            case ARTIFACT_TYPES.TABLE:
                chartContainer.appendChild(renderTable(spec));
                break;
            case ARTIFACT_TYPES.TIMELINE:
                chartContainer.appendChild(renderTimeline(spec, options));
                break;
            case ARTIFACT_TYPES.HEATMAP:
                chartContainer.appendChild(renderHeatmap(spec, options));
                break;
            default:
                logger.warn('Unknown chart kind', { kind });
                chartContainer.textContent = `Unsupported chart type: ${kind}`;
        }
    } catch (err) {
        logger.error('Render failed', { error: err.message, artifactId: spec.artifactId });
        chartContainer.textContent = 'Failed to render visualization';
    }

    wrapper.appendChild(chartContainer);

    // Add explanation if present
    if (spec.explanation && spec.explanation.length > 0) {
        const explanation = createExplanation(spec.explanation);
        wrapper.appendChild(explanation);
    }

    // Add actions
    const actions = createActions(spec);
    wrapper.appendChild(actions);

    container.appendChild(wrapper);

    return wrapper;
}

// ==========================================
// Header & Footer Components
// ==========================================

/**
 * Create the artifact header
 */
function createHeader(spec) {
    const header = document.createElement('div');
    header.className = 'artifact-header';

    const titleEl = document.createElement('div');
    titleEl.className = 'artifact-title';
    titleEl.textContent = spec.title;
    header.appendChild(titleEl);

    if (spec.subtitle) {
        const subtitleEl = document.createElement('div');
        subtitleEl.className = 'artifact-subtitle';
        subtitleEl.textContent = spec.subtitle;
        header.appendChild(subtitleEl);
    }

    return header;
}

/**
 * Create explanation section
 */
function createExplanation(lines) {
    const container = document.createElement('div');
    container.className = 'artifact-explanation';

    for (const line of lines) {
        const p = document.createElement('p');
        p.textContent = line;
        container.appendChild(p);
    }

    return container;
}

/**
 * Create action buttons
 */
function createActions(spec) {
    const actions = document.createElement('div');
    actions.className = 'artifact-actions';

    // Collapse/expand button
    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'artifact-btn artifact-collapse-btn';
    collapseBtn.textContent = '▼';
    collapseBtn.title = 'Collapse';
    collapseBtn.onclick = () => {
        const card = collapseBtn.closest('.artifact-card');
        const content = card.querySelector('.artifact-content');
        const explanation = card.querySelector('.artifact-explanation');

        if (card.classList.toggle('collapsed')) {
            collapseBtn.textContent = '▶';
            collapseBtn.title = 'Expand';
            if (content) content.style.display = 'none';
            if (explanation) explanation.style.display = 'none';
        } else {
            collapseBtn.textContent = '▼';
            collapseBtn.title = 'Collapse';
            if (content) content.style.display = '';
            if (explanation) explanation.style.display = '';
        }
    };
    actions.appendChild(collapseBtn);

    return actions;
}

// ==========================================
// Line Chart Renderer
// ==========================================

function renderLineChart(spec, options = {}) {
    const width = options.width || CHART_DEFAULTS.width;
    const height = options.height || CHART_DEFAULTS.height;
    const padding = CHART_DEFAULTS.padding;

    const svg = createSvg(width, height);
    const data = spec.data || [];

    if (data.length === 0) {
        return createEmptyMessage(svg, width, height, 'No data');
    }

    const xField = spec.view.x?.field || 'x';
    const yField = spec.view.y?.field || 'y';

    // Calculate bounds
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    // Extract values
    const xValues = data.map(d => parseValue(d[xField], spec.view.x?.type));
    const yValues = data.map(d => parseFloat(d[yField]) || 0);

    // Calculate scales
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yDomain = spec.view.y?.domain || [Math.min(0, Math.min(...yValues)), Math.max(...yValues)];

    const xScale = (v) => padding.left + ((v - xMin) / (xMax - xMin || 1)) * plotWidth;
    const yScale = (v) => padding.top + plotHeight - ((v - yDomain[0]) / (yDomain[1] - yDomain[0] || 1)) * plotHeight;

    // Draw grid
    drawGrid(svg, padding, plotWidth, plotHeight, 5);

    // Draw line
    const points = data.map((d, i) => `${xScale(xValues[i])},${yScale(yValues[i])}`);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', `M ${points.join(' L ')}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', CHART_DEFAULTS.colors.primary);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);

    // Draw area fill
    const areaPath = document.createElementNS(SVG_NS, 'path');
    const areaPoints = [...points, `${xScale(xValues[xValues.length - 1])},${yScale(yDomain[0])}`, `${xScale(xValues[0])},${yScale(yDomain[0])}`];
    areaPath.setAttribute('d', `M ${areaPoints.join(' L ')} Z`);
    areaPath.setAttribute('fill', `url(#gradient-${spec.artifactId})`);
    areaPath.setAttribute('opacity', '0.3');

    // Add gradient
    const defs = document.createElementNS(SVG_NS, 'defs');
    const gradient = document.createElementNS(SVG_NS, 'linearGradient');
    gradient.id = `gradient-${spec.artifactId}`;
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('y1', '0%');
    gradient.setAttribute('x2', '0%');
    gradient.setAttribute('y2', '100%');

    const stop1 = document.createElementNS(SVG_NS, 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', CHART_DEFAULTS.colors.primary);
    stop1.setAttribute('stop-opacity', '0.4');
    gradient.appendChild(stop1);

    const stop2 = document.createElementNS(SVG_NS, 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', CHART_DEFAULTS.colors.primary);
    stop2.setAttribute('stop-opacity', '0');
    gradient.appendChild(stop2);

    defs.appendChild(gradient);
    svg.insertBefore(defs, svg.firstChild);
    svg.insertBefore(areaPath, path);

    // Draw dots
    data.forEach((d, i) => {
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', xScale(xValues[i]));
        circle.setAttribute('cy', yScale(yValues[i]));
        circle.setAttribute('r', '3');
        circle.setAttribute('fill', CHART_DEFAULTS.colors.primary);
        svg.appendChild(circle);
    });

    // Draw annotations
    if (spec.annotations && spec.annotations.length > 0) {
        drawAnnotations(svg, spec.annotations, xField, xScale, yScale, data, yValues, yDomain);
    }

    // Draw axes labels
    drawAxisLabels(svg, xValues, yDomain, xScale, yScale, padding, plotWidth, plotHeight, spec.view.x?.type);

    return svg;
}

// ==========================================
// Bar Chart Renderer
// ==========================================

function renderBarChart(spec, options = {}) {
    const width = options.width || CHART_DEFAULTS.width;
    const height = options.height || Math.max(CHART_DEFAULTS.height, (spec.data?.length || 0) * 30 + 60);
    const padding = { ...CHART_DEFAULTS.padding, left: 100 };

    const svg = createSvg(width, height);
    const data = spec.data || [];

    if (data.length === 0) {
        return createEmptyMessage(svg, width, height, 'No data');
    }

    const horizontal = spec.view.horizontal !== false;
    const categoryField = horizontal ? spec.view.y?.field : spec.view.x?.field;
    const valueField = horizontal ? spec.view.x?.field : spec.view.y?.field;

    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    // Extract values
    const categories = data.map(d => d[categoryField] || '');
    const values = data.map(d => parseFloat(d[valueField]) || 0);
    const maxValue = Math.max(...values);

    // Guard against divide-by-zero when maxValue === 0
    const getMaxScale = (val) => maxValue > 0 ? val / maxValue : 0;

    if (horizontal) {
        const barHeight = Math.min(25, (plotHeight - (data.length - 1) * 4) / data.length);
        const barSpacing = barHeight + 4;

        data.forEach((d, i) => {
            const barWidth = getMaxScale(values[i]) * plotWidth;
            const y = padding.top + i * barSpacing;

            // Bar
            const rect = document.createElementNS(SVG_NS, 'rect');
            rect.setAttribute('x', padding.left);
            rect.setAttribute('y', y);
            rect.setAttribute('width', Math.max(2, barWidth));
            rect.setAttribute('height', barHeight);
            rect.setAttribute('fill', CHART_DEFAULTS.colors.primary);
            rect.setAttribute('rx', '3');
            svg.appendChild(rect);

            // Category label
            const label = document.createElementNS(SVG_NS, 'text');
            label.setAttribute('x', padding.left - 8);
            label.setAttribute('y', y + barHeight / 2 + 4);
            label.setAttribute('text-anchor', 'end');
            label.setAttribute('fill', CHART_DEFAULTS.colors.text);
            label.setAttribute('font-size', CHART_DEFAULTS.fontSize.label);
            label.textContent = truncate(categories[i], 15);
            svg.appendChild(label);

            // Value label
            const valueLabel = document.createElementNS(SVG_NS, 'text');
            valueLabel.setAttribute('x', padding.left + barWidth + 6);
            valueLabel.setAttribute('y', y + barHeight / 2 + 4);
            valueLabel.setAttribute('fill', CHART_DEFAULTS.colors.text);
            valueLabel.setAttribute('font-size', CHART_DEFAULTS.fontSize.value);
            valueLabel.textContent = formatNumber(values[i]);
            svg.appendChild(valueLabel);
        });
    } else {
        // Vertical bar chart rendering
        const barWidth = Math.min(50, (plotWidth - (data.length - 1) * 8) / data.length);
        const barSpacing = barWidth + 8;

        data.forEach((d, i) => {
            const barHeight = getMaxScale(values[i]) * plotHeight;
            const x = padding.left + i * barSpacing;
            const y = padding.top + plotHeight - barHeight;

            // Bar
            const rect = document.createElementNS(SVG_NS, 'rect');
            rect.setAttribute('x', x);
            rect.setAttribute('y', y);
            rect.setAttribute('width', barWidth);
            rect.setAttribute('height', Math.max(2, barHeight));
            rect.setAttribute('fill', CHART_DEFAULTS.colors.primary);
            rect.setAttribute('rx', '3');
            svg.appendChild(rect);

            // Category label (under the bar)
            const label = document.createElementNS(SVG_NS, 'text');
            label.setAttribute('x', x + barWidth / 2);
            label.setAttribute('y', padding.top + plotHeight + 15);
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('fill', CHART_DEFAULTS.colors.text);
            label.setAttribute('font-size', CHART_DEFAULTS.fontSize.label);
            label.textContent = truncate(categories[i], 10);
            svg.appendChild(label);

            // Value label (above the bar)
            const valueLabel = document.createElementNS(SVG_NS, 'text');
            valueLabel.setAttribute('x', x + barWidth / 2);
            valueLabel.setAttribute('y', y - 5);
            valueLabel.setAttribute('text-anchor', 'middle');
            valueLabel.setAttribute('fill', CHART_DEFAULTS.colors.text);
            valueLabel.setAttribute('font-size', CHART_DEFAULTS.fontSize.value);
            valueLabel.textContent = formatNumber(values[i]);
            svg.appendChild(valueLabel);
        });
    }

    return svg;
}

// ==========================================
// Table Renderer
// ==========================================

function renderTable(spec) {
    const table = document.createElement('table');
    table.className = 'artifact-table';

    const columns = spec.view.columns || [];
    const data = spec.data || [];

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const col of columns) {
        const th = document.createElement('th');
        th.textContent = col.label;
        headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    for (const row of data.slice(0, 50)) { // Limit displayed rows
        const tr = document.createElement('tr');
        for (const col of columns) {
            const td = document.createElement('td');
            td.textContent = row[col.field] ?? '';
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    if (data.length > 50) {
        const tfoot = document.createElement('tfoot');
        const footRow = document.createElement('tr');
        const footCell = document.createElement('td');
        footCell.colSpan = columns.length;
        footCell.textContent = `Showing 50 of ${data.length} rows`;
        footCell.className = 'artifact-table-footer';
        footRow.appendChild(footCell);
        tfoot.appendChild(footRow);
        table.appendChild(tfoot);
    }

    return table;
}

// ==========================================
// Timeline Renderer
// ==========================================

function renderTimeline(spec, options = {}) {
    const width = options.width || CHART_DEFAULTS.width;
    const height = options.height || Math.max(100, (spec.data?.length || 0) * 40 + 40);
    const padding = { top: 20, right: 20, bottom: 20, left: 100 };

    const svg = createSvg(width, height);
    const data = spec.data || [];

    if (data.length === 0) {
        return createEmptyMessage(svg, width, height, 'No events');
    }

    const dateField = spec.view.dateField || 'date';
    const labelField = spec.view.labelField || 'label';

    // Parse dates and sort
    const events = data.map(d => ({
        date: new Date(d[dateField]),
        label: d[labelField]
    })).filter(e => !isNaN(e.date.getTime()));

    events.sort((a, b) => a.date - b.date);

    const plotWidth = width - padding.left - padding.right;
    const minDate = events[0]?.date.getTime() || 0;
    const maxDate = events[events.length - 1]?.date.getTime() || 0;
    const xScale = (d) => padding.left + ((d - minDate) / (maxDate - minDate || 1)) * plotWidth;

    // Draw timeline axis
    const axisY = height / 2;
    const axis = document.createElementNS(SVG_NS, 'line');
    axis.setAttribute('x1', padding.left);
    axis.setAttribute('y1', axisY);
    axis.setAttribute('x2', width - padding.right);
    axis.setAttribute('y2', axisY);
    axis.setAttribute('stroke', CHART_DEFAULTS.colors.grid);
    axis.setAttribute('stroke-width', '2');
    svg.appendChild(axis);

    // Draw events
    events.forEach((event, i) => {
        const x = xScale(event.date.getTime());
        const above = i % 2 === 0;
        const y = above ? axisY - 30 : axisY + 30;

        // Dot
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', axisY);
        dot.setAttribute('r', '6');
        dot.setAttribute('fill', CHART_DEFAULTS.colors.primary);
        svg.appendChild(dot);

        // Connector line
        const connector = document.createElementNS(SVG_NS, 'line');
        connector.setAttribute('x1', x);
        connector.setAttribute('y1', axisY);
        connector.setAttribute('x2', x);
        connector.setAttribute('y2', y);
        connector.setAttribute('stroke', CHART_DEFAULTS.colors.primary);
        connector.setAttribute('stroke-width', '1');
        connector.setAttribute('stroke-dasharray', '2,2');
        svg.appendChild(connector);

        // Label
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', x);
        label.setAttribute('y', above ? y - 5 : y + 15);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('fill', CHART_DEFAULTS.colors.text);
        label.setAttribute('font-size', CHART_DEFAULTS.fontSize.label);
        label.textContent = truncate(event.label, 20);
        svg.appendChild(label);

        // Date label
        const dateLabel = document.createElementNS(SVG_NS, 'text');
        dateLabel.setAttribute('x', x);
        dateLabel.setAttribute('y', above ? y + 8 : y + 28);
        dateLabel.setAttribute('text-anchor', 'middle');
        dateLabel.setAttribute('fill', CHART_DEFAULTS.colors.text);
        dateLabel.setAttribute('font-size', '9');
        dateLabel.setAttribute('opacity', '0.7');
        dateLabel.textContent = formatDate(event.date);
        svg.appendChild(dateLabel);
    });

    return svg;
}

// ==========================================
// Heatmap Renderer (Calendar Style)
// ==========================================

function renderHeatmap(spec, options = {}) {
    const cellSize = 12;
    const cellGap = 2;
    const weekCount = 52;
    const dayCount = 7;

    const width = options.width || (weekCount * (cellSize + cellGap) + 60);
    const height = options.height || (dayCount * (cellSize + cellGap) + 40);

    const svg = createSvg(width, height);
    const data = spec.data || [];

    if (data.length === 0) {
        return createEmptyMessage(svg, width, height, 'No data');
    }

    // Build intensity map
    const intensityMap = new Map();
    const dateField = spec.view.x?.field || 'date';
    const valueField = spec.view.y?.field || 'value';

    let maxValue = 0;
    for (const d of data) {
        const date = new Date(d[dateField]);
        const value = parseFloat(d[valueField]) || 0;
        const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        intensityMap.set(key, (intensityMap.get(key) || 0) + value);
        maxValue = Math.max(maxValue, intensityMap.get(key));
    }

    // Draw cells for last year
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 364);

    const getColor = (value) => {
        if (!value) return CHART_DEFAULTS.colors.background;
        const intensity = Math.min(1, value / maxValue);
        const r = Math.round(139 + (255 - 139) * (1 - intensity));
        const g = Math.round(92 + (255 - 92) * (1 - intensity));
        const b = Math.round(246 + (255 - 246) * (1 - intensity));
        return `rgb(${r}, ${g}, ${b})`;
    };

    let week = 0;
    const current = new Date(startDate);

    while (current <= today) {
        const day = current.getDay();
        const key = `${current.getFullYear()}-${current.getMonth()}-${current.getDate()}`;
        const value = intensityMap.get(key) || 0;

        const cell = document.createElementNS(SVG_NS, 'rect');
        cell.setAttribute('x', 40 + week * (cellSize + cellGap));
        cell.setAttribute('y', 20 + day * (cellSize + cellGap));
        cell.setAttribute('width', cellSize);
        cell.setAttribute('height', cellSize);
        cell.setAttribute('fill', getColor(value));
        cell.setAttribute('rx', '2');
        svg.appendChild(cell);

        if (day === 6) week++;
        current.setDate(current.getDate() + 1);
    }

    // Day labels
    const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    dayLabels.forEach((label, i) => {
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', 30);
        text.setAttribute('y', 20 + i * (cellSize + cellGap) + cellSize - 2);
        text.setAttribute('text-anchor', 'end');
        text.setAttribute('fill', CHART_DEFAULTS.colors.text);
        text.setAttribute('font-size', '9');
        text.textContent = label;
        svg.appendChild(text);
    });

    return svg;
}

// ==========================================
// Helper Functions
// ==========================================

function createSvg(width, height) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.classList.add('artifact-svg');
    return svg;
}

function createEmptyMessage(svg, width, height, message) {
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', width / 2);
    text.setAttribute('y', height / 2);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', CHART_DEFAULTS.colors.text);
    text.setAttribute('font-size', CHART_DEFAULTS.fontSize.label);
    text.textContent = message;
    svg.appendChild(text);
    return svg;
}

function drawGrid(svg, padding, plotWidth, plotHeight, lines) {
    for (let i = 0; i <= lines; i++) {
        const y = padding.top + (i / lines) * plotHeight;
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', padding.left);
        line.setAttribute('y1', y);
        line.setAttribute('x2', padding.left + plotWidth);
        line.setAttribute('y2', y);
        line.setAttribute('stroke', CHART_DEFAULTS.colors.grid);
        line.setAttribute('stroke-width', '1');
        svg.appendChild(line);
    }
}

function drawAxisLabels(svg, xValues, yDomain, xScale, yScale, padding, plotWidth, plotHeight, xType) {
    // Y-axis labels
    const ySteps = 3;
    for (let i = 0; i <= ySteps; i++) {
        const value = yDomain[0] + (yDomain[1] - yDomain[0]) * (1 - i / ySteps);
        const y = padding.top + (i / ySteps) * plotHeight;

        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', padding.left - 8);
        text.setAttribute('y', y + 4);
        text.setAttribute('text-anchor', 'end');
        text.setAttribute('fill', CHART_DEFAULTS.colors.text);
        text.setAttribute('font-size', CHART_DEFAULTS.fontSize.value);
        text.textContent = formatNumber(value);
        svg.appendChild(text);
    }

    // X-axis labels (first and last)
    if (xValues.length > 0) {
        const firstX = xValues[0];
        const lastX = xValues[xValues.length - 1];

        const startLabel = document.createElementNS(SVG_NS, 'text');
        startLabel.setAttribute('x', padding.left);
        startLabel.setAttribute('y', padding.top + plotHeight + 20);
        startLabel.setAttribute('text-anchor', 'start');
        startLabel.setAttribute('fill', CHART_DEFAULTS.colors.text);
        startLabel.setAttribute('font-size', CHART_DEFAULTS.fontSize.value);
        startLabel.textContent = xType === 'temporal' ? formatDate(new Date(firstX)) : String(firstX);
        svg.appendChild(startLabel);

        const endLabel = document.createElementNS(SVG_NS, 'text');
        endLabel.setAttribute('x', padding.left + plotWidth);
        endLabel.setAttribute('y', padding.top + plotHeight + 20);
        endLabel.setAttribute('text-anchor', 'end');
        endLabel.setAttribute('fill', CHART_DEFAULTS.colors.text);
        endLabel.setAttribute('font-size', CHART_DEFAULTS.fontSize.value);
        endLabel.textContent = xType === 'temporal' ? formatDate(new Date(lastX)) : String(lastX);
        svg.appendChild(endLabel);
    }
}

function drawAnnotations(svg, annotations, xField, xScale, yScale, data, yValues, yDomain) {
    for (const ann of annotations) {
        // Find matching data point
        const idx = data.findIndex(d => d[xField] === ann.x || d[xField] === ann[xField]);
        if (idx === -1) continue;

        const x = xScale(parseValue(ann.x || data[idx][xField], 'temporal'));
        const y = yScale(yValues[idx]);

        // Annotation marker
        const marker = document.createElementNS(SVG_NS, 'circle');
        marker.setAttribute('cx', x);
        marker.setAttribute('cy', y);
        marker.setAttribute('r', '5');
        marker.setAttribute('fill', CHART_DEFAULTS.colors.annotation);
        marker.setAttribute('stroke', '#fff');
        marker.setAttribute('stroke-width', '1');
        svg.appendChild(marker);

        // Label
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', x);
        label.setAttribute('y', y - 12);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('fill', CHART_DEFAULTS.colors.annotation);
        label.setAttribute('font-size', CHART_DEFAULTS.fontSize.value);
        label.textContent = truncate(ann.label, 20);
        svg.appendChild(label);
    }
}

function parseValue(value, type) {
    if (type === 'temporal') {
        return new Date(value).getTime();
    }
    return value;
}

function formatNumber(num) {
    if (Math.abs(num) >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (Math.abs(num) >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    if (Number.isInteger(num)) {
        return String(num);
    }
    return num.toFixed(1);
}

function formatDate(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return '';
    }
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function truncate(str, maxLen) {
    if (!str) return '';
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 1) + '…';
}

// ==========================================
// Public API
// ==========================================

export const ArtifactRenderer = {
    render: renderArtifact,
    CHART_DEFAULTS
};

logger.info('Module loaded');
