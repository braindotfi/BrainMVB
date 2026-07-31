---
name: Regenerating package-lock.json inside Replit breaks GitHub CI
description: Replit's npm registry proxy gets baked into resolved URLs, which do not resolve on a GitHub runner
---

Replit sets the npm registry to `http://package-firewall.replit.local/npm/` (global
config, not the repo `.npmrc`). Any `npm install` / `npm install --package-lock-only`
run here writes that host into the lock's `resolved` URLs. On a GitHub runner the
host does not exist, so `npm ci` dies with `EAI_AGAIN … getaddrinfo`.

After regenerating a lock, rewrite the URLs before pushing:

    http://package-firewall.replit.local/npm/  ->  https://registry.npmjs.org/

Integrity hashes stay valid — the proxy serves identical tarballs — so a text-level
replace is safe and preserves formatting. Verify by counting hosts across
`packages[].resolved`; the answer should be one host.

**Why:** this hid behind a different failure. The repo's lock had also drifted from
`package.json`, so `npm ci` aborted with `EUSAGE` *before reaching the network* — the
proxy URLs were already there and invisible. Fixing only the drift traded one red CI
for another, and the second failure looked like a test failure until the log showed
DNS. Whenever a CI fix "reveals" a new error, suspect an earlier abort was masking it
rather than assuming the fix regressed something.

**How to apply:** any change to `package.json` or the lock, plus any post-merge
setup that regenerates it. A CI guard failing on `package-firewall.replit.local` in
the lock is the durable fix; without it, the next person to touch dependencies from
Replit reintroduces this silently.
