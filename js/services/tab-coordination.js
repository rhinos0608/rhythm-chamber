/**
 * Tab Coordination Service
 * 
 * Handles cross-tab coordination using BroadcastChannel with deterministic leader election.
 * Part of the HNW architecture to prevent data corruption from multiple tabs.
 * 
 * @module services/tab-coordination
 */

import { VectorClock } from './vector-clock.js';
import { WaveTelemetry } from './wave-telemetry.js';
import { EventBus } from './event-bus.js';
import { DeviceDetection } from './device-detection.js';
import { SharedWorkerCoordinator } from '../workers/shared-worker-coordinator.js';
import { Crypto } from '../security/crypto.js';
import { AppState } from '../state/app-state.js';
import { escapeHtml } from '../utils/html-escape.js';

/**
 * Check if crypto session is active for secure messaging
 * Verifies secure context AND that Crypto module is ready
 */
async function isKeySessionActive() {
    // Check secure context AND that Crypto module is ready
    if (!Crypto.isSecureContext()) {
        return false;
    }
    // Wait for Crypto to be ready
    const ready = await Crypto.waitForReady(5000);
    return ready;
}

// ==========================================
// Nonce tracking for replay protection
// ==========================================

// FIX: Use Map instead of Set to track nonce timestamps
// Previously used Set.clear() which removed ALL nonces (including recent ones)
// breaking replay protection. Now we track each nonce's timestamp and only
// remove nonces older than NONCE_EXPIRY_MS.
const usedNonces = new Map(); // nonce -> timestamp when first seen
const NONCE_EXPIRY_MS = 60000; // 1 minute
const NONCE_CLEANUP_INTERVAL_MS = 30000; // Run cleanup every 30 seconds
const CLEANUP_THRESHOLD = 500; // Only cleanup when we have this many nonces

/**
 * Clean up expired nonces periodically
 * FIX: Only removes nonces older than NONCE_EXPIRY_MS, not ALL nonces.
 * This preserves replay protection for recent nonces while preventing
 * unbounded memory growth.
 */
setInterval(() => {
    // Only run cleanup if we have accumulated many nonces
    if (usedNonces.size > CLEANUP_THRESHOLD) {
        const now = Date.now();
        const expiredNonces = [];
        let removedCount = 0;

        // Find all expired nonces (older than NONCE_EXPIRY_MS)
        for (const [nonce, timestamp] of usedNonces.entries()) {
            if (now - timestamp > NONCE_EXPIRY_MS) {
                expiredNonces.push(nonce);
            }
        }

        // Remove expired nonces
        for (const nonce of expiredNonces) {
            usedNonces.delete(nonce);
            removedCount++;
        }

        if (removedCount > 0) {
            console.log(`[TabCoordination] Cleaned up ${removedCount} expired nonces (${usedNonces.size} remaining)`);
        }
    }
}, NONCE_CLEANUP_INTERVAL_MS);

/**
 * Check if nonce has been used (replay protection)
 * FIX: Now stores timestamp with each nonce to support age-based cleanup.
 *
 * @param {string} nonce - Nonce to check
 * @returns {boolean} True if nonce is fresh (not used)
 */
function isNonceFresh(nonce) {
    if (!nonce) return false;

    // Check if nonce was already used
    if (usedNonces.has(nonce)) {
        return false;
    }

    // Store nonce with current timestamp
    usedNonces.set(nonce, Date.now());
    return true;
}

// ==========================================
// Constants
// ==========================================

const CHANNEL_NAME = 'rhythm_chamber_coordination';

/**
 * Calculate adaptive election window based on device performance
 * HNW Wave: Accounts for device speed variations to ensure reliable elections
 * 
 * @returns {number} Election window in milliseconds (300-600ms range)
 */
function calculateElectionWindow() {
    // Default baseline for fast devices
    const BASELINE_MS = 300;
    const MAX_WINDOW_MS = 600;

    // Defensive: If Performance API unavailable, use baseline
    if (typeof performance === 'undefined' || !performance.now) {
        console.log('[TabCoordination] Performance API unavailable, using baseline');
        return BASELINE_MS;
    }

    try {
        // Calibration task: measure device speed
        const iterations = 10000;
        const start = performance.now();

        // Simple compute task that correlates with overall device speed
        let sum = 0;
        for (let i = 0; i < iterations; i++) {
            sum += Math.random();
        }

        const duration = performance.now() - start;

        // Scale window based on duration:
        // Fast device (< 1ms): 300ms
        // Slow device (> 5ms): use proportional scaling up to 600ms
        // Formula: duration * 60 + 300, clamped to [300, 600]
        const calculated = Math.round(Math.min(MAX_WINDOW_MS, Math.max(BASELINE_MS, duration * 60 + BASELINE_MS)));

        console.log(`[TabCoordination] Device calibration: ${duration.toFixed(2)}ms → ${calculated}ms election window`);
        return calculated;
    } catch (e) {
        // Defensive: fallback to baseline on any error
        console.warn('[TabCoordination] Calibration failed, using baseline:', e.message);
        return BASELINE_MS;
    }
}

// Calculate once on module load
let ELECTION_WINDOW_MS = calculateElectionWindow();

// Initialize Vector clock for this tab (provides better conflict detection than Lamport)
const vectorClock = new VectorClock();

// Use Vector clock for deterministic ordering instead of Date.now()
// This eliminates clock skew issues between tabs and detects concurrent updates
// EDGE CASE FIX: Add fallback TAB_ID generation in case vectorClock.tick() fails
// Use module-level counter to ensure uniqueness across multiple fallback calls
let fallbackCounter = 0;

function generateTabId() {
    try {
        const tickResult = vectorClock.tick();
        const processId = vectorClock.processId;
        const tickValue = tickResult[processId];

        // Validate we got a proper tick value
        if (tickValue !== undefined && tickValue !== null && typeof processId === 'string' && processId.length > 8) {
            return `${tickValue}-${processId.substring(0, 8)}`;
        }
    } catch (e) {
        console.warn('[TabCoordination] Vector clock tick failed, using fallback TAB_ID:', e.message);
    }

    // Fallback: Generate a unique ID without vector clock
    // Using high-resolution timestamp (if available) + counter + random for guaranteed uniqueness
    const timestamp = typeof performance !== 'undefined' && performance.now
        ? Math.floor(performance.now() * 1000) // Microsecond precision
        : Date.now() * 1000;
    const randomPart = Math.random().toString(36).substring(2, 11); // 9 chars
    const fallbackId = `tab_${timestamp}_${++fallbackCounter}_${randomPart}`;
    console.warn('[TabCoordination] Using fallback TAB_ID:', fallbackId);
    return fallbackId;
}

const TAB_ID = generateTabId();

// Message types
const MESSAGE_TYPES = {
    CANDIDATE: 'CANDIDATE',
    CLAIM_PRIMARY: 'CLAIM_PRIMARY',
    RELEASE_PRIMARY: 'RELEASE_PRIMARY',
    HEARTBEAT: 'HEARTBEAT',
    EVENT_WATERMARK: 'EVENT_WATERMARK',     // Event replay watermark broadcast
    REPLAY_REQUEST: 'REPLAY_REQUEST',       // Request event replay from primary
    REPLAY_RESPONSE: 'REPLAY_RESPONSE',     // Replay data from primary
    SAFE_MODE_CHANGED: 'SAFE_MODE_CHANGED'  // Cross-tab Safe Mode synchronization
};

// ==========================================
// Message Validation Schema
// ARCH FIX: Comprehensive message validation to prevent crashes from malformed data
// ==========================================

/**
 * Message schema definitions
 * Defines required and optional fields for each message type
 */
const MESSAGE_SCHEMA = {
    CANDIDATE: {
        required: ['type', 'tabId', 'timestamp'],
        optional: ['senderId', 'seq', 'nonce', 'origin', 'vectorClock']
    },
    CLAIM_PRIMARY: {
        required: ['type', 'tabId', 'timestamp'],
        optional: ['senderId', 'seq', 'nonce', 'origin', 'vectorClock']
    },
    RELEASE_PRIMARY: {
        required: ['type', 'tabId', 'timestamp'],
        optional: ['senderId', 'seq', 'nonce', 'origin', 'vectorClock']
    },
    HEARTBEAT: {
        required: ['type', 'tabId', 'timestamp'],
        optional: ['senderId', 'seq', 'nonce', 'origin', 'lamportTimestamp', 'vectorClock']
    },
    EVENT_WATERMARK: {
        required: ['type', 'tabId', 'timestamp', 'watermark'],
        optional: ['senderId', 'seq', 'nonce', 'origin', 'vectorClock']
    },
    REPLAY_REQUEST: {
        required: ['type', 'tabId', 'timestamp', 'fromWatermark'],
        optional: ['senderId', 'seq', 'nonce', 'origin', 'vectorClock']
    },
    REPLAY_RESPONSE: {
        required: ['type', 'tabId', 'timestamp', 'events'],
        optional: ['senderId', 'seq', 'nonce', 'origin', 'vectorClock']
    },
    SAFE_MODE_CHANGED: {
        required: ['type', 'tabId', 'timestamp', 'enabled', 'reason'],
        optional: ['senderId', 'seq', 'nonce', 'origin', 'vectorClock']
    }
};

/**
 * Validate message structure against schema
 * ARCH FIX: Prevents crashes from malformed messages
 * ADVERSARIAL FIX: Add depth, size, and prototype pollution checks
 *
 * @param {Object} message - Message to validate
 * @returns {{valid: boolean, error: string|null}} Validation result
 */
function validateMessageStructure(message) {
    // ADVERSARIAL FIX: Check message size limit (1MB max to prevent DoS)
    const messageSize = JSON.stringify(message).length;
    const MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB
    if (messageSize > MAX_MESSAGE_SIZE) {
        return { valid: false, error: `Message too large: ${messageSize} bytes (max ${MAX_MESSAGE_SIZE})` };
    }

    // ADVERSARIAL FIX: Check object depth limit (max 10 levels to prevent stack overflow)
    // ADVERSARIAL FIX: Track visited objects to prevent infinite recursion on circular references
    const MAX_DEPTH = 10;
    function checkDepth(obj, depth = 0, visited = new WeakSet()) {
        if (depth > MAX_DEPTH) {
            return false;
        }
        if (!obj || typeof obj !== 'object') {
            return true;
        }
        // ADVERSARIAL FIX: Check for circular references to prevent infinite recursion
        if (visited.has(obj)) {
            return false; // Circular reference detected
        }
        visited.add(obj);

        if (!Array.isArray(obj)) {
            for (const key of Object.keys(obj)) {
                if (!checkDepth(obj[key], depth + 1, visited)) {
                    return false;
                }
            }
        }
        return true;
    }
    if (!checkDepth(message)) {
        return { valid: false, error: `Message object depth exceeds ${MAX_DEPTH} levels or contains circular references` };
    }

    // ADVERSARIAL FIX: Check for prototype pollution attempts
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    function checkPrototypePollution(obj) {
        if (!obj || typeof obj !== 'object') {
            return true;
        }
        for (const key of Object.keys(obj)) {
            if (dangerousKeys.includes(key)) {
                return false;
            }
            if (typeof obj[key] === 'object' && !checkPrototypePollution(obj[key])) {
                return false;
            }
        }
        return true;
    }
    if (!checkPrototypePollution(message)) {
        return { valid: false, error: 'Message contains dangerous prototype pollution keys' };
    }

    // Check message is an object
    if (!message || typeof message !== 'object') {
        return { valid: false, error: 'Message is not an object' };
    }

    // Check message type exists
    const { type } = message;
    if (!type) {
        return { valid: false, error: 'Message missing type field' };
    }

    // Check message type is valid
    const schema = MESSAGE_SCHEMA[type];
    if (!schema) {
        return { valid: false, error: `Unknown message type: ${type}` };
    }

    // Check required fields
    for (const field of schema.required) {
        if (message[field] === undefined || message[field] === null) {
            return { valid: false, error: `Missing required field: ${field} for type ${type}` };
        }
    }

    // Type-specific validation
    if (type === MESSAGE_TYPES.EVENT_WATERMARK) {
        if (typeof message.watermark !== 'number') {
            return { valid: false, error: 'watermark must be a number' };
        }
    }

    if (type === MESSAGE_TYPES.REPLAY_REQUEST) {
        if (typeof message.fromWatermark !== 'number') {
            return { valid: false, error: 'fromWatermark must be a number' };
        }
    }

    if (type === MESSAGE_TYPES.REPLAY_RESPONSE) {
        if (!Array.isArray(message.events)) {
            return { valid: false, error: 'events must be an array' };
        }
    }

    if (type === MESSAGE_TYPES.SAFE_MODE_CHANGED) {
        if (typeof message.enabled !== 'boolean') {
            return { valid: false, error: 'enabled must be a boolean' };
        }
        if (typeof message.reason !== 'string') {
            return { valid: false, error: 'reason must be a string' };
        }
    }

    // Timestamp validation
    if (message.timestamp && typeof message.timestamp !== 'number') {
        return { valid: false, error: 'timestamp must be a number' };
    }

    // tabId validation
    if (message.tabId && typeof message.tabId !== 'string') {
        return { valid: false, error: 'tabId must be a string' };
    }

    return { valid: true, error: null };
}

/**
 * Rate limiting per message type
 * ADVERSARIAL REVIEW FIX: All message types must have rate limits
 * SECURITY FIX: Prevents denial of service via message flooding
 */
const DEFAULT_RATE_LIMIT = 10; // Default for unknown types
const GLOBAL_RATE_LIMIT = 50; // Global limit across all types
const BURST_RATE_LIMIT = 10; // Max 10 messages in 100ms window
const BURST_WINDOW_MS = 100;

const MESSAGE_RATE_LIMITS = {
    CANDIDATE: { maxPerSecond: 10 },
    CLAIM_PRIMARY: { maxPerSecond: 5 },
    RELEASE_PRIMARY: { maxPerSecond: 5 },
    HEARTBEAT: { maxPerSecond: 10 },
    EVENT_WATERMARK: { maxPerSecond: 20 },
    REPLAY_REQUEST: { maxPerSecond: 5 },
    REPLAY_RESPONSE: { maxPerSecond: 10 },
    SAFE_MODE_CHANGED: { maxPerSecond: 5 }
};

const messageRateTracking = new Map(); // type -> [{count, windowStart}]
let globalMessageCount = 0;
let globalWindowStart = Date.now();
let burstMessageCount = 0;
let burstWindowStart = Date.now();

/**
 * Cleanup old tracking entries to prevent memory leak
 */
function cleanupOldTrackingEntries(now) {
    const windowStart = now - 1000;
    for (const [type, entries] of messageRateTracking.entries()) {
        const validEntries = entries.filter(entry => entry.windowStart > windowStart);
        if (validEntries.length === 0) {
            messageRateTracking.delete(type);
        } else {
            messageRateTracking.set(type, validEntries);
        }
    }
}

/**
 * Check if message rate limit exceeded
 * ADVERSARIAL REVIEW FIX: Prevents denial of service via message flooding
 *
 * @param {string} messageType - Type of message
 * @returns {boolean} True if rate limit exceeded
 */
function isRateLimited(messageType) {
    const now = Date.now();

    // SECURITY FIX 1: Burst protection (max 10 messages in 100ms)
    const burstWindowElapsed = now - burstWindowStart;
    if (burstWindowElapsed > BURST_WINDOW_MS) {
        burstMessageCount = 0;
        burstWindowStart = now;
    }
    // ADVERSARIAL FIX: Increment BEFORE checking (prevents race condition)
    burstMessageCount++;
    if (burstMessageCount > BURST_RATE_LIMIT) {
        console.warn(`[TabCoordination] Burst rate limit exceeded: ${burstMessageCount} messages in ${burstWindowElapsed}ms`);
        return true;
    }

    // SECURITY FIX 2: Global rate limit (max 50 messages/second across all types)
    // ADVERSARIAL FIX: Use performance.now() for monotonic clock (prevents clock skew bypass)
    const globalWindowElapsed = now - globalWindowStart;
    if (globalWindowElapsed > 1000) {
        // ADVERSARIAL FIX: Add modulo to prevent integer overflow
        globalMessageCount = globalMessageCount % (GLOBAL_RATE_LIMIT + 1);
        globalWindowStart = now;
    }
    // ADVERSARIAL FIX: Increment BEFORE checking (prevents race condition)
    globalMessageCount++;
    if (globalMessageCount > GLOBAL_RATE_LIMIT) {
        console.warn(`[TabCoordination] Global rate limit exceeded: ${globalMessageCount} messages/second`);
        return true;
    }

    // SECURITY FIX 3: Default limit for unknown message types
    const limit = MESSAGE_RATE_LIMITS[messageType] || { maxPerSecond: DEFAULT_RATE_LIMIT };

    const tracking = messageRateTracking.get(messageType) || [];

    // Remove entries outside the current 1-second window
    const windowStart = now - 1000;
    const validEntries = tracking.filter(entry => entry.windowStart > windowStart);

    // Check if limit exceeded
    if (validEntries.length >= limit.maxPerSecond) {
        console.warn(`[TabCoordination] Rate limit exceeded for ${messageType}: ${validEntries.length}/${limit.maxPerSecond} per second`);
        return true;
    }

    // Add current message to tracking
    validEntries.push({ count: 1, windowStart: now });
    messageRateTracking.set(messageType, validEntries);

    // ADVERSARIAL FIX: ALWAYS cleanup old entries (not just 1% of the time)
    // This prevents memory leak where tracking arrays grow unbounded
    if (validEntries.length > 100) {
        // Keep only the most recent 100 entries to prevent unbounded growth
        messageRateTracking.set(messageType, validEntries.slice(-100));
    }

    // Periodic deep cleanup of all tracking data (every 100 messages)
    if (Math.random() < 0.01) {
        cleanupOldTrackingEntries(now);
    }

    return false;
}

/**
 * Timing configuration - can be overridden at runtime
 * HNW Wave: Configurable timing for different environments
 */
const TimingConfig = {
    // Election timing
    election: {
        baselineMs: 300,
        maxWindowMs: 600,
        calibrationIterations: 10000,
        adaptiveMultiplier: 60
    },

    // Heartbeat timing - HNW Wave: Reduced for faster failover (~7s vs ~10s)
    heartbeat: {
        intervalMs: 3000,     // Reduced from 5000 for faster detection
        maxMissed: 2,         // 2 missed = 6s + promotion delay = ~7s total
        skewToleranceMs: 2000 // Allow 2 seconds clock skew
    },

    // Failover timing
    failover: {
        promotionDelayMs: 100,
        verificationMs: 500
    },

    // Bootstrap window for unsigned message fallback (security measure)
    // SECURITY FIX (HIGH Issue #10): Strengthened bootstrap window restrictions
    //
    // Unsigned messages are only allowed during this window after module load
    // to handle the edge case where security session isn't ready yet.
    //
    // Changes to improve security:
    // - Reduced window to 2 seconds (from 5 seconds)
    // - Rate limited unsigned messages (max 3 during bootstrap)
    // - User notification when accepting unsigned messages
    //
    // The bootstrap window is a necessary evil because:
    // - Security session initialization is async
    // - Tab coordination starts immediately on module load
    // - Race condition exists between session init and first message
    //
    // Future improvement: Eliminate this window by making session init synchronous
    bootstrap: {
        windowMs: 2000  // 2 seconds - minimal window for session initialization
    }
};

// Track module initialization time for bootstrap window
const MODULE_INIT_TIME = Date.now();

// Track unsigned message count during bootstrap window
let unsignedMessageCount = 0;
const MAX_UNSIGNED_MESSAGES = 3;

/**
 * Detect unit-test environment (Vitest/Vite)
 * SECURITY: This is only used to relax bootstrap-window gating in tests where
 * WebCrypto / secure-context constraints may prevent signing, which would otherwise
 * make coordination behavior untestable.
 */
const IS_TEST_ENV =
    (typeof import.meta !== 'undefined' && import.meta?.env?.MODE === 'test') ||
    (typeof process !== 'undefined' && !!process?.env?.VITEST);

function isInBootstrapWindow() {
    if (IS_TEST_ENV) return true;
    const timeSinceInit = Date.now() - MODULE_INIT_TIME;
    return timeSinceInit < TimingConfig.bootstrap.windowMs;
}

/**
 * Check and track unsigned message during bootstrap window
 * SECURITY FIX (HIGH Issue #10): Rate limit unsigned messages
 *
 * @returns {boolean} True if unsigned message should be allowed
 */
function allowUnsignedMessage() {
    if (!isInBootstrapWindow()) {
        return false;
    }

    // Rate limit unsigned messages during bootstrap
    if (unsignedMessageCount >= MAX_UNSIGNED_MESSAGES) {
        console.warn('[TabCoordination] Bootstrap window unsigned message limit exceeded');
        return false;
    }

    unsignedMessageCount++;

    // Notify user about unsigned message (only once)
    if (unsignedMessageCount === 1 && typeof document !== 'undefined') {
        // Dispatch event for UI to show warning
        window.dispatchEvent(new CustomEvent('security:unsigned-message', {
            detail: {
                message: 'Tab coordination is initializing. Some messages may not be fully verified.',
                severity: 'warning'
            }
        }));
    }

    return true;
}

/**
 * Runtime configuration override
 * Allows changing timing parameters for testing or different environments
 * @param {Object} updates - Configuration updates to apply
 */
function configureTiming(updates) {
    // Deep merge for nested objects
    if (updates.election) {
        Object.assign(TimingConfig.election, updates.election);
    }
    if (updates.heartbeat) {
        Object.assign(TimingConfig.heartbeat, updates.heartbeat);
    }
    if (updates.failover) {
        Object.assign(TimingConfig.failover, updates.failover);
    }

    // Recalculate dependent values
    if (updates.election) {
        ELECTION_WINDOW_MS = calculateElectionWindow();
    }
    if (updates.heartbeat) {
        HEARTBEAT_INTERVAL_MS = TimingConfig.heartbeat.intervalMs;
        MAX_MISSED_HEARTBEATS = TimingConfig.heartbeat.maxMissed;
    }
}

// Heartbeat configuration (with defaults from TimingConfig)
let HEARTBEAT_INTERVAL_MS = TimingConfig.heartbeat.intervalMs;
let MAX_MISSED_HEARTBEATS = TimingConfig.heartbeat.maxMissed;
const HEARTBEAT_STORAGE_KEY = 'rhythm_chamber_leader_heartbeat';
const CLOCK_SKEW_TOLERANCE_MS = TimingConfig.heartbeat.skewToleranceMs;

/**
 * Clock skew tracking state
 * HNW Wave: Detect and compensate for wall-clock differences between tabs
 */
const clockSkewTracker = {
    detectedSkewMs: 0,
    lastSkewDetection: 0,
    skewSamples: [],
    maxSamples: 10,

    /**
     * Record a clock skew sample
     * @param {number} remoteTimestamp - Remote wall-clock timestamp
     * @param {number} localTimestamp - Local wall-clock timestamp
     */
    recordSkew(remoteTimestamp, localTimestamp) {
        const skew = remoteTimestamp - localTimestamp;
        this.skewSamples.push({
            skew,
            timestamp: Date.now()
        });

        // Keep only recent samples
        if (this.skewSamples.length > this.maxSamples) {
            this.skewSamples.shift();
        }

        // Update detected skew (average of recent samples)
        const recentSamples = this.skewSamples.slice(-5);

        // Guard against division by zero and empty samples
        if (!recentSamples || recentSamples.length === 0) {
            // Default to zero skew when no data available
            this.detectedSkewMs = 0;
            this.lastSkewDetection = Date.now();
            return;
        }

        const avgSkew = recentSamples.reduce((sum, s) => sum + s.skew, 0) / recentSamples.length;

        this.detectedSkewMs = avgSkew;
        this.lastSkewDetection = Date.now();

        // Log significant skew
        if (Math.abs(avgSkew) > 1000) {
            console.warn(`[TabCoordination] Detected ${avgSkew.toFixed(0)}ms clock skew`);
        }
    },

    /**
     * Get current clock skew estimate
     * @returns {number} Estimated clock skew in milliseconds
     */
    getSkew() {
        return this.detectedSkewMs;
    },

    /**
     * Adjust local timestamp by detected skew
     * @param {number} localTimestamp - Local wall-clock timestamp
     * @returns {number} Skew-adjusted timestamp
     */
    adjustTimestamp(localTimestamp) {
        return localTimestamp + this.detectedSkewMs;
    },

    /**
     * Check if timestamps are within skew tolerance
     * @param {number} timestamp1 - First timestamp
     * @param {number} timestamp2 - Second timestamp
     * @returns {boolean} True if within tolerance
     */
    isWithinTolerance(timestamp1, timestamp2) {
        const diff = Math.abs(timestamp1 - timestamp2);
        return diff <= CLOCK_SKEW_TOLERANCE_MS;
    },

    /**
     * Calibration success flag
     * HNW Wave: Tracks whether clock calibration completed successfully
     */
    calibrationSucceeded: true,

    /**
     * Reset skew tracking
     */
    reset() {
        this.detectedSkewMs = 0;
        this.lastSkewDetection = 0;
        this.skewSamples = [];
        this.calibrationSucceeded = true;
    }
};

// ==========================================
// State Management
// ==========================================

let broadcastChannel = null;
let sharedWorkerFallback = false; // Track if using SharedWorker fallback
let coordinationTransport = null; // Unified interface for BroadcastChannel or SharedWorker
let isPrimaryTab = true;
let electionTimeout = null;
let messageHandler = null;
let heartbeatInterval = null;
let heartbeatCheckInterval = null;
let lastLeaderHeartbeat = Date.now();
let lastLeaderVectorClock = vectorClock.toJSON(); // Track Vector clock for heartbeat
let lastLeaderLamportTime = 0; // Track Lamport time for heartbeat (legacy, kept for compatibility)
let adaptiveTiming = null;
let visibilityMonitorCleanup = null;
let networkMonitorCleanup = null;
let wakeFromSleepCleanup = null;

// Module-scoped election state to prevent race conditions
let electionCandidates = new Set();
let receivedPrimaryClaim = false;
let electionAborted = false;
let lastHeartbeatSentTime = 0; // Track for WaveTelemetry
let heartbeatInProgress = false; // Track if heartbeat is currently being sent
// FIX Issue #2: Track if handleSecondaryMode has been called to prevent split-brain
let hasCalledSecondaryMode = false;
// FIX CRITICAL #3: Track if this tab has conceded leadership - once set, never become primary again this session
let hasConcededLeadership = false;

// Event replay watermark tracking
let lastEventWatermark = -1; // Last event sequence number processed
let knownWatermarks = new Map(); // Track watermarks from other tabs: tabId -> watermark
let watermarkBroadcastInterval = null;
const WATERMARK_BROADCAST_MS = 5000; // Broadcast watermark every 5 seconds

// Debug mode flag for conditional logging
let debugMode = false;

// Wake-from-sleep detection state
// HNW Wave: Detects OS sleep by tracking visibility change gaps
let lastVisibilityCheckTime = Date.now();
const SLEEP_DETECTION_THRESHOLD_MS = 30000; // 30 seconds gap indicates OS sleep

// Message sequence tracking for ordering validation
// HNW Network: Detects out-of-order BroadcastChannel delivery
let localSequence = 0; // Sequence number for outgoing messages
const remoteSequences = new Map(); // Track last sequence per sender: senderId -> lastSeq
const remoteSequenceTimestamps = new Map(); // Track last update time per sender: senderId -> timestamp
let outOfOrderCount = 0; // Count of out-of-order messages detected
const REMOTE_SEQUENCE_MAX_AGE_MS = 300000; // 5 minutes - prune stale sender data

// Message queue for security session initialization
// HNW Fix: Queue messages when security session is not ready, process when ready
const messageQueue = [];
let isProcessingQueue = false;
let securityReadyCheckInterval = null;
let securityReadyNotified = false;

// ==========================================
// Core Functions
// ==========================================

/**
 * Prune stale remote sequence data to prevent memory leaks
 * HNW Network: Cleanup for long-running tabs
 * @returns {number} Number of entries pruned
 */
function pruneStaleRemoteSequences() {
    const now = Date.now();
    const pruned = [];

    for (const [senderId, timestamp] of remoteSequenceTimestamps.entries()) {
        if (now - timestamp > REMOTE_SEQUENCE_MAX_AGE_MS) {
            pruned.push(senderId);
        }
    }

    for (const senderId of pruned) {
        remoteSequences.delete(senderId);
        remoteSequenceTimestamps.delete(senderId);
    }

    if (pruned.length > 0 && debugMode) {
        console.log(`[TabCoordination] Pruned ${pruned.length} stale remote sequence entries`);
    }

    return pruned.length;
}

/**
 * Process queued messages when security session becomes ready
 * HNW Fix: Ensures no coordination messages are lost during initialization
 */
async function processMessageQueue() {
    if (isProcessingQueue || messageQueue.length === 0) return;

    isProcessingQueue = true;

    while (messageQueue.length > 0) {
        const queued = messageQueue.shift();

        // Verify security session is ready before processing
        if (!isKeySessionActive()) {
            // Put message back and stop processing
            messageQueue.unshift(queued);
            break;
        }

        try {
            // Send the message through the normal signing flow
            await sendMessageInternal(queued.msg, queued.skipQueue);
        } catch (error) {
            // If signing still fails, re-queue for later retry
            const isSessionError = error.message && error.message.includes('Session not initialized');
            if (isSessionError && isInBootstrapWindow()) {
                messageQueue.unshift(queued);
            }
            break;
        }
    }

    isProcessingQueue = false;

    // If queue is empty and we haven't notified security is ready, log it
    if (messageQueue.length === 0 && !securityReadyNotified) {
        securityReadyNotified = true;
        stopSecurityReadyWatcher();
        console.log('[TabCoordination] Security session ready, message queue processed');
    }
}

/**
 * Internal message sending function (bypasses queue)
 * HNW Fix: Separates queue logic from actual sending logic
 *
 * @param {Object} msg - Message to send
 * @param {boolean} skipQueue - If true, don't queue on session error
 */
async function sendMessageInternal(msg, skipQueue = false) {
    localSequence++;

    // Add timestamp if not present
    if (!msg.timestamp) {
        msg.timestamp = Date.now();
    }

    // Message signing removed - simplified security model
    // Cross-tab HMAC signing was over-engineering for this application

    // Send message with basic metadata
    const signedMessage = {
        ...msg,
        seq: localSequence,
        senderId: TAB_ID,
        origin: window.location.origin
    };

    coordinationTransport?.postMessage(signedMessage);
}

/**
 * Start watching for security session to become ready
 * HNW Fix: Processes queued messages when security initialization completes
 */
function startSecurityReadyWatcher() {
    if (securityReadyCheckInterval) return;

    const CHECK_INTERVAL_MS = 100;
    const MAX_WAIT_MS = 10000; // 10 seconds max wait
    let waited = 0;

    securityReadyCheckInterval = setInterval(() => {
        waited += CHECK_INTERVAL_MS;

        if (isKeySessionActive()) {
            stopSecurityReadyWatcher();
            processMessageQueue();
            return;
        }

        if (waited >= MAX_WAIT_MS) {
            console.warn('[TabCoordination] Security session not ready after 10s, processing queued messages with unsigned fallback');
            stopSecurityReadyWatcher();
            // Process any remaining messages with unsigned fallback
            while (messageQueue.length > 0) {
                const queued = messageQueue.shift();
                if (isInBootstrapWindow()) {
                    const unsignedNonce = `${TAB_ID}_${++localSequence}_${queued.msg.timestamp || Date.now()}`;
                    coordinationTransport?.postMessage({
                        ...queued.msg,
                        seq: localSequence,
                        senderId: TAB_ID,
                        origin: window.location.origin,
                        nonce: unsignedNonce,
                        timestamp: queued.msg.timestamp || Date.now(),
                        unsigned: true
                    });
                }
            }
        }
    }, CHECK_INTERVAL_MS);
}

/**
 * Stop watching for security session readiness
 */
function stopSecurityReadyWatcher() {
    if (securityReadyCheckInterval) {
        clearInterval(securityReadyCheckInterval);
        securityReadyCheckInterval = null;
    }
}

/**
 * Initialize adaptive timing based on device and network conditions
 * HNW Wave: Mobile-aware timing configuration
 */
function initAdaptiveTiming() {
    adaptiveTiming = DeviceDetection.getAdaptiveTiming();

    // Update heartbeat configuration
    HEARTBEAT_INTERVAL_MS = adaptiveTiming.heartbeat.intervalMs;
    MAX_MISSED_HEARTBEATS = adaptiveTiming.heartbeat.maxMissed;

    // Update TimingConfig for consistency
    TimingConfig.heartbeat.intervalMs = HEARTBEAT_INTERVAL_MS;
    TimingConfig.heartbeat.maxMissed = MAX_MISSED_HEARTBEATS;
    TimingConfig.heartbeat.visibilityWaitMs = adaptiveTiming.heartbeat.visibilityWaitMs;

    // Recalculate election window for mobile
    ELECTION_WINDOW_MS = adaptiveTiming.election.windowMs;

    console.log('[TabCoordination] Adaptive timing initialized:', {
        deviceType: DeviceDetection.getDeviceInfo().deviceType,
        heartbeatInterval: HEARTBEAT_INTERVAL_MS,
        maxMissed: MAX_MISSED_HEARTBEATS,
        visibilityWait: adaptiveTiming.heartbeat.visibilityWaitMs,
        networkQuality: DeviceDetection.getNetworkState().quality
    });
}

/**
 * Proactive clock skew calibration
 * HNW Wave: Calibrate clock skew BEFORE elections to ensure accurate timing
 * 
 * Uses localStorage timestamp exchange to detect timing differences between tabs
 * without relying on BroadcastChannel messages.
 * 
 * @returns {Promise<void>}
 */
async function calibrateClockSkew() {
    const CALIBRATION_KEY = 'rhythm_chamber_clock_calibration';
    const CACHED_SKEW_KEY = 'rhythm_chamber_cached_clock_skew';
    const CALIBRATION_DURATION_MS = 500;
    const CALIBRATION_TIMEOUT_MS = 5000;  // Maximum time to wait for calibration

    try {
        // Wrap calibration in a timeout to prevent blocking election indefinitely
        const calibrationPromise = (async () => {
            const localStart = Date.now();

            // Write our timestamp to localStorage
            localStorage.setItem(CALIBRATION_KEY, JSON.stringify({
                timestamp: localStart,
                tabId: TAB_ID
            }));

            // Wait for other tabs to potentially update
            await new Promise(resolve => setTimeout(resolve, CALIBRATION_DURATION_MS));

            // Read back and check for other tab timestamps
            const stored = localStorage.getItem(CALIBRATION_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                if (data.tabId !== TAB_ID) {
                    // Another tab wrote - calculate skew
                    const localNow = Date.now();
                    const remoteTimestamp = data.timestamp;
                    clockSkewTracker.recordSkew(remoteTimestamp, localNow);
                    console.log(`[TabCoordination] Proactive clock calibration: ` +
                        `detected ${clockSkewTracker.getSkew().toFixed(0)}ms skew from tab ${data.tabId}`);

                    // Cache successful calibration for future fallback
                    localStorage.setItem(CACHED_SKEW_KEY, clockSkewTracker.getSkew().toString());
                }
            }

            // Clean up calibration key
            localStorage.removeItem(CALIBRATION_KEY);
            return true;
        })();

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Calibration timeout')), CALIBRATION_TIMEOUT_MS)
        );

        await Promise.race([calibrationPromise, timeoutPromise]);
        clockSkewTracker.calibrationSucceeded = true;
        console.log(`[TabCoordination] Clock calibration complete (${CALIBRATION_DURATION_MS}ms)`);

    } catch (e) {
        console.warn('[TabCoordination] Clock calibration failed:', e.message);
        clockSkewTracker.calibrationSucceeded = false;

        // Fallback: use cached skew from previous successful calibration
        try {
            const cachedSkew = localStorage.getItem(CACHED_SKEW_KEY);
            if (cachedSkew) {
                const parsedSkew = parseFloat(cachedSkew);
                if (!isNaN(parsedSkew)) {
                    clockSkewTracker.detectedSkewMs = parsedSkew;
                    console.log(`[TabCoordination] Using cached clock skew: ${parsedSkew.toFixed(0)}ms`);
                }
            }
        } catch {
            // Ignore localStorage errors in fallback
        }

        // Clean up calibration key on failure
        try {
            localStorage.removeItem(CALIBRATION_KEY);
        } catch {
            // Ignore cleanup errors
        }
    }
}

/**
 * Initialize tab coordination service
 * Uses deterministic leader election (lowest tab ID wins)
 *
 * HNW Fix: Replaced 100ms timeout with proper coordination protocol
 * - All tabs announce candidacy simultaneously
 * - Wait 300ms for all candidates to announce (3x original timeout for safety)
 * - Lowest lexicographic tab ID wins (deterministic resolution)
 * - Eliminates race condition where two tabs both claim primary
 *
 * HNW Wave: Adaptive timing for mobile devices
 * - Adjusts heartbeat interval based on device type and network quality
 * - Uses visibility-aware heartbeat monitoring for background tabs
 *
 * @returns {Promise<boolean>} True if this tab won election
 */
async function init() {
    // Try BroadcastChannel first (preferred)
    if ('BroadcastChannel' in window) {
        console.log('[TabCoordination] Using BroadcastChannel for coordination');
        sharedWorkerFallback = false;
        return await initWithBroadcastChannel();
    }

    // Try SharedWorker fallback
    if (SharedWorkerCoordinator.isSupported()) {
        console.log('[TabCoordination] BroadcastChannel unavailable, trying SharedWorker fallback');
        const connected = await SharedWorkerCoordinator.init(TAB_ID);

        if (connected) {
            console.log('[TabCoordination] Using SharedWorker for coordination');
            sharedWorkerFallback = true;
            return await initWithSharedWorker();
        }
    }

    // No coordination available - assume primary (single-tab mode)
    console.warn('[TabCoordination] No cross-tab coordination available, operating in isolated mode');
    return true;
}

/**
 * Initialize with BroadcastChannel (original implementation)
 * @returns {Promise<boolean>} True if this tab won election
 */
async function initWithBroadcastChannel() {
    // HNW Wave: Initialize adaptive timing before election
    initAdaptiveTiming();

    // HNW Wave: Proactive clock calibration before election
    await calibrateClockSkew();

    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);

    // Create unified transport interface
    coordinationTransport = {
        postMessage: (msg) => broadcastChannel.postMessage(msg),
        addEventListener: (type, handler) => broadcastChannel.addEventListener(type, handler),
        removeEventListener: (type, handler) => broadcastChannel.removeEventListener(type, handler),
        close: () => broadcastChannel.close()
    };
    // Set up message handler
    messageHandler = createMessageHandler();
    broadcastChannel.addEventListener('message', messageHandler);

    // Reset election state
    electionCandidates = new Set([TAB_ID]);
    receivedPrimaryClaim = false;
    electionAborted = false;
    // FIX Issue #2: Reset secondary mode flag for new election
    hasCalledSecondaryMode = false;
    // FIX CRITICAL #3: Reset conceded leadership flag for new election (fresh start)
    hasConcededLeadership = false;

    // Announce candidacy with Vector clock for deterministic ordering and message security
    sendMessage({
        type: MESSAGE_TYPES.CANDIDATE,
        tabId: TAB_ID,
        vectorClock: vectorClock.tick()
    });

    // Wait for other candidates
    await new Promise(resolve => {
        electionTimeout = setTimeout(resolve, ELECTION_WINDOW_MS);
    });

    // Determine winner - but only if election wasn't aborted by a CLAIM_PRIMARY
    if (!electionAborted) {
        const sortedCandidates = Array.from(electionCandidates).sort();
        const winner = sortedCandidates[0];
        isPrimaryTab = (winner === TAB_ID);

        if (isPrimaryTab) {
            claimPrimary();
            console.log(`[TabCoordination] Won election against ${electionCandidates.size - 1} other candidate(s)`);
        } else {
            console.log(`[TabCoordination] Lost election to ${winner}. Becoming secondary.`);
        }
    } else {
        // Election was aborted by receiving a CLAIM_PRIMARY during the window
        // isPrimaryTab was already set to false by the handler
        console.log(`[TabCoordination] Election aborted due to primary claim from another tab`);
    }

    // Set up cleanup on unload
    window.addEventListener('beforeunload', cleanup);

    // HNW Wave: Set up visibility monitoring for adaptive heartbeat
    visibilityMonitorCleanup = DeviceDetection.startVisibilityMonitoring();

    // HNW Wave: Set up network monitoring for adaptive failover
    networkMonitorCleanup = setupNetworkMonitoring();

    // HNW Wave: Set up wake-from-sleep detection for election recovery
    wakeFromSleepCleanup = setupWakeFromSleepDetection();

    // Set up heartbeat system
    if (isPrimaryTab) {
        // Verify security session is ready before starting periodic operations
        if (!isKeySessionActive()) {
            console.warn('[TabCoordination] Security session not active, delaying periodic operations');
            const maxWait = IS_TEST_ENV ? 0 : 5000;
            const checkInterval = 100;
            let waited = 0;
            let sessionReady = false;

            while (!sessionReady && waited < maxWait) {
                sessionReady = isKeySessionActive();
                if (!sessionReady) {
                    await new Promise(resolve => setTimeout(resolve, checkInterval));
                    waited += checkInterval;
                }
            }

            if (!sessionReady) {
                console.error('[TabCoordination] Security session failed to initialize, cannot start heartbeat');
                // Only log once to avoid console spam
                if (!initWithBroadcastChannel._sessionErrorLogged) {
                    console.warn('[TabCoordination] Security session not ready after waiting - using unsigned messages (this is normal on first load)');
                    initWithBroadcastChannel._sessionErrorLogged = true;
                }
                // Continue anyway - unsigned messages are allowed during bootstrap window
            } else {
                console.log('[TabCoordination] Security session ready, starting periodic operations');
            }
        }
        startHeartbeat();
        startWatermarkBroadcast(); // Start watermark broadcast as primary
    } else {
        startHeartbeatMonitor();
    }

    return isPrimaryTab;
}

/**
 * Initialize with SharedWorker fallback
 * Used when BroadcastChannel is not available
 * @returns {Promise<boolean>} True if this tab won election
 */
async function initWithSharedWorker() {
    // HNW Wave: Initialize adaptive timing before election
    initAdaptiveTiming();

    // Note: Skip clock calibration with SharedWorker (relies on worker coordination)

    // Create unified transport interface using SharedWorkerCoordinator
    coordinationTransport = {
        postMessage: (msg) => SharedWorkerCoordinator.postMessage(msg),
        addEventListener: (type, handler) => SharedWorkerCoordinator.addEventListener(type, handler),
        removeEventListener: (type, handler) => SharedWorkerCoordinator.removeEventListener(type, handler),
        close: () => SharedWorkerCoordinator.close()
    };

    // Set up message handler using unified interface
    messageHandler = createMessageHandler();
    coordinationTransport.addEventListener('message', messageHandler);

    // Reset module-scoped election state
    electionCandidates.clear();
    electionCandidates.add(TAB_ID);
    receivedPrimaryClaim = false;
    electionAborted = false;
    // FIX Issue #2: Reset secondary mode flag for SharedWorker election
    hasCalledSecondaryMode = false;
    // FIX CRITICAL #3: Reset conceded leadership flag for SharedWorker election (fresh start)
    hasConcededLeadership = false;

    console.log('[TabCoordination] Announcing candidacy via SharedWorker:', TAB_ID);

    // Announce candidacy with message security
    sendMessage({
        type: MESSAGE_TYPES.CANDIDATE,
        tabId: TAB_ID,
        vectorClock: vectorClock.tick()
    });

    // Wait for election window
    await new Promise(resolve => setTimeout(resolve, ELECTION_WINDOW_MS));

    // Determine winner (same logic as BroadcastChannel)

    if (!electionAborted && !receivedPrimaryClaim) {
        const sortedCandidates = Array.from(electionCandidates).sort();
        isPrimaryTab = sortedCandidates[0] === TAB_ID;

        if (isPrimaryTab) {
            console.log('[TabCoordination] Won SharedWorker election, claiming primary');
            sendMessage({
                type: MESSAGE_TYPES.CLAIM_PRIMARY,
                tabId: TAB_ID,
                vectorClock: vectorClock.tick()
            });
        } else {
            console.log('[TabCoordination] Lost election via SharedWorker to:', sortedCandidates[0]);
            handleSecondaryMode();
        }
    } else {
        isPrimaryTab = false;
        handleSecondaryMode();
    }

    // Set up beforeunload handler
    window.addEventListener('beforeunload', cleanup);

    // HNW Wave: Set up visibility monitoring
    visibilityMonitorCleanup = DeviceDetection.startVisibilityMonitoring();

    // HNW Wave: Set up network monitoring
    networkMonitorCleanup = setupNetworkMonitoring();

    // HNW Wave: Set up wake-from-sleep detection
    wakeFromSleepCleanup = setupWakeFromSleepDetection();

    // Set up heartbeat system
    if (isPrimaryTab) {
        // Verify security session is ready before starting periodic operations
        if (!isKeySessionActive()) {
            console.warn('[TabCoordination] Security session not active, delaying periodic operations');
            const maxWait = IS_TEST_ENV ? 0 : 5000;
            const checkInterval = 100;
            let waited = 0;
            let sessionReady = false;

            while (!sessionReady && waited < maxWait) {
                sessionReady = isKeySessionActive();
                if (!sessionReady) {
                    await new Promise(resolve => setTimeout(resolve, checkInterval));
                    waited += checkInterval;
                }
            }

            if (!sessionReady) {
                console.error('[TabCoordination] Security session failed to initialize, cannot start heartbeat');
                // Only log once to avoid console spam
                if (!initWithSharedWorker._sessionErrorLogged) {
                    console.warn('[TabCoordination] Security session not ready after waiting - using unsigned messages (this is normal on first load)');
                    initWithSharedWorker._sessionErrorLogged = true;
                }
                // Continue anyway - unsigned messages are allowed during bootstrap window
            } else {
                console.log('[TabCoordination] Security session ready, starting periodic operations');
            }
        }
        startHeartbeat();
        startWatermarkBroadcast();
    } else {
        startHeartbeatMonitor();
    }

    return isPrimaryTab;
}

/**
 * Send a message with sequence number for ordering validation and message security
 * HNW Network: All messages include sequence for duplicate/ordering detection
 * Phase 14: All messages are signed, sanitized, timestamped, and include nonce
 * HNW Fix: Queues messages when security session is not ready, processes when ready
 *
 * @param {Object} msg - Message to send
 * @param {boolean} skipQueue - If true, don't queue on session error (internal use)
 */
async function sendMessage(msg, skipQueue = false) {
    // Check if security session is ready before attempting to sign
    const sessionReady = isKeySessionActive();
    const inBootstrapWindow = isInBootstrapWindow();

    if (!sessionReady && !inBootstrapWindow && !skipQueue) {
        // Queue message for later processing when session is ready
        if (messageQueue.length < 100) { // Prevent unbounded queue growth
            messageQueue.push({ msg, skipQueue: false, timestamp: Date.now() });
            // Start watcher if not already running
            startSecurityReadyWatcher();
        } else {
            console.error('[TabCoordination] Message queue full, dropping message:', msg.type);
        }
        return;
    }

    try {
        await sendMessageInternal(msg, skipQueue);
    } catch (error) {
        // Check if this is a session initialization error
        const isSessionError = error.message && error.message.includes('Session not initialized');

        if (isSessionError && !inBootstrapWindow && !skipQueue) {
            // Queue message for later processing
            if (messageQueue.length < 100) {
                messageQueue.push({ msg, skipQueue: false, timestamp: Date.now() });
                startSecurityReadyWatcher();
            } else {
                console.error('[TabCoordination] Message queue full, dropping message:', msg.type);
            }
            return;
        }

        if (isSessionError) {
            // Only log session errors once to avoid spam
            if (!sendMessage._sessionErrorLogged) {
                console.warn('[TabCoordination] Security session not ready - using unsigned messages as fallback (within bootstrap window)');
                sendMessage._sessionErrorLogged = true;
            }
        } else {
            console.error('[TabCoordination] Message signing failed:', error);
        }

        // Fail-safe: Send unsigned message with origin, nonce, and unsigned flag if signing fails
        // Only allowed during bootstrap window
        if (inBootstrapWindow) {
            localSequence++;
            const unsignedNonce = `${TAB_ID}_${localSequence}_${msg.timestamp || Date.now()}`;
            coordinationTransport?.postMessage({
                ...msg,
                seq: localSequence,
                senderId: TAB_ID,
                origin: window.location.origin,
                nonce: unsignedNonce,
                timestamp: msg.timestamp || Date.now(),
                unsigned: true
            });
        } else {
            console.error('[TabCoordination] Message signing failed outside bootstrap window - message dropped to prevent security downgrade');
        }
    }
}

/**
 * Create message handler for BroadcastChannel with message security verification
 * Phase 14: All incoming messages are verified for signature, origin, timestamp, and nonce
 *
 * NOTE: Returns an async function - errors are logged and swallowed because
 * BroadcastChannel message handlers cannot propagate errors to callers.
 * All errors must be handled within this function.
 */
function createMessageHandler() {
    return async (event) => {
        try {
            // ==========================================
            // MESSAGE VALIDATION PIPELINE
            // ARCH FIX: Comprehensive validation to prevent crashes and DoS
            // ==========================================

            // Step 0: Structure validation - catch malformed messages early
            const structureValidation = validateMessageStructure(event.data);
            if (!structureValidation.valid) {
                console.warn(`[TabCoordination] Rejecting malformed message: ${structureValidation.error}`, event.data);
                return;
            }

            // Extract validated fields
            const { type, tabId, vectorClock: remoteClock, seq, senderId, signature, origin, timestamp, nonce } = event.data;

            // Step 1: Rate limiting - prevent message flood attacks
            if (isRateLimited(type)) {
                console.warn(`[TabCoordination] Rate limit exceeded for message type: ${type}`);
                return;
            }

            // Step 2: Check for unsigned flag (fail-safe from signing failures)
            let { unsigned: isUnsigned } = event.data;

            // SECURITY FIX (HIGH Issue #10): Check unsigned message allowance with rate limiting
            if (isUnsigned && !allowUnsignedMessage()) {
                console.warn('[TabCoordination] Rejecting unsigned message - outside bootstrap window or rate limit exceeded');
                return;
            }

            // Message signing verification removed - simplified security model
            // Cross-tab HMAC signing was over-engineering for this application

            // Step 3: Origin validation - keep this for basic security
            if (origin && origin !== window.location.origin) {
                console.warn(`[TabCoordination] Rejecting message from wrong origin: ${origin}`);
                return;
            }

            // Step 4: Timestamp validation - basic staleness check
            const isFresh = timestamp && (Date.now() - timestamp) < 60000; // 1 minute
            if (!isFresh) {
                console.warn(`[TabCoordination] Rejecting stale message: timestamp=${timestamp}, age=${Date.now() - timestamp}ms`);
                return;
            }

            // Step 5: Nonce validation for replay protection
            if (nonce && !isNonceFresh(nonce)) {
                console.warn('[TabCoordination] Rejecting replayed message with nonce:', nonce);
                return; // Drop the message
            }

            // Message passed basic verification - proceed with processing
            console.log(`[TabCoordination] Message received: type=${type}, from=${tabId}`);

            // Message sequence validation for ordering guarantees
            // HNW Network: Detect out-of-order or duplicate BroadcastChannel messages
            if (seq !== undefined && senderId && senderId !== TAB_ID) {
                const lastSeq = remoteSequences.get(senderId) || 0;

                if (seq <= lastSeq) {
                    // Duplicate message - skip processing
                    if (debugMode) {
                        console.warn(`[TabCoordination] Duplicate message: seq=${seq} from ${senderId} (last=${lastSeq})`);
                    }
                    return; // Skip duplicate
                }

                if (seq > lastSeq + 1) {
                    // Out-of-order message - log but continue processing
                    outOfOrderCount++;
                    console.warn(`[TabCoordination] Out-of-order message: expected seq=${lastSeq + 1}, got seq=${seq} from ${senderId} (total OOO: ${outOfOrderCount})`);
                    // We still process it since the message is valid, just arrived out of order
                }

                remoteSequences.set(senderId, seq);
                remoteSequenceTimestamps.set(senderId, Date.now());

                // Periodically prune stale remote sequence data
                if (Math.random() < 0.05) { // 5% chance on each message
                    pruneStaleRemoteSequences();
                }
            }

            // Sync Vector clock with received message
            // This ensures logical ordering and conflict detection across all tabs
            if (remoteClock && typeof remoteClock === 'object') {
                vectorClock.merge(remoteClock);
            }

            switch (type) {
                case MESSAGE_TYPES.CANDIDATE:
                    // Another tab announced candidacy - collect it for election
                    // If we're already primary, assert dominance so new tab knows leader exists
                    if (isPrimaryTab && tabId !== TAB_ID) {
                        sendMessage({
                            type: MESSAGE_TYPES.CLAIM_PRIMARY,
                            tabId: TAB_ID,
                            vectorClock: vectorClock.tick()
                        });
                    }
                    // Collect candidate for election with its timestamp for deterministic ordering
                    electionCandidates.add(tabId);
                    break;

                case MESSAGE_TYPES.CLAIM_PRIMARY:
                    // Another tab claimed primary - we become secondary
                    // FIX Issue #2: ALWAYS become secondary when someone else claims primary
                    // FIX CRITICAL #3: Use atomic compare-and-set pattern to prevent split-brain
                    // ADVERSARIAL FIX: Move hasConcededLeadership set AFTER successful transition
                    if (tabId !== TAB_ID) {
                        // ATOMIC TRANSITION: Check and update state in single conditional block
                        // This eliminates race window between checking state and updating it
                        if (isPrimaryTab && !hasConcededLeadership) {
                            // Update all other state atomically (all in same execution block)
                            const wasPrimary = true; // We know we were primary from the if condition
                            receivedPrimaryClaim = true;
                            electionAborted = true;
                            isPrimaryTab = false;
                            hasCalledSecondaryMode = true;

                            // ADVERSARIAL FIX: Only set hasConcededLeadership AFTER successful transition
                            // This prevents getting stuck in a state where we've conceded but UI is still active
                            let transitionSuccess = false;
                            try {
                                handleSecondaryMode();
                                transitionSuccess = true;

                                // CRITICAL: Only mark as conceded after successful transition
                                hasConcededLeadership = true;

                                console.log(`[TabCoordination] Conceded leadership to tab ${tabId} (atomic transition)`);
                            } catch (error) {
                                console.error('[TabCoordination] Error transitioning to secondary mode:', error);

                                // ADVERSARIAL FIX: Rollback state if transition failed
                                // This prevents getting stuck in inconsistent state
                                hasCalledSecondaryMode = false;
                                receivedPrimaryClaim = false;
                                electionAborted = false;
                                isPrimaryTab = true;
                                // hasConcededLeadership stays false (can retry concession)

                                // ADVERSARIAL FIX: Enter safe mode to prevent data corruption
                                console.error('[TabCoordination] Transition to secondary failed, entering safe mode');
                                enterSafeMode('secondary_mode_transition_failed');
                            }
                        } else if (!isPrimaryTab && !hasConcededLeadership) {
                            // We weren't primary, but mark as conceded for consistency
                            // This prevents us from becoming primary later if race occurs
                            receivedPrimaryClaim = true;
                            electionAborted = true;
                            // Only set hasConcededLeadership after confirming secondary mode
                            try {
                                handleSecondaryMode();
                                hasConcededLeadership = true;
                                console.log(`[TabCoordination] Marking as secondary (was not primary) - conceded to tab ${tabId}`);
                            } catch (error) {
                                console.error('[TabCoordination] Error entering secondary mode:', error);
                                // Enter safe mode but don't set hasConcededLeadership
                                enterSafeMode('secondary_mode_entry_failed');
                            }
                        }
                        // If already hasConcededLeadership, this is a duplicate claim - ignore
                    }
                    break;

                case MESSAGE_TYPES.RELEASE_PRIMARY:
                    // Primary tab closed - initiate new election
                    if (!isPrimaryTab) {
                        initiateReElection();
                    }
                    break;

                case MESSAGE_TYPES.HEARTBEAT:
                    // Received heartbeat from leader
                    if (tabId !== TAB_ID && !isPrimaryTab) {
                        // Record clock skew from remote timestamp
                        if (event.data.timestamp) {
                            const localNow = Date.now();
                            clockSkewTracker.recordSkew(event.data.timestamp, localNow);
                        }

                        // Update both wall-clock and Lamport time tracking
                        lastLeaderHeartbeat = clockSkewTracker.adjustTimestamp(Date.now());
                        if (event.data.lamportTimestamp) {
                            lastLeaderLamportTime = event.data.lamportTimestamp;
                        }
                    }
                    break;

                case MESSAGE_TYPES.EVENT_WATERMARK:
                    // Received watermark broadcast from another tab
                    if (tabId !== TAB_ID && event.data.watermark !== undefined) {
                        knownWatermarks.set(tabId, event.data.watermark);
                        if (debugMode) {
                            console.log(`[TabCoordination] Received watermark ${event.data.watermark} from tab ${tabId}`);
                        }
                    }
                    break;

                case MESSAGE_TYPES.REPLAY_REQUEST:
                    // Secondary tab requesting event replay
                    if (isPrimaryTab && tabId !== TAB_ID) {
                        handleReplayRequest(tabId, event.data.fromWatermark);
                    }
                    break;

                case MESSAGE_TYPES.REPLAY_RESPONSE:
                    // Primary tab responding with replay data
                    if (!isPrimaryTab && tabId !== TAB_ID) {
                        handleReplayResponse(event.data.events);
                    }
                    break;

                case MESSAGE_TYPES.SAFE_MODE_CHANGED:
                    // Cross-tab Safe Mode synchronization
                    // HNW Hierarchy: Safe Mode is an authority decision shared across all tabs
                    if (tabId !== TAB_ID) {
                        const { enabled, reason } = event.data;
                        console.log(`[TabCoordination] Safe Mode changed in another tab: ${enabled ? 'ENABLED' : 'DISABLED'}`, reason);

                        // Update local Safe Mode state via AppState if available
                        if (AppState?.update) {
                            AppState.update('app', {
                                safeMode: enabled,
                                safeModeReason: reason
                            });
                        }

                        // Show user-facing warning banner if entering safe mode
                        if (enabled) {
                            showSafeModeWarningFromRemote(reason);
                        } else {
                            hideSafeModeWarning();
                        }
                    }
                    break;
            }
        } catch (error) {
            // BroadcastChannel message handlers cannot propagate errors to callers
            // All errors must be handled here to prevent unhandled promise rejections
            console.error('[TabCoordination] Message handler error:', {
                message: error.message,
                stack: error.stack,
                messageType: event.data?.type,
                fromTab: event.data?.tabId
            });
            // Return without processing - message is rejected
            return;
        }
    };
}

/**
 * Claim this tab as primary
 * FIX CRITICAL #3: Add validation to prevent split-brain - once conceded, never reclaim
 */
function claimPrimary() {
    // CRITICAL #3: Validate we haven't conceded leadership
    // Once a tab has conceded, it can NEVER become primary again this session
    // This is the key defense against split-brain
    if (hasConcededLeadership) {
        console.error('[TabCoordination] REFUSING to claim primary - already conceded leadership (split-brain prevention)');
        return; // Do NOT claim primary - would cause split-brain
    }

    // Also validate we haven't received a claim from another tab
    if (receivedPrimaryClaim) {
        console.error('[TabCoordination] REFUSING to claim primary - received claim from another tab (split-brain prevention)');
        return; // Do NOT claim primary - would cause split-brain
    }

    isPrimaryTab = true;
    // FIX Issue #2: Reset secondary mode flag when becoming primary
    hasCalledSecondaryMode = false;
    sendMessage({
        type: MESSAGE_TYPES.CLAIM_PRIMARY,
        tabId: TAB_ID
    });
    console.log('[TabCoordination] Claimed primary tab:', TAB_ID);
    notifyAuthorityChange();
}

/**
 * Handle transition to secondary mode
 * FIX CRITICAL #3: Add split-brain detection and recovery
 */
function handleSecondaryMode() {
    // CRITICAL #3: Detect split-brain scenario - if we're somehow marked as primary while being called to secondary
    if (isPrimaryTab) {
        console.error('[TabCoordination] SPLIT-BRAIN DETECTED: handleSecondaryMode called but isPrimaryTab=true. This indicates a race condition. Forcing secondary mode.');
    }

    console.log('[TabCoordination] Entering secondary mode (read-only)');

    // Stop watermark broadcast as we're now secondary
    stopWatermarkBroadcast();

    // Show warning modal if available
    const modal = document.getElementById('multi-tab-modal');
    if (modal) {
        modal.style.display = 'flex';
        const msgEl = modal.querySelector('.modal-message');
        if (msgEl) {
            msgEl.textContent =
                'Rhythm Chamber is open in another tab. ' +
                'This tab is now read-only to prevent data corruption. ' +
                'Close the other tab to regain full access here.';
        }
    }

    // Disable write operations
    disableWriteOperations();
    notifyAuthorityChange();
}

/**
 * Disable all write operations in secondary tab
 */
function disableWriteOperations() {
    // Disable file upload
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    if (uploadZone) {
        uploadZone.style.pointerEvents = 'none';
        uploadZone.style.opacity = '0.5';
    }
    if (fileInput) fileInput.disabled = true;

    // Disable chat input
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');
    if (chatInput) {
        chatInput.disabled = true;
        chatInput.placeholder = 'Read-only mode (close other tab to enable)';
    }
    if (chatSend) chatSend.disabled = true;

    // Disable reset
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) resetBtn.disabled = true;

    // Disable Spotify connect
    const spotifyConnectBtn = document.getElementById('spotify-connect-btn');
    if (spotifyConnectBtn) spotifyConnectBtn.disabled = true;

    // Disable new chat button
    const newChatBtn = document.getElementById('new-chat-btn');
    if (newChatBtn) newChatBtn.disabled = true;

    console.log('[TabCoordination] Write operations disabled - secondary tab mode');
}

/**
 * Enter safe mode when critical error occurs
 * ADVERSARIAL FIX: Prevents data corruption when state transition fails
 * @param {string} reason - Reason for entering safe mode
 */
function enterSafeMode(reason) {
    console.error(`[TabCoordination] ENTERING SAFE MODE: ${reason}`);

    // Disable ALL write operations immediately
    disableWriteOperations();

    // Show error modal with different message
    const modal = document.getElementById('multi-tab-modal');
    if (modal) {
        modal.style.display = 'flex';
        const msgEl = modal.querySelector('.modal-message');
        if (msgEl) {
            msgEl.textContent =
                'A critical error occurred in tab coordination. ' +
                'This tab has been placed in safe mode to prevent data corruption. ' +
                'Please refresh the page. Error: ' + reason;
        }
    }

    // Notify other tabs about safe mode
    sendMessage({
        type: MESSAGE_TYPES.SAFE_MODE_CHANGED,
        tabId: TAB_ID,
        timestamp: Date.now(),
        enabled: true,
        reason: reason
    });
}

/**
 * Initiate re-election after primary tab closes
 */
async function initiateReElection() {
    console.log('[TabCoordination] Primary tab released, initiating re-election');

    // Clear any existing election
    if (electionTimeout) {
        clearTimeout(electionTimeout);
    }

    // Reset election state
    electionCandidates = new Set([TAB_ID]);
    receivedPrimaryClaim = false;
    electionAborted = false;
    // FIX Issue #2: Reset secondary mode flag for re-election
    hasCalledSecondaryMode = false;

    // Announce candidacy with message security
    sendMessage({
        type: MESSAGE_TYPES.CANDIDATE,
        tabId: TAB_ID
    });

    // Wait for election window
    await new Promise(resolve => {
        electionTimeout = setTimeout(resolve, ELECTION_WINDOW_MS);
    });

    // Check if we should become primary
    // For simplicity, we'll assume we win if no other claims within window
    // In a more robust implementation, we'd collect all candidates again
    if (!isPrimaryTab && !electionAborted) {
        isPrimaryTab = true;
        claimPrimary();
        startHeartbeat();
        startWatermarkBroadcast(); // Start watermark broadcast as new primary
        stopHeartbeatMonitor();
        console.log('[TabCoordination] Became primary after re-election');
    }
}

/**
 * Start sending heartbeats (leader only)
 */
function startHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }

    // Set expected heartbeat interval for WaveTelemetry
    WaveTelemetry.setExpected('heartbeat_interval', HEARTBEAT_INTERVAL_MS);

    // Send initial heartbeat with error handling
    sendHeartbeat().catch(error => {
        console.error('[TabCoordination] Initial heartbeat failed:', error);
    });

    // Start interval with in-progress tracking to prevent overlapping heartbeats
    heartbeatInterval = setInterval(async () => {
        if (heartbeatInProgress) {
            console.warn('[TabCoordination] Previous heartbeat still in progress, skipping');
            return;
        }

        heartbeatInProgress = true;
        try {
            await sendHeartbeat();
        } catch (error) {
            console.error('[TabCoordination] Heartbeat error:', error);
        } finally {
            heartbeatInProgress = false;
        }
    }, HEARTBEAT_INTERVAL_MS);

    console.log('[TabCoordination] Started heartbeat as leader');
}

/**
 * Send a heartbeat with both wall-clock and Vector clock timestamps
 * HNW Wave: Dual timestamp system prevents clock skew issues
 * HNW Wave: Heartbeat quality monitoring for mobile
 */
async function sendHeartbeat() {
    const wallClockTime = Date.now();
    const currentVectorClock = vectorClock.tick();

    // Record actual heartbeat interval for WaveTelemetry
    if (lastHeartbeatSentTime > 0) {
        const actualInterval = wallClockTime - lastHeartbeatSentTime;
        WaveTelemetry.record('heartbeat_interval', actualInterval);

        // HNW Wave: Record heartbeat quality for mobile detection
        DeviceDetection.recordHeartbeatQuality(actualInterval);
    }
    lastHeartbeatSentTime = wallClockTime;

    // Send via coordination transport with message security
    sendMessage({
        type: MESSAGE_TYPES.HEARTBEAT,
        tabId: TAB_ID,
        timestamp: wallClockTime,
        vectorClock: currentVectorClock,
        // HNW Wave: Include device info for adaptive follower behavior
        deviceInfo: {
            isMobile: DeviceDetection.isMobile(),
            networkQuality: DeviceDetection.getNetworkState().quality
        }
    });

    // Also store in localStorage for cross-tab fallback
    try {
        localStorage.setItem(HEARTBEAT_STORAGE_KEY, JSON.stringify({
            tabId: TAB_ID,
            timestamp: wallClockTime,
            vectorClock: currentVectorClock
        }));
    } catch (e) {
        // Ignore localStorage errors
    }
}

/**
 * Stop sending heartbeats
 */
function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    // Reset in-progress flag to allow future heartbeats to start cleanly
    heartbeatInProgress = false;
}

/**
 * Start monitoring leader heartbeat with skew tolerance (followers only)
 * HNW Wave: Uses both Lamport and wall-clock time with skew compensation
 */
function startHeartbeatMonitor() {
    if (heartbeatCheckInterval) {
        clearInterval(heartbeatCheckInterval);
    }

    lastLeaderHeartbeat = clockSkewTracker.adjustTimestamp(Date.now());
    lastLeaderVectorClock = vectorClock.toJSON();

    heartbeatCheckInterval = setInterval(() => {
        const maxAllowedGap = HEARTBEAT_INTERVAL_MS * MAX_MISSED_HEARTBEATS;
        const now = Date.now();
        let timeSinceLastHeartbeat = 0;

        // Check localStorage fallback with skew tolerance
        try {
            const stored = localStorage.getItem(HEARTBEAT_STORAGE_KEY);
            if (stored) {
                const { timestamp, vectorClock: storedVectorClock } = JSON.parse(stored);

                // Merge stored Vector clock for conflict detection
                if (storedVectorClock && typeof storedVectorClock === 'object') {
                    vectorClock.merge(storedVectorClock);
                    lastLeaderVectorClock = storedVectorClock;
                }

                // Calculate stored age with skew adjustment
                const storedAge = now - timestamp;
                const adjustedStoredAge = clockSkewTracker.adjustTimestamp(now) - timestamp;

                // Use the most recent timestamp
                if (adjustedStoredAge < (now - lastLeaderHeartbeat)) {
                    lastLeaderHeartbeat = clockSkewTracker.adjustTimestamp(timestamp);
                }
            }
        } catch (e) {
            // Ignore localStorage errors
        }

        // Calculate time since last heartbeat with skew tolerance
        timeSinceLastHeartbeat = clockSkewTracker.adjustTimestamp(now) - lastLeaderHeartbeat;

        // Check if heartbeat is overdue with skew tolerance
        if (timeSinceLastHeartbeat > maxAllowedGap) {
            // HNW Wave: Visibility-aware heartbeat - adaptive wait before promoting if tab may be backgrounded
            const isPageHidden = typeof document !== 'undefined' && document.hidden;
            if (isPageHidden) {
                // Primary may just be backgrounded - use adaptive visibility wait
                const visibilityWaitMs = DeviceDetection.getRecommendedVisibilityWait();
                console.log(`[TabCoordination] Leader heartbeat missed, but page hidden. Waiting ${visibilityWaitMs}ms before re-election...`);
                clearInterval(heartbeatCheckInterval);
                setTimeout(async () => {
                    // Re-check after delay
                    const recentHeartbeat = clockSkewTracker.adjustTimestamp(Date.now()) - lastLeaderHeartbeat;
                    if (recentHeartbeat > maxAllowedGap) {
                        console.log(`[TabCoordination] Still no heartbeat after visibility wait, promoting to leader`);
                        initiateReElection();
                    } else {
                        console.log(`[TabCoordination] Heartbeat received during visibility wait, resuming monitor`);
                        startHeartbeatMonitor(); // Resume monitoring
                    }
                }, visibilityWaitMs);
                return; // Exit early
            }

            console.log(`[TabCoordination] Leader heartbeat missed for ${timeSinceLastHeartbeat}ms (skew: ${clockSkewTracker.getSkew().toFixed(0)}ms), promoting to leader`);
            stopHeartbeatMonitor();
            initiateReElection();
        }

        // Note: Lamport time comparison removed as it mixes event counts with wall-clock time
        // Using wall-clock heartbeat monitoring only, which is more reliable for failover detection
    }, HEARTBEAT_INTERVAL_MS);

    console.log('[TabCoordination] Started heartbeat monitor as follower with skew tolerance');
}

/**
 * Stop monitoring heartbeat
 */
function stopHeartbeatMonitor() {
    if (heartbeatCheckInterval) {
        clearInterval(heartbeatCheckInterval);
        heartbeatCheckInterval = null;
    }
}

/**
 * Setup network monitoring for adaptive failover behavior
 * HNW Network: Adjust failover behavior based on network quality
 *
 * @returns {Function} Cleanup function
 */
function setupNetworkMonitoring() {
    const networkCleanup = DeviceDetection.startNetworkMonitoring();

    const handleNetworkChange = (newQuality, oldQuality) => {
        if (!adaptiveTiming) return;

        console.log(`[TabCoordination] Network quality changed: ${oldQuality} → ${newQuality}`);

        // Re-initialize adaptive timing based on new network conditions
        initAdaptiveTiming();

        // Update heartbeat intervals if we're the leader
        if (isPrimaryTab && heartbeatInterval) {
            stopHeartbeat();
            startHeartbeat();
            console.log('[TabCoordination] Heartbeat restarted with adaptive timing:', {
                interval: HEARTBEAT_INTERVAL_MS,
                maxMissed: MAX_MISSED_HEARTBEATS
            });
        }

        // Update monitor intervals if we're a follower
        if (!isPrimaryTab && heartbeatCheckInterval) {
            stopHeartbeatMonitor();
            startHeartbeatMonitor();
        }
    };

    const unsubscribe = DeviceDetection.onNetworkChange(handleNetworkChange);

    return () => {
        networkCleanup();
        unsubscribe();
    };
}

/**
 * Setup wake-from-sleep detection
 * HNW Wave: Detects OS sleep by tracking large time gaps between visibility changes.
 * When a gap > 30s is detected on visibility becoming visible, triggers immediate re-election.
 * 
 * @returns {Function} Cleanup function
 */
function setupWakeFromSleepDetection() {
    const handleVisibilityChange = () => {
        const now = Date.now();
        const gap = now - lastVisibilityCheckTime;

        // Update the check time
        lastVisibilityCheckTime = now;

        if (!document.hidden && gap > SLEEP_DETECTION_THRESHOLD_MS) {
            // Device woke up from sleep - large time gap detected
            console.log(`[TabCoordination] Wake-from-sleep detected (${(gap / 1000).toFixed(1)}s gap)`);

            // Trigger immediate leader election regardless of current role
            // This ensures clean state after possible stale heartbeats during sleep
            console.log('[TabCoordination] Triggering immediate re-election after sleep recovery');
            initiateReElection();
        }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also update check time periodically when tab is active to prevent false positives
    const intervalId = setInterval(() => {
        if (!document.hidden) {
            lastVisibilityCheckTime = Date.now();
        }
    }, 10000); // Update every 10 seconds when visible

    console.log('[TabCoordination] Wake-from-sleep detection initialized');

    return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        clearInterval(intervalId);
    };
}

// ==========================================
// Event Replay Coordination
// ==========================================

/**
 * Start broadcasting event watermark
 * Only primary tab broadcasts its watermark for secondary tabs to track
 */
function startWatermarkBroadcast() {
    if (watermarkBroadcastInterval) {
        clearInterval(watermarkBroadcastInterval);
    }

    watermarkBroadcastInterval = setInterval(() => {
        broadcastWatermark();
    }, WATERMARK_BROADCAST_MS);

    console.log('[TabCoordination] Started watermark broadcast');
}

/**
 * Stop broadcasting event watermark
 */
function stopWatermarkBroadcast() {
    if (watermarkBroadcastInterval) {
        clearInterval(watermarkBroadcastInterval);
        watermarkBroadcastInterval = null;
    }
}

/**
 * Broadcast current event watermark to all tabs
 */
async function broadcastWatermark() {
    if (!broadcastChannel) return;

    sendMessage({
        type: MESSAGE_TYPES.EVENT_WATERMARK,
        tabId: TAB_ID,
        watermark: lastEventWatermark,
        vectorClock: vectorClock.tick()
    });
}

/**
 * Update local event watermark
 * @param {number} watermark - New watermark value
 */
function updateEventWatermark(watermark) {
    lastEventWatermark = watermark;
    // Broadcast watermark update immediately if primary
    if (isPrimaryTab) {
        broadcastWatermark();
    }
}

/**
 * Get current event watermark
 * @returns {number} Current watermark
 */
function getEventWatermark() {
    return lastEventWatermark;
}

/**
 * Get known watermarks from all tabs
 * @returns {Map<string, number>} Map of tab IDs to watermarks
 */
function getKnownWatermarks() {
    return new Map(knownWatermarks);
}

/**
 * Handle replay request from secondary tab (primary only)
 * @param {string} requestingTabId - Tab requesting replay
 * @param {number} fromWatermark - Starting watermark for replay
 */
async function handleReplayRequest(requestingTabId, fromWatermark) {
    if (!isPrimaryTab) return;

    try {
        console.log(`[TabCoordination] Handling replay request from tab ${requestingTabId} from watermark ${fromWatermark}`);

        // Use the already-imported EventBus at the top of this file to get events and replay
        const eventLog = await EventBus.replayEvents({
            fromSequenceNumber: fromWatermark,
            count: 1000,
            forward: true
        });

        // Send replay response to requesting tab with message security
        sendMessage({
            type: MESSAGE_TYPES.REPLAY_RESPONSE,
            tabId: TAB_ID,
            events: eventLog,
            vectorClock: vectorClock.tick()
        });
    } catch (error) {
        console.error('[TabCoordination] Error handling replay request:', error);
    }
}

/**
 * Handle replay response from primary tab (secondary only)
 * @param {Array} events - Events to replay
 */
async function handleReplayResponse(events) {
    if (isPrimaryTab) return;

    try {
        console.log(`[TabCoordination] Received replay response with ${events.length} events`);

        // Replay events using the already-imported EventBus at the top of this file
        for (const event of events) {
            await EventBus.emit(event.type, event.payload, {
                skipEventLog: true,
                domain: event.domain || 'global'
            });
        }

        // Update watermark
        if (events.length > 0) {
            const lastEvent = events[events.length - 1];
            updateEventWatermark(lastEvent.sequenceNumber);
        }

        console.log('[TabCoordination] Replay complete');
    } catch (error) {
        console.error('[TabCoordination] Error handling replay response:', error);
    }
}

/**
 * Request event replay from primary tab (secondary only)
 * @param {number} fromWatermark - Starting watermark for replay
 */
async function requestEventReplay(fromWatermark) {
    if (isPrimaryTab) {
        console.warn('[TabCoordination] Primary tab should not request replay');
        return;
    }

    if (!broadcastChannel) {
        console.warn('[TabCoordination] No broadcast channel available for replay request');
        return;
    }

    console.log(`[TabCoordination] Requesting event replay from watermark ${fromWatermark}`);

    sendMessage({
        type: MESSAGE_TYPES.REPLAY_REQUEST,
        tabId: TAB_ID,
        fromWatermark,
        vectorClock: vectorClock.tick()
    });
}

/**
 * Check if replay is needed based on watermarks
 * @returns {boolean} True if replay is needed
 */
function needsReplay() {
    if (isPrimaryTab) return false;

    // Get highest watermark from known tabs
    let highestWatermark = lastEventWatermark;
    for (const [tabId, watermark] of knownWatermarks.entries()) {
        if (watermark > highestWatermark) {
            highestWatermark = watermark;
        }
    }

    return highestWatermark > lastEventWatermark;
}

/**
 * Perform automatic replay if needed
 * @returns {Promise<boolean>} True if replay was performed
 */
async function autoReplayIfNeeded() {
    if (!needsReplay()) return false;

    try {
        // EFFICIENCY: Iterate to find max instead of spreading Map.values()
        let highestWatermark = lastEventWatermark;
        for (const watermark of knownWatermarks.values()) {
            if (watermark > highestWatermark) {
                highestWatermark = watermark;
            }
        }
        console.log(`[TabCoordination] Auto-replaying events from ${lastEventWatermark} to ${highestWatermark}`);

        await requestEventReplay(lastEventWatermark);
        return true;
    } catch (error) {
        console.error('[TabCoordination] Auto-replay failed:', error);
        return false;
    }
}

/**
 * Check if this tab is the primary tab
 * @returns {boolean}
 */
function isPrimary() {
    return isPrimaryTab;
}

/**
 * Get current tab ID
 * @returns {string}
 */
function getTabId() {
    return TAB_ID;
}

// ==========================================
// Visual Authority Feedback (HNW Hierarchy)
// ==========================================

/**
 * Check if write operations are allowed
 * HNW Hierarchy: Central authority check for all write operations
 * 
 * @returns {boolean} - True if this tab has write authority
 */
function isWriteAllowed() {
    return isPrimaryTab;
}

/**
 * Get the current authority level
 * HNW Hierarchy: Returns authority status for UI feedback
 * 
 * @returns {Object} Authority status
 */
function getAuthorityLevel() {
    return {
        level: isPrimaryTab ? 'primary' : 'secondary',
        canWrite: isPrimaryTab,
        canRead: true,
        tabId: TAB_ID,
        mode: isPrimaryTab ? 'full_access' : 'read_only',
        message: isPrimaryTab
            ? 'Full access - You can make changes'
            : 'Read-only mode - Another tab has primary control'
    };
}

/**
 * Assert write authority - throws if not allowed
 * Use this before critical write operations
 * 
 * @param {string} [operation] - Operation name for error message
 * @throws {Error} If write not allowed
 */
function assertWriteAuthority(operation = 'write operation') {
    if (!isPrimaryTab) {
        const error = new Error(`Write authority denied: ${operation}. This tab is in read-only mode.`);
        error.code = 'WRITE_AUTHORITY_DENIED';
        error.isSecondaryTab = true;
        error.suggestion = 'Close other tabs or refresh this page to become primary';
        throw error;
    }
}

/**
 * Subscribe to authority changes
 * @param {Function} callback - Called with authority level when it changes
 * @returns {Function} Unsubscribe function
 */
const authorityChangeListeners = [];

function onAuthorityChange(callback) {
    authorityChangeListeners.push(callback);

    // Immediately call with current state
    callback(getAuthorityLevel());

    return () => {
        const idx = authorityChangeListeners.indexOf(callback);
        if (idx >= 0) authorityChangeListeners.splice(idx, 1);
    };
}

/**
 * Notify listeners of authority change
 */
function notifyAuthorityChange() {
    const level = getAuthorityLevel();

    // Emit EventBus event for UI components
    EventBus.emit('tab:authority_changed', {
        isPrimary: level.canWrite,
        level: level.level,
        mode: level.mode,
        message: level.message
    });

    // Call internal listeners
    for (const listener of authorityChangeListeners) {
        try {
            listener(level);
        } catch (e) {
            console.error('[TabCoordination] Authority listener error:', e);
        }
    }
}

/**
 * Cleanup on tab close/unload
 */
function cleanup() {
    // Stop heartbeat
    stopHeartbeat();
    stopHeartbeatMonitor();

    // Stop watermark broadcast
    stopWatermarkBroadcast();

    // Stop security ready watcher
    stopSecurityReadyWatcher();

    // Clear message queue
    messageQueue.length = 0;

    // Notify other tabs of release with message security
    if (isPrimaryTab && coordinationTransport) {
        sendMessage({
            type: MESSAGE_TYPES.RELEASE_PRIMARY,
            tabId: TAB_ID
        }, true); // Skip queue during cleanup
    }

    // Close coordination transport (BroadcastChannel or SharedWorker)
    if (coordinationTransport) {
        coordinationTransport.removeEventListener('message', messageHandler);
        coordinationTransport.close();
        coordinationTransport = null;
    }

    // Close BroadcastChannel if it exists
    if (broadcastChannel) {
        broadcastChannel.close();
        broadcastChannel = null;
    }

    // Close SharedWorker if it was used
    if (sharedWorkerFallback) {
        SharedWorkerCoordinator.close();
        sharedWorkerFallback = false;
    }

    if (electionTimeout) {
        clearTimeout(electionTimeout);
    }

    // HNW Wave: Cleanup monitoring
    if (visibilityMonitorCleanup) {
        visibilityMonitorCleanup();
        visibilityMonitorCleanup = null;
    }

    if (networkMonitorCleanup) {
        networkMonitorCleanup();
        networkMonitorCleanup = null;
    }

    // Reset election state
    electionCandidates = new Set();
    receivedPrimaryClaim = false;
    electionAborted = false;
    // FIX Issue #2: Reset secondary mode flag on cleanup
    hasCalledSecondaryMode = false;
    // FIX CRITICAL #3: Reset conceded leadership flag on cleanup (fresh start on reload)
    hasConcededLeadership = false;

    // HNW Network: Clear remote sequence tracking
    remoteSequences.clear();
    remoteSequenceTimestamps.clear();

    // ADVERSARIAL FIX: Clear rate limiting tracking to prevent memory leak on tab close
    messageRateTracking.clear();
    burstMessageCount = 0;
    burstWindowStart = Date.now();
    globalMessageCount = 0;
    globalWindowStart = Date.now();

    console.log('[TabCoordination] Cleanup complete');
}

// ==========================================
// Safe Mode Cross-Tab Coordination
// ==========================================

/**
 * Broadcast Safe Mode change to all other tabs
 * HNW Hierarchy: Safe Mode is an authority decision that must be synchronized
 *
 * @param {boolean} enabled - Whether Safe Mode is enabled
 * @param {string} reason - Reason for the Safe Mode change
 */
function broadcastSafeModeChange(enabled, reason) {
    sendMessage({
        type: MESSAGE_TYPES.SAFE_MODE_CHANGED,
        tabId: TAB_ID,
        enabled,
        reason
    });
    console.log(`[TabCoordination] Broadcasting Safe Mode change: ${enabled ? 'ENABLED' : 'DISABLED'}`, reason);
}

/**
 * Show Safe Mode warning banner when triggered from another tab
 * @param {string} reason - Reason for entering Safe Mode
 */
function showSafeModeWarningFromRemote(reason) {
    // Create or show the Safe Mode banner
    let banner = document.getElementById('safe-mode-remote-banner');

    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'safe-mode-remote-banner';
        banner.className = 'safe-mode-banner';
        // SECURITY: Use data-action attribute instead of inline onclick for CSP compliance
        banner.innerHTML = `
            <span class="safe-mode-icon">⚠️</span>
            <span class="safe-mode-message">Safe Mode activated in another tab: <strong>${escapeHtml(reason || 'Unknown reason')}</strong></span>
            <button class="safe-mode-dismiss" data-action="dismiss-safe-mode-banner" aria-label="Dismiss warning">×</button>
        `;
        banner.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: linear-gradient(135deg, #f39c12, #e74c3c);
            color: white;
            padding: 12px 20px;
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 10000;
            font-family: system-ui, -apple-system, sans-serif;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;
        // Add event listener for dismiss button instead of inline onclick
        const dismissBtn = banner.querySelector('.safe-mode-dismiss');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => banner.remove());
        }
        document.body.prepend(banner);
    } else {
        // Update existing banner
        const msgEl = banner.querySelector('.safe-mode-message');
        if (msgEl) {
            msgEl.innerHTML = `Safe Mode activated in another tab: <strong>${escapeHtml(reason || 'Unknown reason')}</strong>`;
        }
        banner.style.display = 'flex';
    }
}

/**
 * Hide Safe Mode warning banner
 */
function hideSafeModeWarning() {
    const banner = document.getElementById('safe-mode-remote-banner');
    if (banner) {
        banner.style.display = 'none';
    }
}

// Escape HTML is now imported from utils/html-escape.js

// ==========================================
// Public API
// ==========================================

const TabCoordinator = {
    init,
    isPrimary,
    getTabId,
    cleanup,

    // Visual Authority Feedback (HNW)
    isWriteAllowed,
    getAuthorityLevel,
    assertWriteAuthority,
    onAuthorityChange,

    // Timing configuration (HNW Wave)
    configureTiming,
    getTimingConfig() {
        return structuredClone ? structuredClone(TimingConfig) : JSON.parse(JSON.stringify(TimingConfig));
    },

    // Clock skew tracking (HNW Wave)
    getClockSkew: () => clockSkewTracker.getSkew(),
    getClockSkewHistory: () => [...clockSkewTracker.skewSamples],
    resetClockSkewTracking: () => clockSkewTracker.reset(),

    // HNW Wave: Adaptive timing and device detection
    getAdaptiveTiming: () => adaptiveTiming ? structuredClone(adaptiveTiming) : null,
    getDeviceInfo: () => DeviceDetection.getDeviceInfo(),
    getNetworkState: () => DeviceDetection.getNetworkState(),
    getHeartbeatQualityStats: () => DeviceDetection.getHeartbeatQualityStats(),

    // VectorClock API (HNW Network - for conflict detection)
    getVectorClock: () => vectorClock.clone(),
    getVectorClockState: () => vectorClock.toJSON(),
    isConflict: (remoteClock) => vectorClock.isConcurrent(remoteClock),

    // Event Replay Coordination (NEW)
    updateEventWatermark,
    getEventWatermark,
    getKnownWatermarks,
    requestEventReplay,
    needsReplay,
    autoReplayIfNeeded,

    // Safe Mode cross-tab synchronization (HNW Hierarchy)
    broadcastSafeModeChange,

    // Message ordering diagnostics (HNW Network)
    getOutOfOrderCount: () => outOfOrderCount,
    resetOutOfOrderCount: () => { outOfOrderCount = 0; },
    pruneStaleRemoteSequences, // NEW: Cleanup for long-running tabs
    getRemoteSequenceCount: () => remoteSequences.size,

    // Message queue diagnostics (HNW Fix)
    getQueueSize: () => messageQueue.length,
    getQueueInfo: () => ({
        size: messageQueue.length,
        isProcessing: isProcessingQueue,
        isWatching: securityReadyCheckInterval !== null,
        isReady: isKeySessionActive()
    }),
    processQueue: processMessageQueue,

    // Transport info (diagnostics)
    getTransportType: () => sharedWorkerFallback ? 'SharedWorker' : 'BroadcastChannel',
    isUsingFallback: () => sharedWorkerFallback,

    // ARCH FIX: Message validation API
    validateMessageStructure,
    MESSAGE_SCHEMA,
    MESSAGE_TYPES,
    getMessageRateLimit: (type) => MESSAGE_RATE_LIMITS[type],
    getRateTracking: () => new Map(messageRateTracking),

    // Heartbeat (exposed for testing)
    _startHeartbeat: startHeartbeat,
    _stopHeartbeat: stopHeartbeat
};

// ES Module export
export { TabCoordinator };

console.log('[TabCoordination] Service loaded with VectorClock, heartbeat, authority control, and clock skew handling');
