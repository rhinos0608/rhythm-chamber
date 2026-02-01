/**
 * Provider Notification Service
 *
 * Handles user notifications for provider events including fallbacks,
 * health changes, and error messages with actionable guidance.
 *
 * @module services/provider-notification-service
 */

import { EventBus } from './event-bus.js';
import { Settings } from '../settings.js';

/**
 * Notification types
 * @readonly
 * @enum {string}
 */
export const NotificationType = Object.freeze({
    PROVIDER_FALLBACK: 'provider_fallback',
    PROVIDER_RECOVERED: 'provider_recovered',
    PROVIDER_ERROR: 'provider_error',
    PROVIDER_BLACKLISTED: 'provider_blacklisted',
    ALL_PROVIDERS_FAILED: 'all_providers_failed',
});

/**
 * Notification severity levels
 * @readonly
 * @enum {string}
 */
export const NotificationSeverity = Object.freeze({
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    SUCCESS: 'success',
});

/**
 * Provider display names
 * @private
 */
const PROVIDER_NAMES = {
    openrouter: 'OpenRouter',
    ollama: 'Ollama',
    lmstudio: 'LM Studio',
    fallback: 'Fallback Mode',
};

/**
 * Provider Notification Service Class
 */
export class ProviderNotificationService {
    /**
     * @private
     * @type {EventBus}
     */
    _eventBus = EventBus;

    /**
     * @private
     * @type {Array<Object>}
     */
    _notificationHistory = [];

    /**
     * @private
     * @type {number}
     */
    _maxHistorySize = 50;

    /**
     * @private
     * @type {boolean}
     */
    _enabled = true;

    constructor() {
        this._subscribeToEvents();
    }

    /**
     * Subscribe to provider events
     * @private
     */
    _subscribeToEvents() {
        this._eventBus.on('PROVIDER:FALLBACK', (event, data) => {
            this._handleProviderFallback(data);
        });

        this._eventBus.on('PROVIDER:RECOVERED', (event, data) => {
            this._handleProviderRecovered(data);
        });

        this._eventBus.on('PROVIDER:BLACKLISTED', (event, data) => {
            this._handleProviderBlacklisted(data);
        });

        this._eventBus.on('PROVIDER:FAILURE', (event, data) => {
            this._handleProviderFailure(data);
        });

        this._eventBus.on('PROVIDER:ALL_FAILED', (event, data) => {
            this._handleAllProvidersFailed(data);
        });
    }

    /**
     * Handle provider fallback event
     * @private
     * @param {Object} data - Event data
     */
    _handleProviderFallback(data) {
        const { fromProvider, toProvider, reason, latencyMs } = data;

        const notification = {
            type: NotificationType.PROVIDER_FALLBACK,
            severity: NotificationSeverity.WARNING,
            title: 'Provider Switched',
            message: this._createFallbackMessage(fromProvider, toProvider, reason),
            details: {
                fromProvider,
                toProvider,
                reason,
                latencyMs,
                timestamp: Date.now(),
            },
            actions: this._createFallbackActions(fromProvider, toProvider),
        };

        this._showNotification(notification);
    }

    /**
     * Create fallback message
     * @private
     * @param {string} fromProvider - Source provider
     * @param {string} toProvider - Target provider
     * @param {string} reason - Fallback reason
     * @returns {string} Formatted message
     */
    _createFallbackMessage(fromProvider, toProvider, reason) {
        const fromName = PROVIDER_NAMES[fromProvider] || fromProvider;
        const toName = PROVIDER_NAMES[toProvider] || toProvider;

        return `Switched from ${fromName} to ${toName} due to: ${reason || 'Connection issues'}`;
    }

    /**
     * Create fallback notification actions
     * @private
     * @param {string} fromProvider - Source provider
     * @param {string} toProvider - Target provider
     * @returns {Array} Available actions
     */
    _createFallbackActions(fromProvider, toProvider) {
        const actions = [];

        // Add "Switch Back" action if original provider recovers
        actions.push({
            label: `Switch back to ${PROVIDER_NAMES[fromProvider] || fromProvider}`,
            action: 'switch_provider',
            provider: fromProvider,
            primary: false,
        });

        // Add "Settings" action
        actions.push({
            label: 'Open Settings',
            action: 'open_settings',
            primary: true,
        });

        return actions;
    }

    /**
     * Handle provider recovered event
     * @private
     * @param {Object} data - Event data
     */
    _handleProviderRecovered(data) {
        const { provider } = data;

        const notification = {
            type: NotificationType.PROVIDER_RECOVERED,
            severity: NotificationSeverity.SUCCESS,
            title: 'Provider Recovered',
            message: `${PROVIDER_NAMES[provider] || provider} is back online`,
            details: {
                provider,
                timestamp: Date.now(),
            },
            actions: [
                {
                    label: `Switch to ${PROVIDER_NAMES[provider] || provider}`,
                    action: 'switch_provider',
                    provider,
                    primary: true,
                },
            ],
        };

        this._showNotification(notification);
    }

    /**
     * Handle provider blacklisted event
     * @private
     * @param {Object} data - Event data
     */
    _handleProviderBlacklisted(data) {
        const { provider, expiry, durationMs } = data;

        const expiryTime = new Date(expiry).toLocaleTimeString();
        const duration = Math.round(durationMs / 60000); // Convert to minutes

        const notification = {
            type: NotificationType.PROVIDER_BLACKLISTED,
            severity: NotificationSeverity.WARNING,
            title: 'Provider Temporarily Unavailable',
            message: `${PROVIDER_NAMES[provider] || provider} is blacklisted for ${duration} minutes (until ${expiryTime})`,
            details: {
                provider,
                expiry,
                durationMs,
                timestamp: Date.now(),
            },
            actions: this._createBlacklistedActions(provider),
        };

        this._showNotification(notification);
    }

    /**
     * Create blacklisted notification actions
     * @private
     * @param {string} provider - Blacklisted provider
     * @returns {Array} Available actions
     */
    _createBlacklistedActions(provider) {
        const actions = [];
        const otherProviders = ['openrouter', 'ollama', 'lmstudio'].filter(p => p !== provider);

        // Add alternative provider switches
        for (const altProvider of otherProviders) {
            actions.push({
                label: `Switch to ${PROVIDER_NAMES[altProvider] || altProvider}`,
                action: 'switch_provider',
                provider: altProvider,
                primary: altProvider === 'ollama', // Prefer local providers
            });
        }

        return actions;
    }

    /**
     * Handle provider failure event
     * @private
     * @param {Object} data - Event data
     */
    _handleProviderFailure(data) {
        const { provider, error } = data;

        const notification = {
            type: NotificationType.PROVIDER_ERROR,
            severity: NotificationSeverity.ERROR,
            title: 'Provider Error',
            message: this._createErrorMessage(provider, error),
            details: {
                provider,
                error: error?.message || String(error),
                timestamp: Date.now(),
            },
            actions: this._createErrorActions(provider, error),
        };

        this._showNotification(notification);
    }

    /**
     * Create error message based on provider and error
     * @private
     * @param {string} provider - Provider name
     * @param {Error} error - Error object
     * @returns {string} Formatted error message
     */
    _createErrorMessage(provider, error) {
        const providerName = PROVIDER_NAMES[provider] || provider;
        const errorMessage = error?.message || String(error);

        // Provider-specific error guidance
        switch (provider) {
            case 'ollama':
                if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch')) {
                    return `${providerName} is not running. Start Ollama with "ollama serve" or check the endpoint in Settings.`;
                }
                break;

            case 'lmstudio':
                if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch')) {
                    return `${providerName} server is not running. Start the server in LM Studio (↔️ button) or check the endpoint in Settings.`;
                }
                break;

            case 'openrouter':
                if (errorMessage.includes('401') || errorMessage.includes('authentication')) {
                    return `${providerName} authentication failed. Check your API key in Settings.`;
                }
                if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
                    return `${providerName} rate limit exceeded. Wait a moment or switch to a local provider.`;
                }
                break;
        }

        return `${providerName} error: ${errorMessage}`;
    }

    /**
     * Create error notification actions
     * @private
     * @param {string} provider - Failed provider
     * @param {Error} error - Error object
     * @returns {Array} Available actions
     */
    _createErrorActions(provider, error) {
        const actions = [];
        const errorMessage = error?.message || '';

        // Provider-specific actions
        switch (provider) {
            case 'ollama':
                if (errorMessage.includes('ECONNREFUSED')) {
                    actions.push({
                        label: 'Start Ollama',
                        action: 'external_link',
                        url: 'https://ollama.com/',
                        primary: true,
                    });
                }
                break;

            case 'lmstudio':
                if (errorMessage.includes('ECONNREFUSED')) {
                    actions.push({
                        label: 'Open LM Studio',
                        action: 'external_link',
                        url: 'https://lmstudio.ai/',
                        primary: true,
                    });
                }
                break;

            case 'openrouter':
                if (errorMessage.includes('401') || errorMessage.includes('authentication')) {
                    actions.push({
                        label: 'Update API Key',
                        action: 'open_settings',
                        primary: true,
                    });
                }
                break;
        }

        // Always add "Switch Provider" action
        const otherProviders = ['openrouter', 'ollama', 'lmstudio'].filter(p => p !== provider);
        for (const altProvider of otherProviders) {
            actions.push({
                label: `Switch to ${PROVIDER_NAMES[altProvider]}`,
                action: 'switch_provider',
                provider: altProvider,
                primary: false,
            });
        }

        return actions;
    }

    /**
     * Handle all providers failed event
     * @private
     * @param {Object} data - Event data
     */
    _handleAllProvidersFailed(data) {
        const { attempts } = data;

        const failedProviders = attempts
            .filter(a => !a.success)
            .map(a => PROVIDER_NAMES[a.provider] || a.provider)
            .join(', ');

        const notification = {
            type: NotificationType.ALL_PROVIDERS_FAILED,
            severity: NotificationSeverity.ERROR,
            title: 'All Providers Failed',
            message: `Unable to connect to any AI provider. Failed: ${failedProviders}`,
            details: {
                attempts,
                timestamp: Date.now(),
            },
            actions: [
                {
                    label: 'Check Settings',
                    action: 'open_settings',
                    primary: true,
                },
                {
                    label: 'Try Again',
                    action: 'retry',
                    primary: false,
                },
            ],
        };

        this._showNotification(notification);
    }

    /**
     * Show notification to user
     * @private
     * @param {Object} notification - Notification object
     */
    _showNotification(notification) {
        if (!this._enabled) return;

        // Add to history
        this._notificationHistory.push(notification);
        if (this._notificationHistory.length > this._maxHistorySize) {
            this._notificationHistory.shift();
        }

        // Show toast notification
        if (Settings?.showToast) {
            const message = this._formatToastMessage(notification);
            const duration = notification.severity === NotificationSeverity.ERROR ? 5000 : 3000;
            Settings.showToast(message, duration);
        }

        // Emit notification event for UI components
        this._eventBus.emit('PROVIDER:NOTIFICATION', notification);

        console.log('[ProviderNotificationService]', notification);
    }

    /**
     * Format notification as toast message
     * @private
     * @param {Object} notification - Notification object
     * @returns {string} Formatted message
     */
    _formatToastMessage(notification) {
        const icon = this._getSeverityIcon(notification.severity);
        return `${icon} ${notification.message}`;
    }

    /**
     * Get icon for severity level
     * @private
     * @param {string} severity - Severity level
     * @returns {string} Emoji icon
     */
    _getSeverityIcon(severity) {
        switch (severity) {
            case NotificationSeverity.ERROR:
                return '❌';
            case NotificationSeverity.WARNING:
                return '⚠️';
            case NotificationSeverity.SUCCESS:
                return '✅';
            case NotificationSeverity.INFO:
                return 'ℹ️';
            default:
                return '📢';
        }
    }

    /**
     * Get notification history
     * @returns {Array} Notification history
     */
    getHistory() {
        return [...this._notificationHistory];
    }

    /**
     * Clear notification history
     */
    clearHistory() {
        this._notificationHistory = [];
    }

    /**
     * Enable notifications
     */
    enable() {
        this._enabled = true;
    }

    /**
     * Disable notifications
     */
    disable() {
        this._enabled = false;
    }

    /**
     * Check if notifications are enabled
     * @returns {boolean} Enabled status
     */
    isEnabled() {
        return this._enabled;
    }
}

// Export singleton instance
export default new ProviderNotificationService();
