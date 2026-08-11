---
name: Vite re-optimizing a lazily-reached dep looks like duplicate React
description: A heavy dep imported from one rarely-visited surface gets discovered mid-session, triggering a re-optimize + reload that surfaces as a null React inside that library.
---

# Vite re-optimizing a lazily-reached dep looks like duplicate React

If a heavy dependency (charting, editors) is imported from **one surface that is
not visited on boot**, Vite's dep pre-bundling does not see it at startup. The
first time the surface renders, Vite discovers the dep, re-optimizes, and forces
a page reload. During that window the library can briefly observe a **null
React** and throw `Cannot read properties of null (reading 'useRef' / 'useState')`
from inside the library's own stack.

This reads exactly like a duplicate-React / mismatched-renderer bug, and the
React error overlay will even suggest that. **It is not one** — verify with a
single-version check before refactoring anything.

**Why:** the stack trace points at the library, and the suggested causes in
React's "Invalid hook call" message do not include "your bundler is mid-reload".

**How to apply:** add the dep to `optimizeDeps.include` in `vite.config.ts` so
it is pre-bundled at startup instead of discovered later.

Unrelated but same file: a two-step edit that adds a *usage* before its
*definition* will show a real `X is not defined` via HMR that resolves itself on
the next hot update. Check the timestamps before chasing it.
