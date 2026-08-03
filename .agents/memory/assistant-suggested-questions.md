---
name: Brain Assistant suggestion chips
description: Which brain-core route actually backs the assistant's suggestion chips, why the look-alike route is a silent trap, and how to probe brain-core for route existence without fooling yourself.
---

# Assistant suggestion chips

## The chips come from `GET /wiki/suggested-questions`

Response shape:

```json
{"suggestions":[{"intent_id":"cash_flow_listing","display_text":"Show recent cash flow","usage_rank_score":0}]}
```

`intent_id` is an enum (`transaction_count|transaction_sum|transaction_average|transaction_listing|cash_flow_listing|invoice_listing`). Requires `wiki:read`.

## Two look-alike routes; one is a silent trap

`GET /assistant/questions` is an unrelated **legacy** route over the old
`assistant_questions` table. It answers `200 {"questions": []}` for every tenant
and always will.

**Why this matters:** it differs in path, response field (`questions` vs
`suggestions`) *and* row shape (`question`/`status` vs
`display_text`/`intent_id`). So wiring to the wrong one fails **silently** — the
defensive parse finds nothing, the fallback chips render, and the surface looks
completely healthy. This shipped wrong once and only surfaced because someone
asked why the chips never changed.

**How to apply:** if a tenant-aware surface renders its fallback forever, suspect
the endpoint before the tenant's data. Diff the response *field names* against
what the parser reads — an always-empty list from a plausible route is the tell.

## An unauthenticated 401 never proves a route exists

brain-core runs auth **before** routing. Every path answers
`401 auth_token_missing` without a token — including deliberately fake ones like
`/wiki/__nonexistent__` and `/__totally_fake__` (both verified).

**Why:** "I got a 401, not a 404, so the route is mounted" is a natural
inference and it is wrong on this API. It was the stated evidence for one route
decision here.

**How to apply:** to test whether a brain-core route exists, call it
**authenticated** — `200` vs `404 route_not_found` is the only reliable signal.
Always include a known-fake path as a control in the same probe batch. Probe
through the BFF with a real session cookie:
`curl -b <cookie> localhost:5000/api/brain/<path>`.

## Eligibility is server-side; ordering is upstream

The spec states the route "returns only currently eligible questions". There is
no `status` field to filter on — a client-side eligibility rule would
re-suppress rows core already cleared.

`usage_rank_score` is present but is **the tenant's all-time invocation count**,
i.e. core's *input* to a ranking it has already applied — not the rank itself.
Never sort by it: on a new tenant every count is `0`, so a client sort turns a
deliberate order into an arbitrary one. Render upstream order verbatim.

## No BFF route needed for reads

`server/brain/proxy.ts` ends in a catch-all GET passthrough that forwards any
GET on the member token, so new brain-core **reads** need no proxy entry. Only
writes are allowlisted. Adding a dedicated read route creates dead code shadowed
by the passthrough — check the passthrough before writing one.
