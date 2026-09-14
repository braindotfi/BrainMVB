---
name: Canonical public origin and OAuth redirect URIs
description: Absolute URLs derive from one env-backed origin; a Google domain move is a code change AND a Cloud Console registration.
---

## The rule

Every absolute, user-facing URL the server builds — OAuth `redirect_uri`, password-reset
links, anything emailed or handed to a third party — derives from **one** canonical
origin helper, read per call from env with a code default. Never hardcode the host at a
call site, and never build it from the incoming `Host` header or the Replit proxy
hostname.

**Why:** a domain move left the old host baked into two independent call sites. One
failed loudly (Google sign-in, `redirect_uri_mismatch`); the other failed **silently** —
the retired host answers 404, so production password-reset emails pointed at a dead
domain with nothing to alert anyone. The durable lesson is the asymmetry: when a host
changes, grep for every absolute URL, because the loud failure is not the dangerous one.

**How to apply:** read the origin through a function, not a module-level const — this
module is imported at load time by the route registrar, so a captured constant freezes
whatever env looked like before a deploy-time value was set. Validate an operator-supplied
origin (https, no path/query/credentials/fragment) and fall back to the default: a
trailing slash alone produces `https://host//api/...`, which is not the registered string
and reproduces the same outage while the code looks right.

## A domain move is two changes, not one

Changing the code is half. The redirect URI must **also** be registered on the OAuth
client in Google Cloud Console → Credentials → Authorized redirect URIs. Google matches it
**exactly** — scheme, host, path, no trailing slash. Until both sides say the same string,
sign-in keeps failing regardless of what the code sends.

The error text tells you which half is wrong: it echoes the `redirect_uri=` the app
actually sent. Old host → fix the code. New host and still refused → the Console
registration is missing.

Also check on a move: OAuth consent screen authorized domains, JavaScript origins, cookie
`domain`, CORS allowlists. This codebase pins none of those, which is why only the two URL
builders broke.

## Environment split

Do **not** set `APP_BASE_URL` in the `shared` environment. Password-reset links
deliberately prefer the Replit preview domain in development (dev and production use
separate databases, so a dev token must link back to the dev app), and a shared
`APP_BASE_URL` outranks that and sends dev reset links to production.

## Known gap

Google sign-in cannot complete in a Replit preview: the flow starts on the rotating
preview host which owns the state cookie, but Google redirects to the canonical domain,
which never sees that cookie, so the callback fails state validation. The button is still
advertised there. Pinning to the canonical domain is deliberate — the preview hostname
rotates and can never be pre-registered — so the fix is to stop offering the control in
previews, not to unpin it.
