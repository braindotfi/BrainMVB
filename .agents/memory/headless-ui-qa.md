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

## Nix chromium is safe to install mid-session

Installing a system dependency reboots workflows. Sessions here are Postgres-backed whenever
`DATABASE_URL` is set, so a scripted login survives the reboot. Check that before installing if
you are holding an expensive session.
