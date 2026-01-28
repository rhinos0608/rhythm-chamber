/**
 * Observability Tabs Management
 *
 * Handles tab switching logic and lifecycle for observability dashboard tabs.
 *
 * @module observability/ui/tabs
 */

/**
 * Setup tab switching functionality
 * @param {HTMLElement} container - Dashboard container
 * @param {Function} onTabSwitch - Callback when tab is switched
 * @returns {{clear: Function, tabElements: HTMLElement[], tabClickHandlers: Function[]}} Cleanup function and arrays for backward compatibility
 */
export function setupTabs(container, onTabSwitch) {
    const tabs = container.querySelectorAll('.tab-btn');
    const contents = container.querySelectorAll('.tab-content');

    const tabElements = [];
    const tabClickHandlers = [];

    tabs.forEach(tab => {
        // Store reference for cleanup
        tabElements.push(tab);

        // Create bound handler for cleanup
        const handler = () => {
            const targetTab = tab.dataset.tab;

            // Update active tab button
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show target content
            contents.forEach(content => {
                content.classList.remove('active');
                if (content.dataset.tab === targetTab) {
                    content.classList.add('active');
                }
            });

            // Notify callback
            if (onTabSwitch) {
                onTabSwitch(targetTab);
            }
        };

        // Store handler reference for cleanup
        tabClickHandlers.push(handler);
        tab.addEventListener('click', handler);
    });

    // Return cleanup function and arrays for backward compatibility
    return {
        clear: () => {
            tabElements.forEach((tab, index) => {
                const handler = tabClickHandlers[index];
                if (tab && handler) {
                    tab.removeEventListener('click', handler);
                }
            });
        },
        tabElements,
        tabClickHandlers
    };
}
