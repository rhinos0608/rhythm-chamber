/**
 * Vitest Setup File
 * 
 * Sets up test environment globals and mocks that happy-dom doesn't provide.
 */

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
