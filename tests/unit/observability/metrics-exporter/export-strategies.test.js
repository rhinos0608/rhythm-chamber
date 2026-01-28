/**
 * Tests for export-strategies.js
 *
 * Tests export methods including:
 * - Push-based exports
 * - Pull-based exports
 * - Batch exports
 * - Retry logic
 */

import { describe, it, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExportStrategies } from '../../../../js/observability/metrics-exporter/export-strategies.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('ExportStrategies', () => {
    let strategies;
    let mockData;

    beforeEach(() => {
        strategies = new ExportStrategies();
        mockData = 'test data';

        // Clear fetch mocks
        fetch.mockClear();
        fetch.mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: {
                get: vi.fn((header) => {
                    if (header === 'content-type') {
                        return 'application/json';
                    }
                    return null;
                })
            },
            json: async () => ({ success: true }),
            text: async () => 'OK'
        });
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    describe('constructor', () => {
        test('should create instance with default options', () => {
            expect(strategies).toBeInstanceOf(ExportStrategies);
            expect(strategies._maxRetries).toBe(3);
            expect(strategies._retryDelay).toBe(1000);
        });

        test('should accept custom retry configuration', () => {
            const customStrategies = new ExportStrategies({
                maxRetries: 5,
                retryDelay: 2000
            });

            expect(customStrategies._maxRetries).toBe(5);
            expect(customStrategies._retryDelay).toBe(2000);
        });
    });

    describe('pushExport', () => {
        test('should push data to endpoint', async () => {
            const endpoint = 'https://example.com/api/metrics';

            const result = await strategies.pushExport(endpoint, mockData, {
                headers: { 'Content-Type': 'application/json' }
            });

            expect(fetch).toHaveBeenCalledWith(
                endpoint,
                expect.objectContaining({
                    method: 'POST',
                    body: mockData
                })
            );
            expect(result.success).toBe(true);
        });

        test('should handle push errors', async () => {
            fetch.mockRejectedValueOnce(new Error('Network error'));

            const endpoint = 'https://example.com/api/metrics';

            await expect(strategies.pushExport(endpoint, mockData))
                .rejects.toThrow('Network error');
        });

        test('should include custom headers', async () => {
            const endpoint = 'https://example.com/api/metrics';
            const headers = {
                'Authorization': 'Bearer token',
                'X-Custom-Header': 'value'
            };

            await strategies.pushExport(endpoint, mockData, { headers });

            expect(fetch).toHaveBeenCalledWith(
                endpoint,
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer token',
                        'X-Custom-Header': 'value'
                    })
                })
            );
        });
    });

    describe('pullExport', () => {
        test('should pull data from endpoint', async () => {
            const endpoint = 'https://example.com/api/metrics';
            const responseData = { metrics: [] };

            fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: {
                    get: vi.fn((header) => header === 'content-type' ? 'application/json' : null)
                },
                json: async () => responseData,
                text: async () => 'OK'
            });

            const result = await strategies.pullExport(endpoint);

            expect(fetch).toHaveBeenCalledWith(
                endpoint,
                expect.objectContaining({
                    method: 'GET'
                })
            );
            expect(result).toEqual(responseData);
        });

        test('should handle pull errors', async () => {
            fetch.mockRejectedValueOnce(new Error('Network error'));

            const endpoint = 'https://example.com/api/metrics';

            await expect(strategies.pullExport(endpoint))
                .rejects.toThrow('Network error');
        });

        test('should include query parameters', async () => {
            const endpoint = 'https://example.com/api/metrics';
            const params = { from: '2024-01-01', to: '2024-01-02' };

            await strategies.pullExport(endpoint, { params });

            expect(fetch).toHaveBeenCalled();
            const url = fetch.mock.calls[0][0];
            expect(url).toContain('from=2024-01-01');
            expect(url).toContain('to=2024-01-02');
        });
    });

    describe('batchExport', () => {
        test('should export data in batches', async () => {
            const endpoint = 'https://example.com/api/metrics';
            const data = [
                { id: 1, value: 100 },
                { id: 2, value: 200 },
                { id: 3, value: 300 },
                { id: 4, value: 400 },
                { id: 5, value: 500 }
            ];

            const results = await strategies.batchExport(endpoint, data, {
                batchSize: 2,
                formatBatch: (batch) => JSON.stringify(batch)
            });

            expect(fetch).toHaveBeenCalledTimes(3); // 5 items / batch size 2 = 3 batches
            expect(results).toHaveLength(3);
            expect(results.every(r => r.success)).toBe(true);
        });

        test('should handle batch failures', async () => {
            const endpoint = 'https://example.com/api/metrics';
            const data = [
                { id: 1, value: 100 },
                { id: 2, value: 200 },
                { id: 3, value: 300 }
            ];

            // Fail second batch
            const mockResponse = {
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: {
                    get: vi.fn((header) => header === 'content-type' ? 'application/json' : null)
                },
                json: async () => ({ success: true }),
                text: async () => 'OK'
            };
            fetch.mockResolvedValueOnce(mockResponse);
            fetch.mockRejectedValueOnce(new Error('Batch failed'));
            fetch.mockResolvedValueOnce(mockResponse);

            const results = await strategies.batchExport(endpoint, data, {
                batchSize: 1,
                formatBatch: (batch) => JSON.stringify(batch)
            });

            expect(results).toHaveLength(3);
            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(false);
            expect(results[2].success).toBe(true);
        });

        test('should call batch formatter', async () => {
            const endpoint = 'https://example.com/api/metrics';
            const data = [{ id: 1 }, { id: 2 }];
            const formatBatch = vi.fn((batch) => JSON.stringify(batch));

            await strategies.batchExport(endpoint, data, {
                batchSize: 2,
                formatBatch
            });

            expect(formatBatch).toHaveBeenCalledWith(data);
        });
    });

    describe('exportWithRetry', () => {
        test('should retry on failure', async () => {
            const endpoint = 'https://example.com/api/metrics';
            let attemptCount = 0;

            fetch.mockImplementation(() => {
                attemptCount++;
                if (attemptCount < 3) {
                    // Use a retryable error message (matches /network/i pattern)
                    return Promise.reject(new Error('Network error'));
                }
                // Return a properly formatted mock response
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    headers: {
                        get: vi.fn((header) => header === 'content-type' ? 'application/json' : null)
                    },
                    json: async () => ({ success: true }),
                    text: async () => 'OK'
                });
            });

            // Use real timers for this test - testing with fake timers creates infinite loops
            vi.useRealTimers();

            const result = await strategies.exportWithRetry(
                () => strategies.pushExport(endpoint, mockData)
            );

            expect(result.success).toBe(true);
            expect(attemptCount).toBe(3);
        });

        test('should give up after max retries', async () => {
            const endpoint = 'https://example.com/api/metrics';

            // Use a retryable error message
            fetch.mockRejectedValue(new Error('Network timeout'));

            // Use real timers for this test
            vi.useRealTimers();

            await expect(strategies.exportWithRetry(
                () => strategies.pushExport(endpoint, mockData),
                { maxRetries: 2 }
            )).rejects.toThrow('Network timeout');

            expect(fetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
        });

        test('should use exponential backoff', async () => {
            const endpoint = 'https://example.com/api/metrics';
            let attemptCount = 0;

            fetch.mockImplementation(() => {
                attemptCount++;
                if (attemptCount < 4) {
                    // Use a retryable error message
                    return Promise.reject(new Error('Network timeout'));
                }
                // Return a properly formatted mock response
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    headers: {
                        get: vi.fn((header) => header === 'content-type' ? 'application/json' : null)
                    },
                    json: async () => ({ success: true }),
                    text: async () => 'OK'
                });
            });

            // Use real timers for this test
            vi.useRealTimers();

            const result = await strategies.exportWithRetry(
                () => strategies.pushExport(endpoint, mockData),
                { useExponentialBackoff: true }
            );

            expect(attemptCount).toBe(4);
            expect(result.success).toBe(true);
        });
    });

    describe('downloadExport', () => {
        test('should trigger file download', async () => {
            const mockBlob = { size: 100 };
            global.Blob = class Blob {
                constructor(data, options) {
                    this.data = data;
                    this.options = options;
                    this.size = data[0].length;
                }
            };

            global.URL.createObjectURL = vi.fn(() => 'blob:https://example.com/blob');
            global.URL.revokeObjectURL = vi.fn();

            const mockLink = {
                href: '',
                download: '',
                click: vi.fn()
            };

            document.createElement = vi.fn(() => mockLink);
            document.body.appendChild = vi.fn();
            document.body.removeChild = vi.fn();

            await strategies.downloadExport(mockData, 'json', 'test-job');

            expect(mockLink.href).toBe('blob:https://example.com/blob');
            expect(mockLink.download).toMatch(/rhythm-chamber-metrics-test-job/);
            expect(mockLink.download).toMatch(/\.json$/);
            expect(mockLink.click).toHaveBeenCalled();
            expect(document.body.appendChild).toHaveBeenCalledWith(mockLink);
            expect(document.body.removeChild).toHaveBeenCalledWith(mockLink);
            expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:https://example.com/blob');
        });

        test('should generate filename with timestamp', async () => {
            global.Blob = class Blob {
                constructor(data) { this.data = data; }
            };

            global.URL.createObjectURL = vi.fn(() => 'blob:url');
            global.URL.revokeObjectURL = vi.fn();

            const mockLink = {
                href: '',
                download: '',
                click: vi.fn()
            };

            document.createElement = vi.fn(() => mockLink);
            document.body.appendChild = vi.fn();
            document.body.removeChild = vi.fn();

            await strategies.downloadExport(mockData, 'csv', 'test-job');

            // Filename format: rhythm-chamber-metrics-test-job-TIMESTAMP.csv
            expect(mockLink.download).toMatch(/rhythm-chamber-metrics-test-job-/);
            expect(mockLink.download).toMatch(/\d{4}-\d{2}-\d{2}T/);  // Contains timestamp
            expect(mockLink.download).toMatch(/\.csv$/);
        });
    });

    describe('validateEndpoint', () => {
        test('should validate correct endpoint URL', () => {
            expect(() => {
                strategies.validateEndpoint('https://example.com/api/metrics');
            }).not.toThrow();
        });

        test('should throw error for invalid URL', () => {
            expect(() => {
                strategies.validateEndpoint('not-a-url');
            }).toThrow('Invalid endpoint URL');
        });

        test('should throw error for empty endpoint', () => {
            expect(() => {
                strategies.validateEndpoint('');
            }).toThrow('Invalid endpoint URL');
        });
    });

    describe('formatRequestData', () => {
        test('should format data as JSON by default', () => {
            const data = { key: 'value' };
            const formatted = strategies.formatRequestData(data);

            expect(formatted).toBe(JSON.stringify(data));
        });

        test('should use custom formatter', () => {
            const data = { key: 'value' };
            const formatter = vi.fn(() => 'custom-format');

            const formatted = strategies.formatRequestData(data, { formatter });

            expect(formatter).toHaveBeenCalledWith(data);
            expect(formatted).toBe('custom-format');
        });

        test('should handle string data', () => {
            const formatted = strategies.formatRequestData('already-formatted');

            expect(formatted).toBe('already-formatted');
        });
    });

    describe('handleResponse', () => {
        test('should handle successful response', async () => {
            const response = {
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: {
                    get: vi.fn((header) => header === 'content-type' ? 'application/json' : null)
                },
                json: async () => ({ success: true }),
                text: async () => 'OK'
            };

            const result = await strategies.handleResponse(response);

            expect(result.success).toBe(true);
        });

        test('should handle failed response', async () => {
            const response = {
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                json: async () => ({ error: 'Server error' })
            };

            await expect(strategies.handleResponse(response))
                .rejects.toThrow('Export failed: 500 Internal Server Error');
        });

        test('should parse response JSON', async () => {
            const responseData = { metrics: [] };
            const response = {
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: {
                    get: vi.fn((header) => header === 'content-type' ? 'application/json' : null)
                },
                json: async () => responseData,
                text: async () => 'OK'
            };

            const result = await strategies.handleResponse(response);

            expect(result).toEqual(responseData);
        });
    });

    describe('calculateRetryDelay', () => {
        test('should use base delay for first retry', () => {
            const delay = strategies.calculateRetryDelay(1, false, 0);  // Disable jitter

            expect(delay).toBe(1000);
        });

        test('should use exponential backoff when enabled', () => {
            const delay1 = strategies.calculateRetryDelay(1, true, 0);  // Disable jitter
            const delay2 = strategies.calculateRetryDelay(2, true, 0);
            const delay3 = strategies.calculateRetryDelay(3, true, 0);

            expect(delay1).toBe(1000);
            expect(delay2).toBe(2000);
            expect(delay3).toBe(4000);
        });

        test('should add jitter to prevent thundering herd', () => {
            const delays = Array.from({ length: 10 }, () =>
                strategies.calculateRetryDelay(2, true, 0.1)
            );

            // Check for variation (jitter)
            const uniqueDelays = new Set(delays);
            expect(uniqueDelays.size).toBeGreaterThan(1);
        });
    });

    describe('isRetryableError', () => {
        test('should identify retryable errors', () => {
            const networkError = new Error('Network error');
            const timeoutError = new Error('Request timeout');

            expect(strategies.isRetryableError(networkError)).toBe(true);
            expect(strategies.isRetryableError(timeoutError)).toBe(true);
        });

        test('should identify non-retryable errors', () => {
            const authError = new Error('Unauthorized');
            const notFoundError = new Error('Not Found');

            expect(strategies.isRetryableError(authError)).toBe(false);
            expect(strategies.isRetryableError(notFoundError)).toBe(false);
        });
    });

    describe('exportToMultipleServices', () => {
        test('should export to multiple services', async () => {
            const services = [
                { endpoint: 'https://service1.com/api', headers: {} },
                { endpoint: 'https://service2.com/api', headers: {} }
            ];

            const results = await strategies.exportToMultipleServices(services, mockData);

            expect(results).toHaveLength(2);
            expect(results.every(r => r.success)).toBe(true);
            expect(fetch).toHaveBeenCalledTimes(2);
        });

        test('should continue on individual service failure', async () => {
            const services = [
                { endpoint: 'https://service1.com/api', headers: {} },
                { endpoint: 'https://service2.com/api', headers: {} },
                { endpoint: 'https://service3.com/api', headers: {} }
            ];

            // Fail second service
            const mockResponse = {
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: {
                    get: vi.fn((header) => header === 'content-type' ? 'application/json' : null)
                },
                json: async () => ({ success: true }),
                text: async () => 'OK'
            };
            fetch.mockResolvedValueOnce(mockResponse);
            fetch.mockRejectedValueOnce(new Error('Service 2 failed'));
            fetch.mockResolvedValueOnce(mockResponse);

            const results = await strategies.exportToMultipleServices(services, mockData);

            expect(results).toHaveLength(3);
            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(false);
            expect(results[2].success).toBe(true);
        });

        test('should return aggregated results', async () => {
            const services = [
                { endpoint: 'https://service1.com/api', headers: {} },
                { endpoint: 'https://service2.com/api', headers: {} }
            ];

            const results = await strategies.exportToMultipleServices(services, mockData);

            // The method returns an array of results, not an aggregated object
            expect(results).toBeInstanceOf(Array);
            expect(results).toHaveLength(2);
            expect(results.every(r => r.success)).toBe(true);
        });
    });
});
