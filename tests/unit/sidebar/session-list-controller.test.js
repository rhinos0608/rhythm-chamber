/**
 * SessionListController Unit Tests
 *
 * Tests the session list rendering functionality
 * @module tests/unit/sidebar/session-list-controller.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies before importing
vi.mock('../../../js/chat.js', () => ({
    Chat: {
        listSessions: vi.fn(() => Promise.resolve([])),
        getCurrentSessionId: vi.fn(() => 'session-1')
    }
}));

import { SessionListController } from '../../../js/controllers/sidebar/session-list-controller.js';
import { escapeHtml } from '../../../js/utils/html-escape.js';

describe('SessionListController', () => {
    let mockSessionsContainer;

    beforeEach(() => {
        // Reset DOM
        document.body.innerHTML = '';

        // Create mock DOM elements
        mockSessionsContainer = document.createElement('div');
        mockSessionsContainer.id = 'sidebar-sessions';
        document.body.appendChild(mockSessionsContainer);

        // Clear all mocks
        vi.clearAllMocks();

        // Initialize controller
        SessionListController.init();
    });

    afterEach(() => {
        SessionListController.destroy();
        document.body.innerHTML = '';
    });

    describe('Public API', () => {
        it('should have init method', () => {
            expect(SessionListController.init).toBeDefined();
        });

        it('should have renderSessionList method', () => {
            expect(SessionListController.renderSessionList).toBeDefined();
        });

        it('should has formatRelativeDate method', () => {
            expect(SessionListController.formatRelativeDate).toBeDefined();
        });

        it('should have isValidSessionId method', () => {
            expect(SessionListController.isValidSessionId).toBeDefined();
        });

        it('should have getContainer method', () => {
            expect(SessionListController.getContainer).toBeDefined();
        });

        it('should has destroy method', () => {
            expect(SessionListController.destroy).toBeDefined();
        });
    });

    describe('formatRelativeDate', () => {
        it('should return "Today" for today', () => {
            const today = new Date();
            expect(SessionListController.formatRelativeDate(today)).toBe('Today');
        });

        it('should return "Yesterday" for yesterday', () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            expect(SessionListController.formatRelativeDate(yesterday)).toBe('Yesterday');
        });

        it('should return "X days ago" for recent days', () => {
            const date = new Date();
            date.setDate(date.getDate() - 3);
            expect(SessionListController.formatRelativeDate(date)).toBe('3 days ago');
        });

        it('should return "X weeks ago" for weeks', () => {
            const date = new Date();
            date.setDate(date.getDate() - 14);
            expect(SessionListController.formatRelativeDate(date)).toBe('2 weeks ago');
        });

        it('should return formatted date for older dates', () => {
            const date = new Date('2024-01-15');
            const result = SessionListController.formatRelativeDate(date);
            expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
        });
    });

    describe('isValidSessionId', () => {
        it('should accept valid session IDs', () => {
            expect(SessionListController.isValidSessionId('session-1')).toBe(true);
            expect(SessionListController.isValidSessionId('session_123')).toBe(true);
            expect(SessionListController.isValidSessionId('abc123-xyz')).toBe(true);
            expect(SessionListController.isValidSessionId('ABC123')).toBe(true);
        });

        it('should reject invalid session IDs', () => {
            expect(SessionListController.isValidSessionId('session.1')).toBe(false);
            expect(SessionListController.isValidSessionId('session 1')).toBe(false);
            expect(SessionListController.isValidSessionId('session@1')).toBe(false);
            expect(SessionListController.isValidSessionId('session$1')).toBe(false);
            expect(SessionListController.isValidSessionId('')).toBe(false);
            // The regex test returns false for null/undefined (no match)
            // Note: in JS, /regex/.test(null) returns false, not an error
            expect(SessionListController.isValidSessionId(null)).toBe(false);
            expect(SessionListController.isValidSessionId(undefined)).toBe(false);
        });

        it('should prevent script injection attempts', () => {
            expect(SessionListController.isValidSessionId('<script>')).toBe(false);
            expect(SessionListController.isValidSessionId('"; DROP TABLE;--')).toBe(false);
            expect(SessionListController.isValidSessionId('"><script>')).toBe(false);
        });
    });

    describe('renderEmptyState', () => {
        it('should render empty state markup', () => {
            SessionListController.renderEmptyState();

            const emptyState = mockSessionsContainer.querySelector('.sidebar-empty');
            expect(emptyState).toBeTruthy();
        });

        it('should include emoji in empty state', () => {
            SessionListController.renderEmptyState();

            const emoji = mockSessionsContainer.querySelector('.emoji');
            expect(emoji).toBeTruthy();
            expect(emoji.textContent).toBe('💬');
        });

        it('should include action button', () => {
            SessionListController.renderEmptyState();

            const button = mockSessionsContainer.querySelector('[data-action="new-chat-from-empty"]');
            expect(button).toBeTruthy();
        });
    });

    describe('renderSessions', () => {
        it('should render session items', () => {
            const sessions = [
                { id: 'session-1', title: 'Test Chat', updatedAt: new Date().toISOString(), messageCount: 5 }
            ];

            SessionListController.renderSessions(sessions, 'session-1');

            const sessionItem = mockSessionsContainer.querySelector('.session-item');
            expect(sessionItem).toBeTruthy();
        });

        it('should mark active session', () => {
            const sessions = [
                { id: 'session-1', title: 'Active Chat', updatedAt: new Date().toISOString(), messageCount: 1 }
            ];

            SessionListController.renderSessions(sessions, 'session-1');

            const activeItem = mockSessionsContainer.querySelector('.session-item.active');
            expect(activeItem).toBeTruthy();
        });

        it('should escape session titles', () => {
            const sessions = [
                { id: 'session-1', title: '<script>alert("XSS")</script>', updatedAt: new Date().toISOString(), messageCount: 1 }
            ];

            SessionListController.renderSessions(sessions, 'session-1');

            const html = mockSessionsContainer.innerHTML;
            expect(html).not.toContain('<script>');
            expect(html).toContain('&lt;script&gt;');
        });
    });

    describe('getContainer', () => {
        it('should return sessions container', () => {
            const container = SessionListController.getContainer();
            expect(container).toBe(mockSessionsContainer);
        });

        it('should return cached reference even when element removed from DOM', () => {
            // The controller caches the DOM reference, so removing from DOM
            // doesn't clear the cache - destroy() does that
            mockSessionsContainer.remove();

            const container = SessionListController.getContainer();
            // Still returns the cached reference (even though it's removed from DOM)
            expect(container).toBeTruthy();
        });

        it('should return null after destroy', () => {
            SessionListController.destroy();

            const container = SessionListController.getContainer();
            expect(container).toBeNull();
        });
    });

    describe('hasSessions', () => {
        it('should return false when container empty', () => {
            expect(SessionListController.hasSessions()).toBe(false);
        });

        it('should return true when sessions exist', () => {
            const sessions = [
                { id: 'session-1', title: 'Test', updatedAt: new Date().toISOString(), messageCount: 1 }
            ];
            SessionListController.renderSessions(sessions, 'session-1');

            expect(SessionListController.hasSessions()).toBe(true);
        });
    });

    describe('getSessionElement', () => {
        it('should find session by ID', () => {
            const sessions = [
                { id: 'session-abc', title: 'Test', updatedAt: new Date().toISOString(), messageCount: 1 }
            ];
            SessionListController.renderSessions(sessions, 'session-abc');

            const element = SessionListController.getSessionElement('session-abc');
            expect(element).toBeTruthy();
            expect(element.dataset.sessionId).toBe('session-abc');
        });

        it('should return null for non-existent session', () => {
            const element = SessionListController.getSessionElement('non-existent');
            expect(element).toBeNull();
        });
    });

    describe('removeSessionElement', () => {
        it('should remove session from DOM', () => {
            const sessions = [
                { id: 'session-to-remove', title: 'Test', updatedAt: new Date().toISOString(), messageCount: 1 }
            ];
            SessionListController.renderSessions(sessions, 'session-to-remove');

            expect(SessionListController.getSessionElement('session-to-remove')).toBeTruthy();

            SessionListController.removeSessionElement('session-to-remove');

            expect(SessionListController.getSessionElement('session-to-remove')).toBeNull();
        });

        it('should handle removing non-existent session', () => {
            expect(() => {
                SessionListController.removeSessionElement('non-existent');
            }).not.toThrow();
        });
    });

    describe('updateActiveState', () => {
        it('should add active class to selected session', () => {
            const sessions = [
                { id: 'session-1', title: 'Chat 1', updatedAt: new Date().toISOString(), messageCount: 1 },
                { id: 'session-2', title: 'Chat 2', updatedAt: new Date().toISOString(), messageCount: 1 }
            ];
            SessionListController.renderSessions(sessions, 'session-1');

            SessionListController.updateActiveState('session-2');

            const session1 = SessionListController.getSessionElement('session-1');
            const session2 = SessionListController.getSessionElement('session-2');

            expect(session1.classList.contains('active')).toBe(false);
            expect(session2.classList.contains('active')).toBe(true);
        });

        it('should update tabindex for accessibility', () => {
            const sessions = [
                { id: 'session-1', title: 'Chat 1', updatedAt: new Date().toISOString(), messageCount: 1 }
            ];
            SessionListController.renderSessions(sessions, 'session-1');

            SessionListController.updateActiveState('session-2'); // Different session

            const session1 = SessionListController.getSessionElement('session-1');
            expect(session1.tabIndex).toBe(-1);
        });
    });

    describe('destroy', () => {
        it('should clear DOM reference', () => {
            SessionListController.destroy();

            expect(SessionListController.getContainer()).toBeNull();
        });

        it('should handle multiple destroy calls', () => {
            SessionListController.destroy();

            expect(() => {
                SessionListController.destroy();
            }).not.toThrow();
        });
    });
});
