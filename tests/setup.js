/**
 * Global Test Setup
 * Provides comprehensive mocks for browser APIs
 */

import { vi } from 'vitest';

// ==========================================
// Navigator Storage Mock
// ==========================================

// Create a storage mock that survives test reassignments
let storageEstimateMock = vi.fn().mockResolvedValue({
    usage: 50 * 1024 * 1024,      // 50 MB
    quota: 100 * 1024 * 1024      // 100 MB
});

// Initialize navigator if not present
if (!global.navigator) {
    global.navigator = {};
}

// Create storage with getter/setter to survive reassignments
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

// ==========================================
// BroadcastChannel Mock
// ==========================================

global.BroadcastChannel = class BroadcastChannel {
    constructor(name) {
        this.name = name;
        this.listeners = [];
    }

    postMessage(message) {
        // Simulate async message delivery
        setTimeout(() => {
            this.listeners.forEach(listener => {
                try {
                    listener({ data: message, type: 'message' });
                } catch (error) {
                    console.error('[BroadcastChannel] Error in listener:', error);
                }
            });
        }, 0);
    }

    addEventListener(type, listener) {
        if (type === 'message') {
            this.listeners.push(listener);
        }
    }

    removeEventListener(type, listener) {
        if (type === 'message') {
            const index = this.listeners.indexOf(listener);
            if (index > -1) {
                this.listeners.splice(index, 1);
            }
        }
    }

    close() {
        this.listeners = [];
    }
};

// ==========================================
// Storage Layer Mocks
// ==========================================

// Mock localStorage
const localStorageMock = (() => {
    let store = {};

    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => {
            store[key] = value.toString();
        },
        removeItem: (key) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
        get length() {
            return Object.keys(store).length;
        },
        key: (index) => {
            return Object.keys(store)[index] || null;
        }
    };
})();

Object.defineProperty(global, 'localStorage', {
    value: localStorageMock,
    writable: true
});

// Mock sessionStorage
const sessionStorageMock = (() => {
    let store = {};

    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => {
            store[key] = value.toString();
        },
        removeItem: (key) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
        get length() {
            return Object.keys(store).length;
        },
        key: (index) => {
            return Object.keys(store)[index] || null;
        }
    };
})();

Object.defineProperty(global, 'sessionStorage', {
    value: sessionStorageMock,
    writable: true
});

// ==========================================
// IndexedDB Mock (Enhanced)
// ==========================================

const mockDatabases = new Map();
const mockObjectStores = new Map();

global.indexedDB = {
    open: (name, version) => {
        return new Promise((resolve, reject) => {
            const mockRequest = {
                result: {
                    close: () => {},
                    createObjectStore: (name, options) => {
                        const store = {
                            name,
                            data: new Map(),
                            add: (data) => {
                                return new Promise((resolve) => {
                                    setTimeout(() => resolve(data), 0);
                                });
                            },
                            get: (key) => {
                                return new Promise((resolve) => {
                                    setTimeout(() => resolve(undefined), 0);
                                });
                            },
                            getAll: () => {
                                return new Promise((resolve) => {
                                    setTimeout(() => resolve([]), 0);
                                });
                            }
                        };
                        mockObjectStores.set(`${name}.${name}`, store);
                        return store;
                    },
                    transaction: (storeNames, mode) => {
                        return {
                            objectStore: (name) => {
                                return mockObjectStores.get(`${name}.${name}`) || {
                                    data: new Map(),
                                    add: (data) => Promise.resolve(data),
                                    get: (key) => Promise.resolve(undefined),
                                    getAll: () => Promise.resolve([])
                                };
                            }
                        };
                    }
                },
                onsuccess: null,
                onerror: null,
                onupgradeneeded: null
            };

            // Simulate async opening
            setTimeout(() => {
                if (mockRequest.onsuccess) {
                    mockRequest.onsuccess({ target: mockRequest });
                }
                resolve(mockRequest.result);
            }, 0);
        });
    },
    deleteDatabase: (name) => {
        return new Promise((resolve) => {
            setTimeout(() => resolve(), 0);
        });
    }
};

// ==========================================
// Device Memory Mock
// ==========================================

Object.defineProperty(global.navigator, 'deviceMemory', {
    value: 8, // 8 GB
    writable: true,
    configurable: true
});

// ==========================================
// Hardware Concurrency Mock
// ==========================================

Object.defineProperty(global.navigator, 'hardwareConcurrency', {
    value: 4, // 4 cores
    writable: true,
    configurable: true
});

// ==========================================
// SharedArrayBuffer Detection
// ==========================================

global.SharedArrayBuffer = global.SharedArrayBuffer || class SharedArrayBuffer {
    constructor(byteLength) {
        this.byteLength = byteLength;
        this.buffer = new ArrayBuffer(byteLength);
    }
};

// ==========================================
// Worker Mock
// ==========================================

global.Worker = class Worker {
    constructor(scriptURL) {
        this.scriptURL = scriptURL;
        this.onmessage = null;
        this.onerror = null;
    }

    postMessage(message, transferList) {
        // Simulate async message handling
        setTimeout(() => {
            if (this.onmessage) {
                this.onmessage({ data: null, type: 'message' });
            }
        }, 0);
    }

    terminate() {
        // Cleanup
    }
};

console.log('[Test Setup] All browser API mocks initialized');
