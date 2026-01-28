/**
 * Unit Tests for Fallback Response Generator
 * @module tests/unit/fallback/fallback-response
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the fallback-response-service
vi.mock('/Users/rhinesharar/rhythm-chamber/js/services/fallback-response-service.js', () => ({
    FallbackResponseService: {
        generateFallbackResponse: vi.fn((message, context) => {
            // Return a simple fallback response
            return `I apologize, but I'm unable to process your request at the moment. Please try again later.`;
        })
    }
}));

describe('Fallback Response Generator', () => {
    let generateFallbackResponse;

    beforeEach(async () => {
        // Clear mocks before each test
        vi.clearAllMocks();
        // Import after mocking
        const module = await import('/Users/rhinesharar/rhythm-chamber/js/services/fallback/fallback-response.js');
        generateFallbackResponse = module.generateFallbackResponse;
    });

    describe('Basic Response Generation', () => {
        it('should generate fallback response for simple message', async () => {
            const messages = [{ role: 'user', content: 'Hello' }];
            const response = await generateFallbackResponse(messages);

            expect(response).toBeDefined();
            expect(response.content).toBeDefined();
            expect(response.status).toBe('success');
            expect(response.role).toBe('assistant');
            expect(response.isFallback).toBe(true);
        });

        it('should generate fallback response for complex message', async () => {
            const messages = [
                { role: 'user', content: 'What is the capital of France?' },
                { role: 'assistant', content: 'Paris is the capital of France.' },
                { role: 'user', content: 'Tell me more about it.' }
            ];

            const response = await generateFallbackResponse(messages);

            expect(response.content).toBeDefined();
            expect(response.isFallback).toBe(true);
        });
    });

    describe('Query Context Generation', () => {
        it('should generate query context from last message', async () => {
            const messages = [
                { role: 'user', content: 'First message' },
                { role: 'user', content: 'Second message' }
            ];

            const { FallbackResponseService } = await import('/Users/rhinesharar/rhythm-chamber/js/services/fallback-response-service.js');
            await generateFallbackResponse(messages);

            expect(FallbackResponseService.generateFallbackResponse).toHaveBeenCalledWith(
                'Second message',
                expect.objectContaining({
                    message: 'Second message',
                    timestamp: expect.any(Number),
                    hasPersonality: false,
                    hasPatterns: false
                })
            );
        });

        it('should handle empty messages array', async () => {
            const messages = [];

            const response = await generateFallbackResponse(messages);

            expect(response.content).toBeDefined();
            expect(response.isFallback).toBe(true);
        });

        it('should handle messages without content', async () => {
            const messages = [{ role: 'user' }];

            const response = await generateFallbackResponse(messages);

            expect(response.content).toBeDefined();
        });
    });

    describe('Response Structure', () => {
        it('should always include required fields', async () => {
            const messages = [{ role: 'user', content: 'Test' }];
            const response = await generateFallbackResponse(messages);

            expect(response).toHaveProperty('content');
            expect(response).toHaveProperty('status', 'success');
            expect(response).toHaveProperty('role', 'assistant');
            expect(response).toHaveProperty('isFallback', true);
        });

        it('should mark response as fallback', async () => {
            const messages = [{ role: 'user', content: 'Test' }];
            const response = await generateFallbackResponse(messages);

            expect(response.isFallback).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        it('should handle very long messages', async () => {
            const longContent = 'A'.repeat(10000);
            const messages = [{ role: 'user', content: longContent }];

            const response = await generateFallbackResponse(messages);

            expect(response.content).toBeDefined();
        });

        it('should handle special characters in message', async () => {
            const specialContent = 'Test with special chars: <>&"\'\\n\\t';
            const messages = [{ role: 'user', content: specialContent }];

            const response = await generateFallbackResponse(messages);

            expect(response.content).toBeDefined();
        });

        it('should handle Unicode characters', async () => {
            const unicodeContent = 'Test with emoji 🎉 and Unicode 中文';
            const messages = [{ role: 'user', content: unicodeContent }];

            const response = await generateFallbackResponse(messages);

            expect(response.content).toBeDefined();
        });

        it('should handle array of multiple messages', async () => {
            const messages = Array.from({ length: 10 }, (_, i) => ({
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: `Message ${i}`
            }));

            const response = await generateFallbackResponse(messages);

            expect(response.content).toBeDefined();
        });
    });

    describe('Integration with Service', () => {
        it('should call FallbackResponseService with correct parameters', async () => {
            const messages = [{ role: 'user', content: 'Test message' }];
            const { FallbackResponseService } = await import('/Users/rhinesharar/rhythm-chamber/js/services/fallback-response-service.js');

            await generateFallbackResponse(messages);

            expect(FallbackResponseService.generateFallbackResponse).toHaveBeenCalledTimes(1);
            expect(FallbackResponseService.generateFallbackResponse).toHaveBeenCalledWith(
                'Test message',
                expect.objectContaining({
                    message: 'Test message',
                    timestamp: expect.any(Number),
                    hasPersonality: false,
                    hasPatterns: false
                })
            );
        });
    });
});
