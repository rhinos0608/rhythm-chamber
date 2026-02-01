/**
 * Artifact Executors Module
 *
 * Executors for artifact-producing function calls.
 * These return both narrative text AND an ArtifactSpec for visualization.
 *
 * @module functions/executors/artifact-executors
 */

import { createLogger } from '../../utils/logger.js';
import { DataQuery } from '../../data-query.js';
import {
    createLineChart,
    createBarChart,
    createTimeline,
    createTable,
    ARTIFACT_TYPES,
} from '../../artifacts/artifact-spec.js';

const logger = createLogger('ArtifactExecutors');

// ==========================================
// Validation Helper
// ==========================================

/**
 * Validate executor arguments
 * @param {*} args - Arguments to validate
 * @param {string} functionName - Function name for error messages
 * @returns {{valid: boolean, error?: string}}
 */
function validateArgs(args, functionName) {
    if (!args || typeof args !== 'object') {
        return {
            valid: false,
            error: `[${functionName}] Invalid arguments: expected object, got ${typeof args}`,
        };
    }
    return { valid: true };
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Get date range from parameters
 */
function getDateRange(timeRange) {
    const startYear = timeRange?.start_year || new Date().getFullYear() - 1;
    const endYear = timeRange?.end_year || new Date().getFullYear();
    const startMonth = timeRange?.start_month || 1;
    const endMonth = timeRange?.end_month || 12;

    return {
        start: new Date(startYear, startMonth - 1, 1),
        end: new Date(endYear, endMonth, 0), // Last day of month
    };
}

/**
 * Group streams by time granularity
 */
function groupByGranularity(streams, granularity = 'month') {
    const groups = new Map();

    for (const stream of streams) {
        const date = new Date(stream.ts || stream.endTime);
        if (isNaN(date.getTime())) continue;

        let key;
        switch (granularity) {
            case 'day':
                key = date.toISOString().split('T')[0];
                break;
            case 'week': {
                const weekStart = new Date(date);
                weekStart.setDate(date.getDate() - date.getDay());
                key = weekStart.toISOString().split('T')[0];
                break;
            }
            case 'month':
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                break;
            case 'quarter': {
                const quarter = Math.floor(date.getMonth() / 3) + 1;
                key = `${date.getFullYear()}-Q${quarter}`;
                break;
            }
            case 'year':
                key = String(date.getFullYear());
                break;
            default:
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }

        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(stream);
    }

    return groups;
}

/**
 * Calculate metric from stream group
 */
function calculateMetric(streams, metric) {
    switch (metric) {
        case 'plays':
            return streams.length;
        case 'hours':
            return streams.reduce((sum, s) => sum + (s.msPlayed || s.ms_played || 0) / 3600000, 0);
        case 'unique_artists':
            return new Set(streams.map(s => s.artistName || s.master_metadata_album_artist_name))
                .size;
        case 'unique_tracks':
            return new Set(streams.map(s => s.trackName || s.master_metadata_track_name)).size;
        case 'avg_session_length': {
            const totalMs = streams.reduce((sum, s) => sum + (s.msPlayed || s.ms_played || 0), 0);
            return streams.length > 0 ? totalMs / streams.length / 60000 : 0; // in minutes
        }
        default:
            return streams.length;
    }
}

/**
 * Format metric value for display
 */
function formatMetricValue(value, metric) {
    // Guard against NaN values
    if (typeof value !== 'number' || isNaN(value)) {
        return '0';
    }

    switch (metric) {
        case 'hours':
            return `${value.toFixed(1)} hrs`;
        case 'avg_session_length':
            return `${value.toFixed(1)} min`;
        default:
            return Math.round(value).toLocaleString();
    }
}

/**
 * Get metric label
 */
function getMetricLabel(metric) {
    const labels = {
        plays: 'Total Plays',
        hours: 'Hours Listened',
        unique_artists: 'Unique Artists',
        unique_tracks: 'Unique Tracks',
        avg_session_length: 'Avg Session Length',
        tracks: 'Tracks',
        sessions: 'Sessions',
    };
    return labels[metric] || metric;
}

// ==========================================
// Visualize Trend Executor
// ==========================================

/**
 * Execute visualize_trend function
 * Returns line chart data for a metric over time
 */
function visualize_trend(args, streams) {
    const validation = validateArgs(args, 'visualize_trend');
    if (!validation.valid) {
        return { message: validation.error, artifact: null };
    }

    const { metric, time_range, granularity = 'month', filter_artist, annotations } = args;

    logger.debug('Executing visualize_trend', { metric, time_range, granularity });

    // Filter streams by time range
    const { start, end } = getDateRange(time_range);
    let filtered = streams.filter(s => {
        const date = new Date(s.ts || s.endTime);
        return date >= start && date <= end;
    });

    // Filter by artist if specified
    if (filter_artist) {
        const artistLower = filter_artist.toLowerCase();
        filtered = filtered.filter(s => {
            const artist = (
                s.artistName ||
                s.master_metadata_album_artist_name ||
                ''
            ).toLowerCase();
            return artist.includes(artistLower);
        });
    }

    if (filtered.length === 0) {
        return {
            message: `No listening data found for the specified time range ${time_range.start_year}-${time_range.end_year}.`,
            artifact: null,
        };
    }

    // Group by granularity and calculate metric
    const groups = groupByGranularity(filtered, granularity);
    const data = Array.from(groups.entries())
        .map(([period, periodStreams]) => ({
            period,
            value: calculateMetric(periodStreams, metric),
        }))
        .sort((a, b) => a.period.localeCompare(b.period));

    // Create artifact
    const title = filter_artist
        ? `${getMetricLabel(metric)} for ${filter_artist}`
        : getMetricLabel(metric);

    const subtitle = `${time_range.start_year} to ${time_range.end_year} (by ${granularity})`;

    const artifact = createLineChart({
        title,
        data,
        xField: 'period',
        yField: 'value',
        xType: 'temporal',
        explanation: [
            `This chart shows your ${getMetricLabel(metric).toLowerCase()} over time.`,
            `Data spans from ${time_range.start_year} to ${time_range.end_year}, grouped by ${granularity}.`,
        ],
        annotations: annotations || [],
    });
    artifact.subtitle = subtitle;

    // Calculate summary stats (guard against empty arrays and NaN values)
    const values = data.map(d => d.value).filter(v => typeof v === 'number' && !isNaN(v));
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const max = values.length > 0 ? Math.max(...values) : 0;
    const min = values.length > 0 ? Math.min(...values) : 0;
    const peakPeriod = values.length > 0 ? data.find(d => d.value === max)?.period : null;

    return {
        message: `Here's your ${getMetricLabel(metric).toLowerCase()} trend from ${time_range.start_year} to ${time_range.end_year}. Your peak was in ${peakPeriod} with ${formatMetricValue(max, metric)}, and your average was ${formatMetricValue(avg, metric)}.`,
        artifact,
        summary: {
            average: avg,
            max,
            min,
            peak_period: peakPeriod,
            total_periods: data.length,
        },
    };
}

// ==========================================
// Visualize Comparison Executor
// ==========================================

/**
 * Execute visualize_comparison function
 * Returns bar chart comparing categories
 */
function visualize_comparison(args, streams) {
    const validation = validateArgs(args, 'visualize_comparison');
    if (!validation.valid) {
        return { message: validation.error, artifact: null };
    }

    const { comparison_type, metric = 'plays', year, periods, limit = 10, artist_name } = args;

    logger.debug('Executing visualize_comparison', { comparison_type, metric, year });

    const safeLimit = Math.min(limit, 20);
    let data = [];
    let title = '';
    let explanation = [];

    switch (comparison_type) {
        case 'top_artists': {
            let yearStreams = year
                ? streams.filter(s => new Date(s.ts || s.endTime).getFullYear() === year)
                : streams;

            // Filter by artist_name if specified
            if (artist_name) {
                const artistLower = artist_name.toLowerCase();
                yearStreams = yearStreams.filter(s => {
                    const artist = (
                        s.artistName ||
                        s.master_metadata_album_artist_name ||
                        ''
                    ).toLowerCase();
                    return artist.includes(artistLower);
                });
            }

            const artistCounts = new Map();
            for (const s of yearStreams) {
                const artist = s.artistName || s.master_metadata_album_artist_name || 'Unknown';
                if (metric === 'hours') {
                    const hours = (s.msPlayed || s.ms_played || 0) / 3600000;
                    artistCounts.set(artist, (artistCounts.get(artist) || 0) + hours);
                } else {
                    artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
                }
            }

            data = Array.from(artistCounts.entries())
                .map(([artist, value]) => ({ category: artist, value }))
                .sort((a, b) => b.value - a.value)
                .slice(0, safeLimit);

            title = artist_name
                ? `${artist_name} - Top Artists`
                : year
                    ? `Top Artists in ${year}`
                    : 'All-Time Top Artists';
            explanation = [
                `Your top ${data.length} artists by ${getMetricLabel(metric).toLowerCase()}.`,
                year
                    ? `Based on your listening data from ${year}.`
                    : 'Based on all available listening data.',
            ];
            break;
        }

        case 'top_tracks': {
            const yearStreams = year
                ? streams.filter(s => new Date(s.ts || s.endTime).getFullYear() === year)
                : streams;

            const trackCounts = new Map();
            for (const s of yearStreams) {
                const track = s.trackName || s.master_metadata_track_name || 'Unknown';
                const artist = s.artistName || s.master_metadata_album_artist_name || '';
                const key = `${track} - ${artist}`;
                if (metric === 'hours') {
                    const hours = (s.msPlayed || s.ms_played || 0) / 3600000;
                    trackCounts.set(key, (trackCounts.get(key) || 0) + hours);
                } else {
                    trackCounts.set(key, (trackCounts.get(key) || 0) + 1);
                }
            }

            data = Array.from(trackCounts.entries())
                .map(([track, value]) => ({ category: track, value }))
                .sort((a, b) => b.value - a.value)
                .slice(0, safeLimit);

            title = year ? `Top Tracks in ${year}` : 'All-Time Top Tracks';
            explanation = [
                `Your top ${data.length} tracks by ${getMetricLabel(metric).toLowerCase()}.`,
            ];
            break;
        }

        case 'period_comparison': {
            if (!periods || periods.length < 2) {
                return {
                    message: 'Period comparison requires at least 2 periods to compare.',
                    artifact: null,
                };
            }

            for (const period of periods) {
                const periodStreams = streams.filter(s => {
                    const date = new Date(s.ts || s.endTime);
                    const yearMatch = date.getFullYear() === period.year;
                    const monthMatch = period.month ? date.getMonth() + 1 === period.month : true;
                    return yearMatch && monthMatch;
                });

                data.push({
                    category:
                        period.label || `${period.year}${period.month ? `-${period.month}` : ''}`,
                    value: calculateMetric(periodStreams, metric),
                });
            }

            title = `${getMetricLabel(metric)} Comparison`;
            explanation = [
                `Comparing ${getMetricLabel(metric).toLowerCase()} across ${periods.length} time periods.`,
            ];
            break;
        }

        case 'artist_plays': {
            if (!artist_name) {
                return {
                    message: 'Artist plays requires an artist name.',
                    artifact: null,
                };
            }

            const artistLower = artist_name.toLowerCase();
            const artistStreams = streams.filter(s => {
                const artist = (
                    s.artistName ||
                    s.master_metadata_album_artist_name ||
                    ''
                ).toLowerCase();
                return artist.includes(artistLower);
            });

            // Group by year
            const yearCounts = new Map();
            for (const s of artistStreams) {
                const streamYear = new Date(s.ts || s.endTime).getFullYear();
                yearCounts.set(streamYear, (yearCounts.get(streamYear) || 0) + 1);
            }

            data = Array.from(yearCounts.entries())
                .map(([yr, count]) => ({ category: String(yr), value: count }))
                .sort((a, b) => a.category.localeCompare(b.category));

            title = `${artist_name} - Plays by Year`;
            explanation = [`Yearly play count for ${artist_name}.`];
            break;
        }

        default:
            return {
                message: `Unknown comparison type: ${comparison_type}`,
                artifact: null,
            };
    }

    if (data.length === 0) {
        return {
            message: 'No data found for the specified comparison.',
            artifact: null,
        };
    }

    const artifact = createBarChart({
        title,
        data,
        categoryField: 'category',
        valueField: 'value',
        horizontal: true,
        explanation,
    });

    const topItem = data[0];

    return {
        message: `Here's your ${title.toLowerCase()}. "${topItem.category}" leads with ${formatMetricValue(topItem.value, metric)}.`,
        artifact,
        summary: {
            top_item: topItem.category,
            top_value: topItem.value,
            total_items: data.length,
        },
    };
}

// ==========================================
// Show Listening Timeline Executor
// ==========================================

/**
 * Execute show_listening_timeline function
 * Returns timeline visualization
 */
function show_listening_timeline(args, streams) {
    const validation = validateArgs(args, 'show_listening_timeline');
    if (!validation.valid) {
        return { message: validation.error, artifact: null };
    }

    const { timeline_type, artist_name, time_range, limit = 10 } = args;

    logger.debug('Executing show_listening_timeline', { timeline_type, artist_name });

    const safeLimit = Math.min(limit, 15);
    let events = [];
    let title = '';
    let explanation = [];

    switch (timeline_type) {
        case 'artist_journey': {
            if (!artist_name) {
                return {
                    message: 'Artist journey requires an artist name.',
                    artifact: null,
                };
            }

            const artistLower = artist_name.toLowerCase();
            const artistStreams = streams
                .filter(s => {
                    const artist = (
                        s.artistName ||
                        s.master_metadata_album_artist_name ||
                        ''
                    ).toLowerCase();
                    return artist.includes(artistLower);
                })
                .sort((a, b) => new Date(a.ts || a.endTime) - new Date(b.ts || b.endTime));

            if (artistStreams.length === 0) {
                return {
                    message: `No listening history found for "${artist_name}".`,
                    artifact: null,
                };
            }

            // Key moments: first listen, peak month, notable tracks
            const firstListen = artistStreams[0];
            const firstDate = new Date(firstListen.ts || firstListen.endTime);
            events.push({
                date: firstDate.toISOString(),
                label: `First listened to ${artist_name}`,
            });

            // Find peak month
            const monthCounts = groupByGranularity(artistStreams, 'month');
            let peakMonth = null;
            let peakCount = 0;
            for (const [month, monthStreams] of monthCounts) {
                if (monthStreams.length > peakCount) {
                    peakCount = monthStreams.length;
                    peakMonth = month;
                }
            }
            if (peakMonth) {
                events.push({
                    date: `${peakMonth}-15`,
                    label: `Peak listening: ${peakCount} plays`,
                });
            }

            // Last listen
            const lastListen = artistStreams[artistStreams.length - 1];
            const lastDate = new Date(lastListen.ts || lastListen.endTime);
            events.push({
                date: lastDate.toISOString(),
                label: 'Most recent listen',
            });

            title = `Your Journey with ${artist_name}`;
            explanation = [
                `You first discovered ${artist_name} in ${firstDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.`,
                `Total plays: ${artistStreams.length}`,
            ];
            break;
        }

        case 'discovery_timeline': {
            // Find first listen for each artist
            const firstListens = new Map();
            for (const s of streams) {
                const artist = s.artistName || s.master_metadata_album_artist_name || 'Unknown';
                const date = new Date(s.ts || s.endTime);
                if (!firstListens.has(artist) || date < firstListens.get(artist).date) {
                    firstListens.set(artist, { date, stream: s });
                }
            }

            // Get artists with most plays to show significant discoveries
            const artistCounts = new Map();
            for (const s of streams) {
                const artist = s.artistName || s.master_metadata_album_artist_name || 'Unknown';
                artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
            }

            events = Array.from(firstListens.entries())
                .filter(([artist]) => (artistCounts.get(artist) || 0) >= 5) // Only significant artists
                .map(([artist, { date }]) => ({
                    date: date.toISOString(),
                    label: `Discovered ${artist}`,
                }))
                .sort((a, b) => new Date(a.date) - new Date(b.date))
                .slice(0, safeLimit);

            title = 'Artist Discovery Timeline';
            explanation = ['Key artist discoveries over time (artists with 5+ plays).'];
            break;
        }

        case 'milestones': {
            // Calculate cumulative milestones
            const sortedStreams = [...streams].sort(
                (a, b) => new Date(a.ts || a.endTime) - new Date(b.ts || b.endTime)
            );

            const milestones = [100, 500, 1000, 5000, 10000, 25000, 50000, 100000];
            let count = 0;

            for (const stream of sortedStreams) {
                count++;
                if (milestones.includes(count)) {
                    const date = new Date(stream.ts || stream.endTime);
                    events.push({
                        date: date.toISOString(),
                        label: `${count.toLocaleString()} plays milestone`,
                    });
                }
            }

            title = 'Listening Milestones';
            explanation = [
                `Your listening journey from first play to ${count.toLocaleString()} total plays.`,
            ];
            break;
        }

        case 'era_transitions': {
            // Find significant listening era transitions
            // Group by month to identify eras
            const monthStats = groupByGranularity(streams, 'month');

            // Detect transitions: months where top artist changes
            const transitions = [];
            let prevTopArtist = null;

            // Sort by date (not lexicographically) to ensure chronological order
            for (const [month, monthStreams] of Array.from(monthStats.entries()).sort((a, b) => {
                const dateA = new Date(a[0] + '-01');
                const dateB = new Date(b[0] + '-01');
                return dateA - dateB;
            })) {
                const artistCounts = new Map();
                for (const s of monthStreams) {
                    const artist = s.artistName || s.master_metadata_album_artist_name || 'Unknown';
                    artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
                }

                const topArtist = Array.from(artistCounts.entries()).sort(
                    (a, b) => b[1] - a[1]
                )[0]?.[0];

                if (prevTopArtist && topArtist !== prevTopArtist) {
                    transitions.push({
                        date: `${month}-15`,
                        label: `Transition: ${prevTopArtist} → ${topArtist}`,
                    });
                }
                prevTopArtist = topArtist;
            }

            events = transitions.slice(0, safeLimit);
            title = 'Listening Era Transitions';
            explanation = ['Key moments where your primary artist focus shifted.'];
            break;
        }

        default:
            return {
                message: `Unknown timeline type: ${timeline_type}`,
                artifact: null,
            };
    }

    if (events.length === 0) {
        return {
            message: 'No events found for the specified timeline.',
            artifact: null,
        };
    }

    const artifact = createTimeline({
        title,
        events,
        dateField: 'date',
        labelField: 'label',
        explanation,
    });

    return {
        message: `Here's your ${title.toLowerCase()} showing ${events.length} key moments.`,
        artifact,
        summary: {
            event_count: events.length,
        },
    };
}

// ==========================================
// Show Listening Heatmap Executor
// ==========================================

/**
 * Execute show_listening_heatmap function
 * Returns calendar heatmap
 */
function show_listening_heatmap(args, streams) {
    // Validate args
    if (!args || typeof args !== 'object') {
        return {
            message: '[show_listening_heatmap] Invalid arguments: expected object',
            artifact: null,
        };
    }

    const { year, metric = 'plays' } = args;

    // Default to most recent year with data, or current year if empty
    const targetYear =
        year ||
        (streams.length > 0
            ? Math.max(...streams.map(s => new Date(s.ts || s.endTime).getFullYear()))
            : new Date().getFullYear());

    logger.debug('Executing show_listening_heatmap', { year: targetYear, metric });

    const yearStreams = streams.filter(
        s => new Date(s.ts || s.endTime).getFullYear() === targetYear
    );

    if (yearStreams.length === 0) {
        return {
            message: `No listening data found for ${targetYear}.`,
            artifact: null,
        };
    }

    // Group by day (skip invalid dates)
    const dailyData = new Map();
    for (const s of yearStreams) {
        const date = new Date(s.ts || s.endTime);
        if (isNaN(date.getTime())) continue; // Skip invalid dates
        const dayKey = date.toISOString().split('T')[0];

        if (!dailyData.has(dayKey)) {
            dailyData.set(dayKey, { plays: 0, hours: 0, artists: new Set() });
        }

        const day = dailyData.get(dayKey);
        day.plays++;
        day.hours += (s.msPlayed || s.ms_played || 0) / 3600000;
        day.artists.add(s.artistName || s.master_metadata_album_artist_name);
    }

    // Convert to array
    const data = Array.from(dailyData.entries()).map(([date, stats]) => ({
        date,
        value:
            metric === 'hours'
                ? stats.hours
                : metric === 'unique_artists'
                    ? stats.artists.size
                    : stats.plays,
    }));

    const title = `${targetYear} Listening Activity`;
    const totalDays = dailyData.size;
    const totalValue = data.reduce((sum, d) => sum + d.value, 0);

    // Create heatmap spec manually (since it's special)
    const artifact = {
        type: 'artifact',
        artifactId: `heatmap_${Date.now()}`,
        title,
        subtitle: `${getMetricLabel(metric)} by day`,
        view: {
            kind: 'heatmap',
            x: { field: 'date', type: 'temporal' },
            y: { field: 'value', type: 'quantitative' },
        },
        data,
        annotations: [],
        explanation: [
            `You listened on ${totalDays} days in ${targetYear}.`,
            `Total ${getMetricLabel(metric).toLowerCase()}: ${formatMetricValue(totalValue, metric)}`,
        ],
    };

    return {
        message: `Here's your listening activity for ${targetYear}. You were active on ${totalDays} days with ${formatMetricValue(totalValue, metric)} total.`,
        artifact,
        summary: {
            days_active: totalDays,
            total: totalValue,
        },
    };
}

// ==========================================
// Show Data Table Executor
// ==========================================

/**
 * Execute show_data_table function
 * Returns formatted table
 */
function show_data_table(args, streams) {
    const validation = validateArgs(args, 'show_data_table');
    if (!validation.valid) {
        return { message: validation.error, artifact: null };
    }

    const { table_type, year, month, artist_name, limit = 10 } = args;

    logger.debug('Executing show_data_table', { table_type, year, month });

    const safeLimit = Math.min(limit, 25);
    let data = [];
    let columns = [];
    let title = '';
    let explanation = [];

    // Filter by year/month if specified
    let filtered = streams;
    if (year) {
        filtered = filtered.filter(s => new Date(s.ts || s.endTime).getFullYear() === year);
    }
    if (month) {
        filtered = filtered.filter(s => new Date(s.ts || s.endTime).getMonth() + 1 === month);
    }

    switch (table_type) {
        case 'top_tracks_detailed': {
            const trackStats = new Map();
            for (const s of filtered) {
                const track = s.trackName || s.master_metadata_track_name || 'Unknown';
                const artist = s.artistName || s.master_metadata_album_artist_name || 'Unknown';
                const key = `${track}|||${artist}`;

                if (!trackStats.has(key)) {
                    trackStats.set(key, { track, artist, plays: 0, hours: 0 });
                }
                const stats = trackStats.get(key);
                stats.plays++;
                stats.hours += (s.msPlayed || s.ms_played || 0) / 3600000;
            }

            data = Array.from(trackStats.values())
                .sort((a, b) => b.plays - a.plays)
                .slice(0, safeLimit)
                .map((item, i) => ({
                    rank: i + 1,
                    track: item.track,
                    artist: item.artist,
                    plays: item.plays,
                    hours: item.hours.toFixed(1),
                }));

            columns = [
                { field: 'rank', label: '#' },
                { field: 'track', label: 'Track' },
                { field: 'artist', label: 'Artist' },
                { field: 'plays', label: 'Plays' },
                { field: 'hours', label: 'Hours' },
            ];

            title = year
                ? `Top Tracks in ${year}${month ? ` (${getMonthName(month)})` : ''}`
                : 'All-Time Top Tracks';
            explanation = [`Detailed stats for your top ${data.length} tracks.`];
            break;
        }

        case 'top_artists_detailed': {
            const artistStats = new Map();
            for (const s of filtered) {
                const artist = s.artistName || s.master_metadata_album_artist_name || 'Unknown';

                if (!artistStats.has(artist)) {
                    artistStats.set(artist, { artist, plays: 0, hours: 0, tracks: new Set() });
                }
                const stats = artistStats.get(artist);
                stats.plays++;
                stats.hours += (s.msPlayed || s.ms_played || 0) / 3600000;
                stats.tracks.add(s.trackName || s.master_metadata_track_name);
            }

            data = Array.from(artistStats.values())
                .sort((a, b) => b.plays - a.plays)
                .slice(0, safeLimit)
                .map((item, i) => ({
                    rank: i + 1,
                    artist: item.artist,
                    plays: item.plays,
                    hours: item.hours.toFixed(1),
                    tracks: item.tracks.size,
                }));

            columns = [
                { field: 'rank', label: '#' },
                { field: 'artist', label: 'Artist' },
                { field: 'plays', label: 'Plays' },
                { field: 'hours', label: 'Hours' },
                { field: 'tracks', label: 'Unique Tracks' },
            ];

            title = year ? `Top Artists in ${year}` : 'All-Time Top Artists';
            explanation = [`Detailed stats for your top ${data.length} artists.`];
            break;
        }

        case 'listening_by_month': {
            const monthStats = groupByGranularity(filtered, 'month');

            data = Array.from(monthStats.entries())
                .map(([month, monthStreams]) => ({
                    month,
                    plays: monthStreams.length,
                    hours: (
                        monthStreams.reduce((sum, s) => sum + (s.msPlayed || s.ms_played || 0), 0) /
                        3600000
                    ).toFixed(1),
                    artists: new Set(
                        monthStreams.map(s => s.artistName || s.master_metadata_album_artist_name)
                    ).size,
                }))
                .sort((a, b) => a.month.localeCompare(b.month));

            columns = [
                { field: 'month', label: 'Month' },
                { field: 'plays', label: 'Plays' },
                { field: 'hours', label: 'Hours' },
                { field: 'artists', label: 'Artists' },
            ];

            title = 'Listening by Month';
            explanation = ['Monthly breakdown of your listening activity.'];
            break;
        }

        case 'artist_tracks': {
            if (!artist_name) {
                return {
                    message: 'Artist tracks table requires an artist name.',
                    artifact: null,
                };
            }

            const artistLower = artist_name.toLowerCase();
            const artistStreams = filtered.filter(s => {
                const artist = (
                    s.artistName ||
                    s.master_metadata_album_artist_name ||
                    ''
                ).toLowerCase();
                return artist.includes(artistLower);
            });

            const trackStats = new Map();
            for (const s of artistStreams) {
                const track = s.trackName || s.master_metadata_track_name || 'Unknown';

                if (!trackStats.has(track)) {
                    trackStats.set(track, { track, plays: 0, hours: 0 });
                }
                const stats = trackStats.get(track);
                stats.plays++;
                stats.hours += (s.msPlayed || s.ms_played || 0) / 3600000;
            }

            data = Array.from(trackStats.values())
                .sort((a, b) => b.plays - a.plays)
                .slice(0, safeLimit)
                .map((item, i) => ({
                    rank: i + 1,
                    track: item.track,
                    plays: item.plays,
                    hours: item.hours.toFixed(1),
                }));

            columns = [
                { field: 'rank', label: '#' },
                { field: 'track', label: 'Track' },
                { field: 'plays', label: 'Plays' },
                { field: 'hours', label: 'Hours' },
            ];

            title = `${artist_name} - Top Tracks`;
            explanation = [`Your most-played tracks by ${artist_name}.`];
            break;
        }

        default:
            return {
                message: `Unknown table type: ${table_type}`,
                artifact: null,
            };
    }

    if (data.length === 0) {
        return {
            message: 'No data found for the specified table.',
            artifact: null,
        };
    }

    const artifact = createTable({
        title,
        data,
        columns,
        explanation,
    });

    return {
        message: `Here's your ${title.toLowerCase()} with ${data.length} entries.`,
        artifact,
        summary: {
            row_count: data.length,
        },
    };
}

// Helper for month names
function getMonthName(month) {
    const months = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
    ];
    return months[month - 1] || '';
}

// ==========================================
// Export Executors
// ==========================================

export const ArtifactExecutors = {
    visualize_trend,
    visualize_comparison,
    show_listening_timeline,
    show_listening_heatmap,
    show_data_table,
};

logger.info('Artifact executors loaded');
