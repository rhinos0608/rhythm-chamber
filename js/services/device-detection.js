/**
 * Device Detection and Network Monitoring Service
 *
 * Provides mobile device detection, network monitoring, and adaptive timing
 * configurations for cross-tab coordination and worker management.
 *
 * HNW Wave: Adaptive timing based on device capabilities and network conditions
 * HNW Network: Network status integration for better failover detection
 *
 * Features:
 * - Mobile device detection (phone, tablet, desktop)
 * - Connection quality monitoring (Network Information API)
 * - Adaptive timing recommendations
 * - Battery-aware throttling detection
 * - Visibility state tracking with debouncing
 *
 * @module services/device-detection
 */

// ==========================================
// Device Type Detection
// ==========================================

/**
 * Device types for adaptive behavior
 * @readonly
 * @enum {string}
 */
const DeviceType = Object.freeze({
    PHONE: 'phone',
    TABLET: 'tablet',
    DESKTOP: 'desktop',
    UNKNOWN: 'unknown',
});

/**
 * Device capability levels
 * @readonly
 * @enum {string}
 */
const DeviceCapability = Object.freeze({
    HIGH: 'high', // Desktop, fast CPU, plenty of RAM
    MEDIUM: 'medium', // Tablet, mid-range CPU, moderate RAM
    LOW: 'low', // Phone, slow CPU, limited RAM
});

/**
 * Detect device type using user agent and screen characteristics
 * @returns {DeviceType} Detected device type
 */
function detectDeviceType() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return DeviceType.UNKNOWN;
    }

    const ua = navigator.userAgent || '';
    const maxTouchPoints = navigator.maxTouchPoints || 0;

    // Check for mobile user agents
    const isMobileUA = /Mobile|Android|iP(hone|od)|IEMobile|Opera Mini/i.test(ua);

    // Check for tablet user agents
    const isTabletUA = /Tablet|iPad|Kindle|Nexus (7|10)|PlayBook|Silk/i.test(ua);

    // Screen size-based detection
    const screenWidth = window.screen?.width || window.innerWidth;
    const screenHeight = window.screen?.height || window.innerHeight;
    const isSmallScreen = screenWidth < 768 || screenHeight < 768;
    const isMediumScreen = screenWidth >= 768 && screenWidth < 1024;

    // Touch capability
    const isTouchDevice = maxTouchPoints > 0;

    // Combined detection logic
    if (isTabletUA || (isTouchDevice && isMediumScreen)) {
        return DeviceType.TABLET;
    } else if (isMobileUA || (isTouchDevice && isSmallScreen)) {
        return DeviceType.PHONE;
    } else {
        return DeviceType.DESKTOP;
    }
}

/**
 * Detect device capability level based on hardware characteristics
 * @returns {DeviceCapability} Detected capability level
 */
function detectDeviceCapability() {
    if (typeof window === 'undefined') {
        return DeviceCapability.MEDIUM;
    }

    const deviceType = detectDeviceType();
    const deviceMemory = navigator.deviceMemory || 4; // Default to 4GB
    const hardwareConcurrency = navigator.hardwareConcurrency || 2;

    // CPU cores assessment
    const highPerformanceCPU = hardwareConcurrency >= 8;
    const midPerformanceCPU = hardwareConcurrency >= 4;

    // Memory assessment
    const highMemory = deviceMemory >= 8;
    const midMemory = deviceMemory >= 4;

    // Device type weighting
    if (deviceType === DeviceType.DESKTOP) {
        if (highPerformanceCPU && highMemory) {
            return DeviceCapability.HIGH;
        } else if (midPerformanceCPU && midMemory) {
            return DeviceCapability.MEDIUM;
        }
    } else if (deviceType === DeviceType.TABLET) {
        if (midPerformanceCPU && midMemory) {
            return DeviceCapability.MEDIUM;
        }
    }

    // Default to low for mobile and unknown devices
    return DeviceCapability.LOW;
}

/**
 * Check if device is mobile (phone or tablet)
 * @returns {boolean} True if mobile device
 */
function isMobile() {
    const deviceType = detectDeviceType();
    return deviceType === DeviceType.PHONE || deviceType === DeviceType.TABLET;
}

/**
 * Check if device is a phone specifically
 * @returns {boolean} True if phone
 */
function isPhone() {
    return detectDeviceType() === DeviceType.PHONE;
}

/**
 * Get device information summary
 * @returns {Object} Device information
 */
function getDeviceInfo() {
    const deviceType = detectDeviceType();
    const capability = detectDeviceCapability();

    return {
        deviceType,
        capability,
        isMobile: isMobile(),
        isPhone: isPhone(),
        isTablet: deviceType === DeviceType.TABLET,
        isDesktop: deviceType === DeviceType.DESKTOP,
        hardwareConcurrency: navigator.hardwareConcurrency || 2,
        deviceMemory: navigator.deviceMemory || 4,
        maxTouchPoints: navigator.maxTouchPoints || 0,
        userAgent: navigator.userAgent,
    };
}

// ==========================================
// Network Monitoring
// ==========================================

/**
 * Connection quality levels
 * @readonly
 * @enum {string}
 */
const ConnectionQuality = Object.freeze({
    EXCELLENT: 'excellent', // WiFi, fast 4G
    GOOD: 'good', // 3G, slow 4G
    FAIR: 'fair', // 2G, unstable
    POOR: 'poor', // Very slow, offline
    UNKNOWN: 'unknown',
});

/**
 * Network state tracking
 */
const networkState = {
    currentQuality: ConnectionQuality.UNKNOWN,
    effectiveType: 'unknown',
    downlink: 0,
    rtt: 0,
    saveData: false,
    lastUpdate: Date.now(),
    listeners: [],
    isMonitoring: false,
};

/**
 * Get current connection quality from Network Information API
 * @returns {ConnectionQuality} Current connection quality
 */
function getConnectionQuality() {
    if (typeof navigator === 'undefined' || !navigator.connection) {
        return ConnectionQuality.UNKNOWN;
    }

    const conn = navigator.connection;
    const effectiveType = conn.effectiveType;
    const downlink = conn.downlink; // Mbps
    const rtt = conn.rtt; // Round-trip time in ms
    const saveData = conn.saveData;

    networkState.effectiveType = effectiveType;
    networkState.downlink = downlink;
    networkState.rtt = rtt;
    networkState.saveData = saveData;

    // Determine quality based on effective type and metrics
    if (saveData) {
        return ConnectionQuality.POOR; // Data saver mode
    }

    // Effective type mapping
    switch (effectiveType) {
        case '4g':
            if (downlink >= 10 && rtt < 100) {
                return ConnectionQuality.EXCELLENT;
            } else {
                return ConnectionQuality.GOOD;
            }
        case '3g':
            if (downlink >= 1.5 && rtt < 300) {
                return ConnectionQuality.GOOD;
            } else {
                return ConnectionQuality.FAIR;
            }
        case '2g':
        case 'slow-2g':
            return ConnectionQuality.POOR;
        default:
            return ConnectionQuality.UNKNOWN;
    }
}

/**
 * Check if network connection is currently degraded
 * @returns {boolean} True if network is degraded
 */
function isNetworkDegraded() {
    const quality = getConnectionQuality();
    return quality === ConnectionQuality.FAIR || quality === ConnectionQuality.POOR;
}

/**
 * Check if device is currently online
 * @returns {boolean} True if online
 */
function isOnline() {
    if (typeof navigator === 'undefined') {
        return true; // Assume online if navigator unavailable
    }
    return navigator.onLine !== false;
}

/**
 * Start monitoring network changes
 * @returns {Function} Stop monitoring function
 */
function startNetworkMonitoring() {
    if (typeof window === 'undefined' || networkState.isMonitoring) {
        return () => {};
    }

    networkState.isMonitoring = true;

    // Initial check
    networkState.currentQuality = getConnectionQuality();
    networkState.lastUpdate = Date.now();

    // Declare handleConnectionChange in outer scope for cleanup access
    let handleConnectionChange = null;

    // Listen for connection changes
    if (navigator.connection) {
        handleConnectionChange = () => {
            const oldQuality = networkState.currentQuality;
            const newQuality = getConnectionQuality();

            networkState.currentQuality = newQuality;
            networkState.lastUpdate = Date.now();

            // Notify listeners of quality change
            if (oldQuality !== newQuality) {
                networkState.listeners.forEach(listener => {
                    try {
                        listener(newQuality, oldQuality);
                    } catch (err) {
                        console.warn('[DeviceDetection] Network listener error:', err);
                    }
                });
            }
        };

        navigator.connection.addEventListener('change', handleConnectionChange);
    }

    // Listen for online/offline events
    const handleOnlineChange = () => {
        const isOnlineNow = isOnline();
        networkState.listeners.forEach(listener => {
            try {
                listener(
                    isOnlineNow ? ConnectionQuality.GOOD : ConnectionQuality.POOR,
                    isOnlineNow ? ConnectionQuality.POOR : ConnectionQuality.GOOD
                );
            } catch (err) {
                console.warn('[DeviceDetection] Online/offline listener error:', err);
            }
        });
    };

    window.addEventListener('online', handleOnlineChange);
    window.addEventListener('offline', handleOnlineChange);

    // Return cleanup function
    return () => {
        networkState.isMonitoring = false;
        if (navigator.connection && handleConnectionChange) {
            navigator.connection.removeEventListener('change', handleConnectionChange);
        }
        window.removeEventListener('online', handleOnlineChange);
        window.removeEventListener('offline', handleOnlineChange);
    };
}

/**
 * Add network quality change listener
 * @param {Function} listener - Callback function(quality, previousQuality)
 * @returns {Function} Remove listener function
 */
function onNetworkChange(listener) {
    networkState.listeners.push(listener);

    return () => {
        const index = networkState.listeners.indexOf(listener);
        if (index > -1) {
            networkState.listeners.splice(index, 1);
        }
    };
}

/**
 * Get current network state
 * @returns {Object} Network state information
 */
function getNetworkState() {
    return {
        quality: networkState.currentQuality,
        effectiveType: networkState.effectiveType,
        downlink: networkState.downlink,
        rtt: networkState.rtt,
        saveData: networkState.saveData,
        online: isOnline(),
        lastUpdate: networkState.lastUpdate,
    };
}

// ==========================================
// Visibility State Tracking
// ==========================================

/**
 * Visibility state with debouncing
 */
const visibilityState = {
    hidden: false,
    lastHidden: 0,
    lastVisible: Date.now(),
    hiddenDuration: 0,
    visibleDuration: 0,
    transitionCount: 0,
    listeners: [],
    isMonitoring: false,
};

/**
 * Get current visibility state
 * @returns {boolean} True if page is hidden
 */
function isPageHidden() {
    if (typeof document === 'undefined') {
        return false;
    }
    return document.hidden;
}

/**
 * Get visibility duration statistics
 * @returns {Object} Visibility statistics
 */
function getVisibilityStats() {
    return {
        currentlyHidden: visibilityState.hidden,
        hiddenDuration: visibilityState.hiddenDuration,
        visibleDuration: visibilityState.visibleDuration,
        transitionCount: visibilityState.transitionCount,
        lastHiddenAt: visibilityState.lastHidden,
        lastVisibleAt: visibilityState.lastVisible,
    };
}

/**
 * Start monitoring visibility changes
 * @returns {Function} Stop monitoring function
 */
function startVisibilityMonitoring() {
    if (typeof document === 'undefined' || visibilityState.isMonitoring) {
        return () => {};
    }

    visibilityState.isMonitoring = true;

    // Synchronize initial state to match document.hidden
    const now = Date.now();
    visibilityState.hidden = document.hidden;

    // Initialize timestamps consistently for accurate duration calculations
    if (document.hidden) {
        // Currently hidden: set both to now (zero elapsed time since state change)
        visibilityState.lastHidden = now;
        visibilityState.lastVisible = now; // No visible time elapsed yet
    } else {
        // Currently visible: set both to now (zero elapsed time since state change)
        visibilityState.lastVisible = now;
        visibilityState.lastHidden = now; // No hidden time elapsed yet
    }

    // Reset duration counters for clean state
    visibilityState.hiddenDuration = 0;
    visibilityState.visibleDuration = 0;
    visibilityState.transitionCount = 0;

    const handleVisibilityChange = () => {
        const wasHidden = visibilityState.hidden;
        const isHidden = document.hidden;
        const transitionTime = Date.now();

        if (wasHidden !== isHidden) {
            visibilityState.hidden = isHidden;
            visibilityState.transitionCount++;

            if (isHidden) {
                visibilityState.lastHidden = transitionTime;
                visibilityState.visibleDuration += transitionTime - visibilityState.lastVisible;
            } else {
                visibilityState.lastVisible = transitionTime;
                visibilityState.hiddenDuration += transitionTime - visibilityState.lastHidden;
            }

            // Notify listeners
            visibilityState.listeners.forEach(listener => {
                try {
                    listener(isHidden, transitionTime);
                } catch (err) {
                    console.warn('[DeviceDetection] Visibility listener error:', err);
                }
            });
        }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Return cleanup function
    return () => {
        visibilityState.isMonitoring = false;
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
}

/**
 * Add visibility change listener
 * @param {Function} listener - Callback function(hidden, timestamp)
 * @returns {Function} Remove listener function
 */
function onVisibilityChange(listener) {
    visibilityState.listeners.push(listener);

    return () => {
        const index = visibilityState.listeners.indexOf(listener);
        if (index > -1) {
            visibilityState.listeners.splice(index, 1);
        }
    };
}

// ==========================================
// Adaptive Timing Recommendations
// ==========================================

/**
 * Get adaptive timing configuration based on device and network
 * @returns {Object} Recommended timing configuration
 */
function getAdaptiveTiming() {
    const deviceInfo = getDeviceInfo();
    const networkInfo = getNetworkState();

    // Base timing configuration
    const timing = {
        // Heartbeat timing
        heartbeat: {
            intervalMs: 3000,
            maxMissed: 2,
            visibilityWaitMs: 5000,
        },
        // Election timing
        election: {
            windowMs: 300,
            calibrationIterations: 10000,
        },
        // Timeout multipliers
        multipliers: {
            mobile: 1.5,
            tablet: 1.2,
            desktop: 1.0,
        },
    };

    // Adjust for device type
    if (deviceInfo.isPhone) {
        timing.heartbeat.intervalMs = Math.round(3000 * timing.multipliers.mobile);
        timing.heartbeat.maxMissed = 3; // More tolerant on mobile
        timing.heartbeat.visibilityWaitMs = 8000; // Longer wait on mobile
        timing.election.windowMs = Math.round(300 * timing.multipliers.mobile);
    } else if (deviceInfo.isTablet) {
        timing.heartbeat.intervalMs = Math.round(3000 * timing.multipliers.tablet);
        timing.heartbeat.visibilityWaitMs = 6000;
        timing.election.windowMs = Math.round(300 * timing.multipliers.tablet);
    }

    // Adjust for network quality
    if (networkInfo.quality === ConnectionQuality.POOR) {
        timing.heartbeat.intervalMs *= 2;
        timing.heartbeat.maxMissed = 4; // Very tolerant on poor networks
    } else if (networkInfo.quality === ConnectionQuality.FAIR) {
        timing.heartbeat.intervalMs = Math.round(timing.heartbeat.intervalMs * 1.3);
        timing.heartbeat.maxMissed = 3;
    }

    return timing;
}

/**
 * Get recommended visibility wait time based on device and network
 * @returns {number} Recommended wait time in milliseconds
 */
function getRecommendedVisibilityWait() {
    const timing = getAdaptiveTiming();
    const deviceInfo = getDeviceInfo();
    const networkInfo = getNetworkState();

    let baseWait = timing.heartbeat.visibilityWaitMs;

    // Additional factors
    if (deviceInfo.deviceType === DeviceType.PHONE && networkInfo.saveData) {
        baseWait *= 1.5; // Even longer for data saver mode on phones
    }

    return Math.round(baseWait);
}

/**
 * Check if battery throttling is likely active
 * @returns {boolean} True if throttling is suspected
 */
function isBatteryThrottlingLikely() {
    if (typeof navigator === 'undefined') {
        return false;
    }

    // Check for common indicators of battery throttling
    const deviceInfo = getDeviceInfo();
    const networkInfo = getNetworkState();

    // Mobile + data saver = likely battery saver
    if (deviceInfo.isMobile && networkInfo.saveData) {
        return true;
    }

    // Low connection quality on mobile
    if (deviceInfo.isMobile && networkInfo.quality === ConnectionQuality.POOR) {
        return true;
    }

    return false;
}

// ==========================================
// Heartbeat Quality Monitoring
// ==========================================

/**
 * Heartbeat quality tracking
 */
const heartbeatQuality = {
    samples: [],
    maxSamples: 20,
    lastAnomalyTime: 0,
    anomalyCount: 0,
    isDegraded: false,
};

/**
 * Record heartbeat timing for quality monitoring
 * @param {number} intervalMs - Actual heartbeat interval
 */
function recordHeartbeatQuality(intervalMs) {
    const expectedInterval = getAdaptiveTiming().heartbeat.intervalMs;
    const variance = Math.abs(intervalMs - expectedInterval);
    const variancePercent = (variance / expectedInterval) * 100;

    heartbeatQuality.samples.push({
        timestamp: Date.now(),
        intervalMs,
        expectedInterval,
        variance,
        variancePercent,
        isAnomalous: variancePercent > 50, // 50% variance threshold
    });

    // Keep only recent samples
    if (heartbeatQuality.samples.length > heartbeatQuality.maxSamples) {
        heartbeatQuality.samples.shift();
    }

    // Check for throttling pattern
    checkHeartbeatDegradation();
}

/**
 * Check if heartbeat quality has degraded
 * @returns {boolean} True if degraded
 */
function checkHeartbeatDegradation() {
    const recentSamples = heartbeatQuality.samples.slice(-10);
    if (recentSamples.length < 5) {
        return false;
    }

    // Count anomalous samples
    const anomalousCount = recentSamples.filter(s => s.isAnomalous).length;
    const anomalyRate = (anomalousCount / recentSamples.length) * 100;

    // Degraded if > 30% of recent heartbeats are anomalous
    const wasDegraded = heartbeatQuality.isDegraded;
    heartbeatQuality.isDegraded = anomalyRate > 30;

    if (!wasDegraded && heartbeatQuality.isDegraded) {
        console.warn('[DeviceDetection] Heartbeat quality degraded:', {
            anomalyRate: anomalyRate.toFixed(1) + '%',
            recentSamples: recentSamples.length,
        });
    }

    return heartbeatQuality.isDegraded;
}

/**
 * Get heartbeat quality statistics
 * @returns {Object} Quality statistics
 */
function getHeartbeatQualityStats() {
    const samples = heartbeatQuality.samples;
    if (samples.length === 0) {
        return {
            sampleCount: 0,
            avgVariance: 0,
            maxVariance: 0,
            degraded: false,
        };
    }

    const variances = samples.map(s => s.variance);
    const avgVariance = variances.reduce((sum, v) => sum + v, 0) / variances.length;
    const maxVariance = Math.max(...variances);
    const anomalousCount = samples.filter(s => s.isAnomalous).length;

    return {
        sampleCount: samples.length,
        avgVariance: Math.round(avgVariance),
        maxVariance: Math.round(maxVariance),
        degraded: heartbeatQuality.isDegraded,
        anomalyRate: ((anomalousCount / samples.length) * 100).toFixed(1) + '%',
        recentSamples: samples.slice(-5).map(s => ({
            interval: Math.round(s.intervalMs),
            variance: Math.round(s.variance),
            variancePercent: s.variancePercent.toFixed(1) + '%',
        })),
    };
}

// ==========================================
// Public API
// ==========================================

export const DeviceDetection = {
    // Device detection
    detectDeviceType,
    detectDeviceCapability,
    isMobile,
    isPhone,
    getDeviceInfo,

    // Network monitoring
    getConnectionQuality,
    isNetworkDegraded,
    isOnline,
    startNetworkMonitoring,
    onNetworkChange,
    getNetworkState,

    // Visibility monitoring
    isPageHidden,
    getVisibilityStats,
    startVisibilityMonitoring,
    onVisibilityChange,

    // Adaptive timing
    getAdaptiveTiming,
    getRecommendedVisibilityWait,
    isBatteryThrottlingLikely,

    // Heartbeat quality
    recordHeartbeatQuality,
    getHeartbeatQualityStats,

    // Constants
    DeviceType,
    DeviceCapability,
    ConnectionQuality,
};

export default DeviceDetection;
