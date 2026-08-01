---
name: Client route integrity (wouter dead links)
description: Why navigate() targets silently 404 in this app and how to guard them
---

- **A `navigate("/x")` to an unregistered path fails silently.** wouter has no notion of an
  unknown route — it just falls through to the last `<Route component={NotFound} />`. There
  is no console error, no type error, and no build failure. The route table in
  `client/src/App.tsx` and the `navigate()` call sites are completely unlinked as far as the
  compiler is concerned.
  **Why:** a Brain Assistant grounded-citation type navigated to `/bills`, a route that was
  never added. Every obligation citation dropped the user on NotFound and looked like a
  broken backend link. The string appeared exactly once in the whole repo — in the dead call
  itself — so nothing hinted it was unbacked.
  **How to apply:** when a link "404s", first grep the target against
  `<Route path="...">` in App.tsx before investigating the data or the backend. A dead
  client route looks identical to a bad id from upstream. `client/src/pages/sections/assistant-citation-routes.test.ts`
  pins the Assistant's targets against the real table; extend that pattern rather than
  trusting review to catch the next one.

- **Deep-link query params need an effect, not just a `useState` initializer.** Several pages
  seed tab/selection state from the query string in a `useState(() => ...)` initializer, which
  runs ONLY on mount. The Brain Assistant is a panel that stays open across routes, so it can
  navigate to a page that is already mounted — the URL changes, the initializer never re-runs,
  and the click appears to do nothing.
  **How to apply:** for any param a *cross-page* surface can target, sync it in a
  `useEffect` on the search string, and CONSUME the param (rewrite the URL with `replace`
  after applying it). Without consuming, re-clicking the same link is not a URL change, so
  the effect won't fire again after the user manually switches away. Pages that keep the
  param instead navigate on every internal change to stay in sync — either discipline works,
  but mixing them is what produces "the link works only the first time".

- **Prefer deriving tab/filter state from the URL each render over mirroring it into state.**
  A `useState` seeded from the query string is a *copy*, and it only agrees with the address
  bar until something else moves the URL — a link from another panel, the back button, a
  redirect. Then the pills and the URL disagree and neither is obviously wrong. Deriving it
  (`const tab = parse(search)`) makes the URL the single source of truth and deletes the
  whole class of desync; the setter then only navigates.
  **How to apply:** if a one-shot side effect must also run off a param (consuming a draft,
  opening a builder), key its effect on `search` — not `[]` — and guard it with a `useRef`
  so it stays one-shot. Mount-only effects miss the case where the panel is already mounted.

- **An unrecognised query value is as silent as an unregistered path.** wouter 404s unknown
  *paths*, but an unknown `?tab=` value just falls through to whatever default the resolver
  picks, so a stale link lands on the wrong panel looking perfectly normal. When renaming or
  retiring a tab, keep the old slugs resolving to their new home, and pin the links: the
  guard in `assistant-citation-routes.test.ts` walks every `?tab=` literal in `client/src`
  and fails if one names a tab the resolver does not know.

- **Convention: primary navigation pushes, secondary filters replace.** Ledger tab changes
  use a normal navigate so back works between tabs; the sub-filter rows inside Vendors and
  Rules use `replace: true` so clicking through filters does not fill history with entries
  the user has to walk back out of. Don't "fix" a filter that fails a back-button test
  without checking which of the two it is.

## Nested tabs: one owner per URL, and the URL wins

When a page's section lives in `?section=` and a nested tab lives in `?tab=`,
any click that writes one parameter re-triggers the effect reading the other.
If the outer section is held only in local state, clicking an inner tab rewrites
the query string, the outer effect re-reads a stale `?section=`, and the user is
thrown back to a section they left minutes ago.

**Why:** both effects observe the same `useSearch()` string; a partial write is
indistinguishable from a deliberate navigation.

**How to apply:** make the URL authoritative for BOTH parameters — outer nav
clicks must write `?section=` (with `replace: true`), not just call `setState` —
and drop the inner parameter when leaving the section that owns it. Retiring a
top-level route: keep the path as a redirect, don't just delete it.
