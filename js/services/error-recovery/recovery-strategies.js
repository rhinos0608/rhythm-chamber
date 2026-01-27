/**
 * Recovery Strategies Module
 *
 * Domain-specific recovery handlers for different error types.
 * Extracted from error-recovery-coordinator.js for better separation of concerns.
 *
 * @module RecoveryStrategies
 * @author Rhythm Chamber Architecture Team
 * @version 1.0.0
 */

import { RecoveryDomain } from '../error-recovery-coordinator.js';

/**
 * RecoveryStrategies Class
 *
 * Manages domain-specific recovery handlers for different error types.
 * Each domain has specialized recovery logic tailored to its needs.
 */
export class RecoveryStrategies {
    /**
     * @private
     * @type {Object}
     */
    _eventBus;

    /**
     * @private
     * @type {Map<RecoveryDomain, Array<Function>>}
     */
    _recoveryHandlers = new Map();

    /**
     * Initialize RecoveryStrategies
     * @public
     * @param {Object} eventBus - Event bus for emitting recovery events
     */
    constructor(eventBus) {
        this._eventBus = eventBus;
        this._initializeRecoveryHandlers();
    }

    /**
     * Initialize recovery handlers for each domain
     * @private
     */
    _initializeRecoveryHandlers() {
        // Security domain handlers
        this._recoveryHandlers.set(RecoveryDomain.SECURITY, [
            this._handleSecurityError.bind(this)
        ]);

        // Storage domain handlers
        this._recoveryHandlers.set(RecoveryDomain.STORAGE, [
            this._handleStorageError.bind(this)
        ]);

        // UI domain handlers
        this._recoveryHandlers.set(RecoveryDomain.UI, [
            this._handleUIError.bind(this)
        ]);

        // Operational domain handlers
        this._recoveryHandlers.set(RecoveryDomain.OPERATIONAL, [
            this._handleOperationalError.bind(this)
        ]);

        // Network domain handlers
        this._recoveryHandlers.set(RecoveryDomain.NETWORK, [
            this._handleNetworkError.bind(this)
        ]);

        // Provider domain handlers
        this._recoveryHandlers.set(RecoveryDomain.PROVIDER, [
            this._handleProviderError.bind(this)
        ]);
    }

    /**
     * Handle security errors
     * @public
     * @param {Object} data - Error data
     * @returns {Promise<void>}
     */
    async handleSecurityError(data) {
        console.log('[RecoveryStrategies] Handling security error:', data);

        // Emit security recovery event
        this._eventBus.emit('SECURITY:RECOVERY', {
            error: data.error,
            context: data.context,
            action: data.recoveryAction || 'default'
        });
    }

    /**
     * Handle storage errors
     * @public
     * @param {Object} data - Error data
     * @returns {Promise<void>}
     */
    async handleStorageError(data) {
        console.log('[RecoveryStrategies] Handling storage error:', data);

        // Emit storage recovery event
        this._eventBus.emit('STORAGE:RECOVERY', {
            error: data.error,
            context: data.context,
            action: data.recoveryAction || 'fallback'
        });
    }

    /**
     * Handle UI errors
     * @public
     * @param {Object} data - Error data
     * @returns {Promise<void>}
     */
    async handleUIError(data) {
        console.log('[RecoveryStrategies] Handling UI error:', data);

        // Emit UI recovery event
        this._eventBus.emit('UI:RECOVERY', {
            error: data.error,
            context: data.context,
            widgetId: data.widgetId
        });
    }

    /**
     * Handle operational errors
     * @public
     * @param {Object} data - Error data
     * @returns {Promise<void>}
     */
    async handleOperationalError(data) {
        console.log('[RecoveryStrategies] Handling operational error:', data);

        // Emit operational recovery event
        this._eventBus.emit('OPERATIONAL:RECOVERY', {
            error: data.error,
            context: data.context,
            retryable: data.retryable !== false
        });
    }

    /**
     * Handle network errors
     * @public
     * @param {Object} data - Error data
     * @returns {Promise<void>}
     */
    async handleNetworkError(data) {
        console.log('[RecoveryStrategies] Handling network error:', data);

        // Emit network recovery event
        this._eventBus.emit('NETWORK:RECOVERY', {
            error: data.error,
            url: data.url,
            retryable: true
        });
    }

    /**
     * Handle provider errors
     * @public
     * @param {Object} data - Error data
     * @returns {Promise<void>}
     */
    async handleProviderError(data) {
        console.log('[RecoveryStrategies] Handling provider error:', data);

        // Emit provider recovery event
        this._eventBus.emit('PROVIDER:RECOVERY', {
            error: data.error,
            provider: data.provider,
            fallbackAvailable: data.fallbackAvailable
        });
    }

    /**
     * Private handler wrapper (bound to instance)
     * @private
     */
    _handleSecurityError = this.handleSecurityError;
    _handleStorageError = this.handleStorageError;
    _handleUIError = this.handleUIError;
    _handleOperationalError = this.handleOperationalError;
    _handleNetworkError = this.handleNetworkError;
    _handleProviderError = this.handleProviderError;

    /**
     * Get all recovery handlers
     * @public
     * @returns {Map<RecoveryDomain, Array<Function>>} Recovery handlers map
     */
    getHandlers() {
        return this._recoveryHandlers;
    }

    /**
     * Register custom recovery handler
     * @public
     * @param {RecoveryDomain} domain - Recovery domain
     * @param {Function} handler - Recovery handler function
     */
    registerHandler(domain, handler) {
        if (!this._recoveryHandlers.has(domain)) {
            this._recoveryHandlers.set(domain, []);
        }
        this._recoveryHandlers.get(domain).push(handler);
    }

    /**
     * Get dependency handler name
     * @public
     * @param {string} dependency - Dependency name
     * @returns {string|null} Dependency handler name or null
     */
    getDependencyHandlerName(dependency) {
        // Map dependencies to handler names (will be resolved by coordinator)
        const handlerMap = {
            'operation_lock': 'operation_lock',
            'state_validation': 'state_validation',
            'tab_coordination': 'tab_coordination'
        };
        return handlerMap[dependency] || null;
    }
}
