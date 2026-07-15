#!/usr/bin/env bash
set -e

# The build environment already has node_modules from the workspace snapshot.
# Reinstalling from scratch (rm -rf + npm cache clean + npm install) takes
# 10+ minutes and causes the provision step to timeout. We only need to build.
# If node_modules is truly missing (edge case), install it quickly.
if [ ! -d "node_modules" ]; then
  echo "==> Installing dependencies (missing node_modules)..."
  npm install --legacy-peer-deps --no-audit --no-fund
fi

echo "==> Building application..."
NODE_OPTIONS="--max-old-space-size=4096" npm run build

echo "==> Build complete."
