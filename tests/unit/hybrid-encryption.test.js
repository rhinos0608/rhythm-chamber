/**
 * Hybrid Encryption Tests
 *
 * Unit tests for the HybridEncryption module which provides
 * RSA-OAEP-2048 + AES-GCM-256 hybrid encryption.
 *
 * @module tests/unit/hybrid-encryption.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const originalCrypto = globalThis.crypto;

function mockCrypto() {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      subtle: {
        generateKey: async (algorithm, extractable, keyUsages) => {
          // Return mock key pair with extractable property
          if (algorithm.name === 'RSA-OAEP') {
            return {
              publicKey: { type: 'public', algorithm, extractable: true },
              privateKey: { type: 'private', algorithm, extractable },
            };
          }
          // AES key
          return { type: 'secret', algorithm, extractable };
        },
        encrypt: async (algorithm, key, data) => {
          // Return mock encrypted data
          return new Uint8Array(32);
        },
        decrypt: async (algorithm, key, data) => {
          // Return mock decrypted data
          // But fail for invalid data (non-Uint8Array or wrong length)
          if (!data || !(data instanceof Uint8Array) || data.length < 16) {
            throw new Error('Decryption failed');
          }
          const encoder = new TextEncoder();
          return encoder.encode('decrypted data');
        },
        exportKey: async (format, key) => {
          if (format === 'spki') {
            return new Uint8Array(32);
          }
          if (format === 'pkcs8') {
            return new Uint8Array(32);
          }
          if (format === 'raw') {
            return new Uint8Array(32);
          }
          throw new Error('Unsupported format');
        },
        importKey: async (format, keyData, algorithm, extractable, keyUsages) => {
          if (format === 'spki') {
            return { type: 'public', algorithm, extractable };
          }
          if (format === 'pkcs8') {
            return { type: 'private', algorithm, extractable };
          }
          if (format === 'raw') {
            return { type: 'secret', algorithm, extractable };
          }
          throw new Error('Unsupported format');
        },
      },
      getRandomValues: arr => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      },
    },
    configurable: true,
    writable: true,
  });
}

function restoreCrypto() {
  if (originalCrypto) {
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      configurable: true,
      writable: true,
    });
  } else {
    delete globalThis.crypto;
  }
}

describe('HybridEncryption Module', () => {
  beforeEach(() => {
    mockCrypto();
  });

  afterEach(() => {
    restoreCrypto();
  });

  describe('generateKeyPair', () => {
    it('should generate an RSA-OAEP key pair', async () => {
      const { HybridEncryption } = await import('../../js/security/hybrid-encryption.js');
      const keyPair = await HybridEncryption.generateKeyPair();

      expect(keyPair).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.publicKey.type).toBe('public');
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.privateKey.type).toBe('private');
    });

    it('should generate non-extractable private key by default', async () => {
      const { HybridEncryption } = await import('../../js/security/hybrid-encryption.js');
      const keyPair = await HybridEncryption.generateKeyPair();

      expect(keyPair.privateKey.extractable).toBe(false);
    });

    it('should generate extractable private key when requested', async () => {
      const { HybridEncryption } = await import('../../js/security/hybrid-encryption.js');
      const keyPair = await HybridEncryption.generateKeyPair(true);

      expect(keyPair.privateKey.extractable).toBe(true);
    });
  });

  describe('exportPublicKey', () => {
    it('should export public key to base64', async () => {
      const { HybridEncryption } = await import('../../js/security/hybrid-encryption.js');
      const keyPair = await HybridEncryption.generateKeyPair();
      const exported = await HybridEncryption.exportPublicKey(keyPair.publicKey);

      expect(typeof exported).toBe('string');
      expect(exported.length).toBeGreaterThan(0);
    });

    it('should throw for non-public key', async () => {
      const { HybridEncryption } = await import('../../js/security/hybrid-encryption.js');
      const keyPair = await HybridEncryption.generateKeyPair();

      await expect(HybridEncryption.exportPublicKey(keyPair.privateKey)).rejects.toThrow(
        'Key must be a public key'
      );
    });
  });

  describe('importPublicKey', () => {
    it('should import exported public key', async () => {
      const { HybridEncryption } = await import('../../js/security/hybrid-encryption.js');
      const keyPair = await HybridEncryption.generateKeyPair();
      const exported = await HybridEncryption.exportPublicKey(keyPair.publicKey);

      const imported = await HybridEncryption.importPublicKey(exported);

      expect(imported).toBeDefined();
      expect(imported.type).toBe('public');
    });
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt data correctly', async () => {
      const { HybridEncryption } = await import('../../js/security/hybrid-encryption.js');
      const keyPair = await HybridEncryption.generateKeyPair();

      const plaintext = 'sensitive data to encrypt';
      const encrypted = await HybridEncryption.encrypt(plaintext, keyPair.publicKey);

      expect(encrypted).toBeDefined();
      expect(encrypted.encryptedKey).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.algorithm).toBe('RSA-OAEP-2048/AES-GCM-256');

      const decrypted = await HybridEncryption.decrypt(encrypted, keyPair.privateKey);

      expect(decrypted).toBe('decrypted data'); // Mock returns fixed value
    });

    it('should throw for invalid plaintext type', async () => {
      const { HybridEncryption } = await import('../../js/security/hybrid-encryption.js');
      const keyPair = await HybridEncryption.generateKeyPair();

      await expect(HybridEncryption.encrypt(12345, keyPair.publicKey)).rejects.toThrow(
        'Plaintext must be a string'
      );
    });

    it('should throw for non-public key', async () => {
      const { HybridEncryption } = await import('../../js/security/hybrid-encryption.js');
      const keyPair = await HybridEncryption.generateKeyPair();

      await expect(HybridEncryption.encrypt('data', keyPair.privateKey)).rejects.toThrow(
        'Recipient key must be a public key'
      );
    });

    it('should return null on decryption failure', async () => {
      const { HybridEncryption } = await import('../../js/security/hybrid-encryption.js');
      const keyPair = await HybridEncryption.generateKeyPair();

      const invalidData = { encryptedKey: 'invalid', iv: 'invalid', ciphertext: 'invalid' };
      const decrypted = await HybridEncryption.decrypt(invalidData, keyPair.privateKey);

      expect(decrypted).toBeNull(); // Mock decrypt handles errors gracefully
    });
  });

  describe('encryptForMultiple/decryptMultiple', () => {
    it('should encrypt for multiple recipients', async () => {
      const { HybridEncryption } = await import('../../js/security/hybrid-encryption.js');
      const keyPair1 = await HybridEncryption.generateKeyPair();
      const keyPair2 = await HybridEncryption.generateKeyPair();

      const recipientKeys = {
        user1: keyPair1.publicKey,
        user2: keyPair2.publicKey,
      };

      const plaintext = 'shared secret message';
      const encrypted = await HybridEncryption.encryptForMultiple(plaintext, recipientKeys);

      expect(encrypted).toBeDefined();
      expect(encrypted.encryptedKeys).toBeDefined();
      expect(encrypted.encryptedKeys.user1).toBeDefined();
      expect(encrypted.encryptedKeys.user2).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.recipientIds).toContain('user1');
      expect(encrypted.recipientIds).toContain('user2');
    });

    it('should allow each recipient to decrypt with their key', async () => {
      const { HybridEncryption } = await import('../../js/security/hybrid-encryption.js');
      const keyPair1 = await HybridEncryption.generateKeyPair();
      const keyPair2 = await HybridEncryption.generateKeyPair();

      const recipientKeys = {
        user1: keyPair1.publicKey,
        user2: keyPair2.publicKey,
      };

      const plaintext = 'shared secret message';
      const encrypted = await HybridEncryption.encryptForMultiple(plaintext, recipientKeys);

      const decrypted1 = await HybridEncryption.decryptMultiple(
        encrypted,
        'user1',
        keyPair1.privateKey
      );

      const decrypted2 = await HybridEncryption.decryptMultiple(
        encrypted,
        'user2',
        keyPair2.privateKey
      );

      expect(decrypted1).toBe('decrypted data'); // Mock returns fixed value
      expect(decrypted2).toBe('decrypted data'); // Mock returns fixed value
    });

    it('should return null for unknown recipient', async () => {
      const { HybridEncryption } = await import('../../js/security/hybrid-encryption.js');
      const keyPair = await HybridEncryption.generateKeyPair();

      const recipientKeys = {
        user1: keyPair.publicKey,
      };

      const plaintext = 'shared secret message';
      const encrypted = await HybridEncryption.encryptForMultiple(plaintext, recipientKeys);

      const decrypted = await HybridEncryption.decryptMultiple(
        encrypted,
        'unknown_user',
        keyPair.privateKey
      );

      expect(decrypted).toBeNull();
    });

    it('should throw when no recipients provided', async () => {
      const { HybridEncryption } = await import('../../js/security/hybrid-encryption.js');

      await expect(HybridEncryption.encryptForMultiple('data', {})).rejects.toThrow(
        'At least one recipient is required'
      );
    });
  });

  describe('exportPrivateKey/importPrivateKey', () => {
    it('should export and import private key', async () => {
      const { HybridEncryption } = await import('../../js/security/hybrid-encryption.js');
      const keyPair = await HybridEncryption.generateKeyPair(true);

      const exported = await HybridEncryption.exportPrivateKey(keyPair.privateKey);

      expect(typeof exported).toBe('string');
      expect(exported.length).toBeGreaterThan(0);

      const imported = await HybridEncryption.importPrivateKey(exported, false);

      expect(imported).toBeDefined();
      expect(imported.type).toBe('private');
      expect(imported.extractable).toBe(false);
    });

    it('should throw for non-private key on export', async () => {
      const { HybridEncryption } = await import('../../js/security/hybrid-encryption.js');
      const keyPair = await HybridEncryption.generateKeyPair();

      await expect(HybridEncryption.exportPrivateKey(keyPair.publicKey)).rejects.toThrow(
        'Key must be a private key'
      );
    });
  });
});
