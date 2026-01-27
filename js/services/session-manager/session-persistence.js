// js/services/session-manager/session-persistence.js
'use strict';

import * as SessionState from './session-state.js';
import { Storage } from '../../storage.js';

// ==========================================
// Constants
// ==========================================

const SESSION_CURRENT_SESSION_KEY = 'rc_current_session_id';
const SESSION_EMERGENCY_BACKUP_KEY = 'rc_session_emergency_backup';
const SESSION_EMERGENCY_BACKUP_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const MAX_SAVED_MESSAGES = 100;

// ==========================================
// State
// ==========================================

let autoSaveTimeoutId = null;

// ==========================================
// Safe JSON Parse
// ==========================================

/**
 * Safely parse JSON with fallback
 * @param {string} str - JSON string
 * @param {*} fallback - Fallback value
 * @returns {*} Parsed object or fallback
 */
function safeJsonParse(str, fallback) {
    try {
        return JSON.parse(str);
    } catch {
        return fallback;
    }
}

// ==========================================
// Session Title Generation
// ==========================================

/**
 * Generate a title for the session based on first user message
 * @param {Array} messages - Array of message objects
 * @returns {string} Generated session title
 */
function generateSessionTitle(messages) {
    const firstUserMsg = messages.find(m => m.role === 'user');
    if (firstUserMsg?.content && typeof firstUserMsg.content === 'string' && firstUserMsg.content.trim().length > 0) {
        const chars = Array.from(firstUserMsg.content.trim());
        const title = chars.slice(0, 50).join('');
        return chars.length > 50 ? title + '...' : title;
    }
    return 'New Chat';
}

// ==========================================
// Core Persistence Functions
// ==========================================

/**
 * Save current session to IndexedDB immediately
 * @returns {Promise<boolean>} True if save succeeded
 */
export async function saveCurrentSession() {
    const currentSessionId = SessionState.getCurrentSessionId();
    if (!currentSessionId || !Storage.saveSession) {
        return false;
    }

    const sessionData = SessionState.getSessionData();
    const messages = sessionData.messages || [];
    const currentSessionCreatedAt = SessionState.getCurrentSessionCreatedAt();

    try {
        const systemMessages = messages.filter(m => m.role === 'system');
        const nonSystemMessages = messages.filter(m => m.role !== 'system');
        const messagesToSave = messages.length > MAX_SAVED_MESSAGES
            ? [...systemMessages, ...nonSystemMessages.slice(-(MAX_SAVED_MESSAGES - systemMessages.length))]
            : messages;

        const session = {
            id: currentSessionId,
            title: generateSessionTitle(messages),
            createdAt: currentSessionCreatedAt,
            messages: messagesToSave,
            metadata: {
                personalityName: window._userContext?.personality?.name || 'Unknown',
                personalityEmoji: window._userContext?.personality?.emoji || '🎵',
                isLiteMode: false
            }
        };

        await Storage.saveSession(session);
        console.log('[SessionPersistence] Session saved:', currentSessionId);
        return true;
    } catch (e) {
        console.error('[SessionPersistence] Failed to save session:', e);
        return false;
    }
}

/**
 * Debounced auto-save for conversation
 * Called after messages are added/modified
 * @param {number} delayMs - Delay in milliseconds (default: 2000)
 */
export function saveConversation(delayMs = 2000) {
    if (autoSaveTimeoutId) {
        clearTimeout(autoSaveTimeoutId);
    }

    autoSaveTimeoutId = setTimeout(async () => {
        await saveCurrentSession();
        autoSaveTimeoutId = null;
    }, delayMs);
}

/**
 * Flush pending save asynchronously
 * Called on visibilitychange when tab goes hidden
 */
export async function flushPendingSaveAsync() {
    if (autoSaveTimeoutId) {
        clearTimeout(autoSaveTimeoutId);
        autoSaveTimeoutId = null;
    }

    const currentSessionId = SessionState.getCurrentSessionId();
    const sessionData = SessionState.getSessionData();

    if (currentSessionId && sessionData.id) {
        try {
            await saveCurrentSession();
            console.log('[SessionPersistence] Session flushed on visibility change');

            // Clear emergency backup after successful save
            try {
                localStorage.removeItem(SESSION_EMERGENCY_BACKUP_KEY);
            } catch (e) {
                console.warn('[SessionPersistence] Failed to clear emergency backup:', e);
            }
        } catch (e) {
            console.error('[SessionPersistence] Flush save failed:', e);
        }
    }
}

/**
 * Emergency synchronous backup to localStorage
 * Called on beforeunload/pagehide when tab is closing
 */
export function emergencyBackupSync() {
    const currentSessionId = SessionState.getCurrentSessionId();
    const sessionData = SessionState.getSessionData();

    if (!currentSessionId || !sessionData.id) return;

    const messages = sessionData.messages || [];
    if (messages.length === 0) return;

    const backup = {
        sessionId: currentSessionId,
        createdAt: SessionState.getCurrentSessionCreatedAt(),
        messages: messages.slice(-100),
        timestamp: Date.now()
    };

    try {
        localStorage.setItem(SESSION_EMERGENCY_BACKUP_KEY, JSON.stringify(backup));
        console.log('[SessionPersistence] Emergency backup saved');
    } catch (e) {
        console.error('[SessionPersistence] Emergency backup failed:', e);
    }
}

/**
 * Recover emergency backup on load
 * Should be called during initialization
 * @returns {Promise<boolean>} True if backup was recovered
 */
export async function recoverEmergencyBackup() {
    let backupStr = null;
    try {
        backupStr = localStorage.getItem(SESSION_EMERGENCY_BACKUP_KEY);
    } catch (e) {
        console.error('[SessionPersistence] Failed to get emergency backup:', e);
        return false;
    }

    if (!backupStr) return false;

    const backup = safeJsonParse(backupStr, null);
    if (!backup) {
        console.warn('[SessionPersistence] Emergency backup is corrupted');
        return false;
    }

    try {
        // Only recover if backup is recent (< 1 hour)
        if (Date.now() - backup.timestamp > SESSION_EMERGENCY_BACKUP_MAX_AGE_MS) {
            console.log('[SessionPersistence] Emergency backup too old, discarding');
            localStorage.removeItem(SESSION_EMERGENCY_BACKUP_KEY);
            return false;
        }

        let saveSuccess = false;

        // Check if session exists with fewer messages
        const existing = await Storage.getSession?.(backup.sessionId);
        if (existing) {
            const existingCount = existing.messages?.length || 0;
            const backupCount = backup.messages?.length || 0;

            if (backupCount > existingCount) {
                existing.messages = backup.messages;
                existing.createdAt = backup.createdAt || existing.createdAt;
                await Storage.saveSession(existing);
                saveSuccess = true;
                console.log('[SessionPersistence] Recovered', backupCount - existingCount, 'messages');
            } else {
                saveSuccess = true;
            }
        } else if (backup.messages?.length > 0) {
            await Storage.saveSession?.({
                id: backup.sessionId,
                title: 'Recovered Chat',
                createdAt: backup.createdAt,
                messages: backup.messages
            });
            saveSuccess = true;
            console.log('[SessionPersistence] Created session from emergency backup');
        }

        if (saveSuccess) {
            localStorage.removeItem(SESSION_EMERGENCY_BACKUP_KEY);
        }

        return saveSuccess;
    } catch (e) {
        console.error('[SessionPersistence] Failed to recover emergency backup:', e);
        return false;
    }
}

/**
 * Get current auto-save timeout ID (for testing)
 * @returns {number|null} Timeout ID
 */
export function getAutoSaveTimeoutId() {
    return autoSaveTimeoutId;
}

/**
 * Clear auto-save timeout (for testing)
 */
export function clearAutoSaveTimeout() {
    if (autoSaveTimeoutId) {
        clearTimeout(autoSaveTimeoutId);
        autoSaveTimeoutId = null;
    }
}

console.log('[SessionPersistence] Module loaded');
