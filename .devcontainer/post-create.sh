#!/bin/bash

echo "🚀 Starting post-create setup..."

# Get the workspace root directory dynamically
WORKSPACE_ROOT=$(pwd)
echo "📂 Workspace root: $WORKSPACE_ROOT"

echo "⚙️ Starting Docker daemon..."
mkdir -p $WORKSPACE_ROOT/tmp
sudo dockerd > $WORKSPACE_ROOT/tmp/dockerd.log 2>&1 &

echo "⚙️ Installing dependencies..."
if [ -f "package.json" ]; then
    npm ci || true
fi
if [ -f "pyproject.toml" ]; then
    poetry install --no-root --no-interaction --no-ansi || true
fi

echo "✅ Post-create setup complete!"
