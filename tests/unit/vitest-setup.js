/**
 * Vitest Setup File
 *
 * Sets up test environment globals and mocks that happy-dom doesn't provide.
 */

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

// Mock localStorage with full implementation
class LocalStorageMock {
  constructor() {
    this.store = new Map();
  }

  getItem(key) {
    const value = this.store.get(key);
    return value !== undefined ? value : null;
  }

  setItem(key, value) {
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  get length() {
    return this.store.size;
  }

  key(index) {
    const keys = Array.from(this.store.keys());
    return keys[index] || null;
  }
}

// Create and assign localStorage mock
const localStorage = new LocalStorageMock();
globalThis.localStorage = localStorage;

console.log('[Vitest Setup] localStorage mock initialized');

// Set up fake-indexeddb for tests that require IndexedDB
globalThis.indexedDB = new IDBFactory();
global.indexedDB = globalThis.indexedDB; // Also set on global for tests
globalThis.IDBKeyRange = IDBKeyRange;
global.IDBKeyRange = globalThis.IDBKeyRange;

console.log('[Vitest Setup] IndexedDB mock initialized');

// Mock navigator.storage for storage quota tests
if (!globalThis.navigator) {
  globalThis.navigator = {};
}
if (!global.navigator) {
  global.navigator = globalThis.navigator;
}

if (!globalThis.navigator.storage) {
  globalThis.navigator.storage = {
    estimate: async () => ({ usage: 0, quota: 100 * 1024 * 1024 }),
  };
}
global.navigator.storage = globalThis.navigator.storage;

console.log('[Vitest Setup] navigator.storage mock initialized');
