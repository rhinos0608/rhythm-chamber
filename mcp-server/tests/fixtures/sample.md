# Sample Markdown Document

This is a **sample markdown document** demonstrating all major markdown features.

## Headers

### Heading Level 3

#### Heading Level 4

##### Heading Level 5

###### Heading Level 6

## Text Formatting

You can write **bold text**, *italic text*, and ***bold italic***. You can also write `inline code` within sentences.

## Paragraphs

This is a paragraph with multiple sentences. It demonstrates how markdown handles normal text flow. Paragraphs are separated by blank lines.

This is another paragraph. It shows that consecutive lines are merged into a single paragraph unless separated by a blank line.

## Lists

### Unordered List

- First item
- Second item
  - Nested item
  - Another nested item
- Third item

### Ordered List

1. First step
2. Second step
   1. Nested step
   2. Another nested step
3. Third step

## Code Blocks

### JavaScript

```javascript
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10));
```

### Python

```python
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

print(fibonacci(10))
```

### Bash

```bash
#!/bin/bash
echo "Hello, World!"
for i in {1..5}; do
    echo "Count: $i"
done
```

## Blockquotes

> This is a blockquote.
>
> It can span multiple paragraphs.
>
> > It can also be nested.

## Tables

| Name | Age | Occupation | Location |
|------|-----|------------|----------|
| Alice | 28 | Engineer | New York |
| Bob | 32 | Designer | San Francisco |
| Charlie | 45 | Manager | Chicago |

### Aligned Table

| Left | Center | Right |
|:-----|:------:|------:|
| L1 | C1 | R1 |
| L2 | C2 | R2 |
| L3 | C3 | R3 |

## Links and Images

[Link to GitHub](https://github.com)

[Link with title](https://example.com "Example Title")

## Horizontal Rules

---

***

___

## Escaping

These characters should be escaped: \*not bold\*, \`not code\`, \[not a link\]

## Inline HTML

<div style="color: red;">This is red text</div>

## Task Lists

- [x] Completed task
- [ ] Incomplete task
- [ ] Another incomplete task

## Footnotes (if supported)

This is a reference[^1] to a footnote.

[^1]: This is the footnote content.

## Emojis

:smile: :heart: :thumbsup:

## Code in Lists

- Item with `inline code`
- Another item with **bold text**
  - Nested item with `code`

## Complex Example

Here's a more complex example combining multiple elements:

> **Important Note**: Always remember to:
> 1. Read the documentation
> 2. Write tests
> 3. Deploy carefully

```javascript
// Configuration object
const config = {
  apiKey: "your-api-key",
  endpoint: "https://api.example.com",
  timeout: 5000
};

async function fetchData(url) {
  const response = await fetch(url);
  return response.json();
}
```

## Final Section

This concludes the sample markdown document. It should cover all the major features that need to be tested for the markdown indexer.
