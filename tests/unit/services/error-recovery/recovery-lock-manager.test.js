/**
 * Recovery Lock Manager Tests
 *
 * Tests for lock management and cross-tab coordination logic extracted from
 * error-recovery-coordinator.js
 *
 * TDD Approach: Tests written BEFORE implementation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RecoveryDomain, RecoveryPriority } from '../../../../js/services/error-recovery-coordinator.js';
import { RecoveryLockManager } from '../../../../js/services/error-recovery/recovery-lock-manager.js';

describe('RecoveryLockManager', () => {
    let lockManager;
    let mockEventBus;
    let mockOperationLock;
    let mockTabCoordinator;
    let mockStateMachine;

    beforeEach(() => {
        mockEventBus = {
            emit: vi.fn(),
            on: vi.fn()
        };

        mockOperationLock = {
            acquire: vi.fn(() => 'lock-id-123'),
            release: vi.fn()
        };

        mockTabCoordinator = {
            isPrimary: vi.fn(() => true),
            getTabId: vi.fn(() => 'tab-1'),
            getVectorClock: vi.fn(() => ({ tab1: 1 })),
            getVectorClockState: vi.fn(() => ({ tab1: 1 })),
            on: vi.fn()
        };

        mockStateMachine = {
            getCurrentState: vi.fn(() => 'idle')
        };

        lockManager = new RecoveryLockManager({
            eventBus: mockEventBus,
            operationLock: mockOperationLock,
            tabCoordinator: mockTabCoordinator,
            stateMachine: mockStateMachine
        });
    });

    afterEach(() => {
        // Clean up BroadcastChannel if created
        if (lockManager._recoveryChannel) {
            lockManager._recoveryChannel.close();
        }
    });

    describe('Lock Acquisition', () => {
        it('should acquire recovery lock successfully', async () => {
            const lockId = await lockManager.acquireRecoveryLock('recovery_storage');

            expect(lockId).toBe('lock-id-123');
            expect(mockOperationLock.acquire).toHaveBeenCalledWith('recovery_storage');
        });

        it('should return null when OperationLock unavailable', async () => {
            lockManager = new RecoveryLockManager({
                eventBus: mockEventBus,
                operationLock: null,
                tabCoordinator: mockTabCoordinator,
                stateMachine: mockStateMachine
            });

            const lockId = await lockManager.acquireRecoveryLock('recovery_storage');

            expect(lockId).toBeNull();
        });

        it('should throw error when lock acquisition fails', async () => {
            mockOperationLock.acquire.mockRejectedValue(new Error('Lock conflict'));

            await expect(lockManager.acquireRecoveryLock('recovery_security'))
                .rejects.toThrow('Cannot acquire recovery lock: recovery_security');
        });

        it('should warn when lock acquisition fails', async () => {
            const consoleSpy = vi.spyOn(console, 'warn');
            mockOperationLock.acquire.mockRejectedValue(new Error('Lock timeout'));

            await expect(lockManager.acquireRecoveryLock('recovery_storage'))
                .rejects.toThrow();

            expect(consoleSpy).toHaveBeenCalledWith(
                '[RecoveryLockManager] Failed to acquire lock:',
                expect.any(Error)
            );
            consoleSpy.mockRestore();
        });

        it('should return null and warn when OperationLock unavailable', async () => {
            const consoleSpy = vi.spyOn(console, 'warn');
            lockManager = new RecoveryLockManager({
                eventBus: mockEventBus,
                operationLock: null,
                tabCoordinator: mockTabCoordinator,
                stateMachine: mockStateMachine
            });

            const lockId = await lockManager.acquireRecoveryLock('recovery_storage');

            expect(lockId).toBeNull();
            expect(consoleSpy).toHaveBeenCalledWith(
                '[RecoveryLockManager] OperationLock unavailable, skipping lock'
            );
            consoleSpy.mockRestore();
        });
    });

    describe('State Validation', () => {
        it('should validate recovery state successfully', async () => {
            const request = {
                id: 'recovery-123',
                domain: RecoveryDomain.STORAGE,
                priority: RecoveryPriority.HIGH,
                error: new Error('Test error')
            };

            await expect(lockManager.validateRecoveryState(request)).resolves.not.toThrow();
            expect(mockStateMachine.getCurrentState).toHaveBeenCalled();
        });

        it('should allow recovery in idle state', async () => {
            mockStateMachine.getCurrentState.mockReturnValue('idle');

            const request = {
                id: 'recovery-123',
                domain: RecoveryDomain.STORAGE,
                priority: RecoveryPriority.HIGH,
                error: new Error('Test error')
            };

            await expect(lockManager.validateRecoveryState(request)).resolves.not.toThrow();
        });

        it('should allow recovery in error state', async () => {
            mockStateMachine.getCurrentState.mockReturnValue('error');

            const request = {
                id: 'recovery-123',
                domain: RecoveryDomain.STORAGE,
                priority: RecoveryPriority.HIGH,
                error: new Error('Test error')
            };

            await expect(lockManager.validateRecoveryState(request)).resolves.not.toThrow();
        });

        it('should allow recovery in demo state', async () => {
            mockStateMachine.getCurrentState.mockReturnValue('demo');

            const request = {
                id: 'recovery-123',
                domain: RecoveryDomain.STORAGE,
                priority: RecoveryPriority.HIGH,
                error: new Error('Test error')
            };

            await expect(lockManager.validateRecoveryState(request)).resolves.not.toThrow();
        });

        it('should reject recovery in disallowed state', async () => {
            mockStateMachine.getCurrentState.mockReturnValue('recording');

            const request = {
                id: 'recovery-123',
                domain: RecoveryDomain.STORAGE,
                priority: RecoveryPriority.HIGH,
                error: new Error('Test error')
            };

            await expect(lockManager.validateRecoveryState(request))
                .rejects.toThrow('Recovery not allowed in state: recording');
        });

        it('should skip validation when StateMachine unavailable', async () => {
            lockManager = new RecoveryLockManager({
                eventBus: mockEventBus,
                operationLock: mockOperationLock,
                tabCoordinator: mockTabCoordinator,
                stateMachine: null
            });

            const consoleSpy = vi.spyOn(console, 'warn');
            const request = {
                id: 'recovery-123',
                domain: RecoveryDomain.STORAGE,
                priority: RecoveryPriority.HIGH,
                error: new Error('Test error')
            };

            await expect(lockManager.validateRecoveryState(request)).resolves.not.toThrow();
            expect(consoleSpy).toHaveBeenCalledWith(
                '[RecoveryLockManager] StateMachine unavailable, skipping state validation'
            );
            consoleSpy.mockRestore();
        });

        it('should warn when StateMachine unavailable', async () => {
            lockManager = new RecoveryLockManager({
                eventBus: mockEventBus,
                operationLock: mockOperationLock,
                tabCoordinator: mockTabCoordinator,
                stateMachine: null
            });

            const consoleSpy = vi.spyOn(console, 'warn');
            const request = {
                id: 'recovery-123',
                domain: RecoveryDomain.STORAGE,
                priority: RecoveryPriority.HIGH,
                error: new Error('Test error')
            };

            await lockManager.validateRecoveryState(request);

            expect(consoleSpy).toHaveBeenCalledWith(
                '[RecoveryLockManager] StateMachine unavailable, skipping state validation'
            );
            consoleSpy.mockRestore();
        });
    });

    describe('Tab Coordination', () => {
        it('should emit recovery started event', async () => {
            const request = {
                id: 'recovery-123',
                domain: RecoveryDomain.STORAGE,
                priority: RecoveryPriority.HIGH,
                error: new Error('Test error'),
                tabId: 'tab-1'
            };

            await lockManager.coordinateRecoveryTabs(request);

            expect(mockEventBus.emit).toHaveBeenCalledWith(
                'RECOVERY:STARTED',
                {
                    recoveryId: 'recovery-123',
                    tabId: 'tab-1',
                    domain: RecoveryDomain.STORAGE
                }
            );
        });

        it('should coordinate recovery across tabs', async () => {
            const request = {
                id: 'recovery-456',
                domain: RecoveryDomain.SECURITY,
                priority: RecoveryPriority.CRITICAL,
                error: new Error('Security error'),
                tabId: 'tab-2'
            };

            await lockManager.coordinateRecoveryTabs(request);

            expect(mockEventBus.emit).toHaveBeenCalledWith(
                'RECOVERY:STARTED',
                {
                    recoveryId: 'recovery-456',
                    tabId: 'tab-2',
                    domain: RecoveryDomain.SECURITY
                }
            );
        });
    });

    describe('Broadcast Recovery Request', () => {
        it('should not delegate when primary tab', async () => {
            mockTabCoordinator.isPrimary.mockReturnValue(true);

            const request = {
                id: 'recovery-123',
                domain: RecoveryDomain.STORAGE,
                priority: RecoveryPriority.HIGH,
                error: new Error('Test error'),
                timestamp: Date.now(),
                expiresAt: Date.now() + 60000,
                delegationAttempts: 0,
                maxDelegations: 3
            };

            const result = await lockManager.broadcastRecoveryRequest(request);

            expect(result.delegated).toBe(false);
            expect(result.reason).toBe('is_leader');
        });

        it('should not delegate when TabCoordinator unavailable', async () => {
            lockManager = new RecoveryLockManager({
                eventBus: mockEventBus,
                operationLock: mockOperationLock,
                tabCoordinator: null,
                stateMachine: mockStateMachine
            });

            const request = {
                id: 'recovery-123',
                domain: RecoveryDomain.STORAGE,
                priority: RecoveryPriority.HIGH,
                error: new Error('Test error'),
                timestamp: Date.now(),
                expiresAt: Date.now() + 60000,
                delegationAttempts: 0,
                maxDelegations: 3
            };

            const result = await lockManager.broadcastRecoveryRequest(request);

            expect(result.delegated).toBe(false);
            expect(result.reason).toBe('is_leader');
        });

        it('should delegate to leader when not primary', async () => {
            mockTabCoordinator.isPrimary.mockReturnValue(false);

            const request = {
                id: 'recovery-123',
                domain: RecoveryDomain.STORAGE,
                priority: RecoveryPriority.HIGH,
                error: new Error('Test error'),
                timestamp: Date.now(),
                expiresAt: Date.now() + 60000,
                delegationAttempts: 0,
                maxDelegations: 3
            };

            // Mock BroadcastChannel properly
            class MockBroadcastChannel {
                constructor(name) {
                    this.name = name;
                    this.messages = [];
                }
                postMessage(msg) {
                    this.messages.push(msg);
                }
                close() {}
            }

            global.BroadcastChannel = MockBroadcastChannel;

            const result = await lockManager.broadcastRecoveryRequest(request);

            expect(result.delegated).toBe(true);
            expect(result.reason).toBe('delegated_to_leader');

            delete global.BroadcastChannel;
        });

        it('should increment delegation attempts', async () => {
            mockTabCoordinator.isPrimary.mockReturnValue(false);

            const request = {
                id: 'recovery-123',
                domain: RecoveryDomain.STORAGE,
                priority: RecoveryPriority.HIGH,
                error: new Error('Test error'),
                timestamp: Date.now(),
                expiresAt: Date.now() + 60000,
                delegationAttempts: 1,
                maxDelegations: 3
            };

            class MockBroadcastChannel {
                constructor(name) {}
                postMessage(msg) {}
                close() {}
            }

            global.BroadcastChannel = MockBroadcastChannel;

            await lockManager.broadcastRecoveryRequest(request);

            expect(request.delegationAttempts).toBe(2);

            delete global.BroadcastChannel;
        });

        it('should stop delegating when max attempts reached', async () => {
            mockTabCoordinator.isPrimary.mockReturnValue(false);

            const request = {
                id: 'recovery-123',
                domain: RecoveryDomain.STORAGE,
                priority: RecoveryPriority.HIGH,
                error: new Error('Test error'),
                timestamp: Date.now(),
                expiresAt: Date.now() + 60000,
                delegationAttempts: 3,
                maxDelegations: 3
            };

            const result = await lockManager.broadcastRecoveryRequest(request);

            expect(result.delegated).toBe(false);
            expect(result.reason).toBe('max_delegations_reached');
            expect(mockEventBus.emit).toHaveBeenCalledWith(
                'RECOVERY:DELEGATION_EXHAUSTED',
                {
                    recoveryId: 'recovery-123',
                    attempts: 3
                }
            );
        });

        it('should emit delegation exhausted event', async () => {
            mockTabCoordinator.isPrimary.mockReturnValue(false);

            const request = {
                id: 'recovery-123',
                domain: RecoveryDomain.STORAGE,
                priority: RecoveryPriority.HIGH,
                error: new Error('Test error'),
                timestamp: Date.now(),
                expiresAt: Date.now() + 60000,
                delegationAttempts: 3,
                maxDelegations: 3
            };

            await lockManager.broadcastRecoveryRequest(request);

            expect(mockEventBus.emit).toHaveBeenCalledWith(
                'RECOVERY:DELEGATION_EXHAUSTED',
                {
                    recoveryId: 'recovery-123',
                    attempts: 3
                }
            );
        });

        it('should include vector clock in delegation message', async () => {
            mockTabCoordinator.isPrimary.mockReturnValue(false);
            mockTabCoordinator.getVectorClockState.mockReturnValue({ tab1: 5, tab2: 3 });

            const request = {
                id: 'recovery-123',
                domain: RecoveryDomain.STORAGE,
                priority: RecoveryPriority.HIGH,
                error: new Error('Test error'),
                timestamp: Date.now(),
                expiresAt: Date.now() + 60000,
                delegationAttempts: 0,
                maxDelegations: 3
            };

            let capturedMessage = null;
            class MockBroadcastChannel {
                constructor(name) {}
                postMessage(msg) {
                    capturedMessage = msg;
                }
                close() {}
            }

            global.BroadcastChannel = MockBroadcastChannel;

            await lockManager.broadcastRecoveryRequest(request);

            expect(capturedMessage.vectorClock).toEqual({ tab1: 5, tab2: 3 });

            delete global.BroadcastChannel;
        });

        it('should emit recovery delegated event', async () => {
            mockTabCoordinator.isPrimary.mockReturnValue(false);

            const request = {
                id: 'recovery-123',
                domain: RecoveryDomain.STORAGE,
                priority: RecoveryPriority.HIGH,
                error: new Error('Test error'),
                timestamp: Date.now(),
                expiresAt: Date.now() + 60000,
                delegationAttempts: 0,
                maxDelegations: 3
            };

            class MockBroadcastChannel {
                constructor(name) {}
                postMessage(msg) {}
                close() {}
            }

            global.BroadcastChannel = MockBroadcastChannel;

            await lockManager.broadcastRecoveryRequest(request);

            expect(mockEventBus.emit).toHaveBeenCalledWith(
                'RECOVERY:DELEGATED',
                {
                    recoveryId: 'recovery-123',
                    sourceTabId: 'tab-1',
                    delegationAttempt: 1
                }
            );

            delete global.BroadcastChannel;
        });

        it('should handle broadcast failure gracefully', async () => {
            mockTabCoordinator.isPrimary.mockReturnValue(false);

            const request = {
                id: 'recovery-123',
                domain: RecoveryDomain.STORAGE,
                priority: RecoveryPriority.HIGH,
                error: new Error('Test error'),
                timestamp: Date.now(),
                expiresAt: Date.now() + 60000,
                delegationAttempts: 0,
                maxDelegations: 3
            };

            // BroadcastChannel will throw
            global.BroadcastChannel = vi.fn(() => {
                throw new Error('BroadcastChannel not supported');
            });

            const consoleSpy = vi.spyOn(console, 'warn');
            const result = await lockManager.broadcastRecoveryRequest(request);

            expect(result.delegated).toBe(false);
            expect(result.reason).toBe('broadcast_failed');
            expect(consoleSpy).toHaveBeenCalledWith(
                '[RecoveryLockManager] Failed to broadcast recovery:',
                expect.any(Error)
            );

            delete global.BroadcastChannel;
            consoleSpy.mockRestore();
        });
    });

    describe('Handle Delegated Recovery', () => {
        it('should process delegated recovery as leader', async () => {
            mockTabCoordinator.isPrimary.mockReturnValue(true);
            mockTabCoordinator.getVectorClock.mockReturnValue({ merge: vi.fn() });

            const message = {
                type: 'RECOVERY_DELEGATION',
                request: {
                    id: 'recovery-123',
                    domain: 'storage',
                    priority: 75,
                    error: 'Test error',
                    context: {},
                    timestamp: Date.now(),
                    expiresAt: Date.now() + 60000,
                    delegationAttempts: 1,
                    maxDelegations: 3
                },
                vectorClock: { tab2: 2 },
                sourceTabId: 'tab-2',
                delegatedAt: Date.now()
            };

            const consoleSpy = vi.spyOn(console, 'log');

            await lockManager.handleDelegatedRecovery(message);

            expect(consoleSpy).toHaveBeenCalledWith(
                '[RecoveryLockManager] Processing delegated recovery from tab tab-2'
            );
            consoleSpy.mockRestore();
        });

        it('should ignore delegated recovery when not leader', async () => {
            mockTabCoordinator.isPrimary.mockReturnValue(false);

            const message = {
                type: 'RECOVERY_DELEGATION',
                request: {
                    id: 'recovery-123',
                    domain: 'storage',
                    priority: 75,
                    error: 'Test error'
                },
                sourceTabId: 'tab-2'
            };

            const consoleSpy = vi.spyOn(console, 'log');

            await lockManager.handleDelegatedRecovery(message);

            expect(consoleSpy).toHaveBeenCalledWith(
                '[RecoveryLockManager] Ignoring delegated recovery - not leader'
            );
            consoleSpy.mockRestore();
        });

        it('should ignore when TabCoordinator unavailable', async () => {
            lockManager = new RecoveryLockManager({
                eventBus: mockEventBus,
                operationLock: mockOperationLock,
                tabCoordinator: null,
                stateMachine: mockStateMachine
            });

            const message = {
                type: 'RECOVERY_DELEGATION',
                request: {
                    id: 'recovery-123',
                    domain: 'storage',
                    priority: 75,
                    error: 'Test error'
                },
                sourceTabId: 'tab-2'
            };

            // Should not throw
            await expect(lockManager.handleDelegatedRecovery(message)).resolves.not.toThrow();
        });

        it('should merge vector clock when provided', async () => {
            mockTabCoordinator.isPrimary.mockReturnValue(true);
            const mergeSpy = vi.fn();
            mockTabCoordinator.getVectorClock.mockReturnValue({ merge: mergeSpy });

            const message = {
                type: 'RECOVERY_DELEGATION',
                request: {
                    id: 'recovery-123',
                    domain: 'storage',
                    priority: 75,
                    error: 'Test error',
                    context: {},
                    timestamp: Date.now(),
                    expiresAt: Date.now() + 60000,
                    delegationAttempts: 1,
                    maxDelegations: 3
                },
                vectorClock: { tab2: 5, tab3: 2 },
                sourceTabId: 'tab-2',
                delegatedAt: Date.now()
            };

            await lockManager.handleDelegatedRecovery(message);

            expect(mergeSpy).toHaveBeenCalledWith({ tab2: 5, tab3: 2 });
        });

        it('should reconstruct error from message', async () => {
            mockTabCoordinator.isPrimary.mockReturnValue(true);
            mockTabCoordinator.getVectorClock.mockReturnValue({ merge: vi.fn() });

            const message = {
                type: 'RECOVERY_DELEGATION',
                request: {
                    id: 'recovery-123',
                    domain: 'storage',
                    priority: 75,
                    error: 'Test error message',
                    context: { test: 'data' },
                    timestamp: Date.now(),
                    expiresAt: Date.now() + 60000,
                    delegationAttempts: 1,
                    maxDelegations: 3
                },
                vectorClock: {},
                sourceTabId: 'tab-2',
                delegatedAt: Date.now()
            };

            // Capture the emitted event
            let capturedRequest = null;
            mockEventBus.emit.mockImplementation((event, data) => {
                if (event === 'RECOVERY:DELEGATED_REQUEST') {
                    capturedRequest = data.request;
                }
            });

            await lockManager.handleDelegatedRecovery(message);

            // Should reconstruct error object
            expect(capturedRequest).toBeTruthy();
            expect(capturedRequest.error).toBeInstanceOf(Error);
            expect(capturedRequest.error.message).toBe('Test error message');
        });

        it('should set source tab ID on reconstructed request', async () => {
            mockTabCoordinator.isPrimary.mockReturnValue(true);
            mockTabCoordinator.getVectorClock.mockReturnValue({ merge: vi.fn() });

            const message = {
                type: 'RECOVERY_DELEGATION',
                request: {
                    id: 'recovery-123',
                    domain: 'storage',
                    priority: 75,
                    error: 'Test error',
                    context: {},
                    timestamp: Date.now(),
                    expiresAt: Date.now() + 60000,
                    delegationAttempts: 1,
                    maxDelegations: 3
                },
                vectorClock: {},
                sourceTabId: 'tab-2',
                delegatedAt: Date.now()
            };

            let capturedRequest = null;
            mockEventBus.emit.mockImplementation((event, data) => {
                if (event === 'RECOVERY:DELEGATED_REQUEST') {
                    capturedRequest = data.request;
                }
            });

            await lockManager.handleDelegatedRecovery(message);

            // The callback should receive the reconstructed request
            expect(capturedRequest.tabId).toBe('tab-2');
        });
    });

    describe('Tab Leadership Monitoring', () => {
        it('should initialize as primary tab when TabCoordinator says so', async () => {
            mockTabCoordinator.isPrimary.mockReturnValue(true);

            lockManager = new RecoveryLockManager({
                eventBus: mockEventBus,
                operationLock: mockOperationLock,
                tabCoordinator: mockTabCoordinator,
                stateMachine: mockStateMachine
            });

            await lockManager.monitorTabLeadership();

            expect(lockManager.isPrimaryTab()).toBe(true);
        });

        it('should default to primary when TabCoordinator unavailable', async () => {
            lockManager = new RecoveryLockManager({
                eventBus: mockEventBus,
                operationLock: mockOperationLock,
                tabCoordinator: null,
                stateMachine: mockStateMachine
            });

            await lockManager.monitorTabLeadership();

            expect(lockManager.isPrimaryTab()).toBe(true);
        });

        it('should subscribe to leadership changes', async () => {
            const leadershipCallback = vi.fn();
            mockTabCoordinator.on.mockImplementation((event, callback) => {
                if (event === 'leadership-change') {
                    leadershipCallback.mockImplementation(callback);
                }
            });

            lockManager = new RecoveryLockManager({
                eventBus: mockEventBus,
                operationLock: mockOperationLock,
                tabCoordinator: mockTabCoordinator,
                stateMachine: mockStateMachine
            });

            await lockManager.monitorTabLeadership();

            expect(mockTabCoordinator.on).toHaveBeenCalledWith(
                'leadership-change',
                expect.any(Function)
            );
        });

        it('should handle leadership subscription failure gracefully', async () => {
            const consoleSpy = vi.spyOn(console, 'warn');
            mockTabCoordinator.on.mockImplementation(() => {
                throw new Error('Subscription failed');
            });

            lockManager = new RecoveryLockManager({
                eventBus: mockEventBus,
                operationLock: mockOperationLock,
                tabCoordinator: mockTabCoordinator,
                stateMachine: mockStateMachine
            });

            await lockManager.monitorTabLeadership();

            expect(consoleSpy).toHaveBeenCalledWith(
                '[RecoveryLockManager] Failed to subscribe to leadership changes:',
                expect.any(Error)
            );
            consoleSpy.mockRestore();
        });

        it('should update leadership status on change', async () => {
            let currentLeadership = true;
            mockTabCoordinator.isPrimary.mockImplementation(() => currentLeadership);

            let leadershipChangeCallback = null;
            mockTabCoordinator.on.mockImplementation((event, callback) => {
                if (event === 'leadership-change') {
                    leadershipChangeCallback = callback;
                }
            });

            lockManager = new RecoveryLockManager({
                eventBus: mockEventBus,
                operationLock: mockOperationLock,
                tabCoordinator: mockTabCoordinator,
                stateMachine: mockStateMachine
            });

            await lockManager.monitorTabLeadership();
            expect(lockManager.isPrimaryTab()).toBe(true);

            // Simulate leadership change
            currentLeadership = false;
            if (leadershipChangeCallback) {
                await leadershipChangeCallback();
            }

            expect(lockManager.isPrimaryTab()).toBe(false);
        });
    });

    describe('Delegation Listener Setup', () => {
        it('should setup BroadcastChannel listener', () => {
            global.BroadcastChannel = vi.fn(() => ({
                onmessage: null,
                close: vi.fn()
            }));

            lockManager.setupDelegationListener();

            expect(lockManager._recoveryChannel).toBeDefined();
            expect(lockManager._recoveryChannel.onmessage).toBeInstanceOf(Function);

            delete global.BroadcastChannel;
        });

        it('should log when listener is active', () => {
            const consoleSpy = vi.spyOn(console, 'log');

            global.BroadcastChannel = vi.fn(() => ({
                onmessage: null,
                close: vi.fn()
            }));

            lockManager.setupDelegationListener();

            expect(consoleSpy).toHaveBeenCalledWith(
                '[RecoveryLockManager] Recovery delegation listener active'
            );

            delete global.BroadcastChannel;
            consoleSpy.mockRestore();
        });

        it('should skip when BroadcastChannel unavailable', () => {
            const consoleSpy = vi.spyOn(console, 'log');

            // Make BroadcastChannel undefined
            const originalBC = global.BroadcastChannel;
            delete global.BroadcastChannel;

            lockManager.setupDelegationListener();

            expect(consoleSpy).toHaveBeenCalledWith(
                '[RecoveryLockManager] BroadcastChannel not available, skipping delegation listener'
            );
            expect(lockManager._recoveryChannel).toBeUndefined();

            global.BroadcastChannel = originalBC;
            consoleSpy.mockRestore();
        });

        it('should handle setup failure gracefully', () => {
            const consoleSpy = vi.spyOn(console, 'warn');

            global.BroadcastChannel = vi.fn(() => {
                throw new Error('Setup failed');
            });

            lockManager.setupDelegationListener();

            expect(consoleSpy).toHaveBeenCalledWith(
                '[RecoveryLockManager] Failed to setup delegation listener:',
                expect.any(Error)
            );

            delete global.BroadcastChannel;
            consoleSpy.mockRestore();
        });

        it('should handle delegation messages', async () => {
            let messageHandler = null;
            global.BroadcastChannel = vi.fn(() => ({
                set onmessage(handler) {
                    messageHandler = handler;
                },
                close: vi.fn()
            }));

            mockTabCoordinator.isPrimary.mockReturnValue(true);
            mockTabCoordinator.getVectorClock.mockReturnValue({ merge: vi.fn() });

            lockManager.setupDelegationListener();

            const message = {
                type: 'RECOVERY_DELEGATION',
                request: {
                    id: 'recovery-123',
                    domain: 'storage',
                    priority: 75,
                    error: 'Test error',
                    context: {},
                    timestamp: Date.now(),
                    expiresAt: Date.now() + 60000,
                    delegationAttempts: 1,
                    maxDelegations: 3
                },
                vectorClock: {},
                sourceTabId: 'tab-2',
                delegatedAt: Date.now()
            };

            if (messageHandler) {
                await messageHandler({ data: message });
            }

            // Should process the message
            expect(mockTabCoordinator.isPrimary).toHaveBeenCalled();

            delete global.BroadcastChannel;
        });
    });

    describe('Primary Tab Status', () => {
        it('should return current primary tab status', () => {
            mockTabCoordinator.isPrimary.mockReturnValue(true);

            lockManager = new RecoveryLockManager({
                eventBus: mockEventBus,
                operationLock: mockOperationLock,
                tabCoordinator: mockTabCoordinator,
                stateMachine: mockStateMachine
            });

            expect(lockManager.isPrimaryTab()).toBe(true);
        });

        it('should return false when not primary', () => {
            mockTabCoordinator.isPrimary.mockReturnValue(false);

            lockManager = new RecoveryLockManager({
                eventBus: mockEventBus,
                operationLock: mockOperationLock,
                tabCoordinator: mockTabCoordinator,
                stateMachine: mockStateMachine
            });

            expect(lockManager.isPrimaryTab()).toBe(false);
        });
    });

    describe('Lock Release', () => {
        it('should release acquired lock', async () => {
            await lockManager.releaseRecoveryLock('recovery_storage', 'lock-id-123');

            expect(mockOperationLock.release).toHaveBeenCalledWith('recovery_storage', 'lock-id-123');
        });

        it('should handle release failure gracefully', async () => {
            const consoleSpy = vi.spyOn(console, 'warn');
            mockOperationLock.release.mockRejectedValue(new Error('Lock not found'));

            await expect(lockManager.releaseRecoveryLock('recovery_storage', 'lock-id-123'))
                .resolves.not.toThrow();

            expect(consoleSpy).toHaveBeenCalledWith(
                '[RecoveryLockManager] Failed to release lock:',
                expect.any(Error)
            );
            consoleSpy.mockRestore();
        });

        it('should skip release when OperationLock unavailable', async () => {
            lockManager = new RecoveryLockManager({
                eventBus: mockEventBus,
                operationLock: null,
                tabCoordinator: mockTabCoordinator,
                stateMachine: mockStateMachine
            });

            await expect(lockManager.releaseRecoveryLock('recovery_storage', 'lock-id-123'))
                .resolves.not.toThrow();
        });
    });
});
