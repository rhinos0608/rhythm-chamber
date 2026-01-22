/**
 * Development-only guards for legacy window globals.
 *
 * @deprecated This file is kept only for the lint-window-globals.mjs script.
 * The ES Module migration is complete - setupDeprecatedWindowGlobals() is no
 * longer called from main.js. This file can be removed once the lint script
 * is updated or removed in v1.0.
 *
 * ORIGINAL PURPOSE:
 * These globals existed solely for backwards compatibility and debugging.
 * In development, accessing them logged a deprecation warning so new code
 * moved toward module imports or ModuleRegistry access instead.
 *
 * MIGRATION STATUS: COMPLETE - All modules now use ES imports.
 */

const DEPRECATED_WINDOW_GLOBALS = [
    'AnalyticsExecutors',
    'AnalyticsQuerySchemas',
    'AppState',
    'Cards',
    'Chat',
    'ConversationOrchestrator',
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
    'MessageLifecycleCoordinator',
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
    'WaveTelemetry',
    // Observability globals (Phase 8)
    'CoreWebVitalsTracker',
    'EventBus',
    'MetricsExporter',
    'ObservabilityController',
    'ObservabilityInit',
    'ObservabilitySettings',
    'PerformanceProfiler',
    'ProviderFallbackChain',
    // Functions and state
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

// Deprecation tracking state
const deprecationStats = {
    accessCounts: new Map(),      // name -> count
    firstAccessTime: new Map(),   // name -> timestamp
    lastAccessTime: new Map(),    // name -> timestamp
    accessStacks: new Map()       // name -> Set of call sites (first 3 unique)
};

const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
const WRAP_SENTINEL = '__RC_WINDOW_GLOBALS_WRAPPED__';

// Current deprecation phase
const DEPRECATION_VERSION = 'v1.0';
const REMOVAL_VERSION = 'v1.3';

function isDevelopment(win) {
    if (!win || !win.location) return false;
    const host = win.location.hostname || '';
    if (DEV_HOSTS.has(host) || host.endsWith('.local')) {
        return true;
    }
    return win.location.protocol === 'file:';
}

/**
 * Get a simplified call site from stack trace
 * @returns {string|null} Call site description
 */
function getCallSite() {
    try {
        const stack = new Error().stack || '';
        const lines = stack.split('\n');
        // Skip Error, getCallSite, getter, and find the actual call site
        for (let i = 3; i < lines.length && i < 6; i++) {
            const line = lines[i]?.trim();
            if (line && !line.includes('window-globals-debug')) {
                // Extract just the file:line part
                const match = line.match(/at\s+(?:.*?\s+)?\(?([^)]+)\)?$/);
                return match ? match[1] : line;
            }
        }
    } catch {
        // Ignore stack trace errors
    }
    return null;
}

/**
 * Record an access to a deprecated global
 * @param {string} name - Global name
 */
function recordAccess(name) {
    const now = Date.now();

    // Increment access count
    const count = (deprecationStats.accessCounts.get(name) || 0) + 1;
    deprecationStats.accessCounts.set(name, count);

    // Track first access time
    if (!deprecationStats.firstAccessTime.has(name)) {
        deprecationStats.firstAccessTime.set(name, now);
    }

    // Track last access time
    deprecationStats.lastAccessTime.set(name, now);

    // Track call sites (first 3 unique)
    const callSite = getCallSite();
    if (callSite) {
        let sites = deprecationStats.accessStacks.get(name);
        if (!sites) {
            sites = new Set();
            deprecationStats.accessStacks.set(name, sites);
        }
        if (sites.size < 3) {
            sites.add(callSite);
        }
    }
}

/**
 * Get deprecation statistics for auditing
 * @returns {Object} Statistics about deprecated global usage
 */
function getDeprecationStats() {
    const stats = [];

    for (const name of DEPRECATED_WINDOW_GLOBALS) {
        const count = deprecationStats.accessCounts.get(name) || 0;
        if (count > 0) {
            stats.push({
                name,
                accessCount: count,
                firstAccess: deprecationStats.firstAccessTime.get(name),
                lastAccess: deprecationStats.lastAccessTime.get(name),
                callSites: Array.from(deprecationStats.accessStacks.get(name) || [])
            });
        }
    }

    // Sort by access count descending
    stats.sort((a, b) => b.accessCount - a.accessCount);

    return {
        totalGlobals: DEPRECATED_WINDOW_GLOBALS.length,
        accessedGlobals: stats.length,
        deprecationVersion: DEPRECATION_VERSION,
        removalVersion: REMOVAL_VERSION,
        globals: stats
    };
}

/**
 * Print deprecation summary to console
 * Useful for periodic auditing
 */
function printDeprecationSummary() {
    const stats = getDeprecationStats();

    console.group('[WindowGlobals] Deprecation Summary');
    console.log(`Phase: ${DEPRECATION_VERSION} (removal in ${REMOVAL_VERSION})`);
    console.log(`Accessed: ${stats.accessedGlobals}/${stats.totalGlobals} deprecated globals`);

    if (stats.globals.length > 0) {
        console.table(stats.globals.map(g => ({
            name: g.name,
            count: g.accessCount,
            sites: g.callSites.join(' | ').slice(0, 80)
        })));
    }
    console.groupEnd();
}

/**
 * Reset deprecation statistics (for testing)
 */
function resetDeprecationStats() {
    deprecationStats.accessCounts.clear();
    deprecationStats.firstAccessTime.clear();
    deprecationStats.lastAccessTime.clear();
    deprecationStats.accessStacks.clear();
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
                    // Track access for statistics
                    recordAccess(name);

                    if (!warned.has(name)) {
                        console.warn(
                            `[WindowGlobals] window.${name} is deprecated (${DEPRECATION_VERSION}, removal in ${REMOVAL_VERSION}). ` +
                            `Import modules directly or use ModuleRegistry.`
                        );
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

export {
    DEPRECATED_WINDOW_GLOBALS,
    setupDeprecatedWindowGlobals,
    getDeprecationStats,
    printDeprecationSummary,
    resetDeprecationStats
};

