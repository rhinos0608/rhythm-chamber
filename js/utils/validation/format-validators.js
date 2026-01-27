/**
 * Format Validators Module
 *
 * Provides validation for common data formats:
 * - URLs with protocol validation
 * - Email addresses
 * - HTML entity escaping
 *
 * Features:
 * - URL validation with protocol whitelisting
 * - Email format validation
 * - HTML entity escaping for XSS prevention
 * - Comprehensive test coverage
 *
 * @module utils/validation/format-validators
 */

/**
 * Escape HTML entities in a string for safe display
 *
 * ⚠️ **SECURITY WARNING**: This function ONLY escapes HTML entities (<, >, &, ", ').
 * It is NOT sufficient for complete XSS protection when used with untrusted input.
 *
 * **What it does:**
 * - Escapes: < → &lt;, > → &gt;, & → &amp;, " → &quot;, ' → &#39;
 *
 * **What it does NOT protect against:**
 * - XSS in attributes (href, src, onclick, etc.)
 * - XSS in CSS (style attributes)
 * - XSS in JavaScript (javascript: protocol)
 * - XSS from already-sanitized content (double-encoding issues)
 *
 * **For complete XSS protection with untrusted input:**
 * - Use a proper HTML sanitization library like DOMPurify
 * - Use textContent instead of innerHTML when possible
 * - Never insert untrusted content into attribute values
 *
 * @param {string} str - String to escape
 * @returns {string} String with HTML entities escaped
 *
 * @example
 * // SAFE: Escaping for text content display
 * const safe = escapeHTMLEntities(userInput);
 * element.textContent = userInput; // Better approach
 * element.innerHTML = safe; // Also safe, but textContent is preferred
 *
 * @example
 * // UNSAFE: Do not use for attributes without proper sanitization
 * const unsafe = escapeHTMLEntities(userInput); // Only escapes entities!
 * a.href = unsafe; // XSS vulnerability if input contains "javascript:alert(1)"
 *
 * @example
 * // For untrusted HTML, use a proper sanitization library
 * import DOMPurify from 'dompurify';
 * const safeHTML = DOMPurify.sanitize(untrustedHTML);
 * element.innerHTML = safeHTML; // Safe with proper library
 */
export function escapeHTMLEntities(str) {
    if (typeof str !== 'string') return '';

    // Escape in the correct order to avoid double-escaping
    return str
        .replace(/&/g, '&amp;')   // Must be first to avoid double-escaping
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * @deprecated Use escapeHTMLEntities() instead for clarity
 * This function name is misleading - it only escapes HTML entities,
 * it does NOT provide complete XSS protection.
 */
export const sanitizeHTML = escapeHTMLEntities;

/**
 * Validate and normalize a URL
 *
 * @param {*} url - URL to validate
 * @param {Object} [options] - Validation options
 * @param {string[]} [options.allowedProtocols=['http:', 'https:']] - Allowed URL protocols
 * @returns {{ valid: boolean, error?: string, normalizedValue?: string }} Validation result with normalized URL
 *
 * @example
 * const result = validateURL(userInput);
 * if (result.valid) {
 *   window.location.href = result.normalizedValue;
 * }
 */
export function validateURL(url, options = {}) {
    const { allowedProtocols = ['http:', 'https:'] } = options;

    if (typeof url !== 'string') {
        return { valid: false, error: 'URL must be a string' };
    }

    try {
        const normalized = new URL(url);

        if (!allowedProtocols.includes(normalized.protocol)) {
            return {
                valid: false,
                error: `URL protocol must be one of: ${allowedProtocols.join(', ')}`
            };
        }

        return { valid: true, normalizedValue: normalized.href };
    } catch (e) {
        return { valid: false, error: 'Invalid URL format' };
    }
}

/**
 * Validate an email address format
 *
 * @param {*} email - Email to validate
 * @returns {{ valid: boolean, error?: string, normalizedValue?: string }} Validation result
 *
 * @example
 * const result = validateEmail(userEmail);
 * if (!result.valid) {
 *   showError('Please enter a valid email address');
 * }
 */
export function validateEmail(email) {
    if (typeof email !== 'string') {
        return { valid: false, error: 'Email must be a string' };
    }

    // Basic email validation (not RFC-compliant but practical)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { valid: false, error: 'Invalid email format' };
    }

    return { valid: true, normalizedValue: email.toLowerCase().trim() };
}
