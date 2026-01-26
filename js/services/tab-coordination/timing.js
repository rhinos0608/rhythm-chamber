const TimingConfig = {
    election: {
        baselineMs: 300,
        maxWindowMs: 600,
        calibrationIterations: 10000,
        adaptiveMultiplier: 60
    },
    heartbeat: {
        intervalMs: 3000,
        maxMissed: 2,
        skewToleranceMs: 2000
    },
    failover: {
        promotionDelayMs: 100,
        verificationMs: 500
    },
    bootstrap: {
        windowMs: 2000
    }
};

let ELECTION_WINDOW_MS = calculateElectionWindow();

const MODULE_INIT_TIME = Date.now();
let unsignedMessageCount = 0;
const MAX_UNSIGNED_MESSAGES = 3;

const IS_TEST_ENV =
    (typeof import.meta !== 'undefined' && import.meta?.env?.MODE === 'test') ||
    (typeof process !== 'undefined' && !!process?.env?.VITEST);

function calculateElectionWindow() {
    const BASELINE_MS = TimingConfig?.election?.baselineMs ?? 300;
    const MAX_WINDOW_MS = TimingConfig?.election?.maxWindowMs ?? 600;
    const iterations = TimingConfig?.election?.calibrationIterations ?? 10000;
    const multiplier = TimingConfig?.election?.adaptiveMultiplier ?? 60;

    if (typeof performance === 'undefined' || !performance.now) {
        console.log('[TabCoordination] Performance API unavailable, using baseline');
        return BASELINE_MS;
    }

    try {
        const start = performance.now();
        let sum = 0;
        for (let i = 0; i < iterations; i++) {
            sum += Math.random();
        }
        void sum;

        const duration = performance.now() - start;
        const calculated = Math.round(Math.min(MAX_WINDOW_MS, Math.max(BASELINE_MS, duration * multiplier + BASELINE_MS)));
        console.log(`[TabCoordination] Device calibration: ${duration.toFixed(2)}ms → ${calculated}ms election window`);
        return calculated;
    } catch (e) {
        console.warn('[TabCoordination] Calibration failed, using baseline:', e.message);
        return BASELINE_MS;
    }
}

function isInBootstrapWindow() {
    if (IS_TEST_ENV) return true;
    const timeSinceInit = Date.now() - MODULE_INIT_TIME;
    return timeSinceInit < TimingConfig.bootstrap.windowMs;
}

function allowUnsignedMessage() {
    if (!isInBootstrapWindow()) {
        return false;
    }

    if (unsignedMessageCount >= MAX_UNSIGNED_MESSAGES) {
        console.warn('[TabCoordination] Bootstrap window unsigned message limit exceeded');
        return false;
    }

    unsignedMessageCount++;

    if (unsignedMessageCount === 1 && typeof document !== 'undefined') {
        window.dispatchEvent(new CustomEvent('security:unsigned-message', {
            detail: {
                message: 'Tab coordination is initializing. Some messages may not be fully verified.',
                severity: 'warning'
            }
        }));
    }

    return true;
}

function configureTiming(updates) {
    if (updates.election) {
        Object.assign(TimingConfig.election, updates.election);
        ELECTION_WINDOW_MS = calculateElectionWindow();
    }
    if (updates.heartbeat) {
        Object.assign(TimingConfig.heartbeat, updates.heartbeat);
    }
    if (updates.failover) {
        Object.assign(TimingConfig.failover, updates.failover);
    }
    if (updates.bootstrap) {
        Object.assign(TimingConfig.bootstrap, updates.bootstrap);
    }
}

function getElectionWindowMs() {
    return ELECTION_WINDOW_MS;
}

function getHeartbeatIntervalMs() {
    return TimingConfig.heartbeat.intervalMs;
}

function getMaxMissedHeartbeats() {
    return TimingConfig.heartbeat.maxMissed;
}

function getClockSkewToleranceMs() {
    return TimingConfig.heartbeat.skewToleranceMs;
}

export {
    TimingConfig,
    allowUnsignedMessage,
    configureTiming,
    getClockSkewToleranceMs,
    getElectionWindowMs,
    getHeartbeatIntervalMs,
    getMaxMissedHeartbeats,
    isInBootstrapWindow
};
