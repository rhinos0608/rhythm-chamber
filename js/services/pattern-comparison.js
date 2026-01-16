/**
 * Pattern Comparison Service
 * 
 * Compares listening profiles to find shared tastes, differences, and compatibility.
 * Used for collaborative analysis with friends.
 * 
 * Comparison Metrics:
 * - Artist overlap (shared favorites)
 * - Genre compatibility
 * - Listening pattern similarity (time, emotion, discovery)
 * - Era alignment (what periods resonate with both)
 * 
 * @module services/pattern-comparison
 */

import { EventBus } from './event-bus.js';

// ==========================================
// Comparison Algorithms
// ==========================================

/**
 * Compare two profiles for compatibility
 * @param {Object} profile1 - First profile (usually current user)
 * @param {Object} profile2 - Second profile (friend)
 * @returns {Object} Comparison results
 */
function compareProfiles(profile1, profile2) {
    if (!profile1 || !profile2) {
        throw new Error('Both profiles required for comparison');
    }

    const results = {
        overallCompatibility: 0,
        breakdown: {},
        sharedArtists: [],
        uniqueToEach: { profile1: [], profile2: [] },
        recommendations: []
    };

    // Compare personalities
    if (profile1.personality && profile2.personality) {
        results.breakdown.personality = comparePersonalities(
            profile1.personality,
            profile2.personality
        );
    }

    // Compare patterns
    if (profile1.patterns && profile2.patterns) {
        results.breakdown.patterns = comparePatterns(
            profile1.patterns,
            profile2.patterns
        );
    }

    // Compare listening stats
    if (profile1.summary && profile2.summary) {
        results.breakdown.listening = compareListeningStats(
            profile1.summary,
            profile2.summary
        );
    }

    // Find shared artists (if streams available)
    if (profile1.streams && profile2.streams) {
        const artistAnalysis = compareArtists(profile1.streams, profile2.streams);
        results.sharedArtists = artistAnalysis.shared;
        results.uniqueToEach = artistAnalysis.unique;
    }

    // Calculate overall compatibility
    results.overallCompatibility = calculateOverallCompatibility(results.breakdown);

    // Generate recommendations
    results.recommendations = generateRecommendations(results);

    EventBus.emit('comparison:complete', {
        compatibility: results.overallCompatibility,
        sharedArtistCount: results.sharedArtists.length
    });

    return results;
}

/**
 * Compare personality types
 * @param {Object} p1 - First personality
 * @param {Object} p2 - Second personality
 * @returns {Object} Personality compatibility
 */
function comparePersonalities(p1, p2) {
    const sameType = p1.type === p2.type;

    // Compare traits if available
    let traitSimilarity = 0;
    if (p1.traits && p2.traits) {
        const allTraits = new Set([...Object.keys(p1.traits), ...Object.keys(p2.traits)]);
        let matchScore = 0;

        if (allTraits.size > 0) {
            for (const trait of allTraits) {
                const v1 = p1.traits[trait] || 0;
                const v2 = p2.traits[trait] || 0;
                const diff = Math.abs(v1 - v2);
                matchScore += (100 - diff) / 100;
            }

            traitSimilarity = Math.round((matchScore / allTraits.size) * 100);
        } else {
            traitSimilarity = 0;
        }
    }

    return {
        sameType,
        profile1Type: p1.name,
        profile2Type: p2.name,
        traitSimilarity,
        compatibility: sameType ? 100 : traitSimilarity,
        insight: sameType
            ? `You're both ${p1.name}s! You likely share similar listening habits.`
            : `${p1.name} meets ${p2.name} - an interesting combination!`
    };
}

/**
 * Compare listening patterns
 * @param {Object} pat1 - First pattern set
 * @param {Object} pat2 - Second pattern set
 * @returns {Object} Pattern compatibility
 */
function comparePatterns(pat1, pat2) {
    const comparisons = {};

    // Time of day patterns
    if (pat1.timeOfDay && pat2.timeOfDay) {
        const peak1 = pat1.timeOfDay.peakHour || 0;
        const peak2 = pat2.timeOfDay.peakHour || 0;
        const diff = Math.abs(peak1 - peak2);
        const timeDiff = Math.min(diff, 24 - diff);
        comparisons.timeOfDay = {
            similarity: Math.round((1 - timeDiff / 12) * 100),
            insight: timeDiff <= 2
                ? 'You listen at similar times!'
                : `Different schedules - ${peak1}:00 vs ${peak2}:00`
        };
    }

    // Comfort vs Discovery
    if (pat1.comfortDiscovery && pat2.comfortDiscovery) {
        const ratio1 = pat1.comfortDiscovery.ratio || 50;
        const ratio2 = pat2.comfortDiscovery.ratio || 50;
        const ratioDiff = Math.abs(ratio1 - ratio2);
        comparisons.comfortDiscovery = {
            similarity: Math.round((1 - ratioDiff / 100) * 100),
            profile1Ratio: ratio1,
            profile2Ratio: ratio2,
            insight: ratioDiff < 20
                ? 'Similar balance between comfort and discovery'
                : ratio1 > ratio2
                    ? 'You prefer familiar music more'
                    : 'Your friend explores more new music'
        };
    }

    // Calculate average pattern similarity
    const similarities = Object.values(comparisons).map(c => c.similarity || 0);
    const avgSimilarity = similarities.length > 0
        ? Math.round(similarities.reduce((a, b) => a + b, 0) / similarities.length)
        : 50;

    return {
        ...comparisons,
        overallSimilarity: avgSimilarity
    };
}

/**
 * Compare listening statistics
 * @param {Object} s1 - First summary
 * @param {Object} s2 - Second summary
 * @returns {Object} Stats comparison
 */
function compareListeningStats(s1, s2) {
    const total1 = s1.totalStreams || s1.streamCount || 0;
    const total2 = s2.totalStreams || s2.streamCount || 0;
    const hours1 = s1.listeningHours || Math.round(total1 * 3 / 60);
    const hours2 = s2.listeningHours || Math.round(total2 * 3 / 60);

    const volumeRatio = total1 > 0 && total2 > 0
        ? Math.min(total1, total2) / Math.max(total1, total2)
        : 0;

    return {
        volumeSimilarity: Math.round(volumeRatio * 100),
        profile1Hours: hours1,
        profile2Hours: hours2,
        insight: volumeRatio > 0.8
            ? 'Similar listening volume'
            : hours1 > hours2
                ? 'You listen significantly more'
                : 'Your friend listens more than you'
    };
}

/**
 * Compare artists between profiles
 * @param {Array} streams1 - First stream set
 * @param {Array} streams2 - Second stream set
 * @returns {Object} Artist comparison
 */
function compareArtists(streams1, streams2) {
    // Extract top artists from each profile
    const getTopArtists = (streams, limit = 50) => {
        const counts = {};
        for (const s of streams) {
            const artist = s.master_metadata_album_artist_name;
            if (artist) {
                counts[artist] = (counts[artist] || 0) + 1;
            }
        }
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([artist, count]) => ({ artist, count }));
    };

    const top1 = getTopArtists(streams1);
    const top2 = getTopArtists(streams2);

    const artists1 = new Set(top1.map(a => a.artist));
    const artists2 = new Set(top2.map(a => a.artist));

    // Find shared
    const shared = [...artists1].filter(a => artists2.has(a));

    // Find unique to each
    const unique1 = [...artists1].filter(a => !artists2.has(a));
    const unique2 = [...artists2].filter(a => !artists1.has(a));

    return {
        shared: shared.slice(0, 20),
        unique: {
            profile1: unique1.slice(0, 10),
            profile2: unique2.slice(0, 10)
        },
        overlapPercentage: (() => {
            const denom = Math.max(artists1.size, artists2.size);
            return denom === 0
                ? 0
                : Math.round((shared.length / denom) * 100);
        })()
    };
}

/**
 * Calculate overall compatibility score
 * @param {Object} breakdown - Comparison breakdown
 * @returns {number} 0-100 compatibility score
 */
function calculateOverallCompatibility(breakdown) {
    const weights = {
        personality: 0.3,
        patterns: 0.4,
        listening: 0.3
    };

    let totalScore = 0;
    let totalWeight = 0;

    if (breakdown.personality) {
        totalScore += breakdown.personality.compatibility * weights.personality;
        totalWeight += weights.personality;
    }

    if (breakdown.patterns) {
        totalScore += breakdown.patterns.overallSimilarity * weights.patterns;
        totalWeight += weights.patterns;
    }

    if (breakdown.listening) {
        totalScore += breakdown.listening.volumeSimilarity * weights.listening;
        totalWeight += weights.listening;
    }

    return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 50;
}

/**
 * Generate recommendations based on comparison
 * @param {Object} results - Comparison results
 * @returns {string[]} Recommendations
 */
function generateRecommendations(results) {
    const recommendations = [];

    if (results.sharedArtists.length > 5) {
        recommendations.push(`Check out ${results.sharedArtists[0]} together - you both love them!`);
    }

    if (results.uniqueToEach.profile2.length > 0) {
        recommendations.push(`Your friend recommends: ${results.uniqueToEach.profile2.slice(0, 3).join(', ')}`);
    }

    if (results.overallCompatibility > 75) {
        recommendations.push('High compatibility! You should share playlists.');
    } else if (results.overallCompatibility < 40) {
        recommendations.push('Different tastes - great for music discovery!');
    }

    return recommendations;
}

// ==========================================
// Quick Comparison Functions
// ==========================================

/**
 * Get shared artists between profiles
 * @param {Object} profile1 
 * @param {Object} profile2 
 * @returns {string[]} Shared artist names
 */
function getSharedArtists(profile1, profile2) {
    if (!profile1.streams || !profile2.streams) {
        return [];
    }
    return compareArtists(profile1.streams, profile2.streams).shared;
}

/**
 * Get compatibility percentage
 * @param {Object} profile1 
 * @param {Object} profile2 
 * @returns {number} 0-100
 */
function getCompatibility(profile1, profile2) {
    const results = compareProfiles(profile1, profile2);
    return results.overallCompatibility;
}

// ==========================================
// Public API
// ==========================================

export const PatternComparison = {
    // Main comparison
    compareProfiles,

    // Quick functions
    getSharedArtists,
    getCompatibility,

    // Individual comparisons
    comparePersonalities,
    comparePatterns,
    compareArtists
};

// Expose on window for debugging
if (typeof window !== 'undefined') {
    window.PatternComparison = PatternComparison;
}

console.log('[PatternComparison] Profile comparison service loaded');
