---
name: BFF vitest setup
description: How the BFF safety-invariant test suite is wired and the env quirks that constrain it
---

# BFF safety tests

`npm test` runs `vitest run`. Suites live at `server/brain/bff-invariants.test.ts`
(token routing, no-actor, provision fail-hard, secrets boundary) and
`client/src/lib/approvalRejections.test.ts` (rejection mapping). They are the
platform-side twins of brain-core invariants; changing `server/brain/*` must keep them
green.

## Non-obvious constraints

- **Use a dedicated `vitest.config.ts`, do NOT let vitest extend `vite.config.ts`.**
  `vite.config.ts` reads `node_modules/tweetnacl/nacl-fast.js` and loads Replit plugins
  at eval; pulling that into tests is fragile and unnecessary. The dedicated config
  re-declares the `@` and `@shared` path aliases (vitest will not read tsconfig paths on
  its own, and `server/*` imports `@shared/schema`).

- **vitest version is firewall-constrained.** The Replit package firewall blocks
  vitest 2.x with "Critical CVE" (E403). Install `vitest@latest` (4.x worked). If a
  pinned older version is ever needed, expect the same block.

## Faithful proxy testing pattern

The token-routing / no-actor / secrets tests mount the REAL `createBrainProxyRouter()`
on a localhost express server (with a middleware injecting `req.session.userId`) and
mock brain-core at the `globalThis.fetch` boundary. The mock matches on the URL path
with the query string stripped (the invoice read appends `?limit=100`). Provisioning
returns distinct, greppable member/agent tokens so the secrets-boundary assertion is
non-vacuous. `getBrainSession` caches per app user, so call `clearBrainTokenCache()` in
`beforeEach`.
