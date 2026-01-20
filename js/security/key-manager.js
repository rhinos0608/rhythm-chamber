/**
 * KeyManager Module
 * Centralized key lifecycle management for Rhythm Chamber security
 *
 * Provides non-extractable CryptoKey objects for secure operations:
 * - Session keys for authentication and session management
 * - Data encryption keys for storage encryption
 * - Signing keys for HMAC operations
 *
 * SECURITY: All keys are created with extractable: false per KEY-01 requirement
 * PBKDF2 uses 600,000 iterations per OWASP 2024 recommendations (exceeds KEY-02)
 */

// Module-scoped private state
const KeyManager = {
    // Private key storage (non-extractable CryptoKey objects)
    _sessionKey: null,
    _dataEncryptionKey: null,
    _signingKey: null,
    _sessionActive: false,
    _sessionSalt: null,

    /**
     * Initialize a new cryptographic session
     *
     * Generates unique session salt and derives all required keys:
     * - Session key for general crypto operations
     * - Data encryption key for storage encryption
     * - Signing key for HMAC operations
     *
     * SECURITY: Must be called in secure context (HTTPS or localhost)
     * All keys are non-extractable per KEY-01 requirement
     *
     * @param {string} password - Password or token to derive keys from
     * @returns {Promise<boolean>} True if session initialized successfully
     * @throws {Error} If not in secure context or key derivation fails
     */
    async initializeSession(password) {
        // Fail fast if not in secure context (INFRA-01)
        if (!this.isSecureContext()) {
            throw new Error('Secure context required for key operations. Use HTTPS or localhost.');
        }

        try {
            // Generate unique session salt for this session
            this._sessionSalt = this._generateSessionSalt();

            // Derive session key using PBKDF2 with 600,000 iterations
            this._sessionKey = await this._deriveKey(password, this._sessionSalt);

            // Derive separate data encryption key for storage operations
            this._dataEncryptionKey = await this._deriveDataEncryptionKey(password, this._sessionSalt);

            // Derive signing key for HMAC operations
            this._signingKey = await this._deriveSigningKey(password, this._sessionSalt);

            // Mark session as active
            this._sessionActive = true;

            console.log('[KeyManager] Session initialized with non-extractable keys');
            return true;
        } catch (error) {
            // Clean up any partial state on failure
            this.clearSession();
            throw new Error(`Failed to initialize session: ${error.message}`);
        }
    },

    /**
     * Get current session key (non-extractable)
     *
     * @returns {Promise<CryptoKey>} The session key
     * @throws {Error} If session not initialized
     */
    async getSessionKey() {
        if (!this._sessionActive || !this._sessionKey) {
            throw new Error('Session not initialized. Call initializeSession() first.');
        }
        return this._sessionKey;
    },

    /**
     * Get data encryption key for storage operations (non-extractable)
     *
     * @returns {Promise<CryptoKey>} The data encryption key
     * @throws {Error} If session not initialized
     */
    async getDataEncryptionKey() {
        if (!this._sessionActive || !this._dataEncryptionKey) {
            throw new Error('Session not initialized. Call initializeSession() first.');
        }
        return this._dataEncryptionKey;
    },

    /**
     * Get signing key for HMAC operations (non-extractable)
     *
     * @returns {Promise<CryptoKey>} The signing key
     * @throws {Error} If session not initialized
     */
    async getSigningKey() {
        if (!this._sessionActive || !this._signingKey) {
            throw new Error('Session not initialized. Call initializeSession() first.');
        }
        return this._signingKey;
    },

    /**
     * Clear all session keys from memory
     *
     * Call this on logout or session end to satisfy KEY-05 requirement.
     * Sets all CryptoKey references to null, making them eligible for garbage collection.
     */
    clearSession() {
        this._sessionKey = null;
        this._dataEncryptionKey = null;
        this._signingKey = null;
        this._sessionSalt = null;
        this._sessionActive = false;

        console.log('[KeyManager] Session cleared - all keys removed from memory');
    },

    /**
     * Check if running in secure context (INFRA-01 requirement)
     *
     * Validates the environment before allowing crypto operations.
     * Allows HTTPS, localhost, and 127.0.0.1 for development.
     *
     * @returns {boolean} True if in secure context
     */
    isSecureContext() {
        // Modern browser check - verify truthy value (INFRA-01 requirement)
        if (typeof window !== 'undefined' && (window.isSecureContext === true || Boolean(window.isSecureContext))) {
            return true;
        }

        // Fallback checks for environments where isSecureContext might be false
        if (typeof window !== 'undefined' && window.location) {
            const protocol = window.location.protocol;
            const hostname = window.location.hostname;

            // HTTPS is always secure
            if (protocol === 'https:') {
                return true;
            }

            // Allow localhost for development
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
                return true;
            }
        }

        return false;
    },

    /**
     * Check if cryptographic session is currently active
     *
     * @returns {boolean} True if session has been initialized
     */
    isSessionActive() {
        return this._sessionActive;
    },

    // ===== PRIVATE METHODS =====

    /**
     * Generate a unique session salt
     *
     * Uses cryptographically secure random number generation.
     * Salt is 32 bytes (64 hex characters) per modern security practices.
     *
     * @private
     * @returns {string} 64-character hex string
     */
    _generateSessionSalt() {
        const saltBytes = crypto.getRandomValues(new Uint8Array(32));
        return Array.from(saltBytes, byte => byte.toString(16).padStart(2, '0')).join('');
    },

    /**
     * Derive session key using PBKDF2
     *
     * SECURITY: Uses 600,000 iterations per OWASP 2024 recommendations
     * This EXCEEDS the KEY-02 requirement of 100,000 iterations
     * Key is non-extractable per KEY-01 requirement
     *
     * @private
     * @param {string} password - Password or token to derive from
     * @param {string} salt - Session salt
     * @returns {Promise<CryptoKey>} Derived AES-GCM-256 key
     */
    async _deriveKey(password, salt) {
        const encoder = new TextEncoder();

        // Import password as key material
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false, // KEY-01: Key material not extractable
            ['deriveKey']
        );

        // Derive actual encryption key using PBKDF2
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: encoder.encode(salt),
                iterations: 600000, // OWASP 2024 recommendation (exceeds KEY-02)
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false, // KEY-01: Derived key not extractable
            ['encrypt', 'decrypt']
        );
    },

    /**
     * Derive data encryption key for storage operations
     *
     * Uses separate key derivation path with modified password and salt
     * to provide key separation for different purposes (security best practice).
     *
     * @private
     * @param {string} password - Password or token to derive from
     * @param {string} salt - Session salt
     * @returns {Promise<CryptoKey>} Derived AES-GCM-256 key for data encryption
     */
    async _deriveDataEncryptionKey(password, salt) {
        const encoder = new TextEncoder();

        // Separate key material with purpose modifier
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password + ':data'), // Purpose modifier for key separation
            'PBKDF2',
            false, // KEY-01: Not extractable
            ['deriveKey']
        );

        // Derive with modified salt for additional separation
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: encoder.encode(salt + ':storage'), // Salt modifier
                iterations: 600000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false, // KEY-01: Not extractable
            ['encrypt', 'decrypt']
        );
    },

    /**
     * Derive signing key for HMAC operations
     *
     * Uses HMAC-SHA-256 for message signing and verification.
     * Separate key path provides cryptographic separation between encryption and signing.
     *
     * @private
     * @param {string} password - Password or token to derive from
     * @param {string} salt - Session salt
     * @returns {Promise<CryptoKey>} Derived HMAC-SHA-256 key
     */
    async _deriveSigningKey(password, salt) {
        const encoder = new TextEncoder();

        // Separate key material for signing operations
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password + ':sign'), // Purpose modifier
            'PBKDF2',
            false, // KEY-01: Not extractable
            ['deriveKey']
        );

        // Derive HMAC key
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: encoder.encode(salt + ':hmac'), // Salt modifier
                iterations: 600000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'HMAC', hash: 'SHA-256' },
            false, // KEY-01: Not extractable
            ['sign', 'verify']
        );
    }
};

export { KeyManager };