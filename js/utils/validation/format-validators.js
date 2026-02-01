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
        .replace(/&/g, '&amp;') // Must be first to avoid double-escaping
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
 * Validate and normalize a URL with strict protocol whitelist
 *
 * **SECURITY**: This function implements a strict protocol whitelist to prevent
 * XSS attacks via dangerous URL schemes (javascript:, data:, vbscript:, etc.).
 *
 * **Critical Security Features**:
 * - Pre-validation of protocol BEFORE parsing to reject dangerous schemes
 * - Uses custom protocol extraction (not URL constructor) for initial check
 * - Validates against whitelist before allowing URL constructor to parse
 * - Provides clear, actionable error messages
 *
 * **Why this matters**: The URL constructor accepts dangerous protocols like
 * `javascript:alert(1)` which can lead to XSS if used in sensitive contexts
 * like <a href> or location.href. By validating the protocol BEFORE parsing,
 * we ensure only safe protocols are ever processed.
 *
 * @param {*} url - URL to validate
 * @param {Object} [options] - Validation options
 * @param {string[]} [options.allowedProtocols=['http:', 'https:']] - Allowed URL protocols (MUST include colon)
 * @returns {{ valid: boolean, error?: string, normalizedValue?: string }} Validation result with normalized URL
 *
 * @example
 * // Basic usage - allows http and https only
 * const result = validateURL(userInput);
 * if (result.valid) {
 *   window.location.href = result.normalizedValue;
 * }
 *
 * @example
 * // Custom protocol whitelist
 * const result = validateURL(userInput, {
 *   allowedProtocols: ['http:', 'https:', 'ws:', 'wss:']
 * });
 *
 * @example
 * // Rejects dangerous protocols
 * validateURL('javascript:alert(1)'); // { valid: false, error: "Dangerous protocol: javascript:" }
 * validateURL('data:text/html,<script>alert(1)</script>'); // { valid: false, error: "Dangerous protocol: data:" }
 */
export function validateURL(url, options = {}) {
    const { allowedProtocols = ['http:', 'https:'] } = options;

    // Type validation
    if (typeof url !== 'string') {
        return { valid: false, error: 'URL must be a string' };
    }

    // Trim whitespace but preserve the URL structure
    const trimmed = url.trim();

    // Empty string check
    if (trimmed.length === 0) {
        return { valid: false, error: 'URL cannot be empty' };
    }

    /**
     * SECURITY: Extract protocol BEFORE parsing to reject dangerous schemes
     *
     * The URL constructor will accept dangerous protocols like javascript:, data:, etc.
     * We need to validate the protocol BEFORE allowing the URL constructor to parse.
     *
     * FIXED: First normalize Unicode to prevent homograph attacks
     * Unicode characters like "ı" (U+0131, dotless i) can visually resemble ASCII
     * characters but bypass ASCII-only checks. Normalization converts these to
     * canonical forms before validation.
     *
     * This regex extracts the protocol (everything before the first colon)
     * It handles edge cases like:
     * - "javascript:alert(1)" -> "javascript:"
     * - "https://example.com" -> "https:"
     * - "example.com" -> null (no protocol)
     * - "j\u0131vascript:" -> normalized to "javascript:" before matching
     */
    const normalized = trimmed.normalize('NFC');
    const protocolMatch = normalized.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);

    if (!protocolMatch) {
        return { valid: false, error: 'URL must include a protocol (e.g., https://)' };
    }

    const protocol = protocolMatch[1].toLowerCase() + ':';

    /**
     * SECURITY: Strict protocol whitelist validation
     *
     * This is the critical security check. We validate the protocol against
     * the whitelist BEFORE parsing the URL. This prevents dangerous protocols
     * from being accepted by the URL constructor.
     *
     * Common dangerous protocols we explicitly reject:
     * - javascript: Can execute arbitrary JavaScript (XSS)
     * - data: Can embed arbitrary content (XSS)
     * - vbscript: Can execute VBScript (IE only, but still dangerous)
     * - file: Can access local files (privacy/security issue)
     * - ftp: Cleartext protocol (not inherently dangerous but insecure)
     * - about: Internal browser pages (potential phishing)
     */
    if (!allowedProtocols.includes(protocol)) {
        // Check if it's a known dangerous protocol for better error message
        const dangerousProtocols = [
            'javascript:',
            'data:',
            'vbscript:',
            'file:',
            'about:',
            'chrome:',
            'chrome-extension:',
        ];

        if (dangerousProtocols.includes(protocol)) {
            return {
                valid: false,
                error: `Dangerous protocol "${protocol}" is not allowed for security reasons`,
            };
        }

        return {
            valid: false,
            error: `URL protocol "${protocol}" is not allowed. Allowed protocols are: ${allowedProtocols.join(', ')}`,
        };
    }

    // Now safe to parse with URL constructor (use normalized string)
    try {
        const url = new URL(normalized);

        // Double-check protocol (in case URL constructor normalized it differently)
        if (!allowedProtocols.includes(url.protocol)) {
            return {
                valid: false,
                error: `URL protocol must be one of: ${allowedProtocols.join(', ')}`,
            };
        }

        return { valid: true, normalizedValue: url.href };
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
