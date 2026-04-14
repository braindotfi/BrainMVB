#!/usr/bin/env bash
set -e

echo "==> Removing node_modules..."
rm -rf node_modules

echo "==> Clearing npm cache..."
npm cache clean --force

echo "==> Installing dependencies..."
npm install --legacy-peer-deps --no-audit --no-fund

echo "==> Building application..."
npm run build

echo "==> Build complete."
