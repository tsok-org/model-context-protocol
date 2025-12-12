#!/bin/bash

echo "🚀 Starting post-create setup..."


echo "⚙️ Installing dependencies..."
pnpm ci || true

echo "✅ Post-create setup complete!"
