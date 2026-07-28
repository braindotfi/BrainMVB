---
name: Auth-transition reset funnel
description: Module-level, user-scoped client state leaks across accounts in this SPA unless it resets in the single auth funnel; why logout()-only wiring is the bug.
---

# Module-level state leaks across accounts in an SPA

An auth transition does **not** remount JS modules. Any module-level state that
isn't keyed to a user survives into the next account and renders there as that
account's own data — a freshly created account showing activity it never had.
This is a data-integrity bug, not a staleness bug.

## The rule

All user-scoped module state resets in ONE funnel that every user change flows
through, and that funnel runs on *every* transition — password login, register,
demo login, fresh-demo login, session bootstrap, and logout.

**Why:** wiring a reset into `logout()` alone is the specific mistake that causes
this. Account→account switches (demo → fresh demo, or any re-login) never call
`logout()`, so a logout-only reset silently misses the most common path. The
demo-data gate was already correct because it lived in the funnel; the
acknowledged-insights store was not, and leaked (found 2026-07 via a screenshot
of a brand-new account's Audit Log showing a prior account's acknowledgement).

**How to apply:** when adding any module-level store the UI reads per-user, add it
to the funnel — not to a caller. Keep such stores in memory; persisting them
(localStorage/sessionStorage) moves the leak to a channel the funnel can't reach,
e.g. across browser tabs.

## Testing this without a DOM

The test env is vitest with `environment: "node"` — no jsdom, no testing-library,
and client tests are `.test.ts` (pure logic), not `.test.tsx`. Two things make
this class of fix testable anyway:

- `authContext.tsx` imports cleanly in the node env, so a plain exported function
  holding the funnel's side effects can be called directly and asserted.
- For a `useSyncExternalStore` store, export the subscribe/snapshot pair. That
  lets a test assert exactly what the hook would render **and** that subscribers
  were notified — which is the mechanism that makes a mounted page re-render.
  Asserting only "the array is empty" misses a reset that forgets to notify.

Also worth pinning: reset must early-return when already empty, or subscribers
get re-rendered for a no-op.

**Always run a negative control** — revert the wiring, confirm the leak tests
actually fail, restore. A green test on a store-level assertion can pass while
the real wiring is absent.

## Browser harness for this is not worth it

Attempts to render a live probe page failed twice: `client/public/*.html` is
served verbatim so bare `react` imports are never rewritten, and Vite runs with
`appType: 'custom'` so HTML never reaches its middleware — the Express catch-all
in `server/vite.ts` serves the SPA `index.html` for every non-API path. Serving a
scratch HTML entry would mean editing `server/vite.ts`. Don't; the node test
covers the mechanism.

## Known remaining gap

`membersStore.clearMembers()` is still called from `logout()` only, so the members
cache has the same leak shape on account→account switches. Left alone
deliberately (out of scope at the time), not because it's correct.
