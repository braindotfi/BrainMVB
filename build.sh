#!/usr/bin/env bash
set -euo pipefail

# Replit assigns REPLIT_GIT_COMMIT_SHA to its deployment snapshot. That value
# is not guaranteed to identify a commit in the GitHub repository. Resolve the
# source tree to the checked-out origin/main commit before bundling so /health
# reports a canonical, verifiable GitHub SHA.
BUILD_COMMIT="$(bash scripts/resolve-build-commit.sh)"
export BUILD_COMMIT
echo "==> Attesting GitHub source commit: ${BUILD_COMMIT}"

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
