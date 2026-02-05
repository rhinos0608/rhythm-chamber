#!/bin/bash
set -e

echo "🚀 Starting ChromaDB server..."

# Check Docker
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker not running"
    echo "Please start Docker Desktop or the Docker daemon"
    exit 1
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Start container
echo "Starting ChromaDB container..."
docker-compose -f "$SCRIPT_DIR/docker-compose.yml" up -d

# Wait for ready
echo "⏳ Waiting for ChromaDB..."
MAX_WAIT=60
WAITED=0

while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -s http://localhost:8000/api/v1/heartbeat > /dev/null 2>&1; then
        echo "✅ ChromaDB ready at http://localhost:8000"
        echo ""
        echo "📊 ChromaDB UI available at: http://localhost:8000"
        echo "💡 To stop: docker-compose -f mcp-server/docker-compose.yml down"
        echo "💡 To view logs: docker-compose -f mcp-server/docker-compose.yml logs -f"
        exit 0
    fi
    sleep 1
    WAITED=$((WAITED + 1))
done

echo "❌ ChromaDB failed to start"
echo "Check logs with: docker-compose -f mcp-server/docker-compose.yml logs"
exit 1
