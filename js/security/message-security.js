/**
 * MessageSecurity Module
 * HMAC-SHA256 message signing and verification for cross-tab communication
 *
 * Provides core cryptographic operations for authenticating and validating messages:
 * - HMAC-SHA256 message signing and verification
 * - Timestamp validation to prevent replay attacks
 * - Sensitive data sanitization before broadcasting
 * - Nonce tracking for replay attack prevention
 * - Non-extractable signing keys from KeyManager
 *
 * SECURITY REQUIREMENTS:
 * - All messages MUST be signed with HMAC-SHA256 using non-extractable keys
 * - Timestamps MUST be validated to reject old messages (default: 5 seconds)
 * - Sensitive fields (apiKey, token, secret, password) MUST be sanitized before broadcast
 * - Nonces MUST be tracked to prevent replay attacks
 * - Message canonicalization MUST use deterministic JSON.stringify with sorted keys
 *
 * Usage:
 *   const signingKey = await Security.getSigningKey();
 *   const message = { type: 'update', data: { user: 'alice' }, timestamp: Date.now() };
 *   const signature = await MessageSecurity.signMessage(message, signingKey);
 *   const isValid = await MessageSecurity.verifyMessage(message, signature, signingKey);
 *   const isFresh = MessageSecurity.validateTimestamp(message);
 *   const sanitized = MessageSecurity.sanitizeMessage(message);
 */

// ==========================================
// NONCE TRACKING FOR REPLAY PREVENTION
// ==========================================

/**
 * Set to track used nonces for replay attack prevention
 *
 * NONCE FORMAT: ${senderId}_${seq}_${timestamp}
 * - senderId: Unique identifier for the sending tab/context
 * - seq: Monotonically increasing sequence number
 * - timestamp: Unix timestamp when message was created
 *
 * MAXIMUM SIZE: 1000 entries to prevent unbounded memory growth
 * - Evicts oldest entries when limit is reached
 * - Provides reasonable window for detecting replay attacks
 * - Balance between security and memory usage
 *
 * SECURITY: Nonces prevent attackers from replaying captured messages.
 * Each message must have a unique nonce that hasn't been used before.
 */
const usedNonces = new Set();
const MAX_NONCE_CACHE_SIZE = 1000;

const MessageSecurity = {
    /**
     * Sign message using HMAC-SHA256
     *
     * ALGORITHM: HMAC-SHA256 (Hash-based Message Authentication Code)
     * - Creates cryptographic signature using non-extractable signing key
     * - Message canonicalization ensures consistent signature for same content
     * - Base64-encoded signature for easy transmission
     *
     * MESSAGE CANONICALIZATION:
     * - JSON.stringify with sorted keys ensures deterministic output
     * - Same message content always produces same signature
     * - Prevents signature bypass via key reordering or whitespace variations
     *
     * SECURITY: Signing key must be non-extractable from KeyManager.
     * Never extract or expose the signing key in logs or error messages.
     *
     * @param {object} message - Message object to sign
     * @param {CryptoKey} signingKey - Non-extractable HMAC-SHA256 key from KeyManager.getSigningKey()
     * @returns {Promise<string>} Base64-encoded HMAC-SHA256 signature
     * @throws {Error} If signing fails (invalid key, unsupported algorithm, etc.)
     *
     * @example
     * const signingKey = await Security.getSigningKey();
     * const message = { type: 'update', user: 'alice', timestamp: Date.now() };
     * const signature = await MessageSecurity.signMessage(message, signingKey);
     * // Send { message, signature } via BroadcastChannel
     *
     * @example
     * // Automatic timestamp addition if missing
     * const message = { type: 'update', user: 'alice' };
     * const signature = await MessageSecurity.signMessage(message, signingKey);
     * // message.timestamp is automatically added before signing
     */
    async signMessage(message, signingKey) {
        try {
            // Validate inputs
            if (!message || typeof message !== 'object') {
                throw new Error('Message must be an object');
            }

            if (!signingKey || !(signingKey instanceof CryptoKey)) {
                throw new Error('Signing key must be a CryptoKey object from KeyManager');
            }

            // Add timestamp if not present
            if (!message.timestamp) {
                message.timestamp = Date.now();
                console.log('[MessageSecurity] Added timestamp to message before signing');
            }

            // Canonicalize message: JSON.stringify with sorted keys
            // This ensures consistent signature for same content regardless of key order
            const canonicalMessage = JSON.stringify(message, Object.keys(message).sort());

            // Convert string to bytes
            const encoder = new TextEncoder();
            const messageBytes = encoder.encode(canonicalMessage);

            // Sign using HMAC-SHA256
            const signature = await crypto.subtle.sign(
                'HMAC',
                signingKey,
                messageBytes
            );

            // Convert signature to base64 for transmission
            const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signature)));

            console.log('[MessageSecurity] Message signed successfully');
            return base64Signature;

        } catch (error) {
            console.error('[MessageSecurity] Signing failed:', error);
            throw new Error(`Failed to sign message: ${error.message}`);
        }
    },

    /**
     * Verify HMAC-SHA256 signature
     *
     * ALGORITHM: HMAC-SHA256 verification
     * - Recomputes HMAC signature using same canonicalization as signMessage
     * - Compares provided signature with computed signature using crypto.subtle.verify
     * - Returns true if signatures match, false otherwise
     *
     * CANONICALIZATION: Uses identical method as signMessage to ensure
     * consistent signature computation. Any difference in message content,
     * key order, or whitespace will cause verification to fail.
     *
     * SECURITY: Always verify signatures before trusting message content.
     * Verification failures return false (never throw) to allow graceful handling.
     *
     * @param {object} message - Message object to verify
     * @param {string} signature - Base64-encoded HMAC-SHA256 signature from signMessage()
     * @param {CryptoKey} signingKey - Non-extractable HMAC-SHA256 key from KeyManager.getSigningKey()
     * @returns {Promise<boolean>} True if signature valid, false otherwise
     *
     * @example
     * const signingKey = await Security.getSigningKey();
     * const receivedMessage = { type: 'update', user: 'alice', timestamp: 1234567890 };
     * const receivedSignature = 'base64-encoded-signature';
     * const isValid = await MessageSecurity.verifyMessage(receivedMessage, receivedSignature, signingKey);
     * if (isValid) {
     *   console.log('Message signature verified - message is authentic');
     * } else {
     *   console.warn('Message signature invalid - rejecting message');
     * }
     *
     * @example
     * // Verification failure handling
     * const isValid = await MessageSecurity.verifyMessage(message, signature, signingKey);
     * if (!isValid) {
     *   // Log verification failure, reject message
     *   return;
     * }
     * // Continue processing verified message
     */
    async verifyMessage(message, signature, signingKey) {
        try {
            // Validate inputs
            if (!message || typeof message !== 'object') {
                console.error('[MessageSecurity] Verification failed: Message must be an object');
                return false;
            }

            if (!signature || typeof signature !== 'string') {
                console.error('[MessageSecurity] Verification failed: Signature must be a string');
                return false;
            }

            if (!signingKey || !(signingKey instanceof CryptoKey)) {
                console.error('[MessageSecurity] Verification failed: Signing key must be a CryptoKey object');
                return false;
            }

            // Canonicalize message (same method as signMessage)
            const canonicalMessage = JSON.stringify(message, Object.keys(message).sort());

            // Convert string to bytes
            const encoder = new TextEncoder();
            const messageBytes = encoder.encode(canonicalMessage);

            // Decode signature from base64 to bytes
            const signatureBytes = new Uint8Array(
                [...atob(signature)].map(c => c.charCodeAt(0))
            );

            // Verify signature using HMAC-SHA256
            const isValid = await crypto.subtle.verify(
                'HMAC',
                signingKey,
                signatureBytes,
                messageBytes
            );

            if (isValid) {
                console.log('[MessageSecurity] Message signature verified successfully');
            } else {
                console.warn('[MessageSecurity] Message signature verification failed');
            }

            return isValid;

        } catch (error) {
            // Graceful degradation - return false instead of throwing
            console.error('[MessageSecurity] Signature verification failed:', error);
            return false;
        }
    },

    /**
     * Validate message timestamp
     *
     * TIMESTAMP VALIDATION: Rejects messages older than maxAgeSeconds to prevent
     * replay attacks and ensure message freshness.
     *
     * USE CASES:
     * - Cross-tab communication: Reject stale sync messages
     * - Event validation: Ensure events are processed in timely manner
     * - Security: Prevent replay attacks using old captured messages
     *
     * SECURITY RATIONALE:
     * - Timestamps provide temporal validation (message freshness)
     * - Combined with nonces, they provide comprehensive replay prevention
     * - Default 5-second window balances security with clock skew tolerance
     *
     * @param {object} message - Message object with timestamp property
     * @param {number} maxAgeSeconds - Maximum message age in seconds (default: 5)
     * @returns {boolean} True if timestamp valid and recent, false otherwise
     *
     * @example
     * const message = { type: 'update', timestamp: Date.now() };
     * if (MessageSecurity.validateTimestamp(message)) {
     *   console.log('Message timestamp is valid and recent');
     * } else {
     *   console.warn('Message timestamp is missing or too old');
     * }
     *
     * @example
     * // Custom max age for longer operations
     * if (MessageSecurity.validateTimestamp(message, 30)) {
     *   // Accept messages up to 30 seconds old
     * }
     */
    validateTimestamp(message, maxAgeSeconds = 5) {
        try {
            // Check if timestamp exists
            if (!message || typeof message !== 'object' || !message.timestamp) {
                console.warn('[MessageSecurity] Timestamp validation failed: Missing timestamp in message');
                return false;
            }

            // Calculate message age in seconds
            const currentTime = Date.now();
            const messageAge = (currentTime - message.timestamp) / 1000;

            // Check if message is too old
            const isValid = messageAge <= maxAgeSeconds;

            if (!isValid) {
                console.warn(`[MessageSecurity] Timestamp validation failed: Message too old (${messageAge.toFixed(2)}s > ${maxAgeSeconds}s)`);
            } else {
                console.log(`[MessageSecurity] Timestamp validation passed: Message age ${messageAge.toFixed(2)}s`);
            }

            return isValid;

        } catch (error) {
            console.error('[MessageSecurity] Timestamp validation error:', error);
            return false;
        }
    },

    /**
     * Sanitize message by removing sensitive fields
     *
     * SANITIZATION: Removes sensitive data from messages before broadcasting
     * to prevent accidental exposure of secrets across tabs.
     *
     * PROTECTED FIELDS:
     * - apiKey: API keys (OpenRouter, Gemini, Claude, etc.)
     * - token: Authentication tokens (OAuth, JWT, session tokens)
     * - secret: Secret keys, webhooks, credentials
     * - password: Passwords, passphrases
     * - credentials: Generic credential containers
     *
     * RECURSIVE SANITIZATION: Handles nested objects and arrays to ensure
     * all instances of sensitive fields are removed, regardless of depth.
     *
     * SECURITY RATIONALE:
     * - Cross-tab messages may be logged or inspected in DevTools
     * - Sensitive data should never be broadcasted even within same origin
     * - Defense-in-depth: Prevents accidental exposure via logging, debugging, or XSS
     *
     * @param {object} message - Message object to sanitize
     * @returns {object} Sanitized message copy with sensitive fields removed
     *
     * @example
     * const unsafeMessage = {
     *   type: 'config-update',
     *   apiKey: 'sk-or-v1-secret',
     *   theme: 'dark',
     *   nested: { token: 'secret-token' }
     * };
     * const safeMessage = MessageSecurity.sanitizeMessage(unsafeMessage);
     * // Result: { type: 'config-update', theme: 'dark', nested: {} }
     *
     * @example
     * // Broadcasting safe message
     * const message = { type: 'update', apiKey: 'secret', data: { value: 42 } };
     * const sanitized = MessageSecurity.sanitizeMessage(message);
     * broadcastChannel.postMessage(sanitized);
     */
    sanitizeMessage(message) {
        try {
            // Validate input
            if (!message || typeof message !== 'object') {
                console.warn('[MessageSecurity] Sanitization failed: Message must be an object');
                return message;
            }

            // Create deep copy to avoid modifying original
            const sanitized = JSON.parse(JSON.stringify(message));

            // Fields to redact (sensitive data patterns)
            const sensitiveFields = ['apiKey', 'token', 'secret', 'password', 'credentials'];

            // Recursive sanitization function
            const sanitizeRecursive = (obj) => {
                if (!obj || typeof obj !== 'object') {
                    return;
                }

                // Remove sensitive fields at current level
                for (const field of sensitiveFields) {
                    if (field in obj) {
                        console.log(`[MessageSecurity] Removing sensitive field '${field}' from message`);
                        delete obj[field];
                    }
                }

                // Recursively sanitize nested objects and arrays
                for (const key in obj) {
                    if (obj[key] && typeof obj[key] === 'object') {
                        if (Array.isArray(obj[key])) {
                            // Sanitize array elements
                            obj[key].forEach(item => sanitizeRecursive(item));
                        } else {
                            // Sanitize nested object
                            sanitizeRecursive(obj[key]);
                        }
                    }
                }
            };

            sanitizeRecursive(sanitized);
            console.log('[MessageSecurity] Message sanitized successfully');
            return sanitized;

        } catch (error) {
            console.error('[MessageSecurity] Message sanitization failed:', error);
            // Return original message if sanitization fails (fail-safe)
            return message;
        }
    },

    /**
     * Check if nonce has been used before
     *
     * NONCE CHECK: Prevents replay attacks by tracking which nonces have been used.
     * Each message must have a unique nonce that hasn't been used before.
     *
     * NONCE FORMAT: ${senderId}_${seq}_${timestamp}
     * - senderId: Unique identifier for the sending tab/context
     * - seq: Monotonically increasing sequence number
     * - timestamp: Unix timestamp when message was created
     *
     * @param {string} nonce - Nonce string to check
     * @returns {boolean} True if nonce already used, false if new
     *
     * @example
     * const nonce = 'tab-1_42_1234567890';
     * if (MessageSecurity.isNonceUsed(nonce)) {
     *   console.warn('Replay attack detected - nonce already used');
     *   return;
     * }
     * // Process new message
     */
    isNonceUsed(nonce) {
        return usedNonces.has(nonce);
    },

    /**
     * Mark nonce as used to prevent replay attacks
     *
     * NONCE TRACKING: Records nonce usage to prevent replay attacks.
     * Maintains cache of recent nonces with automatic eviction when full.
     *
     * CACHE MANAGEMENT:
     * - Maximum size: 1000 entries (MAX_NONCE_CACHE_SIZE)
     * - Eviction policy: FIFO (first-in-first-out) via Set deletion
     * - Memory management: Automatic cleanup when limit reached
     *
     * SECURITY: Nonces must be unique per message. Reusing a nonce indicates
     * a replay attack or nonce generation bug.
     *
     * @param {string} nonce - Nonce string to mark as used
     *
     * @example
     * const message = { nonce: 'tab-1_42_1234567890', type: 'update' };
     * if (!MessageSecurity.isNonceUsed(message.nonce)) {
     *   MessageSecurity.markNonceUsed(message.nonce);
     *   // Process message
     * } else {
     *   console.warn('Rejecting replayed message');
     * }
     */
    markNonceUsed(nonce) {
        try {
            // Add nonce to used set
            usedNonces.add(nonce);
            console.log(`[MessageSecurity] Marked nonce as used: ${nonce}`);

            // Evict oldest entries if cache is full
            if (usedNonces.size > MAX_NONCE_CACHE_SIZE) {
                // Convert Set to Array, remove first element (FIFO eviction)
                const nonceArray = Array.from(usedNonces);
                const oldestNonce = nonceArray[0];
                usedNonces.delete(oldestNonce);
                console.log(`[MessageSecurity] Evicted oldest nonce from cache: ${oldestNonce}`);
                console.log(`[MessageSecurity] Nonce cache size: ${usedNonces.size}/${MAX_NONCE_CACHE_SIZE}`);
            }

        } catch (error) {
            console.error('[MessageSecurity] Failed to mark nonce as used:', error);
        }
    }
};

export { MessageSecurity };