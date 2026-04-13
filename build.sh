#!/usr/bin/env bash
set -e

echo "==> Removing node_modules..."
rm -rf node_modules

echo "==> Clearing npm cache..."
npm cache clean --force

echo "==> Installing dependencies..."
npm install --legacy-peer-deps --no-audit --no-fund

echo "==> Restoring Crossmint stub..."
mkdir -p node_modules/@crossmint/client-sdk-react-ui/dist
cp stubs/crossmint/package.json node_modules/@crossmint/client-sdk-react-ui/package.json
cp stubs/crossmint/index.js node_modules/@crossmint/client-sdk-react-ui/dist/index.js
cp stubs/crossmint/index.js node_modules/@crossmint/client-sdk-react-ui/dist/index.cjs

echo "==> Building application..."
npm run build

echo "==> Build complete."
