# Malformed Markdown Document

This document contains various edge cases and malformed markdown to test the indexer's robustness and fallback behavior.

## Unclosed Code Block

This paragraph is followed by an unclosed code block:

```javascript
function incomplete() {
  console.log("This code block never closes");

# This header is inside the unclosed code block context from the parser's perspective

## Another Header Inside Code Block

Even more content that should be treated as code

More indented content
  Even more indented
    And more

## Back to Normal (Sort Of)

The previous code block was never properly closed with ```. This section should hopefully be recovered by the indexer's fallback logic.

## Malformed Tables

This table has uneven columns:

| Header 1 | Header 2 | Header 3
|----------|---------
| Cell 1 | Cell 2
| Cell 3 | Cell 4 | Cell 5 | Extra Column

This table has missing pipes:

Header 1 | Header 2 | Header 3
---------|---------|--------
Cell 1   | Cell 2   | Cell 3
Cell 4   | Cell 5

## Empty Sections

### Header With No Content

### Another Empty Header Below

Some content here

#### Header With Just Whitespace Below


##### Yet Another Empty Header

## Invalid List Syntax

- Item 1
- Item 2
- Mixed indentation
   - Item with weird indent
  - Item with another indent
- Item 3

1. First item
2. Second item
3. Third item
    1. Nested but wrong
    2. Another nested
4. Fourth item

## Mixed Indentations

Paragraph with no indent.

  Paragraph with 2-space indent.

	Paragraph with tab indent.

    Paragraph with 4-space indent.

  Back to 2-space.

No indent again.

## Broken Links

[Link with no url]

[Link with incomplete url](https://example

[Link with weird brackets][missing-reference]

[Link with reference][ref1] but reference defined later in document

## Unclosed Emphasis

This is bold but never closes **bold text continues

This is italic but never closes *italic text continues

This is code but never closes `code continues here

## Escaping Issues

Not properly escaped: \_underscores\_ and \*asterisks\*

Properly escaped: \_underscores\_ and \*asterisks*

## Header Without Space After #

#No space here
##Also no space
###And again

## Multiple Consecutive Headers

### Header 1
### Header 2
### Header 3

No content between them.

## Very Long Single Line

This is an extremely long paragraph that spans multiple lines in the editor but should be treated as a single paragraph by the markdown parser because there are no blank lines separating the sentences and it just keeps going on and on with more and more content testing the indexer's ability to handle very long lines without breaking and this should be chunked appropriately when it exceeds the maximum chunk size even though it's technically just one paragraph from the markdown perspective which is an interesting edge case to test.

## Empty Code Block Language Tag

```
No language specified
Should still be parsed as code
```

## Invalid Language Tags

```not-a-real-language
This language tag doesn't exist
But should still be treated as code
```

```markdown
Wait, this is actually valid markdown syntax highlighting
```

## Mixed Markdown Elements

> Blockquote with **bold** and `code`
> That spans multiple lines
> And has an inline [link](https://example.com)

## Orphaned List Markers

- Orphaned dash marker
* Orphaned asterisk marker
+ Orphaned plus marker

## Unclosed HTML

<div class="container">
  <p>This div never closes

  <p>More content inside unclosed div

Back to markdown

## Trailing Whitespace

This line has trailing spaces:
This line has trailing tabs:

## Empty Lines with Spaces





## Repeated Horizontal Rules

---
***
___
---
***
___

## Header Levels Beyond 6

####### Level 7 header (not valid markdown)
######## Level 8 header (also not valid)

## Reference Definitions (Late)

[ref1]: https://example.com "Reference defined at end"

[ref2]: https://another-example.com

## Unclosed Backticks in Inline Code

This has an unclosed backtick `in the middle and continues

Another one `here too `and another backtick

## Invalid HTML Entities

&invalid;
&missingsemicolon
&undefined;

## Mixed Quote Styles

> "Quote with quotes"
> 'More quotes'
> Even "more 'nested' quotes"

## Binary or Special Characters

Null byte: \u0000
Unicode: 🎉 🔥 🚀
RTL: ‮
Zero-width joiner:

## Comment-Like Syntax

<!-- This looks like an HTML comment -->

// This looks like a code comment
# This looks like a shell comment but isn't in a code block

## Final Notes

This document tests various edge cases including:
- Unclosed blocks
- Malformed tables
- Invalid syntax
- Empty sections
- Mixed formatting
- Special characters

The indexer should handle these gracefully with appropriate fallback mechanisms.
