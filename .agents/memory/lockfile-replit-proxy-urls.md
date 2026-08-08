---
name: Regenerating package-lock.json inside Replit breaks GitHub CI
description: Lockfile hazards when changing dependencies inside Replit - proxy URLs baked into resolved URLs, the packager re-running install behind you, and npm audit fix's blast radius
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

## The packager re-runs `npm install` behind you, after your commit

Changing `package.json` can trigger the environment's own install some seconds later,
with no prompt and no output in your shell. It re-resolves the tree, so it will both
reintroduce the proxy URLs you just rewrote **and** move packages you never touched.

Observed in one pass: 61 resolved-version differences appearing *after* a clean commit —
unrelated transitive majors, and one package dropped from the tree entirely.

**How to apply:** after committing any dependency change, re-check `git status` and
re-count proxy URLs. Verify what was *pushed* (`git show HEAD:package-lock.json`) rather
than the working tree, because the two can legitimately disagree by then. If a later
install shows unrelated packages moving, suspect the packager before suspecting your own
change.

## `npm audit fix` is not scope-safe, even without `--force`

Plain `npm audit fix` will bump transitive dependencies across **major** versions and
remove packages from the tree, well outside the advisories it is fixing. It fixes the
count, not the thing you asked it to fix.

**Why:** it optimises for the audit summary, and the summary does not care which
subsystem it rewrites to get there. A tidy "17 fewer vulnerabilities" can contain a
silent breaking change in a subsystem nobody was reviewing.

**How to apply:** for a scoped security pass, move the specific packages instead —
`npm update <pkg>` when the fixed version already satisfies the parent's declared range,
a direct install when it does not, and an override only as a last resort. Then diff the
lock's resolved versions and confirm the change set is exactly what you intended, since
the audit total alone will not tell you.
