/**
 * Configuration File for Rhythm Chamber
 * 
 * SETUP INSTRUCTIONS:
 * 1. Copy this file to `config.js` in the same directory
 * 2. Get your OpenRouter API key from https://openrouter.ai/keys
 * 3. Replace 'your-api-key-here' with your actual API key
 * 4. Save the file
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
        maxTokens: 500,
        temperature: 0.7
    },

    // App metadata for OpenRouter
    app: {
        name: 'Rhythm Chamber',
        url: window.location.origin
    }
};

// Make config available globally
window.Config = Config;
