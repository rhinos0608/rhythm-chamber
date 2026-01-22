/**
 * Security Coordinator
 * Single authority for security module initialization
 * 
 * Orchestrates the initialization of all security modules in the correct order,
 * handles failures cohesively, and provides a single source of truth for
 * "is security ready" status.
 * 
 * Initialization Order:
 * 1. Check secure context (HTTPS, no iframes)
 * 2. Initialize KeyManager (non-extractable keys)
 * 3. Initialize Encryption (session key derivation)
 * 4. Initialize TokenBinding (device fingerprint)
 * 5. Initialize Anomaly detection
 * 6. Enable prototype pollution protection
 * 
 * @module security/security-coordinator
 */

import * as Encryption from './encryption.js';
import * as TokenBinding from './token-binding.js';
import * as Anomaly from './anomaly.js';
import * as KeyManager from './key-manager.js';
import * as StorageEncryption from './storage-encryption.js';
import { SafeMode } from './safe-mode.js';

/**
 * Initialization state enum
 */
const InitState = {
    NOT_STARTED: 'not_started',
    IN_PROGRESS: 'in_progress',
    READY: 'ready',
    FAILED: 'failed',
    DEGRADED: 'degraded'  // Some modules failed but core security is available
};

/**
 * Module initialization status
 * @typedef {Object} ModuleStatus
 * @property {string} state - InitState value
 * @property {Error|null} error - Error if failed
 * @property {number} initTime - Time taken to initialize (ms)
 */

/**
 * Initialization report
 * @typedef {Object} InitializationReport
 * @property {string} overallState - Overall security state
 * @property {boolean} secureContext - Is running in secure context
 * @property {boolean} keyManagerReady - KeyManager initialized
 * @property {boolean} encryptionReady - Encryption available
 * @property {boolean} tokenBindingReady - Token binding available
 * @property {boolean} anomalyDetectionReady - Anomaly detection active
 * @property {boolean} prototypePollutionProtected - Prototypes frozen
 * @property {Object.<string, ModuleStatus>} modules - Per-module status
 * @property {number} totalInitTime - Total initialization time (ms)
 * @property {string[]} warnings - Non-fatal warnings
 * @property {string[]} errors - Fatal errors
 */

/**
 * SecurityCoordinator - Single authority for security initialization
 */
class SecurityCoordinatorClass {
    constructor() {
        // Overall state
        this._state = InitState.NOT_STARTED;
        this._initPromise = null;
        this._initStartTime = 0;
        this._totalInitTime = 0;
        
        // Module states
        this._moduleStates = {
            secureContext: { state: InitState.NOT_STARTED, error: null, initTime: 0 },
            keyManager: { state: InitState.NOT_STARTED, error: null, initTime: 0 },
            encryption: { state: InitState.NOT_STARTED, error: null, initTime: 0 },
            tokenBinding: { state: InitState.NOT_STARTED, error: null, initTime: 0 },
            anomalyDetection: { state: InitState.NOT_STARTED, error: null, initTime: 0 },
            prototypePollution: { state: InitState.NOT_STARTED, error: null, initTime: 0 }
        };
        
        // Configuration
        this._config = {
            requireSecureContext: true,
            enablePrototypePollutionProtection: false,  // Deferred to window.onload
            initTimeoutMs: 30000,
            keyManagerRequired: true,
            tokenBindingRequired: false  // Can run without token binding
        };
        
        // Callbacks for ready notification
        this._readyCallbacks = [];
        this._failureCallbacks = [];
        
        // Warnings and errors collected during init
        this._warnings = [];
        this._errors = [];
        
        // Security context check result
        this._secureContextResult = null;
    }
    
    /**
     * Initialize all security modules in order
     * @param {Object} options - Initialization options
     * @param {string} [options.password] - Password for KeyManager session
     * @param {boolean} [options.enablePrototypePollution=false] - Enable prototype pollution protection now
     * @returns {Promise<InitializationReport>} Initialization report
     */
    async init(options = {}) {
        // Atomic check-and-set using existing promise
        // This prevents race condition where multiple calls pass the state check
        // before IN_PROGRESS is set
        if (this._initPromise) {
            console.warn('[SecurityCoordinator] Initialization already in progress');
            return this._initPromise;
        }

        if (this._state === InitState.READY || this._state === InitState.DEGRADED) {
            console.log('[SecurityCoordinator] Already initialized');
            return this.getInitializationReport();
        }

        // Create promise FIRST, then set state - this ensures atomicity
        this._initPromise = (async () => {
            this._state = InitState.IN_PROGRESS;
            this._initStartTime = performance.now();
            this._warnings = [];
            this._errors = [];

            console.log('[SecurityCoordinator] Beginning security initialization...');

            try {
                const report = await this._runInitSequence(options);
                return report;
            } finally {
                this._initPromise = null;
            }
        })();

        return this._initPromise;
    }
    
    /**
     * Run the initialization sequence
     * @private
     */
    async _runInitSequence(options) {
        const { password, enablePrototypePollution = false } = options;
        
        try {
            // Step 1: Check secure context
            await this._initSecureContext();
            
            // If not secure, we may still continue in degraded mode
            if (this._moduleStates.secureContext.state === InitState.FAILED) {
                if (this._config.requireSecureContext) {
                    this._state = InitState.FAILED;
                    this._notifyFailure(new Error('Secure context required but not available'));
                    return this.getInitializationReport();
                }
                this._warnings.push('Running without secure context - some features disabled');
            }
            
            // Step 2: Initialize KeyManager
            if (password) {
                await this._initKeyManager(password);
            } else {
                // Generate session password if none provided
                const sessionPassword = await this._generateSessionPassword();
                await this._initKeyManager(sessionPassword);
            }
            
            // If KeyManager failed and it's required, result in degraded mode
            if (this._moduleStates.keyManager.state === InitState.FAILED && this._config.keyManagerRequired) {
                this._state = InitState.DEGRADED;
                this._warnings.push('KeyManager failed - encryption features limited');
            }
            
            // Step 3: Initialize Encryption module
            await this._initEncryption();
            
            // Step 4: Initialize TokenBinding
            await this._initTokenBinding();
            
            // Step 5: Initialize Anomaly detection
            await this._initAnomalyDetection();
            
            // Step 6: Enable prototype pollution protection (if requested now)
            if (enablePrototypePollution) {
                await this._initPrototypePollutionProtection();
            }
            
            // Determine final state
            this._determineFinalState();
            
            this._totalInitTime = performance.now() - this._initStartTime;
            
            const report = this.getInitializationReport();
            
            console.log(`[SecurityCoordinator] Initialization complete in ${this._totalInitTime.toFixed(1)}ms - State: ${this._state}`);
            
            // Notify callbacks
            if (this._state === InitState.READY || this._state === InitState.DEGRADED) {
                this._notifyReady(report);
            } else {
                this._notifyFailure(new Error('Security initialization failed'));
            }
            
            return report;
            
        } catch (error) {
            console.error('[SecurityCoordinator] Unexpected error during initialization:', error);
            this._errors.push(error.message);
            this._state = InitState.FAILED;
            this._totalInitTime = performance.now() - this._initStartTime;
            this._notifyFailure(error);
            return this.getInitializationReport();
        }
    }
    
    /**
     * Step 1: Check secure context
     * @private
     */
    async _initSecureContext() {
        const startTime = performance.now();
        this._moduleStates.secureContext.state = InitState.IN_PROGRESS;
        
        try {
            this._secureContextResult = TokenBinding.checkSecureContext();
            
            if (this._secureContextResult.secure) {
                this._moduleStates.secureContext.state = InitState.READY;
                console.log('[SecurityCoordinator] Secure context verified');
            } else {
                this._moduleStates.secureContext.state = InitState.FAILED;
                this._moduleStates.secureContext.error = new Error(this._secureContextResult.reason);
                console.warn('[SecurityCoordinator] Secure context check failed:', this._secureContextResult.reason);
            }
        } catch (error) {
            this._moduleStates.secureContext.state = InitState.FAILED;
            this._moduleStates.secureContext.error = error;
            console.error('[SecurityCoordinator] Secure context check threw error:', error);
        }
        
        this._moduleStates.secureContext.initTime = performance.now() - startTime;
    }
    
    /**
     * Step 2: Initialize KeyManager
     * @private
     */
    async _initKeyManager(password) {
        const startTime = performance.now();
        this._moduleStates.keyManager.state = InitState.IN_PROGRESS;
        
        try {
            // KeyManager requires secure context for crypto operations
            if (!this.isSecureContext()) {
                throw new Error('Secure context required for KeyManager');
            }
            
            await KeyManager.KeyManager.initializeSession(password);
            this._moduleStates.keyManager.state = InitState.READY;
            console.log('[SecurityCoordinator] KeyManager session initialized');
        } catch (error) {
            this._moduleStates.keyManager.state = InitState.FAILED;
            this._moduleStates.keyManager.error = error;
            console.warn('[SecurityCoordinator] KeyManager initialization failed:', error.message);
        }
        
        this._moduleStates.keyManager.initTime = performance.now() - startTime;
    }
    
    /**
     * Step 3: Initialize Encryption module
     * @private
     */
    async _initEncryption() {
        const startTime = performance.now();
        this._moduleStates.encryption.state = InitState.IN_PROGRESS;
        
        try {
            // Encryption module is stateless - just verify it's available
            if (typeof Encryption.encryptData !== 'function' || typeof Encryption.decryptData !== 'function') {
                throw new Error('Encryption module not properly loaded');
            }
            
            // Verify session salt is available
            const salt = Encryption.getSessionSalt();
            if (!salt) {
                throw new Error('Encryption session salt not available');
            }
            
            this._moduleStates.encryption.state = InitState.READY;
            // Update SafeMode so storage operations know encryption is available
            await SafeMode.initModule('encryption', async () => {});
            console.log('[SecurityCoordinator] Encryption module ready');
        } catch (error) {
            this._moduleStates.encryption.state = InitState.FAILED;
            this._moduleStates.encryption.error = error;
            console.warn('[SecurityCoordinator] Encryption module failed:', error.message);
        }
        
        this._moduleStates.encryption.initTime = performance.now() - startTime;
    }
    
    /**
     * Step 4: Initialize TokenBinding
     * @private
     */
    async _initTokenBinding() {
        const startTime = performance.now();
        this._moduleStates.tokenBinding.state = InitState.IN_PROGRESS;
        
        try {
            // TokenBinding requires secure context
            if (!this.isSecureContext()) {
                throw new Error('Secure context required for TokenBinding');
            }
            
            // Generate device fingerprint to verify TokenBinding works
            const fingerprint = await TokenBinding.generateDeviceFingerprint();
            if (!fingerprint) {
                throw new Error('Failed to generate device fingerprint');
            }
            
            this._moduleStates.tokenBinding.state = InitState.READY;
            // Update SafeMode so other modules know token binding is available
            await SafeMode.initModule('tokenBinding', async () => {});
            console.log('[SecurityCoordinator] TokenBinding ready');
        } catch (error) {
            this._moduleStates.tokenBinding.state = InitState.FAILED;
            this._moduleStates.tokenBinding.error = error;
            
            if (this._config.tokenBindingRequired) {
                this._errors.push('TokenBinding initialization failed: ' + error.message);
            } else {
                this._warnings.push('TokenBinding unavailable: ' + error.message);
            }
            console.warn('[SecurityCoordinator] TokenBinding initialization failed:', error.message);
        }
        
        this._moduleStates.tokenBinding.initTime = performance.now() - startTime;
    }
    
    /**
     * Step 5: Initialize Anomaly detection
     * @private
     */
    async _initAnomalyDetection() {
        const startTime = performance.now();
        this._moduleStates.anomalyDetection.state = InitState.IN_PROGRESS;
        
        try {
            // Anomaly detection is stateless - verify it's available
            if (typeof Anomaly.isRateLimited !== 'function' || typeof Anomaly.recordFailedAttempt !== 'function') {
                throw new Error('Anomaly detection module not properly loaded');
            }
            
            this._moduleStates.anomalyDetection.state = InitState.READY;
            // Update SafeMode so other modules know anomaly detection is available
            await SafeMode.initModule('anomaly', async () => {});
            console.log('[SecurityCoordinator] Anomaly detection ready');
        } catch (error) {
            this._moduleStates.anomalyDetection.state = InitState.FAILED;
            this._moduleStates.anomalyDetection.error = error;
            this._warnings.push('Anomaly detection unavailable: ' + error.message);
            console.warn('[SecurityCoordinator] Anomaly detection failed:', error.message);
        }
        
        this._moduleStates.anomalyDetection.initTime = performance.now() - startTime;
    }
    
    /**
     * Step 6: Enable prototype pollution protection
     *
     * SECURITY FIX (MEDIUM Issue #14): Removed automatic skip for React/jQuery
     * Previous implementation automatically disabled protection when third-party libs detected
     * New implementation always enables protection with graceful error handling
     *
     * Rationale: Presence of React/jQuery doesn't eliminate prototype pollution risk.
     * The protection should be active unless it causes actual runtime errors, not preemptively
     * disabled based on library detection which attackers can spoof.
     *
     * @private
     */
    async _initPrototypePollutionProtection() {
        const startTime = performance.now();
        this._moduleStates.prototypePollution.state = InitState.IN_PROGRESS;

        try {
            // SECURITY FIX: Removed library detection skip
            // Previous code checked for React/jQuery and skipped protection - this created
            // a security bypass where attackers could load these libraries to disable protection

            // Attempt to seal built-in prototypes to prevent prototype pollution attacks
            // Using seal() instead of freeze() for most prototypes to avoid breaking
            // legitimate libraries that may need to modify properties on Function.prototype, etc.

            const prototypesToSeal = [
                Object.prototype,
                Array.prototype,
                String.prototype,
                Number.prototype,
                Boolean.prototype,
                Symbol.prototype,
                Date.prototype,
                RegExp.prototype,
                Error.prototype,
                Promise.prototype,
                Map.prototype,
                Set.prototype,
                WeakMap.prototype,
                WeakSet.prototype
            ];

            let sealedCount = 0;
            for (const proto of prototypesToSeal) {
                try {
                    Object.seal(proto);
                    sealedCount++;
                } catch (e) {
                    // Individual prototype seal failure is non-critical
                    console.debug(`[SecurityCoordinator] Could not seal prototype: ${e.message}`);
                }
            }

            // Freeze Object.prototype - most critical for prototype pollution prevention
            try {
                Object.freeze(Object.prototype);
                console.log('[SecurityCoordinator] Object.prototype frozen (critical protection)');
            } catch (e) {
                // If freeze fails, seal protection is already in place
                console.warn('[SecurityCoordinator] Could not freeze Object.prototype, seal protection active:', e.message);
            }

            // Set up detection marker for tampering attempts
            try {
                if (!Object.prototype.hasOwnProperty('_PROTECTION_ACTIVE')) {
                    Object.defineProperty(Object.prototype, '_PROTECTION_ACTIVE', {
                        configurable: false,
                        enumerable: false,
                        writable: false,
                        value: true
                    });
                }
            } catch (e) {
                // Marker may already be set or prototype is frozen
                console.debug('[SecurityCoordinator] Protection marker already set or cannot be added');
            }

            // Attempt to freeze the global Object constructor to prevent re-sealing attacks
            try {
                Object.freeze(Object);
            } catch (e) {
                console.debug('[SecurityCoordinator] Could not freeze Object constructor:', e.message);
            }

            // Check for third-party libraries and log informational message
            // (but don't skip protection)
            const root = typeof globalThis !== 'undefined' ? globalThis : {};
            const detectedLibs = [];
            if (typeof root.React !== 'undefined') detectedLibs.push('React');
            if (typeof root.jQuery !== 'undefined') detectedLibs.push('jQuery');
            if (typeof root.$ !== 'undefined' && typeof root.jQuery === 'undefined') detectedLibs.push('$');
            if (typeof root.angular !== 'undefined') detectedLibs.push('Angular');

            if (detectedLibs.length > 0) {
                console.info(
                    `[SecurityCoordinator] Prototype pollution protection active with libraries present: ${detectedLibs.join(', ')}. ` +
                    'If you experience issues, report them as they may indicate unsafe library practices.'
                );
            }

            this._moduleStates.prototypePollution.state = InitState.READY;
            // Update SafeMode so other modules know prototype pollution protection is available
            await SafeMode.initModule('prototypePollution', async () => {});
            console.log(`[SecurityCoordinator] Prototype pollution protection enabled (${sealedCount}/${prototypesToSeal.length} prototypes sealed, Object.prototype frozen)`);
        } catch (error) {
            this._moduleStates.prototypePollution.state = InitState.FAILED;
            this._moduleStates.prototypePollution.error = error;
            this._warnings.push('Prototype pollution protection failed: ' + error.message);
            console.warn('[SecurityCoordinator] Prototype pollution protection failed:', error.message);
        }

        this._moduleStates.prototypePollution.initTime = performance.now() - startTime;
    }

    /**
     * Enable prototype pollution protection (for deferred call at window.onload)
     *
     * SECURITY FIX (MEDIUM Issue #14): Removed automatic skip for React/jQuery
     * See _initPrototypePollutionProtection() for detailed rationale
     *
     * @returns {boolean} True if protection was enabled
     */
    async enablePrototypePollutionProtection() {
        if (this._moduleStates.prototypePollution.state === InitState.READY) {
            console.log('[SecurityCoordinator] Prototype pollution protection already enabled');
            return true;
        }

        try {
            // SECURITY FIX: Removed library detection skip (see _initPrototypePollutionProtection)

            const prototypesToSeal = [
                Object.prototype,
                Array.prototype,
                Function.prototype,
                String.prototype,
                Number.prototype,
                Boolean.prototype,
                Symbol.prototype,
                Date.prototype,
                RegExp.prototype,
                Error.prototype,
                Promise.prototype,
                Map.prototype,
                Set.prototype,
                WeakMap.prototype,
                WeakSet.prototype
            ];

            let sealedCount = 0;
            for (const proto of prototypesToSeal) {
                try {
                    Object.seal(proto);
                    sealedCount++;
                } catch (e) {
                    console.debug(`[SecurityCoordinator] Could not seal prototype (deferred): ${e.message}`);
                }
            }

            // Freeze Object.prototype - most critical for prototype pollution prevention
            try {
                Object.freeze(Object.prototype);
                console.log('[SecurityCoordinator] Object.prototype frozen (deferred)');
            } catch (e) {
                console.warn('[SecurityCoordinator] Could not freeze Object.prototype (deferred), seal protection active:', e.message);
            }

            // Set up detection marker for tampering attempts
            try {
                if (!Object.prototype.hasOwnProperty('_PROTECTION_ACTIVE')) {
                    Object.defineProperty(Object.prototype, '_PROTECTION_ACTIVE', {
                        configurable: false,
                        enumerable: false,
                        writable: false,
                        value: true
                    });
                }
            } catch (e) {
                console.debug('[SecurityCoordinator] Protection marker already set or cannot be added (deferred)');
            }

            // Attempt to freeze the global Object constructor
            try {
                Object.freeze(Object);
            } catch (e) {
                console.debug('[SecurityCoordinator] Could not freeze Object constructor (deferred):', e.message);
            }

            // Check for third-party libraries and log informational message
            const root = typeof globalThis !== 'undefined' ? globalThis : {};
            const detectedLibs = [];
            if (typeof root.React !== 'undefined') detectedLibs.push('React');
            if (typeof root.jQuery !== 'undefined') detectedLibs.push('jQuery');
            if (typeof root.$ !== 'undefined' && typeof root.jQuery === 'undefined') detectedLibs.push('$');
            if (typeof root.angular !== 'undefined') detectedLibs.push('Angular');

            if (detectedLibs.length > 0) {
                console.info(
                    `[SecurityCoordinator] Prototype pollution protection active with libraries (deferred): ${detectedLibs.join(', ')}.`
                );
            }

            this._moduleStates.prototypePollution.state = InitState.READY;
            // Notify SafeMode so other modules know prototype pollution protection is available
            await SafeMode.initModule('prototypePollution', async () => {});
            console.log(`[SecurityCoordinator] Prototype pollution protection enabled (deferred, ${sealedCount}/${prototypesToSeal.length} prototypes sealed, Object.prototype frozen)`);
            return true;
        } catch (error) {
            this._moduleStates.prototypePollution.state = InitState.FAILED;
            this._moduleStates.prototypePollution.error = error;
            console.warn('[SecurityCoordinator] Prototype pollution protection failed:', error.message);
            return false;
        }
    }
    
    /**
     * Determine final initialization state based on module states
     * @private
     */
    _determineFinalState() {
        const criticalModules = ['secureContext', 'keyManager'];
        const hasCriticalFailure = criticalModules.some(
            module => this._moduleStates[module].state === InitState.FAILED
        );
        
        if (hasCriticalFailure) {
            // Check if we can run in degraded mode
            const secureContextOk = this._moduleStates.secureContext.state === InitState.READY;
            
            if (secureContextOk) {
                // Secure context OK but KeyManager failed - degraded mode
                this._state = InitState.DEGRADED;
            } else if (!this._config.requireSecureContext) {
                // Secure context not required - degraded mode
                this._state = InitState.DEGRADED;
            } else {
                // Critical failure, can't continue
                this._state = InitState.FAILED;
            }
        } else {
            // All critical modules OK
            const hasAnyFailure = Object.values(this._moduleStates).some(
                m => m.state === InitState.FAILED
            );
            
            if (hasAnyFailure) {
                this._state = InitState.DEGRADED;
            } else {
                this._state = InitState.READY;
            }
        }
    }
    
    /**
     * Generate a session password for KeyManager
     * @private
     */
    async _generateSessionPassword() {
        // Try to get existing session password from sessionStorage only (not localStorage to avoid coupling with Spotify token)
        let password = sessionStorage.getItem('rhythm_chamber_session_salt');

        if (!password) {
            // Generate a cryptographically secure random salt
            const array = new Uint8Array(32);
            crypto.getRandomValues(array);
            password = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
            sessionStorage.setItem('rhythm_chamber_session_salt', password);
        }

        return password;
    }
    
    /**
     * Notify ready callbacks
     * @private
     */
    _notifyReady(report) {
        // Create snapshot before iteration to prevent mutation during iteration
        // A callback could call onReady() again, modifying the array
        const callbacks = [...this._readyCallbacks];
        for (const callback of callbacks) {
            try {
                callback(report);
            } catch (error) {
                console.error('[SecurityCoordinator] Ready callback threw error:', error);
            }
        }
    }
    
    /**
     * Notify failure callbacks
     * @private
     */
    _notifyFailure(error) {
        // Create snapshot before iteration to prevent mutation during iteration
        const callbacks = [...this._failureCallbacks];
        for (const callback of callbacks) {
            try {
                callback(error, this.getInitializationReport());
            } catch (callbackError) {
                console.error('[SecurityCoordinator] Failure callback threw error:', callbackError);
            }
        }
    }
    
    // ==========================================
    // Public API
    // ==========================================
    
    /**
     * Check if security is fully ready
     * @returns {boolean} True if all security modules initialized successfully
     */
    isReady() {
        return this._state === InitState.READY;
    }
    
    /**
     * Check if security is in degraded mode (some features unavailable)
     * @returns {boolean} True if in degraded mode
     */
    isDegraded() {
        return this._state === InitState.DEGRADED;
    }
    
    /**
     * Check if security initialization failed
     * @returns {boolean} True if initialization failed
     */
    isFailed() {
        return this._state === InitState.FAILED;
    }
    
    /**
     * Check if security is available (ready or degraded)
     * @returns {boolean} True if security is available in some form
     */
    isAvailable() {
        return this._state === InitState.READY || this._state === InitState.DEGRADED;
    }
    
    /**
     * Check if running in secure context
     * @returns {boolean} True if in secure context
     */
    isSecureContext() {
        return this._moduleStates.secureContext.state === InitState.READY;
    }
    
    /**
     * Check if encryption is available
     * @returns {boolean} True if encryption operations are available
     */
    canEncrypt() {
        return this._moduleStates.encryption.state === InitState.READY &&
               this._moduleStates.keyManager.state === InitState.READY;
    }
    
    /**
     * Get the current initialization state
     * @returns {string} Current state
     */
    getState() {
        return this._state;
    }
    
    /**
     * Get detailed initialization report
     * @returns {InitializationReport} Detailed status of all modules
     */
    getInitializationReport() {
        return {
            overallState: this._state,
            secureContext: this._moduleStates.secureContext.state === InitState.READY,
            keyManagerReady: this._moduleStates.keyManager.state === InitState.READY,
            encryptionReady: this._moduleStates.encryption.state === InitState.READY,
            tokenBindingReady: this._moduleStates.tokenBinding.state === InitState.READY,
            anomalyDetectionReady: this._moduleStates.anomalyDetection.state === InitState.READY,
            prototypePollutionProtected: this._moduleStates.prototypePollution.state === InitState.READY,
            modules: { ...this._moduleStates },
            totalInitTime: this._totalInitTime,
            warnings: [...this._warnings],
            errors: [...this._errors],
            secureContextReason: this._secureContextResult?.reason || null
        };
    }
    
    /**
     * Register callback for when security is ready
     * If already ready, callback is invoked immediately
     * @param {Function} callback - Callback receiving initialization report
     * @returns {Function} Unsubscribe function
     */
    onReady(callback) {
        if (this._state === InitState.READY || this._state === InitState.DEGRADED) {
            // Already ready - invoke immediately
            try {
                callback(this.getInitializationReport());
            } catch (error) {
                console.error('[SecurityCoordinator] onReady callback threw error:', error);
            }
        }
        
        this._readyCallbacks.push(callback);
        
        return () => {
            const index = this._readyCallbacks.indexOf(callback);
            if (index >= 0) {
                this._readyCallbacks.splice(index, 1);
            }
        };
    }
    
    /**
     * Register callback for initialization failure
     * @param {Function} callback - Callback receiving error and report
     * @returns {Function} Unsubscribe function
     */
    onFailure(callback) {
        if (this._state === InitState.FAILED) {
            // Already failed - invoke immediately
            try {
                callback(new Error('Security initialization failed'), this.getInitializationReport());
            } catch (error) {
                console.error('[SecurityCoordinator] onFailure callback threw error:', error);
            }
        }
        
        this._failureCallbacks.push(callback);
        
        return () => {
            const index = this._failureCallbacks.indexOf(callback);
            if (index >= 0) {
                this._failureCallbacks.splice(index, 1);
            }
        };
    }
    
    /**
     * Wait for security to be ready (Promise-based)
     * @param {number} [timeoutMs=30000] - Timeout in milliseconds
     * @returns {Promise<InitializationReport>} Resolves when ready, rejects on failure/timeout
     */
    async waitForReady(timeoutMs = 30000) {
        if (this._state === InitState.READY || this._state === InitState.DEGRADED) {
            return this.getInitializationReport();
        }
        
        if (this._state === InitState.FAILED) {
            throw new Error('Security initialization already failed');
        }
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                unsubscribeReady();
                unsubscribeFail();
                reject(new Error(`Security initialization timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            
            const unsubscribeReady = this.onReady((report) => {
                clearTimeout(timeout);
                unsubscribeFail();
                resolve(report);
            });
            
            const unsubscribeFail = this.onFailure((error, report) => {
                clearTimeout(timeout);
                unsubscribeReady();
                reject(error);
            });
        });
    }
    
    /**
     * Reset coordinator state (for testing or re-initialization)
     * WARNING: This does not clear KeyManager session or other module state
     */
    reset() {
        this._state = InitState.NOT_STARTED;
        this._initPromise = null;
        this._initStartTime = 0;
        this._totalInitTime = 0;
        this._warnings = [];
        this._errors = [];
        this._secureContextResult = null;
        
        for (const module of Object.keys(this._moduleStates)) {
            this._moduleStates[module] = { state: InitState.NOT_STARTED, error: null, initTime: 0 };
        }
        
        console.log('[SecurityCoordinator] State reset');
    }
}

// Export singleton instance
export const SecurityCoordinator = new SecurityCoordinatorClass();

// Export class for testing
export { SecurityCoordinatorClass, InitState };
