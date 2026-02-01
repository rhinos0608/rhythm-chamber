/**
 * SecureTokenStore Unit Tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const originalCrypto = globalThis.crypto;
const originalSecureContext = Object.getOwnPropertyDescriptor(window, 'isSecureContext');

function stubCrypto(stub) {
  Object.defineProperty(globalThis, 'crypto', {
    value: stub,
    configurable: true,
  });
}

function restoreCrypto() {
  if (originalCrypto) {
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      configurable: true,
    });
  } else {
    delete globalThis.crypto;
  }
}

function setSecureContext(value) {
  Object.defineProperty(window, 'isSecureContext', {
    value,
    configurable: true,
  });
}

function restoreSecureContext() {
  if (originalSecureContext) {
    Object.defineProperty(window, 'isSecureContext', originalSecureContext);
  } else {
    delete window.isSecureContext;
  }
}

// Mock IndexedDBCore before import
vi.mock('../../js/storage/indexeddb.js', () => ({
  IndexedDBCore: {
    STORES: { TOKENS: 'tokens' },
    clear: vi.fn().mockResolvedValue(),
    keys: vi.fn().mockResolvedValue([]),
  },
}));

describe('SecureTokenStore', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    setSecureContext(true);
    stubCrypto({
      subtle: { digest: vi.fn() },
    });
  });

  afterEach(() => {
    restoreCrypto();
    restoreSecureContext();
  });

  it('clears tokens with write-authority bypass', async () => {
    const { SecureTokenStore } = await import('../../js/security/secure-token-store.js');

    await SecureTokenStore.invalidateAllTokens('test');

    const { IndexedDBCore } = await import('../../js/storage/indexeddb.js');
    expect(IndexedDBCore.clear).toHaveBeenCalledWith('tokens', { bypassAuthority: true });
  });
});
