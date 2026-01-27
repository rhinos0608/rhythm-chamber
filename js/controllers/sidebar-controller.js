/**
 * Sidebar Controller (Backward Compatibility Entry Point)
 *
 * This file maintains backward compatibility by re-exporting from
 * the refactored modular structure.
 *
 * The actual implementation has been split into:
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
