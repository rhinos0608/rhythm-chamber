/**
 * Temporal Analysis Service
 * 
 * Analyzes listening trends over time for the Temporal Analysis Dashboard.
 * Provides 5-year trend visualization, genre evolution, and discovery prediction.
 * 
 * Features:
 * - Taste evolution tracking over years
 * - Genre diversity trends
 * - Artist discovery velocity
 * - Seasonal pattern analysis
 * - Future prediction modeling
 * 
 * @module services/temporal-analysis
 */

import { EventBus } from './event-bus.js';

// ==========================================
// Time Range Constants
// ==========================================

const TIME_RANGES = {
    ALL_TIME: 'all_time',
    LAST_5_YEARS: '5_years',
    LAST_YEAR: 'year',
    LAST_6_MONTHS: '6_months',
    LAST_MONTH: 'month'
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ==========================================
// Core Analysis Functions
// ==========================================

/**
 * Get taste evolution over time
 * Shows how listening preferences have changed year over year
 * 
 * @param {Array} streams - User streaming history
 * @param {Object} [options] - Analysis options
 * @returns {Object} Taste evolution data
 */
function getTasteEvolution(streams, options = {}) {
    if (!streams || streams.length === 0) {
        return { years: [], evolution: [] };
    }

    // Group streams by year
    const byYear = groupByYear(streams);
    const years = Object.keys(byYear).sort();

    const evolution = years.map(year => {
        const yearStreams = byYear[year];

        // Calculate metrics for each year
        const topArtists = getTopN(yearStreams, 'master_metadata_album_artist_name', 10);
        const uniqueArtists = new Set(yearStreams.map(s => s.master_metadata_album_artist_name)).size;
        const totalStreams = yearStreams.length;
        const yearNumber = parseInt(year);
        const daysInPeriod = yearNumber === new Date().getFullYear()
            ? getElapsedDaysInYear(yearNumber)
            : getDaysInYear(yearNumber);

        // Calculate discovery rate (% of artists listened to for first time this year)
        const discoveryRate = calculateDiscoveryRate(
            new Set(yearStreams.map(s => s.master_metadata_album_artist_name)),
            byYear,
            year
        );

        return {
            year: yearNumber,
            totalStreams,
            uniqueArtists,
            topArtists,
            discoveryRate,
            avgDailyStreams: daysInPeriod > 0 ? Math.round(totalStreams / daysInPeriod) : 0
        };
    });

    EventBus.emit('temporal:evolution_calculated', {
        yearsAnalyzed: years.length
    });

    return { years, evolution };
}

/**
 * Get diversity trend over time
 * Measures how eclectic listening becomes over years
 * 
 * @param {Array} streams - User streaming history
 * @returns {Object} Diversity trend data
 */
function getDiversityTrend(streams) {
    if (!streams || streams.length === 0) {
        return { trend: [], averageDiversity: 0 };
    }

    const byMonth = groupByMonth(streams);
    const months = Object.keys(byMonth).sort();

    const trend = months.map(month => {
        const monthStreams = byMonth[month];
        const uniqueArtists = new Set(monthStreams.map(s => s.master_metadata_album_artist_name)).size;
        const totalStreams = monthStreams.length;

        // Diversity = unique artists / total streams (normalized)
        const diversityScore = totalStreams > 0
            ? Math.round((uniqueArtists / Math.sqrt(totalStreams)) * 100)
            : 0;

        return {
            month,
            diversityScore,
            uniqueArtists,
            totalStreams
        };
    });

    const averageDiversity = trend.length > 0
        ? Math.round(trend.reduce((sum, t) => sum + t.diversityScore, 0) / trend.length)
        : 0;

    // Calculate trend direction (last 6 months vs previous 6 months)
    const recentSlice = trend.slice(-6);
    const previousSlice = trend.slice(-12, -6);
    // Guard against division by zero
    const recentAvg = recentSlice.length > 0
        ? recentSlice.reduce((s, t) => s + t.diversityScore, 0) / recentSlice.length
        : null;
    const previousAvg = previousSlice.length > 0
        ? previousSlice.reduce((s, t) => s + t.diversityScore, 0) / previousSlice.length
        : null;
    let trendDirection = 'insufficient_data';
    if (recentAvg !== null && previousAvg !== null) {
        trendDirection = recentAvg > previousAvg ? 'increasing' :
            recentAvg < previousAvg ? 'decreasing' : 'stable';
    }
    let insight;
    if (trendDirection === 'increasing') {
        insight = 'Your music taste is becoming more diverse!';
    } else if (trendDirection === 'decreasing') {
        insight = 'You\'re focusing on a core set of artists';
    } else if (trendDirection === 'insufficient_data') {
        insight = 'Not enough data to determine your diversity trend yet';
    } else {
        insight = 'Your listening diversity is consistent';
    }

    return {
        trend,
        averageDiversity,
        trendDirection,
        insight
    };
}

/**
 * Get artist discovery prediction
 * Predicts how many new artists user will discover in coming months
 * 
 * @param {Array} streams - User streaming history
 * @returns {Object} Discovery prediction
 */
function getDiscoveryPrediction(streams) {
    if (!streams || streams.length === 0) {
        return { prediction: [], confidence: 0 };
    }

    const byMonth = groupByMonth(streams);
    const months = Object.keys(byMonth).sort();

    // Calculate historical discovery rate per month
    const knownArtists = new Set();
    const discoveryRates = [];

    for (const month of months) {
        const monthStreams = byMonth[month];
        let newDiscoveries = 0;

        for (const stream of monthStreams) {
            const artist = stream.master_metadata_album_artist_name;
            if (artist && !knownArtists.has(artist)) {
                knownArtists.add(artist);
                newDiscoveries++;
            }
        }

        discoveryRates.push({
            month,
            discoveries: newDiscoveries
        });
    }

    // Calculate trend from last 6 months
    const recentRates = discoveryRates.slice(-6);
    // Guard against division by zero
    const avgRecent = recentRates.length > 0
        ? recentRates.reduce((s, r) => s + r.discoveries, 0) / recentRates.length
        : 0;

    // Simple linear prediction for next 3 months
    const prediction = [];
    const now = new Date();
    for (let i = 1; i <= 3; i++) {
        const futureDate = new Date(now);
        futureDate.setMonth(futureDate.getMonth() + i);
        const monthKey = futureDate.toISOString().slice(0, 7);

        // Apply slight decay to predictions
        const predictedDiscoveries = Math.round(avgRecent * Math.pow(0.95, i));

        prediction.push({
            month: monthKey,
            predictedDiscoveries,
            isEstimate: true
        });
    }

    // Confidence based on data consistency
    const recentDiscoveries = recentRates.map(r => r.discoveries);
    const variance = calculateVariance(recentDiscoveries);
    // Guard against division by zero
    const meanRecent = recentDiscoveries.length > 0
        ? recentDiscoveries.reduce((s, v) => s + v, 0) / recentDiscoveries.length
        : 0;
    const stddev = Math.sqrt(variance);
    const cov = meanRecent === 0 ? Infinity : stddev / meanRecent;
    const rawConfidence = 100 - (Number.isFinite(cov) ? cov * 100 : 100);
    const confidence = Math.max(20, Math.min(90, Math.round(rawConfidence)));

    return {
        historicalData: discoveryRates.slice(-12),
        prediction,
        confidence,
        totalArtistsDiscovered: knownArtists.size,
        insight: `Based on your patterns, you'll likely discover ~${Math.round(avgRecent)} new artists per month`
    };
}

/**
 * Get year-over-year comparison
 * @param {Array} streams - User streaming history
 * @param {number} year1 - First year to compare
 * @param {number} year2 - Second year to compare
 * @returns {Object} Comparison data
 */
function getYearComparison(streams, year1, year2) {
    if (!Array.isArray(streams)) {
        if (streams === null || streams === undefined) {
            streams = [];
        } else {
            throw new TypeError('getYearComparison expects "streams" to be an array');
        }
    }

    if (streams.length === 0) {
        return {
            year1: { year: year1, totalStreams: 0, uniqueArtists: 0, topArtists: [] },
            year2: { year: year2, totalStreams: 0, uniqueArtists: 0, topArtists: [] },
            changes: { streamsChange: 0, artistsChange: 0 },
            consistentArtists: [],
            consistentArtistCount: 0
        };
    }

    const byYear = groupByYear(streams);
    const y1Streams = byYear[year1] || [];
    const y2Streams = byYear[year2] || [];

    const getYearStats = (yearStreams) => ({
        totalStreams: yearStreams.length,
        uniqueArtists: new Set(yearStreams.map(s => s.master_metadata_album_artist_name)).size,
        topArtists: getTopN(yearStreams, 'master_metadata_album_artist_name', 5)
    });

    const stats1 = getYearStats(y1Streams);
    const stats2 = getYearStats(y2Streams);

    // Find artists that appear in both years
    const artists1 = new Set(y1Streams.map(s => s.master_metadata_album_artist_name));
    const artists2 = new Set(y2Streams.map(s => s.master_metadata_album_artist_name));
    const consistent = [...artists1].filter(a => artists2.has(a));

    return {
        year1: { year: year1, ...stats1 },
        year2: { year: year2, ...stats2 },
        changes: {
            streamsChange: stats2.totalStreams - stats1.totalStreams,
            artistsChange: stats2.uniqueArtists - stats1.uniqueArtists
        },
        consistentArtists: consistent.slice(0, 10),
        consistentArtistCount: consistent.length
    };
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Group streams by year
 */
function groupByYear(streams) {
    const byYear = {};
    for (const stream of streams) {
        if (!stream.ts) continue;
        const year = stream.ts.slice(0, 4);
        if (!byYear[year]) byYear[year] = [];
        byYear[year].push(stream);
    }
    return byYear;
}

/**
 * Group streams by month (YYYY-MM)
 */
function groupByMonth(streams) {
    const byMonth = {};
    for (const stream of streams) {
        if (!stream.ts) continue;
        const month = stream.ts.slice(0, 7);
        if (!byMonth[month]) byMonth[month] = [];
        byMonth[month].push(stream);
    }
    return byMonth;
}

/**
 * Get top N items by frequency
 */
function getTopN(items, key, n = 10) {
    const counts = {};
    for (const item of items) {
        const value = item[key];
        if (value) {
            counts[value] = (counts[value] || 0) + 1;
        }
    }
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([name, count]) => ({ name, count }));
}

/**
 * Calculate discovery rate for a year
 */
function calculateDiscoveryRate(artistsThisYear, byYear, currentYear) {
    const previousArtists = new Set();
    for (const [year, streams] of Object.entries(byYear)) {
        if (parseInt(year) < parseInt(currentYear)) {
            for (const s of streams) {
                if (s.master_metadata_album_artist_name) {
                    previousArtists.add(s.master_metadata_album_artist_name);
                }
            }
        }
    }

    let newArtists = 0;
    for (const artist of artistsThisYear) {
        if (!previousArtists.has(artist)) {
            newArtists++;
        }
    }

    return artistsThisYear.size > 0
        ? Math.round((newArtists / artistsThisYear.size) * 100)
        : 0;
}

/**
 * Get elapsed days in a given year up to today (inclusive)
 */
function getElapsedDaysInYear(year) {
    const now = new Date();
    const startOfYear = new Date(year, 0, 1);
    if (now.getFullYear() !== year) {
        return getDaysInYear(year);
    }

    const elapsed = Math.floor((now - startOfYear) / MS_PER_DAY) + 1;
    return Math.max(elapsed, 1);
}

/**
 * Get days in a year
 */
function getDaysInYear(year) {
    const y = parseInt(year);
    return (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 366 : 365;
}

/**
 * Calculate variance of an array
 * Guard against division by zero
 */
function calculateVariance(arr) {
    if (arr.length === 0) return 0;
    // Guard against division by zero
    const mean = arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return arr.length > 0 ? arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length : 0;
}

// ==========================================
// Public API
// ==========================================

export const TemporalAnalysis = {
    // Core functions
    getTasteEvolution,
    getDiversityTrend,
    getDiscoveryPrediction,
    getYearComparison,

    // Helpers
    groupByYear,
    groupByMonth,

    // Constants
    TIME_RANGES
};


console.log('[TemporalAnalysis] Temporal analysis service loaded');
