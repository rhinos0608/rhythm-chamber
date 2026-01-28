/**
 * Web Vitals Tab Updates
 *
 * Handles updating the web vitals tab with current metrics.
 *
 * @module observability/updates/vitals
 */

import { CoreWebVitalsTracker, WebVitalType } from '../core-web-vitals.js';

/**
 * Update web vitals tab with current metrics
 * @param {HTMLElement} container - Dashboard container
 */
export function updateWebVitalsTab(container) {
    if (!CoreWebVitalsTracker) return;

    const vitalsTypes = [
        WebVitalType.LCP,
        WebVitalType.FID,
        WebVitalType.CLS,
        WebVitalType.INP,
        WebVitalType.TTFB
    ];

    vitalsTypes.forEach(type => {
        const metric = CoreWebVitalsTracker.getLatestMetric(type);

        if (metric) {
            updateElement(container, `vital-${type}-value`, metric.value.toFixed(2));

            const card = container.querySelector(`[data-vital="${type}"]`);
            if (card) {
                const ratingElement = card.querySelector('.vital-rating');
                if (ratingElement) {
                    ratingElement.className = `vital-rating ${metric.rating}`;
                    ratingElement.textContent = metric.rating;
                }
            }
        }
    });
}

/**
 * Update element content
 * @param {HTMLElement} container - Dashboard container
 * @param {string} id - Element ID
 * @param {string} content - New content
 */
function updateElement(container, id, content) {
    const element = container.querySelector(`#${id}`);
    if (element) {
        element.textContent = content;
    }
}
