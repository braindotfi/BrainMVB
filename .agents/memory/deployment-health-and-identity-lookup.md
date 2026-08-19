---
name: Deployment health and tenant identity preflight
description: Operational contracts for verifying the running BrainMVB build and checking tenant mappings before core cleanup.
---

BrainMVB's public `/health` response must identify the running build with `{ ok, version, service, commit }`; production bundles embed the source commit at build time rather than reporting a runtime placeholder. The internal tenant preflight must be read-only, use the platform-service auth header, and return only whether a `brain_identities` mapping exists.

**Why:** Merge status alone cannot prove which BrainMVB bundle is serving traffic, and brain-core cleanup cannot safely delete a tenant without checking the platform-side mapping first.

**How to apply:** Use `/health` for deployment verification and `/internal/brain-identities/:tenantId` with `X-Platform-Service-Auth` for cleanup preflights. Do not expose app user identifiers from the lookup.