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

**Check the DEPLOYED spec before building against a new field.** brain-core serves its
live OpenAPI unauthenticated at `<baseUrl>/openapi.yaml` (e.g.
https://api.brain.fi/v1/openapi.yaml) — no token needed, so it is the cheapest possible
way to answer "is this actually callable yet". Grep it for the field or schema name.

**Why:** a merged brain-core PR is not a deployed one, and the gap has been days. Building
against a merged-but-undeployed field yields code where the value is permanently absent —
which, depending on how you treat "absent", either silently no-ops or deadlocks a state
machine. Staging does not necessarily lead prod: both have been observed serving
byte-identical specs, so staging is not a preview of what is coming.

**How to apply:** confirm merge state via `gh api repos/braindotfi/brain-core/pulls/N`,
then confirm deployment by grepping the live spec. Treat those as two separate facts. If
a field is merged but not deployed, gate on its *presence*, never assume its arrival.

**But the live spec UNDER-reports — absence from it does not prove a field is undeployed.**
`projection_status` on the raw-document read was absent from the published
`https://api.brain.fi/v1/openapi.yaml` yet is served by the deployed API, returning real
`projected` / `projection_failed` / `pending` values on a freshly seeded tenant.

**Why:** a spec grep was treated as proof the field had not shipped, and the conclusion
"our mirror is dormant" was reported to the user. The mirror was in fact live and already
populating. The spec is authoritative for *presence* (if it is there, it is callable) but not
for *absence* — brain-core ships response fields ahead of its published schema.

**How to apply:** to decide whether a response field is live, observe an actual response for
a tenant that should have it, rather than grepping the spec. A spec miss is a reason to probe,
not a reason to conclude.

**GET /actions does not exist — an earlier note here claimed it was "absent from the
artifact but live". That was wrong.** brain-core answers `404 route_not_found` for
`/v1/actions`, and the artifact has zero entries for it. The only actions route on the
surface is the per-agent `GET /agents/{agent_id}/actions`.

**Why:** the absence-from-artifact signal was explained away as drift instead of being
probed, so a permanently-404ing call sat behind the Inbox review queue and the assistant's
pending-approval grounding — both silently empty, and the emptiness was later mis-attributed
to seeding and policy problems. The artifact was right; the assumption of drift was not.

**How to apply:** the tenant-scoped money-path list is **GET /proposals**, a UNION ALL of
the proposals table and `ledger_payment_intents`. Rows with a non-null `payment_intent_id`
are the PaymentIntent queue (and are deliberately excluded from the non-financial proposals
hook for that reason); take ids from there and fan out to `GET /payment-intents/{id}`.
Filter queue membership on the **detail** status only — the merged row's own status has no
published mapping onto PaymentIntent statuses. Beware `/agents/{id}/actions` as an existence
probe: it returns `{actions: []}` for any string, including garbage, so a 200 proves nothing.

**Agent actor lookups: the catalog and the runtime registry are different namespaces.**
`GET /agents` and `GET /agents/{agent_id}` are a *catalog* keyed by agent_key
(`collections`, `treasury`, …) with no ULID field anywhere. Registered runtime agents live
at `GET /execution/agents/{id}`, keyed by ULID (`agent_01…`), and carry `display_name`.

**Why:** audit events emit `actor_ref.lookup = /v1/agents/{ULID}` — a path brain-core's own
catalog route cannot serve, so every agent-attributed audit row 404s and loses its name.
The BFF proxy was correct; the emitted lookup is upstream-wrong. Diagnosing this as "our
proxy has a bad prefix" wastes the investigation.

**How to apply:** re-point bare agent lookups to `/execution/agents/{id}` rather than
following the emitted path. Keep member lookups (`/v1/members/{id}`) as-is, and do not
rewrite sub-resources like `/agents/{id}/actions`.
