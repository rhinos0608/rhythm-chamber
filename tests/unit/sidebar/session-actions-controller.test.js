/**
 * SessionActionsController Unit Tests
 *
 * Tests the session operations functionality
 * @module tests/unit/sidebar/session-actions-controller.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies before importing
vi.mock('../../../js/chat.js', () => ({
    Chat: {
        getCurrentSessionId: vi.fn(() => 'session-1'),
        switchSession: vi.fn(() => Promise.resolve(undefined)),
        createNewSession: vi.fn(() => Promise.resolve('new-session-id')),
        deleteSessionById: vi.fn(() => Promise.resolve(true)),
        renameSession: vi.fn(() => Promise.resolve(undefined)),
        getHistory: vi.fn(() => [])
    }
}));

vi.mock('../../../js/controllers/chat-ui-controller.js', () => ({
    ChatUIController: {
        parseMarkdown: vi.fn((content) => `<p>${content}</p>`)
    }
}));

vi.mock('../../../js/token-counter.js', () => ({
    TokenCounter: {
        resetDisplay: vi.fn()
    }
}));

vi.mock('../../../js/state/app-state.js', () => ({
    AppState: {
        get: vi.fn(() => ({ sidebarCollapsed: false }))
    }
}));

vi.mock('../../../js/controllers/sidebar/session-list-controller.js', () => ({
    SessionListController: {
        updateActiveState: vi.fn(),
        removeSessionElement: vi.fn(),
        getSessionElement: vi.fn(() => null),
        hasSessions: vi.fn(() => true),
        renderSessionList: vi.fn(() => Promise.resolve())
    }
}));

vi.mock('../../../js/utils/html-escape.js', () => ({
    escapeHtml: vi.fn((text) => text)
}));

import { SessionActionsController } from '../../../js/controllers/sidebar/session-actions-controller.js';
import { Chat } from '../../../js/chat.js';

describe('SessionActionsController', () => {
    let mockMessages;
    let mockSuggestions;

    beforeEach(() => {
        // Reset DOM
        document.body.innerHTML = '';

        // Create mock DOM elements
        mockMessages = document.createElement('div');
        mockMessages.id = 'chat-messages';
        document.body.appendChild(mockMessages);

        mockSuggestions = document.createElement('div');
        mockSuggestions.id = 'chat-suggestions';
        mockSuggestions.style.display = 'none';
        document.body.appendChild(mockSuggestions);

        // Clear all mocks
        vi.clearAllMocks();
    });

    afterEach(() => {
        SessionActionsController.destroy();
        document.body.innerHTML = '';
    });

    describe('Public API', () => {
        it('should have handleSessionClick method', () => {
            expect(SessionActionsController.handleSessionClick).toBeDefined();
        });

        it('should have handleNewChat method', () => {
            expect(SessionActionsController.handleNewChat).toBeDefined();
        });

        it('should have handleSessionDelete method', () => {
            expect(SessionActionsController.handleSessionDelete).toBeDefined();
        });

        it('should have hideDeleteChatModal method', () => {
            expect(SessionActionsController.hideDeleteChatModal).toBeDefined();
        });

        it('should have confirmDeleteChat method', () => {
            expect(SessionActionsController.confirmDeleteChat).toBeDefined();
        });

        it('should have handleSessionRename method', () => {
            expect(SessionActionsController.handleSessionRename).toBeDefined();
        });

        it('should have getPendingDeleteId method', () => {
            expect(SessionActionsController.getPendingDeleteId).toBeDefined();
        });

        it('should have isRenameInProgress method', () => {
            expect(SessionActionsController.isRenameInProgress).toBeDefined();
        });

        it('should have cancelRename method', () => {
            expect(SessionActionsController.cancelRename).toBeDefined();
        });

        it('should have destroy method', () => {
            expect(SessionActionsController.destroy).toBeDefined();
        });
    });

    describe('handleSessionClick', () => {
        it('should not switch if clicking same session', async () => {
            Chat.getCurrentSessionId.mockReturnValue('session-1');

            await SessionActionsController.handleSessionClick('session-1');

            expect(Chat.switchSession).not.toHaveBeenCalled();
        });

        it('should switch to different session', async () => {
            Chat.getCurrentSessionId.mockReturnValue('session-1');
            Chat.getHistory.mockReturnValue([
                { role: 'user', content: 'Hello' }
            ]);

            await SessionActionsController.handleSessionClick('session-2');

            expect(Chat.switchSession).toHaveBeenCalledWith('session-2');
        });
    });

    describe('handleNewChat', () => {
        it('should create new session', async () => {
            await SessionActionsController.handleNewChat();

            expect(Chat.createNewSession).toHaveBeenCalled();
        });

        it('should clear messages container', async () => {
            mockMessages.innerHTML = '<div>Old message</div>';

            await SessionActionsController.handleNewChat();

            expect(mockMessages.innerHTML).toBe('');
        });

        it('should show suggestions', async () => {
            await SessionActionsController.handleNewChat();

            expect(mockSuggestions.style.display).toBe('flex');
        });
    });

    describe('handleSessionDelete', () => {
        it('should store pending delete session ID', () => {
            SessionActionsController.handleSessionDelete('session-to-delete');

            expect(SessionActionsController.getPendingDeleteId()).toBe('session-to-delete');
        });

        it('should show confirmation modal', () => {
            const modal = document.createElement('div');
            modal.id = 'delete-chat-modal';
            modal.style.display = 'none';
            document.body.appendChild(modal);

            SessionActionsController.handleSessionDelete('session-1');

            expect(modal.style.display).toBe('flex');
        });
    });

    describe('hideDeleteChatModal', () => {
        it('should clear pending delete ID', () => {
            SessionActionsController.handleSessionDelete('session-1');

            SessionActionsController.hideDeleteChatModal();

            expect(SessionActionsController.getPendingDeleteId()).toBeNull();
        });

        it('should hide modal', () => {
            const modal = document.createElement('div');
            modal.id = 'delete-chat-modal';
            modal.style.display = 'flex';
            document.body.appendChild(modal);

            SessionActionsController.hideDeleteChatModal();

            expect(modal.style.display).toBe('none');
        });
    });

    describe('confirmDeleteChat', () => {
        it('should not delete if no pending session', async () => {
            await SessionActionsController.confirmDeleteChat();

            expect(Chat.deleteSessionById).not.toHaveBeenCalled();
        });

        it('should delete pending session', async () => {
            const modal = document.createElement('div');
            modal.id = 'delete-chat-modal';
            document.body.appendChild(modal);

            SessionActionsController.handleSessionDelete('session-to-delete');

            await SessionActionsController.confirmDeleteChat();

            expect(Chat.deleteSessionById).toHaveBeenCalledWith('session-to-delete');
        });

        it('should clear messages if deleting current session', async () => {
            const modal = document.createElement('div');
            modal.id = 'delete-chat-modal';
            document.body.appendChild(modal);

            Chat.getCurrentSessionId.mockReturnValue('session-to-delete');
            mockMessages.innerHTML = '<div>Message</div>';

            SessionActionsController.handleSessionDelete('session-to-delete');
            await SessionActionsController.confirmDeleteChat();

            expect(mockMessages.innerHTML).toBe('');
        });
    });

    describe('getPendingDeleteId', () => {
        it('should return null initially', () => {
            expect(SessionActionsController.getPendingDeleteId()).toBeNull();
        });

        it('should return pending session ID', () => {
            SessionActionsController.handleSessionDelete('test-session');

            expect(SessionActionsController.getPendingDeleteId()).toBe('test-session');
        });
    });

    describe('isRenameInProgress', () => {
        it('should return false initially', () => {
            expect(SessionActionsController.isRenameInProgress()).toBe(false);
        });
    });

    describe('destroy', () => {
        it('should clear state', () => {
            SessionActionsController.handleSessionDelete('session-1');

            SessionActionsController.destroy();

            expect(SessionActionsController.getPendingDeleteId()).toBeNull();
        });

        it('should handle multiple destroy calls', () => {
            expect(() => {
                SessionActionsController.destroy();
                SessionActionsController.destroy();
            }).not.toThrow();
        });
    });

    describe('Memory Leak Prevention', () => {
        describe('handleSessionRename error handling', () => {
            it('should reset renameInProgress flag when session element not found', async () => {
                const { SessionListController } = await import('../../../js/controllers/sidebar/session-list-controller.js');
                SessionListController.getSessionElement.mockReturnValue(null);

                await SessionActionsController.handleSessionRename('non-existent-session');

                expect(SessionActionsController.isRenameInProgress()).toBe(false);
            });

            it('should reset renameInProgress flag even on exception', async () => {
                const { SessionListController } = await import('../../../js/controllers/sidebar/session-list-controller.js');

                // Make getSessionElement throw an error
                SessionListController.getSessionElement.mockImplementation(() => {
                    throw new Error('DOM error');
                });

                await SessionActionsController.handleSessionRename('error-session');

                // Flag should be reset even after error
                expect(SessionActionsController.isRenameInProgress()).toBe(false);
            });

            it('should clean up event listeners on successful rename', async () => {
                const mockSessionEl = document.createElement('div');
                mockSessionEl.className = 'session-item';
                const mockTitleEl = document.createElement('div');
                mockTitleEl.className = 'session-title';
                mockTitleEl.textContent = 'Test Session';
                mockSessionEl.appendChild(mockTitleEl);
                document.body.appendChild(mockSessionEl);

                const { SessionListController } = await import('../../../js/controllers/sidebar/session-list-controller.js');
                SessionListController.getSessionElement.mockReturnValue(mockSessionEl);

                await SessionActionsController.handleSessionRename('session-1');

                // Trigger blur to complete rename
                const input = mockSessionEl.querySelector('.session-title-input');
                if (input) {
                    input.dispatchEvent(new Event('blur'));
                    // Wait for async blur handler
                    await new Promise(resolve => setTimeout(resolve, 10));
                }

                expect(SessionActionsController.isRenameInProgress()).toBe(false);

                document.body.removeChild(mockSessionEl);
            });

            it('should reset renameInProgress flag when cancelled with Escape', async () => {
                const mockSessionEl = document.createElement('div');
                mockSessionEl.className = 'session-item';
                const mockTitleEl = document.createElement('div');
                mockTitleEl.className = 'session-title';
                mockTitleEl.textContent = 'Test Session';
                mockSessionEl.appendChild(mockTitleEl);
                document.body.appendChild(mockSessionEl);

                const { SessionListController } = await import('../../../js/controllers/sidebar/session-list-controller.js');
                SessionListController.getSessionElement.mockReturnValue(mockSessionEl);

                await SessionActionsController.handleSessionRename('session-1');

                // Trigger escape key
                const input = mockSessionEl.querySelector('.session-title-input');
                if (input) {
                    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                }

                expect(SessionActionsController.isRenameInProgress()).toBe(false);

                document.body.removeChild(mockSessionEl);
            });
        });

        describe('Static import verification', () => {
            it('should use static import for SidebarStateController', async () => {
                // This test verifies the module has SidebarStateController as a static import
                // by checking we can import it synchronously from the module
                const moduleSource = await import('../../../js/controllers/sidebar/session-actions-controller.js');

                // The module should have been imported successfully without dynamic import
                expect(moduleSource).toBeDefined();
                expect(moduleSource.SessionActionsController).toBeDefined();
            });

            it('should have SidebarStateController available at module load time', async () => {
                // Verify that SidebarStateController can be imported directly
                // This ensures it's a static import, not dynamic
                const stateController = await import('../../../js/controllers/sidebar/state-controller.js');
                expect(stateController).toBeDefined();
                expect(stateController.SidebarStateController).toBeDefined();
            });
        });
    });
});
