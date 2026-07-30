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
