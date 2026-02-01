/**
 * Validation Utilities for Function Execution
 *
 * HNW Considerations:
 * - Hierarchy: Validation at entry point, not scattered through code
 * - Network: Clear error messages propagate up to LLM
 * - Wave: Fail fast before expensive operations
 */

import { DataQuery } from '../../data-query.js';

/**
 * Validate that streams data is available
 * @param {Array} streams - User's streaming data
 * @returns {{valid: boolean, error: string}}
 */
function validateStreams(streams) {
    if (!streams || !Array.isArray(streams)) {
        return {
            valid: false,
            error: 'No streaming data available. User needs to upload their Spotify data first.',
        };
    }

    if (streams.length === 0) {
        return {
            valid: false,
            error: 'Streaming data is empty. User needs to upload their Spotify data first.',
        };
    }

    return { valid: true, error: '' };
}

/**
 * Validate DataQuery module is loaded
 * @returns {{valid: boolean, error: string}}
 */
function validateDataQuery() {
    if (!DataQuery) {
        return {
            valid: false,
            error: 'DataQuery module not loaded.',
        };
    }
    return { valid: true, error: '' };
}

/**
 * Validate year parameter
 * @param {number} year - Year to validate
 * @param {Array} streams - Streams to check against
 * @returns {{valid: boolean, error?: string}}
 */
function validateYear(year, streams) {
    if (year === undefined || year === null) {
        return { valid: true }; // Optional parameter
    }

    const parsedYear = parseInt(year);
    if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
        return {
            valid: false,
            error: `Invalid year: ${year}. Please provide a year between 2000 and 2100.`,
        };
    }

    // Check if year is in data range
    if (streams && streams.length > 0) {
        // Extract year from ts or endTime fields (streams don't have a .year property)
        const years = [
            ...new Set(
                streams
                    .map(s => {
                        const date = new Date(s.ts || s.endTime);
                        return isNaN(date.getTime()) ? null : date.getFullYear();
                    })
                    .filter(y => y !== null)
            ),
        ].sort();
        if (!years.includes(parsedYear)) {
            return {
                valid: false,
                error: `No data found for ${parsedYear}. Available years: ${years.join(', ')}`,
            };
        }
    }

    return { valid: true };
}

/**
 * Validate month parameter
 * @param {number} month - Month to validate (1-12)
 * @returns {{valid: boolean, error?: string}}
 */
function validateMonth(month) {
    if (month === undefined || month === null) {
        return { valid: true }; // Optional parameter
    }

    const parsedMonth = parseInt(month);
    if (isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
        return {
            valid: false,
            error: `Invalid month: ${month}. Please provide a month between 1 and 12.`,
        };
    }

    return { valid: true };
}

/**
 * Validate limit parameter
 * @param {number} limit - Limit to validate
 * @param {number} max - Maximum allowed limit
 * @returns {{valid: boolean, normalizedValue: number}}
 */
function validateLimit(limit, max = 50) {
    if (limit === undefined || limit === null) {
        return { valid: true, normalizedValue: 10 }; // Default
    }

    const parsedLimit = parseInt(limit);
    if (isNaN(parsedLimit) || parsedLimit < 1) {
        return { valid: true, normalizedValue: 10 };
    }

    return {
        valid: true,
        normalizedValue: Math.min(parsedLimit, max),
    };
}

/**
 * Parse and validate date range parameters
 * @param {Object} params - Parameters containing date range info
 * @returns {{startDate?: Date, endDate?: Date, error?: string}}
 */
function parseDateRange(params) {
    const { year, month, quarter, season, startDate, endDate } = params;

    // Custom date range takes precedence
    if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return { error: 'Invalid date format. Use YYYY-MM-DD.' };
        }

        if (start > end) {
            return { error: 'Start date must be before end date.' };
        }

        return { startDate: start, endDate: end };
    }

    // Quarter support
    if (quarter && year) {
        const quarters = {
            Q1: { startMonth: 0, endMonth: 2 },
            Q2: { startMonth: 3, endMonth: 5 },
            Q3: { startMonth: 6, endMonth: 8 },
            Q4: { startMonth: 9, endMonth: 11 },
        };

        const q = quarters[quarter.toUpperCase()];
        if (!q) {
            return { error: 'Invalid quarter. Use Q1, Q2, Q3, or Q4.' };
        }

        return {
            startDate: new Date(year, q.startMonth, 1),
            endDate: new Date(year, q.endMonth + 1, 0), // Last day of end month
        };
    }

    // Season support
    if (season && year) {
        const seasons = {
            spring: { startMonth: 2, endMonth: 4 }, // Mar-May
            summer: { startMonth: 5, endMonth: 7 }, // Jun-Aug
            fall: { startMonth: 8, endMonth: 10 }, // Sep-Nov
            autumn: { startMonth: 8, endMonth: 10 }, // Sep-Nov (alias)
            winter: { startMonth: 11, endMonth: 1 }, // Dec-Feb (crosses year)
        };

        const s = seasons[season.toLowerCase()];
        if (!s) {
            return { error: 'Invalid season. Use spring, summer, fall, or winter.' };
        }

        if (season.toLowerCase() === 'winter') {
            // Winter crosses year boundary
            return {
                startDate: new Date(year, 11, 1), // Dec of current year
                endDate: new Date(year + 1, 2, 0), // End of Feb next year
            };
        }

        return {
            startDate: new Date(year, s.startMonth, 1),
            endDate: new Date(year, s.endMonth + 1, 0),
        };
    }

    // Year + optional month (existing behavior)
    if (year) {
        if (month) {
            const m = parseInt(month) - 1; // Convert to 0-indexed
            return {
                startDate: new Date(year, m, 1),
                endDate: new Date(year, m + 1, 0),
            };
        }
        return {
            startDate: new Date(year, 0, 1),
            endDate: new Date(year, 11, 31),
        };
    }

    // No date filtering
    return {};
}

/**
 * Get month name from number
 * @param {number} monthNum - Month number (1-12)
 * @returns {string} Month name
 */
function getMonthName(monthNum) {
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
    return months[monthNum - 1] || 'Unknown';
}

/**
 * Format period label for display
 * @param {Object} params - Period parameters
 * @returns {string} Formatted period label
 */
function formatPeriodLabel(params) {
    const { year, month, quarter, season, startDate, endDate } = params;

    if (startDate && endDate) {
        return `${startDate} to ${endDate}`;
    }
    if (quarter && year) {
        return `${quarter} ${year}`;
    }
    if (season && year) {
        return `${season.charAt(0).toUpperCase() + season.slice(1)} ${year}`;
    }
    if (month && year) {
        return `${getMonthName(parseInt(month))} ${year}`;
    }
    if (year) {
        return `${year}`;
    }
    return 'All time';
}

// ES Module export
export const FunctionValidation = {
    validateStreams,
    validateDataQuery,
    validateYear,
    validateMonth,
    validateLimit,
    parseDateRange,
    getMonthName,
    formatPeriodLabel,
};

console.log('[FunctionValidation] Module loaded');
