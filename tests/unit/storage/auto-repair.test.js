/**
 * Auto-Repair Service Tests
 *
 * Tests for the placeholder auto-repair service.
 * The service is currently a no-op - storage consistency is handled
 * preventively via WAL, transactions, and migrations.
 *
 * @module tests/unit/storage/auto-repair
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AutoRepairService } from '../../../js/storage/auto-repair.js';

describe('AutoRepairService', () => {
  let service;
  let mockEventBus;
  let consoleSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(),
    };

    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('Constructor and Configuration', () => {
    it('should create service with default configuration', () => {
      service = new AutoRepairService(mockEventBus, null);

      const config = service.getAutoRepairConfig();
      expect(config).toMatchObject({
        enabled: true,
        maxAttempts: 3,
        repairOrphans: true,
        rebuildIndexes: true,
        recalcMetadata: true,
        attemptRecovery: true,
        backupBeforeRepair: true,
      });
    });

    it('should merge custom configuration with defaults', () => {
      service = new AutoRepairService(mockEventBus, null, {
        enabled: false,
        maxAttempts: 5,
        repairOrphans: false,
      });

      const config = service.getAutoRepairConfig();
      expect(config.enabled).toBe(false);
      expect(config.maxAttempts).toBe(5);
      expect(config.repairOrphans).toBe(false);
      expect(config.rebuildIndexes).toBe(true); // Default preserved
    });

    it('should initialize with empty repair log', () => {
      service = new AutoRepairService(mockEventBus, null);

      expect(service.getRepairLog()).toEqual([]);
    });

    it('should store eventBus reference', () => {
      service = new AutoRepairService(mockEventBus, null);

      expect(service.eventBus).toBe(mockEventBus);
    });
  });

  describe('Configuration Management', () => {
    beforeEach(() => {
      service = new AutoRepairService(mockEventBus, null);
    });

    it('should return copy of configuration', () => {
      const config1 = service.getAutoRepairConfig();
      const config2 = service.getAutoRepairConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });

    it('should update configuration with setAutoRepairConfig', () => {
      service.setAutoRepairConfig({ maxAttempts: 10 });

      expect(service.getAutoRepairConfig().maxAttempts).toBe(10);
    });

    it('should emit config change event when updating', () => {
      service.setAutoRepairConfig({ enabled: false });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'storage:autorepair_config_changed',
        expect.objectContaining({
          config: expect.objectContaining({ enabled: false }),
        })
      );
    });

    it('should log config update', () => {
      service.setAutoRepairConfig({ repairOrphans: false });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[AutoRepair] Config updated:',
        expect.any(Object)
      );
    });

    it('should merge multiple config updates', () => {
      service.setAutoRepairConfig({ maxAttempts: 5 });
      service.setAutoRepairConfig({ rebuildIndexes: false });

      const config = service.getAutoRepairConfig();
      expect(config.maxAttempts).toBe(5);
      expect(config.rebuildIndexes).toBe(false);
      expect(config.enabled).toBe(true); // Still default
    });
  });

  describe('detectAndRepairIssues - Placeholder Implementation', () => {
    beforeEach(() => {
      service = new AutoRepairService(mockEventBus, null);
    });

    it('should return empty array when disabled', async () => {
      service.setAutoRepairConfig({ enabled: false });

      const result = await service.detectAndRepairIssues();

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith('[AutoRepair] Disabled, skipping');
    });

    it('should log start of detection', async () => {
      await service.detectAndRepairIssues();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[AutoRepair] Starting detection and repair (placeholder - no repairs implemented)'
      );
    });

    it('should return empty array (placeholder - no repairs)', async () => {
      const result = await service.detectAndRepairIssues();

      expect(result).toEqual([]);
    });

    it('should emit completion event with zero repairs', async () => {
      await service.detectAndRepairIssues();

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'storage:autorepair_complete',
        expect.objectContaining({
          repairCount: 0,
          duration: expect.any(Number),
        })
      );
    });

    it('should log completion with zero repairs', async () => {
      await service.detectAndRepairIssues();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[AutoRepair\] Complete: 0 repairs in \d+ms/)
      );
    });
  });

  describe('Repair Log Management', () => {
    beforeEach(() => {
      service = new AutoRepairService(mockEventBus, null);
    });

    it('should return empty array for new service', () => {
      expect(service.getRepairLog()).toEqual([]);
    });

    it('should return copy of repair log', () => {
      service._logRepair('test-action', { detail: 'test' });

      const log1 = service.getRepairLog();
      const log2 = service.getRepairLog();

      expect(log1).not.toBe(log2);
      expect(log1).toEqual(log2);
    });

    it('should clear repair log', () => {
      service._logRepair('action1', {});
      service._logRepair('action2', {});

      expect(service.getRepairLog()).toHaveLength(2);

      service.clearRepairLog();

      expect(service.getRepairLog()).toEqual([]);
    });

    it('should add entry to repair log with _logRepair', () => {
      const beforeTime = Date.now();
      service._logRepair('repair-orphan', { orphanId: '123' });
      const afterTime = Date.now();

      const log = service.getRepairLog();
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({
        timestamp: expect.any(Number),
        action: 'repair-orphan',
        details: { orphanId: '123' },
      });
      expect(log[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(log[0].timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should emit log event when logging repair', () => {
      service._logRepair('test-action', { key: 'value' });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'storage:autorepair_log',
        expect.objectContaining({
          timestamp: expect.any(Number),
          action: 'test-action',
          details: { key: 'value' },
        })
      );
    });

    it('should maintain multiple log entries in order', () => {
      service._logRepair('action1', { seq: 1 });
      service._logRepair('action2', { seq: 2 });
      service._logRepair('action3', { seq: 3 });

      const log = service.getRepairLog();
      expect(log).toHaveLength(3);
      expect(log[0].action).toBe('action1');
      expect(log[1].action).toBe('action2');
      expect(log[2].action).toBe('action3');
    });
  });

  describe('Configuration Edge Cases', () => {
    beforeEach(() => {
      service = new AutoRepairService(mockEventBus, null);
    });

    it('should handle all repair config options disabled', async () => {
      service.setAutoRepairConfig({
        enabled: true,
        repairOrphans: false,
        rebuildIndexes: false,
        recalcMetadata: false,
        attemptRecovery: false,
      });

      // Service still runs but performs no repairs (placeholder behavior)
      const result = await service.detectAndRepairIssues();
      expect(result).toEqual([]);
    });

    it('should handle config with zero maxAttempts', () => {
      service.setAutoRepairConfig({ maxAttempts: 0 });

      expect(service.getAutoRepairConfig().maxAttempts).toBe(0);
    });

    it('should handle config with negative maxAttempts', () => {
      service.setAutoRepairConfig({ maxAttempts: -1 });

      expect(service.getAutoRepairConfig().maxAttempts).toBe(-1);
    });

    it('should handle config with very large maxAttempts', () => {
      service.setAutoRepairConfig({ maxAttempts: 999999 });

      expect(service.getAutoRepairConfig().maxAttempts).toBe(999999);
    });
  });

  describe('Event Bus Integration', () => {
    beforeEach(() => {
      service = new AutoRepairService(mockEventBus, null);
    });

    it('should emit completion event during repair', async () => {
      await service.detectAndRepairIssues();

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'storage:autorepair_complete',
        expect.any(Object)
      );
    });

    it('should emit config change event', () => {
      service.setAutoRepairConfig({ enabled: false });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'storage:autorepair_config_changed',
        expect.any(Object)
      );
    });

    it('should emit log events', () => {
      service._logRepair('test', {});

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'storage:autorepair_log',
        expect.any(Object)
      );
    });
  });

  describe('Concurrent Repair Operations', () => {
    beforeEach(() => {
      service = new AutoRepairService(mockEventBus, null);
    });

    it('should handle multiple sequential calls', async () => {
      const result1 = await service.detectAndRepairIssues();
      const result2 = await service.detectAndRepairIssues();
      const result3 = await service.detectAndRepairIssues();

      expect(Array.isArray(result1)).toBe(true);
      expect(Array.isArray(result2)).toBe(true);
      expect(Array.isArray(result3)).toBe(true);
      expect(result1).toEqual([]);
      expect(result2).toEqual([]);
      expect(result3).toEqual([]);
    });

    it('should maintain separate repair logs across instances', () => {
      const service2 = new AutoRepairService(mockEventBus, null);

      service._logRepair('action1', {});
      service2._logRepair('action2', {});

      expect(service.getRepairLog()).toHaveLength(1);
      expect(service.getRepairLog()[0].action).toBe('action1');

      expect(service2.getRepairLog()).toHaveLength(1);
      expect(service2.getRepairLog()[0].action).toBe('action2');
    });
  });

  describe('Repair Log Persistence', () => {
    beforeEach(() => {
      service = new AutoRepairService(mockEventBus, null);
    });

    it('should preserve log across multiple operations', async () => {
      service._logRepair('before', {});

      await service.detectAndRepairIssues();

      service._logRepair('after', {});

      const log = service.getRepairLog();
      expect(log).toHaveLength(2);
      expect(log[0].action).toBe('before');
      expect(log[1].action).toBe('after');
    });

    it('should clear log independently of repairs', () => {
      service._logRepair('entry1', {});
      service._logRepair('entry2', {});

      service.clearRepairLog();

      expect(service.getRepairLog()).toEqual([]);
    });

    it('should handle clearing empty log', () => {
      expect(() => service.clearRepairLog()).not.toThrow();
      expect(service.getRepairLog()).toEqual([]);
    });
  });
});
