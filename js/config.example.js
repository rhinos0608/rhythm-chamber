/**
 * Configuration File for Rhythm Chamber
 * 
 * SETUP INSTRUCTIONS:
 * 1. Copy this file to `config.js` in the same directory
 * 2. Get your OpenRouter API key from https://openrouter.ai/keys
 * 3. Replace 'your-api-key-here' with your actual API key
 * 4. (Optional) For Quick Snapshot: Get Spotify Client ID from https://developer.spotify.com/dashboard
 * 5. Save the file
 * 
 * NOTE: config.js is gitignored and will not be committed to version control
 */

const Config = {
    // OpenRouter API Configuration
    openrouter: {
        apiKey: 'your-api-key-here',
        apiUrl: 'https://openrouter.ai/api/v1/chat/completions',

        // Model selection
        // Free tier: 'mistralai/mistral-7b-instruct:free'
        // Paid options: 'anthropic/claude-3.5-sonnet', 'openai/gpt-4-turbo'
        model: 'mistralai/mistral-7b-instruct:free',

        // Chat parameters
        maxTokens: 1000,
        temperature: 0.7
    },

    // Spotify OAuth Configuration (for Quick Snapshot feature)
    // Get your Client ID from: https://developer.spotify.com/dashboard
    spotify: {
        clientId: 'your-spotify-client-id',
        redirectUri: window.location.origin + '/app.html',
        // Required scopes for Quick Snapshot
        scopes: [
            'user-read-recently-played',  // Last 50 recently played tracks
            'user-top-read'               // Top artists and tracks
        ]
    },

    // App metadata for OpenRouter
    app: {
        name: 'Rhythm Chamber',
        url: window.location.origin
    }
};

// Make config available globally
window.Config = Config;
