# Documentation Synchronization Tooling

Automatically maintains architecture documentation by analyzing the `js/` codebase through AST parsing, git analysis, and JSDoc extraction.

## Features

- **AST Analysis**: Extracts metrics (line counts, module counts, dependencies) from JavaScript code
- **Git Analysis**: Tracks timestamps, contributor stats, and version information
- **API Documentation**: Generates markdown from JSDoc comments
- **Cross-Reference Validation**: Checks internal links and version consistency
- **Circular Dependency Detection**: Identifies circular import dependencies

## Installation

Dependencies are already installed via npm:

```bash
npm install --save-dev @babel/parser @babel/traverse @babel/types simple-git chokidar doctrine glob husky
```

## Usage

### Manual Sync

Update documentation on demand:

```bash
npm run docs:sync
```

Update and commit in one command:

```bash
npm run docs:sync:commit
```

### Watch Mode

Continuously monitor files and auto-update docs:

```bash
npm run docs:watch
```

Options:

- `--verbose` / `-v`: Show detailed output
- `--commit`: Auto-commit documentation changes
- `--debounce=<ms>`: Set debounce delay (default: 500ms)

Example:

```bash
npm run docs:watch -- --verbose --commit
```

### Git Hook

The pre-commit hook automatically checks if documentation is up-to-date before allowing commits.

If your documentation is outdated, you'll see:

```
✗ Documentation is outdated
ℹ  Run: npm run docs:sync
   Or bypass with: git commit --no-verify
```

To bypass the hook temporarily:

```bash
git commit --no-verify -m "message"
```

### Validation

Check cross-references without updating:

```bash
npm run docs:validate
```

## Configuration

Edit `scripts/docs-sync/config.json`:

```json
{
  "targetFiles": {
    "metrics": ["AGENT_CONTEXT.md", "ARCHITECTURE.md"],
    "apiDocs": "API.md",
    "security": "SECURITY.md",
    "crossRefs": ["*.md", "docs/**/*.md"]
  },
  "watchPaths": ["js/**/*.js"],
  "excludePaths": ["js/workers/embed-worker.js"],
  "debounceMs": 500,
  "markers": {
    "start": "<!-- AUTO-GENERATED:START -->",
    "end": "<!-- AUTO-GENERATED:END -->"
  },
  "versioning": {
    "source": "git",
    "fallback": "package.json"
  },
  "git": {
    "autoCommit": false,
    "commitMessage": "docs: sync documentation from code analysis"
  }
}
```

## What Gets Updated

### AGENT_CONTEXT.md

Status header with current metrics:

- Total source files
- Controller/Service/Utility counts
- Version number

### ARCHITECTURE.md

Version and last updated timestamp

### API.md

Version, timestamp, and JSDoc-generated API reference (between marker comments)

### SECURITY.md

Security version and timestamp

### docs/DEPENDENCY_GRAPH.md

Auto-generated dependency graph with circular dependency warnings

## Adding Markers to API.md

To enable JSDoc-generated API documentation, add markers to `API.md`:

```markdown
<!-- AUTO-GENERATED:START -->
<!-- API documentation will be auto-generated here -->
<!-- AUTO-GENERATED:END -->
```

The tool will preserve content outside the markers and regenerate content between them.

## Architecture

```
scripts/docs-sync/
├── orchestrator.js           # Main entry point (all modes)
├── watcher.js                # Watch daemon
├── config.json               # Configuration
├── analyzers/
│   ├── ast-analyzer.js       # AST parsing (@babel/parser)
│   └── git-analyzer.js       # Git history (simple-git)
├── generators/
│   ├── api-docs.js           # JSDoc → markdown
│   └── metrics-updater.js    # Update file headers
├── validators/
│   └── xref-validator.js     # Link checking
└── utils/
    ├── cache.js              # AST caching
    └── logger.js             # Colored console output
```

## Performance

- **Caching**: AST results are cached to avoid redundant parsing
- **Incremental Updates**: Only changed files are re-parsed in watch mode
- **Debouncing**: File changes are debounced (500ms default) to avoid excessive processing

## Troubleshooting

### "traverse is not a function"

This error occurs if `@babel/traverse` is not imported correctly. The tool uses CommonJS `require()` to load it:

```javascript
const traverse = require('@babel/traverse').default;
```

### Failed to parse files

Some files may fail to parse due to:

- Syntax errors
- Unsupported JavaScript features
- Encoding issues

These files are skipped and logged. The tool will continue processing other files.

### Git hook blocking commits

If the hook is blocking legitimate commits:

1. Run `npm run docs:sync` to update docs
2. Or bypass with `git commit --no-verify`

## Future Enhancements

- TypeScript file support (`.ts`)
- Visual dependency graphs (SVG/DOT)
- Diff highlighting in watch mode
- CI/CD pipeline integration
- Web dashboard for documentation health
- Auto-formatting with prettier
- JSON schema for config validation
- Multiple marker sets for different doc types

## Contributing

When adding new features to docs-sync:

1. Add error handling for edge cases
2. Update this README
3. Test with `npm run docs:sync -- --dry-run`
4. Update config.json schema if needed
