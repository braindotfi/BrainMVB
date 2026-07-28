# Replit Prompt — Fix acknowledgedStore Leaking Across Accounts

Copy/paste the block below into Replit (BrainMVB repo).

---

## Bug, confirmed

`client/src/lib/acknowledgedStore.ts` keeps acknowledged-insight records in a module-level,
in-memory variable (`let records: AuditRecord[] = []`) with no tenant/user/session key
anywhere. `InboxPage.tsx` pushes into it via `acknowledgeInsight()`; `AuditLogPage.tsx` reads
it via `useAcknowledgedRecords()` and merges it into the displayed audit log. Because this is a
single-page app, an auth transition (logout → new account, demo → fresh account, etc.) doesn't
necessarily remount the JS module, so a record acknowledged under one account can persist and
render on a completely different, freshly created account's Audit Log — a fresh account showing
fabricated activity it never actually had.

Confirmed via screenshot: a brand-new account's Audit Log showed "Acknowledged: Trailing cash
flow (USD)" alongside `tenant.created`, despite the user never having acknowledged anything on
that account.

## Fix

`authContext.tsx` already has exactly the right pattern for this — `setUser` is documented as
the "single funnel for user changes so the demo-data gate can NEVER drift from the signed-in
user," and already resets `demoDataEnabled` on every transition. `acknowledgedStore` was simply
left out of that funnel. Wire it in the same way:

1. Export a `resetAcknowledgedStore()` function from `acknowledgedStore.ts` that clears
   `records` to `[]` and notifies listeners (same pattern as `acknowledgeInsight`'s existing
   `listeners.forEach((listener) => listener())`).
2. Call it from inside `setUser` in `authContext.tsx`, alongside the existing
   `setDemoDataEnabled(!!u?.isDemo)` call — so it resets on every auth transition
   (`loginWithPassword`, `register`, `loginDemo`, `loginDemoFresh`, and `logout` via
   `setUser(null)`), not just logout. This matches the existing "never drift from the signed-in
   user" comment and covers every path, not just the ones that happen to call `logout()`
   explicitly.

### Explicitly out of scope

- Don't add persistence (localStorage/sessionStorage) to `acknowledgedStore` — it should stay
  in-memory and simply reset correctly, not become a new place for state to leak from a
  different angle (e.g. across browser tabs).
- Don't touch the real-account seed/demo-data gating logic (`demoDataEnabled`) — that's already
  correct; this is specifically about the one piece of state that wasn't wired into it.

### Process requirements

- `git fetch` and `git pull` before starting, work on a new feature branch.
- Add a test confirming: acknowledge an insight as one user, call `setUser` with a different
  user (or `null`), confirm `useAcknowledgedRecords()`/`acknowledgedInsightIds()` come back
  empty.
- Update `CLAUDE.md` if there's a section documenting the demo-data gating pattern, noting that
  `acknowledgedStore` is now part of it.
- Definition of done: a fresh account never shows an acknowledged-insight record it didn't
  create itself, verified by the new test and by manually reproducing the original repro
  (acknowledge something on one account, switch to a fresh account without a hard reload,
  confirm the Audit Log is clean); PR merged to main with CI green.

---
