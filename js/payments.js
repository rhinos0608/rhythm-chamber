/**
 * Payments Module for Rhythm Chamber
 * 
 * Client-side Stripe integration for premium features.
 * Uses Stripe Checkout for secure payment processing.
 */

const PREMIUM_STORAGE_KEY = 'rhythm_chamber_premium';

/**
 * Available pricing plans
 */
const PLANS = {
    lifetime: {
        name: 'Lifetime Access',
        price: '$5',
        mode: 'payment',
        description: 'One-time payment, forever access'
    },
    monthly: {
        name: 'Monthly',
        price: '$2/month',
        mode: 'subscription',
        description: 'Cancel anytime'
    }
};

/**
 * Check if user has premium access
 */
function isPremium() {
    try {
        const stored = localStorage.getItem(PREMIUM_STORAGE_KEY);
        if (!stored) return false;

        const data = JSON.parse(stored);

        // Check if premium is active
        if (!data.active) return false;

        // For subscriptions, check expiry (with 3-day grace period)
        if (data.plan === 'monthly' && data.expiresAt) {
            const expiry = new Date(data.expiresAt);
            const gracePeriod = 3 * 24 * 60 * 60 * 1000; // 3 days
            if (Date.now() > expiry.getTime() + gracePeriod) {
                return false;
            }
        }

        return true;
    } catch (e) {
        console.error('Error checking premium status:', e);
        return false;
    }
}

/**
 * Get premium status details
 */
function getPremiumStatus() {
    try {
        const stored = localStorage.getItem(PREMIUM_STORAGE_KEY);
        if (!stored) return null;
        return JSON.parse(stored);
    } catch (e) {
        return null;
    }
}

/**
 * Redirect to Stripe Checkout
 * @param {string} plan - 'lifetime' or 'monthly'
 */
async function upgradeToPremium(plan = 'lifetime') {
    const stripeConfig = window.Config?.stripe;

    if (!stripeConfig?.publishableKey) {
        Settings.showToast('Stripe not configured. Please add your Stripe keys to config.js');
        console.error('Missing Stripe configuration in config.js');
        return;
    }

    const priceId = stripeConfig.prices?.[plan];
    if (!priceId) {
        Settings.showToast(`Price ID not configured for plan: ${plan}`);
        console.error(`Missing price ID for plan: ${plan}`);
        return;
    }

    try {
        // Load Stripe if not already loaded
        if (!window.Stripe) {
            Settings.showToast('Loading payment system...');
            await loadStripeScript();
        }

        const stripe = window.Stripe(stripeConfig.publishableKey);

        // Redirect to Checkout
        const result = await stripe.redirectToCheckout({
            lineItems: [{ price: priceId, quantity: 1 }],
            mode: PLANS[plan].mode,
            successUrl: `${window.location.origin}/app.html?payment=success&plan=${plan}`,
            cancelUrl: `${window.location.origin}/app.html?payment=cancelled`
        });

        if (result.error) {
            Settings.showToast('Payment failed: ' + result.error.message);
            console.error('Stripe Checkout error:', result.error);
        }
    } catch (err) {
        Settings.showToast('Payment error: ' + err.message);
        console.error('Payment error:', err);
    }
}

/**
 * Load Stripe.js dynamically
 */
function loadStripeScript() {
    return new Promise((resolve, reject) => {
        if (window.Stripe) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://js.stripe.com/v3/';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load Stripe.js'));
        document.head.appendChild(script);
    });
}

/**
 * Handle return from Stripe Checkout
 * Called on page load if URL has payment parameters
 */
function handlePaymentReturn() {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const plan = urlParams.get('plan') || 'lifetime';

    if (!paymentStatus) return;

    // Clean URL
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);

    if (paymentStatus === 'success') {
        // Activate premium
        activatePremium(plan);

        // Show success message
        setTimeout(() => {
            Settings.showToast('🎉 Premium activated! You can now set up Semantic Search.');
        }, 500);

    } else if (paymentStatus === 'cancelled') {
        Settings.showToast('Payment cancelled. You can try again anytime.');
    }
}

/**
 * Activate premium access
 * @param {string} plan - 'lifetime' or 'monthly'
 */
function activatePremium(plan = 'lifetime') {
    const now = new Date();

    const premiumData = {
        active: true,
        plan: plan,
        activatedAt: now.toISOString(),
        // For monthly, set expiry to 35 days (with buffer)
        expiresAt: plan === 'monthly'
            ? new Date(now.getTime() + 35 * 24 * 60 * 60 * 1000).toISOString()
            : null
    };

    localStorage.setItem(PREMIUM_STORAGE_KEY, JSON.stringify(premiumData));
    console.log('Premium activated:', premiumData);
}

/**
 * Deactivate premium access (for testing)
 */
function deactivatePremium() {
    localStorage.removeItem(PREMIUM_STORAGE_KEY);
    console.log('Premium deactivated');
}

/**
 * Show the upgrade modal with plan options
 */
function showUpgradeModal() {
    const existing = document.getElementById('upgrade-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'upgrade-modal';
    modal.className = 'settings-modal';
    modal.innerHTML = `
        <div class="settings-overlay" onclick="Payments.hideUpgradeModal()"></div>
        <div class="settings-content upgrade-content">
            <div class="settings-header">
                <h2>🚀 Upgrade to Premium</h2>
                <button class="settings-close" onclick="Payments.hideUpgradeModal()">×</button>
            </div>
            
            <div class="settings-body">
                <p class="upgrade-description">
                    Unlock <strong>Semantic Search</strong> to ask natural questions about your listening history.
                    Your data is stored in your own private Qdrant cluster.
                </p>
                
                <div class="pricing-cards">
                    <div class="pricing-card featured" onclick="Payments.upgradeToPremium('lifetime')">
                        <div class="pricing-badge">Best Value</div>
                        <h3>Lifetime</h3>
                        <div class="pricing-amount">$5</div>
                        <p>One-time payment</p>
                        <ul>
                            <li>✓ Semantic search forever</li>
                            <li>✓ Unlimited embeddings</li>
                            <li>✓ All future features</li>
                        </ul>
                        <button class="btn btn-primary">Get Lifetime Access</button>
                    </div>
                    
                    <div class="pricing-card" onclick="Payments.upgradeToPremium('monthly')">
                        <h3>Monthly</h3>
                        <div class="pricing-amount">$2<span>/mo</span></div>
                        <p>Cancel anytime</p>
                        <ul>
                            <li>✓ Semantic search</li>
                            <li>✓ Unlimited embeddings</li>
                            <li>✓ Cancel anytime</li>
                        </ul>
                        <button class="btn btn-secondary">Subscribe Monthly</button>
                    </div>
                </div>
                
                <div class="upgrade-info">
                    <h4>How it works:</h4>
                    <ol>
                        <li>Complete payment via Stripe</li>
                        <li>Create a free <a href="https://cloud.qdrant.io" target="_blank">Qdrant Cloud</a> account</li>
                        <li>Add your cluster URL & API key in Settings</li>
                        <li>Click "Generate Embeddings" — done!</li>
                    </ol>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

/**
 * Hide the upgrade modal
 */
function hideUpgradeModal() {
    const modal = document.getElementById('upgrade-modal');
    if (modal) {
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 200);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    handlePaymentReturn();
});

// Public API
window.Payments = {
    isPremium,
    getPremiumStatus,
    upgradeToPremium,
    activatePremium,
    deactivatePremium,
    showUpgradeModal,
    hideUpgradeModal,
    handlePaymentReturn,
    PLANS
};
