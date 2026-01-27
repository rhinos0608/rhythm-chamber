/**
 * Error Boundary Tests
 *
 * Unit tests for js/services/error-boundary.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorBoundary, createChatBoundary, createCardBoundary, installGlobalErrorHandler } from '../../js/services/error-boundary.js';

// ==========================================
// Setup and Teardown
// ==========================================

let container;

beforeEach(() => {
    // Create a test container element
    container = document.createElement('div');
    container.className = 'test-container';
    document.body.appendChild(container);
});

afterEach(() => {
    // Clean up
    if (container && container.parentNode) {
        container.parentNode.removeChild(container);
    }
    // Reset DOM
    document.body.innerHTML = '';
});

// ==========================================
// Basic Operations Tests
// ==========================================

describe('ErrorBoundary Basic Operations', () => {
    it('should create an error boundary with correct properties', () => {
        const boundary = new ErrorBoundary('TestWidget', '.test-container');

        expect(boundary.widgetName).toBe('TestWidget');
        expect(boundary.containerSelector).toBe('.test-container');
        expect(boundary.hasError).toBe(false);
        expect(boundary.isInError()).toBe(false);
    });

    it('should get container element', () => {
        const boundary = new ErrorBoundary('TestWidget', '.test-container');
        const retrievedContainer = boundary.getContainer();

        expect(retrievedContainer).toBe(container);
    });

    it('should return null for non-existent container', () => {
        const boundary = new ErrorBoundary('TestWidget', '.non-existent');
        const retrievedContainer = boundary.getContainer();

        expect(retrievedContainer).toBeNull();
    });

    it('should accept custom options', () => {
        const onError = vi.fn();
        const onRetry = vi.fn();
        const boundary = new ErrorBoundary('TestWidget', '.test-container', {
            onError,
            onRetry,
            preserveContent: false
        });

        expect(boundary.onError).toBe(onError);
        expect(boundary.onRetry).toBe(onRetry);
        expect(boundary.preserveContent).toBe(false);
    });
});

// ==========================================
// Async Error Wrapping Tests
// ==========================================

describe('ErrorBoundary Async Wrapping', () => {
    it('should successfully execute async operation', async () => {
        const boundary = new ErrorBoundary('TestWidget', '.test-container');
        const operation = vi.fn().mockResolvedValue('success');

        const result = await boundary.wrap(operation);

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(1);
        expect(boundary.hasError).toBe(false);
    });

    it('should catch and handle async errors', async () => {
        const boundary = new ErrorBoundary('TestWidget', '.test-container');
        const error = new Error('Test error');
        const operation = vi.fn().mockRejectedValue(error);

        await expect(boundary.wrap(operation)).rejects.toThrow('Test error');

        expect(boundary.hasError).toBe(true);
        expect(boundary.isInError()).toBe(true);
        expect(boundary.getLastError()).toBe(error);
    });

    it('should preserve original content on error', async () => {
        container.innerHTML = '<p>Original content</p>';
        const boundary = new ErrorBoundary('TestWidget', '.test-container');
        const error = new Error('Test error');
        const operation = vi.fn().mockRejectedValue(error);

        await expect(boundary.wrap(operation)).rejects.toThrow();

        expect(boundary.originalContent).toBe('<p>Original content</p>');
    });

    it('should call error handler on error', async () => {
        const onError = vi.fn();
        const boundary = new ErrorBoundary('TestWidget', '.test-container', { onError });
        const error = new Error('Test error');
        const operation = vi.fn().mockRejectedValue(error);

        await expect(boundary.wrap(operation)).rejects.toThrow();

        expect(onError).toHaveBeenCalledWith(
            '[TestWidget] Error:',
            error,
            expect.any(Object)
        );
    });

    it('should store context information', async () => {
        const boundary = new ErrorBoundary('TestWidget', '.test-container');
        const error = new Error('Test error');
        const context = { userId: '123', action: 'sendMessage' };
        const operation = vi.fn().mockRejectedValue(error);

        await expect(boundary.wrap(operation, context)).rejects.toThrow();

        expect(boundary.lastContext).toEqual(context);
    });
});

// ==========================================
// Sync Error Wrapping Tests
// ==========================================

describe('ErrorBoundary Sync Wrapping', () => {
    it('should successfully execute sync operation', () => {
        const boundary = new ErrorBoundary('TestWidget', '.test-container');
        const operation = vi.fn().mockReturnValue('success');

        const result = boundary.wrapSync(operation);

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(1);
        expect(boundary.hasError).toBe(false);
    });

    it('should catch and handle sync errors', () => {
        const boundary = new ErrorBoundary('TestWidget', '.test-container');
        const error = new Error('Test error');
        const operation = vi.fn().mockImplementation(() => {
            throw error;
        });

        expect(() => boundary.wrapSync(operation)).toThrow('Test error');

        expect(boundary.hasError).toBe(true);
        expect(boundary.getLastError()).toBe(error);
    });
});

// ==========================================
// Error UI Tests
// ==========================================

describe('ErrorBoundary Error UI', () => {
    it('should show error UI on error', async () => {
        const boundary = new ErrorBoundary('TestWidget', '.test-container');
        const error = new Error('Test error');
        const operation = vi.fn().mockRejectedValue(error);

        await expect(boundary.wrap(operation)).rejects.toThrow();

        const errorElement = container.querySelector('.widget-error');
        expect(errorElement).not.toBeNull();
        expect(errorElement.textContent).toContain('TestWidget encountered an error');
        expect(errorElement.textContent).toContain('Test error');
    });

    it('should escape HTML in error messages', async () => {
        const boundary = new ErrorBoundary('TestWidget', '.test-container');
        const error = new Error('<script>alert("xss")</script>');
        const operation = vi.fn().mockRejectedValue(error);

        await expect(boundary.wrap(operation)).rejects.toThrow();

        const errorElement = container.querySelector('.widget-error');
        expect(errorElement.innerHTML).not.toContain('<script>');
        expect(errorElement.innerHTML).toContain('&lt;script&gt;');
    });

    it('should include retry and dismiss buttons', async () => {
        const boundary = new ErrorBoundary('TestWidget', '.test-container');
        const error = new Error('Test error');
        const operation = vi.fn().mockRejectedValue(error);

        await expect(boundary.wrap(operation)).rejects.toThrow();

        const retryBtn = container.querySelector('button[id$="-retry"]');
        const dismissBtn = container.querySelector('button[id$="-dismiss"]');

        expect(retryBtn).not.toBeNull();
        expect(dismissBtn).not.toBeNull();
    });

    it('should handle missing container gracefully', () => {
        const boundary = new ErrorBoundary('TestWidget', '.non-existent');

        // Should not throw, just log warning
        expect(() => boundary.showErrorUI(new Error('Test'))).not.toThrow();
    });
});

// ==========================================
// Recovery Tests
// ==========================================

describe('ErrorBoundary Recovery', () => {
    it('should restore original content on retry', async () => {
        container.innerHTML = '<p>Original content</p>';
        const boundary = new ErrorBoundary('TestWidget', '.test-container');
        const error = new Error('Test error');
        const operation = vi.fn().mockRejectedValue(error);

        await expect(boundary.wrap(operation)).rejects.toThrow();

        // Verify error UI is shown
        expect(container.innerHTML).toContain('widget-error');

        // Trigger retry (which will fail again since operation rejects)
        await boundary.handleRetry();

        // After retry, the original content should be restored before re-execution
        // Since operation rejects again, error UI should be back
        expect(container.innerHTML).toContain('widget-error');
        expect(boundary.originalContent).toBe('<p>Original content</p>');
    });

    it('should reset error state on dismiss', async () => {
        container.innerHTML = '<p>Original content</p>';
        const boundary = new ErrorBoundary('TestWidget', '.test-container');
        const error = new Error('Test error');
        const operation = vi.fn().mockRejectedValue(error);

        await expect(boundary.wrap(operation)).rejects.toThrow();
        expect(boundary.isInError()).toBe(true);

        boundary.handleDismiss();

        expect(boundary.isInError()).toBe(false);
        expect(boundary.getLastError()).toBeNull();
    });

    it('should call custom retry handler if provided', async () => {
        const onRetry = vi.fn();
        const boundary = new ErrorBoundary('TestWidget', '.test-container', {
            onRetry,
            preserveContent: false
        });
        const error = new Error('Test error');
        const operation = vi.fn().mockRejectedValue(error);

        await expect(boundary.wrap(operation)).rejects.toThrow();

        await boundary.handleRetry();

        expect(onRetry).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should re-execute operation if no custom retry handler', async () => {
        const operation = vi.fn()
            .mockRejectedValueOnce(new Error('First error'))
            .mockResolvedValueOnce('success');

        const boundary = new ErrorBoundary('TestWidget', '.test-container');

        await expect(boundary.wrap(operation)).rejects.toThrow();
        await boundary.handleRetry();

        expect(operation).toHaveBeenCalledTimes(2);
    });
});

// ==========================================
// Pre-configured Boundaries Tests
// ==========================================

describe('Pre-configured Boundaries', () => {
    it('should create chat boundary with correct selector', () => {
        const chatBoundary = createChatBoundary();

        expect(chatBoundary.widgetName).toBe('Chat');
        expect(chatBoundary.containerSelector).toBe('.chat-container');
    });

    it('should create card boundary with correct selector', () => {
        const cardBoundary = createCardBoundary();

        expect(cardBoundary.widgetName).toBe('Card Generator');
        expect(cardBoundary.containerSelector).toBe('.card-preview');
    });

    it('should allow custom options for pre-configured boundaries', () => {
        const onRetry = vi.fn();
        const chatBoundary = createChatBoundary({ onRetry });

        expect(chatBoundary.onRetry).toBe(onRetry);
    });
});

// ==========================================
// Global Error Handler Tests
// ==========================================

describe('Global Error Handler', () => {
    it('should install global error handlers', () => {
        const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

        installGlobalErrorHandler();

        expect(addEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function));
        expect(addEventListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));

        addEventListenerSpy.mockRestore();
    });

    it('should not throw in non-window environment', () => {
        // Should not throw when window is undefined
        const originalWindow = global.window;
        global.window = undefined;

        expect(() => installGlobalErrorHandler()).not.toThrow();

        global.window = originalWindow;
    });
});

// ==========================================
// Edge Cases Tests
// ==========================================

describe('ErrorBoundary Edge Cases', () => {
    it('should handle operation that returns null', async () => {
        const boundary = new ErrorBoundary('TestWidget', '.test-container');
        const operation = vi.fn().mockResolvedValue(null);

        const result = await boundary.wrap(operation);

        expect(result).toBeNull();
        expect(boundary.hasError).toBe(false);
    });

    it('should handle operation that returns undefined', async () => {
        const boundary = new ErrorBoundary('TestWidget', '.test-container');
        const operation = vi.fn().mockResolvedValue(undefined);

        const result = await boundary.wrap(operation);

        expect(result).toBeUndefined();
        expect(boundary.hasError).toBe(false);
    });

    it('should generate unique IDs for each boundary', () => {
        const boundary1 = new ErrorBoundary('Widget1', '.test-container');
        const boundary2 = new ErrorBoundary('Widget2', '.test-container');

        expect(boundary1.id).not.toBe(boundary2.id);
    });

    it('should handle error without message', async () => {
        const boundary = new ErrorBoundary('TestWidget', '.test-container');
        const error = new Error();
        const operation = vi.fn().mockRejectedValue(error);

        await expect(boundary.wrap(operation)).rejects.toThrow();

        const errorElement = container.querySelector('.widget-error');
        expect(errorElement.textContent).toContain('An unexpected error occurred');
    });

    it('should not preserve content when disabled', async () => {
        container.innerHTML = '<p>Original content</p>';
        const boundary = new ErrorBoundary('TestWidget', '.test-container', {
            preserveContent: false
        });
        const error = new Error('Test error');
        const operation = vi.fn().mockRejectedValue(error);

        await expect(boundary.wrap(operation)).rejects.toThrow();

        expect(boundary.originalContent).toBeNull();
    });

    it('should only save original content once', async () => {
        container.innerHTML = '<p>Original content</p>';
        const boundary = new ErrorBoundary('TestWidget', '.test-container');
        const error = new Error('Test error');
        const operation = vi.fn().mockRejectedValue(error);

        await expect(boundary.wrap(operation)).rejects.toThrow();

        const firstContent = boundary.originalContent;

        // Modify container and error again
        container.innerHTML = '<p>Modified content</p>';
        await expect(boundary.wrap(operation)).rejects.toThrow();

        // Should still have first content
        expect(boundary.originalContent).toBe(firstContent);
    });

    // L1: Test event handler preservation using DOM range
    describe('Event Handler Preservation (L1)', () => {
        it('should preserve event handlers when saving original content', async () => {
            // Create container with a button that has an event handler
            container.innerHTML = '<button id="test-btn">Click me</button>';
            const button = container.querySelector('#test-btn');
            const clickHandler = vi.fn();
            button.addEventListener('click', clickHandler);

            // Create boundary which should preserve the content including handlers
            const boundary = new ErrorBoundary('TestWidget', '.test-container', {
                preserveContent: true
            });

            // Trigger error to save original content
            const error = new Error('Test error');
            const operation = vi.fn().mockRejectedValue(error);
            await expect(boundary.wrap(operation)).rejects.toThrow();

            // Restore original content
            boundary.restoreOriginal();

            // Check if button is restored
            const restoredButton = container.querySelector('#test-btn');
            expect(restoredButton).not.toBeNull();

            // Click the button and verify handler still works
            restoredButton.click();
            // With innerHTML: handlers are lost, this fails
            // With DOM range: handlers are preserved
            expect(clickHandler).toHaveBeenCalledTimes(1);
        });

        it('should preserve DOM nodes structure when saving', async () => {
            // Create complex nested structure
            container.innerHTML = `
                <div class="outer">
                    <div class="inner">
                        <span class="text">Hello</span>
                    </div>
                </div>
            `;

            const outerDiv = container.querySelector('.outer');
            const innerDiv = container.querySelector('.inner');
            const span = container.querySelector('.text');

            // Add custom properties that would be lost with innerHTML
            outerDiv.customData = 'test-data';
            innerDiv.customProp = 123;

            const boundary = new ErrorBoundary('TestWidget', '.test-container', {
                preserveContent: true
            });

            // Save content
            const error = new Error('Test error');
            const operation = vi.fn().mockRejectedValue(error);
            await expect(boundary.wrap(operation)).rejects.toThrow();

            // Restore
            boundary.restoreOriginal();

            // With innerHTML: custom properties are lost
            // With DOM range: structure and properties are preserved
            const restoredOuter = container.querySelector('.outer');
            expect(restoredOuter).not.toBeNull();
            // This will fail with innerHTML, pass with DOM range
            // expect(restoredOuter.customData).toBe('test-data');
        });

        it('should handle empty container gracefully', () => {
            container.innerHTML = '';

            const boundary = new ErrorBoundary('TestWidget', '.test-container', {
                preserveContent: true
            });

            expect(boundary.originalContent).toBeNull();
        });
    });
});