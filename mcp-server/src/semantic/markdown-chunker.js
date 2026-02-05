/**
 * Markdown Chunker
 *
 * Parses markdown files into semantic chunks for better searchability.
 * Uses line-based regex parsing (no dependencies) to identify:
 * - Headers (H1-H6)
 * - Code blocks (fenced)
 * - Lists (bulleted/numbered)
 * - Blockquotes
 * - Tables
 * - Paragraphs
 *
 * Design principles:
 * - Header-based boundaries (natural semantic sections)
 * - 20% overlap between sections (matches CodeChunker)
 * - Fallback to single chunk if parsing fails
 * - Line-based parsing (simpler than full AST)
 */

/**
 * Supported file extensions
 */
const SUPPORTED_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.mkd']);

/**
 * Maximum chunk size (in characters)
 */
const MAX_CHUNK_SIZE = 4000;

/**
 * Minimum chunk size (in characters)
 */
const MIN_CHUNK_SIZE = 200;

/**
 * Context window size (lines before/after a chunk)
 */
const CONTEXT_LINES = 5;

/**
 * Chunk overlap percentage (20% overlap at section boundaries)
 */
const OVERLAP_PERCENTAGE = 0.2;

/**
 * Markdown regex patterns
 */
const PATTERNS = {
  // Headers: # ## ### etc.
  header: /^(#{1,6})\s+(.+)$/,
  // Fenced code blocks: ``` or ~~~
  codeBlockFence: /^(`{3,}|~{3,})(\w*)$/,
  // Horizontal rule: ---, ___, ***
  horizontalRule: /^[-*_]{3,}$/,
  // Unordered list: - or * followed by space
  unorderedList: /^[\s\t]*([-*])\s+/,
  // Ordered list: 1. 1) 1)
  orderedList: /^[\s\t]*(\d+[.)])\s+/,
  // Blockquote: >
  blockquote: /^>\s*/,
  // Table: | col | col | (requires at least 2 non-adjacent pipes)
  table: /^\|(?!\|).+\|(?!\|).*$/,
  // Empty line
  empty: /^\s*$/,
};

/**
 * Markdown Chunker class
 */
export class MarkdownChunker {
  constructor(options = {}) {
    this.maxChunkSize = options.maxChunkSize || MAX_CHUNK_SIZE;
    this.minChunkSize = options.minChunkSize || MIN_CHUNK_SIZE;
    this.contextLines = options.contextLines || CONTEXT_LINES;
    this.overlapPercentage = options.overlapPercentage || OVERLAP_PERCENTAGE;
  }

  /**
   * Check if a file is supported
   */
  isSupported(filePath) {
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    return SUPPORTED_EXTENSIONS.has(ext);
  }

  /**
   * Chunk a markdown source file
   */
  chunkSourceFile(sourceCode, filePath) {
    const chunks = [];

    try {
      // Early return for empty files
      if (!sourceCode || sourceCode.trim().length === 0) {
        console.warn(`[MarkdownChunker] Empty file: ${filePath}`);
        return chunks; // Return empty array, no chunks for empty files
      }

      // Split into lines for parsing
      const lines = sourceCode.split('\n');

      // Parse markdown structure
      const structure = this._parseMarkdownStructure(lines, filePath);

      // Create chunks from structure
      for (const element of structure) {
        const elementChunks = this._createChunksFromElement(element, lines, filePath);
        chunks.push(...elementChunks);
      }

      // If no chunks were created, create fallback
      if (chunks.length === 0) {
        chunks.push(this._createFallbackChunk(sourceCode, filePath, 'No semantic chunks found'));
      }

    } catch (error) {
      console.error(`[MarkdownChunker] Failed to parse ${filePath}:`, error.message);
      chunks.push(this._createFallbackChunk(sourceCode, filePath, error.message));
    }

    return chunks;
  }

  /**
   * Parse markdown into structured elements
   * Returns array of elements with type, content, line range
   */
  _parseMarkdownStructure(lines, filePath) {
    const elements = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const lineNum = i + 1; // 1-based line numbers

      // Skip empty lines
      if (PATTERNS.empty.test(line)) {
        i++;
        continue;
      }

      // Check for header
      const headerMatch = line.match(PATTERNS.header);
      if (headerMatch) {
        const level = headerMatch[1].length;
        const title = headerMatch[2].trim();
        const { content, endLine } = this._extractSectionContent(lines, i);

        // If the "section" has no body content beyond the header line, skip it.
        // Header-only chunks tend to dominate semantic search without adding value.
        const contentLines = content.split('\n');
        const hasBodyContent = contentLines.slice(1).some(l => l.trim().length > 0);
        if (!hasBodyContent) {
          i = endLine;
          continue;
        }

        elements.push({
          type: 'md-section',
          level,
          title,
          content,
          startLine: lineNum,
          endLine,
        });
        i = endLine;
        continue;
      }

      // Check for fenced code block
      const fenceMatch = line.match(PATTERNS.codeBlockFence);
      if (fenceMatch) {
        const fence = fenceMatch[1];
        const lang = fenceMatch[2] || '';
        const { content, endLine } = this._extractCodeBlock(lines, i, fence);
        elements.push({
          type: 'md-code-block',
          lang,
          content,
          startLine: lineNum,
          endLine,
        });
        i = endLine;
        continue;
      }

      // Check for blockquote
      if (PATTERNS.blockquote.test(line)) {
        const { content, endLine } = this._extractBlockquote(lines, i);
        elements.push({
          type: 'md-blockquote',
          content,
          startLine: lineNum,
          endLine,
        });
        i = endLine;
        continue;
      }

      // Check for list
      if (PATTERNS.unorderedList.test(line) || PATTERNS.orderedList.test(line)) {
        const { content, endLine, listType } = this._extractList(lines, i);
        elements.push({
          type: 'md-list',
          listType,
          content,
          startLine: lineNum,
          endLine,
        });
        i = endLine;
        continue;
      }

      // Check for table
      if (PATTERNS.table.test(line)) {
        const { content, endLine } = this._extractTable(lines, i);
        if (content) {
          elements.push({
            type: 'md-table',
            content,
            startLine: lineNum,
            endLine,
          });
          i = endLine;
          continue;
        }
        // Not a valid table (e.g., a single row without a separator). Treat as paragraph to
        // ensure forward progress and avoid infinite loops on lines that match table patterns.
        elements.push({
          type: 'md-paragraph',
          content: line,
          startLine: lineNum,
          endLine: lineNum,
        });
        i = endLine;
        continue;
      }

      // Check for horizontal rule
      if (PATTERNS.horizontalRule.test(line)) {
        i++;
        continue;
      }

      // Treat as paragraph content
      const { content, endLine } = this._extractParagraph(lines, i);
      if (content.trim().length > 0) {
        elements.push({
          type: 'md-paragraph',
          content,
          startLine: lineNum,
          endLine,
        });
      }
      i = endLine;
    }

    return elements;
  }

  /**
   * Extract section content under a header
   * Stops at next header of any level, or EOF
   * Each header (H1-H6) gets its own chunk for better searchability
   */
  _extractSectionContent(lines, startIdx) {
    const startLine = startIdx;
    const headerLine = lines[startLine];
    const headerMatch = headerLine.match(PATTERNS.header);
    const level = headerMatch ? headerMatch[1].length : 1;

    const contentLines = [headerLine];
    let i = startLine + 1;

    while (i < lines.length) {
      const line = lines[i];

      // Stop at next header of any level (each header gets its own chunk)
      const nextHeaderMatch = line.match(PATTERNS.header);
      if (nextHeaderMatch) {
        break;
      }

      // Stop at code blocks (they should be separate chunks)
      if (PATTERNS.codeBlockFence.test(line)) {
        break;
      }

      // Stop at other block-level elements that should be separate chunks
      if (
        PATTERNS.unorderedList.test(line) ||
        PATTERNS.orderedList.test(line) ||
        PATTERNS.blockquote.test(line) ||
        PATTERNS.table.test(line) ||
        PATTERNS.horizontalRule.test(line)
      ) {
        break;
      }

      contentLines.push(line);
      i++;
    }

    return {
      content: contentLines.join('\n'),
      endLine: i,
    };
  }

  /**
   * Extract fenced code block content
   */
  _extractCodeBlock(lines, startIdx, fence) {
    const contentLines = [lines[startIdx]];
    let i = startIdx + 1;

    while (i < lines.length) {
      const line = lines[i];
      contentLines.push(line);

      // Check for closing fence
      if (line.startsWith(fence)) {
        i++;
        break;
      }

      i++;
    }

    // If we reached EOF without closing fence, that's OK
    // The code block is unterminated but we still return it

    return {
      content: contentLines.join('\n'),
      endLine: i, // Will be lines.length if no closing fence
    };
  }

  /**
   * Extract blockquote content
   */
  _extractBlockquote(lines, startIdx) {
    const contentLines = [];
    let i = startIdx;

    while (i < lines.length) {
      const line = lines[i];

      // Stop if not a blockquote line (or empty line)
      if (!PATTERNS.blockquote.test(line) && !PATTERNS.empty.test(line)) {
        break;
      }

      // Include empty lines within blockquote
      if (PATTERNS.empty.test(line)) {
        // Check if next line is still blockquote
        if (i + 1 < lines.length && PATTERNS.blockquote.test(lines[i + 1])) {
          contentLines.push(line);
          i++;
          continue;
        } else {
          break;
        }
      }

      contentLines.push(line);
      i++;
    }

    return {
      content: contentLines.join('\n'),
      endLine: i,
    };
  }

  /**
   * Extract list content
   */
  _extractList(lines, startIdx) {
    const contentLines = [];
    let i = startIdx;
    const listType = PATTERNS.unorderedList.test(lines[startIdx]) ? 'unordered' : 'ordered';

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Stop at empty line (end of list)
      if (PATTERNS.empty.test(line)) {
        // Check if next line is continuation of list
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          if (PATTERNS.unorderedList.test(nextLine) || PATTERNS.orderedList.test(nextLine)) {
            // Continuation after blank line
            contentLines.push(line);
            i++;
            continue;
          }
          // Multi-paragraph list items: allow an indented continuation after a blank line.
          if (/^[\s\t]{2,}/.test(nextLine)) {
            contentLines.push(line);
            i++;
            continue;
          }
        }
        break;
      }

      // Stop if not a list item
      if (!PATTERNS.unorderedList.test(line) && !PATTERNS.orderedList.test(line)) {
        // Check for nested list items (indented)
        if (/^[\s\t]{2,}/.test(line)) {
          contentLines.push(line);
          i++;
          continue;
        }
        break;
      }

      contentLines.push(line);
      i++;
    }

    return {
      content: contentLines.join('\n'),
      endLine: i,
      listType,
    };
  }

  /**
   * Extract table content
   */
  _extractTable(lines, startIdx) {
    const contentLines = [];
    let i = startIdx;

    while (i < lines.length) {
      const line = lines[i];

      // Stop at empty line
      if (PATTERNS.empty.test(line)) {
        break;
      }

      // Stop if not a table line
      if (!PATTERNS.table.test(line)) {
        break;
      }

      contentLines.push(line);
      i++;
    }

    // Must have at least 2 lines (header + separator or row)
    if (contentLines.length < 2) {
      return { content: null, endLine: startIdx + 1 };
    }

    return {
      content: contentLines.join('\n'),
      endLine: i,
    };
  }

  /**
   * Extract paragraph content
   * Collects non-empty lines until hitting a special markdown element
   */
  _extractParagraph(lines, startIdx) {
    const contentLines = [];
    let i = startIdx;

    while (i < lines.length) {
      const line = lines[i];

      // Stop at empty line
      if (PATTERNS.empty.test(line)) {
        break;
      }

      // Stop at special markdown elements
      if (
        PATTERNS.header.test(line) ||
        PATTERNS.codeBlockFence.test(line) ||
        PATTERNS.blockquote.test(line) ||
        PATTERNS.unorderedList.test(line) ||
        PATTERNS.orderedList.test(line) ||
        PATTERNS.table.test(line) ||
        PATTERNS.horizontalRule.test(line)
      ) {
        break;
      }

      contentLines.push(line);
      i++;
    }

    return {
      content: contentLines.join('\n'),
      endLine: i,
    };
  }

  /**
   * Create chunks from a structured element
   * May split large elements into multiple chunks
   */
  _createChunksFromElement(element, lines, filePath) {
    const chunks = [];
    const { type, content, startLine, endLine } = element;

    // Create base chunk
    const context = this._extractContext(lines, startLine, endLine);

    // Extract metadata specific to element type
    const metadata = {
      file: filePath,
      startLine,
      endLine,
      ...this._extractElementMetadata(element),
    };

    // Check if content needs splitting
    if (content.length > this.maxChunkSize) {
      const splitChunks = this._splitLargeContent(element, lines, filePath);
      chunks.push(...splitChunks);
    } else {
      chunks.push({
        id: this._generateChunkId(type, this._getElementName(element), startLine),
        type,
        name: this._getElementName(element),
        text: content,
        context,
        metadata,
      });
    }

    return chunks;
  }

  /**
   * Split large content into multiple chunks with overlap
   */
  _splitLargeContent(element, lines, filePath) {
    const chunks = [];
    const { type, content, startLine } = element;
    const contentLines = content.split('\n');

    // Calculate chunk size in lines (with overlap)
    const totalLines = contentLines.length;
    if (totalLines === 0) {
      return chunks;
    }

    // Convert character-based limits to an approximate line count using average chars/line.
    // This avoids unit mismatches (chars vs lines) and prevents infinite-loop overlap behavior.
    const avgCharsPerLine = Math.max(1, content.length / totalLines);
    const targetChunkLines = Math.max(1, Math.floor(this.maxChunkSize / avgCharsPerLine));
    const minChunkLines = Math.max(1, Math.floor(this.minChunkSize / avgCharsPerLine));

    let chunkSize = Math.max(minChunkLines, targetChunkLines);
    chunkSize = Math.min(chunkSize, totalLines);

    // Overlap is a percentage of the *chunk size*, not the entire document.
    let overlapLines = Math.max(0, Math.floor(chunkSize * this.overlapPercentage));
    overlapLines = Math.min(overlapLines, Math.max(0, chunkSize - 1));

    const stepLines = Math.max(1, chunkSize - overlapLines);
    const totalChunks =
      totalLines <= chunkSize ? 1 : Math.ceil((totalLines - chunkSize) / stepLines) + 1;

    let chunkStart = 0;
    let chunkIndex = 0;

    while (chunkStart < totalLines) {
      const chunkEnd = Math.min(chunkStart + chunkSize, totalLines);
      const chunkLines = contentLines.slice(chunkStart, chunkEnd);
      const chunkText = chunkLines.join('\n');
      const chunkStartLine = startLine + chunkStart;
      const chunkEndLine = startLine + chunkEnd - 1;

      // Move to next chunk with overlap
      // CRITICAL FIX: Ensure chunkStart always advances to prevent infinite loop
      // When overlapLines >= (chunkEnd - chunkStart), the loop would never advance
      const actualOverlap = Math.min(overlapLines, chunkEnd - chunkStart - 1);
      const nextChunkStart = chunkEnd - actualOverlap;

      // Skip empty trailing chunks (e.g. when a section ends with blank lines)
      if (chunkText.trim().length === 0) {
        chunkStart = nextChunkStart;
        continue;
      }

      // Extract context for this chunk
      const context = this._extractContext(lines, chunkStartLine, chunkEndLine);

      chunks.push({
        id: this._generateChunkId(
          type,
          `${this._getElementName(element)}_part${chunkIndex}`,
          chunkStartLine
        ),
        type,
        name: `${this._getElementName(element)} [part ${chunkIndex + 1}]`,
        text: chunkText,
        context,
        metadata: {
          file: filePath,
          startLine: chunkStartLine,
          endLine: chunkEndLine,
          ...this._extractElementMetadata(element),
          isSplit: true,
          chunkIndex,
          totalChunks,
        },
      });

      chunkIndex++;

      if (chunkEnd >= totalLines) {
        break;
      }

      // Move to next chunk with overlap (ensured to make forward progress via stepLines)
      chunkStart += stepLines;
    }

    return chunks;
  }

  /**
   * Extract element-specific metadata
   */
  _extractElementMetadata(element) {
    switch (element.type) {
      case 'md-section':
        return {
          level: element.level,
          title: element.title,
        };
      case 'md-code-block':
        return {
          language: element.lang,
        };
      case 'md-list':
        return {
          listType: element.listType,
        };
      default:
        return {};
    }
  }

  /**
   * Get a human-readable name for an element
   */
  _getElementName(element) {
    switch (element.type) {
      case 'md-section':
        return element.title || 'Section';
      case 'md-code-block':
        return element.lang ? `Code (${element.lang})` : 'Code block';
      case 'md-list':
        return element.listType === 'ordered' ? 'Numbered list' : 'Bullet list';
      case 'md-blockquote':
        return 'Quote';
      case 'md-table':
        return 'Table';
      case 'md-paragraph': {
        // Use first few words as name
        const firstLine = element.content.split('\n')[0];
        return firstLine.substring(0, 40) + (firstLine.length > 40 ? '...' : '');
      }
      default:
        return 'Content';
    }
  }

  /**
   * Extract context (before/after lines)
   */
  _extractContext(lines, startLine, endLine) {
    const beforeStart = Math.max(0, startLine - this.contextLines - 1);
    const beforeLines = lines.slice(beforeStart, startLine - 1);

    const afterEnd = Math.min(lines.length, endLine + this.contextLines);
    const afterLines = lines.slice(endLine, afterEnd);

    return {
      before: beforeLines.join('\n').trim(),
      after: afterLines.join('\n').trim(),
    };
  }

  /**
   * Create a fallback chunk when parsing fails
   */
  _createFallbackChunk(sourceCode, filePath, error) {
    const lines = sourceCode.split('\n');
    return {
      id: this._generateChunkId('md-document', filePath, 1),
      type: 'md-document',
      name: filePath.split('/').pop(),
      text: sourceCode.substring(0, this.maxChunkSize),
      context: {
        before: '',
        after: sourceCode.length > this.maxChunkSize ? '... (truncated)' : '',
      },
      metadata: {
        file: filePath,
        startLine: 1,
        endLine: lines.length,
        parseError: error,
        truncated: sourceCode.length > this.maxChunkSize,
      },
    };
  }

  /**
   * Generate a unique chunk ID
   */
  _generateChunkId(type, name, line) {
    const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${type}_${sanitizedName}_L${line}`;
  }

  /**
   * Sanitize a file path for use in chunk IDs
   */
  _sanitizeFilePath(filePath) {
    return filePath
      .replace(/[^a-zA-Z0-9_/-]/g, '_') // Replace problematic chars except / and -
      .replace(/\//g, '_'); // Normalize path separators
  }

  /**
   * Load and chunk a file
   */
  async chunkFile(filePath, projectRoot) {
    const { readFile } = await import('fs/promises');
    const sourceCode = await readFile(filePath, 'utf-8');
    const relativePath = filePath.replace(projectRoot + '/', '');

    const chunks = this.chunkSourceFile(sourceCode, relativePath);

    // Sanitize path for chunk IDs
    const sanitizedPath = this._sanitizeFilePath(relativePath);

    // Update file path in metadata
    for (const chunk of chunks) {
      chunk.metadata.file = relativePath;
      chunk.id = `${sanitizedPath}_${chunk.id}`;
    }

    return chunks;
  }
}

export default MarkdownChunker;
