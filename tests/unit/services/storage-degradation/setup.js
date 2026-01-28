/**
 * Test setup for storage-degradation tests
 * Sets up navigator.storage mock for quota monitoring tests
 */

import { vi } from 'vitest';

// Mock navigator.storage.estimate API
if (!global.navigator) {
    global.navigator = {};
}

// Create storage object with getter/setter to survive test reassignments
let storageEstimateMock = vi.fn().mockResolvedValue({
    usage: 50 * 1024 * 1024,      // 50 MB
    quota: 100 * 1024 * 1024,     // 100 MB
    usageDetails: {
        indexedDB: 30 * 1024 * 1024,      // 30 MB
        serviceWorkers: 5 * 1024 * 1024,  // 5 MB
        cacheStorage: 10 * 1024 * 1024,   // 10 MB
        other: 5 * 1024 * 1024            // 5 MB
    }
});

Object.defineProperty(global.navigator, 'storage', {
    get() {
        return {
            estimate: storageEstimateMock
        };
    },
    set(value) {
        if (value && value.estimate) {
            storageEstimateMock = value.estimate;
        }
    },
    configurable: true
});

// Initial assignment
global.navigator.storage = {
    estimate: storageEstimateMock
};
