/**
 * Analytics Query Executors
 *
 * NEW stats.fm and Spotify Wrapped-style function executors.
 * These provide deeper analytics using available data fields.
 *
 * HNW Considerations:
 * - Hierarchy: Each executor handles single function type
 * - Network: Consistent return format for all functions
 * - Wave: Filter operations before aggregation for performance
 */

import { FunctionValidation } from '../utils/validation.js';

// ==========================================
// Helper Functions
// ==========================================

/**
 * Filter streams by date range
 */
function filterByDateRange(streams, params) {
    const validation = FunctionValidation;
    const dateRange = validation.parseDateRange(params);

    if (dateRange.error) {
        return { error: dateRange.error };
    }

    if (!dateRange.startDate || !dateRange.endDate) {
        // No date filtering specified
        if (params.year) {
            return {
                filtered: streams.filter(
                    s =>
                        s.year === parseInt(params.year) &&
                        (params.month === undefined || s.month === parseInt(params.month) - 1)
                ),
            };
        }
        return { filtered: streams };
    }

    return {
        filtered: streams.filter(s => {
            const streamDate = new Date(s.date);
            return streamDate >= dateRange.startDate && streamDate <= dateRange.endDate;
        }),
    };
}

// ==========================================
// Stats.fm-Style Executors
// ==========================================

function executeGetBottomTracks(args, streams) {
    const validation = FunctionValidation;
    const { year, month, quarter, limit = 10, min_plays = 1 } = args;

    const result = filterByDateRange(streams, { year, month, quarter });
    if (result.error) return { error: result.error };

    const filtered = result.filtered;
    if (filtered.length === 0) {
        return {
            error: `No data found for ${validation.formatPeriodLabel({ year, month, quarter })}.`,
        };
    }

    // Aggregate by track
    const trackData = {};
    for (const s of filtered) {
        const key = `${s.trackName}::${s.artistName}`;
        if (!trackData[key]) {
            trackData[key] = { name: s.trackName, artist: s.artistName, plays: 0 };
        }
        trackData[key].plays += 1;
    }

    // Sort ascending (least played first) and filter by min_plays
    const sorted = Object.values(trackData)
        .filter(t => t.plays >= min_plays)
        .sort((a, b) => a.plays - b.plays)
        .slice(0, Math.min(limit, 50));

    return {
        period: validation.formatPeriodLabel({ year, month, quarter }),
        min_plays_filter: min_plays,
        bottom_tracks: sorted.map((t, i) => ({
            rank: i + 1,
            name: t.name,
            artist: t.artist,
            plays: t.plays,
        })),
    };
}

function executeGetBottomArtists(args, streams) {
    const validation = FunctionValidation;
    const { year, month, quarter, limit = 10, min_plays = 1 } = args;

    const result = filterByDateRange(streams, { year, month, quarter });
    if (result.error) return { error: result.error };

    const filtered = result.filtered;
    if (filtered.length === 0) {
        return {
            error: `No data found for ${validation.formatPeriodLabel({ year, month, quarter })}.`,
        };
    }

    // Aggregate by artist
    const artistData = {};
    for (const s of filtered) {
        if (!artistData[s.artistName]) {
            artistData[s.artistName] = { name: s.artistName, plays: 0 };
        }
        artistData[s.artistName].plays += 1;
    }

    // Sort ascending (least played first)
    const sorted = Object.values(artistData)
        .filter(a => a.plays >= min_plays)
        .sort((a, b) => a.plays - b.plays)
        .slice(0, Math.min(limit, 50));

    return {
        period: validation.formatPeriodLabel({ year, month, quarter }),
        min_plays_filter: min_plays,
        bottom_artists: sorted.map((a, i) => ({
            rank: i + 1,
            name: a.name,
            plays: a.plays,
        })),
    };
}

function executeGetListeningClock(args, streams) {
    const validation = FunctionValidation;
    const { year, month, group_by = 'period' } = args;

    const result = filterByDateRange(streams, { year, month });
    if (result.error) return { error: result.error };

    const filtered = result.filtered;
    if (filtered.length === 0) {
        return { error: `No data found for ${validation.formatPeriodLabel({ year, month })}.` };
    }

    if (group_by === 'hour') {
        // Group by individual hours (0-23)
        const hourlyData = Array(24).fill(0);
        for (const s of filtered) {
            const hour = s.hour !== undefined ? s.hour : new Date(s.ts).getHours();
            hourlyData[hour] += 1;
        }

        const total = filtered.length;
        return {
            period: validation.formatPeriodLabel({ year, month }),
            grouped_by: 'hour',
            hourly_breakdown: hourlyData.map((plays, hour) => ({
                hour: `${hour.toString().padStart(2, '0')}:00`,
                plays,
                percentage: Math.round((plays / total) * 100),
            })),
            peak_hour: `${hourlyData
                .indexOf(Math.max(...hourlyData))
                .toString()
                .padStart(2, '0')}:00`,
        };
    }

    // Group by period
    const periods = {
        morning: { hours: [6, 7, 8, 9, 10, 11], plays: 0, label: 'Morning (6am-12pm)' },
        afternoon: { hours: [12, 13, 14, 15, 16, 17], plays: 0, label: 'Afternoon (12pm-6pm)' },
        evening: { hours: [18, 19, 20, 21, 22, 23], plays: 0, label: 'Evening (6pm-12am)' },
        night: { hours: [0, 1, 2, 3, 4, 5], plays: 0, label: 'Night (12am-6am)' },
    };

    for (const s of filtered) {
        const hour = s.hour !== undefined ? s.hour : new Date(s.ts).getHours();
        for (const [name, period] of Object.entries(periods)) {
            if (period.hours.includes(hour)) {
                period.plays += 1;
                break;
            }
        }
    }

    const total = filtered.length;
    const breakdown = Object.entries(periods)
        .map(([name, data]) => ({
            period: name,
            label: data.label,
            plays: data.plays,
            percentage: Math.round((data.plays / total) * 100),
        }))
        .sort((a, b) => b.plays - a.plays);

    return {
        period: validation.formatPeriodLabel({ year, month }),
        grouped_by: 'period',
        period_breakdown: breakdown,
        peak_period: breakdown[0].period,
    };
}

function executeGetListeningStreaks(args, streams) {
    const validation = FunctionValidation;
    const { year, min_streak_days = 3 } = args;

    const result = filterByDateRange(streams, { year });
    if (result.error) return { error: result.error };

    const filtered = result.filtered;
    if (filtered.length === 0) {
        return { error: `No data found for ${validation.formatPeriodLabel({ year })}.` };
    }

    // Get unique dates with at least one play
    const datesWithPlays = new Set(filtered.map(s => s.date));
    const sortedDates = [...datesWithPlays].sort();

    // Find streaks
    const streaks = [];
    let currentStreak = { start: sortedDates[0], days: 1 };

    for (let i = 1; i < sortedDates.length; i++) {
        const prevDate = new Date(sortedDates[i - 1]);
        const currDate = new Date(sortedDates[i]);
        const diffDays = Math.round((currDate - prevDate) / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
            currentStreak.days += 1;
        } else {
            if (currentStreak.days >= min_streak_days) {
                currentStreak.end = sortedDates[i - 1];
                streaks.push({ ...currentStreak });
            }
            currentStreak = { start: sortedDates[i], days: 1 };
        }
    }

    // Don't forget the last streak
    if (currentStreak.days >= min_streak_days) {
        currentStreak.end = sortedDates[sortedDates.length - 1];
        streaks.push({ ...currentStreak });
    }

    // Sort by length descending
    streaks.sort((a, b) => b.days - a.days);

    return {
        period: validation.formatPeriodLabel({ year }),
        total_listening_days: sortedDates.length,
        min_streak_filter: min_streak_days,
        longest_streak: streaks[0] || null,
        notable_streaks: streaks.slice(0, 5),
        streak_count: streaks.length,
    };
}

function executeGetTimeByArtist(args, streams) {
    const validation = FunctionValidation;
    const { year, month, quarter, limit = 10 } = args;

    const result = filterByDateRange(streams, { year, month, quarter });
    if (result.error) return { error: result.error };

    const filtered = result.filtered;
    if (filtered.length === 0) {
        return {
            error: `No data found for ${validation.formatPeriodLabel({ year, month, quarter })}.`,
        };
    }

    // Aggregate time by artist
    const artistTime = {};
    for (const s of filtered) {
        if (!artistTime[s.artistName]) {
            artistTime[s.artistName] = { name: s.artistName, minutes: 0, plays: 0 };
        }
        artistTime[s.artistName].minutes += (s.msPlayed || 0) / 60000;
        artistTime[s.artistName].plays += 1;
    }

    // Sort by time descending
    const sorted = Object.values(artistTime)
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, Math.min(limit, 50));

    const totalMinutes = filtered.reduce((sum, s) => sum + (s.msPlayed || 0) / 60000, 0);

    return {
        period: validation.formatPeriodLabel({ year, month, quarter }),
        total_minutes: Math.round(totalMinutes),
        artists_by_time: sorted.map((a, i) => ({
            rank: i + 1,
            name: a.name,
            minutes: Math.round(a.minutes),
            plays: a.plays,
            percentage: Math.round((a.minutes / totalMinutes) * 100),
        })),
    };
}

function executeGetPlatformStats(args, streams) {
    const validation = FunctionValidation;
    const { year } = args;

    const result = filterByDateRange(streams, { year });
    if (result.error) return { error: result.error };

    const filtered = result.filtered;
    if (filtered.length === 0) {
        return { error: `No data found for ${validation.formatPeriodLabel({ year })}.` };
    }

    // Aggregate by platform
    const platformData = {};
    for (const s of filtered) {
        const platform = s.platform || 'unknown';
        if (!platformData[platform]) {
            platformData[platform] = { platform, plays: 0, minutes: 0 };
        }
        platformData[platform].plays += 1;
        platformData[platform].minutes += (s.msPlayed || 0) / 60000;
    }

    const total = filtered.length;
    const sorted = Object.values(platformData).sort((a, b) => b.plays - a.plays);

    return {
        period: validation.formatPeriodLabel({ year }),
        platforms: sorted.map(p => ({
            platform: p.platform,
            plays: p.plays,
            minutes: Math.round(p.minutes),
            percentage: Math.round((p.plays / total) * 100),
        })),
        primary_platform: sorted[0]?.platform,
    };
}

// ==========================================
// Spotify Wrapped-Style Executors
// ==========================================

function executeGetDiscoveryStats(args, streams) {
    const validation = FunctionValidation;
    const { year, breakdown = 'monthly' } = args;

    if (!year) {
        return { error: 'Year is required for discovery stats.' };
    }

    // Get all artists before the target year
    const priorArtists = new Set(streams.filter(s => s.year < year).map(s => s.artistName));

    // Get streams for target year
    const yearStreams = streams.filter(s => s.year === parseInt(year));
    if (yearStreams.length === 0) {
        return { error: `No data found for ${year}.` };
    }

    if (breakdown === 'monthly') {
        const monthlyDiscovery = Array(12)
            .fill(null)
            .map(() => new Set());
        const seenThisYear = new Set();

        // Sort by date to track first appearance
        const sortedStreams = [...yearStreams].sort((a, b) => new Date(a.date) - new Date(b.date));

        for (const s of sortedStreams) {
            if (!priorArtists.has(s.artistName) && !seenThisYear.has(s.artistName)) {
                monthlyDiscovery[s.month].add(s.artistName);
                seenThisYear.add(s.artistName);
            }
        }

        const monthNames = [
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec',
        ];
        const monthlyBreakdown = monthlyDiscovery.map((artists, i) => ({
            month: monthNames[i],
            new_artists: artists.size,
            examples: [...artists].slice(0, 3),
        }));

        // Guard against empty array access
        const peakMonth =
            monthlyBreakdown.length > 0
                ? monthlyBreakdown.reduce(
                    (max, curr) => (curr.new_artists > max.new_artists ? curr : max),
                    monthlyBreakdown[0]
                )
                : null;

        return {
            year,
            total_new_artists: seenThisYear.size,
            monthly_breakdown: monthlyBreakdown,
            peak_discovery_month: peakMonth.month,
            peak_discovery_count: peakMonth.new_artists,
        };
    }

    // Quarterly breakdown
    const quarterlyDiscovery = { Q1: new Set(), Q2: new Set(), Q3: new Set(), Q4: new Set() };
    const seenThisYear = new Set();

    const sortedStreams = [...yearStreams].sort((a, b) => new Date(a.date) - new Date(b.date));

    for (const s of sortedStreams) {
        if (!priorArtists.has(s.artistName) && !seenThisYear.has(s.artistName)) {
            const quarter = s.month < 3 ? 'Q1' : s.month < 6 ? 'Q2' : s.month < 9 ? 'Q3' : 'Q4';
            quarterlyDiscovery[quarter].add(s.artistName);
            seenThisYear.add(s.artistName);
        }
    }

    return {
        year,
        total_new_artists: seenThisYear.size,
        quarterly_breakdown: Object.entries(quarterlyDiscovery).map(([q, artists]) => ({
            quarter: q,
            new_artists: artists.size,
            examples: [...artists].slice(0, 3),
        })),
    };
}

function executeGetSkipPatterns(args, streams) {
    const validation = FunctionValidation;
    const { year, type = 'tracks', limit = 10 } = args;

    const result = filterByDateRange(streams, { year });
    if (result.error) return { error: result.error };

    const filtered = result.filtered;
    if (filtered.length === 0) {
        return { error: `No data found for ${validation.formatPeriodLabel({ year })}.` };
    }

    // Check if skip data is available
    const hasSkipData = filtered.some(s => s.skipped !== undefined);
    if (!hasSkipData) {
        return {
            error: 'Skip data not available. This data is only present in extended streaming history exports.',
        };
    }

    if (type === 'artists') {
        const artistSkips = {};
        for (const s of filtered) {
            if (!artistSkips[s.artistName]) {
                artistSkips[s.artistName] = { name: s.artistName, skipped: 0, total: 0 };
            }
            artistSkips[s.artistName].total += 1;
            if (s.skipped) artistSkips[s.artistName].skipped += 1;
        }

        const sorted = Object.values(artistSkips)
            .filter(a => a.total >= 5) // Minimum plays for meaningful rate
            .map(a => ({ ...a, skip_rate: Math.round((a.skipped / a.total) * 100) }))
            .sort((a, b) => b.skip_rate - a.skip_rate)
            .slice(0, limit);

        const overallSkipRate = Math.round(
            (filtered.filter(s => s.skipped).length / filtered.length) * 100
        );

        return {
            period: validation.formatPeriodLabel({ year }),
            overall_skip_rate: overallSkipRate,
            most_skipped_artists: sorted,
        };
    }

    // Tracks
    const trackSkips = {};
    for (const s of filtered) {
        const key = `${s.trackName}::${s.artistName}`;
        if (!trackSkips[key]) {
            trackSkips[key] = { name: s.trackName, artist: s.artistName, skipped: 0, total: 0 };
        }
        trackSkips[key].total += 1;
        if (s.skipped) trackSkips[key].skipped += 1;
    }

    const sorted = Object.values(trackSkips)
        .filter(t => t.total >= 3)
        .map(t => ({ ...t, skip_rate: Math.round((t.skipped / t.total) * 100) }))
        .sort((a, b) => b.skip_rate - a.skip_rate)
        .slice(0, limit);

    const overallSkipRate = Math.round(
        (filtered.filter(s => s.skipped).length / filtered.length) * 100
    );

    return {
        period: validation.formatPeriodLabel({ year }),
        overall_skip_rate: overallSkipRate,
        most_skipped_tracks: sorted,
    };
}

function executeGetShuffleHabits(args, streams) {
    const validation = FunctionValidation;
    const { year, breakdown = 'overall' } = args;

    const result = filterByDateRange(streams, { year });
    if (result.error) return { error: result.error };

    const filtered = result.filtered;
    if (filtered.length === 0) {
        return { error: `No data found for ${validation.formatPeriodLabel({ year })}.` };
    }

    // Check if shuffle data is available
    const hasShuffleData = filtered.some(s => s.shuffle !== undefined);
    if (!hasShuffleData) {
        return {
            error: 'Shuffle data not available. This data is only present in extended streaming history exports.',
        };
    }

    const shuffledCount = filtered.filter(s => s.shuffle).length;
    const intentionalCount = filtered.length - shuffledCount;
    const shuffleRate = Math.round((shuffledCount / filtered.length) * 100);

    if (breakdown === 'overall') {
        return {
            period: validation.formatPeriodLabel({ year }),
            total_plays: filtered.length,
            shuffled_plays: shuffledCount,
            intentional_plays: intentionalCount,
            shuffle_percentage: shuffleRate,
            listening_style:
                shuffleRate > 60
                    ? 'Shuffle Explorer'
                    : shuffleRate < 30
                        ? 'Intentional Selector'
                        : 'Balanced Listener',
        };
    }

    if (breakdown === 'by_artist') {
        const artistShuffle = {};
        for (const s of filtered) {
            if (!artistShuffle[s.artistName]) {
                artistShuffle[s.artistName] = { name: s.artistName, shuffled: 0, total: 0 };
            }
            artistShuffle[s.artistName].total += 1;
            if (s.shuffle) artistShuffle[s.artistName].shuffled += 1;
        }

        // Most intentionally listened
        const mostIntentional = Object.values(artistShuffle)
            .filter(a => a.total >= 10)
            .map(a => ({
                ...a,
                intentional_rate: Math.round(((a.total - a.shuffled) / a.total) * 100),
            }))
            .sort((a, b) => b.intentional_rate - a.intentional_rate)
            .slice(0, 5);

        return {
            period: validation.formatPeriodLabel({ year }),
            shuffle_percentage: shuffleRate,
            most_intentional_artists: mostIntentional,
        };
    }

    return {
        period: validation.formatPeriodLabel({ year }),
        shuffle_percentage: shuffleRate,
    };
}

function executeGetPeakListeningDay(args, streams) {
    const validation = FunctionValidation;
    const { year, metric = 'plays' } = args;

    const result = filterByDateRange(streams, { year });
    if (result.error) return { error: result.error };

    const filtered = result.filtered;
    if (filtered.length === 0) {
        return { error: `No data found for ${validation.formatPeriodLabel({ year })}.` };
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayData = Array(7)
        .fill(null)
        .map(() => ({ plays: 0, minutes: 0 }));

    for (const s of filtered) {
        const day = s.dayOfWeek !== undefined ? s.dayOfWeek : new Date(s.date).getDay();
        dayData[day].plays += 1;
        dayData[day].minutes += (s.msPlayed || 0) / 60000;
    }

    const breakdown = dayData.map((data, i) => ({
        day: dayNames[i],
        plays: data.plays,
        minutes: Math.round(data.minutes),
        value: metric === 'minutes' ? data.minutes : data.plays,
    }));

    // Guard against empty array access
    const peakDay =
        breakdown.length > 0
            ? breakdown.reduce((max, curr) => (curr.value > max.value ? curr : max), breakdown[0])
            : null;

    return {
        period: validation.formatPeriodLabel({ year }),
        metric: metric,
        daily_breakdown: breakdown,
        peak_day: peakDay.day,
        peak_value: metric === 'minutes' ? Math.round(peakDay.minutes) : peakDay.plays,
    };
}

function executeGetCompletionRate(args, streams) {
    const validation = FunctionValidation;
    const { year, threshold = 0.8, breakdown = 'overall' } = args;

    const result = filterByDateRange(streams, { year });
    if (result.error) return { error: result.error };

    const filtered = result.filtered;
    if (filtered.length === 0) {
        return { error: `No data found for ${validation.formatPeriodLabel({ year })}.` };
    }

    // We need track duration to calculate completion - estimate from msPlayed patterns
    // If skipped field is available, use that as proxy for completion
    const hasSkipData = filtered.some(s => s.skipped !== undefined);

    if (hasSkipData) {
        const completedCount = filtered.filter(s => !s.skipped).length;
        const overallRate = Math.round((completedCount / filtered.length) * 100);

        if (breakdown === 'by_artist') {
            const artistCompletion = {};
            for (const s of filtered) {
                if (!artistCompletion[s.artistName]) {
                    artistCompletion[s.artistName] = { name: s.artistName, completed: 0, total: 0 };
                }
                artistCompletion[s.artistName].total += 1;
                if (!s.skipped) artistCompletion[s.artistName].completed += 1;
            }

            const sorted = Object.values(artistCompletion)
                .filter(a => a.total >= 10)
                .map(a => ({ ...a, completion_rate: Math.round((a.completed / a.total) * 100) }))
                .sort((a, b) => b.completion_rate - a.completion_rate)
                .slice(0, 10);

            return {
                period: validation.formatPeriodLabel({ year }),
                overall_completion_rate: overallRate,
                highest_completion_artists: sorted,
            };
        }

        return {
            period: validation.formatPeriodLabel({ year }),
            total_plays: filtered.length,
            completed_plays: completedCount,
            overall_completion_rate: overallRate,
        };
    }

    return {
        error: 'Completion data requires skip tracking. This is only available in extended streaming history exports.',
    };
}

function executeGetOfflineListening(args, streams) {
    const validation = FunctionValidation;
    const { year, limit = 10 } = args;

    const result = filterByDateRange(streams, { year });
    if (result.error) return { error: result.error };

    const filtered = result.filtered;
    if (filtered.length === 0) {
        return { error: `No data found for ${validation.formatPeriodLabel({ year })}.` };
    }

    // Check if offline data is available
    const hasOfflineData = filtered.some(s => s.offline !== undefined);
    if (!hasOfflineData) {
        return {
            error: 'Offline data not available. This data is only present in extended streaming history exports.',
        };
    }

    const offlineStreams = filtered.filter(s => s.offline);
    const offlineRate = Math.round((offlineStreams.length / filtered.length) * 100);

    // Top offline tracks
    const trackCounts = {};
    for (const s of offlineStreams) {
        const key = `${s.trackName}::${s.artistName}`;
        if (!trackCounts[key]) {
            trackCounts[key] = { name: s.trackName, artist: s.artistName, plays: 0 };
        }
        trackCounts[key].plays += 1;
    }

    const topOffline = Object.values(trackCounts)
        .sort((a, b) => b.plays - a.plays)
        .slice(0, limit);

    return {
        period: validation.formatPeriodLabel({ year }),
        total_plays: filtered.length,
        offline_plays: offlineStreams.length,
        offline_percentage: offlineRate,
        top_offline_tracks: topOffline,
    };
}

// ==========================================
// Executor Registry
// ==========================================

// ES Module export
export const AnalyticsExecutors = {
    // Stats.fm-style
    get_bottom_tracks: executeGetBottomTracks,
    get_bottom_artists: executeGetBottomArtists,
    get_listening_clock: executeGetListeningClock,
    get_listening_streaks: executeGetListeningStreaks,
    get_time_by_artist: executeGetTimeByArtist,
    get_platform_stats: executeGetPlatformStats,

    // Spotify Wrapped-style
    get_discovery_stats: executeGetDiscoveryStats,
    get_skip_patterns: executeGetSkipPatterns,
    get_shuffle_habits: executeGetShuffleHabits,
    get_peak_listening_day: executeGetPeakListeningDay,
    get_completion_rate: executeGetCompletionRate,
    get_offline_listening: executeGetOfflineListening,
};

console.log('[AnalyticsExecutors] Module loaded');
