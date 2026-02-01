# Rhythm Chamber MCP Server

Model Context Protocol (MCP) server for codebase analysis, semantic search, and HNW architecture validation.

## Purpose

Enables AI agents (like Claude Code) to:

- **Search code by meaning** - Semantic search using vector embeddings
- **Orchestrate deep analysis** - Combine semantic + structural + architectural search
- **Inspect code chunks** - Get detailed information about indexed code
- **Query module information** - Exports, imports, dependencies
- **Analyze dependencies** - Trace relationships between modules
- **Validate architecture** - HNW compliance checking

## Installation

```bash
cd mcp-server
npm install
```

## Usage

### Start Server

```bash
npm start
# or
node server.js
```

### Test Server

```bash
node examples/test-server.js
```

### Claude Code Integration

Add to your Claude Code configuration (usually `~/.config/claude-code/config.json`):

```json
{
  "mcpServers": {
    "rhythm-chamber": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/server.js"],
      "env": {
        "RC_PROJECT_ROOT": "/absolute/path/to/rhythm-chamber",
        "RC_MCP_CACHE_DIR": "/absolute/path/to/rhythm-chamber/.mcp-cache"
      }
    }
  }
}
```

## Available Tools

### Semantic Search Tools ✅ COMPLETE

#### 1. semantic_search ✅ COMPLETE

Search the codebase by semantic meaning using vector embeddings. Finds code related to natural language queries.

**Parameters:**

- `query` (string, required): Natural language query (e.g., "how are sessions created?")
- `limit` (number, optional): Maximum results (default: 10, range: 1-50)
- `threshold` (number, optional): Minimum similarity score (default: 0.3, range: 0-1)
- `chunkType` (enum, optional): Filter by type ("function", "class", "method", "imports", "exports")
- `exportedOnly` (boolean, optional): Only return exported symbols
- `layer` (enum, optional): Filter by HNW layer ("controllers", "services", "utils", etc.)

**Returns:**

- Matching chunks ranked by semantic similarity
- File location, line numbers, and type
- Exported status and metadata
- Similarity scores (0-1)

**Example:**

```json
{
  "query": "authentication flow",
  "limit": 10,
  "threshold": 0.3,
  "exportedOnly": true
}
```

#### 2. deep_code_search ✅ COMPLETE

Orchestrates comprehensive code search combining semantic search with dependency graph analysis.

**Parameters:**

- `query` (string, required): Natural language query or code symbol
- `depth` (enum, optional): Analysis depth ("quick", "standard", "thorough")
- `limit` (number, optional): Maximum results (default: 10, range: 1-50)

**Returns:**

- Semantic matches clustered by file
- Related chunks with caller/callee relationships
- Symbol dependency analysis
- Summary with actionable insights

**Example:**

```json
{
  "query": "session persistence",
  "depth": "thorough",
  "limit": 15
}
```

#### 3. get_chunk_details ✅ COMPLETE

Get detailed information about a specific code chunk including source code and relationships.

**Parameters:**

- `chunkId` (string, required): Unique chunk identifier (e.g., "js_auth.js_function_authenticate_L123")
- `includeRelated` (boolean, optional): Include related chunks (default: true)
- `includeSource` (boolean, optional): Include full source code (default: true)

**Returns:**

- Full source code with JSDoc comments
- Complete metadata (file, lines, type, exported status)
- Related chunks (callers, callees)
- Symbol relationships

**Example:**

```json
{
  "chunkId": "js_services_session-manager.js_function_createSession_L42",
  "includeRelated": true,
  "includeSource": true
}
```

> **Note:** Chunk IDs are generated as `{sanitizedFilePath}_{type}_{name}_L{lineNumber}` where the file path has `/` replaced with `_`. Use `list_indexed_files` with `includeChunks: true` to see exact chunk IDs.

#### 4. list_indexed_files ✅ COMPLETE

List all files that have been indexed for semantic search.

**Parameters:**

- `filter` (enum, optional): Filter by HNW layer ("all", "controllers", "services", etc.)
- `includeChunks` (boolean, optional): Include individual chunk details
- `format` (enum, optional): Output format ("summary", "detailed", "json")

**Returns:**

- All indexed files with chunk counts
- Last modified timestamps
- Chunk type distribution
- Index statistics

**Example:**

```json
{
  "filter": "services",
  "includeChunks": false,
  "format": "summary"
}
```

#### 5. watcher_control ✅ COMPLETE

Control the file watcher daemon for automatic reindexing when files change.

**Actions:**

- `start`: Initialize and start the file watcher
- `stop`: Gracefully stop the watcher
- `status`: Return comprehensive watcher status
- `restart`: Stop and restart with optional new config

**Parameters:**

- `action` (enum, required): Action to perform ("start", "stop", "status", "restart")
- `config` (object, optional): Configuration options (for start/restart)
  - `debounceDelay` (number): Milliseconds to wait after last change (default: 300, range: 100-5000)
  - `coalesceWindow` (number): Milliseconds window to batch changes (default: 1000, range: 500-10000)
  - `ignore` (array): Additional ignore patterns

**Returns:**

- Running state and uptime
- Configuration (patterns, delays)
- Statistics (files changed, batches, errors)
- Current queue size and next process time
- Recent activity log (last 10 events)

**Examples:**

Start watcher with default settings:

```json
{
  "action": "start"
}
```

Start watcher with custom debounce:

```json
{
  "action": "start",
  "config": {
    "debounceDelay": 500,
    "coalesceWindow": 2000
  }
}
```

Get watcher status:

```json
{
  "action": "status"
}
```

Stop watcher:

```json
{
  "action": "stop"
}
```

Restart with new config:

```json
{
  "action": "restart",
  "config": {
    "debounceDelay": 300,
    "ignore": ["**/test/**", "**/tmp/**"]
  }
}
```

### Architecture Analysis Tools ✅ COMPLETE

#### 5. get_module_info ✅ COMPLETE

Get comprehensive metadata about a module including exports, imports, dependencies, and HNW architecture compliance.

**Parameters:**

- `filePath` (string, required): Relative path to module file (e.g., "js/controllers/chat-ui-controller.js")
- `includeDependencies` (boolean, optional, default: true): Include detailed dependency information
- `includeExports` (boolean, optional, default: true): Include all exported members and their types

**Returns:**

- Module layer (controllers/services/utils/storage/providers)
- HNW compliance score (0-100)
- Import statements
- Export details (named exports, default exports, types)
- Architecture violations (if any)
- Recommendations for improvement
- HNW pattern reference

**Example:**

```json
{
  "filePath": "js/controllers/chat-ui-controller.js",
  "includeDependencies": true,
  "includeExports": true
}
```

#### 6. find_dependencies ✅ COMPLETE

Analyze dependency relationships between modules.

**Parameters:**

- `startModule` (string, required): Starting module path
- `dependencyType` (enum, optional): Type of dependencies ("imports", "exports", "all")
- `maxDepth` (number, optional): Maximum traversal depth (default: 3, range: 1-10)
- `filterByLayer` (enum, optional): Filter by architectural layer

**Returns:**

- Dependency graph with tree visualization
- Circular dependency detection
- HNW compliance scores for all modules
- Layer distribution
- Architectural recommendations

**Example:**

```json
{
  "startModule": "js/controllers/chat-ui-controller.js",
  "dependencyType": "all",
  "maxDepth": 3
}
```

#### 7. search_architecture ✅ COMPLETE

Search the codebase based on HNW architecture patterns and constraints.

**Parameters:**

- `pattern` (string, required): Architecture pattern to search for
- `layer` (enum, optional): Specific layer to search
- `complianceCheck` (boolean, optional): Filter results by compliance (score ≥ 50)
- `maxResults` (number, optional): Maximum results to return (default: 50, range: 1-200)

**Returns:**

- Matching files with pattern details
- HNW compliance scores
- Layer distribution
- Pattern-specific recommendations
- Top violations

**Example:**

```json
{
  "pattern": "EventBus usage",
  "layer": "all",
  "complianceCheck": false
}
```

#### 8. validate_hnw_compliance ✅ COMPLETE

Validate codebase adherence to HNW architecture principles.

#### 9. find_all_usages ✅ COMPLETE

Find all usages of a function, class, or variable with precise file:line:column locations.

**Parameters:**

- `symbolName` (string, required): Name of the symbol to find (e.g., "handleMessage", "TabCoordinator")
- `symbolType` (enum, required): Type of symbol ("function", "class", "variable")
- `filePath` (string, optional): Search within specific file only
- `includeDynamic` (boolean, optional, default: true): Include dynamic calls (call(), apply(), eval())

**Returns:**

- All usages with precise locations (file:line:column)
- Call type classification (direct, dynamic, reference)
- Certainty scores for each match
- Risky usage detection (missing error handling, dynamic calls)
- Context code snippets around each usage

**Example:**

```json
{
  "symbolName": "EventBus",
  "symbolType": "class",
  "filePath": "js/services/event-bus.js",
  "includeDynamic": true
}
```

#### 10. get_compilation_errors ✅ COMPLETE

Get compilation errors, syntax errors, and lint errors with precise locations and suggested fixes.

**Parameters:**

- `target` (string/object, required): File or directory to analyze (supports string path or {filePath} or {directory} format)
- `severity` (enum, optional): Filter by severity ("all", "error", "warning", default: "all")
- `includeContext` (boolean, optional, default: true): Include code context around errors

**Returns:**

- Syntax errors from Babel parser with line/column
- Lint errors from ESLint with rule IDs
- Suggested fixes for each error
- Error context snippets
- Fix priority ranking (most frequent issues first)

**Example:**

```json
{
  "target": "js/controllers/chat-ui-controller.js",
  "severity": "all",
  "includeContext": true
}
```

#### 11. get_symbol_graph ✅ COMPLETE

Generate symbol relationship graphs with multiple visualization formats (Mermaid, DOT, JSON).

**Parameters:**

- `filePath` (string, required): Relative path to module file
- `graphType` (enum, optional): Type of graph ("call", "inheritance", "dependency", default: "call")
- `maxDepth` (number, optional): Maximum traversal depth (1-5, default: 2)
- `format` (enum, optional): Output format ("mermaid", "dot", "json", default: "mermaid")

**Returns:**

- Function call graphs
- Class inheritance hierarchies
- Import/export dependency networks
- Visualizable output (Mermaid for Markdown, DOT for Graphviz, JSON for processing)

**Example:**

```json
{
  "filePath": "js/controllers/chat-ui-controller.js",
  "graphType": "call",
  "maxDepth": 2,
  "format": "mermaid"
}
```

#### 12. analyze_architecture ✅ COMPLETE

Enhanced HNW architecture validation with layer violation detection, circular dependency analysis, and refactoring suggestions.

**Parameters:**

- `target` (string/object, required): File or directory to analyze (supports string path or {filePath} or {directory} format)
- `analysisType` (enum, optional): Type of analysis ("comprehensive", "layer-violations", "circular-dependencies", "compliance-score", default: "comprehensive")
- `includeSuggestions` (boolean, optional, default: true): Include actionable refactoring suggestions
- `severity` (enum, optional): Filter by severity ("all", "error", "warning", default: "all")

**Returns:**

- HNW compliance score (0-100)
- Layer violation detection
- Circular dependency detection
- Hierarchy/Network/Wave compliance metrics
- Prioritized refactoring suggestions

**Example:**

```json
{
  "target": { "directory": "js/services" },
  "analysisType": "comprehensive",
  "includeSuggestions": true
}
```

#### 13. trace_execution_flow ✅ COMPLETE

Trace execution flow from a function with async pattern support and circular dependency detection.

**Parameters:**

- `startFunction` (string, required): Function name to start tracing
- `filePath` (string, required): File containing the function
- `maxDepth` (number, optional): Maximum traversal depth (1-10, default: 5)
- `includeAsync` (boolean, optional, default: true): Include async patterns
- `detectCycles` (boolean, optional, default: true): Detect circular flows
- `filterBuiltIns` (boolean, optional, default: true): Filter out built-in JavaScript methods
- `format` (enum, optional): Output format ("text", "mermaid", "json", default: "text")

**Returns:**

- Execution call tree with depth tracking
- Async pattern detection (await, Promise.then, callbacks)
- Circular flow detection
- Cross-file call tracing via import resolution
- Visualization in multiple formats

**Example:**

```json
{
  "startFunction": "sendMessage",
  "filePath": "js/controllers/chat-ui-controller.js",
  "maxDepth": 5,
  "format": "text"
}
```

#### 14. suggest_refactoring ✅ COMPLETE

Generate complexity-based refactoring suggestions with HNW compliance checks and before/after examples.

**Parameters:**

- `target` (string/object, required): File or directory to analyze (supports string path or {filePath} or {directory} format)
- `complexityThreshold` (number, optional, default: 10): Cyclomatic complexity threshold
- `includeHNWCheck` (boolean, optional, default: true): Include HNW compliance checks
- `priorityBy` (enum, optional): Priority strategy ("impact", "effort", "risk", "balanced", default: "balanced")
- `maxSuggestions` (number, optional, default: 10): Maximum suggestions to return

**Returns:**

- Functions exceeding complexity threshold
- Refactoring type recommendations (extract_function, extract_class, etc.)
- Impact/Effort/Risk scoring
- Projected metrics after refactoring
- HNW compliance impact
- Before/after code examples
- Test coverage proximity
- Call frequency weighting

**Example:**

```json
{
  "target": { "directory": "js/controllers" },
  "complexityThreshold": 10,
  "priorityBy": "impact"
}
```

## Path Parameter Formats

All tools that accept file/directory paths support **two formats**:

### Format 1: String Path (Simple)

```json
{
  "target": "js/storage/indexed-db.js"
}
```

### Format 2: Object Path (Explicit)

For a **single file**:

```json
{
  "target": {
    "filePath": "js/storage/indexed-db.js"
  }
}
```

For a **directory** (analyzes all `.js` files within):

```json
{
  "target": {
    "directory": "js/storage"
  }
}
```

### Important Notes

- **Paths are always relative to the project root** (the directory containing the MCP server)
- **Never use `../`** to escape the project (security: path traversal protection)
- **Directory scanning** uses glob patterns that exclude `node_modules`, `*.test.js`, and `*.spec.js`
- **Tools supporting this format**: `get_compilation_errors`, `suggest_refactoring`, `analyze_architecture`

### Common Issues

| Symptom                   | Cause                            | Solution                                                    |
| ------------------------- | -------------------------------- | ----------------------------------------------------------- |
| "Target not found"        | Path relative to wrong directory | Use path relative to project root, not MCP server directory |
| "Path traversal detected" | Using `../` to escape project    | Don't use `../` - reference files within project root       |
| "No files to analyze"     | Directory has no `.js` files     | Check the directory contains JavaScript files               |

### Which Tools Support Which Format?

| Tool                     | String | `{filePath}`          | `{directory}` |
| ------------------------ | ------ | --------------------- | ------------- |
| `get_compilation_errors` | ✅     | ✅                    | ✅            |
| `suggest_refactoring`    | ✅     | ✅                    | ✅            |
| `analyze_architecture`   | ✅     | ✅                    | ✅            |
| `get_module_info`        | —      | ✅ (as `filePath`)    | —             |
| `find_dependencies`      | —      | ✅ (as `startModule`) | —             |
| `semantic_search`        | —      | ✅ (in `filters`)     | —             |
| `find_all_usages`        | —      | ✅ (as `filePath`)    | —             |
| `get_symbol_graph`       | —      | ✅ (as `filePath`)    | —             |
| `trace_execution_flow`   | —      | ✅ (as `filePath`)    | —             |

## Architecture

```
mcp-server/
├── server.js                    # Main MCP server entry point
├── package.json                 # Dependencies and scripts
├── .semanticignore              # Ignore patterns for semantic indexing
├── src/
│   ├── semantic/                 # Semantic search subsystem
│   │   ├── indexer.js           # Orchestrates indexing pipeline
│   │   ├── chunker.js           # AST-aware code chunking (Acorn)
│   │   ├── embeddings.js        # Hybrid embeddings (LM Studio + Transformers.js)
│   │   ├── vector-store.js      # Tiered vector storage (memory → sqlite-vec)
│   │   ├── dependency-graph.js  # Symbol definition/usage tracking
│   │   └── cache.js             # Persistent embedding cache
│   ├── analyzers/
│   │   └── hnw-analyzer.js     # HNW architecture analysis engine
│   ├── cache/
│   │   └── cache-manager.js    # LRU cache implementation
│   ├── tools/
│   │   ├── semantic-search.js   # semantic_search tool
│   │   ├── deep-code-search.js  # deep_code_search tool
│   │   ├── get-chunk-details.js # get_chunk_details tool
│   │   ├── list-indexed-files.js # list_indexed_files tool
│   │   ├── module-info.js       # get_module_info tool
│   │   ├── dependencies.js      # find_dependencies tool
│   │   ├── architecture.js      # search_architecture tool
│   │   └── validation.js        # validate_hnw_compliance tool
│   └── utils/
│       ├── logger.js            # Structured logging
│       ├── file-scanner.js      # File system scanning
│       └── parser.js            # AST parsing (@babel/parser)
└── examples/
    └── test-server.js           # Standalone test script
```

### Semantic Search Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   AI Agent (Claude/GPT)                      │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ semantic_    │   │ deep_code_   │   │ get_chunk_   │
│ search       │   │ search       │   │ _details     │
└──────────────┘   └──────────────┘   └──────────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Semantic Search Subsystem                 │
│  ┌────────────┐  ┌────────────┐  ┌─────────────────────┐  │
│  │ Chunker    │→│ Embeddings │→ │  Vector Store       │  │
│  │ (Acorn)    │  │ (Hybrid)   │  │  (memory → sqlite) │  │
│  └────────────┘  └────────────┘  └─────────────────────┘  │
│                       ↓                                     │
│              ┌──────────────┐                               │
│              │ Dependency   │                               │
│              │ Graph        │                               │
│              └──────────────┘                               │
└─────────────────────────────────────────────────────────────┘
```

### Hybrid Embeddings

The semantic search uses Transformers.js for 100% local, privacy-preserving embeddings:

1. **Code Embeddings**: `jinaai/jina-embeddings-v2-base-code` (768 dimensions)
   - Specialized for code understanding
   - 8,192 token context window
   - Optimized for JavaScript/TypeScript semantics

2. **General Text**: `Xenova/gte-base` (768 dimensions)
   - High-quality general-purpose embeddings
   - Excellent for documentation and comments
   - Falls back when code model unavailable

**Note:** LM Studio integration was deprecated due to batch API instability. The system now relies entirely on Transformers.js for reliable, consistent embeddings.

## HNW Architecture Patterns

The server validates against **Hierarchical Network Wave (HNW)** patterns:

### Hierarchy: Controllers → Services → Providers

- ✅ Controllers call Services, not Providers directly
- ✅ Services use Provider abstraction layer
- ✅ No circular dependencies

### Network: EventBus for Cross-Module Communication

- ✅ Event-driven, loosely coupled design
- ✅ Domain filtering for event handlers
- ✅ No tight coupling between modules

### Wave: TabCoordinator for Cross-Tab Coordination

- ✅ Check primary tab status before writes
- ✅ Use write-ahead log for crash recovery
- ✅ Single writer pattern for data integrity

## Development

### Adding a New Tool

1. Create a new file in `src/tools/`:

```javascript
import { logger } from '../utils/logger.js';

export const schema = {
  name: 'your_tool_name',
  description: 'Tool description',
  inputSchema: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: 'Parameter description',
      },
    },
    required: ['param1'],
  },
};

export const handler = async (args, projectRoot) => {
  logger.info('your_tool_name called with:', args);

  // Your implementation here

  return {
    content: [
      {
        type: 'text',
        text: 'Your result here',
      },
    ],
  };
};
```

2. Import in `server.js`:

```javascript
import { schema as your_tool_schema, handler as your_tool_handler } from './src/tools/your-tool.js';
```

3. Register in `setupToolHandlers()`:

```javascript
// In tools list
tools: [
  // ... existing tools
  your_tool_schema,
],

// In CallToolRequestSchema handler
case 'your_tool_name':
  return await your_tool_handler(args, this.projectRoot);
```

### Run in Development Mode

```bash
npm run dev
```

### Run Tests

```bash
npm test
```

## Performance

### Architecture Analysis

- **LRU Cache**: Caches module analysis results (500 entries, 5-minute TTL)
- **AST Caching**: Reuses parsed ASTs to avoid re-parsing
- **Incremental Updates**: Only re-scans changed files
- **Startup Time**: <100ms
- **Module Analysis**: 50-200ms per file (cached)
- **Cache Hit Rate**: >80% for repeated queries
- **Memory Usage**: ~50MB baseline + ~1MB per 100 cached analyses

### Semantic Search

- **First Index**: ~30-60 seconds for 400 files (LM Studio) or ~2-3 minutes (Transformers.js)
- **Cached Index**: <5 seconds startup with warm cache (loaded from disk)
- **Search Latency**: <100ms for 1000 chunks (in-memory)
- **Embedding Cache**: Persistent disk cache with mtime-based invalidation
  - Survives server restarts and device reboots
  - Stored in `.mcp-cache/` directory
  - Auto-invalidates for changed files
- **Memory Usage**: ~200MB for 5000 chunks (768-dim embeddings)
- **Auto-Upgrade**: Prompts for sqlite-vec at 5000+ chunks

## Troubleshooting

### "Schema is missing a method literal"

**Issue:** Using plain strings instead of Zod schemas in `setRequestHandler`.

**Solution:**

```javascript
// ❌ WRONG
this.server.setRequestHandler('tools/list', async () => { ... });

// ✅ CORRECT
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
this.server.setRequestHandler(ListToolsRequestSchema, async () => { ... });
this.server.setRequestHandler(CallToolRequestSchema, async (request) => { ... });
```

### Server won't start

- Check Node.js version (>= 20.0.0 required)
- Verify dependencies installed (`npm install`)
- Check `RC_PROJECT_ROOT` environment variable is set
- Review server logs for errors

### Tools not found

- Verify server is running
- Check Claude Code configuration path is correct
- Review server logs for registration errors

### Cache issues

**Clear cache:**

```bash
rm -rf .mcp-cache
```

**Restart server:**

```bash
# Stop and restart the MCP server
npm start
```

**Check file permissions:**

- Ensure write access to `.mcp-cache/` directory
- Cache directory is created automatically on first run

### Cache Persistence ✅

The embedding cache is **persistent and survives restarts**:

- **Location**: `.mcp-cache/` (configurable via `RC_MCP_CACHE_DIR`)
- **What's cached**: Embeddings vectors, indexed chunks, dependency graph
- **When it updates**: Automatically saves after indexing completes or on dirty state
- **Survives**: Server restarts, system reboots, closing/opening device

**Example workflow:**

```bash
# Day 1: Start indexing 412 files
npm start
# Indexing completes... cache saved to disk

# Day 2: Restart server
npm start
# Cache loaded in <5 seconds — no reindexing needed!

# After code changes: Automatic invalidation
# Only modified files are re-indexed
```

**Benefits:**

- ✅ Fast restarts (<5 seconds with warm cache)
- ✅ No need to reindex after closing device
- ✅ Automatic mtime-based invalidation for changed files
- ✅ Persistent across work sessions

## Environment Variables

### Core Configuration

- `RC_PROJECT_ROOT` (required): Absolute path to Rhythm Chamber project root
- `RC_MCP_CACHE_DIR` (optional): Directory for cache storage (default: `{RC_PROJECT_ROOT}/.mcp-cache`)
- `NODE_ENV` (optional): Set to 'development' for verbose logging

### Semantic Search Configuration

- `RC_ENABLE_SEMANTIC` (optional): Enable semantic search (default: `true`)
- `RC_EMBEDDING_DIM` (optional): Embedding dimension (default: `768`)
- `RC_EMBEDDING_TTL` (optional): Cache TTL in seconds (default: `600`)
- `RC_MAX_CHUNK_SIZE` (optional): Maximum chunk size in characters (default: `4000`)
- `RC_FORCE_TRANSFORMERS` (optional): Force Transformers.js usage (default: `true`, LM Studio deprecated)

### File Watcher Configuration

- `RC_ENABLE_WATCHER` (optional): Enable file watcher on startup (default: `false`)
- `RC_WATCHER_DEBOUNCE` (optional): Debounce delay in milliseconds (default: `300`)
- `RC_WATCHER_COALESCE` (optional): Coalescing window in milliseconds (default: `1000`)
- `RC_WATCHER_MAX_QUEUE` (optional): Maximum queue size (default: `1000`)

**Example: Enable watcher on startup**

```bash
RC_ENABLE_WATCHER=true npm start
```

**Example: Custom debounce settings**

```bash
RC_ENABLE_WATCHER=true RC_WATCHER_DEBOUNCE=500 RC_WATCHER_COALESCE=2000 npm start
```

## Key Implementation Details

### MCP SDK Integration

The server uses the official Model Context Protocol SDK with Zod schema validation:

- **Request Handlers**: Must use Zod schemas (e.g., `ListToolsRequestSchema`, `CallToolRequestSchema`)
- **Tool Schemas**: Exported as pure objects separate from handler functions
- **Type Safety**: Runtime validation using Zod schemas

### HNW Analyzer

The `HNWAnalyzer` class performs static analysis:

1. **Layer Detection**: Identifies architectural layer from file path
2. **Import Analysis**: Extracts and validates import statements
3. **Export Analysis**: Identifies exported functions, classes, and variables
4. **Compliance Checking**: Validates against HNW architecture rules
5. **Scoring**: Calculates compliance score (0-100) based on violations

### AST Parsing

Uses `@babel/parser` for JavaScript/TypeScript parsing:

- ES6+ module syntax
- JSX support
- Type annotations
- Source maps for error reporting

## Contributing

1. Follow HNW patterns in implementation
2. Add tests for new tools
3. Update documentation
4. Ensure proper error handling
5. Use JSDoc comments for public APIs

## License

MIT

## Resources

- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification/2025-06-18/)
- [MCP Tools Documentation](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [Rhythm Chamber AGENT_CONTEXT.md](../AGENT_CONTEXT.md) - Complete architecture documentation
- [AI_TOOLING_ROADMAP.md](../AI_TOOLING_ROADMAP.md) - Implementation roadmap

#
