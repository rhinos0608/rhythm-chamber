/**
 * Personality Classification Module
 * Scores and classifies music personality types
 */

const PERSONALITY_TYPES = {
    emotional_archaeologist: {
        name: 'The Emotional Archaeologist',
        emoji: '🏛️',
        tagline: 'You mark time through sound.',
        description:
            "You don't just listen to music — you use it to process feelings. Your library is a scrapbook of emotional eras.",
        signals: ['distinct eras', 'high repeat', 'genre shifts'],
    },
    mood_engineer: {
        name: 'The Mood Engineer',
        emoji: '🎛️',
        tagline: 'You use music to change your state.',
        description:
            'You strategically deploy music to shift your emotional state. Morning you and evening you have different soundtracks.',
        signals: ['time-of-day patterns', 'mood searching'],
    },
    discovery_junkie: {
        name: 'The Discovery Junkie',
        emoji: '🔍',
        tagline: 'Always hunting for the next sound.',
        description:
            "You're constantly seeking new artists. Your playlists never settle — there's always something new to find.",
        signals: ['low plays-per-artist', 'high unique count'],
    },
    comfort_curator: {
        name: 'The Comfort Curator',
        emoji: '🛋️',
        tagline: 'You know what you love.',
        description:
            "Same songs for years, and you wouldn't have it any other way. You've found your sound and you're sticking with it.",
        signals: ['high repeat rate', 'slow to change'],
    },
    social_chameleon: {
        name: 'The Social Chameleon',
        emoji: '🎭',
        tagline: 'Your music shifts by context.',
        description:
            'Weekday you and weekend you have different playlists. Your music adapts to the social situation.',
        signals: ['weekday ≠ weekend', 'context-dependent'],
    },
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
        social_chameleon: 0,
    };

    const evidence = {
        emotional_archaeologist: [],
        mood_engineer: [],
        discovery_junkie: [],
        comfort_curator: [],
        social_chameleon: [],
    };

    // Detailed breakdown for explainer UI
    const breakdown = [];

    // Comfort vs Discovery ratio
    // EDGE CASE FIX: Validate that pattern is an object before accessing properties
    // If patterns.comfortDiscovery is null (truthy but not an object), accessing .ratio throws
    if (patterns.comfortDiscovery && typeof patterns.comfortDiscovery === 'object') {
        const ratio = patterns.comfortDiscovery.ratio || 0;
        if (ratio > 50) {
            scores.comfort_curator += 3;
            evidence.comfort_curator.push(patterns.comfortDiscovery.description);
            breakdown.push({
                label: `Comfort ratio: ${ratio.toFixed(0)} plays/artist (loyal listener)`,
                points: 3,
            });
        } else if (ratio < 10) {
            scores.discovery_junkie += 3;
            evidence.discovery_junkie.push(patterns.comfortDiscovery.description);
            breakdown.push({
                label: `Comfort ratio: ${ratio.toFixed(0)} plays/artist (explorer)`,
                points: 3,
            });
        } else {
            breakdown.push({
                label: `Comfort ratio: ${ratio.toFixed(0)} plays/artist (balanced)`,
                points: 0,
            });
        }
    }

    // Era detection
    if (patterns.eras && typeof patterns.eras === 'object' && patterns.eras.hasEras) {
        scores.emotional_archaeologist += 3;
        evidence.emotional_archaeologist.push(patterns.eras.description);
        breakdown.push({
            label: `Eras: ${patterns.eras.count || 0} distinct periods detected`,
            points: 3,
        });
    } else {
        breakdown.push({ label: 'Eras: No distinct periods found', points: 0 });
    }

    // Time patterns
    if (
        patterns.timePatterns &&
        typeof patterns.timePatterns === 'object' &&
        patterns.timePatterns.isMoodEngineer
    ) {
        scores.mood_engineer += 3;
        evidence.mood_engineer.push(patterns.timePatterns.description);
        breakdown.push({ label: 'Time patterns: Morning ≠ Evening', points: 3 });
    } else {
        breakdown.push({ label: 'Time patterns: Consistent throughout day', points: 0 });
    }

    // Social patterns
    if (
        patterns.socialPatterns &&
        typeof patterns.socialPatterns === 'object' &&
        patterns.socialPatterns.isSocialChameleon
    ) {
        scores.social_chameleon += 2;
        evidence.social_chameleon.push(patterns.socialPatterns.description);
        breakdown.push({ label: 'Social patterns: Weekday ≠ Weekend', points: 2 });
    } else {
        breakdown.push({ label: 'Social patterns: Weekday = Weekend', points: 0 });
    }

    // Ghosted artists (indicates emotional processing)
    if (
        patterns.ghostedArtists &&
        typeof patterns.ghostedArtists === 'object' &&
        patterns.ghostedArtists.hasGhosted
    ) {
        scores.emotional_archaeologist += 2;
        // EDGE CASE FIX: Add safety check for ghosted array access
        const ghosted =
            Array.isArray(patterns.ghostedArtists.ghosted) && patterns.ghostedArtists.ghosted[0];
        if (ghosted) {
            evidence.emotional_archaeologist.push(
                `You used to play ${ghosted.artist} constantly (${ghosted.totalPlays} times), then stopped ${ghosted.daysSince} days ago`
            );
        }
        breakdown.push({
            label: `Ghosted artists: ${patterns.ghostedArtists.ghosted?.length || 0} detected`,
            points: 2,
        });
    } else {
        breakdown.push({ label: 'Ghosted artists: None detected', points: 0 });
    }

    // Discovery explosions
    if (
        patterns.discoveryExplosions &&
        typeof patterns.discoveryExplosions === 'object' &&
        patterns.discoveryExplosions.hasExplosions
    ) {
        scores.discovery_junkie += 2;
        scores.emotional_archaeologist += 1;
        evidence.discovery_junkie.push(patterns.discoveryExplosions.description);
        breakdown.push({
            label: `Discovery explosions: ${patterns.discoveryExplosions.count || 0} periods found`,
            points: 3,
        });
    } else {
        breakdown.push({ label: 'Discovery explosions: None detected', points: 0 });
    }

    // Mood searching
    if (
        patterns.moodSearching &&
        typeof patterns.moodSearching === 'object' &&
        patterns.moodSearching.hasMoodSearching
    ) {
        scores.mood_engineer += 2;
        evidence.mood_engineer.push(patterns.moodSearching.description);
        breakdown.push({
            label: `Mood searching: ${patterns.moodSearching.count || 0} rapid-skip moments`,
            points: 2,
        });
    } else {
        breakdown.push({ label: 'Mood searching: No rapid-skip patterns', points: 0 });
    }

    // True favorites mismatch (indicates engagement over habit)
    if (
        patterns.trueFavorites &&
        typeof patterns.trueFavorites === 'object' &&
        patterns.trueFavorites.hasMismatch
    ) {
        scores.mood_engineer += 1;
        evidence.mood_engineer.push(patterns.trueFavorites.description);
        breakdown.push({ label: 'True favorites: Engagement differs from habit', points: 1 });
    }

    return { scores, evidence, breakdown };
}

/**
 * Classify personality type based on scores
 */
function classifyPersonality(patterns) {
    const { scores, evidence, breakdown } = scorePersonality(patterns);

    // Sort by score
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);

    const primaryType = ranked[0][0];
    const primaryScore = ranked[0][1];
    const secondaryType = ranked[1][1] > 0 ? ranked[1][0] : null;

    const typeInfo = PERSONALITY_TYPES[primaryType];
    const primaryEvidence = evidence[primaryType];

    // Collect all notable evidence from scored patterns
    const allEvidence = [];
    for (const [type, items] of Object.entries(evidence)) {
        if (items.length > 0 && scores[type] > 0) {
            allEvidence.push(...items);
        }
    }

    // Also include pattern descriptions that weren't in scored evidence
    // This ensures users see ALL detected patterns, not just those that contributed to scoring
    const patternFields = [
        'comfortDiscovery',
        'eras',
        'timePatterns',
        'socialPatterns',
        'ghostedArtists',
        'discoveryExplosions',
        'moodSearching',
        'trueFavorites',
    ];
    for (const field of patternFields) {
        const pattern = patterns[field];
        if (pattern?.description && !allEvidence.includes(pattern.description)) {
            allEvidence.push(pattern.description);
        }
    }

    // Format insights if available
    const insights = patterns.summary?.insights;
    const dataInsights = insights ? formatInsights(insights) : null;

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
        allEvidence: [...new Set(allEvidence)].slice(0, 8),
        scores,
        breakdown,
        dataInsights, // New field for prompt injection
    };
}

/**
 * Format data insights for prompt
 * Add NaN/undefined guards for safety
 */
function formatInsights(insights) {
    if (!insights) return null;
    return [
        `• Total Time: ${(insights.totalMinutes || 0).toLocaleString()} minutes`,
        `• Distinct Artists: ${(insights.uniqueArtists || 0).toLocaleString()}`,
        `• Top Artist: ${insights.topArtist?.name || 'Unknown'} (${(insights.topArtist?.minutes || 0).toLocaleString()} mins, ${insights.topArtist?.percentile || 'N/A'})`,
        `• Busiest Listening Day: ${insights.peakDay || 'N/A'}`,
    ].join('\n');
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
        eraExamples =
            '\n\nYour listening shows distinct eras:\n' +
            eras.map(era => `• ${era.start}: ${era.topArtists.slice(0, 2).join(', ')}`).join('\n');
    }

    return {
        headline: name,
        body: description + eraExamples,
        evidence: allEvidence,
    };
}

// ==========================================
// Lite Personality Classification (Quick Snapshot)
// ==========================================

/**
 * Simplified personality types for limited API data
 */
const LITE_PERSONALITY_TYPES = {
    current_obsessor: {
        name: 'The Current Obsessor',
        emoji: '🎯',
        tagline: 'Deep in one sound right now.',
        description:
            "You're currently fixated on specific artists. When something clicks, you go ALL in.",
        signals: ['high repeat in recent', 'focused listening'],
    },
    sound_explorer: {
        name: 'The Sound Explorer',
        emoji: '🧭',
        tagline: 'Always seeking new territory.',
        description:
            "Even your recent listens are diverse. You're constantly discovering and sampling new sounds.",
        signals: ['high diversity', 'many artists in recent plays'],
    },
    taste_keeper: {
        name: 'The Taste Keeper',
        emoji: '🏠',
        tagline: 'You know exactly what you love.',
        description:
            "Your current favorites match your all-time favorites. You've found your sound and you own it.",
        signals: ['stable taste', 'consistent over time'],
    },
    taste_shifter: {
        name: 'The Taste Shifter',
        emoji: '🌊',
        tagline: 'Your sound is evolving.',
        description:
            "What you're into now is different from your history. Your musical journey is in motion.",
        signals: ['shifting taste', 'new discoveries'],
    },
};

/**
 * Classify personality from lite patterns
 */
function classifyLitePersonality(litePatterns) {
    const { diversity, currentObsession, tasteStability, risingStars } = litePatterns;

    const scores = {
        current_obsessor: 0,
        sound_explorer: 0,
        taste_keeper: 0,
        taste_shifter: 0,
    };

    const evidence = {
        current_obsessor: [],
        sound_explorer: [],
        taste_keeper: [],
        taste_shifter: [],
    };

    // Diversity signals
    if (diversity.isLowDiversity) {
        scores.current_obsessor += 3;
        evidence.current_obsessor.push(diversity.description);
    }
    if (diversity.isHighDiversity) {
        scores.sound_explorer += 3;
        evidence.sound_explorer.push(diversity.description);
    }

    // Current obsession
    if (currentObsession?.isObsessed) {
        scores.current_obsessor += 2;
        evidence.current_obsessor.push(currentObsession.description);
    }

    // Taste stability
    if (tasteStability.isStable) {
        scores.taste_keeper += 3;
        evidence.taste_keeper.push(tasteStability.description);
    }
    if (tasteStability.isShifting) {
        scores.taste_shifter += 3;
        evidence.taste_shifter.push(tasteStability.description);
    }

    // Rising stars
    if (risingStars.hasNew) {
        scores.taste_shifter += 1;
        scores.sound_explorer += 1;
        if (risingStars.description) {
            evidence.taste_shifter.push(risingStars.description);
        }
    }

    // Sort by score
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);

    const primaryType = ranked[0][0];
    const primaryScore = ranked[0][1];
    const typeInfo = LITE_PERSONALITY_TYPES[primaryType];
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
        confidence: calculateLiteConfidence(scores),
        evidence: primaryEvidence,
        allEvidence: [...new Set(allEvidence)].slice(0, 4),
        scores,
        isLitePersonality: true,
        upsellMessage:
            'This is a snapshot based on your recent activity. Upload your full Spotify history for the complete picture — eras, ghosted artists, life events, and more.',
    };
}

/**
 * Calculate confidence for lite classification
 */
function calculateLiteConfidence(scores) {
    const values = Object.values(scores);
    const max = Math.max(...values);
    const sum = values.reduce((a, b) => a + b, 0);

    if (sum === 0) return 0;

    // Lower confidence than full analysis (since limited data)
    const dominance = max / sum;
    return Math.round(dominance * 80); // Cap at 80% for lite
}

// ES Module exports
export { PERSONALITY_TYPES, LITE_PERSONALITY_TYPES };

export const Personality = {
    TYPES: PERSONALITY_TYPES,
    LITE_TYPES: LITE_PERSONALITY_TYPES,
    scorePersonality,
    classifyPersonality,
    classifyLitePersonality,
    generateRevealInsight,
};

console.log('[Personality] Module loaded');
