/**
 * SidebarStateController Unit Tests
 *
 * Tests the state management functionality of the sidebar
 * @module tests/unit/sidebar/state-controller.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies before importing
vi.mock('../../../js/storage.js', () => ({
    Storage: {
        getConfig: vi.fn(() => Promise.resolve(null)),
        setConfig: vi.fn(() => Promise.resolve(undefined))
    }
}));

vi.mock('../../../js/state/app-state.js', () => {
    const get = vi.fn(() => ({ sidebarCollapsed: false }));
    return {
        AppState: {
            get,
            setSidebarCollapsed: vi.fn(),
            subscribe: vi.fn(() => vi.fn())
        }
    };
});

import { SidebarStateController } from '../../../js/controllers/sidebar/state-controller.js';

describe('SidebarStateController', () => {
    let mockSidebar;
    let mockOverlay;

    beforeEach(async () => {
        // Reset DOM
        document.body.innerHTML = '';

        // Create mock DOM elements
        mockSidebar = document.createElement('aside');
        mockSidebar.id = 'chat-sidebar';
        document.body.appendChild(mockSidebar);

        mockOverlay = document.createElement('div');
        mockOverlay.id = 'sidebar-overlay';
        document.body.appendChild(mockOverlay);

        // Clear all mocks
        vi.clearAllMocks();

        // Destroy any previous instance and re-init
        SidebarStateController.destroy();
        SidebarStateController.init();
    });

    afterEach(() => {
        SidebarStateController.destroy();
        document.body.innerHTML = '';
    });

    describe('Public API', () => {
        it('should have init method', () => {
            expect(SidebarStateController.init).toBeDefined();
            expect(typeof SidebarStateController.init).toBe('function');
        });

        it('should have updateVisibility method', () => {
            expect(SidebarStateController.updateVisibility).toBeDefined();
        });

        it('should have toggle method', () => {
            expect(SidebarStateController.toggle).toBeDefined();
        });

        it('should have close method', () => {
            expect(SidebarStateController.close).toBeDefined();
        });

        it('should have hideForNonChatViews method', () => {
            expect(SidebarStateController.hideForNonChatViews).toBeDefined();
        });

        it('should have getState method', () => {
            expect(SidebarStateController.getState).toBeDefined();
        });

        it('should have destroy method', () => {
            expect(SidebarStateController.destroy).toBeDefined();
        });
    });

    describe('updateVisibility', () => {
        it('should add collapsed class when sidebar is collapsed', async () => {
            const { AppState } = await import('../../../js/state/app-state.js');
            AppState.get.mockReturnValue({ sidebarCollapsed: true });

            SidebarStateController.updateVisibility();

            expect(mockSidebar.classList.contains('collapsed')).toBe(true);
        });

        it('should remove collapsed class when sidebar is expanded', async () => {
            const { AppState } = await import('../../../js/state/app-state.js');
            AppState.get.mockReturnValue({ sidebarCollapsed: false });

            SidebarStateController.updateVisibility();

            expect(mockSidebar.classList.contains('collapsed')).toBe(false);
        });

        it('should show overlay on mobile when expanded', async () => {
            Object.defineProperty(window, 'innerWidth', {
                writable: true,
                configurable: true,
                value: 500
            });

            const { AppState } = await import('../../../js/state/app-state.js');
            AppState.get.mockReturnValue({ sidebarCollapsed: false });

            SidebarStateController.updateVisibility();

            expect(mockOverlay.classList.contains('visible')).toBe(true);
        });

        it('should not crash when sidebar element is missing', () => {
            mockSidebar.remove();

            expect(() => {
                SidebarStateController.updateVisibility();
            }).not.toThrow();
        });
    });

    describe('toggle', () => {
        it('should call AppState.setSidebarCollapsed', async () => {
            const { AppState } = await import('../../../js/state/app-state.js');

            SidebarStateController.toggle();

            expect(AppState.setSidebarCollapsed).toHaveBeenCalled();
        });

        it('should toggle the collapsed state', async () => {
            const { AppState } = await import('../../../js/state/app-state.js');
            AppState.get.mockReturnValue({ sidebarCollapsed: false });

            SidebarStateController.toggle();

            expect(AppState.setSidebarCollapsed).toHaveBeenCalledWith(true);
        });

        it('should add open class on mobile when expanding', async () => {
            Object.defineProperty(window, 'innerWidth', {
                writable: true,
                configurable: true,
                value: 500
            });

            const { AppState } = await import('../../../js/state/app-state.js');
            AppState.get.mockReturnValue({ sidebarCollapsed: true });

            SidebarStateController.toggle();

            expect(mockSidebar.classList.contains('open')).toBe(true);
        });
    });

    describe('close', () => {
        it('should set sidebar as collapsed', async () => {
            const { AppState } = await import('../../../js/state/app-state.js');

            SidebarStateController.close();

            expect(AppState.setSidebarCollapsed).toHaveBeenCalledWith(true);
        });

        it('should remove open class from sidebar', async () => {
            mockSidebar.classList.add('open');

            SidebarStateController.close();

            expect(mockSidebar.classList.contains('open')).toBe(false);
        });
    });

    describe('getState', () => {
        it('should return current state', async () => {
            const { AppState } = await import('../../../js/state/app-state.js');
            AppState.get.mockReturnValue({ sidebarCollapsed: true });

            const state = SidebarStateController.getState();

            expect(state.collapsed).toBe(true);
            expect(state.hasDOM).toBe(true);
        });

        it('should indicate hasDOM is false when sidebar missing', async () => {
            mockSidebar.remove();
            // Re-init to pick up the new DOM state
            SidebarStateController.init();
            const { AppState } = await import('../../../js/state/app-state.js');
            AppState.get.mockReturnValue({ sidebarCollapsed: false });

            const state = SidebarStateController.getState();

            expect(state.hasDOM).toBe(false);
        });
    });

    describe('destroy', () => {
        it('should clean up DOM references', () => {
            SidebarStateController.destroy();

            // State should reflect no DOM
            const state = SidebarStateController.getState();
            expect(state.hasDOM).toBe(false);
        });

        it('should handle multiple destroy calls', () => {
            SidebarStateController.destroy();

            expect(() => {
                SidebarStateController.destroy();
            }).not.toThrow();
        });
    });
});
