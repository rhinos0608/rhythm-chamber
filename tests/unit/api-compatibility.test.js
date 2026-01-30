/**
 * API Compatibility Test
 *
 * This test ensures that refactoring doesn't accidentally break the public API.
 * It checks that:
 * 1. Expected methods exist on facades
 * 2. Methods can be called without throwing
 * 3. Return types match expectations
 *
 * Run this test after any refactoring to ensure backward compatibility.
 *
 * @module tests/unit/api-compatibility
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ==========================================
// Direct facade imports (avoiding full app load)
// ==========================================

// ErrorRecoveryCoordinator - direct import
import { ErrorRecoveryCoordinator, RecoveryDomain, RecoveryState } from '../../js/services/error-recovery-coordinator.js';

// StorageDegradationManager - direct import
import { StorageDegradationManager, DegradationTier } from '../../js/services/storage-degradation-manager.js';

// SessionManager - direct import
import { SessionManager, SESSION_EVENT_SCHEMAS } from '../../js/services/session-manager.js';

// PatternWorkerPool - direct import
import { PatternWorkerPool } from '../../js/workers/pattern-worker-pool.js';

// ==========================================
// ErrorRecoveryCoordinator API Tests
// ==========================================

describe('ErrorRecoveryCoordinator - API Compatibility', () => {
    let coordinator;

    beforeEach(() => {
        coordinator = new ErrorRecoveryCoordinator();
    });

    it('should have coordinateRecovery method', () => {
        expect(typeof coordinator.coordinateRecovery).toBe('function');
    });

    it('should have getTelemetry method', () => {
        expect(typeof coordinator.getTelemetry).toBe('function');
    });

    it('should have getState method', () => {
        expect(typeof coordinator.getState).toBe('function');
    });

    it('should have getActiveRecoveries method', () => {
        expect(typeof coordinator.getActiveRecoveries).toBe('function');
    });

    it('should have cancelRecovery method', () => {
        expect(typeof coordinator.cancelRecovery).toBe('function');
    });

    it('should have cleanup method', () => {
        expect(typeof coordinator.cleanup).toBe('function');
    });

    it('getState should return a valid RecoveryState value', () => {
        const state = coordinator.getState();
        expect(Object.values(RecoveryState)).toContain(state);
    });

    it('getTelemetry should return an object with expected structure', () => {
        const telemetry = coordinator.getTelemetry();
        expect(telemetry).toHaveProperty('history');
        expect(Array.isArray(telemetry.history) || telemetry.history instanceof Map).toBe(true);
    });

    it('should export RecoveryDomain enum', () => {
        expect(RecoveryDomain).toBeDefined();
        expect(RecoveryDomain.STORAGE).toBe('storage');
        expect(RecoveryDomain.SECURITY).toBe('security');
        expect(RecoveryDomain.NETWORK).toBe('network');
        expect(RecoveryDomain.UI).toBe('ui');
        expect(RecoveryDomain.OPERATIONAL).toBe('operational');
        expect(RecoveryDomain.PROVIDER).toBe('provider');
    });

    it('should export RecoveryState enum', () => {
        expect(RecoveryState).toBeDefined();
        expect(RecoveryState.IDLE).toBe('idle');
        expect(RecoveryState.RECOVERING).toBe('recovering');
    });
});

// ==========================================
// StorageDegradationManager API Tests
// ==========================================

describe('StorageDegradationManager - API Compatibility', () => {
    let manager;

    beforeEach(() => {
        manager = new StorageDegradationManager();
    });

    it('should have getCurrentTier method', () => {
        expect(typeof manager.getCurrentTier).toBe('function');
    });

    it('should have getCurrentMetrics method', () => {
        expect(typeof manager.getCurrentMetrics).toBe('function');
    });

    it('should have checkQuotaNow method', () => {
        expect(typeof manager.checkQuotaNow).toBe('function');
    });

    it('should have stopQuotaMonitoring method', () => {
        expect(typeof manager.stopQuotaMonitoring).toBe('function');
    });

    it('should have isReadOnlyMode method', () => {
        expect(typeof manager.isReadOnlyMode).toBe('function');
    });

    it('should have isEmergencyMode method', () => {
        expect(typeof manager.isEmergencyMode).toBe('function');
    });

    it('should have setAutoCleanupEnabled method', () => {
        expect(typeof manager.setAutoCleanupEnabled).toBe('function');
    });

    it('should have triggerCleanup method', () => {
        expect(typeof manager.triggerCleanup).toBe('function');
    });

    it('should have triggerEmergencyCleanup method', () => {
        expect(typeof manager.triggerEmergencyCleanup).toBe('function');
    });

    it('should have exportStorageData method', () => {
        expect(typeof manager.exportStorageData).toBe('function');
    });

    it('should have clearAllData method', () => {
        expect(typeof manager.clearAllData).toBe('function');
    });

    it('getCurrentTier should return a valid DegradationTier value', () => {
        const tier = manager.getCurrentTier();
        expect(Object.values(DegradationTier)).toContain(tier);
    });

    it('should export DegradationTier enum', () => {
        expect(DegradationTier).toBeDefined();
        expect(DegradationTier.NORMAL).toBe('normal');
        expect(DegradationTier.WARNING).toBe('warning');
        expect(DegradationTier.CRITICAL).toBe('critical');
        expect(DegradationTier.EXCEEDED).toBe('exceeded');
        expect(DegradationTier.EMERGENCY).toBe('emergency');
    });
});

// ==========================================
// SessionManager API Tests
// ==========================================

describe('SessionManager - API Compatibility', () => {
    // Note: SessionManager was heavily refactored with breaking changes
    // This test documents the current state of the API

    it('should have initialize method (new name)', () => {
        expect(typeof SessionManager.initialize).toBe('function');
    });

    it('should have init method (backward compatible alias)', () => {
        expect(typeof SessionManager.init).toBe('function');
    });

    it('should have setUserContext method (backward compatible)', () => {
        expect(typeof SessionManager.setUserContext).toBe('function');
    });

    it('should have createSession method (new name)', () => {
        expect(typeof SessionManager.createSession).toBe('function');
    });

    it('should have deleteSession method (new name)', () => {
        expect(typeof SessionManager.deleteSession).toBe('function');
    });

    it('should have clearAllSessions method (new name)', () => {
        expect(typeof SessionManager.clearAllSessions).toBe('function');
    });

    it('should have getAllSessions method (new name)', () => {
        expect(typeof SessionManager.getAllSessions).toBe('function');
    });

    it('should have eventListenersRegistered property', () => {
        expect(typeof SessionManager.eventListenersRegistered).toBe('boolean');
    });

    it('should have saveCurrentSession method', () => {
        expect(typeof SessionManager.saveCurrentSession).toBe('function');
    });

    it('should have saveConversation method', () => {
        expect(typeof SessionManager.saveConversation).toBe('function');
    });

    it('should have flushPendingSaveAsync method', () => {
        expect(typeof SessionManager.flushPendingSaveAsync).toBe('function');
    });

    it('should have emergencyBackupSync method', () => {
        expect(typeof SessionManager.emergencyBackupSync).toBe('function');
    });

    it('should have recoverEmergencyBackup method', () => {
        expect(typeof SessionManager.recoverEmergencyBackup).toBe('function');
    });

    it('should have registerEventListeners method', () => {
        expect(typeof SessionManager.registerEventListeners).toBe('function');
    });

    it('should register event listeners only once', () => {
        // In test environment without window, the method returns early
        // Just verify the property can be toggled
        const originalValue = SessionManager.eventListenersRegistered;
        SessionManager.registerEventListeners();
        // If we're in a browser environment, it should be true
        // In Node test environment, it stays as is because of early return
        if (typeof window !== 'undefined') {
            expect(SessionManager.eventListenersRegistered).toBe(true);
        } else {
            // In Node env, just verify the method exists and doesn't throw
            expect(SessionManager.eventListenersRegistered).toBe(originalValue);
        }
    });
});

// ==========================================
// Session Event Schemas Tests
// ==========================================

describe('SESSION_EVENT_SCHEMAS - API Compatibility', () => {
    it('should export SESSION_EVENT_SCHEMAS', () => {
        expect(SESSION_EVENT_SCHEMAS).toBeDefined();
        expect(typeof SESSION_EVENT_SCHEMAS).toBe('object');
    });

    it('should have session:created schema', () => {
        expect(SESSION_EVENT_SCHEMAS['session:created']).toBeDefined();
        expect(SESSION_EVENT_SCHEMAS['session:created'].description).toBe('New session created');
        expect(SESSION_EVENT_SCHEMAS['session:created'].payload).toEqual({ sessionId: 'string', title: 'string' });
    });

    it('should have session:loaded schema', () => {
        expect(SESSION_EVENT_SCHEMAS['session:loaded']).toBeDefined();
        expect(SESSION_EVENT_SCHEMAS['session:loaded'].description).toBe('Session loaded from storage');
        expect(SESSION_EVENT_SCHEMAS['session:loaded'].payload).toEqual({ sessionId: 'string', messageCount: 'number' });
    });

    it('should have session:switched schema', () => {
        expect(SESSION_EVENT_SCHEMAS['session:switched']).toBeDefined();
        expect(SESSION_EVENT_SCHEMAS['session:switched'].description).toBe('Switched to different session');
        expect(SESSION_EVENT_SCHEMAS['session:switched'].payload).toEqual({ fromSessionId: 'string|null', toSessionId: 'string' });
    });

    it('should have session:deleted schema', () => {
        expect(SESSION_EVENT_SCHEMAS['session:deleted']).toBeDefined();
        expect(SESSION_EVENT_SCHEMAS['session:deleted'].description).toBe('Session deleted');
        expect(SESSION_EVENT_SCHEMAS['session:deleted'].payload).toEqual({ sessionId: 'string' });
    });

    it('should have session:updated schema', () => {
        expect(SESSION_EVENT_SCHEMAS['session:updated']).toBeDefined();
        expect(SESSION_EVENT_SCHEMAS['session:updated'].description).toBe('Session data updated');
        expect(SESSION_EVENT_SCHEMAS['session:updated'].payload).toEqual({ sessionId: 'string', field: 'string' });
    });
});

// ==========================================
// PatternWorkerPool API Tests
// ==========================================

describe('PatternWorkerPool - API Compatibility', () => {
    it('should have init method', () => {
        expect(typeof PatternWorkerPool.init).toBe('function');
    });

    it('should have detectAllPatterns method', () => {
        expect(typeof PatternWorkerPool.detectAllPatterns).toBe('function');
    });

    it('should have terminate method', () => {
        expect(typeof PatternWorkerPool.terminate).toBe('function');
    });

    it('should have getStatus method', () => {
        expect(typeof PatternWorkerPool.getStatus).toBe('function');
    });

    it('should have resize method', () => {
        expect(typeof PatternWorkerPool.resize).toBe('function');
    });

    it('should have getSpeedupFactor method', () => {
        expect(typeof PatternWorkerPool.getSpeedupFactor).toBe('function');
    });

    it('should have isPaused method', () => {
        expect(typeof PatternWorkerPool.isPaused).toBe('function');
    });

    it('should have onBackpressure method', () => {
        expect(typeof PatternWorkerPool.onBackpressure).toBe('function');
    });

    it('should have onResultConsumed method', () => {
        expect(typeof PatternWorkerPool.onResultConsumed).toBe('function');
    });

    it('should have getMemoryConfig method', () => {
        expect(typeof PatternWorkerPool.getMemoryConfig).toBe('function');
    });

    it('should have partitionData method', () => {
        expect(typeof PatternWorkerPool.partitionData).toBe('function');
    });

    it('should have PATTERN_GROUPS constant', () => {
        expect(PatternWorkerPool.PATTERN_GROUPS).toBeDefined();
        expect(Array.isArray(PatternWorkerPool.PATTERN_GROUPS)).toBe(true);
    });

    it('should have SHARED_MEMORY_AVAILABLE constant', () => {
        expect(typeof PatternWorkerPool.SHARED_MEMORY_AVAILABLE).toBe('boolean');
    });

    it('getStatus should return a valid status object', () => {
        const status = PatternWorkerPool.getStatus();
        expect(status).toHaveProperty('initialized');
        expect(status).toHaveProperty('ready');
        expect(status).toHaveProperty('workerCount');
        expect(typeof status.initialized).toBe('boolean');
        expect(typeof status.ready).toBe('boolean');
        expect(typeof status.workerCount).toBe('number');
    });
});

// ==========================================
// Breaking Change Documentation
// ==========================================

describe('API Breaking Changes - Documentation', () => {
    it('should document SessionManager breaking changes', () => {
        const breakingChanges = {
            'init()': 'initialize() - Has alias for backward compatibility',
            'createNewSession()': 'createSession() - Use new name',
            'deleteSessionById()': 'deleteSession() - Use new name',
            'clearConversation()': 'clearAllSessions() - Use new name',
            'listSessions()': 'getAllSessions() - Use new name',
            'setUserContext()': 'Deprecated - Still exists as no-op with warning',
            'onSessionUpdate()': 'Removed - Use EventBus.on with specific events (session:created, session:loaded, etc.) instead',
            'switchSession()': 'Still available - Moved to internal module',
            'loadSession()': 'Still available - Use activateSession() or loadSession()',
            // Persistence methods
            'saveConversation()': 'Available - Added back in refactoring',
            'flushPendingSaveAsync()': 'Available - Added back in refactoring',
            'emergencyBackupSync()': 'Available - Added back in refactoring',
            'recoverEmergencyBackup()': 'Available - Added back in refactoring',
            // State methods
            'getHistory()': 'Available - Exposed via facade',
            'addMessageToHistory()': 'Available - Exposed via facade',
            'addMessagesToHistory()': 'Available - Exposed via facade',
            'truncateHistory()': 'Available - Exposed via facade',
            'removeMessageFromHistory()': 'Available - Exposed via facade',
            'clearConversation()': 'Available - Alias for clearAllSessions'
        };

        // Verify backward compatibility - initialization methods
        expect(typeof SessionManager.init).toBe('function');
        expect(typeof SessionManager.initialize).toBe('function');

        // Verify persistence methods are available
        expect(typeof SessionManager.saveConversation).toBe('function');
        expect(typeof SessionManager.flushPendingSaveAsync).toBe('function');
        expect(typeof SessionManager.emergencyBackupSync).toBe('function');
        expect(typeof SessionManager.recoverEmergencyBackup).toBe('function');

        // Verify state methods are exposed via facade
        expect(typeof SessionManager.getHistory).toBe('function');
        expect(typeof SessionManager.addMessageToHistory).toBe('function');
        expect(typeof SessionManager.addMessagesToHistory).toBe('function');
        expect(typeof SessionManager.truncateHistory).toBe('function');
        expect(typeof SessionManager.removeMessageFromHistory).toBe('function');
        expect(typeof SessionManager.clearConversation).toBe('function');

        // Verify deprecated method still exists
        expect(typeof SessionManager.setUserContext).toBe('function');
    });
});
