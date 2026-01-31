#!/bin/bash

set -e

echo "🚀 Rhythm Chamber Semantic Search - Restart Script"
echo "=================================================="

# Configuration
PROJECT_ROOT="/Users/rhinesharar/rhythm-chamber"
MCP_SERVER_DIR="$PROJECT_ROOT/mcp-server"
CACHE_DIR="$MCP_SERVER_DIR/.mcp-cache"
LOG_FILE="$MCP_SERVER_DIR/.restart-log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Stop existing servers
echo -e "${BLUE}🛑 Stopping existing MCP servers...${NC}"
pkill -f "node.*mcp-server/server.js" || true
sleep 2

# Clear cache (optional - remove if you want to preserve index)
echo ""
read -p "Clear cache and re-index? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}🗑️  Clearing cache...${NC}"
    rm -rf "$CACHE_DIR/semantic-embeddings.json"
    echo -e "${GREEN}✓ Cache cleared${NC}"
else
    echo -e "${BLUE}ℹ️  Preserving existing cache (faster startup)${NC}"
fi

# Start server
echo ""
echo -e "${BLUE}🚀 Starting MCP server...${NC}"
cd "$MCP_SERVER_DIR"

# Environment variables
export RC_PROJECT_ROOT="$PROJECT_ROOT"
export RC_EMBEDDING_DIM=768  # Must match model dimension (jina-code and gte-base)

# Start in background with logging
nohup node server.js > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

echo -e "${GREEN}✅ Server started with PID: $SERVER_PID${NC}"
echo "📝 Log file: $LOG_FILE"
echo ""

# Wait and monitor
echo -e "${BLUE}📊 Monitoring startup (10 seconds)...${NC}"
sleep 10

# Check if server is running
if ps -p $SERVER_PID > /dev/null; then
    echo -e "${GREEN}✅ Server is running successfully!${NC}"
    echo ""
    echo -e "${BLUE}🔍 Recent activity:${NC}"
    tail -20 "$LOG_FILE" | grep -E "Indexing|Indexed|complete|Available|Error|Model" || echo "Still initializing..."
    echo ""
    echo -e "${BLUE}💡 Useful commands:${NC}"
    echo "   Monitor logs:    tail -f $LOG_FILE"
    echo "   Check status:    ps aux | grep $SERVER_PID"
    echo "   Stop server:    kill $SERVER_PID"
    echo ""
    echo -e "${GREEN}🎉 Semantic search is ready!${NC}"
else
    echo -e "${RED}❌ Server failed to start. Check logs:${NC}"
    echo "   cat $LOG_FILE"
    echo ""
    echo -e "${YELLOW}💡 Common fixes:${NC}"
    echo "   1. Verify Node.js is installed: node --version"
    echo "   2. Check available memory: htop or Activity Monitor"
    echo "   3. Check cache directory permissions: ls -la .mcp-cache/"
    exit 1
fi
