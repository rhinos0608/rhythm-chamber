/**
 * Personality Classification Module
 * Scores and classifies music personality types
 */

const PERSONALITY_TYPES = {
    emotional_archaeologist: {
        name: 'The Emotional Archaeologist',
        emoji: '🏛️',
        tagline: 'You mark time through sound.',
        description: 'You don\'t just listen to music — you use it to process feelings. Your library is a scrapbook of emotional eras.',
        signals: ['distinct eras', 'high repeat', 'genre shifts']
    },
    mood_engineer: {
        name: 'The Mood Engineer',
        emoji: '🎛️',
        tagline: 'You use music to change your state.',
        description: 'You strategically deploy music to shift your emotional state. Morning you and evening you have different soundtracks.',
        signals: ['time-of-day patterns', 'mood searching']
    },
    discovery_junkie: {
        name: 'The Discovery Junkie',
        emoji: '🔍',
        tagline: 'Always hunting for the next sound.',
        description: 'You\'re constantly seeking new artists. Your playlists never settle — there\'s always something new to find.',
        signals: ['low plays-per-artist', 'high unique count']
    },
    comfort_curator: {
        name: 'The Comfort Curator',
        emoji: '🛋️',
        tagline: 'You know what you love.',
        description: 'Same songs for years, and you wouldn\'t have it any other way. You\'ve found your sound and you\'re sticking with it.',
        signals: ['high repeat rate', 'slow to change']
    },
    social_chameleon: {
        name: 'The Social Chameleon',
        emoji: '🎭',
        tagline: 'Your music shifts by context.',
        description: 'Weekday you and weekend you have different playlists. Your music adapts to the social situation.',
        signals: ['weekday ≠ weekend', 'context-dependent']
    }
};

/**
 * Score patterns against personality types
 */
function scorePersonality(patterns) {
    const scores = {
        emotional_archaeologist: 0,
        mood_engineer: 0,
        discovery_junkie: 0,
        comfort_curator: 0,
        social_chameleon: 0
    };

    const evidence = {
        emotional_archaeologist: [],
        mood_engineer: [],
        discovery_junkie: [],
        comfort_curator: [],
        social_chameleon: []
    };

    // Comfort vs Discovery ratio
    if (patterns.comfortDiscovery) {
        if (patterns.comfortDiscovery.ratio > 50) {
            scores.comfort_curator += 3;
            evidence.comfort_curator.push(patterns.comfortDiscovery.description);
        } else if (patterns.comfortDiscovery.ratio < 10) {
            scores.discovery_junkie += 3;
            evidence.discovery_junkie.push(patterns.comfortDiscovery.description);
        }
    }

    // Era detection
    if (patterns.eras && patterns.eras.hasEras) {
        scores.emotional_archaeologist += 3;
        evidence.emotional_archaeologist.push(patterns.eras.description);
    }

    // Time patterns
    if (patterns.timePatterns && patterns.timePatterns.isMoodEngineer) {
        scores.mood_engineer += 3;
        evidence.mood_engineer.push(patterns.timePatterns.description);
    }

    // Social patterns
    if (patterns.socialPatterns && patterns.socialPatterns.isSocialChameleon) {
        scores.social_chameleon += 2;
        evidence.social_chameleon.push(patterns.socialPatterns.description);
    }

    // Ghosted artists (indicates emotional processing)
    if (patterns.ghostedArtists && patterns.ghostedArtists.hasGhosted) {
        scores.emotional_archaeologist += 2;
        const ghosted = patterns.ghostedArtists.ghosted[0];
        evidence.emotional_archaeologist.push(
            `You used to play ${ghosted.artist} constantly (${ghosted.totalPlays} times), then stopped ${ghosted.daysSince} days ago`
        );
    }

    // Discovery explosions
    if (patterns.discoveryExplosions && patterns.discoveryExplosions.hasExplosions) {
        scores.discovery_junkie += 2;
        scores.emotional_archaeologist += 1;
        evidence.discovery_junkie.push(patterns.discoveryExplosions.description);
    }

    // Mood searching
    if (patterns.moodSearching && patterns.moodSearching.hasMoodSearching) {
        scores.mood_engineer += 2;
        evidence.mood_engineer.push(patterns.moodSearching.description);
    }

    // True favorites mismatch (indicates engagement over habit)
    if (patterns.trueFavorites && patterns.trueFavorites.hasMismatch) {
        scores.mood_engineer += 1;
        evidence.mood_engineer.push(patterns.trueFavorites.description);
    }

    return { scores, evidence };
}

/**
 * Classify personality type based on scores
 */
function classifyPersonality(patterns) {
    const { scores, evidence } = scorePersonality(patterns);

    // Sort by score
    const ranked = Object.entries(scores)
        .sort((a, b) => b[1] - a[1]);

    const primaryType = ranked[0][0];
    const primaryScore = ranked[0][1];
    const secondaryType = ranked[1][1] > 0 ? ranked[1][0] : null;

    const typeInfo = PERSONALITY_TYPES[primaryType];
    const primaryEvidence = evidence[primaryType];

    // Collect all notable evidence
    const allEvidence = [];
    for (const [type, items] of Object.entries(evidence)) {
        if (items.length > 0 && scores[type] > 0) {
            allEvidence.push(...items);
        }
    }

    return {
        type: primaryType,
        name: typeInfo.name,
        emoji: typeInfo.emoji,
        tagline: typeInfo.tagline,
        description: typeInfo.description,
        score: primaryScore,
        confidence: calculateConfidence(scores),
        secondaryType: secondaryType ? PERSONALITY_TYPES[secondaryType].name : null,
        evidence: primaryEvidence,
        allEvidence: [...new Set(allEvidence)].slice(0, 5),
        scores
    };
}

/**
 * Calculate confidence score (0-100)
 */
function calculateConfidence(scores) {
    const values = Object.values(scores);
    const max = Math.max(...values);
    const sum = values.reduce((a, b) => a + b, 0);

    if (sum === 0) return 0;

    // Confidence based on how dominant the top score is
    const dominance = max / sum;
    return Math.round(dominance * 100);
}

/**
 * Generate insight text for the reveal
 */
function generateRevealInsight(personality, patterns) {
    const { name, emoji, description, evidence, allEvidence } = personality;

    // Build era examples if available
    let eraExamples = '';
    if (patterns.eras && patterns.eras.eras.length > 0) {
        const eras = patterns.eras.eras.slice(0, 2);
        eraExamples = '\n\nYour listening shows distinct eras:\n' +
            eras.map(era => `• ${era.start}: ${era.topArtists.slice(0, 2).join(', ')}`).join('\n');
    }

    return {
        headline: name,
        body: description + eraExamples,
        evidence: allEvidence
    };
}

// Public API
window.Personality = {
    TYPES: PERSONALITY_TYPES,
    scorePersonality,
    classifyPersonality,
    generateRevealInsight
};
