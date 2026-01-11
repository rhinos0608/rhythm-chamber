/**
 * Chat Integration Module
 * Handles conversation with OpenRouter API
 * 
 * System prompts are defined in prompts.js for easy editing
 */

let conversationHistory = [];
let userContext = null;

/**
 * Initialize chat with user context
 */
function initChat(personality, patterns, summary) {
    userContext = {
        personality,
        patterns,
        summary
    };

    conversationHistory = [];

    return buildSystemPrompt();
}

/**
 * Build system prompt with user data
 */
function buildSystemPrompt() {
    const template = window.Prompts?.system;
    if (!template || !userContext) return '';

    const { personality, patterns, summary } = userContext;

    // Format date range
    const dateRange = summary?.dateRange
        ? `${summary.dateRange.start} to ${summary.dateRange.end}`
        : 'Unknown';

    // Format summary
    const summaryText = summary
        ? `${summary.totalHours} hours of music, ${summary.uniqueArtists} artists, ${summary.uniqueTracks} tracks`
        : 'Summary not available';

    // Format evidence with more detail
    const evidenceItems = personality.allEvidence || [];
    const evidenceText = evidenceItems.length > 0
        ? '• ' + evidenceItems.join('\n• ')
        : 'No specific patterns detected';

    // Get current date
    const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    return template
        .replace('{{personality_name}}', personality.name)
        .replace('{{tagline}}', personality.tagline)
        .replace('{{summary}}', summaryText)
        .replace('{{date_range}}', dateRange)
        .replace('{{current_date}}', currentDate)
        .replace('{{evidence}}', evidenceText);
}

/**
 * Send a message and get response
 */
async function sendMessage(message, apiKey = null) {
    if (!userContext) {
        throw new Error('Chat not initialized. Call initChat first.');
    }

    // Add user message to history
    conversationHistory.push({
        role: 'user',
        content: message
    });

    // Build messages array
    const messages = [
        { role: 'system', content: buildSystemPrompt() },
        ...conversationHistory
    ];

    // Get configuration
    const config = window.Config?.openrouter;
    if (!config) {
        throw new Error('Config not loaded. Make sure js/config.js exists.');
    }

    // Get API key from config, storage, or parameter
    const key = apiKey || config.apiKey || await Storage.getSetting('openrouter_key');

    if (!key || key === 'your-api-key-here') {
        // Return a helpful message if no API key configured
        const fallbackResponse = generateFallbackResponse(message);
        conversationHistory.push({
            role: 'assistant',
            content: fallbackResponse
        });
        return fallbackResponse;
    }

    try {
        const response = await fetch(config.apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': config.app?.url || window.location.origin,
                'X-Title': config.app?.name || 'Rhythm Chamber'
            },
            body: JSON.stringify({
                model: config.model,
                messages,
                max_tokens: config.maxTokens,
                temperature: config.temperature
            })
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const assistantMessage = data.choices[0]?.message?.content || 'I couldn\'t generate a response.';

        // Add to history
        conversationHistory.push({
            role: 'assistant',
            content: assistantMessage
        });

        return assistantMessage;

    } catch (error) {
        console.error('Chat error:', error);

        const fallbackResponse = generateFallbackResponse(message);
        conversationHistory.push({
            role: 'assistant',
            content: fallbackResponse
        });
        return fallbackResponse;
    }
}

/**
 * Generate a fallback response when API is unavailable
 */
function generateFallbackResponse(message) {
    const { personality, patterns } = userContext;
    const lowerMessage = message.toLowerCase();

    // Check for common questions
    if (lowerMessage.includes('2020') || lowerMessage.includes('2021') || lowerMessage.includes('2022')) {
        const year = message.match(/20\d{2}/)?.[0];
        if (patterns.eras && patterns.eras.eras.length > 0) {
            const era = patterns.eras.eras.find(e => e.start.includes(year));
            if (era) {
                return `During ${era.start}, you were really into ${era.topArtists.slice(0, 3).join(', ')}. That lasted about ${era.weeks} weeks. Want to know what shifted after that?`;
            }
        }
        return `Looking at ${year}... I can see your listening patterns, but to really explore this I'd need the chat API connected. Your data shows ${patterns.summary?.uniqueArtists || 'many'} unique artists during this period.`;
    }

    if (lowerMessage.includes('ghost') || lowerMessage.includes('stop')) {
        if (patterns.ghostedArtists && patterns.ghostedArtists.ghosted.length > 0) {
            const ghost = patterns.ghostedArtists.ghosted[0];
            return `${ghost.artist} stands out — you played them ${ghost.totalPlays} times, then just... stopped ${ghost.daysSince} days ago. That's a significant shift. Something changed?`;
        }
        return `I can see some artists you've moved on from, but the full picture needs the chat API. Your personality type suggests you process music emotionally, so these changes might be meaningful.`;
    }

    if (lowerMessage.includes('favorite') || lowerMessage.includes('love')) {
        if (patterns.trueFavorites && patterns.trueFavorites.topByPlays) {
            const top = patterns.trueFavorites.topByPlays;
            return `By play count, it's ${top.artist} with ${top.plays} plays. But pure plays don't tell the whole story — completion rate matters too. ${personality.name}s like you often have a complex relationship with their "favorites."`;
        }
    }

    // Default response
    return `As ${personality.name}, ${personality.tagline.toLowerCase()} ${personality.allEvidence?.[0] || ''}\n\nTo explore deeper questions, connect an OpenRouter API key in settings. Until then, I can tell you about your patterns: ${patterns.summary?.totalHours || 'many'} hours of music across ${patterns.summary?.uniqueArtists || 'many'} artists.`;
}

/**
 * Clear conversation history
 */
function clearHistory() {
    conversationHistory = [];
}

/**
 * Get conversation history
 */
function getHistory() {
    return [...conversationHistory];
}

// Public API
window.Chat = {
    initChat,
    sendMessage,
    clearHistory,
    getHistory
};
