import { VectorClock } from '../vector-clock.js';

const TAB_EVENT_SCHEMAS = {
    'tab:authority_changed': {
        description: 'Tab write authority changed (primary/secondary)',
        payload: { isPrimary: 'boolean', level: 'string', mode: 'string', message: 'string' }
    },
    'tab:primary_claimed': {
        description: 'Tab became primary',
        payload: { tabId: 'string' }
    },
    'tab:secondary_mode': {
        description: 'Tab entered secondary mode',
        payload: { primaryTabId: 'string' }
    }
};

const CHANNEL_NAME = 'rhythm_chamber_coordination';

const MESSAGE_TYPES = {
    CANDIDATE: 'CANDIDATE',
    CLAIM_PRIMARY: 'CLAIM_PRIMARY',
    RELEASE_PRIMARY: 'RELEASE_PRIMARY',
    HEARTBEAT: 'HEARTBEAT',
    EVENT_WATERMARK: 'EVENT_WATERMARK',
    REPLAY_REQUEST: 'REPLAY_REQUEST',
    REPLAY_RESPONSE: 'REPLAY_RESPONSE',
    SAFE_MODE_CHANGED: 'SAFE_MODE_CHANGED'
};

const vectorClock = new VectorClock();

let fallbackCounter = 0;

function generateTabId() {
    try {
        const tickResult = vectorClock.tick();
        const processId = vectorClock.processId;
        const tickValue = tickResult[processId];
        if (tickValue !== undefined && tickValue !== null && typeof processId === 'string' && processId.length > 8) {
            return `${tickValue}-${processId.substring(0, 8)}`;
        }
    } catch (e) {
        console.warn('[TabCoordination] Vector clock tick failed, using fallback TAB_ID:', e.message);
    }

    const timestamp = typeof performance !== 'undefined' && performance.now
        ? Math.floor(performance.now() * 1000)
        : Date.now() * 1000;
    const randomPart = Math.random().toString(36).substring(2, 11);
    const fallbackId = `tab_${timestamp}_${++fallbackCounter}_${randomPart}`;
    console.warn('[TabCoordination] Using fallback TAB_ID:', fallbackId);
    return fallbackId;
}

const TAB_ID = generateTabId();

export {
    CHANNEL_NAME,
    MESSAGE_TYPES,
    TAB_EVENT_SCHEMAS,
    TAB_ID,
    vectorClock
};
