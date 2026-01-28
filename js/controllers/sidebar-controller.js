/**
 * Sidebar Controller - Backward Compatibility Layer
 *
 * This file serves as a backward compatibility facade that re-exports functionality
 * from the new modular sidebar controller structure.
 *
 * The sidebar controller has been refactored into focused modules:
 * - js/controllers/sidebar/index.js (main coordinator)
 * - js/controllers/sidebar/state-controller.js (collapse/expand state)
 * - js/controllers/sidebar/session-list-controller.js (session list rendering)
 * - js/controllers/sidebar/session-actions-controller.js (session operations)
 *
 * @module controllers/sidebar-controller
 */

// Re-export everything from the new modular structure
export {
    SidebarController,
    SidebarStateController,
    SessionListController,
    SessionActionsController
} from './sidebar/index.js';

// Also export as default for compatibility
export { SidebarController as default } from './sidebar/index.js';

console.log('[SidebarController] Backward compatibility layer loaded');
