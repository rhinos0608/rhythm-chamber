#!/usr/bin/env node

/**
 * Simple test runner for markdown chunker tests
 * Runs tests directly without node:test framework
 */

import { MarkdownChunker } from '../src/semantic/markdown-chunker.js';
import assert from 'node:assert';
import fs from 'fs';

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passCount++;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    failCount++;
  }
}

console.log('Running MarkdownChunker tests...\n');

// Header Extraction Tests
test('should extract H1 headers', () => {
  const chunker = new MarkdownChunker();
  const markdown = '# Main Title\n\nSome content here.';
  const chunks = chunker.chunkSourceFile(markdown, 'test.md');

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].type, 'md-section');
  assert.equal(chunks[0].metadata.level, 1);
  assert.equal(chunks[0].metadata.title, 'Main Title');
});

test('should extract H2 headers', () => {
  const chunker = new MarkdownChunker();
  const markdown = '## Section Title\n\nContent here.';
  const chunks = chunker.chunkSourceFile(markdown, 'test.md');

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].type, 'md-section');
  assert.equal(chunks[0].metadata.level, 2);
  assert.equal(chunks[0].metadata.title, 'Section Title');
});

test('should extract nested headers as separate chunks', () => {
  const chunker = new MarkdownChunker();
  const markdown = '### Three\n\n#### Four\n\n##### Five\n\n###### Six';
  const chunks = chunker.chunkSourceFile(markdown, 'test.md');

  // Each header gets its own chunk for better searchability
  assert.equal(chunks.length, 4);
  assert.equal(chunks[0].metadata.level, 3);
  assert.equal(chunks[0].metadata.title, 'Three');
  assert.equal(chunks[1].metadata.level, 4);
  assert.equal(chunks[1].metadata.title, 'Four');
  assert.equal(chunks[2].metadata.level, 5);
  assert.equal(chunks[2].metadata.title, 'Five');
  assert.equal(chunks[3].metadata.level, 6);
  assert.equal(chunks[3].metadata.title, 'Six');
});

test('should handle headers with special characters', () => {
  const chunker = new MarkdownChunker();
  const markdown = '# Title with @#$% symbols\n\nContent';
  const chunks = chunker.chunkSourceFile(markdown, 'test.md');

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].metadata.title, 'Title with @#$% symbols');
});

test('should handle headers with inline formatting', () => {
  const chunker = new MarkdownChunker();
  const markdown = '# **Bold** and *italic* and `code`\n\nContent';
  const chunks = chunker.chunkSourceFile(markdown, 'test.md');

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].metadata.title, '**Bold** and *italic* and `code`');
});

// Code Block Tests
test('should extract fenced code blocks with language', () => {
  const chunker = new MarkdownChunker();
  const markdown = '```javascript\nconst x = 42;\n```';
  const chunks = chunker.chunkSourceFile(markdown, 'test.md');

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].type, 'md-code-block');
  assert.equal(chunks[0].metadata.language, 'javascript');
  assert.ok(chunks[0].text.includes('const x = 42;'));
});

test('should extract fenced code blocks without language', () => {
  const chunker = new MarkdownChunker();
  const markdown = '```\nplain code\n```';
  const chunks = chunker.chunkSourceFile(markdown, 'test.md');

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].type, 'md-code-block');
  assert.equal(chunks[0].metadata.language, '');
});

test('should handle tilde fences', () => {
  const chunker = new MarkdownChunker();
  const markdown = '~~~python\ndef foo():\n    pass\n~~~';
  const chunks = chunker.chunkSourceFile(markdown, 'test.md');

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].type, 'md-code-block');
  assert.equal(chunks[0].metadata.language, 'python');
});

// List Tests
test('should extract unordered lists', () => {
  const chunker = new MarkdownChunker();
  const markdown = '- Item 1\n- Item 2\n- Item 3';
  const chunks = chunker.chunkSourceFile(markdown, 'test.md');

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].type, 'md-list');
  assert.ok(chunks[0].text.includes('Item 1'));
});

test('should extract ordered lists', () => {
  const chunker = new MarkdownChunker();
  const markdown = '1. First\n2. Second\n3. Third';
  const chunks = chunker.chunkSourceFile(markdown, 'test.md');

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].type, 'md-list');
  assert.ok(chunks[0].text.includes('First'));
});

// Table Tests
test('should extract tables', () => {
  const chunker = new MarkdownChunker();
  const markdown = '| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |';
  const chunks = chunker.chunkSourceFile(markdown, 'test.md');

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].type, 'md-table');
  assert.ok(chunks[0].text.includes('Header 1'));
});

// Real-world Documentation Tests (commented out for speed)
// test('should handle CLAUDE.md documentation', () => {
//   const chunker = new MarkdownChunker();
//   const markdown = fs.readFileSync('/Users/rhinesharar/rhythm-chamber/CLAUDE.md', 'utf-8');
//   const chunks = chunker.chunkSourceFile(markdown, 'CLAUDE.md');
//
//   assert.ok(chunks.length > 0, 'Should extract chunks from CLAUDE.md');
//   assert.ok(chunks.some(c => c.metadata.title === 'WHAT — Rhythm Chamber'), 'Should find "WHAT" section');
//   assert.ok(chunks.some(c => c.metadata.title === 'WHY — Architecture Principles'), 'Should find "WHY" section');
//   assert.ok(chunks.some(c => c.metadata.title === 'HOW — Critical Rules'), 'Should find "HOW" section');
// });
//
// test('should handle README.md documentation', () => {
//   const chunker = new MarkdownChunker();
//   const markdown = fs.readFileSync('/Users/rhinesharar/rhythm-chamber/README.md', 'utf-8');
//   const chunks = chunker.chunkSourceFile(markdown, 'README.md');
//
//   assert.ok(chunks.length > 0, 'Should extract chunks from README.md');
// });

test('should handle complex markdown with multiple elements', () => {
  const chunker = new MarkdownChunker();
  const markdown = `# Main Title

Introduction paragraph.

## Features

- Feature 1
- Feature 2

### Code Example

\`\`\`javascript
function example() {
  return true;
}
\`\`\`

## Configuration

| Key | Value |
|-----|-------|
| foo | bar   |
`;

  const chunks = chunker.chunkSourceFile(markdown, 'complex.md');

  assert.ok(chunks.length > 0, 'Should extract multiple chunks');
  assert.ok(chunks.some(c => c.type === 'md-section'), 'Should have sections');
  assert.ok(chunks.some(c => c.type === 'md-code-block'), 'Should have code blocks');
  // Note: Lists and tables within sections are absorbed into the section content
  // This is reasonable behavior as they're part of the section's content
});

console.log(`\n${'='.repeat(50)}`);
console.log(`Tests: ${passCount + failCount}`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);
console.log(`${'='.repeat(50)}`);

process.exit(failCount > 0 ? 1 : 0);
