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

import { RecoveryDomain } from './constants.js';

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
     * Implements actual recovery actions based on error type:
     * - QuotaExceededError: Trigger cleanup and fallback
     * - Connection errors: Retry with exponential backoff, then fallback
     * - Transaction errors: Retry with exponential backoff
     *
     * HNW Hierarchy: Uses StorageDegradationManager for cleanup,
     * ConnectionManager for retries, and FallbackBackend for degradation
     *
     * @public
     * @param {Object} data - Error data
     * @returns {Promise<void>}
     */
    async handleStorageError(data) {
        console.log('[RecoveryStrategies] Handling storage error:', data);

        // Emit storage recovery event for observability
        this._eventBus.emit('STORAGE:RECOVERY', {
            error: data.error,
            context: data.context,
            action: data.recoveryAction || 'fallback'
        });

        const errorName = data.error?.name || '';
        const errorMessage = data.error?.message || '';

        // Handle QuotaExceededError - trigger cleanup and fallback
        if (errorName === 'QuotaExceededError' || errorMessage.includes('quota')) {
            await this._handleQuotaExceededError(data);
            return;
        }

        // Handle IndexedDB connection errors - retry then fallback
        if (errorName === 'InvalidStateError' ||
            errorMessage.includes('connection') ||
            errorMessage.includes('database')) {
            await this._handleConnectionError(data);
            return;
        }

        // Handle transaction/lock errors - retry with backoff
        if (errorName === 'TransactionInactiveError' ||
            errorName === 'AbortError' ||
            errorMessage.includes('transaction') ||
            errorMessage.includes('lock')) {
            await this._handleTransactionError(data);
            return;
        }

        // Unknown storage error - emit for fallback handling
        console.warn('[RecoveryStrategies] Unknown storage error type:', errorName, errorMessage);
        this._eventBus.emit('STORAGE:UNKNOWN_ERROR', {
            error: data.error,
            context: data.context
        });
    }

    /**
     * Handle QuotaExceededError with cleanup and fallback
     * @private
     * @param {Object} data - Error data
     * @returns {Promise<void>}
     */
    async _handleQuotaExceededError(data) {
        console.log('[RecoveryStrategies] Handling quota exceeded error');

        // Dynamic import to avoid circular dependency
        let StorageDegradationManager;
        try {
            const module = await import('../storage-degradation/index.js');
            StorageDegradationManager = module.default;
        } catch (e) {
            console.error('[RecoveryStrategies] Failed to import StorageDegradationManager:', e);
        }

        // Emit quota exceeded event for UI notification
        this._eventBus.emit('STORAGE:QUOTA_EXCEEDED', {
            error: data.error,
            context: data.context
        });

        // Attempt emergency cleanup
        if (StorageDegradationManager) {
            try {
                console.log('[RecoveryStrategies] Triggering emergency cleanup');
                const cleanupResult = await StorageDegradationManager.triggerEmergencyCleanup();

                if (cleanupResult?.success && cleanupResult.bytesFreed > 0) {
                    console.log('[RecoveryStrategies] Cleanup freed', cleanupResult.bytesFreed, 'bytes');

                    // Emit cleanup success event
                    this._eventBus.emit('STORAGE:CLEANUP_SUCCESS', {
                        bytesFreed: cleanupResult.bytesFreed,
                        itemsDeleted: cleanupResult.itemsDeleted,
                        operations: cleanupResult.operationsPerformed
                    });

                    // Retry the original operation after cleanup
                    this._eventBus.emit('STORAGE:RETRY_OPERATION', {
                        error: data.error,
                        context: data.context,
                        reason: 'after_cleanup'
                    });
                    return;
                }
            } catch (cleanupError) {
                console.error('[RecoveryStrategies] Cleanup failed:', cleanupError);
            }
        }

        // Cleanup failed or unavailable - enter emergency mode
        console.warn('[RecoveryStrategies] Entering emergency mode due to quota exceeded');
        this._eventBus.emit('STORAGE:ENTER_EMERGENCY_MODE', {
            error: data.error,
            context: data.context,
            reason: 'quota_exceeded_cleanup_failed'
        });
    }

    /**
     * Handle connection errors with retry and fallback
     * @private
     * @param {Object} data - Error data
     * @returns {Promise<void>}
     */
    async _handleConnectionError(data) {
        console.log('[RecoveryStrategies] Handling connection error');

        const currentAttempt = data.context?.attempt || 1;
        const maxRetries = data.context?.maxRetries || 3;

        // Emit connection failure event
        this._eventBus.emit('STORAGE:CONNECTION_FAILED', {
            error: data.error,
            context: data.context,
            attempts: currentAttempt,
            recoverable: currentAttempt <= maxRetries
        });

        // If we haven't exhausted retries, schedule retry with exponential backoff
        // FIXED: Changed < to <= to allow retry on the final attempt (maxRetries)
        if (currentAttempt <= maxRetries) {
            const delayMs = Math.min(1000 * Math.pow(2, currentAttempt - 1), 5000);

            console.log(`[RecoveryStrategies] Scheduling connection retry ${currentAttempt + 1}/${maxRetries} in ${delayMs}ms`);

            // Emit retry event with delay
            this._eventBus.emit('STORAGE:RETRY_CONNECTION', {
                error: data.error,
                context: { ...data.context, attempt: currentAttempt + 1 },
                delayMs,
                attempt: currentAttempt + 1,
                maxAttempts: maxRetries
            });

            // Schedule retry operation
            setTimeout(() => {
                this._eventBus.emit('STORAGE:RETRY_OPERATION', {
                    error: data.error,
                    context: { ...data.context, attempt: currentAttempt + 1 },
                    reason: 'connection_retry'
                });
            }, delayMs);
        } else {
            // All retries exhausted - activate fallback
            console.warn('[RecoveryStrategies] Connection retries exhausted, activating fallback');
            await this._activateFallbackBackend(data);
        }
    }

    /**
     * Handle transaction errors with retry
     * @private
     * @param {Object} data - Error data
     * @returns {Promise<void>}
     */
    async _handleTransactionError(data) {
        console.log('[RecoveryStrategies] Handling transaction error');

        const currentAttempt = data.context?.attempt || 1;
        const maxTransactionRetries = 2;

        if (currentAttempt <= maxTransactionRetries) {
            const delayMs = 100 * Math.pow(2, currentAttempt - 1);

            console.log(`[RecoveryStrategies] Retrying transaction ${currentAttempt}/${maxTransactionRetries} after ${delayMs}ms`);

            // Emit retry event with exponential backoff
            this._eventBus.emit('STORAGE:RETRY_OPERATION', {
                error: data.error,
                context: { ...data.context, attempt: currentAttempt + 1 },
                delayMs,
                reason: 'transaction_retry',
                attempt: currentAttempt + 1,
                maxAttempts: maxTransactionRetries + 1
            });

            // Schedule the retry
            setTimeout(() => {
                this._eventBus.emit('STORAGE:EXECUTE_TRANSACTION', {
                    context: { ...data.context, attempt: currentAttempt + 1 }
                });
            }, delayMs);
        } else {
            // Transaction retries exhausted
            console.error('[RecoveryStrategies] Transaction retries exhausted');

            this._eventBus.emit('STORAGE:TRANSACTION_FAILED', {
                error: data.error,
                context: data.context,
                attempts: currentAttempt
            });
        }
    }

    /**
     * Activate fallback storage backend
     * @private
     * @param {Object} data - Error data
     * @returns {Promise<void>}
     */
    async _activateFallbackBackend(data) {
        console.log('[RecoveryStrategies] Activating fallback backend');

        try {
            // Dynamic import to avoid circular dependency
            const { activateFallback } = await import('../../storage/indexeddb/connection.js');
            const fallbackResult = await activateFallback();

            // Emit fallback activation event
            this._eventBus.emit('STORAGE:FALLBACK_ACTIVATED', {
                mode: fallbackResult?.backend?.getMode?.() || 'unknown',
                stats: fallbackResult?.backend?.getStats?.() || {},
                reason: data.error?.message || 'connection_failure'
            });

            // Notify user about fallback mode
            this._eventBus.emit('UI:TOAST', {
                type: 'warning',
                message: 'Storage unavailable. Using temporary storage - your data will not persist after closing this tab.',
                duration: 15000,
                actions: [
                    { label: 'Retry Connection', action: 'retry_storage_connection' },
                    { label: 'Export Data', action: 'export_current_data' }
                ]
            });

        } catch (fallbackError) {
            console.error('[RecoveryStrategies] Failed to activate fallback:', fallbackError);

            // Emit fallback failure event
            this._eventBus.emit('STORAGE:FALLBACK_FAILED', {
                error: fallbackError,
                originalError: data.error
            });

            // Show critical error to user
            this._eventBus.emit('UI:MODAL', {
                type: 'critical',
                title: 'Storage Unavailable',
                message: 'The application cannot store data due to a persistent storage error. Please refresh the page or try a different browser.',
                options: [
                    { label: 'Refresh Page', action: 'refresh_page', primary: true },
                    { label: 'Export Current Session', action: 'export_session' }
                ]
            });
        }
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
