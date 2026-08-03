---
name: Assistant suggestion chips endpoint
description: Where tenant suggestion chips really come from — the route the brief named does not exist, and the payload has no rank field.
---

# The briefed path does not exist

A task brief specified `GET /wiki/suggested-questions` for tenant-aware assistant
suggestion chips. brain-core answers **`404 route_not_found`** for it. The deployed
surface is **`GET /assistant/questions`** — tagged `Wiki`, requires `wiki:read`,
optional `limit` (default 50, max 100).

**Why:** the brief was written ahead of the endpoint and guessed its shape. Building
on the named path would have shipped a permanently-404ing read whose failure is
invisible, because the fallback renders identically to the success path.

**How to apply:** when a brief says "once available", treat the path as a claim to
verify, not a fact. Grep the live spec (`https://api.brain.fi/v1/openapi.yaml`) AND
call both candidate paths against a real tenant before writing the hook — the
published spec under-reports, so a grep miss is a reason to probe, not to conclude.

# "Ranked" means the returned order — there is no rank field

`AssistantQuestion` is `{id, question, answer, status, source, evidence_ids,
metadata, created_at, updated_at}`. Nothing in it orders the list.

**Why:** a request to reflect "ranking order" invites inventing a sort key. Any
client-side sort would mean *we* chose the ranking, which defeats the purpose of
sourcing suggestions from the backend at all.

**How to apply:** preserve upstream array order verbatim; never `.sort()`. Eligibility
is `status === "suggested"` (`answered` is spent, `dismissed` was rejected), and an
absent or unrecognised status fails closed — passthrough reads are unnormalized, so
"I could not confirm this is suggested" must not become "show it".

# Fallback chips are not a false all-clear

Collapsing loading + error + empty onto one vetted fallback set is correct for this
surface, even though the codebase's standing rule forbids a failed read rendering as
a reassuring state.

**Why:** that rule governs surfaces that make a *claim* about the tenant's money or
setup. Prompt chips claim nothing, every fallback string still routes through the
same assistant pipe and works regardless of the read, and an empty chip row reads as
broken. The distinction is claim-bearing vs affordance — apply the rule accordingly
rather than mechanically.

# Two routes, one tail path

`/api/assistant/questions` (local Postgres) serves Anthropic-fallback Q&A rows to the
**audit log**. `/api/brain/assistant/questions` (brain-core passthrough) serves the
**suggestion chips**. Same tail, unrelated data. Dropping the `/brain` segment feeds
audit rows into the chip row with no type error.
