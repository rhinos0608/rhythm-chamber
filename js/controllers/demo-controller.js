/**
 * Demo Controller
 * 
 * Handles demo mode with isolated data sandbox.
 * Extracted from app.js to separate demo concerns from main app flow.
 * 
 * @module controllers/demo-controller
 */

// ==========================================
// Dependencies (injected via init)
// ==========================================

let AppState = null;
let DemoData = null;
let ViewController = null;
let showToast = null;

// ==========================================
// Core Functions
// ==========================================

/**
 * Initialize DemoController with dependencies
 * @param {Object} dependencies - Required dependencies
 */
function init(dependencies) {
    AppState = dependencies.AppState;
    DemoData = dependencies.DemoData;
    ViewController = dependencies.ViewController;
    showToast = dependencies.showToast;

    console.log('[DemoController] Initialized with dependencies');
}

/**
 * Load demo mode with pre-computed "The Emo Teen" persona
 * Uses in-memory storage to avoid mixing with user's real data
 * @returns {Promise<void>}
 */
async function loadDemoMode() {
    if (!ViewController || !AppState || !DemoData) {
        console.error('[DemoController] Required dependencies not available');
        return;
    }

    console.log('[DemoController] Loading demo data: "The Emo Teen"');

    ViewController.showProcessing();
    ViewController.updateProgress('🎭 Loading demo mode...');

    // Get demo data package
    const demoPackage = DemoData.getFullDemoPackage();

    // Load demo data into ISOLATED demo domain (not main data domain)
    // HNW: Prevents demo data from polluting real user data
    ViewController.updateProgress('Loading sample streaming history...');
    await new Promise(r => setTimeout(r, 300));

    AppState.update('demo', {
        isDemoMode: true,
        streams: demoPackage.streams,
        patterns: demoPackage.patterns,
        personality: demoPackage.personality
    });

    ViewController.updateProgress('Preparing demo experience...');
    await new Promise(r => setTimeout(r, 300));

    // Show reveal
    ViewController.showReveal();

    // Add demo badge to UI
    addDemoBadge();

    // Pre-load chat with demo-specific suggestions
    setupDemoChatSuggestions();

    console.log('[DemoController] Demo mode loaded successfully (data isolated in demo domain)');
}

/**
 * Add visual indicator that user is in demo mode
 */
function addDemoBadge() {
    // Add badge to header
    const headerLeft = document.querySelector('.header-left');
    if (headerLeft && !document.getElementById('demo-badge')) {
        const badge = document.createElement('span');
        badge.id = 'demo-badge';
        badge.className = 'demo-badge';
        badge.innerHTML = '🎭 Demo Mode';
        badge.title = 'You are viewing sample data. Upload your own data to see your real personality.';
        badge.style.cssText = `
            background: linear-gradient(135deg, var(--accent), var(--accent-secondary, #9b59b6));
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 600;
            margin-left: 12px;
            cursor: help;
        `;
        headerLeft.appendChild(badge);
    }

    // Add exit demo mode button
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        resetBtn.textContent = 'Exit Demo';
        resetBtn.title = 'Exit demo mode and upload your own data';
    }
}

/**
 * Setup demo-specific chat suggestions tuned to sample data
 * Note: We use data attributes and rely on existing event delegation from setupEventListeners
 * to avoid duplicate click handlers
 */
function setupDemoChatSuggestions() {
    const suggestions = document.getElementById('chat-suggestions');
    if (suggestions) {
        // Replace with demo-specific suggestions
        // The event listeners from setupEventListeners() use querySelectorAll at init time,
        // so these NEW elements need their own handlers
        suggestions.innerHTML = `
            <button class="suggestion-chip demo-chip" data-question="Tell me about my MCR obsession">
                Tell me about my MCR obsession
            </button>
            <button class="suggestion-chip demo-chip" data-question="What was my emo phase like in 2019?">
                What was my emo phase like in 2019?
            </button>
            <button class="suggestion-chip demo-chip" data-question="Why did I stop listening to Pierce The Veil?">
                Why did I stop listening to Pierce The Veil?
            </button>
            <button class="suggestion-chip demo-chip" data-question="How has my taste evolved over the years?">
                How has my taste evolved?
            </button>
        `;

        // Attach event listeners to the NEW demo-specific chips
        // These are new elements so won't have duplicate listeners
        suggestions.querySelectorAll('.demo-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Prevent any bubbling
                const question = chip.dataset.question;
                const input = document.getElementById('chat-input');
                if (input) {
                    input.value = question;
                }
                // Trigger chat send
                const sendBtn = document.getElementById('chat-send');
                if (sendBtn) {
                    sendBtn.click();
                }
            });
        });
    }
}

/**
 * Get demo data package
 * @returns {Object} Demo data package
 */
function getDemoPackage() {
    if (!DemoData) {
        console.error('[DemoController] DemoData module not available');
        return null;
    }
    return DemoData.getFullDemoPackage();
}

/**
 * Check if currently in demo mode
 * @returns {boolean}
 */
function isDemoMode() {
    if (!AppState) return false;
    const demoState = AppState.get('demo');
    return demoState?.isDemoMode || false;
}

/**
 * Get active data (demo or real) transparently
 * HNW: Components use this to access data without knowing if demo mode is active
 * @returns {{ streams: Array, patterns: Object, personality: Object, isDemoMode: boolean }}
 */
function getActiveData() {
    if (!AppState) {
        return { streams: null, patterns: null, personality: null, isDemoMode: false };
    }

    const state = AppState.get();
    const isDemo = state.demo?.isDemoMode || false;

    if (isDemo) {
        return {
            streams: state.demo.streams,
            patterns: state.demo.patterns,
            personality: state.demo.personality,
            isDemoMode: true
        };
    }

    return {
        streams: state.data.streams,
        patterns: state.data.patterns,
        personality: state.data.personality,
        isDemoMode: false
    };
}

/**
 * Exit demo mode
 * @returns {Promise<void>}
 */
async function exitDemoMode() {
    if (!AppState || !ViewController) return;

    // Clear demo state
    AppState.update('demo', {
        isDemoMode: false,
        streams: null,
        patterns: null,
        personality: null
    });

    // Remove demo badge
    const demoBadge = document.getElementById('demo-badge');
    if (demoBadge) {
        demoBadge.remove();
    }

    // Reset reset button
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        resetBtn.textContent = 'Reset';
        resetBtn.title = 'Clear all data and start over';
    }

    // Show upload view
    ViewController.showUpload();

    console.log('[DemoController] Exited demo mode');
}

/**
 * Validate demo data integrity
 * @returns {boolean} True if demo data is valid
 */
function validateDemoData() {
    if (!DemoData) return false;

    try {
        const demoPackage = DemoData.getFullDemoPackage();
        return demoPackage &&
            Array.isArray(demoPackage.streams) &&
            demoPackage.streams.length > 0 &&
            demoPackage.patterns &&
            demoPackage.personality;
    } catch (error) {
        console.error('[DemoController] Demo data validation failed:', error);
        return false;
    }
}

// ==========================================
// Public API
// ==========================================

const DemoController = {
    init,
    loadDemoMode,
    addDemoBadge,
    setupDemoChatSuggestions,
    getDemoPackage,
    isDemoMode,
    getActiveData,
    exitDemoMode,
    validateDemoData
};

// Make available globally
if (typeof window !== 'undefined') {
    window.DemoController = DemoController;
}

console.log('[DemoController] Controller loaded');