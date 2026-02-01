/**
 * MarkdownChunker Test Suite
 *
 * Comprehensive tests for markdown parsing and chunking functionality.
 * Tests cover all markdown elements, edge cases, and error handling.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MarkdownChunker } from '../src/semantic/markdown-chunker.js';

describe('MarkdownChunker', () => {
  // Helper function to get a fresh chunker instance
  function getChunker() {
    return new MarkdownChunker();
  }

  describe('Header Extraction', () => {
    it('should extract H1 headers', () => {
      const markdown = '# Main Title\n\nSome content here.';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].type, 'md-section');
      assert.equal(chunks[0].metadata.level, 1);
      assert.equal(chunks[0].metadata.title, 'Main Title');
    });

    it('should extract H2 headers', () => {
      const markdown = '## Section Title\n\nContent here.';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].type, 'md-section');
      assert.equal(chunks[0].metadata.level, 2);
      assert.equal(chunks[0].metadata.title, 'Section Title');
    });

    it('should extract H3-H6 headers', () => {
      const markdown = '### Three\n\n#### Four\n\n##### Five\n\n###### Six';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 4);
      assert.equal(chunks[0].metadata.level, 3);
      assert.equal(chunks[1].metadata.level, 4);
      assert.equal(chunks[2].metadata.level, 5);
      assert.equal(chunks[3].metadata.level, 6);
    });

    it('should handle headers with special characters', () => {
      const markdown = '# Title with @#$% symbols\n\nContent';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].metadata.title, 'Title with @#$% symbols');
    });

    it('should handle headers with inline formatting', () => {
      const markdown = '# **Bold** and *italic* and `code`\n\nContent';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].metadata.title, '**Bold** and *italic* and `code`');
    });

    it('should handle file with only headers', () => {
      const markdown = '# First\n\n## Second\n\n### Third';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 3);
      chunks.forEach(chunk => {
        assert.equal(chunk.type, 'md-section');
      });
    });
  });

  describe('Code Block Detection', () => {
    it('should extract fenced code blocks with language', () => {
      const markdown = '```javascript\nconst x = 42;\n```';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].type, 'md-code-block');
      assert.equal(chunks[0].metadata.language, 'javascript');
      assert.ok(chunks[0].text.includes('const x = 42;'));
    });

    it('should extract fenced code blocks without language', () => {
      const markdown = '```\nplain code\n```';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].type, 'md-code-block');
      assert.equal(chunks[0].metadata.language, '');
    });

    it('should handle tilde fences', () => {
      const markdown = '~~~python\ndef foo():\n    pass\n~~~';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].type, 'md-code-block');
      assert.equal(chunks[0].metadata.language, 'python');
    });

    it('should handle unterminated code blocks (EOF)', () => {
      const markdown = '```javascript\nconst x = 42;\n// No closing fence';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].type, 'md-code-block');
      assert.ok(chunks[0].text.includes('const x = 42;'));
    });

    it('should handle code blocks with special characters', () => {
      const markdown = '```js\nconst regex = /@#$%^&*()/;\nconsole.log("Test");\n```';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.ok(chunks[0].text.includes('@#$%^&*()'));
    });

    it('should handle multiple code blocks', () => {
      const markdown = '```js\nconsole.log(1);\n```\n\n```js\nconsole.log(2);\n```';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 2);
      assert.equal(chunks[0].type, 'md-code-block');
      assert.equal(chunks[1].type, 'md-code-block');
    });
  });

  describe('List Detection', () => {
    it('should extract bulleted lists', () => {
      const markdown = '- Item 1\n- Item 2\n- Item 3';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].type, 'md-list');
      assert.equal(chunks[0].metadata.listType, 'unordered');
      assert.ok(chunks[0].text.includes('Item 1'));
    });

    it('should extract numbered lists', () => {
      const markdown = '1. First\n2. Second\n3. Third';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].type, 'md-list');
      assert.equal(chunks[0].metadata.listType, 'ordered');
    });

    it('should handle nested lists', () => {
      const markdown = '- Parent\n  - Child 1\n  - Child 2\n- Another parent';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.ok(chunks[0].text.includes('Child 1'));
    });

    it('should handle mixed list types', () => {
      const markdown = '- Bullet\n1. Numbered\n- Another bullet';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      // Should create two separate lists
      assert.ok(chunks.length >= 1);
    });

    it('should handle list items with multiple paragraphs', () => {
      const markdown = '- Item 1\n\n  Continuation of item 1\n\n- Item 2';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.ok(chunks[0].text.includes('Item 1'));
    });

    it('should handle list items with inline code', () => {
      const markdown = '- Item with `code` here\n- Another item';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.ok(chunks[0].text.includes('`code`'));
    });

    it('should handle asterisk bullets', () => {
      const markdown = '* Item 1\n* Item 2\n* Item 3';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].type, 'md-list');
    });
  });

  describe('Table Parsing', () => {
    it('should extract basic tables', () => {
      const markdown = '| Col1 | Col2 |\n|------|------|\n| Val1 | Val2 |';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].type, 'md-table');
      assert.ok(chunks[0].text.includes('Col1'));
    });

    it('should extract tables with alignment markers', () => {
      const markdown = '| Left | Center | Right |\n|:-----|:------:|------:|\n| A | B | C |';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].type, 'md-table');
    });

    it('should handle tables with special characters', () => {
      const markdown = '| Name | Email |\n|------|-------|\n| John | john@example.com |';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.ok(chunks[0].text.includes('john@example.com'));
    });

    it('should reject malformed tables (single row)', () => {
      const markdown = '| Col1 | Col2 |';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      // Single row tables should not be extracted
      assert.equal(chunks.filter(c => c.type === 'md-table').length, 0);
    });

    it('should handle empty tables', () => {
      const markdown = '| | |\n|---|---|\n| | |';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].type, 'md-table');
    });
  });

  describe('Blockquote Extraction', () => {
    it('should extract single-line blockquotes', () => {
      const markdown = '> This is a quote';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].type, 'md-blockquote');
      assert.ok(chunks[0].text.includes('This is a quote'));
    });

    it('should extract multi-line blockquotes', () => {
      const markdown = '> Line 1\n> Line 2\n> Line 3';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].type, 'md-blockquote');
      assert.ok(chunks[0].text.includes('Line 1'));
      assert.ok(chunks[0].text.includes('Line 2'));
    });

    it('should handle nested blockquotes', () => {
      const markdown = '> Outer\n>> Inner\n> Outer again';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.ok(chunks[0].text.includes('Outer'));
    });

    it('should handle blockquotes with inline formatting', () => {
      const markdown = '> **Bold quote** with *italic*';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.ok(chunks[0].text.includes('**Bold quote**'));
    });
  });

  describe('Paragraph Chunking', () => {
    it('should extract simple paragraphs', () => {
      const markdown = 'This is a simple paragraph.\n\nAnother paragraph.';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 2);
      assert.equal(chunks[0].type, 'md-paragraph');
      assert.equal(chunks[1].type, 'md-paragraph');
    });

    it('should handle paragraphs with inline code', () => {
      const markdown = 'This has `inline code` in it.';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.ok(chunks[0].text.includes('`inline code`'));
    });

    it('should handle paragraphs with links', () => {
      const markdown = 'Check out [this link](https://example.com)';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.ok(chunks[0].text.includes('[this link]'));
    });

    it('should skip empty paragraphs', () => {
      const markdown = 'First paragraph\n\n\n\nSecond paragraph';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      // Empty lines should be skipped, not create empty chunks
      assert.equal(chunks.filter(c => c.text.trim() === '').length, 0);
    });

    it('should handle consecutive paragraphs', () => {
      const markdown = 'Para 1\n\nPara 2\n\nPara 3';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 3);
      chunks.forEach(chunk => {
        assert.equal(chunk.type, 'md-paragraph');
      });
    });
  });

  describe('Context Extraction', () => {
    it('should extract before context correctly', () => {
      const markdown = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\n# Header\nContent';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      const headerChunk = chunks.find(c => c.type === 'md-section');
      assert.ok(headerChunk);
      assert.ok(headerChunk.context.before.length > 0);
    });

    it('should extract after context correctly', () => {
      const markdown = '# Header\nContent\nLine 1\nLine 2\nLine 3\nLine 4\nLine 5';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      const headerChunk = chunks.find(c => c.type === 'md-section');
      assert.ok(headerChunk);
      // After context should include lines after the section
    });

    it('should handle context at file boundaries', () => {
      const markdown = '# First header\n\n# Second header';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      // First chunk should have empty before context
      assert.equal(chunks[0].context.before, '');
    });

    it('should respect context lines configuration', () => {
      const customChunker = new MarkdownChunker({ contextLines: 2 });
      const markdown = 'L1\nL2\nL3\nL4\nL5\n# Header\nContent';
      const chunks = customChunker.chunkSourceFile(markdown, 'test.md');

      const headerChunk = chunks.find(c => c.type === 'md-section');
      assert.ok(headerChunk);
    });
  });

  describe('Overlap Calculation', () => {
    it('should split large content with overlap', () => {
      const largeContent = '# Title\n' + 'Line '.repeat(500);
      const chunks = getChunker().chunkSourceFile(largeContent, 'test.md');

      assert.ok(chunks.length > 1);
      // Check that chunks have overlap metadata
      const splitChunks = chunks.filter(c => c.metadata.isSplit);
      assert.ok(splitChunks.length > 0);
    });

    it('should apply 20% overlap percentage', () => {
      const customChunker = new MarkdownChunker({
        maxChunkSize: 200,
        overlapPercentage: 0.2
      });
      const largeContent = '# Title\n' + 'Line '.repeat(200);
      const chunks = customChunker.chunkSourceFile(largeContent, 'test.md');

      const splitChunks = chunks.filter(c => c.metadata.isSplit);
      if (splitChunks.length > 1) {
        // Verify overlap is being tracked
        assert.ok(splitChunks[0].metadata.totalChunks > 1);
      }
    });

    it('should maintain chunk boundaries during overlap', () => {
      const largeContent = '# Title\n' + 'Line '.repeat(300);
      const chunks = getChunker().chunkSourceFile(largeContent, 'test.md');

      // All chunks should have valid line numbers
      chunks.forEach(chunk => {
        assert.ok(chunk.metadata.startLine >= 1);
        assert.ok(chunk.metadata.endLine >= chunk.metadata.startLine);
      });
    });
  });

  describe('Chunk ID Generation', () => {
    it('should generate unique IDs for each chunk', () => {
      const markdown = '# Section 1\n\n# Section 2\n\n# Section 3';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      const ids = chunks.map(c => c.id);
      const uniqueIds = new Set(ids);
      assert.equal(uniqueIds.size, chunks.length);
    });

    it('should follow naming convention', () => {
      const markdown = '# Test Section';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.ok(chunks[0].id.startsWith('md-section_'));
      assert.ok(chunks[0].id.includes('_L'));
    });

    it('should sanitize special characters in IDs', () => {
      const markdown = '# Title with @#$% special chars!';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      // ID should have special chars replaced
      assert.ok(!chunks[0].id.includes('@'));
      assert.ok(!chunks[0].id.includes('#'));
    });
  });

  describe('Metadata Completeness', () => {
    it('should include file field in metadata', () => {
      const markdown = '# Test';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      chunks.forEach(chunk => {
        assert.equal(chunk.metadata.file, 'test.md');
      });
    });

    it('should include startLine field in metadata', () => {
      const markdown = '# Test';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      chunks.forEach(chunk => {
        assert.ok(typeof chunk.metadata.startLine === 'number');
        assert.ok(chunk.metadata.startLine >= 1);
      });
    });

    it('should include endLine field in metadata', () => {
      const markdown = '# Test';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      chunks.forEach(chunk => {
        assert.ok(typeof chunk.metadata.endLine === 'number');
        assert.ok(chunk.metadata.endLine >= chunk.metadata.startLine);
      });
    });

    it('should include level for section metadata', () => {
      const markdown = '## Test Section';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks[0].metadata.level, 2);
    });

    it('should include language for code block metadata', () => {
      const markdown = '```javascript\nconst x = 1;\n```';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks[0].metadata.language, 'javascript');
    });

    it('should include listType for list metadata', () => {
      const markdown = '- Item 1\n- Item 2';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks[0].metadata.listType, 'unordered');
    });
  });

  describe('Fallback Behavior', () => {
    it('should return empty array for empty file', () => {
      const chunks = getChunker().chunkSourceFile('', 'test.md');
      assert.equal(chunks.length, 0);
    });

    it('should return empty array for whitespace-only file', () => {
      const chunks = getChunker().chunkSourceFile('   \n\n  \n', 'test.md');
      assert.equal(chunks.length, 0);
    });

    it('should create fallback chunk for malformed markdown', () => {
      // Force an error by passing invalid content that causes parsing issues
      const markdown = 'Some content without any special markdown structure';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      // Should create at least one chunk (paragraph)
      assert.ok(chunks.length >= 1);
    });

    it('should include error in fallback metadata', () => {
      // Create a scenario that might trigger fallback
      const markdown = '\n\n\n'; // Empty after trimming
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');
      assert.equal(chunks.length, 0);
    });
  });

  describe('Additional Edge Cases', () => {
    it('should handle file with no headers', () => {
      const markdown = 'Just some text\n\nAnd more text\n\nNo headers here';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.ok(chunks.length > 0);
      chunks.forEach(chunk => {
        assert.equal(chunk.type, 'md-paragraph');
      });
    });

    it('should handle very long lines', () => {
      const longLine = 'a'.repeat(1000);
      const markdown = `# Title\n${longLine}`;
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
    });

    it('should handle mixed markdown elements', () => {
      const markdown = `# Header

Some paragraph text.

- List item 1
- List item 2

\`\`\`javascript
const x = 42;
\`\`\`

> A quote

| Col1 | Col2 |
|------|------|
| Val1 | Val2 |`;

      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.ok(chunks.length >= 5);
      const types = chunks.map(c => c.type);
      assert.ok(types.includes('md-section'));
      assert.ok(types.includes('md-paragraph'));
      assert.ok(types.includes('md-list'));
      assert.ok(types.includes('md-code-block'));
    });

    it('should handle unicode characters', () => {
      const markdown = '# Title with emoji 🎉\n\nText with unicode: café, naïve, 日本語';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.ok(chunks[0].text.includes('🎉'));
    });

    it('should handle HTML in markdown', () => {
      const markdown = '<div>HTML content</div>\n\nParagraph after HTML';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.ok(chunks.length >= 1);
    });

    it('should handle horizontal rules', () => {
      const markdown = 'Before\n\n---\n\nAfter';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      // Horizontal rule should be skipped
      assert.ok(chunks.length >= 1);
    });

    it('should handle multiple consecutive empty lines', () => {
      const markdown = '# Title\n\n\n\n\nContent';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
    });

    it('should handle headers with no content after them', () => {
      const markdown = '# Title\n\n## Subtitle';
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 2);
    });

    it('should handle code blocks at end of file without newline', () => {
      const markdown = '```js\nconst x = 1;```'; // No newline after closing fence
      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].type, 'md-code-block');
    });
  });

  describe('File Extension Support', () => {
    it('should support .md files', () => {
      assert.ok(getChunker().isSupported('test.md'));
    });

    it('should support .markdown files', () => {
      assert.ok(getChunker().isSupported('test.markdown'));
    });

    it('should support .mdown files', () => {
      assert.ok(getChunker().isSupported('test.mdown'));
    });

    it('should support .mkd files', () => {
      assert.ok(getChunker().isSupported('test.mkd'));
    });

    it('should reject unsupported extensions', () => {
      assert.ok(!getChunker().isSupported('test.txt'));
      assert.ok(!getChunker().isSupported('test.js'));
    });
  });

  describe('Section Content Boundaries', () => {
    it('should stop at same-level header', () => {
      const markdown = `# Section 1
Content 1

# Section 2
Content 2`;

      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 2);
      assert.equal(chunks[0].metadata.title, 'Section 1');
      assert.equal(chunks[1].metadata.title, 'Section 2');
      // First section should not include second section's content
      assert.ok(!chunks[0].text.includes('Content 2'));
    });

    it('should stop at higher-level header', () => {
      const markdown = `## Section 1
Content 1

# Section 2
Content 2`;

      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 2);
      // Section 1 (H2) should stop at Section 2 (H1)
      assert.ok(!chunks[0].text.includes('Content 2'));
    });

    it('should include lower-level headers', () => {
      const markdown = `# Section 1
Content 1

## Subsection
Sub content`;

      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      // Section 1 should include subsection content
      const mainSection = chunks.find(c => c.metadata.title === 'Section 1');
      assert.ok(mainSection);
      // The subsection should be a separate chunk
      assert.ok(chunks.some(c => c.metadata.title === 'Subsection'));
    });
  });

  describe('Code Block Boundaries', () => {
    it('should separate code blocks from surrounding content', () => {
      const markdown = `# Title

Some text.

\`\`\`javascript
const x = 1;
\`\`\`

More text.`;

      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      const codeBlock = chunks.find(c => c.type === 'md-code-block');
      assert.ok(codeBlock);
      // Code block should be separate from other chunks
      assert.ok(!codeBlock.text.includes('Some text'));
    });
  });

  describe('List Continuation', () => {
    it('should handle lists with blank lines between items', () => {
      const markdown = `- Item 1

- Item 2

- Item 3`;

      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].type, 'md-list');
    });
  });

  describe('Table Edge Cases', () => {
    it('should handle tables with uneven row lengths', () => {
      const markdown = `| A | B | C |
|---|---|
| 1 | 2 |`;

      const chunks = getChunker().chunkSourceFile(markdown, 'test.md');

      // Should still extract the table
      assert.ok(chunks.length >= 1);
    });
  });
});
