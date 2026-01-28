/**
 * Tests for Global Setup Mocks
 * TDD: Write failing test first, then fix the implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Worker Mock', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should return actual message data instead of null', async () => {
        const worker = new global.Worker('test-worker.js');
        const receivedMessages = [];

        worker.onmessage = (event) => {
            receivedMessages.push(event.data);
        };

        // Post a message with actual data
        const testMessage = { type: 'compute', payload: { value: 42 } };
        worker.postMessage(testMessage);

        // Wait for async delivery
        await vi.advanceTimersByTimeAsync(10);

        // The mock should return the actual message, not null
        expect(receivedMessages).toHaveLength(1);
        expect(receivedMessages[0]).toEqual(testMessage);
        expect(receivedMessages[0]).not.toBeNull();
    });

    it('should handle multiple messages correctly', async () => {
        const worker = new global.Worker('test-worker.js');
        const receivedMessages = [];

        worker.onmessage = (event) => {
            receivedMessages.push(event.data);
        };

        const messages = [
            { type: 'init', id: 1 },
            { type: 'process', id: 2 },
            { type: 'complete', id: 3 }
        ];

        messages.forEach(msg => worker.postMessage(msg));
        await vi.advanceTimersByTimeAsync(10);

        expect(receivedMessages).toHaveLength(3);
        expect(receivedMessages).toEqual(messages);
    });
});

describe('Fetch Mock', () => {
    it('should have headers.get() method available', async () => {
        const response = await global.fetch('https://example.com/api');

        // headers.get() should be a function
        expect(response.headers).toBeDefined();
        expect(typeof response.headers.get).toBe('function');
    });

    it('should return correct content-type header', async () => {
        const response = await global.fetch('https://example.com/api');

        expect(response.headers.get('content-type')).toBe('application/json');
    });

    it('should return null for unknown headers', async () => {
        const response = await global.fetch('https://example.com/api');

        expect(response.headers.get('x-unknown-header')).toBeNull();
    });
});
