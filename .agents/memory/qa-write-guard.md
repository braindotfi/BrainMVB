---
name: QA browser scripts must deny writes by default
description: Why headless QA scripts run behind a write guard, and the three ways a write gets declared
---

Headless QA scripts sign in as a **real tenant with a real session cookie**. Any
POST the app fires while a script drives it lands on live data. A script that
means to intercept a write is one stale URL pattern away from performing it —
a glob that omits `**` before a query string stops matching the moment the app
appends one, and the request goes through silently.

**Rule:** a QA session denies every non-GET by default. A write happens only if
the script declared it:

- **stub** — intercepted and answered locally; counts hits.
- **expect-blocked** — deliberately denied; the surface under test must cope.
- **permit** — a real write, scoped to one callback, named with a reason.

Undeclared writes to the app's own origin fail the run. Writes to other origins
(wallet-SDK and analytics telemetry, which fire constantly) are aborted too but
only reported — a guard that cries wolf every run is a guard someone disables.

**Why:** detection after the fact ("delete anything the probe left behind") only
works for the leak you predicted, and only if cleanup runs. Default-deny inverts
that: a forgotten interception becomes a failed check, not a live write.

**How to apply:** every new QA script starts from the shared session helper.
Two non-obvious facts it exists to encode:

- Route handlers match in **reverse registration order**, so a catch-all
  installed first acts as the fallback and later specific patterns win.
  `unroute` falls back to the guard rather than to the network.
- **APIRequestContext (`page.request` / `context.request`) bypasses route
  handlers entirely**, and Playwright ignores attempts to patch its methods in
  place. Scripts must use the wrapped context the helper returns; a static scan
  in the self-test fails the suite if any script reaches around it.

The suite runs a self-test first that provokes each violation and asserts it was
stopped, so "the guard is armed" is verified per run rather than assumed.
