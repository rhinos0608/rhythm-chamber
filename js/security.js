/**
 * Security Module - ES Module Re-export
 *
 * This file re-exports the modular security system for easy importing.
 * All security functionality comes from js/security/index.js.
 *
 * ARCHITECTURE:
 * - js/security/encryption.js - Cryptographic operations (AES-GCM, PBKDF2)
 * - js/security/token-binding.js - XSS protection (device fingerprinting, token binding)
 * - js/security/anomaly.js - Behavioral detection (rate limiting, anomaly detection)
 * - js/security/recovery-handlers.js - Recovery action handlers
 * - js/security/checklist.js - Security checklist for first run
 * - js/security/index.js - Unified facade
 * - js/security.js - This file (re-export for convenient imports)
 *
 * Usage:
 *   import { Security } from './security.js';
 *   // or
 *   import { Security, ErrorContext } from './security/index.js';
 */

// Re-export everything from the security facade
export { Security, ErrorContext, Encryption, TokenBinding, Anomaly, SecurityChecklist } from './security/index.js';

// Also export the RecoveryHandlers for direct access
export { RecoveryHandlers } from './security/recovery-handlers.js';

console.log('[Security] Module loaded (re-export facade)');
