---
name: Headless UI walkthroughs of auth-gated screens
description: How to script a real logged-in browser pass over the app (screenshots + rendered text) when the Screenshot tool can't authenticate.
---

# Driving the real UI as a logged-in user

The built-in app-preview screenshot tool has no way to carry a session cookie, so it can only
ever see the logged-out state. For "walk the product like a user would" verification, drive a
real browser instead.

## The working recipe

1. **Playwright resolves from the npx cache, not `node_modules`.** `npx playwright install`
   works, but a script in `/tmp` cannot `import "playwright"`. Import by absolute path:
   `import { chromium } from "/home/runner/.npm/_npx/<hash>/node_modules/playwright/index.mjs"`.
   Find the hash with `find /home/runner/.npm/_npx -maxdepth 6 -type d -name playwright`.
2. **Playwright's bundled chromium will not launch** — it needs `libglib-2.0.so.0` and friends,
   which are not in the Nix store. Do not try to install the individual libs. Install the Nix
   `chromium` package and point Playwright at it:
   `chromium.launch({ executablePath: <which chromium> })`.
3. **Reuse a curl session rather than logging in through the browser.** Log in with
   `curl -c jar.cookies`, parse `brain.sid` out of the Netscape jar (tab-separated, field 6 is the
   name, field 7 the value; the line is prefixed `#HttpOnly_`), and `ctx.addCookies([...])` with
   `domain: "127.0.0.1"`. This avoids re-triggering an expensive fresh-tenant seed per run.
4. **Skip onboarding** with `ctx.addInitScript(() => localStorage.setItem(...))` for the
   onboarding-complete key — a fresh demo user otherwise lands in the wizard, not the app.
5. **Dump `document.body.innerText` alongside each screenshot.** The text is far cheaper to scan
   than an image and is what you actually quote in a report; keep the PNG for the visual check.

**Why:** several rounds were lost to the module-resolution and missing-`.so` failures, and to
re-seeding tenants because the browser did its own login.

**How to apply:** any request to verify what *renders* (as opposed to what an endpoint returns).
Note that tab-switching needs explicit clicks — most list screens default to a "Needs Review"-style
tab that is empty even when the other tabs are full, so a single screenshot per route will
under-report the data that exists.

## Reuse a session instead of provisioning a tenant

Do **not** log in through "Continue with Demo" just to look at a screen. It provisions a whole
production tenant (non-idempotent, founder-email-unique), and that tenant then seeds
asynchronously, so the first pass under-reports anyway.

`QA_COOKIE` does not have to come from a fresh login — an existing demo user's session works.

**The shortcut for obtaining one is deliberately not written down here.** It is an authentication
bypass, and this directory is committed alongside the application code, so it travels with every
clone and fork of the repo. Ask the repo owner for the current procedure.

<!-- TODO(owner): replace the line above with the out-of-repo location once one exists. -->

**How to apply:** however you obtain it, treat the value as a live credential — write it to a file
rather than into a shell variable or an env var you might echo, never print it, give the session a
short expiry, and delete it as soon as the run finishes.

## A freshly provisioned demo tenant seeds asynchronously

`POST /api/auth/demo-fresh` returns 200 long before the tenant's records exist. A
screenshot taken immediately after it under-reports the data — one pass showed two
proposals, a later pass on the same tenant showed three. Do not read a missing row
as a bug in the code you just wrote; re-shoot once seeding has settled and compare
counts against the API directly.

**How to apply:** when a before/after pair disagrees on row counts, check the
timestamps before you go hunting for a regression.

## Nix chromium is safe to install mid-session

Installing a system dependency reboots workflows. Sessions here are Postgres-backed whenever
`DATABASE_URL` is set, so a scripted login survives the reboot. Check that before installing if
you are holding an expensive session.

## The harness is not durable; the checks should be

`/tmp` gets cleared out from under a session (mid-run, more than once), taking
scratch scripts, the cookie jar and the npx playwright cache with it. The npx
cache hash also changes when it is reinstalled, so any hardcoded
`/home/runner/.npm/_npx/<hash>/...` path is a time bomb.

- Resolve the playwright path at run time: `ls -d /home/runner/.npm/_npx/*/node_modules/playwright/index.mjs | head -1`.
- Chromium in the nix store is versioned too — glob it (`/nix/store/*chromium-125*/bin/chromium`).
- Anything worth re-running belongs in `scripts/` behind an npm script, not `/tmp`.

## Demo tenants expire, and the symptom looks like a bug

A stale session cookie can still authenticate while its tenant has been purged
by the demo TTL cleanup (`[demo-cleanup] purged N expired demo tenant(s)` in the
workflow log). Every feed then returns 200 with an empty list, so a UI that is
working correctly reports "no results" and looks broken. Check the log line and
the tenant's data before debugging the component.

## Never hardcode a search term in QA

Seeded record names are per-tenant. A literal like `"account"` matched nothing
on a tenant whose accounts are named "Operating" / "Reserve" / "Brightline
Treasury Wallet" — three checks failed for a component that was fine. Derive the
known-good term from the API at run time and abort loudly if none can be found:
without a term that genuinely matches, "found nothing" and "nothing seeded" are
indistinguishable and the run proves nothing.

## A control swap silently rots the QA scripts

The QA scripts are plain `.mjs` — nothing type-checks them, so replacing a native
`<select>` with a custom button/listbox leaves `page.selectOption` calls in place
that only fail at run time, and they throw rather than fail a check, killing the
rest of the run.

**How to apply:** whenever a form control changes shape, grep `scripts/` for the
Playwright API tied to the old control (`selectOption`, `check`, `fill`) before
assuming the suite still exercises that screen.

## Don't identify a screen by data-dependent markers

A routing check that detects "which panel is open" by looking for a control
inside each panel breaks as soon as a feed is degraded: with the keys API down,
the API Keys panel renders an unavailable card instead of its usual button, and
the *routing* assertion fails for a reason that has nothing to do with routing.

**How to apply:** have the container report its own identity
(`data-<thing>-tab={tab}` on the tabpanel) and assert on that, then assert the
panel is non-empty separately. Also poll past provisional states ("Loading…",
a "checking" attribute) before judging a degraded-state assertion, or the check
races the query's retry.
