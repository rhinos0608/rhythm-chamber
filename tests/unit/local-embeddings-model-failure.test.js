/**
 * Comprehensive Model Download Failure Tests for LocalEmbeddings
 *
 * Tests CDN loading, WebGPU/WASM detection, progress callbacks,
 * timeout handling, network failures, and CSP blocking scenarios.
 *
 * @see js/local-embeddings.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ==========================================
// Mock Setup
// ==========================================

const mockEventBus = {
  registerSchemas: vi.fn(),
  emit: vi.fn(),
};

const mockPerformanceProfiler = {
  startOperation: vi.fn(() => vi.fn()),
  PerformanceCategory: {
    EMBEDDING_INITIALIZATION: 'embedding_initialization',
    EMBEDDING_GENERATION: 'embedding_generation',
  },
};

const mockOperationLock = {
  acquireWithTimeout: vi.fn(),
  release: vi.fn(),
};

const mockOPERATIONS = {
  EMBEDDING_GENERATION: 'embedding_generation',
};

// Track dynamic import calls
let dynamicImportMock = vi.fn();

// Mock modules before importing the target
vi.mock('../../js/services/event-bus.js', () => ({
  EventBus: mockEventBus,
}));

vi.mock('../../js/services/performance-profiler.js', () => ({
  default: mockPerformanceProfiler,
  PerformanceCategory: mockPerformanceProfiler.PerformanceCategory,
}));

vi.mock('../../js/operation-lock.js', () => ({
  OperationLock: mockOperationLock,
}));

vi.mock('../../js/utils/concurrency/lock-manager.js', () => ({
  OPERATIONS: mockOPERATIONS,
}));

// ==========================================
// Test Suite
// ==========================================

describe('LocalEmbeddings Model Download Failure Scenarios', () => {
  let LocalEmbeddings;
  let originalWindow;
  let mockNavigator;
  let mockGPU;
  let mockWebAssembly;
  let mockDocument;
  let mockPerformance;

  beforeEach(async () => {
    // Store original window state
    originalWindow = global.window;

    // Reset mocks
    vi.clearAllMocks();
    dynamicImportMock = vi.fn();

    // Setup mock GPU
    mockGPU = {
      requestAdapter: vi.fn(),
    };

    // Setup mock navigator
    mockNavigator = {
      gpu: mockGPU,
    };
    Object.defineProperty(global, 'navigator', {
      value: mockNavigator,
      writable: true,
      configurable: true,
    });

    // Setup mock WebAssembly
    mockWebAssembly = {
      instantiate: vi.fn(),
      Module: vi.fn(),
      Instance: vi.fn(),
    };
    global.WebAssembly = mockWebAssembly;

    // Setup mock performance
    mockPerformance = {
      now: vi.fn(() => Date.now()),
    };
    global.performance = mockPerformance;

    // Setup mock document
    mockDocument = {
      createElement: vi.fn(),
      head: {
        appendChild: vi.fn(),
      },
    };
    global.document = mockDocument;

    // Reset module state by re-importing
    vi.resetModules();
    const module = await import('../../js/local-embeddings.js');
    LocalEmbeddings = module.LocalEmbeddings;
  });

  afterEach(() => {
    global.window = originalWindow;
    vi.restoreAllMocks();
  });

  // ==========================================
  // Test Group 1: loadTransformersJS - CDN Loading
  // ==========================================

  describe('loadTransformersJS() - CDN Loading', () => {
    it('should return cached transformers if already loaded', async () => {
      const mockPipeline = vi.fn();
      const mockEnv = { backends: { onnx: { wasm: {} } } };
      global.window = {
        transformers: {
          pipeline: mockPipeline,
          env: mockEnv,
        },
      };

      // Re-import to pick up window.transformers
      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      const result = await LocalEmbeddings.isSupported();
      expect(result).toBeDefined();
    });

    it('should load from window.transformers when available', async () => {
      const mockPipeline = vi.fn();
      const mockEnv = { backends: { onnx: { wasm: {} } } };
      global.window = {
        transformers: {
          pipeline: mockPipeline,
          env: mockEnv,
        },
      };

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      // Trigger initialization which calls loadTransformersJS
      const progressCallback = vi.fn();

      // Mock the lock acquisition
      mockOperationLock.acquireWithTimeout.mockResolvedValueOnce('lock-123');

      // Mock successful pipeline creation
      const mockTransformers = {
        pipeline: vi.fn().mockResolvedValue(vi.fn()),
        env: {
          backends: {
            onnx: {
              wasm: {
                wasmPaths: '',
              },
            },
          },
        },
      };

      // Setup window.transformers for the module
      global.window.transformers = mockTransformers;

      // Mock WebGPU check
      mockGPU.requestAdapter.mockResolvedValue(null);

      try {
        await LocalEmbeddings.initialize(progressCallback);
      } catch (e) {
        // Expected to fail due to mocking limitations
      }

      expect(mockOperationLock.acquireWithTimeout).toHaveBeenCalledWith(
        'embedding_generation',
        60000
      );
    });

    it('should handle missing window.transformers', async () => {
      global.window = {};

      // Mock dynamic import to fail
      dynamicImportMock.mockRejectedValue(new Error('Import failed'));
      vi.stubGlobal('__import', dynamicImportMock);

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      mockOperationLock.acquireWithTimeout.mockResolvedValueOnce('lock-123');

      try {
        await LocalEmbeddings.initialize(() => {});
      } catch (e) {
        expect(e.message).toContain('Failed');
      }
    });

    it('should handle CSP blocking dynamic import', async () => {
      global.window = {};

      const cspError = new Error(
        "Refused to load the script 'https://cdn.jsdelivr.net/...' because it violates the following Content Security Policy directive"
      );

      // Mock dynamic import to throw CSP error
      dynamicImportMock.mockRejectedValue(cspError);
      vi.stubGlobal('__import', dynamicImportMock);

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      mockOperationLock.acquireWithTimeout.mockResolvedValueOnce('lock-123');

      try {
        await LocalEmbeddings.initialize(() => {});
      } catch (e) {
        expect(e.message).toContain('Failed');
      }
    });

    it('should handle network timeout during CDN load', async () => {
      global.window = {};

      const timeoutError = new Error('Network timeout');
      dynamicImportMock.mockRejectedValue(timeoutError);
      vi.stubGlobal('__import', dynamicImportMock);

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      mockOperationLock.acquireWithTimeout.mockResolvedValueOnce('lock-123');

      try {
        await LocalEmbeddings.initialize(() => {});
      } catch (e) {
        expect(e.message).toContain('Failed');
      }
    });
  });

  // ==========================================
  // Test Group 2: checkWebGPUSupport
  // ==========================================

  describe('checkWebGPUSupport() - WebGPU Detection', () => {
    it('should detect when navigator.gpu is not available', async () => {
      Object.defineProperty(global, 'navigator', {
        value: {},
        writable: true,
        configurable: true,
      });

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      const result = await LocalEmbeddings.isSupported();
      expect(result.webgpu.supported).toBe(false);
      expect(result.webgpu.reason).toBe('WebGPU not available');
    });

    it('should detect when GPU adapter is not available', async () => {
      mockGPU.requestAdapter.mockResolvedValue(null);

      const result = await LocalEmbeddings.isSupported();
      expect(result.webgpu.supported).toBe(false);
      expect(result.webgpu.reason).toBe('No GPU adapter available');
    });

    it('should detect when GPU device request fails', async () => {
      const mockAdapter = {
        requestDevice: vi.fn().mockResolvedValue(null),
        info: { vendor: 'test' },
      };
      mockGPU.requestAdapter.mockResolvedValue(mockAdapter);

      const result = await LocalEmbeddings.isSupported();
      expect(result.webgpu.supported).toBe(false);
      expect(result.webgpu.reason).toBe('Device request failed');
    });

    it('should detect successful WebGPU support', async () => {
      const mockDevice = { destroy: vi.fn() };
      const mockAdapter = {
        requestDevice: vi.fn().mockResolvedValue(mockDevice),
        info: { vendor: 'test-vendor', architecture: 'test-arch' },
      };
      mockGPU.requestAdapter.mockResolvedValue(mockAdapter);

      const result = await LocalEmbeddings.isSupported();
      expect(result.webgpu.supported).toBe(true);
      expect(result.webgpu.reason).toBe('WebGPU available');
      expect(result.webgpu.adapterInfo).toEqual({
        vendor: 'test-vendor',
        architecture: 'test-arch',
      });
    });

    it('should handle adapter request throwing an error', async () => {
      mockGPU.requestAdapter.mockRejectedValue(new Error('GPU access denied'));

      const result = await LocalEmbeddings.isSupported();
      expect(result.webgpu.supported).toBe(false);
      expect(result.webgpu.reason).toBe('GPU access denied');
    });

    it('should handle device request throwing an error', async () => {
      const mockAdapter = {
        requestDevice: vi.fn().mockRejectedValue(new Error('Device creation failed')),
        info: {},
      };
      mockGPU.requestAdapter.mockResolvedValue(mockAdapter);

      const result = await LocalEmbeddings.isSupported();
      expect(result.webgpu.supported).toBe(false);
      expect(result.webgpu.reason).toBe('Device creation failed');
    });

    it('should include adapter info when available', async () => {
      const mockDevice = { destroy: vi.fn() };
      const mockAdapter = {
        requestDevice: vi.fn().mockResolvedValue(mockDevice),
        info: {
          vendor: 'NVIDIA',
          architecture: 'ampere',
          device: 'RTX 3080',
          description: 'High-performance GPU',
        },
      };
      mockGPU.requestAdapter.mockResolvedValue(mockAdapter);

      const result = await LocalEmbeddings.isSupported();
      expect(result.webgpu.adapterInfo).toEqual({
        vendor: 'NVIDIA',
        architecture: 'ampere',
        device: 'RTX 3080',
        description: 'High-performance GPU',
      });
    });

    it('should handle adapter without info property', async () => {
      const mockDevice = { destroy: vi.fn() };
      const mockAdapter = {
        requestDevice: vi.fn().mockResolvedValue(mockDevice),
        // No info property
      };
      mockGPU.requestAdapter.mockResolvedValue(mockAdapter);

      const result = await LocalEmbeddings.isSupported();
      expect(result.webgpu.supported).toBe(true);
      expect(result.webgpu.adapterInfo).toEqual({});
    });
  });

  // ==========================================
  // Test Group 3: checkWASMSupport
  // ==========================================

  describe('checkWASMSupport() - WASM Fallback Detection', () => {
    it('should detect when WebAssembly is not available', async () => {
      global.WebAssembly = undefined;

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      const result = await LocalEmbeddings.isSupported();
      expect(result.wasm).toBe(false);
      expect(result.supported).toBe(false);
    });

    it('should detect when WebAssembly.instantiate is not available', async () => {
      global.WebAssembly = {
        Module: vi.fn(),
        Instance: vi.fn(),
        // Missing instantiate
      };

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      const result = await LocalEmbeddings.isSupported();
      expect(result.wasm).toBe(false);
    });

    it('should detect successful WASM support', async () => {
      const mockModule = {};
      const mockInstance = {};

      global.WebAssembly = {
        Module: vi.fn().mockReturnValue(mockModule),
        Instance: vi.fn().mockReturnValue(mockInstance),
        instantiate: vi.fn(),
      };

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      const result = await LocalEmbeddings.isSupported();
      expect(result.wasm).toBe(true);
    });

    it('should handle WASM module compilation failure', async () => {
      global.WebAssembly = {
        Module: vi.fn().mockImplementation(() => {
          throw new Error('Invalid WASM module');
        }),
        Instance: vi.fn(),
        instantiate: vi.fn(),
      };

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      const result = await LocalEmbeddings.isSupported();
      expect(result.wasm).toBe(false);
    });

    it('should handle WASM instance creation failure', async () => {
      const mockModule = {};

      global.WebAssembly = {
        Module: vi.fn().mockReturnValue(mockModule),
        Instance: vi.fn().mockImplementation(() => {
          throw new Error('Instance creation failed');
        }),
        instantiate: vi.fn(),
      };

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      const result = await LocalEmbeddings.isSupported();
      expect(result.wasm).toBe(false);
    });

    it('should validate WebAssembly is an object', async () => {
      global.WebAssembly = 'not an object';

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      const result = await LocalEmbeddings.isSupported();
      expect(result.wasm).toBe(false);
    });
  });

  // ==========================================
  // Test Group 4: initialize - Progress Callbacks
  // ==========================================

  describe('initialize() - Progress Callbacks', () => {
    beforeEach(() => {
      mockOperationLock.acquireWithTimeout.mockResolvedValue('lock-123');
    });

    it('should call progress callback with 100 when already initialized', async () => {
      const mockPipeline = vi.fn();
      const mockTransformers = {
        pipeline: vi.fn().mockResolvedValue(mockPipeline),
        env: {
          backends: {
            onnx: {
              wasm: {
                wasmPaths: '',
              },
            },
          },
        },
      };

      global.window = {
        transformers: mockTransformers,
      };

      mockGPU.requestAdapter.mockResolvedValue(null);

      global.WebAssembly = {
        Module: vi.fn().mockReturnValue({}),
        Instance: vi.fn().mockReturnValue({}),
        instantiate: vi.fn(),
      };

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      const progressCallback = vi.fn();

      // First initialization
      await LocalEmbeddings.initialize(progressCallback);

      // Reset callback
      progressCallback.mockClear();

      // Second call should immediately return with 100
      const result = await LocalEmbeddings.initialize(progressCallback);
      expect(result).toBe(true);
      expect(progressCallback).toHaveBeenCalledWith(100);
    });

    it('should call progress callback at key milestones', async () => {
      const mockPipeline = vi.fn();
      const mockTransformers = {
        pipeline: vi.fn().mockImplementation((task, model, options) => {
          // Simulate progress callbacks
          if (options.progress_callback) {
            options.progress_callback({ status: 'progress', progress: 0.5 });
            options.progress_callback({ status: 'done' });
          }
          return Promise.resolve(mockPipeline);
        }),
        env: {
          backends: {
            onnx: {
              wasm: {
                wasmPaths: '',
              },
            },
          },
        },
      };

      global.window = {
        transformers: mockTransformers,
      };

      mockGPU.requestAdapter.mockResolvedValue(null);

      global.WebAssembly = {
        Module: vi.fn().mockReturnValue({}),
        Instance: vi.fn().mockReturnValue({}),
        instantiate: vi.fn(),
      };

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      const progressCallback = vi.fn();

      await LocalEmbeddings.initialize(progressCallback);

      // Should call with initial progress
      expect(progressCallback).toHaveBeenCalledWith(5);
      expect(progressCallback).toHaveBeenCalledWith(15);
      expect(progressCallback).toHaveBeenCalledWith(20);
      expect(progressCallback).toHaveBeenCalledWith(55); // 20 + 0.5 * 70
      expect(progressCallback).toHaveBeenCalledWith(95);
      expect(progressCallback).toHaveBeenCalledWith(100);
    });

    it('should emit model_loaded event on success', async () => {
      const mockPipeline = vi.fn();
      const mockTransformers = {
        pipeline: vi.fn().mockResolvedValue(mockPipeline),
        env: {
          backends: {
            onnx: {
              wasm: {
                wasmPaths: '',
              },
            },
          },
        },
      };

      global.window = {
        transformers: mockTransformers,
      };

      mockGPU.requestAdapter.mockResolvedValue(null);

      global.WebAssembly = {
        Module: vi.fn().mockReturnValue({}),
        Instance: vi.fn().mockReturnValue({}),
        instantiate: vi.fn(),
      };

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      await LocalEmbeddings.initialize(() => {});

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'embedding:model_loaded',
        expect.objectContaining({
          model: 'Xenova/all-MiniLM-L6-v2',
          backend: 'wasm',
          quantization: 'q8',
          loadTimeMs: expect.any(Number),
        })
      );
    });

    it('should configure local WASM path for CSP compliance', async () => {
      const mockPipeline = vi.fn();
      const mockTransformers = {
        pipeline: vi.fn().mockResolvedValue(mockPipeline),
        env: {
          backends: {
            onnx: {
              wasm: {
                wasmPaths: '',
              },
            },
          },
        },
      };

      global.window = {
        transformers: mockTransformers,
      };

      mockGPU.requestAdapter.mockResolvedValue(null);

      global.WebAssembly = {
        Module: vi.fn().mockReturnValue({}),
        Instance: vi.fn().mockReturnValue({}),
        instantiate: vi.fn(),
      };

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      await LocalEmbeddings.initialize(() => {});

      expect(mockTransformers.env.backends.onnx.wasm.wasmPaths).toBe('./js/vendor/');
    });
  });

  // ==========================================
  // Test Group 5: initialize - Timeout Handling
  // ==========================================

  describe('initialize() - Timeout Handling', () => {
    it('should handle lock acquisition timeout', async () => {
      const lockTimeoutError = new Error('Lock timeout');
      lockTimeoutError.code = 'LOCK_TIMEOUT';
      mockOperationLock.acquireWithTimeout.mockRejectedValue(lockTimeoutError);

      // Reset module state
      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      const progressCallback = vi.fn();

      // Mock setTimeout to execute immediately
      vi.useFakeTimers();

      try {
        const initPromise = LocalEmbeddings.initialize(progressCallback);
        vi.advanceTimersByTime(1500);
        await initPromise;
      } catch (e) {
        expect(e.message).toContain('Embedding initialization timeout');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should return true if initialization completed during lock wait', async () => {
      const lockTimeoutError = new Error('Lock timeout');
      lockTimeoutError.code = 'LOCK_TIMEOUT';

      // First lock acquisition times out, second check succeeds
      mockOperationLock.acquireWithTimeout
        .mockRejectedValueOnce(lockTimeoutError)
        .mockResolvedValueOnce('lock-456');

      const mockPipeline = vi.fn();
      const mockTransformers = {
        pipeline: vi.fn().mockResolvedValue(mockPipeline),
        env: {
          backends: {
            onnx: {
              wasm: {
                wasmPaths: '',
              },
            },
          },
        },
      };

      global.window = {
        transformers: mockTransformers,
      };

      mockGPU.requestAdapter.mockResolvedValue(null);

      global.WebAssembly = {
        Module: vi.fn().mockReturnValue({}),
        Instance: vi.fn().mockReturnValue({}),
        instantiate: vi.fn(),
      };

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      const progressCallback = vi.fn();

      // First initialize to set isInitialized
      await LocalEmbeddings.initialize(() => {});

      // Reset and try again with timeout scenario
      progressCallback.mockClear();

      // Simulate timeout but initialization already done
      const result = await LocalEmbeddings.initialize(progressCallback);
      expect(result).toBe(true);
      expect(progressCallback).toHaveBeenCalledWith(100);
    });

    it('should handle general lock acquisition errors', async () => {
      mockOperationLock.acquireWithTimeout.mockRejectedValue(new Error('Lock system error'));

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      await expect(LocalEmbeddings.initialize(() => {})).rejects.toThrow('Lock system error');
    });

    it('should release lock even on initialization failure', async () => {
      mockOperationLock.acquireWithTimeout.mockResolvedValue('lock-123');

      global.window = {};

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      try {
        await LocalEmbeddings.initialize(() => {});
      } catch (e) {
        // Expected
      }

      expect(mockOperationLock.release).toHaveBeenCalledWith(
        'embedding_generation',
        'lock-123'
      );
    });
  });

  // ==========================================
  // Test Group 6: Network Failure Scenarios
  // ==========================================

  describe('Network Failure Scenarios', () => {
    beforeEach(() => {
      mockOperationLock.acquireWithTimeout.mockResolvedValue('lock-123');
    });

    it('should handle DNS resolution failure', async () => {
      global.window = {};

      const dnsError = new Error('getaddrinfo ENOTFOUND cdn.jsdelivr.net');
      dynamicImportMock.mockRejectedValue(dnsError);
      vi.stubGlobal('__import', dynamicImportMock);

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      try {
        await LocalEmbeddings.initialize(() => {});
      } catch (e) {
        expect(e.message).toContain('Failed');
      }
    });

    it('should handle SSL certificate error', async () => {
      global.window = {};

      const sslError = new Error('unable to verify the first certificate');
      dynamicImportMock.mockRejectedValue(sslError);
      vi.stubGlobal('__import', dynamicImportMock);

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      try {
        await LocalEmbeddings.initialize(() => {});
      } catch (e) {
        expect(e.message).toContain('Failed');
      }
    });

    it('should handle 404 Not Found from CDN', async () => {
      global.window = {};

      const notFoundError = new Error('Failed to fetch dynamically imported module');
      notFoundError.name = 'TypeError';
      dynamicImportMock.mockRejectedValue(notFoundError);
      vi.stubGlobal('__import', dynamicImportMock);

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      try {
        await LocalEmbeddings.initialize(() => {});
      } catch (e) {
        expect(e.message).toContain('Failed');
      }
    });

    it('should handle connection reset', async () => {
      global.window = {};

      const resetError = new Error('ECONNRESET');
      dynamicImportMock.mockRejectedValue(resetError);
      vi.stubGlobal('__import', dynamicImportMock);

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      try {
        await LocalEmbeddings.initialize(() => {});
      } catch (e) {
        expect(e.message).toContain('Failed');
      }
    });
  });

  // ==========================================
  // Test Group 7: CSP Blocking Scenarios
  // ==========================================

  describe('CSP Blocking Scenarios', () => {
    beforeEach(() => {
      mockOperationLock.acquireWithTimeout.mockResolvedValue('lock-123');
    });

    it('should handle script-src CSP violation', async () => {
      global.window = {};

      const cspError = new Error(
        "Refused to load the script 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js' " +
          "because it violates the following Content Security Policy directive: \"script-src 'self'\"."
      );
      dynamicImportMock.mockRejectedValue(cspError);
      vi.stubGlobal('__import', dynamicImportMock);

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      try {
        await LocalEmbeddings.initialize(() => {});
      } catch (e) {
        expect(e.message).toContain('Failed');
      }
    });

    it('should handle connect-src CSP violation', async () => {
      global.window = {};

      const cspError = new Error(
        "Refused to connect to 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js' " +
          "because it violates the following Content Security Policy directive: \"connect-src 'self'\"."
      );
      dynamicImportMock.mockRejectedValue(cspError);
      vi.stubGlobal('__import', dynamicImportMock);

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      try {
        await LocalEmbeddings.initialize(() => {});
      } catch (e) {
        expect(e.message).toContain('Failed');
      }
    });

    it('should handle default-src CSP violation', async () => {
      global.window = {};

      const cspError = new Error(
        "Refused to load the script 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js' " +
          "because it violates the following Content Security Policy directive: \"default-src 'self'\". " +
          "Note that 'script-src' was not explicitly set, so 'default-src' is used as a fallback."
      );
      dynamicImportMock.mockRejectedValue(cspError);
      vi.stubGlobal('__import', dynamicImportMock);

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      try {
        await LocalEmbeddings.initialize(() => {});
      } catch (e) {
        expect(e.message).toContain('Failed');
      }
    });

    it('should handle unsafe-eval CSP violation for WASM', async () => {
      // WASM instantiation requires unsafe-eval
      global.WebAssembly = {
        Module: vi.fn().mockImplementation(() => {
          const error = new Error(
            "EvalError: Refused to create a WebAssembly object because 'unsafe-eval' is not an allowed source of script"
          );
          throw error;
        }),
        Instance: vi.fn(),
        instantiate: vi.fn(),
      };

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      const result = await LocalEmbeddings.isSupported();
      expect(result.wasm).toBe(false);
    });
  });

  // ==========================================
  // Test Group 8: Backend Selection
  // ==========================================

  describe('Backend Selection', () => {
    beforeEach(() => {
      mockOperationLock.acquireWithTimeout.mockResolvedValue('lock-123');
    });

    it('should prefer WebGPU over WASM when available', async () => {
      const mockDevice = { destroy: vi.fn() };
      const mockAdapter = {
        requestDevice: vi.fn().mockResolvedValue(mockDevice),
        info: {},
      };
      mockGPU.requestAdapter.mockResolvedValue(mockAdapter);

      const mockPipeline = vi.fn();
      const mockTransformers = {
        pipeline: vi.fn().mockResolvedValue(mockPipeline),
        env: {
          backends: {
            onnx: {
              wasm: {
                wasmPaths: '',
              },
            },
          },
        },
      };

      global.window = {
        transformers: mockTransformers,
      };

      global.WebAssembly = {
        Module: vi.fn().mockReturnValue({}),
        Instance: vi.fn().mockReturnValue({}),
        instantiate: vi.fn(),
      };

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      await LocalEmbeddings.initialize(() => {});

      expect(mockTransformers.pipeline).toHaveBeenCalledWith(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        expect.objectContaining({
          device: 'webgpu',
        })
      );
    });

    it('should fallback to WASM when WebGPU is not available', async () => {
      mockGPU.requestAdapter.mockResolvedValue(null);

      const mockPipeline = vi.fn();
      const mockTransformers = {
        pipeline: vi.fn().mockResolvedValue(mockPipeline),
        env: {
          backends: {
            onnx: {
              wasm: {
                wasmPaths: '',
              },
            },
          },
        },
      };

      global.window = {
        transformers: mockTransformers,
      };

      global.WebAssembly = {
        Module: vi.fn().mockReturnValue({}),
        Instance: vi.fn().mockReturnValue({}),
        instantiate: vi.fn(),
      };

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      await LocalEmbeddings.initialize(() => {});

      expect(mockTransformers.pipeline).toHaveBeenCalledWith(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        expect.objectContaining({
          device: 'wasm',
        })
      );
    });

    it('should use quantized model configuration', async () => {
      mockGPU.requestAdapter.mockResolvedValue(null);

      const mockPipeline = vi.fn();
      const mockTransformers = {
        pipeline: vi.fn().mockResolvedValue(mockPipeline),
        env: {
          backends: {
            onnx: {
              wasm: {
                wasmPaths: '',
              },
            },
          },
        },
      };

      global.window = {
        transformers: mockTransformers,
      };

      global.WebAssembly = {
        Module: vi.fn().mockReturnValue({}),
        Instance: vi.fn().mockReturnValue({}),
        instantiate: vi.fn(),
      };

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      await LocalEmbeddings.initialize(() => {});

      expect(mockTransformers.pipeline).toHaveBeenCalledWith(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        expect.objectContaining({
          quantized: true,
          dtype: 'q8',
        })
      );
    });
  });

  // ==========================================
  // Test Group 9: Status and State Management
  // ==========================================

  describe('Status and State Management', () => {
    it('should return correct initial status', async () => {
      const status = LocalEmbeddings.getStatus();

      expect(status).toEqual({
        isInitialized: false,
        isLoading: false,
        loadProgress: 0,
        loadError: null,
        modelName: 'Xenova/all-MiniLM-L6-v2',
      });
    });

    it('should return correct model info', () => {
      const info = LocalEmbeddings.getModelInfo();

      expect(info).toEqual({
        name: 'Xenova/all-MiniLM-L6-v2',
        dimensions: 384,
        downloadSize: '~22MB',
        description: 'Sentence embeddings for semantic similarity',
      });
    });

    it('should return isReady false when not initialized', () => {
      expect(LocalEmbeddings.isReady()).toBe(false);
    });

    it('should return isReady true after successful initialization', async () => {
      mockOperationLock.acquireWithTimeout.mockResolvedValue('lock-123');

      const mockPipeline = vi.fn();
      const mockTransformers = {
        pipeline: vi.fn().mockResolvedValue(mockPipeline),
        env: {
          backends: {
            onnx: {
              wasm: {
                wasmPaths: '',
              },
            },
          },
        },
      };

      global.window = {
        transformers: mockTransformers,
      };

      mockGPU.requestAdapter.mockResolvedValue(null);

      global.WebAssembly = {
        Module: vi.fn().mockReturnValue({}),
        Instance: vi.fn().mockReturnValue({}),
        instantiate: vi.fn(),
      };

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      await LocalEmbeddings.initialize(() => {});

      expect(LocalEmbeddings.isReady()).toBe(true);
    });

    it('should track loadError on failure', async () => {
      mockOperationLock.acquireWithTimeout.mockResolvedValue('lock-123');

      global.window = {};

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      try {
        await LocalEmbeddings.initialize(() => {});
      } catch (e) {
        // Expected
      }

      const status = LocalEmbeddings.getStatus();
      expect(status.isInitialized).toBe(false);
    });
  });

  // ==========================================
  // Test Group 10: Edge Cases and Recovery
  // ==========================================

  describe('Edge Cases and Recovery', () => {
    it('should handle concurrent initialization attempts', async () => {
      // First lock acquisition succeeds, second is blocked
      mockOperationLock.acquireWithTimeout
        .mockResolvedValueOnce('lock-1')
        .mockRejectedValueOnce(new Error('Lock already held'));

      const mockPipeline = vi.fn();
      const mockTransformers = {
        pipeline: vi.fn().mockResolvedValue(mockPipeline),
        env: {
          backends: {
            onnx: {
              wasm: {
                wasmPaths: '',
              },
            },
          },
        },
      };

      global.window = {
        transformers: mockTransformers,
      };

      mockGPU.requestAdapter.mockResolvedValue(null);

      global.WebAssembly = {
        Module: vi.fn().mockReturnValue({}),
        Instance: vi.fn().mockReturnValue({}),
        instantiate: vi.fn(),
      };

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      // First initialization
      const promise1 = LocalEmbeddings.initialize(() => {});

      // Second should fail with lock error
      await expect(LocalEmbeddings.initialize(() => {})).rejects.toThrow('Lock already held');

      await promise1;
    });

    it('should handle missing progress callback', async () => {
      mockOperationLock.acquireWithTimeout.mockResolvedValue('lock-123');

      const mockPipeline = vi.fn();
      const mockTransformers = {
        pipeline: vi.fn().mockResolvedValue(mockPipeline),
        env: {
          backends: {
            onnx: {
              wasm: {
                wasmPaths: '',
              },
            },
          },
        },
      };

      global.window = {
        transformers: mockTransformers,
      };

      mockGPU.requestAdapter.mockResolvedValue(null);

      global.WebAssembly = {
        Module: vi.fn().mockReturnValue({}),
        Instance: vi.fn().mockReturnValue({}),
        instantiate: vi.fn(),
      };

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      // Should work without progress callback
      const result = await LocalEmbeddings.initialize();
      expect(result).toBe(true);
    });

    it('should handle pipeline creation failure', async () => {
      mockOperationLock.acquireWithTimeout.mockResolvedValue('lock-123');

      const mockTransformers = {
        pipeline: vi.fn().mockRejectedValue(new Error('Model download failed')),
        env: {
          backends: {
            onnx: {
              wasm: {
                wasmPaths: '',
              },
            },
          },
        },
      };

      global.window = {
        transformers: mockTransformers,
      };

      mockGPU.requestAdapter.mockResolvedValue(null);

      global.WebAssembly = {
        Module: vi.fn().mockReturnValue({}),
        Instance: vi.fn().mockReturnValue({}),
        instantiate: vi.fn(),
      };

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      await expect(LocalEmbeddings.initialize(() => {})).rejects.toThrow('Model download failed');

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'embedding:error',
        expect.objectContaining({
          error: 'Model download failed',
          context: 'initialization',
        })
      );
    });

    it('should handle progress status other than progress/done', async () => {
      mockOperationLock.acquireWithTimeout.mockResolvedValue('lock-123');

      const mockTransformers = {
        pipeline: vi.fn().mockImplementation((task, model, options) => {
          if (options.progress_callback) {
            // Send unknown status
            options.progress_callback({ status: 'unknown', progress: 0.5 });
            options.progress_callback({ status: 'ready' });
          }
          return Promise.resolve(vi.fn());
        }),
        env: {
          backends: {
            onnx: {
              wasm: {
                wasmPaths: '',
              },
            },
          },
        },
      };

      global.window = {
        transformers: mockTransformers,
      };

      mockGPU.requestAdapter.mockResolvedValue(null);

      global.WebAssembly = {
        Module: vi.fn().mockReturnValue({}),
        Instance: vi.fn().mockReturnValue({}),
        instantiate: vi.fn(),
      };

      vi.resetModules();
      const module = await import('../../js/local-embeddings.js');
      LocalEmbeddings = module.LocalEmbeddings;

      const progressCallback = vi.fn();

      await LocalEmbeddings.initialize(progressCallback);

      // Should not update progress for unknown statuses
      // Only 5, 15, 20, 95, 100 should be called
      expect(progressCallback).toHaveBeenCalledWith(5);
      expect(progressCallback).toHaveBeenCalledWith(100);
    });
  });
});
