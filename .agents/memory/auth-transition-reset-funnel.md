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

## loginDemoFresh must also clear the query cache

`loginDemoFresh` can be triggered while a real user is already authenticated (the
"Continue with Demo" button is reachable without logging out first). Unlike every
other destructive auth path (`logout`, `deleteAccount`), the original code did NOT
call `queryClient.clear()` or `clearMembers()`. Result: all React Query caches from
the real user persisted — Settings showed the real company name, email, tenancy
figures — until each stale timer fired.

**Fix (2026-08-04):** `loginDemoFresh` now calls `queryClient.clear()` and
`clearMembers()` before `setUser(u)`, matching the pattern used by `logout`.

**Why the email leaked separately:** `userContact.ts` stores an `emailOverride`
module-level variable (set by the Edit Email flow). This was not in
`applyUserScopedResets`, so `d@damonnam.com` persisted even after `setUser(demoUser)`
was called. Fix: `resetUserContact()` exported from `userContact.ts` and added to
`applyUserScopedResets`. Note: resets in-memory override only; localStorage values
are NOT wiped so the real user's edits survive their next login.

**Server-side:** `POST /api/auth/demo-fresh` now calls `req.session.regenerate()`
when there is an existing authenticated session, issuing a new cookie. Without this,
the same session-ID carries forward with a different principal (session fixation).

**Rule reinforcement:** any new auth path that switches the active user (not just
logging in from null) must call `queryClient.clear()` + `clearMembers()` in addition
to `setUser()`.

## Known remaining gap (pre-2026-08-04)

`membersStore.clearMembers()` was called from `logout()` only (resolved above).

## In-flight requests during cookie rotation

When an auth path regenerates the session cookie (notably fresh-demo login),
an already-mounted user-scoped panel can still have a request in flight under
the old principal. The auth transition must expose a short-lived transitioning
state; request-owning panels should block new sends, abort active requests, and
ignore late responses until the new user is settled.

**Why:** clearing React Query and switching the rendered user does not cancel
plain `fetch` calls. A late response can otherwise write old-account data into
the newly selected account, or surface a misleading auth failure during the
cookie race.

**How to apply:** for every long-lived user-scoped request with local state,
couple an `AbortController` and a generation/identity guard to the auth
transition. Reset the guard when the new user is observable.

## Persisted stores: key by user, do NOT clear in the funnel

The funnel also runs on **session bootstrap** — restoring the existing session on
every page load calls it with the same user. So a persisted (localStorage) store
that *clears* itself in the funnel is wiped on every refresh: the UI accepts the
write, shows it, and loses it on reload, with no error to explain why. This looks
exactly like a broken save and is easy to misdiagnose as a storage bug.

**Rule:** in-memory user-scoped stores clear in the funnel; persisted ones
**re-point a per-user key** (`<prefix>_{userId}`) from the funnel instead. Both
keep data from crossing accounts, but only the second survives a reload.

Two details for a `useSyncExternalStore` store built this way:
- Cache the parsed snapshot. Parsing storage inside `getSnapshot` returns a new
  object identity every render and spins forever.
- Reads before the scope is set (no user yet) must return a **stable** empty
  value, and writes must no-op rather than write to an unscoped key.
