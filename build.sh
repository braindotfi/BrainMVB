#!/usr/bin/env bash
set -e

echo "==> Removing node_modules..."
rm -rf node_modules

echo "==> Clearing npm cache..."
npm cache clean --force

echo "==> Installing dependencies (clean)..."
npm ci --legacy-peer-deps

echo "==> Building application..."
npm run build

echo "==> Build complete."
