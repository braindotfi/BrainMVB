#!/bin/bash
set -e
npm install
# Non-interactive: stdin is closed during post-merge, so --force avoids hanging
# on drizzle-kit's data-loss confirmation prompt.
npm run db:push -- --force
