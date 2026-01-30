# MCP Configuration Corrections

**Date**: 2025-01-30
**Issue**: Incorrect Claude Desktop configuration provided instead of Claude Code configuration
**Status**: ✅ Fixed

---

## Problem Summary

The initial `CONFIGURATION_GUIDE.md` contained configuration instructions for **Claude Desktop** (`claude_desktop_config.json`) instead of **Claude Code** (`.mcp.json` and `~/.claude.json`). These are two different products with different configuration systems.

---

## Key Differences

### Claude Desktop vs Claude Code

| Aspect | Claude Desktop | Claude Code |
|--------|---------------|-------------|
| **Config file location** | User-level only | Project + User levels |
| **Config file name** | `claude_desktop_config.json` | `.mcp.json` (project) or `~/.claude.json` (user) |
| **Config location** | `~/Library/Application Support/Claude/` | Project root or `~/.claude.json` |
| **Scope** | Global (all projects) | Local, Project, or User scope |
| **Version control** | Not recommended | Recommended (.mcp.json) |
| **stdio format** | Requires `"type": "stdio"` | No type field needed for stdio |
| **CLI tools** | None | `claude mcp add/list/remove` |

---

## Configuration Format Comparison

### Claude Desktop (❌ Wrong for this use case)

```json
{
  "mcpServers": {
    "rhythm-chamber": {
      "type": "stdio",  // ← Required in Claude Desktop
      "command": "node",
      "args": ["/absolute/path/to/server.js"],
      "env": {
        "RC_PROJECT_ROOT": "/absolute/path"
      }
    }
  }
}
```

**Location**: `~/Library/Application Support/Claude/claude_desktop_config.json`

### Claude Code (✅ Correct)

```json
{
  "mcpServers": {
    "rhythm-chamber": {
      "command": "node",
      "args": ["${PROJECT_ROOT}/mcp-server/server.js"],  // ← Env vars supported
      "env": {
        "RC_PROJECT_ROOT": "${PROJECT_ROOT}",              // ← Env expansion
        "RC_MCP_CACHE_DIR": "${PROJECT_ROOT}/.mcp-cache",
        "NODE_ENV": "${NODE_ENV:-production}"              // ← Default values
      }
    }
  }
}
```

**Location**: `.mcp.json` at project root (recommended for team collaboration)

---

## Configuration Scopes in Claude Code

Claude Code supports three scopes for MCP servers:

### 1. Project Scope (Recommended for teams)
- **File**: `.mcp.json` in project root
- **Purpose**: Shared with team via version control
- **CLI**: `claude mcp add --scope project ...`
- **Example**: ✅ This is what we created for Rhythm Chamber

### 2. User Scope
- **File**: `~/.claude.json`
- **Purpose**: Available across all your projects
- **CLI**: `claude mcp add --scope user ...`
- **Use case**: Personal tools you use everywhere

### 3. Local Scope
- **File**: `~/.claude.json` (project-specific entry)
- **Purpose**: Private to you, project-specific
- **CLI**: `claude mcp add` (default, no --scope flag)
- **Use case**: Experimental configurations, sensitive credentials

---

## Corrections Applied

### 1. Updated CONFIGURATION_GUIDE.md

**Before (Incorrect)**:
```markdown
## Quick Start: Adding MCP Server to Claude Code

### Option 1: Using Claude Code Desktop App (Recommended)

1. **Find your Claude Code config file**:
   ~/Library/Application Support/Claude/claude_desktop_config.json
```

**After (Correct)**:
```markdown
## Quick Start: Adding MCP Server to Claude Code

### Understanding Configuration Scopes

Claude Code supports three MCP configuration scopes:

| Scope | Location | Purpose | Version Control |
|-------|----------|---------|-----------------|
| **Local** | `~/.claude.json` (project-specific) | Private to you | ❌ No |
| **Project** | `.mcp.json` (project root) | Shared with team | ✅ Yes |
| **User** | `~/.claude.json` (global) | All projects | ❌ No |
```

### 2. Created .mcp.json Configuration File

Created `.mcp.json` at project root with proper Claude Code format:

```json
{
  "mcpServers": {
    "rhythm-chamber": {
      "command": "node",
      "args": ["${PROJECT_ROOT}/mcp-server/server.js"],
      "env": {
        "RC_PROJECT_ROOT": "${PROJECT_ROOT}",
        "RC_MCP_CACHE_DIR": "${PROJECT_ROOT}/.mcp-cache",
        "NODE_ENV": "${NODE_ENV:-production}"
      }
    }
  }
}
```

**Key improvements**:
- ✅ Uses environment variable expansion (`${PROJECT_ROOT}`)
- ✅ Supports default values (`${NODE_ENV:-production}`)
- ✅ No `"type": "stdio"` field (not needed in Claude Code)
- ✅ Located at project root for version control
- ✅ Team-friendly configuration

### 3. Added CLI Commands

Documented the proper Claude Code CLI commands:

```bash
# Add server with project scope
claude mcp add --scope project --transport stdio rhythm-chamber \
  -- node ${PROJECT_ROOT}/mcp-server/server.js

# List configured servers
claude mcp list

# Remove server
claude mcp remove rhythm-chamber

# Check status within Claude Code
/mcp
```

### 4. Updated TESTING-REPORT.md

Corrected the configuration section to reference `.mcp.json` instead of `claude_desktop_config.json`.

---

## Environment Variable Expansion

One powerful feature of Claude Code's `.mcp.json` is environment variable expansion:

### Syntax

- `${VAR}` - Expands to environment variable `VAR`
- `${VAR:-default}` - Expands to `VAR` if set, otherwise uses `default`

### Example

```json
{
  "mcpServers": {
    "rhythm-chamber": {
      "command": "node",
      "args": ["${PROJECT_ROOT}/mcp-server/server.js"],
      "env": {
        "RC_PROJECT_ROOT": "${PROJECT_ROOT}",
        "NODE_ENV": "${NODE_ENV:-production}"
      }
    }
  }
}
```

**Benefits**:
- ✅ Team members can use different project paths
- ✅ Sensitive values can be set in environment variables
- ✅ Default values prevent configuration errors
- ✅ Configuration works across different machines

---

## Verification Steps

To verify the MCP server is configured correctly:

```bash
# 1. Check .mcp.json exists and is valid JSON
cat .mcp.json | jq

# 2. List configured servers
claude mcp list

# 3. Within Claude Code, check server status
/mcp

# 4. Test the MCP tools
# Ask: "Analyze the chat-ui-controller.js module"
```

---

## Common Pitfalls

### ❌ Wrong: Claude Desktop config file

```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

### ✅ Correct: Claude Code config file

```bash
.mcp.json  # Project scope (recommended)
~/.claude.json  # User or Local scope
```

---

### ❌ Wrong: Including "type" field for stdio servers

```json
{
  "mcpServers": {
    "rhythm-chamber": {
      "type": "stdio",  // ← Not needed in Claude Code!
      "command": "node",
      ...
    }
  }
}
```

### ✅ Correct: Omit "type" for stdio servers

```json
{
  "mcpServers": {
    "rhythm-chamber": {
      "command": "node",  // "type" implied by "command"
      "args": [...],
      "env": {...}
    }
  }
}
```

**Note**: `"type": "http"` or `"type": "sse"` IS required for remote servers.

---

## Resources

- **Official Claude Code MCP Documentation**: https://code.claude.com/docs/en/mcp
- **Configuration Guide**: `mcp-server/CONFIGURATION_GUIDE.md`
- **Testing Report**: `mcp-server/TESTING-REPORT.md`

---

## Summary

★ Insight ─────────────────────────────────────
The key distinction is:
• Claude Desktop = Desktop app with simple config (user-level only)
• Claude Code = CLI tool with flexible config (project/user/local scopes)
For team collaboration, use .mcp.json at project root with environment variables.
─────────────────────────────────────────────────

The MCP server now has correct Claude Code configuration with:
- ✅ Proper `.mcp.json` format at project root
- ✅ Environment variable expansion support
- ✅ Project-scoped configuration for team sharing
- ✅ CLI commands for easy management
- ✅ Comprehensive troubleshooting guide

**Status**: Ready for team use! 🎉
