/**
 * Battery-Aware Mode Selector Service
 * 
 * Dynamically selects optimal embedding backend and configuration based on:
 * - Device capabilities (WebGPU, WASM SIMD)
 * - Battery status (level, charging state)
 * - Performance requirements
 * 
 * HNW Considerations:
 * - Hierarchy: Central authority for embedding mode decisions
 * - Network: Informs LocalEmbeddings of optimal configuration
 * - Wave: Responds to battery events for dynamic switching
 * 
 * @module services/battery-aware-mode-selector
 */

import { EventBus } from './event-bus.js';

// ==========================================
// Mode Configuration
// ==========================================

const MODES = {
    LOW_POWER: {
        backend: 'wasm',
        quantization: 'q8',
        batchSize: 1,
        reason: 'low_battery_mode'
    },
    BALANCED: {
        backend: 'wasm',
        quantization: 'q8',
        batchSize: 4,
        reason: 'balanced_mode'
    },
    PERFORMANCE: {
        backend: 'webgpu',  // Will fallback to wasm if not supported
        quantization: 'q8',
        batchSize: 8,
        reason: 'performance_mode'
    }
};

// Battery thresholds
const BATTERY_THRESHOLDS = {
    CRITICAL: 0.1,    // 10% - minimal processing
    LOW: 0.2,         // 20% - low power mode
    MEDIUM: 0.5       // 50% - balanced mode
};

// ==========================================
// State
// ==========================================

let currentMode = null;
let batteryManager = null;
let initialized = false;

// ==========================================
// Capability Detection
// ==========================================

/**
 * Check if WebGPU is available for acceleration
 */
async function checkWebGPUSupport() {
    if (!navigator.gpu) {
        return { supported: false, reason: 'WebGPU not available' };
    }

    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            return { supported: false, reason: 'No GPU adapter available' };
        }

        const device = await adapter.requestDevice();
        const isSupported = !!device;

        return {
            supported: isSupported,
            adapterInfo: adapter.info || {},
            reason: isSupported ? 'WebGPU available' : 'Device request failed'
        };
    } catch (e) {
        return { supported: false, reason: e.message };
    }
}

/**
 * Check if WASM SIMD is available
 */
function checkWASMSupport() {
    try {
        if (typeof WebAssembly === 'object' &&
            typeof WebAssembly.instantiate === 'function') {
            const module = new WebAssembly.Module(
                Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)
            );
            return new WebAssembly.Instance(module) instanceof WebAssembly.Instance;
        }
    } catch (e) {
        return false;
    }
    return false;
}

// ==========================================
// Battery Monitoring
// ==========================================

/**
 * Initialize battery monitoring
 */
async function initBatteryMonitoring() {
    if (!navigator.getBattery) {
        console.log('[BatteryAwareMode] Battery API not available');
        return null;
    }

    try {
        batteryManager = await navigator.getBattery();

        // Listen for battery changes
        batteryManager.addEventListener('chargingchange', handleBatteryChange);
        batteryManager.addEventListener('levelchange', handleBatteryChange);

        console.log('[BatteryAwareMode] Battery monitoring initialized');
        return batteryManager;
    } catch (e) {
        console.warn('[BatteryAwareMode] Could not access battery:', e.message);
        return null;
    }
}

/**
 * Handle battery status changes
 */
async function handleBatteryChange() {
    const previousMode = currentMode;
    const newMode = await getOptimalEmbeddingMode();

    if (previousMode && previousMode.reason !== newMode.reason) {
        console.log(`[BatteryAwareMode] Mode changed: ${previousMode.reason} → ${newMode.reason}`);

        // Emit mode change event
        EventBus.emit('embedding:mode_change', {
            from: previousMode.reason,
            to: newMode.reason,
            batteryLevel: batteryManager?.level ?? null,
            charging: batteryManager?.charging ?? null
        });
    }

    currentMode = newMode;
}

// ==========================================
// Mode Selection
// ==========================================

/**
 * Get optimal embedding mode based on capabilities and battery
 * @returns {Promise<Object>} Mode configuration
 */
async function getOptimalEmbeddingMode() {
    const capabilities = {
        webgpu: await checkWebGPUSupport(),
        wasm: checkWASMSupport()
    };

    // Get battery info
    let batteryInfo = null;
    try {
        batteryInfo = batteryManager || await navigator.getBattery?.();
    } catch (e) {
        // Battery API not available
    }

    // If no battery info (desktop), assume plugged in
    if (!batteryInfo) {
        return {
            ...MODES.PERFORMANCE,
            backend: capabilities.webgpu.supported ? 'webgpu' : 'wasm',
            capabilities
        };
    }

    const level = batteryInfo.level;
    const charging = batteryInfo.charging;

    // Charging: maximize performance
    if (charging) {
        return {
            ...MODES.PERFORMANCE,
            backend: capabilities.webgpu.supported ? 'webgpu' : 'wasm',
            capabilities
        };
    }

    // Critical battery: minimal processing
    if (level < BATTERY_THRESHOLDS.CRITICAL) {
        return {
            ...MODES.LOW_POWER,
            batchSize: 1,
            reason: 'critical_battery_mode',
            capabilities
        };
    }

    // Low battery: prioritize efficiency
    if (level < BATTERY_THRESHOLDS.LOW) {
        return {
            ...MODES.LOW_POWER,
            capabilities
        };
    }

    // Medium battery: balanced mode
    if (level < BATTERY_THRESHOLDS.MEDIUM) {
        return {
            ...MODES.BALANCED,
            capabilities
        };
    }

    // High battery (not charging): still use performance
    return {
        ...MODES.PERFORMANCE,
        backend: capabilities.webgpu.supported ? 'webgpu' : 'wasm',
        capabilities
    };
}

/**
 * Get current battery status
 * @returns {Object|null} Battery status or null if unavailable
 */
function getBatteryStatus() {
    if (!batteryManager) {
        return null;
    }

    return {
        level: batteryManager.level,
        charging: batteryManager.charging,
        chargingTime: batteryManager.chargingTime,
        dischargingTime: batteryManager.dischargingTime
    };
}

// ==========================================
// Initialization
// ==========================================

/**
 * Initialize the battery-aware mode selector
 * @returns {Promise<Object>} Initial mode configuration
 */
async function initialize() {
    if (initialized) {
        return currentMode;
    }

    await initBatteryMonitoring();
    currentMode = await getOptimalEmbeddingMode();
    initialized = true;

    console.log(`[BatteryAwareMode] Initialized with mode: ${currentMode.reason}`);
    return currentMode;
}

// ==========================================
// Public API
// ==========================================

export const BatteryAwareModeSelector = {
    /**
     * Initialize the mode selector
     */
    initialize,

    /**
     * Get optimal embedding mode based on current conditions
     */
    getOptimalEmbeddingMode,

    /**
     * Get current battery status
     */
    getBatteryStatus,

    /**
     * Get current mode
     */
    getCurrentMode() {
        return currentMode;
    },

    /**
     * Check if WebGPU is supported
     */
    checkWebGPUSupport,

    /**
     * Check if WASM is supported
     */
    checkWASMSupport,

    /**
     * Mode constants
     */
    MODES,
    BATTERY_THRESHOLDS
};

console.log('[BatteryAwareModeSelector] Module loaded');
