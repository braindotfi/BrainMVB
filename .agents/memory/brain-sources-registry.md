---
name: brain-core sources registry in BrainMVB
description: How BrainMVB consumes GET /v1/sources, why demo "fake-connected" rows hide their disconnect control, and the type-vs-record trap that breaks real tenants.
---

# The connector registry is a *fourth* source surface

BrainMVB's "Sources Brain Reads From" list and the Add-a-Source category badges were
historically built from three **local BFF** surfaces only (bank connections, tool
connections, documents). brain-core's connector registry is a separate, fourth surface.

**Why it matters:** any claim that "counts are already handled upstream" is false for
BrainMVB unless someone explicitly wired the registry in. The local counts were always real
and computed client-side — never stale, never hardcoded — just not sourced from brain-core.

**How to apply:** when adding a new source surface, add it to the *counting* helper too, with
a dedupe rule. Local and upstream populations can describe the same real connector.

# Demo tenants get restricted rows

brain-core seeds demo tenants with fake-but-real-looking connections carrying metadata
`disconnectable: false`, `disconnect_hidden: true`, `sync_disabled: true`. The affordance
must be **absent from the DOM**, not disabled and not a no-op — a disabled control still
reads as "this is fake."

**How to apply:** compare `=== true` / `=== false`, never truthiness. A real tenant's source
carries no metadata at all, and a truthy string like `"true"` must not be able to strip a
real control. Treat array metadata as absent (every `.foo` on an array is `undefined`,
which silently defeats the checks).

# The type-vs-record trap (this one bit us)

Source *records* are keyed by id; the category/provider picker rows are keyed by **connector
type**. Applying a per-record restriction at type level means one seeded demo row strips the
disconnect affordance off a *real, removable* connection of the same provider type.

**Rule:** a locally-connected tool is always removable — the local record is ours to sever
regardless of what upstream says about its own seeded row. Only a purely-upstream restricted
connection hides the control.

**How to apply:** any time you fold per-record state into a type-keyed UI row, ask what
happens when one record of that type says yes and another says no.

# Upstream reality check (as of 2026-07-29)

`GET /v1/sources` returns an empty list for **every** BrainMVB-reachable tenant on
`api.brain.fi`, including a freshly provisioned one whose seed had demonstrably completed.
200-with-empty (not 403) means the member token does hold `raw:read` — the tenant genuinely
has zero sources. The seeding either isn't deployed there or doesn't fire for
BrainMVB-provisioned tenants; tenant creation sends no demo flag, so brain-core can only
infer demo-ness from the founder email.

**How to apply:** don't burn time re-diagnosing an empty sources list client-side. Verify
render logic against injected fixtures and confirm deployment status with brain-core owners.

# Disconnect is an agent-token call

`DELETE /v1/sources/{id}` needs `raw:write`, which is an **agent** scope — the member token
cannot do it. Route it through the WRITE_ROUTES allowlist with `principal: "agent"`.
