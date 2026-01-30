#!/bin/bash

#
# Semantic Search Startup Script for macOS
#
# Launches the Rhythm Chamber MCP server with semantic search.
# Optionally launches LM Studio if not running.
#

set -e

# Configuration
EMBEDDING_MODEL="text-embedding-nomic-embed-text-v1.5"
LM_STUDIO_ENDPOINT="${RC_LMSTUDIO_ENDPOINT:-http://localhost:1234/v1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_SERVER_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print banner
print_banner() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║        Rhythm Chamber MCP Server - Semantic Search           ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo ""
}

# Check if LM Studio is running
check_lmstudio() {
    if curl -s --max-time 5 "$LM_STUDIO_ENDPOINT/models" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Check if embedding model is loaded
check_embedding_model() {
    local response=$(curl -s --max-time 5 "$LM_STUDIO_ENDPOINT/models" 2>/dev/null || echo "")
    if echo "$response" | grep -qi "embedding"; then
        return 0
    else
        return 1
    fi
}

# Launch LM Studio
launch_lmstudio() {
    echo -e "${YELLOW}LM Studio is not running${NC}"
    echo ""
    echo "Attempting to launch LM Studio..."
    echo ""

    if open -a "LM Studio" 2>/dev/null; then
        echo -e "${GREEN}✓ LM Studio launched${NC}"
        echo ""
        echo "Waiting for LM Studio API to be ready..."

        # Wait up to 30 seconds for API
        for i in {1..30}; do
            if check_lmstudio; then
                echo -e "${GREEN}✓ LM Studio API is ready${NC}"
                return 0
            fi
            sleep 1
            echo -n "."
        done

        echo ""
        echo -e "${YELLOW}⚠️  Timed out waiting for LM Studio${NC}"
        echo "The MCP server will start with Transformers.js fallback"
        return 1
    else
        echo -e "${RED}✗ Failed to launch LM Studio${NC}"
        echo "Please install LM Studio from: https://lmstudio.ai/"
        echo ""
        echo "The MCP server will start with Transformers.js fallback"
        return 1
    fi
}

# Main execution
main() {
    print_banner

    # Check LM Studio
    echo "Checking LM Studio availability..."
    echo ""

    if check_lmstudio; then
        echo -e "${GREEN}✓ LM Studio is running${NC}"

        if check_embedding_model; then
            echo -e "${GREEN}✓ Embedding model available${NC}"
            echo ""
            echo -e "${BLUE}🚀 Using LM Studio for embeddings (fast, GPU-accelerated)${NC}"
        else
            echo ""
            echo -e "${YELLOW}⚠️  No embedding model loaded${NC}"
            echo ""
            echo "To load the embedding model in LM Studio:"
            echo "  1. Open LM Studio"
            echo "  2. Search for \"$EMBEDDING_MODEL\""
            echo "  3. Download and load the model"
            echo ""
            echo -e "${BLUE}🔄 Using Transformers.js fallback${NC}"
        fi
    else
        # Offer to launch LM Studio
        echo "Would you like to launch LM Studio? (y/N)"
        read -r -t 10 response || response="n"

        if [[ "$response" =~ ^[Yy]$ ]]; then
            launch_lmstudio
        else
            echo ""
            echo "Skipping LM Studio launch"
            echo ""
            echo -e "${BLUE}🔄 Using Transformers.js fallback (slower, CPU-based)${NC}"
        fi
    fi

    echo ""
    echo "─────────────────────────────────────────────────────────────────"
    echo ""
    echo "Starting MCP Server with semantic search..."
    echo ""

    # Export environment
    export RC_SEMANTIC_SEARCH="true"
    export RC_LMSTUDIO_ENDPOINT="$LM_STUDIO_ENDPOINT"

    # Start server
    cd "$MCP_SERVER_DIR"
    exec node server.js
}

# Run
main "$@"
