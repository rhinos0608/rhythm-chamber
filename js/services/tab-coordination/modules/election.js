/**
 * Tab Coordinator - Election Module
 *
 * Handles primary tab election logic including:
 * - Claiming primary status
 * - Initiating re-election
 * - Managing election state (candidates, aborted flags)
 * - Split-brain prevention
 *
 * @module tab-coordination/modules/election
 */

import { EventBus } from '../../event-bus.js';
import { MESSAGE_TYPES, TAB_ID, vectorClock } from '../constants.js';
import { getElectionWindowMs } from '../timing.js';
import {
    getIsPrimaryTab,
    setIsPrimaryTab,
    notifyAuthorityChange,
    handleSecondaryMode,
} from './authority.js';

// Lazy import to avoid circular dependency with watermark
let Watermark;
async function getWatermark() {
    if (!Watermark) {
        const module = await import('./watermark.js');
        Watermark = module;
    }
    return Watermark;
}

// Lazy import to avoid circular dependency
let sendMessage;
async function getSendMessage() {
    if (!sendMessage) {
        const module = await import('./message-sender.js');
        sendMessage = module.sendMessage;
    }
    return sendMessage;
}

// ==========================================
// Election State
// ==========================================

let electionTimeout = null;
let electionCandidates = new Set();
let receivedPrimaryClaim = false;
let electionAborted = false;
let hasCalledSecondaryMode = false;
let hasConcededLeadership = false;

// ==========================================
// Getters
// ==========================================

/**
 * Check if election was aborted
 */
function isElectionAborted() {
    return electionAborted;
}

/**
 * Check if a primary claim was received
 */
function hasReceivedPrimaryClaim() {
    return receivedPrimaryClaim;
}

/**
 * Check if secondary mode was called
 */
function hasEnteredSecondaryMode() {
    return hasCalledSecondaryMode;
}

/**
 * Check if leadership was conceded
 */
export function getHasConcededLeadership() {
    return hasConcededLeadership;
}

/**
 * Get current election candidates
 */
function getCandidates() {
    return new Set(electionCandidates);
}

/**
 * Check if currently in election window
 */
function isInElection() {
    return electionTimeout !== null;
}

// ==========================================
// Setters (Internal)
// ==========================================

/**
 * Mark election as aborted
 */
export function abortElection() {
    electionAborted = true;
}

/**
 * Mark that primary claim was received
 */
export function setReceivedPrimaryClaim(value) {
    receivedPrimaryClaim = value;
}

/**
 * Mark that secondary mode was called
 */
export function setCalledSecondaryMode(value) {
    hasCalledSecondaryMode = value;
}

/**
 * Mark that leadership was conceded
 */
export function setConcededLeadership(value) {
    hasConcededLeadership = value;
}

/**
 * Add candidate to election
 */
export function addCandidate(tabId) {
    electionCandidates.add(tabId);
}

/**
 * Initialize election state
 * Call this when the module is first loaded
 */
export function initializeElection() {
    electionCandidates = new Set([TAB_ID]);
    receivedPrimaryClaim = false;
    electionAborted = false;
    hasCalledSecondaryMode = false;
    hasConcededLeadership = false;
}

/**
 * Reset election state for new election
 */
function resetElectionState() {
    electionCandidates = new Set([TAB_ID]);
    receivedPrimaryClaim = false;
    electionAborted = false;
    hasCalledSecondaryMode = false;
    hasConcededLeadership = false;
}

// ==========================================
// Election Operations
// ==========================================

/**
 * Claim primary tab status
 * Refuses to claim if already conceded or received claim from another tab (split-brain prevention)
 * Starts watermark broadcast after successfully claiming primary
 */
export async function claimPrimary() {
    if (hasConcededLeadership || receivedPrimaryClaim) {
        console.error('[TabCoordination] Refusing to claim primary (split-brain prevention)');
        return;
    }

    setIsPrimaryTab(true);
    hasCalledSecondaryMode = false;

    const msg = await getSendMessage();
    msg({ type: MESSAGE_TYPES.CLAIM_PRIMARY, tabId: TAB_ID }, true);

    // Immediately write to localStorage for late-joining tabs to detect
    try {
        localStorage.setItem(
            'rhythm_chamber_tab_election',
            JSON.stringify({
                tabId: TAB_ID,
                timestamp: Date.now(),
                isPrimary: true,
            })
        );
    } catch (e) {
        // localStorage might not be available
    }

    notifyAuthorityChange();
    EventBus.emit('tab:primary_claimed', { tabId: TAB_ID });

    // Start watermark broadcast after claiming primary
    const wm = await getWatermark();
    wm.startWatermarkBroadcast();
}

/**
 * Handle transition to secondary mode
 * Stops watermark broadcast before calling authority's secondary mode handler
 */
export async function handleSecondaryModeWithWatermark() {
    const wm = await getWatermark();
    wm.stopWatermarkBroadcast();
    handleSecondaryMode();
}

/**
 * Initiate a new election cycle
 * Clears existing state and starts new election window
 */
export async function initiateReElection() {
    if (electionTimeout) {
        clearTimeout(electionTimeout);
        electionTimeout = null;
    }

    resetElectionState();

    const msg = await getSendMessage();
    await msg({ type: MESSAGE_TYPES.CANDIDATE, tabId: TAB_ID });

    await new Promise(resolve => {
        electionTimeout = setTimeout(resolve, getElectionWindowMs());
    });

    electionTimeout = null;

    // If we haven't aborted and haven't received a claim, we can become primary
    if (!getIsPrimaryTab() && !electionAborted) {
        claimPrimary();
    }
}

/**
 * Resolve election by selecting winner from candidates
 * Winner is the tab with the lowest lexicographical ID
 */
export function resolveElection() {
    if (electionAborted) {
        return false;
    }

    const sortedCandidates = Array.from(electionCandidates).sort();
    const winner = sortedCandidates[0];
    return winner === TAB_ID;
}

/**
 * Complete election after window closes
 * Returns true if this tab won the election
 */
export async function completeElection() {
    const won = resolveElection();
    if (won) {
        await claimPrimary();
    }
    return won;
}

// ==========================================
// Cleanup
// ==========================================

/**
 * Clear election timeout
 */
export function cleanupElection() {
    if (electionTimeout) {
        clearTimeout(electionTimeout);
        electionTimeout = null;
    }

    electionCandidates.clear();
    receivedPrimaryClaim = false;
    electionAborted = false;
    hasCalledSecondaryMode = false;
    hasConcededLeadership = false;
}
