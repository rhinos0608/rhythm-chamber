/**
 * Template Profile Executors
 *
 * Execution logic for template profile functions.
 * These don't require user stream data.
 */

import { TemplateProfileStore } from '../../template-profiles.js';
import { ProfileSynthesizer } from '../../profile-synthesizer.js';

function executeGetTemplatesByGenre(args) {
    const { genre, limit = 5 } = args;

    if (!TemplateProfileStore) {
        return { error: 'Template profiles not available' };
    }

    const templates = TemplateProfileStore.searchByGenre(genre, limit);

    if (templates.length === 0) {
        return {
            error: `No templates found for genre "${genre}". Try: ${TemplateProfileStore.getAllGenres().slice(0, 5).join(', ')}`
        };
    }

    return {
        genre: genre,
        count: templates.length,
        templates: templates.map(t => ({
            id: t.id,
            name: t.name,
            emoji: t.emoji,
            description: t.description,
            personality_type: t.metadata.personalityType,
            has_data: TemplateProfileStore.hasData(t.id)
        }))
    };
}

function executeGetTemplatesWithPattern(args) {
    const { pattern_type } = args;

    if (!TemplateProfileStore) {
        return { error: 'Template profiles not available' };
    }

    const templates = TemplateProfileStore.searchByPattern(pattern_type);

    if (templates.length === 0) {
        return {
            error: `No templates found with pattern "${pattern_type}". Available patterns: ${TemplateProfileStore.getAllPatterns().join(', ')}`
        };
    }

    return {
        pattern: pattern_type,
        count: templates.length,
        templates: templates.map(t => ({
            id: t.id,
            name: t.name,
            emoji: t.emoji,
            description: t.description,
            all_patterns: t.metadata.patternSignals
        }))
    };
}

function executeGetTemplatesByPersonality(args) {
    const { personality_type } = args;

    if (!TemplateProfileStore) {
        return { error: 'Template profiles not available' };
    }

    const templates = TemplateProfileStore.searchByPersonality(personality_type);

    if (templates.length === 0) {
        return {
            error: `No templates found for personality "${personality_type}".`
        };
    }

    return {
        personality_type: personality_type,
        count: templates.length,
        templates: templates.map(t => ({
            id: t.id,
            name: t.name,
            emoji: t.emoji,
            description: t.description,
            genres: t.metadata.genres,
            has_data: TemplateProfileStore.hasData(t.id)
        }))
    };
}

async function executeSynthesizeProfile(args) {
    const { description } = args;

    if (!ProfileSynthesizer) {
        return { error: 'Profile synthesizer not available' };
    }

    try {
        const profile = await ProfileSynthesizer.synthesizeFromDescription(description);

        return {
            success: true,
            profile: {
                id: profile.id,
                name: profile.name,
                description: profile.description,
                personality: profile.personality ? {
                    type: profile.personality.type,
                    emoji: profile.personality.emoji,
                    tagline: profile.personality.tagline
                } : null,
                source_templates: profile.sourceTemplates,
                stream_count: profile.metadata.streamCount
            },
            message: `Created synthetic profile "${profile.name}" from ${profile.sourceTemplates.length} template(s).`
        };
    } catch (err) {
        return { error: `Synthesis failed: ${err.message}` };
    }
}

// ==========================================
// Executor Registry
// ==========================================

// ES Module export
export const TemplateExecutors = {
    get_templates_by_genre: executeGetTemplatesByGenre,
    get_templates_with_pattern: executeGetTemplatesWithPattern,
    get_templates_by_personality: executeGetTemplatesByPersonality,
    synthesize_profile: executeSynthesizeProfile
};


console.log('[TemplateExecutors] Module loaded');

