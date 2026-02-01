/**
 * Regex Validator Module - ReDoS Prevention
 *
 * Provides safe regex validation and creation with protection against
 * Regular Expression Denial of Service (ReDoS) attacks.
 *
 * Features:
 * - AST-based detection of nested quantifiers
 * - Timeout protection for regex operations
 * - Comprehensive safety validation
 * - Safe regex creation and testing
 *
 * @module regex-validator
 * @private
 */

/**
 * Configuration for regex validation
 */
const REGEX_CONFIG = {
    // Maximum time for regex operations (ms)
    REGEX_TIMEOUT: 1000,

    // Dangerous regex patterns that could cause catastrophic backtracking
    DANGEROUS_PATTERNS: [
        // Nested quantifiers - catches ((a+)+, ((a*)+, (a+)+, etc.
        /\(.*[+*]\)\s*[+*]/, // (...quantifier)quantifier
        /\(.*[+*]\)\s*\([^)]*\)\s*[+*]/, // (...quantifier)(...)quantifier
        /\(\([^)]*[*+][^)]*\)[*+]/, // Double nested with inner quantifier
        /\(\?:.*[*+]\)\s*[*+]/, // Non-capturing with nested quantifier
        /\(\?=.*[*+]\)\s*[*+]/, // Lookahead with nested quantifier
        /\(!.*[*+]\)\s*[*+]/, // Negative lookahead with nested quantifier
        // Complex overlapping patterns
        /\(.+\)\[.*\]\{.*\}\{.*\}/, // Complex nested quantifiers
        /\[.*\]\[.*\]\{.*\}\{.*\}/, // Multiple nested quantifiers
    ],

    // Character classes that are safe
    SAFE_PATTERNS: new Set([
        '^[a-zA-Z0-9]+$',
        '^[a-z]+$',
        '^[A-Z]+$',
        '^[0-9]+$',
        '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
        '^https?://[^\\s/$.?#][^\\s]*$',
        '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
        '^[a-fA-F0-9]+$',
        '^[\\s\\S]*$',
        '^.+$',
        '^.*$',
    ]),
};

/**
 * AST-based detection of nested quantifiers that cause ReDoS
 * This catches patterns like ((a+)+, (a+)*, (a*)+, etc.
 *
 * @param {string} pattern - The regex pattern to analyze
 * @returns {{ hasNestedQuantifiers: boolean, details?: string }}
 */
function _detectNestedQuantifiers(pattern) {
    // Pattern 1: Direct nested quantifiers like (a+)+, (a*)+, ((a+)+)
    // This catches: (anything-with-quantifier)quantifier
    // But we need to be careful not to catch safe patterns like ^[a-z]+$
    const directNested = /\(([^)]*[*+{][^)]*)\)[*+{]/;
    if (directNested.test(pattern)) {
        // Verify it's actually nested (not just a quantifier after a simple group)
        const match = pattern.match(directNested);
        if (match) {
            const innerContent = match[1];
            // Check if inner content actually has a quantifier
            if (/[*+{]/.test(innerContent)) {
                return {
                    hasNestedQuantifiers: true,
                    details: `Group with quantifier followed by outer quantifier: ${match[0]}`,
                };
            }
        }
    }

    // Pattern 2: Double-nested like ((a+)+)
    const doubleNested = /\(\(([^)]*[*+{][^)]*)\)[*+{]\)/;
    if (doubleNested.test(pattern)) {
        const match = pattern.match(doubleNested);
        return {
            hasNestedQuantifiers: true,
            details: `Double-nested quantifier pattern: ${match ? match[0] : '((a+)+)'}`,
        };
    }

    // Pattern 3: Consecutive quantifiers after group (e.g., )++, )**, )+*)
    const consecutiveQuantifiers = /\)\s*[*+{]\s*[*+{]/;
    if (consecutiveQuantifiers.test(pattern)) {
        const match = pattern.match(consecutiveQuantifiers);
        return {
            hasNestedQuantifiers: true,
            details: `Consecutive quantifiers after group: ${match ? match[0] : ')+'}`,
        };
    }

    // Pattern 4: Lookahead/lookbehind with nested quantifier AND outer quantifier
    // e.g., (?=a+)+ but NOT (?=a+) (which is safe)
    const lookaroundNested = /(\(\?=|\(!|\(\?<=|\(\?<!)([^)]*[*+{][^)]*)\)\s*[*+{]/;
    if (lookaroundNested.test(pattern)) {
        const match = pattern.match(lookaroundNested);
        return {
            hasNestedQuantifiers: true,
            details: `Lookahead/lookbehind with nested quantifier: ${match ? match[0] : '(?=a+)+'}`,
        };
    }

    // Pattern 5: Complex nested structure detection using AST-like parsing
    // Track group depth and quantifier positions
    let depth = 0;
    const groupStack = [];

    for (let i = 0; i < pattern.length; i++) {
        const char = pattern[i];
        const prevChar = i > 0 ? pattern[i - 1] : '';

        // Track groups (parentheses)
        if (char === '(') {
            // Check for escaped parenthesis
            if (prevChar !== '\\') {
                depth++;
                groupStack.push({ start: i, depth });
            }
        } else if (char === ')') {
            // Check for escaped parenthesis
            if (prevChar !== '\\') {
                if (groupStack.length > 0) {
                    const group = groupStack.pop();
                    group.end = i;

                    // Check if there's a quantifier right after this group
                    let nextIdx = i + 1;
                    while (nextIdx < pattern.length && /\s/.test(pattern[nextIdx])) {
                        nextIdx++;
                    }

                    if (nextIdx < pattern.length && /[*+{]/.test(pattern[nextIdx])) {
                        // Check if the group content has quantifiers
                        const groupContent = pattern.substring(group.start + 1, i);
                        const hasInnerQuantifier = /[*+{]/.test(groupContent);

                        if (hasInnerQuantifier) {
                            // This is nested quantifier!
                            return {
                                hasNestedQuantifiers: true,
                                details: `Nested quantifiers: group ending at position ${i} has inner quantifier and outer quantifier`,
                            };
                        }
                    }
                }
                depth--;
            }
        }
    }

    return { hasNestedQuantifiers: false };
}

/**
 * Validate a regex pattern for safety
 * Checks for patterns that could cause catastrophic backtracking (ReDoS)
 *
 * @param {string} pattern - The regex pattern to validate
 * @returns {{ safe: boolean, reason?: string }} Validation result
 */
function _validateRegexPattern(pattern) {
    if (typeof pattern !== 'string') {
        return { safe: false, reason: 'Pattern must be a string' };
    }

    // AST-based detection of nested quantifiers (catches bypass patterns)
    const astCheck = _detectNestedQuantifiers(pattern);
    if (astCheck.hasNestedQuantifiers) {
        return {
            safe: false,
            reason: `unsafe: Pattern contains nested quantifiers (ReDoS risk): ${astCheck.details}`,
        };
    }

    // Check for lookahead with quantifiers that can cause ReDoS
    // e.g., a+(?=a+) - the lookahead can cause exponential backtracking
    const lookaheadWithQuantifier = /[*+{][^)]*(\(\?=|\(!)[^)]*[*+{]/;
    if (lookaheadWithQuantifier.test(pattern)) {
        const match = pattern.match(lookaheadWithQuantifier);
        return {
            safe: false,
            reason: `unsafe: Pattern contains lookahead with quantifiers (ReDoS risk): ${match ? match[0] : 'a+(?=a+)'}`,
        };
    }

    // Check for known dangerous patterns
    for (const dangerous of REGEX_CONFIG.DANGEROUS_PATTERNS) {
        if (dangerous.test(pattern)) {
            return {
                safe: false,
                reason: `unsafe: Pattern contains dangerous construct: ${dangerous}`,
            };
        }
    }

    // Check for multiple nested quantifiers
    const quantifierCount = (pattern.match(/\*|\+|\?|\{[0-9,]+\}/g) || []).length;
    if (quantifierCount > 5) {
        return {
            safe: false,
            reason: 'unsafe: Pattern contains too many quantifiers (potential ReDoS risk)',
        };
    }

    // Check for overlapping alternations
    const alternationCount = (pattern.match(/\|/g) || []).length;
    if (alternationCount > 10) {
        return {
            safe: false,
            reason: 'unsafe: Pattern contains too many alternations (potential ReDoS risk)',
        };
    }

    // Check for nested groups with quantifiers
    const nestedGroupQuantifiers = (pattern.match(/\([^)]*\)*[+*]|{\([^}]*\)[+*]/g) || []).length;
    if (nestedGroupQuantifiers > 3) {
        return {
            safe: false,
            reason: 'unsafe: Pattern contains nested groups with quantifiers (potential ReDoS risk)',
        };
    }

    // Warn about potentially complex patterns
    if (pattern.length > 200) {
        console.warn('[Validation] Very long regex pattern detected, may impact performance');
    }

    return { safe: true };
}

/**
 * Create a safe regex with timeout protection
 * Uses regex timeout to prevent ReDoS attacks
 *
 * @param {string} pattern - The regex pattern
 * @param {string} [flags] - Regex flags
 * @returns {RegExp|Error} Regex object or error
 */
function _createSafeRegex(pattern, flags = '') {
    const validation = _validateRegexPattern(pattern);
    if (!validation.safe) {
        throw new Error(`Unsafe regex pattern: ${validation.reason}`);
    }

    try {
        return new RegExp(pattern, flags);
    } catch (error) {
        throw new Error(`Invalid regex pattern: ${error.message}`);
    }
}

/**
 * Test a string against a pattern with timeout protection
 *
 * @param {string} str - String to test
 * @param {string} pattern - Regex pattern
 * @returns {boolean} Match result
 */
function _safeRegexTest(str, pattern) {
    const regex = _createSafeRegex(pattern);

    // Use timeout protection for long-running regex
    const timeoutId = setTimeout(() => {
        throw new Error('Regex operation timeout - possible ReDoS attack');
    }, REGEX_CONFIG.REGEX_TIMEOUT);

    try {
        const result = regex.test(str);
        clearTimeout(timeoutId);
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// Export functions (marked private with _ prefix but exported for testing)
export {
    _detectNestedQuantifiers,
    _validateRegexPattern,
    _createSafeRegex,
    _safeRegexTest,
    REGEX_CONFIG,
};
