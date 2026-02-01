/**
 * Parser Utilities
 *
 * Centralized parsing utilities for processing markdown and other text formats.
 * Extracted from ChatUIController to improve code organization and reusability.
 *
 * @module utils/parser
 */

import { escapeHtml } from './html-escape.js';

// ==========================================
// Constants
// ==========================================

/** Maximum input length to prevent catastrophic backtracking in regex */
const MAX_MARKDOWN_LENGTH = 100000; // 100KB limit

// ==========================================
// Markdown Parsing
// ==========================================

/**
 * Parse markdown to HTML for chat messages (safe subset only)
 * Improved version with better handling of nested patterns
 *
 * This function implements a safe subset of markdown parsing with several
 * security and performance protections:
 *
 * 1. **REDOS Protection**: Limits input length and uses bounded quantifiers
 *    to prevent catastrophic backtracking attacks
 * 2. **XSS Protection**: All content is escaped before HTML insertion
 * 3. **Memory Safety**: Uses Array.from for proper Unicode handling
 *
 * @param {string} text - Raw markdown text
 * @returns {string} HTML string safe for DOM insertion
 *
 * @example
 *   parseMarkdown('**Bold** and `code`')
 *   // Returns: '<p><strong>Bold</strong> and <code>code</code></p>'
 */
export function parseMarkdown(text) {
    if (!text) return '';

    // REDOS FIX: Limit input length to prevent catastrophic backtracking
    // Very long inputs can cause regex to hang the browser
    if (text.length > MAX_MARKDOWN_LENGTH) {
        // Truncate safely using Array.from to handle surrogate pairs, then escape
        const truncated =
            escapeHtml(Array.from(text).slice(0, MAX_MARKDOWN_LENGTH).join('')) +
            '<span class="truncated-indicator">... (content truncated)</span>';
        return `<p>${truncated}</p>`;
    }

    const escaped = escapeHtml(text);

    // Use a more robust approach that handles nesting better
    // Process in order: code blocks, bold, italic, line breaks

    // First, protect code blocks (inline code)
    // REDOS FIX: Use non-greedy quantifier with explicit character limit to prevent backtracking
    const codeBlocks = [];
    let processedText = escaped.replace(/`([^`]{0,100})`/g, (match, code) => {
        const placeholder = `__CODE_${codeBlocks.length}__`;
        codeBlocks.push(`<code>${code}</code>`);
        return placeholder;
    });

    // Process bold: **text** or __text__
    // REDOS FIX: Use character class limits to prevent catastrophic backtracking
    // Instead of [\s\S]+? which can backtrack on complex patterns, use {0,5000} limit
    processedText = processedText
        .replace(/\*\*([^*]{1,5000})\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_]{1,5000})__/g, '<strong>$1</strong>');

    // Process italic: *text* or _text_
    // REDOS FIX: Use character class limits and avoid complex lookbehind/lookahead patterns
    processedText = processedText
        .replace(/(?<!\*)\*([^*]{1,500})\*(?!\*)/g, '<em>$1</em>')
        .replace(/(?<!_)_([^_]{1,500})_(?!_)/g, '<em>$1</em>');

    // Restore code blocks
    codeBlocks.forEach((code, i) => {
        processedText = processedText.replace(`__CODE_${i}__`, code);
    });

    // Process line breaks
    // Convert double newlines to paragraph breaks, single to line breaks
    processedText = processedText.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>');

    // Wrap in paragraphs if we have content
    if (!processedText.includes('<p>') && !processedText.includes('</p>')) {
        processedText = `<p>${processedText}</p>`;
    }

    return processedText;
}

// Export a default for convenience
export default {
    parseMarkdown,
};

console.log('[Parser] Parser utilities loaded');
