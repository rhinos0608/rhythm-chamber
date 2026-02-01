/**
 * Observability Action Handlers
 *
 * Handles action button clicks via event delegation.
 *
 * @module observability/ui/actions
 */

import { ExportFormat, ScheduleType } from '../metrics-exporter.js';

/**
 * Setup action button handlers via event delegation
 * @param {HTMLElement} container - Dashboard container
 * @param {Object} handlers - Action handler functions
 * @param {Function} handlers.onHide - Handler for hide action
 * @param {Function} handlers.onExportNow - Handler for export now action
 * @param {Function} handlers.onClearMetrics - Handler for clear metrics action
 * @param {Function} handlers.onAddScheduledExport - Handler for add scheduled export action
 * @param {Function} handlers.onAddExternalService - Handler for add external service action
 * @param {Function} handlers.onPauseJob - Handler for pause job action
 * @param {Function} handlers.onDeleteJob - Handler for delete job action
 * @param {Function} handlers.onRemoveService - Handler for remove service action
 * @returns {Function} Cleanup function
 */
export function setupActions(container, handlers = {}) {
    const handleActionClick = event => {
        const actionButton = event.target.closest('[data-action]');
        if (!actionButton) return;

        const action = actionButton.dataset.action;

        switch (action) {
            case 'hide-observability':
                event.preventDefault();
                if (handlers.onHide) handlers.onHide();
                break;

            case 'export-now':
                event.preventDefault();
                if (handlers.onExportNow) handlers.onExportNow();
                break;

            case 'clear-metrics':
                event.preventDefault();
                if (handlers.onClearMetrics) handlers.onClearMetrics();
                break;

            case 'add-scheduled-export':
                event.preventDefault();
                if (handlers.onAddScheduledExport) handlers.onAddScheduledExport();
                break;

            case 'add-external-service':
                event.preventDefault();
                if (handlers.onAddExternalService) handlers.onAddExternalService();
                break;

            case 'pause-job':
                event.preventDefault();
                if (handlers.onPauseJob) {
                    handlers.onPauseJob(actionButton.dataset.jobId);
                }
                break;

            case 'delete-job':
                event.preventDefault();
                if (handlers.onDeleteJob) {
                    handlers.onDeleteJob(actionButton.dataset.jobId);
                }
                break;

            case 'remove-service':
                event.preventDefault();
                if (handlers.onRemoveService) {
                    handlers.onRemoveService(actionButton.dataset.endpoint);
                }
                break;
        }
    };

    container.addEventListener('click', handleActionClick);

    // Return cleanup function
    return () => {
        container.removeEventListener('click', handleActionClick);
    };
}
