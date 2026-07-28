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

**Reads are NOT normalized.** The generic GET passthrough forwards brain-core's response
verbatim, so client-side types for any proxied read describe what we *hope* arrives, not
what does. The normalizers in `server/brain/client.ts` sit only on paths that call them
explicitly (assistant grounding), so a field they defensively default may still be absent
in the browser. Known case: obligations carry the payable/receivable flag as `type` on some
records and omit it on others.

**Why:** a non-optional field in a client type for a proxied endpoint is an assumption.
Dereferencing it inside a `filter`/`map` during render throws and takes the whole screen
down via the error boundary instead of degrading. Fields that only *render* wrong are the
quieter half of the same bug — an absent number sailed past a `!== null` guard and printed
"NaN%".

**How to apply:** normalize the whole record once at the fetch boundary (a `lib/brain*.ts`
module with its own test), never with scattered `?.` at use sites — then the rendered type
is honest. Mirror whatever defaults `server/brain/client.ts` already applies to that entity,
except synthesized ids: the server's `randomUUID()` fallback would break React keys on the
client, since normalization re-runs on every refetch. Derive a stable id instead.

**Known drift:** GET /actions (Inbox review queue's only tenant-scoped PaymentIntent
list) is absent from the artifact but live — kept wired, flagged in CLAUDE.md; confirm
with brain-core owners before removing or relying on it further.
