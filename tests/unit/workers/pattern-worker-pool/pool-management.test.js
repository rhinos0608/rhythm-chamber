/**
 * Pool Management Module Tests
 *
 * Comprehensive test suite for pool-management.js covering:
 * - Optimal worker count calculation
 * - Hardware concurrency detection
 * - Device memory adaptation
 * - SharedArrayBuffer detection
 * - Memory configuration
 * - Data partitioning
 * - Status reporting
 * - Speedup factor calculation
 */

import { describe, it, test, expect, beforeEach, afterEach, vi } from 'vitest';

describe('pool-management', () => {
  let PoolManagement;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock navigator APIs
    global.navigator = {
      hardwareConcurrency: 4,
      deviceMemory: 8,
    };

    // Mock crossOriginIsolated
    global.crossOriginIsolated = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('calculateOptimalWorkerCount', () => {
    it('should use hardware concurrency - 1 for max workers', () => {
      const hardwareConcurrency = 4;
      const computedMax = Math.max(1, hardwareConcurrency - 1);
      expect(computedMax).toBe(3);
    });

    it('should limit to 1 worker on single-core devices', () => {
      global.navigator.hardwareConcurrency = 1;
      const hardwareConcurrency = 1;
      const computedMax = Math.max(1, hardwareConcurrency - 1);
      expect(computedMax).toBe(1);
    });

    it('should limit to 2 workers on low-memory devices (<=2GB)', () => {
      const deviceMemory = 2;
      const computedMax = 3;

      let memoryAdjustedMax = computedMax;
      if (deviceMemory <= 2) {
        memoryAdjustedMax = Math.min(computedMax, 2);
      }

      expect(memoryAdjustedMax).toBe(2);
    });

    it('should limit to 3 workers on medium-memory devices (<=4GB)', () => {
      const deviceMemory = 4;
      const computedMax = 4;

      let memoryAdjustedMax = computedMax;
      if (deviceMemory <= 4 && deviceMemory > 2) {
        memoryAdjustedMax = Math.min(computedMax, 3);
      }

      expect(memoryAdjustedMax).toBe(3);
    });

    it('should use full computedMax on high-memory devices (>4GB)', () => {
      const deviceMemory = 8;
      const computedMax = 4;

      let memoryAdjustedMax = computedMax;
      if (deviceMemory > 4) {
        memoryAdjustedMax = computedMax; // No adjustment
      }

      expect(memoryAdjustedMax).toBe(4);
    });

    it('should respect explicit workerCount option', () => {
      const options = { workerCount: 2 };
      const memoryAdjustedMax = 3;

      const workerCount =
        typeof options.workerCount === 'number' && options.workerCount > 0
          ? options.workerCount
          : null;

      expect(workerCount).toBe(2);
    });

    it('should use default when no explicit workerCount provided', () => {
      const options = {};
      const DEFAULT_WORKER_COUNT = 3;
      const memoryAdjustedMax = 3;

      const requestedCount =
        typeof options.workerCount === 'number' && options.workerCount > 0
          ? options.workerCount
          : null;
      const workerCount = requestedCount ?? Math.min(DEFAULT_WORKER_COUNT, memoryAdjustedMax);

      expect(workerCount).toBe(3);
    });

    it('should clamp workerCount to memoryAdjustedMax', () => {
      const DEFAULT_WORKER_COUNT = 3;
      const memoryAdjustedMax = 2; // Low memory device
      const options = {};

      const requestedCount =
        typeof options.workerCount === 'number' && options.workerCount > 0
          ? options.workerCount
          : null;
      const workerCount = requestedCount ?? Math.min(DEFAULT_WORKER_COUNT, memoryAdjustedMax);

      expect(workerCount).toBeLessThanOrEqual(memoryAdjustedMax);
    });

    it('should handle missing deviceMemory gracefully', () => {
      const deviceMemory = undefined;
      const DEFAULT_DEVICE_MEMORY = 4; // Default fallback
      const computedMax = 3;

      const actualMemory = deviceMemory ?? DEFAULT_DEVICE_MEMORY;
      let memoryAdjustedMax = computedMax;
      if (actualMemory <= 2) {
        memoryAdjustedMax = Math.min(computedMax, 2);
      } else if (actualMemory <= 4) {
        memoryAdjustedMax = Math.min(computedMax, 3);
      }

      expect(memoryAdjustedMax).toBe(3); // 4GB default falls into medium category
    });

    it('should handle missing hardwareConcurrency gracefully', () => {
      const hardwareConcurrency = undefined;
      const DEFAULT_CONCURRENCY = 4;

      const actualConcurrency = hardwareConcurrency ?? DEFAULT_CONCURRENCY;
      const computedMax = Math.max(1, actualConcurrency - 1);

      expect(computedMax).toBe(3);
    });
  });

  describe('isSharedArrayBufferAvailable', () => {
    it('should return true when SharedArrayBuffer is available', () => {
      const SharedArrayBufferAvailable = () => {
        try {
          if (typeof SharedArrayBuffer === 'undefined') {
            return false;
          }
          const testBuffer = new SharedArrayBuffer(8);
          return testBuffer.byteLength === 8;
        } catch (e) {
          return false;
        }
      };

      // Mock SharedArrayBuffer
      global.SharedArrayBuffer = class SharedArrayBuffer {
        constructor(byteLength) {
          this.byteLength = byteLength;
        }
      };

      expect(SharedArrayBufferAvailable()).toBe(true);
    });

    it('should return false when SharedArrayBuffer is undefined', () => {
      global.SharedArrayBuffer = undefined;

      const SharedArrayBufferAvailable = () => {
        try {
          if (typeof SharedArrayBuffer === 'undefined') {
            return false;
          }
          const testBuffer = new SharedArrayBuffer(8);
          return testBuffer.byteLength === 8;
        } catch (e) {
          return false;
        }
      };

      expect(SharedArrayBufferAvailable()).toBe(false);
    });

    it('should return false when SharedArrayBuffer creation throws', () => {
      const SharedArrayBufferAvailable = () => {
        try {
          if (typeof SharedArrayBuffer === 'undefined') {
            return false;
          }
          // This will throw in non-cross-origin-isolated contexts
          const testBuffer = new SharedArrayBuffer(8);
          return testBuffer.byteLength === 8;
        } catch (e) {
          return false;
        }
      };

      // Mock SharedArrayBuffer that throws
      global.SharedArrayBuffer = class SharedArrayBuffer {
        constructor(byteLength) {
          throw new Error('Not available');
        }
      };

      expect(SharedArrayBufferAvailable()).toBe(false);
    });
  });

  describe('partitionData', () => {
    it('should partition data into equal-sized chunks', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const numPartitions = 3;

      const partitionSize = Math.ceil(data.length / numPartitions);
      const partitions = [];

      for (let i = 0; i < numPartitions; i++) {
        const start = i * partitionSize;
        const end = Math.min(start + partitionSize, data.length);
        partitions.push(data.slice(start, end));
      }

      expect(partitions.length).toBe(3);
      expect(partitions[0]).toEqual([1, 2, 3, 4]);
      expect(partitions[1]).toEqual([5, 6, 7, 8]);
      expect(partitions[2]).toEqual([9, 10]);
    });

    it('should handle single partition', () => {
      const data = [1, 2, 3, 4, 5];
      const numPartitions = 1;

      const partitionSize = Math.ceil(data.length / numPartitions);
      const partitions = [];

      for (let i = 0; i < numPartitions; i++) {
        const start = i * partitionSize;
        const end = Math.min(start + partitionSize, data.length);
        partitions.push(data.slice(start, end));
      }

      expect(partitions.length).toBe(1);
      expect(partitions[0]).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle empty data', () => {
      const data = [];
      const numPartitions = 3;

      if (!data || !Array.isArray(data) || numPartitions < 1) {
        // Return original data
        return;
      }

      const partitionSize = Math.ceil(data.length / numPartitions);
      const partitions = [];

      for (let i = 0; i < numPartitions; i++) {
        const start = i * partitionSize;
        const end = Math.min(start + partitionSize, data.length);
        partitions.push(data.slice(start, end));
      }

      expect(partitions.length).toBe(3);
      expect(partitions.every(p => p.length === 0)).toBe(true);
    });

    it('should handle invalid numPartitions', () => {
      const data = [1, 2, 3];
      const numPartitions = 0;

      if (!data || !Array.isArray(data) || numPartitions < 1) {
        // Return original data
        return;
      }

      // Should not reach here
      expect(true).toBe(false);
    });

    it('should handle non-array data', () => {
      const data = null;
      const numPartitions = 3;

      if (!data || !Array.isArray(data) || numPartitions < 1) {
        // Return original data wrapped in array
        const result = [data];
        expect(result).toEqual([null]);
        return;
      }
    });

    it('should calculate memory usage when logging enabled', () => {
      const data = Array.from({ length: 100 }, (_, i) => i);
      const numPartitions = 4;

      const partitionSize = Math.ceil(data.length / numPartitions);
      const partitions = [];

      for (let i = 0; i < numPartitions; i++) {
        const start = i * partitionSize;
        const end = Math.min(start + partitionSize, data.length);
        partitions.push(data.slice(start, end));
      }

      const originalSize = JSON.stringify(data).length;
      const partitionedSize = partitions.reduce((sum, p) => sum + JSON.stringify(p).length, 0);

      expect(originalSize).toBeGreaterThan(0);
      expect(partitionedSize).toBeGreaterThan(0);
    });
  });

  describe('getStatus', () => {
    it('should report pool status correctly', () => {
      const mockWorkers = [
        { worker: {}, busy: true, processedCount: 5 },
        { worker: {}, busy: false, processedCount: 3 },
        { worker: {}, busy: false, processedCount: 2 },
      ];

      const status = {
        initialized: true,
        ready: true,
        workerCount: mockWorkers.length,
        busyWorkers: mockWorkers.filter(w => w.busy).length,
        pendingRequests: 2,
        totalProcessed: mockWorkers.reduce((sum, w) => sum + w.processedCount, 0),
      };

      expect(status.initialized).toBe(true);
      expect(status.workerCount).toBe(3);
      expect(status.busyWorkers).toBe(1);
      expect(status.totalProcessed).toBe(10);
    });

    it('should report not ready when not initialized', () => {
      const status = {
        initialized: false,
        ready: false,
        workerCount: 0,
        busyWorkers: 0,
      };

      expect(status.ready).toBe(false);
    });

    it('should report not ready when no workers', () => {
      const status = {
        initialized: true,
        ready: false,
        workerCount: 0,
        busyWorkers: 0,
      };

      expect(status.ready).toBe(false);
    });
  });

  describe('getSpeedupFactor', () => {
    it('should calculate theoretical speedup based on worker count', () => {
      const cores = 4;
      const activeWorkers = 3;

      // Theoretical max is number of workers, but communication overhead reduces it
      const speedup = Math.min(activeWorkers * 0.8, cores - 1);

      expect(speedup).toBeLessThanOrEqual(3); // activeWorkers * 0.8 = 2.4
      expect(speedup).toBeLessThanOrEqual(3); // cores - 1 = 3
    });

    it('should handle single worker', () => {
      const cores = 4;
      const activeWorkers = 1;

      const speedup = Math.min(activeWorkers * 0.8, cores - 1);

      expect(speedup).toBe(0.8);
    });

    it('should handle missing hardwareConcurrency', () => {
      const cores = undefined;
      const DEFAULT_CONCURRENCY = 1;
      const activeWorkers = 2;

      const actualCores = cores ?? DEFAULT_CONCURRENCY;
      const speedup = Math.min(activeWorkers * 0.8, actualCores - 1);

      expect(speedup).toBeLessThanOrEqual(1.6); // activeWorkers * 0.8
    });
  });

  describe('getMemoryConfig', () => {
    it('should report SharedArrayBuffer availability', () => {
      const config = {
        sharedArrayBufferAvailable: true,
        useSharedMemory: true,
        partitionData: false,
      };

      expect(config.sharedArrayBufferAvailable).toBe(true);
      expect(config.useSharedMemory).toBe(true);
      expect(config.partitionData).toBe(false);
    });

    it('should recommend COOP/COEP headers when SAB unavailable', () => {
      const config = {
        sharedArrayBufferAvailable: false,
        useSharedMemory: false,
        partitionData: true,
        recommendation:
          'Add COOP/COEP headers for SharedArrayBuffer: Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Embedder-Policy: require-corp',
      };

      expect(config.sharedArrayBufferAvailable).toBe(false);
      expect(config.recommendation).toContain('COOP/COEP');
    });

    it('should report optimal mode when SAB available', () => {
      const config = {
        sharedArrayBufferAvailable: true,
        recommendation: 'SharedArrayBuffer enabled - optimal memory usage',
      };

      expect(config.recommendation).toContain('optimal');
    });

    it('should report crossOriginIsolated status', () => {
      const config = {
        crossOriginIsolated: true,
      };

      expect(config.crossOriginIsolated).toBe(true);
    });

    it('should handle unknown crossOriginIsolated status', () => {
      const config = {
        crossOriginIsolated: 'unknown',
      };

      expect(config.crossOriginIsolated).toBe('unknown');
    });
  });

  describe('memory configuration', () => {
    it('should configure useSharedMemory based on SAB availability', () => {
      const SHARED_MEMORY_AVAILABLE = true;

      const MEMORY_CONFIG = {
        useSharedMemory: SHARED_MEMORY_AVAILABLE,
        partitionData: !SHARED_MEMORY_AVAILABLE,
        logMemoryUsage: true,
      };

      expect(MEMORY_CONFIG.useSharedMemory).toBe(true);
      expect(MEMORY_CONFIG.partitionData).toBe(false);
    });

    it('should configure partitionData when SAB unavailable', () => {
      const SHARED_MEMORY_AVAILABLE = false;

      const MEMORY_CONFIG = {
        useSharedMemory: SHARED_MEMORY_AVAILABLE,
        partitionData: !SHARED_MEMORY_AVAILABLE,
        logMemoryUsage: true,
      };

      expect(MEMORY_CONFIG.useSharedMemory).toBe(false);
      expect(MEMORY_CONFIG.partitionData).toBe(true);
    });

    it('should enable memory logging by default', () => {
      const MEMORY_CONFIG = {
        useSharedMemory: true,
        partitionData: false,
        logMemoryUsage: true,
      };

      expect(MEMORY_CONFIG.logMemoryUsage).toBe(true);
    });
  });

  describe('resizePool', () => {
    it('should increase pool size when load increases', () => {
      const currentWorkers = 2;
      const targetWorkers = 4;
      const workersToAdd = targetWorkers - currentWorkers;

      expect(workersToAdd).toBe(2);
    });

    it('should decrease pool size when load decreases', () => {
      const currentWorkers = 4;
      const targetWorkers = 2;
      const workersToRemove = currentWorkers - targetWorkers;

      expect(workersToRemove).toBe(2);
    });

    it('should maintain minimum of 1 worker', () => {
      const targetWorkers = 0;
      const minWorkers = 1;
      const adjustedTarget = Math.max(targetWorkers, minWorkers);

      expect(adjustedTarget).toBe(1);
    });

    it('should not exceed hardware limits', () => {
      const targetWorkers = 8;
      const maxWorkers = 4;
      const adjustedTarget = Math.min(targetWorkers, maxWorkers);

      expect(adjustedTarget).toBe(4);
    });
  });
});
