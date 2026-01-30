# MCP Server Configuration Guide

## Quick Start: Adding MCP Server to Claude Code

### Understanding Configuration Scopes

Claude Code supports three MCP configuration scopes:

| Scope | Location | Purpose | Version Control |
|-------|----------|---------|-----------------|
| **Local** | `~/.claude.json` (project-specific) | Private to you, project-specific | ❌ No |
| **Project** | `.mcp.json` (project root) | Shared with team via version control | ✅ Yes |
| **User** | `~/.claude.json` (global) | Available across all your projects | ❌ No |

**Recommendation**: Use **Project scope** for team collaboration (`.mcp.json`).

---

### Option 1: Using the CLI (Easiest)

The CLI automatically creates the `.mcp.json` file with proper formatting:

```bash
# Add server with project scope (creates .mcp.json)
claude mcp add --scope project --transport stdio rhythm-chamber \
  -- node /Users/rhinesharar/rhythm-chamber/mcp-server/server.js

# Verify it was added
claude mcp list

# Remove if needed
claude mcp remove rhythm-chamber
```

**Note**: The `--` separator is required before the server command and arguments.

---

### Option 2: Manual Configuration (.mcp.json)

Create `.mcp.json` in your project root with this structure:

```json
{
  "mcpServers": {
    "rhythm-chamber": {
      "command": "node",
      "args": [
        "/Users/rhinesharar/rhythm-chamber/mcp-server/server.js"
      ],
      "env": {
        "RC_PROJECT_ROOT": "/Users/rhinesharar/rhythm-chamber",
        "RC_MCP_CACHE_DIR": "/Users/rhinesharar/rhythm-chamber/.mcp-cache",
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Key differences from Claude Desktop**:
- No `"type": "stdio"` field needed for stdio servers
- File is `.mcp.json` (not `claude_desktop_config.json`)
- Located at project root (not user config directory)

---

### Option 3: User Scope (All Projects)

Add to `~/.claude.json` (creates user-scoped server):

```bash
claude mcp add --scope user --transport stdio rhythm-chamber \
  -- node /Users/rhinesharar/rhythm-chamber/mcp-server/server.js
```

---

### Option 4: Test with Direct Tool Invocation

```bash
# Test individual tools
node mcp-server/tests/test-on-real-codebase.js

# Start server in standalone mode
node mcp-server/examples/test-server.js
```

## Available Tools

Once configured, you can use these tools in Claude Code:

### 1. get_module_info
Analyze a specific module's structure, imports, exports, and HNW compliance.

**Example**: "Analyze the chat-ui-controller.js module for HNW compliance"

### 2. find_dependencies
Trace dependency relationships starting from a module.

**Example**: "Find all dependencies from main.js with depth 3"

### 3. search_architecture
Search the codebase for architecture patterns and HNW compliance issues.

**Example**: "Search for EventBus usage across all controllers"

### 4. validate_hnw_compliance
Validate HNW architecture compliance for files or layers.

**Example**: "Validate HNW compliance for all controllers"

## Environment Variable Expansion

Claude Code supports environment variable expansion in `.mcp.json`, allowing teams to share configurations while maintaining flexibility for machine-specific paths:

```json
{
  "mcpServers": {
    "rhythm-chamber": {
      "command": "node",
      "args": [
        "${PROJECT_ROOT}/mcp-server/server.js"
      ],
      "env": {
        "RC_PROJECT_ROOT": "${PROJECT_ROOT}",
        "RC_MCP_CACHE_DIR": "${PROJECT_ROOT}/.mcp-cache",
        "NODE_ENV": "${NODE_ENV:-production}"
      }
    }
  }
}
```

**Supported syntax:**
- `${VAR}` - Expands to environment variable `VAR`
- `${VAR:-default}` - Expands to `VAR` if set, otherwise uses `default`

**Expansion locations:**
- `command` - The server executable path
- `args` - Command-line arguments
- `env` - Environment variables passed to the server

---

## Configuration Options

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RC_PROJECT_ROOT` | Yes | - | Absolute path to project root |
| `RC_MCP_CACHE_DIR` | No | `{RC_PROJECT_ROOT}/.mcp-cache` | Directory for cache storage |
| `NODE_ENV` | No | `production` | Set to 'development' for verbose logging |

### Performance Tuning

For large codebases (>1000 files), you can tune cache sizes in `src/utils/parser.js`:

```javascript
const parser = new ASTParser({
  max: 1000,             // Increase cache size
  ttl: 600000,           // 10 minutes TTL
  maxSize: 100 * 1024 * 1024, // 100MB memory limit
});
```

## Verification

### Test the MCP Server

```bash
# Run integration tests
npm test -- mcp-server/tests/test-on-real-codebase.js

# Expected output:
# ✅ Passed: 4
# ❌ Failed: 0
# 🎉 All MCP server tools working correctly
```

### Check Server Status in Claude Code

Once configured, verify the server is running within Claude Code:

```bash
# Within Claude Code, check MCP server status
/mcp

# You should see:
# ✅ rhythm-chamber: Connected (4 tools available)
```

### Test MCP Tools

Ask Claude Code questions like:
- "Analyze the chat-ui-controller.js module for HNW compliance"
- "Find all dependencies from main.js with depth 3"
- "Search for EventBus usage across all controllers"
- "Validate HNW compliance for all controllers"

---

## Troubleshooting

### "Server not found" Error

**Problem**: Claude Code can't connect to the MCP server.

**Solution**:
1. Check the path in `args` is absolute (not relative)
2. Verify the server.js file exists
3. Check server status with `/mcp` in Claude Code
4. Try running the server directly:
   ```bash
   node /path/to/mcp-server/server.js
   ```

### "Permission denied" Error

**Problem**: Can't read project files.

**Solution**:
1. Ensure `RC_PROJECT_ROOT` is set correctly in `.mcp.json`
2. Check file permissions on the project directory
3. Verify the user has read access to all source files

### "MCP server not starting" Error

**Problem**: Server fails to start when Claude Code loads.

**Solution**:
1. Check for syntax errors in `.mcp.json`:
   ```bash
   cat .mcp.json | jq  # Validate JSON syntax
   ```
2. Try running the server manually to see error messages:
   ```bash
   RC_PROJECT_ROOT=/path/to/project \
     node /path/to/mcp-server/server.js
   ```
3. Enable development logging:
   ```json
   "env": {
     "NODE_ENV": "development"
   }
   ```

### "Cache corruption" Error

**Problem**: Cache is corrupted or out of date.

**Solution**:
```bash
# Clear the cache
rm -rf .mcp-cache
# Restart Claude Code to reload the server
```

### Tools Not Appearing

**Problem**: Server connects but tools don't show up.

**Solution**:
1. Check `/mcp` status in Claude Code
2. Verify server is returning tool schemas correctly
3. Restart Claude Code to force reconnection
4. Check Claude Code logs for MCP errors

---

## Performance Tips

### 1. Use Specific File Paths
Instead of "analyze the controllers", use "analyze js/controllers/chat-ui-controller.js" for faster results.

### 2. Limit Search Depth
When using `find_dependencies`, start with `maxDepth: 2` and increase only if needed.

### 3. Filter by Layer
Use `filterByLayer` to focus on specific architectural layers:
```javascript
{
  "startModule": "js/main.js",
  "filterByLayer": "controllers"  // Only analyze controllers
}
```

### 4. Enable Caching
The server automatically caches:
- AST parse results (500 entries, 5min TTL)
- File scan results (by options)
- Analysis results (until files change)

## Advanced Usage

### Custom Layer Definitions

Add custom layers in `src/utils/file-scanner.js`:

```javascript
getFileLayer(filePath) {
  const relPath = this.getRelativePath(filePath);

  // Add custom layers
  if (relPath.startsWith('custom/')) return 'custom';

  return 'other';
}
```

### Custom HNW Rules

Modify valid dependencies in `src/analyzers/hnw-analyzer.js`:

```javascript
const validDependencies = {
  controllers: ['services', 'utils', 'storage'],
  services: ['providers', 'utils', 'storage'],
  // Add custom rules
  custom: ['utils', 'helpers'],
};
```

## Security Considerations

### Path Traversal Protection ✅

The server includes built-in path traversal protection:
- All resolved paths validated against project root
- `../../../etc/passwd` attacks blocked
- Warning logged for blocked attempts

### Cache Isolation

Each project root has its own cache directory:
- Prevents cache poisoning between projects
- Automatic cache invalidation on file changes
- Safe for multi-project workspaces

### No Code Execution

The MCP server:
- ✅ Only reads and analyzes code
- ✅ Does not execute any code
- ✅ Does not modify any files
- ✅ Safe to run on any codebase

## Support

For issues or questions:
1. Check the test suite: `node mcp-server/tests/test-on-real-codebase.js`
2. Review logs: Set `NODE_ENV=development` for verbose output
3. See documentation: `mcp-server/README.md`
