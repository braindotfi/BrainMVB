---
name: Deployment health and tenant identity preflight
description: Operational contracts for verifying the running BrainMVB build and checking tenant mappings before core cleanup.
---

BrainMVB's public `/health` response must identify the running build with `{ ok, version, service, commit }`; production bundles embed the source commit at build time rather than reporting a runtime placeholder. The internal tenant preflight must be read-only, use the platform-service auth header, and return only whether a `brain_identities` mapping exists.

**Why:** Merge status alone cannot prove which BrainMVB bundle is serving traffic, and brain-core cleanup cannot safely delete a tenant without checking the platform-side mapping first.

**How to apply:** Use `/health` for deployment verification and `/internal/brain-identities/:tenantId` with `X-Platform-Service-Auth` for cleanup preflights. Do not expose app user identifiers from the lookup.
## Publishing attests the workspace tree against origin/main

`build.sh` derives `BUILD_COMMIT` from `scripts/resolve-build-commit.sh`, which
refuses to build unless `git diff --quiet origin/main --` holds — the tracked
workspace tree must be byte-for-byte identical to `origin/main`. Publishing from
a feature branch, or from a workspace that merely *contains* main, fails with
"the deployment source differs from origin/main; publish the synced main tree".

**Why:** the SHA baked into the bundle, and reported at `/health`, is meant to
attest that production runs reviewed GitHub main rather than whatever sat in the
workspace. The corollary catches people out: merging a PR on GitHub does not
change production at all. The workspace has to be synced to the new main and
republished, so a merged fix can sit unshipped while `/health` still reports the
older commit.

**How to apply:** before asking anyone to publish, sync the workspace to
`origin/main` and confirm `git diff --quiet origin/main --` is clean. Afterwards
read the deployed commit back from `/health` — that value is what any
build-SHA-pinned gate (such as an approved-SHA environment variable) must match.
