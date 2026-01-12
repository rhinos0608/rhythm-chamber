/**
 * State Manager for Rhythm Chamber
 * 
 * Centralized state management module that handles:
 * - Single source of truth for application state
 * - Multi-tab synchronization via BroadcastChannel
 * - Persistence coordination (IndexedDB + localStorage)
 * - Reactive state updates (Observer pattern)
 */
(function () {
    const STATE_CHANNEL = 'rhythm_chamber_state';
    const SIDEBAR_STATE_KEY = 'rhythm_chamber_sidebar_collapsed';

    class StateManager {
        constructor() {
            // Core Application State
            this._state = {
                // Data
                streams: null,
                chunks: null,
                patterns: null,
                personality: null,

                // Lite Mode (Spotify API)
                liteData: null,
                litePatterns: null,
                isLiteMode: false,

                // UI State
                view: 'upload', // upload, processing, reveal, lite-reveal, chat
                sidebarCollapsed: false,

                // Processing State (Ephemeral, not synced via channel usually)
                isProcessing: false,
                processingStage: null,
                processingProgress: 0
            };

            this._subscribers = new Set();
            this._channel = new BroadcastChannel(STATE_CHANNEL);
            this._initialized = false;

            this._setupChannel();
        }

        /**
         * Setup BroadcastChannel listeners for multi-tab sync
         */
        _setupChannel() {
            this._channel.onmessage = (event) => {
                const { type, payload } = event.data;

                switch (type) {
                    case 'STATE_UPDATE':
                        this._applyRemoteUpdate(payload);
                        break;
                    case 'RESET':
                        this._applyReset();
                        break;
                    case 'REQUEST_SYNC':
                        this._broadcastState();
                        break;
                }
            };
        }

        /**
         * Initialize state from persistence layer
         */
        async init() {
            if (this._initialized) return;

            try {
                // 1. Load sidebar preference (localStorage)
                const sidebarState = localStorage.getItem(SIDEBAR_STATE_KEY);
                if (sidebarState !== null) {
                    this._state.sidebarCollapsed = sidebarState === 'true';
                }

                // 2. Load heavy data (IndexedDB via Storage module)
                // Ensure Storage is initialized first (caller responsibility, but safe check)
                if (window.Storage) {
                    const personality = await window.Storage.getPersonality();

                    if (personality) {
                        this._state.personality = personality;

                        // Determine mode and load appropriate data
                        // Note: We might need a flag in DB for isLiteMode, or infer it
                        // For now, we load both if available

                        this._state.streams = await window.Storage.getStreams();
                        this._state.chunks = await window.Storage.getChunks();

                        // Re-hydrate patterns if streams exist
                        if (this._state.streams && window.Patterns) {
                            this._state.patterns = window.Patterns.detectAllPatterns(
                                this._state.streams,
                                this._state.chunks
                            );
                        }

                        // Set view if data exists
                        this._state.view = 'reveal';
                        // Logic to distinguish lite-reveal vs reveal can be refined based on data presence
                        if (!this._state.streams && this._state.personality) {
                            // Likely lite mode if no streams but personality exists
                            // logic to be confirmed with Storage structure
                            this._state.view = 'lite-reveal'; // Reasonable default if personality but no streams?
                        }
                    }
                }

                this._initialized = true;
                this._notifySubscribers({}, null); // Initial notification

                // Ask other tabs for state if we came up empty? 
                // Or maybe just announce we are here?

            } catch (error) {
                console.error('[StateManager] Initialization failed:', error);
            }
        }

        /**
         * Get current state snapshot
         * @returns {Object} Deep copy of state (or shallow for performance on big objects? doing shallow for now)
         */
        getState() {
            return { ...this._state };
        }

        /**
         * Update application state
         * @param {Object} partialState - Properties to update
         * @param {Object} options - { persist: boolean, broadcast: boolean }
         */
        async setState(partialState, options = { broadcast: true }) {
            const previousState = { ...this._state };

            // Update local state
            Object.assign(this._state, partialState);

            // Handle Side Effects & Persistence

            // Sidebar Persistence
            if (partialState.hasOwnProperty('sidebarCollapsed')) {
                localStorage.setItem(SIDEBAR_STATE_KEY, this._state.sidebarCollapsed);
            }

            // Notify local subscribers
            this._notifySubscribers(partialState, previousState);

            // Broadcast to other tabs
            if (options.broadcast) {
                // Don't broadcast heavy data arrays if not necessary
                // For heavy data, we might send a 'flag' that data updated, and tabs reload from IDB?
                // Sending huge streams array over BroadcastChannel is bad.

                const payload = { ...partialState };

                // Filter out heavy data from broadcast payload
                if (payload.streams) delete payload.streams;
                if (payload.chunks) delete payload.chunks;

                // If heavy data changed, send a 'DATA_REFRESH' signal or rely on Storage events?
                // For now, let's assume heavy data sync is handled by reloading from DB when notified.
                // But BroadcastChannel is simple. 
                // Let's send a lightweight update. If 'streams' changed, we send a flag.

                if (partialState.streams || partialState.chunks) {
                    payload._dataUpdated = true;
                }

                this._channel.postMessage({
                    type: 'STATE_UPDATE',
                    payload: payload
                });
            }
        }

        /**
         * Apply update received from another tab
         */
        async _applyRemoteUpdate(payload) {
            // If heavy data flag is set, reload from DB
            if (payload._dataUpdated) {
                if (window.Storage) {
                    this._state.streams = await window.Storage.getStreams();
                    this._state.chunks = await window.Storage.getChunks();
                    if (this._state.streams && window.Patterns) {
                        this._state.patterns = window.Patterns.detectAllPatterns(
                            this._state.streams,
                            this._state.chunks
                        );
                    }
                }
                delete payload._dataUpdated;
            }

            const previousState = { ...this._state };
            Object.assign(this._state, payload);
            this._notifySubscribers(payload, previousState);
        }

        /**
         * Subscribe to state changes
         * @param {Function} callback - (currentState, changes, previousState) => void
         * @returns {Function} unsubscribe function
         */
        subscribe(callback) {
            this._subscribers.add(callback);
            // Immediate callback with current state
            if (this._initialized) {
                callback(this._state, {}, this._state);
            }
            return () => this._subscribers.delete(callback);
        }

        _notifySubscribers(changes, previous) {
            this._subscribers.forEach(cb => cb(this._state, changes, previous));
        }

        _broadcastState() {
            const payload = { ...this._state };
            // Strip heavy data
            delete payload.streams;
            delete payload.chunks;
            delete payload.patterns; // patterns can be big

            this._channel.postMessage({
                type: 'STATE_UPDATE',
                payload
            });
        }

        /**
         * Reset complete application state and storage
         */
        async reset() {
            // Clear persistence
            if (window.Storage) {
                await window.Storage.clearAll();
            }

            // Reset state
            this._state = {
                streams: null,
                chunks: null,
                patterns: null,
                personality: null,
                liteData: null,
                litePatterns: null,
                isLiteMode: false,
                view: 'upload',
                sidebarCollapsed: this._state.sidebarCollapsed, // Keep preference
                isProcessing: false,
                processingStage: null,
                processingProgress: 0
            };

            this._notifySubscribers({}, null);

            // Broadcast reset command
            this._channel.postMessage({ type: 'RESET' });
        }

        _applyReset() {
            this._state = {
                ...this._state,
                streams: null,
                chunks: null,
                patterns: null,
                personality: null,
                liteData: null,
                litePatterns: null,
                isLiteMode: false,
                view: 'upload'
            };
            this._notifySubscribers({}, null);
        }
    }

    // Initialize and Expose
    window.StateManager = new StateManager();
    console.log('[StateManager] Module loaded (IIFE)');
})();
