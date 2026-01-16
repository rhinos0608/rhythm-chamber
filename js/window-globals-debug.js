/**
 * Development-only guards for legacy window globals.
 *
 * These globals exist solely for backwards compatibility and debugging.
 * In development, accessing them logs a deprecation warning so new code
 * moves toward module imports or ModuleRegistry access instead.
 */

const DEPRECATED_WINDOW_GLOBALS = [
    'AnalyticsExecutors',
    'AnalyticsQuerySchemas',
    'AppState',
    'Cards',
    'Chat',
    'ChatUIController',
    'CircuitBreaker',
    'Config',
    'ConfigAPI',
    'DataExecutors',
    'DataQuery',
    'DataQuerySchemas',
    'DataVersion',
    'DeadlockError',
    'DemoController',
    'DemoData',
    'DeviceBackup',
    'FallbackResponseService',
    'FileUploadController',
    'FunctionCallingFallback',
    'FunctionRetry',
    'FunctionValidation',
    'Functions',
    'GenreEnrichment',
    'IndexedDBCore',
    'LLMProviderRoutingService',
    'LMStudioProvider',
    'LocalOnlySync',
    'LockAcquisitionError',
    'LockForceReleaseError',
    'LockReleaseError',
    'LockTimeoutError',
    'MessageOperations',
    'OpenRouterProvider',
    'OperationLock',
    'OperationQueue',
    'Parser',
    'Patterns',
    'Payments',
    'Personality',
    'ProfileDescriptionGenerator',
    'ProfileStorage',
    'ProfileSynthesizer',
    'ProfileSynthesizerClass',
    'Prompts',
    'ProviderCircuitBreaker',
    'ProviderInterface',
    'QUEUE_PRIORITY',
    'QUEUE_STATUS',
    'QueuedOperation',
    'QuotaMonitor',
    'RecoveryHandlers',
    'ResetController',
    'STORAGE_KEYS',
    'SecureTokenStore',
    'Security',
    'SecurityChecklist',
    'SessionManager',
    'Settings',
    'SidebarController',
    'Spotify',
    'SpotifyController',
    'Storage',
    'StorageCircuitBreaker',
    'SyncManager',
    'SyncStrategy',
    'TabCoordinator',
    'TemplateExecutors',
    'TemplateFunctionNames',
    'TemplateProfileStore',
    'TemplateProfileStoreClass',
    'TemplateQuerySchemas',
    'TimeoutError',
    'TimeoutWrapper',
    'TokenCounter',
    'TokenCountingService',
    'ToolCallHandlingService',
    'Transformers',
    'Utils',
    'VectorClock',
    'VectorClockModule',
    'VersionedData',
    'ViewController',
    '_sessionData',
    '_userContext',
    'clearSensitiveData',
    'confirmDeleteChat',
    'copyErrorReport',
    'executeReset',
    'hideDeleteChatModal',
    'hideResetConfirmModal',
    'isInSafeMode',
    'processMessageResponse',
    'showPrivacyDashboard',
    'transformers'
];

const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
const WRAP_SENTINEL = '__RC_WINDOW_GLOBALS_WRAPPED__';

function isDevelopment(win) {
    if (!win || !win.location) return false;
    const host = win.location.hostname || '';
    if (DEV_HOSTS.has(host) || host.endsWith('.local')) {
        return true;
    }
    return win.location.protocol === 'file:';
}

/**
 * Wrap legacy window globals with dev-only warnings on access.
 * @param {Window} win - Target window (defaults to global window)
 * @param {string[]} globals - List of global names to wrap
 */
function setupDeprecatedWindowGlobals(win = typeof window !== 'undefined' ? window : undefined, globals = DEPRECATED_WINDOW_GLOBALS) {
    if (!win || !isDevelopment(win) || win[WRAP_SENTINEL]) return;
    win[WRAP_SENTINEL] = true;

    const warned = new Set();

    globals.forEach((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(win, name);
        if (descriptor && descriptor.configurable === false) return;

        let currentValue;

        if (descriptor && typeof descriptor.get === 'function') {
            try {
                currentValue = descriptor.get.call(win);
            } catch {
                currentValue = undefined;
            }
        } else if (descriptor && 'value' in descriptor) {
            currentValue = descriptor.value;
        } else {
            currentValue = win[name];
        }

        try {
            Object.defineProperty(win, name, {
                configurable: true,
                enumerable: descriptor ? descriptor.enumerable : true,
                get() {
                    if (!warned.has(name)) {
                        console.warn(`[WindowGlobals] window.${name} is deprecated and kept for debugging only. Import modules directly or use ModuleRegistry.`);
                        warned.add(name);
                    }
                    return currentValue;
                },
                set(newValue) {
                    currentValue = newValue;
                }
            });
        } catch {
            // Ignore globals that cannot be redefined (non-configurable)
        }
    });
}

export { DEPRECATED_WINDOW_GLOBALS, setupDeprecatedWindowGlobals };
