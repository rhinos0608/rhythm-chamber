/**
 * Exports Tab Updates
 *
 * Handles updating the exports tab with current jobs and services.
 *
 * @module observability/updates/exports
 */

import { MetricsExporter } from '../metrics-exporter.js';

/**
 * Update exports tab with current jobs and services
 * @param {HTMLElement} container - Dashboard container
 */
export function updateExportsTab(container) {
    if (!MetricsExporter) return;

    // Update scheduled exports list
    const scheduledJobs = MetricsExporter.getScheduledJobs();
    const scheduledList = container.querySelector('#scheduled-exports-list');

    if (scheduledJobs.length === 0) {
        scheduledList.innerHTML = '<div class="no-scheduled">No scheduled exports</div>';
    } else {
        scheduledList.innerHTML = scheduledJobs
            .map(
                job => `
            <div class="scheduled-job" data-job-id="${escapeHtml(job.id)}">
                <div class="job-name">${escapeHtml(job.name)}</div>
                <div class="job-info">
                    <span>Format: ${escapeHtml(job.config.format)}</span>
                    <span>Schedule: ${escapeHtml(job.config.schedule)}</span>
                    <span>Status: ${escapeHtml(job.status)}</span>
                </div>
                <div class="job-actions">
                    <button class="btn btn-sm" data-action="pause-job" data-job-id="${escapeHtml(job.id)}">Pause</button>
                    <button class="btn btn-sm" data-action="delete-job" data-job-id="${escapeHtml(job.id)}">Delete</button>
                </div>
            </div>
        `
            )
            .join('');
    }

    // Update external services list
    const services = MetricsExporter.getExternalServices();
    const servicesList = container.querySelector('#external-services-list');

    if (services.length === 0) {
        servicesList.innerHTML = '<div class="no-services">No external services configured</div>';
    } else {
        servicesList.innerHTML = services
            .map(
                service => `
            <div class="service-config" data-endpoint="${escapeHtml(service.endpoint)}">
                <div class="service-name">${escapeHtml(service.service)}</div>
                <div class="service-endpoint">${escapeHtml(service.endpoint)}</div>
                <div class="service-actions">
                    <button class="btn btn-sm" data-action="remove-service" data-endpoint="${escapeHtml(service.endpoint)}">Remove</button>
                </div>
            </div>
        `
            )
            .join('');
    }
}

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
