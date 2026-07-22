---
name: brain-core API surface wiring
description: How BrainMVB wires the brain-core surface — artifact is sole truth, declarative write allowlist, known /actions drift.
---

The api-surface artifact (attached_assets/api-surface.brainmvb_*.json) is the sole
source of truth for what's callable on brain-core; it beats Brain_API_Specification.yaml
wherever its `drift` section says they disagree. Scope checks are per-route
(`requireScope` in handlers) — never assume gateway enforcement.

**How to apply:** writes go through the declarative `WRITE_ROUTES` table in
`server/brain/proxy.ts` (one row per endpoint: mount, upstream path builder, principal
member|agent, scope). Reads flow through the generic member-token GET passthrough.
Tenant-scoped upstream paths (policy/*, tenants/export) always take the tenant id from
the session, never the client. Excluded forever: POST /execution/execute (dead 422 —
the real execute is /payment-intents/:id/execute), /execution/mcp, platform-secret
routes outside tenancy.ts. Invariant 6 in bff-invariants.test.ts pins this.

**Known drift:** GET /actions (Inbox review queue's only tenant-scoped PaymentIntent
list) is absent from the artifact but live — kept wired, flagged in CLAUDE.md; confirm
with brain-core owners before removing or relying on it further.
