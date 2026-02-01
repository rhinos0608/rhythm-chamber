/**
 * Configuration File for Rhythm Chamber
 *
 * SETUP INSTRUCTIONS:
 * 1. Copy this file to `config.js` in the same directory
 * 2. Get an API key from one of the providers below (Gemini is free!)
 * 3. Replace 'your-api-key-here' with your actual API key
 * 4. (Optional) For Quick Snapshot: Get Spotify Client ID from https://developer.spotify.com/dashboard
 * 5. Save the file
 *
 * NOTE: config.js is gitignored and will not be committed to version control
 *
 * API KEY SOURCES:
 * - Gemini (FREE): https://aistudio.google.com/apikey
 * - OpenRouter: https://openrouter.ai/keys
 */

const Config = {
    // ==========================================
    // AI PROVIDER CONFIGURATION
    // ==========================================
    // Choose ONE provider to configure. You can also configure multiple and switch in Settings.

    // Gemini (Google AI Studio) - FREE tier available!
    // Get your API key from: https://aistudio.google.com/apikey
    gemini: {
        apiKey: 'your-gemini-api-key-here', // Starts with AIzaSy...

        // Model selection (all support function calling)
        // Free tier: 'gemini-2.5-flash' (default), 'gemini-2.0-flash', 'gemini-1.5-flash'
        // Pro models: 'gemini-2.5-pro', 'gemini-1.5-pro'
        model: 'gemini-2.5-flash',

        // Chat parameters
        maxTokens: 8192,
        temperature: 0.7,
        topP: 0.9,
    },

    // OpenRouter API Configuration (access to multiple AI models)
    // Get your API key from: https://openrouter.ai/keys
    openrouter: {
        apiKey: 'your-openrouter-api-key-here', // Starts with sk-or-v1-...
        apiUrl: 'https://openrouter.ai/api/v1/chat/completions',

        // Model selection
        // Free tier: 'xiaomi/mimo-v2-flash:free', 'mistralai/mistral-7b-instruct:free'
        // Paid options: 'anthropic/claude-3.5-sonnet', 'openai/gpt-4-turbo'
        model: 'xiaomi/mimo-v2-flash:free',

        // Chat parameters
        maxTokens: 4500,
        temperature: 0.7,
    },

    // ==========================================
    // SPOTIFY CONFIGURATION (Quick Snapshot)
    // ==========================================
    // Get your Client ID from: https://developer.spotify.com/dashboard
    spotify: {
        clientId: 'your-spotify-client-id',
        redirectUri: window.location.origin + '/app.html',
        // Required scopes for Quick Snapshot
        scopes: [
            'user-read-recently-played', // Last 50 recently played tracks
            'user-top-read', // Top artists and tracks
        ],
    },

    // ==========================================
    // STRIPE CONFIGURATION (Premium features)
    // ==========================================
    // Get your keys from: https://dashboard.stripe.com/apikeys
    stripe: {
        publishableKey: 'pk_test_your-publishable-key',
        prices: {
            lifetime: 'price_lifetime_id', // $5 one-time payment
            monthly: 'price_monthly_id', // $2/month subscription
        },
    },

    // ==========================================
    // APP METADATA
    // ==========================================
    app: {
        name: 'Rhythm Chamber',
        url: window.location.origin,
    },
};
