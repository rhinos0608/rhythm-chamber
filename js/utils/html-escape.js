/**
 * HTML Escape Utility
 *
 * Centralized HTML escaping to prevent XSS vulnerabilities.
 * All user-generated content MUST be escaped before being inserted
 * into the DOM via innerHTML or similar methods.
 *
 * @module utils/html-escape
 */

/**
 * Escape HTML to prevent XSS attacks
 *
 * This function sanitizes user input by converting special characters
 * to their HTML entity equivalents. This prevents malicious scripts
 * from executing when user content is displayed via innerHTML.
 *
 * @param {string} text - Text to escape
 * @returns {string} Escaped text safe for use in HTML context
 *
 * @example
 *   escapeHtml('<script>alert("XSS")</script>')
 *   // Returns: '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
 *
 * @example
 *   // Safe usage with innerHTML:
 *   element.innerHTML = `<div>${escapeHtml(userInput)}</div>`;
 */

/**
 * String-based HTML escape for environments without DOM (Web Workers)
 *
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtmlString(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function escapeHtml(text) {
    // Handle null/undefined/non-string inputs
    if (text == null) {
        return '';
    }

    // Coerce to string
    const str = String(text);

    // Use DOM-based escaping when available (main thread)
    // This handles all HTML entities correctly including Unicode
    if (typeof document !== 'undefined') {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Fallback to string-based escaping for Web Workers
    return escapeHtmlString(str);
}

/**
 * Escape HTML attributes
 *
 * For attribute values, we need additional escaping for quotes.
 * Use this when setting attributes like title, data-*, etc.
 *
 * @param {string} text - Text to escape for attribute context
 * @returns {string} Escaped text safe for use in HTML attributes
 *
 * @example
 *   element.setAttribute('title', escapeHtmlAttr(userInput));
 */
export function escapeHtmlAttr(text) {
    if (text == null) {
        return '';
    }

    const str = String(text);

    // Replace quotes with their HTML entities
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Escape JavaScript string literals
 *
 * Use this when inserting user data into JavaScript code strings.
 *
 * @param {string} text - Text to escape for JavaScript context
 * @returns {string} Escaped text safe for use in JavaScript strings
 *
 * @example
 *   // DON'T DO THIS (vulnerable):
 *   // element.onclick = new Function(`alert('${userInput}')`);
 *
 *   // Instead, use addEventListener with data attributes
 *   element.dataset.message = userInput;
 *   element.addEventListener('click', () => {
 *       alert(element.dataset.message);
 *   });
 */
export function escapeJs(text) {
    if (text == null) {
        return '';
    }

    const str = String(text);

    // Escape backslashes and quotes for JavaScript strings
    return str
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t')
        .replace(/\f/g, '\\f')
        .replace(/\v/g, '\\v')
        .replace(/\0/g, '\\0');
}

/**
 * Safe HTML template tag function
 *
 * Template literal tag that automatically escapes all interpolated values.
 * Only literal HTML in the template is preserved.
 *
 * @param {TemplateStringsArray} strings - Template string parts
 * @param {...*} values - Values to interpolate and escape
 * @returns {string} Safe HTML string
 *
 * @example
 *   const name = getUserInput();
 *   const html = safeHtml`<div>Hello, ${name}!</div>`;
 *   element.innerHTML = html; // Safe!
 */
export function safeHtml(strings, ...values) {
    let result = '';

    for (let i = 0; i < strings.length; i++) {
        result += strings[i];

        if (i < values.length) {
            result += escapeHtml(values[i]);
        }
    }

    return result;
}

/**
 * Check if a string contains potentially dangerous HTML
 *
 * @param {string} str - String to check
 * @returns {boolean} True if string contains HTML tags or entities
 */
export function isPotentiallyDangerous(str) {
    if (str == null) return false;

    const dangerous = /[<>&"']|&#?\w+;/;
    return dangerous.test(String(str));
}

/**
 * Sanitize HTML by removing all tags
 *
 * This strips ALL HTML tags, leaving only plain text.
 * Use this when you want to completely remove markup.
 *
 * @param {string} html - HTML string to sanitize
 * @returns {string} Plain text without HTML tags
 *
 * @example
 *   sanitizeHtml('<p>Hello <b>World</b>!</p>')
 *   // Returns: 'Hello World!'
 */
export function sanitizeHtml(html) {
    if (html == null) return '';

    const str = String(html);

    // Use DOM-based sanitization when available (main thread)
    if (typeof document !== 'undefined') {
        const temp = document.createElement('div');
        temp.innerHTML = str;
        return temp.textContent || temp.innerText || '';
    }

    // Fallback to regex-based tag stripping for Web Workers
    // This removes HTML tags by replacing <...> with empty string
    return str.replace(/<[^>]*>/g, '');
}

// Export a default for convenience
export default {
    escapeHtml,
    escapeHtmlAttr,
    escapeJs,
    safeHtml,
    isPotentiallyDangerous,
    sanitizeHtml,
};

console.log('[HtmlEscape] HTML escape utility loaded');
