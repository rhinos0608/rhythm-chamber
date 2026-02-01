/**
 * Recovery Orchestration Tests
 *
 * Tests for core recovery orchestration logic extracted from
 * error-recovery-coordinator.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RecoveryDomain,
  RecoveryPriority,
  RecoveryState,
} from '../../../../js/services/error-recovery-coordinator.js';
import { RecoveryOrchestration } from '../../../../js/services/error-recovery/recovery-orchestration.js';

describe('RecoveryOrchestration', () => {
  let orchestration;
  let mockEventBus;
  let mockStrategies;
  let mockLockManager;

  beforeEach(() => {
    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(),
    };

    mockStrategies = {
      getHandlers: vi.fn(
        () =>
          new Map([
            [RecoveryDomain.SECURITY, [vi.fn()]],
            [RecoveryDomain.STORAGE, [vi.fn()]],
          ])
      ),
      getDependencyHandlerName: vi.fn(dep =>
        dep === 'operation_lock' ? 'acquireRecoveryLock' : null
      ),
    };

    mockLockManager = {
      acquireRecoveryLock: vi.fn(function () {
        return 'lock-id-123';
      }),
      validateRecoveryState: vi.fn(function () {}),
      coordinateRecoveryTabs: vi.fn(function () {}),
    };

    orchestration = new RecoveryOrchestration({
      eventBus: mockEventBus,
      strategies: mockStrategies,
      lockManager: mockLockManager,
      maxQueueDepth: 10,
      queueTimeoutMs: 30000,
    });
  });

  describe('Recovery Request Creation', () => {
    it('should create recovery request with all required fields', async () => {
      const errorData = {
        error: new Error('Test error'),
        context: { test: 'data' },
        dependencies: [],
      };

      const request = await orchestration.createRecoveryRequest(
        RecoveryDomain.SECURITY,
        RecoveryPriority.CRITICAL,
        errorData
      );

      expect(request).toMatchObject({
        id: expect.any(String),
        domain: RecoveryDomain.SECURITY,
        priority: RecoveryPriority.CRITICAL,
        error: errorData.error,
        context: errorData.context,
        dependencies: [],
        timestamp: expect.any(Number),
        tabId: expect.any(String),
        expiresAt: expect.any(Number),
        delegationAttempts: 0,
        maxDelegations: 3,
      });
    });

    it('should generate unique recovery IDs', async () => {
      const errorData = {
        error: new Error('Test error'),
        context: {},
        dependencies: [],
      };

      const request1 = await orchestration.createRecoveryRequest(
        RecoveryDomain.SECURITY,
        RecoveryPriority.HIGH,
        errorData
      );

      const request2 = await orchestration.createRecoveryRequest(
        RecoveryDomain.SECURITY,
        RecoveryPriority.HIGH,
        errorData
      );

      expect(request1.id).not.toBe(request2.id);
    });

    it('should set TTL expiration correctly', async () => {
      const errorData = {
        error: new Error('Test error'),
        context: {},
        dependencies: [],
      };

      const request = await orchestration.createRecoveryRequest(
        RecoveryDomain.STORAGE,
        RecoveryPriority.HIGH,
        errorData
      );

      const expectedExpiry = Date.now() + 60000; // 60 seconds
      expect(request.expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 1000);
      expect(request.expiresAt).toBeLessThanOrEqual(expectedExpiry + 1000);
    });

    it('should include dependencies from error data', async () => {
      const errorData = {
        error: new Error('Test error'),
        context: {},
        dependencies: ['operation_lock', 'state_validation'],
      };

      const request = await orchestration.createRecoveryRequest(
        RecoveryDomain.SECURITY,
        RecoveryPriority.CRITICAL,
        errorData
      );

      expect(request.dependencies).toEqual(['operation_lock', 'state_validation']);
    });
  });

  describe('Recovery Plan Creation', () => {
    it('should create recovery plan with domain handlers', async () => {
      const request = {
        id: 'recovery-123',
        domain: RecoveryDomain.SECURITY,
        priority: RecoveryPriority.CRITICAL,
        error: new Error('Test error'),
        context: {},
        dependencies: [],
      };

      const plan = await orchestration.createRecoveryPlan(request);

      expect(plan).toMatchObject({
        request: request,
        steps: expect.any(Array),
        estimatedDurationMs: expect.any(Number),
        requiresLock: expect.any(Boolean),
        lockName: expect.any(String),
      });
    });

    it('should include lock requirements for storage domain', async () => {
      const request = {
        id: 'recovery-123',
        domain: RecoveryDomain.STORAGE,
        priority: RecoveryPriority.HIGH,
        error: new Error('Storage error'),
        context: {},
        dependencies: [],
      };

      const plan = await orchestration.createRecoveryPlan(request);

      expect(plan.requiresLock).toBe(true);
      expect(plan.lockName).toBe('recovery_storage');
    });

    it('should include lock requirements for security domain', async () => {
      const request = {
        id: 'recovery-123',
        domain: RecoveryDomain.SECURITY,
        priority: RecoveryPriority.CRITICAL,
        error: new Error('Security error'),
        context: {},
        dependencies: [],
      };

      const plan = await orchestration.createRecoveryPlan(request);

      expect(plan.requiresLock).toBe(true);
      expect(plan.lockName).toBe('recovery_security');
    });

    it('should not require lock for UI domain', async () => {
      const request = {
        id: 'recovery-123',
        domain: RecoveryDomain.UI,
        priority: RecoveryPriority.MEDIUM,
        error: new Error('UI error'),
        context: {},
        dependencies: [],
      };

      const plan = await orchestration.createRecoveryPlan(request);

      expect(plan.requiresLock).toBe(false);
      expect(plan.lockName).toBeNull();
    });

    it('should estimate duration based on step count', async () => {
      // Mock getDependencyHandlerName to return actual handler names
      mockStrategies.getDependencyHandlerName.mockImplementation(dep => {
        if (dep === 'operation_lock') return 'acquireRecoveryLock';
        if (dep === 'state_validation') return 'validateRecoveryState';
        return null;
      });

      const request = {
        id: 'recovery-123',
        domain: RecoveryDomain.SECURITY,
        priority: RecoveryPriority.CRITICAL,
        error: new Error('Test error'),
        context: {},
        dependencies: ['operation_lock', 'state_validation'],
      };

      const plan = await orchestration.createRecoveryPlan(request);

      // 1 domain handler + 2 dependency handlers = 3 steps = 3000ms estimated
      expect(plan.estimatedDurationMs).toBe(3000);
    });
  });

  describe('Recovery Execution', () => {
    it('should execute recovery plan successfully', async () => {
      const mockHandler = vi.fn();
      mockStrategies.getHandlers.mockReturnValue(
        new Map([[RecoveryDomain.SECURITY, [mockHandler]]])
      );

      const request = {
        id: 'recovery-123',
        domain: RecoveryDomain.SECURITY,
        priority: RecoveryPriority.CRITICAL,
        error: new Error('Test error'),
        context: {},
        dependencies: [],
      };

      const plan = await orchestration.createRecoveryPlan(request);
      const result = await orchestration.executeRecoveryPlan(plan);

      expect(result.success).toBe(true);
      expect(result.action).toBe('recovery_completed');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeNull();
    });

    it('should acquire lock when required', async () => {
      const request = {
        id: 'recovery-123',
        domain: RecoveryDomain.STORAGE,
        priority: RecoveryPriority.HIGH,
        error: new Error('Storage error'),
        context: {},
        dependencies: [],
      };

      const plan = await orchestration.createRecoveryPlan(request);
      await orchestration.executeRecoveryPlan(plan);

      expect(mockLockManager.acquireRecoveryLock).toHaveBeenCalledWith('recovery_storage');
    });

    it('should execute all recovery steps', async () => {
      const mockHandler1 = vi.fn();
      const mockHandler2 = vi.fn();
      mockStrategies.getHandlers.mockReturnValue(
        new Map([[RecoveryDomain.SECURITY, [mockHandler1, mockHandler2]]])
      );

      const request = {
        id: 'recovery-123',
        domain: RecoveryDomain.SECURITY,
        priority: RecoveryPriority.CRITICAL,
        error: new Error('Test error'),
        context: {},
        dependencies: [],
      };

      const plan = await orchestration.createRecoveryPlan(request);
      await orchestration.executeRecoveryPlan(plan);

      expect(mockHandler1).toHaveBeenCalledWith(request);
      expect(mockHandler2).toHaveBeenCalledWith(request);
    });

    it('should handle step failures gracefully', async () => {
      const mockHandler1 = vi.fn();
      const mockHandler2 = vi.fn().mockRejectedValue(new Error('Step failed'));
      const mockHandler3 = vi.fn();
      mockStrategies.getHandlers.mockReturnValue(
        new Map([[RecoveryDomain.SECURITY, [mockHandler1, mockHandler2, mockHandler3]]])
      );

      const request = {
        id: 'recovery-123',
        domain: RecoveryDomain.SECURITY,
        priority: RecoveryPriority.CRITICAL,
        error: new Error('Test error'),
        context: {},
        dependencies: [],
      };

      const plan = await orchestration.createRecoveryPlan(request);
      const result = await orchestration.executeRecoveryPlan(plan);

      expect(mockHandler1).toHaveBeenCalled();
      expect(mockHandler2).toHaveBeenCalled();
      expect(mockHandler3).toHaveBeenCalled(); // Progressive recovery
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should update state during execution', async () => {
      const mockHandler = vi.fn();
      mockStrategies.getHandlers.mockReturnValue(
        new Map([[RecoveryDomain.SECURITY, [mockHandler]]])
      );

      const request = {
        id: 'recovery-123',
        domain: RecoveryDomain.SECURITY,
        priority: RecoveryPriority.CRITICAL,
        error: new Error('Test error'),
        context: {},
        dependencies: [],
      };

      const plan = await orchestration.createRecoveryPlan(request);

      expect(orchestration.getCurrentState()).toBe(RecoveryState.IDLE);

      const executionPromise = orchestration.executeRecoveryPlan(plan);
      expect(orchestration.getCurrentState()).toBe(RecoveryState.RECOVERING);

      await executionPromise;
      expect(orchestration.getCurrentState()).toBe(RecoveryState.IDLE);
    });
  });

  describe('Recovery Coordination', () => {
    it('should coordinate recovery with state management', async () => {
      const mockHandler = vi.fn();
      mockStrategies.getHandlers.mockReturnValue(
        new Map([[RecoveryDomain.SECURITY, [mockHandler]]])
      );

      const request = {
        id: 'recovery-123',
        domain: RecoveryDomain.SECURITY,
        priority: RecoveryPriority.CRITICAL,
        error: new Error('Test error'),
        context: {},
        dependencies: [],
      };

      const result = await orchestration.coordinateRecovery(request);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should reject expired recovery requests', async () => {
      const request = {
        id: 'recovery-123',
        domain: RecoveryDomain.SECURITY,
        priority: RecoveryPriority.CRITICAL,
        error: new Error('Test error'),
        context: {},
        dependencies: [],
        expiresAt: Date.now() - 1000, // Expired 1 second ago
      };

      const result = await orchestration.coordinateRecovery(request);

      expect(result.success).toBe(false);
      expect(result.action).toBe('expired');
      expect(result.metadata.reason).toBe('ttl_expired');
    });

    it('should detect conflicting recoveries', () => {
      const request1 = {
        id: 'recovery-123',
        domain: RecoveryDomain.SECURITY,
        priority: RecoveryPriority.CRITICAL,
        error: new Error('Test error 1'),
        context: {},
        dependencies: [],
      };

      const request2 = {
        id: 'recovery-456',
        domain: RecoveryDomain.SECURITY,
        priority: RecoveryPriority.CRITICAL,
        error: new Error('Test error 2'),
        context: {},
        dependencies: [],
      };

      // Manually add first recovery to active set
      orchestration._activeRecoveries.set(request1.id, request1);

      // Check for conflict
      const hasConflict = orchestration._hasConflictingRecovery(request2);

      expect(hasConflict).toBe(true);
    });

    it('should track active recoveries', async () => {
      const mockHandler = vi
        .fn()
        .mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      mockStrategies.getHandlers.mockReturnValue(
        new Map([[RecoveryDomain.SECURITY, [mockHandler]]])
      );

      const request = {
        id: 'recovery-123',
        domain: RecoveryDomain.SECURITY,
        priority: RecoveryPriority.CRITICAL,
        error: new Error('Test error'),
        context: {},
        dependencies: [],
      };

      const executionPromise = orchestration.executeRecoveryPlan(
        await orchestration.createRecoveryPlan(request)
      );

      const activeRecoveries = orchestration.getActiveRecoveries();
      expect(activeRecoveries.size).toBe(1);

      await executionPromise;

      const finalRecoveries = orchestration.getActiveRecoveries();
      expect(finalRecoveries.size).toBe(0);
    });
  });

  describe('State Management', () => {
    it('should track current state', () => {
      expect(orchestration.getCurrentState()).toBe(RecoveryState.IDLE);
    });

    it('should emit state change events', async () => {
      const mockHandler = vi.fn();
      mockStrategies.getHandlers.mockReturnValue(
        new Map([[RecoveryDomain.SECURITY, [mockHandler]]])
      );

      const request = {
        id: 'recovery-123',
        domain: RecoveryDomain.SECURITY,
        priority: RecoveryPriority.CRITICAL,
        error: new Error('Test error'),
        context: {},
        dependencies: [],
      };

      await orchestration.coordinateRecovery(request);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'RECOVERY:STATE_CHANGE',
        expect.objectContaining({
          state: expect.any(String),
          recoveryId: expect.any(String),
        })
      );
    });
  });

  describe('Queue Management', () => {
    it('should enforce max queue depth', async () => {
      orchestration = new RecoveryOrchestration({
        eventBus: mockEventBus,
        strategies: mockStrategies,
        lockManager: mockLockManager,
        maxQueueDepth: 2,
        queueTimeoutMs: 30000,
      });

      // Fill queue
      for (let i = 0; i < 3; i++) {
        const request = {
          id: `recovery-${i}`,
          domain: RecoveryDomain.SECURITY,
          priority: RecoveryPriority.CRITICAL,
          error: new Error(`Test error ${i}`),
          context: {},
          dependencies: [],
        };

        await orchestration._queueRecovery(request);
      }

      // Oldest recovery should be dropped
      const activeRecoveries = orchestration.getActiveRecoveries();
      expect(activeRecoveries.size).toBeLessThanOrEqual(2);
    });

    it('should emit queued event', async () => {
      const request = {
        id: 'recovery-123',
        domain: RecoveryDomain.SECURITY,
        priority: RecoveryPriority.CRITICAL,
        error: new Error('Test error'),
        context: {},
        dependencies: [],
      };

      await orchestration._queueRecovery(request);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'RECOVERY:QUEUED',
        expect.objectContaining({
          request: request,
        })
      );
    });
  });

  describe('Cancellation', () => {
    it('should cancel active recovery', async () => {
      const mockHandler = vi
        .fn()
        .mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      mockStrategies.getHandlers.mockReturnValue(
        new Map([[RecoveryDomain.SECURITY, [mockHandler]]])
      );

      const request = {
        id: 'recovery-123',
        domain: RecoveryDomain.SECURITY,
        priority: RecoveryPriority.CRITICAL,
        error: new Error('Test error'),
        context: {},
        dependencies: [],
      };

      orchestration.executeRecoveryPlan(await orchestration.createRecoveryPlan(request));

      const cancelled = orchestration.cancelRecovery('recovery-123');

      expect(cancelled).toBe(true);
      expect(mockEventBus.emit).toHaveBeenCalledWith('RECOVERY:CANCELLED', {
        recoveryId: 'recovery-123',
      });
    });

    it('should return false when cancelling non-existent recovery', () => {
      const cancelled = orchestration.cancelRecovery('non-existent');
      expect(cancelled).toBe(false);
    });
  });
});
