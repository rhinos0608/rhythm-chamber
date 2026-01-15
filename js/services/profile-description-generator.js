/**
 * Profile Description Generator
 * 
 * Generates AI-powered custom personality descriptions based on
 * actual listening data when an LLM provider is configured.
 * 
 * HNW Considerations:
 * - Wave: Generates description asynchronously, UI shows loading state
 * - Network: Uses existing Chat module for LLM calls
 * - Hierarchy: Falls back to generic description if LLM unavailable
 * 
 * @module ProfileDescriptionGenerator
 */

'use strict';

// ==========================================
// LLM Availability Detection
// ==========================================

/**
 * Check if an LLM provider is available for profile generation
 * @returns {{ available: boolean, provider: string|null, reason: string }}
 */
function checkLLMAvailability() {
    const settings = window.Settings?.getSettings?.();

    if (!settings) {
        return { available: false, provider: null, reason: 'Settings not loaded' };
    }

    const provider = settings.llm?.provider || 'ollama';

    // Check provider-specific availability
    switch (provider) {
        case 'openrouter':
            const hasKey = window.Settings?.hasApiKey?.() ||
                (settings.openrouter?.apiKey &&
                    settings.openrouter.apiKey !== '' &&
                    settings.openrouter.apiKey !== 'your-api-key-here');
            if (!hasKey) {
                return { available: false, provider, reason: 'OpenRouter API key not configured' };
            }
            return { available: true, provider, reason: 'OpenRouter ready' };

        case 'ollama':
            // Ollama is local, assume available if configured
            // (actual connection test happens when generating)
            return { available: true, provider, reason: 'Ollama configured' };

        case 'lmstudio':
            // LM Studio is local, assume available if configured
            return { available: true, provider, reason: 'LM Studio configured' };

        default:
            return { available: false, provider: null, reason: 'Unknown provider' };
    }
}

// ==========================================
// Description Generation
// ==========================================

/**
 * Build the prompt for generating a personalized description
 * @param {Object} personality - Personality result
 * @param {Object} patterns - Detected patterns
 * @param {Object} summary - Data summary
 * @returns {string} The prompt
 */
function buildDescriptionPrompt(personality, patterns, summary) {
    const topArtist = patterns?.trueFavorites?.topByPlays?.artist || 'your favorite artist';
    const topEngaged = patterns?.trueFavorites?.topByEngagement?.artist || topArtist;
    const ghostedArtists = (patterns?.ghostedArtists?.ghosted ?? []).slice(0, 3).map(a => a.artist) || [];
    const eras = patterns?.eras?.eras?.length || 0;
    const streamCount = summary?.totalStreams?.toLocaleString() || 'thousands of';
    const hours = summary?.totalHours?.toLocaleString() || 'many';

    // Build context about the user's listening
    let context = `Based on ${streamCount} streams (${hours} hours of listening):
- Personality type: ${personality.name}
- Most played artist: ${topArtist}
- Most engaged artist: ${topEngaged}`;

    if (ghostedArtists.length > 0) {
        context += `\n- Artists they've "ghosted" (haven't played in over a year): ${ghostedArtists.join(', ')}`;
    }

    if (eras >= 3) {
        context += `\n- ${eras} distinct listening eras detected`;
    }

    if (patterns?.timePatterns?.isMoodEngineer) {
        context += `\n- Different music tastes between morning and evening`;
    }

    if (patterns?.discoveryExplosions?.hasExplosions && 
        Array.isArray(patterns.discoveryExplosions.explosions) && 
        patterns.discoveryExplosions.explosions.length > 0) {
        const explosion = patterns.discoveryExplosions.explosions[0];
        context += `\n- Discovery explosion: ${explosion.newArtists} new artists in ${explosion.month}`;
    }

    const prompt = `You are writing a personalized music personality description for someone's profile card.

${context}

Write a 2-3 sentence personalized description that:
1. Speaks directly to the user (use "you")
2. References specific insights from their data (artists, patterns)
3. Has an emotional, insightful tone (like a music journalist)
4. Feels unique to THIS person, not generic

Do NOT:
- Start with "You are a..."
- Be overly formal
- Use bullet points or lists
- Exceed 3 sentences

Example tone: "Your library reads like a diary written in sound. From your MCR obsession in 2019 to the way you've quietly let Pierce The Veil fade—you don't just collect songs, you archive feelings."

Write the description now:`;

    return prompt;
}

/**
 * Generate a personalized description using the configured LLM
 * @param {Object} personality - Personality result
 * @param {Object} patterns - Detected patterns
 * @param {Object} summary - Data summary
 * @param {Function} onProgress - Progress callback (optional)
 * @returns {Promise<string|null>} Generated description or null on failure
 */
async function generateDescription(personality, patterns, summary, onProgress = null) {
    const availability = checkLLMAvailability();

    if (!availability.available) {
        console.log('[ProfileDescGen] LLM not available:', availability.reason);
        return null;
    }

    console.log(`[ProfileDescGen] Generating description using ${availability.provider}`);

    if (onProgress) {
        onProgress('Crafting your personalized description...');
    }

    const prompt = buildDescriptionPrompt(personality, patterns, summary);

    try {
        // Use Chat module to call LLM (it handles all providers)
        if (window.Chat?.sendMessageDirect) {
            const response = await window.Chat.sendMessageDirect(prompt, {
                systemPrompt: 'You are a creative writer specializing in music journalism. Be concise and insightful.',
                maxTokens: 200,
                temperature: 0.8
            });

            if (response && response.content) {
                // Clean up the response
                let description = response.content.trim();
                // Remove quotes if the LLM wrapped it
                if (description.startsWith('"') && description.endsWith('"')) {
                    description = description.slice(1, -1);
                }
                return description;
            }
        }

        // Fallback: try using the raw provider call
        const settings = window.Settings?.getSettings?.();
        const provider = settings?.llm?.provider || 'ollama';

        if (provider === 'openrouter' && window.Config?.openrouter?.apiKey) {
            const response = await callOpenRouterDirect(prompt, settings);
            return response;
        }

        console.warn('[ProfileDescGen] No suitable LLM call method available');
        return null;

    } catch (error) {
        console.error('[ProfileDescGen] Generation failed:', error);
        return null;
    }
}

/**
 * Direct OpenRouter API call (fallback if Chat module doesn't have sendMessageDirect)
 */
async function callOpenRouterDirect(prompt, settings) {
    const apiKey = settings?.openrouter?.apiKey || window.Config?.openrouter?.apiKey;
    const model = settings?.openrouter?.model || 'xiaomi/mimo-v2-flash:free';
    const apiUrl = window.Config?.openrouter?.apiUrl || 'https://openrouter.ai/api/v1/chat/completions';

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin,
            'X-Title': 'Rhythm Chamber'
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: 'You are a creative writer specializing in music journalism. Be concise and insightful.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 200,
            temperature: 0.8
        })
    });

    if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
}

// ==========================================
// Public API
// ==========================================

export const ProfileDescriptionGenerator = {
    checkLLMAvailability,
    generateDescription,
    buildDescriptionPrompt
};

// Window global for backward compatibility
if (typeof window !== 'undefined') {
    window.ProfileDescriptionGenerator = ProfileDescriptionGenerator;
}

console.log('[ProfileDescriptionGenerator] Module loaded');
