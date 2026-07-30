---
name: brain-core list caps and by-id availability
description: Why bulk list reads silently under-return, which entities can be fetched by id instead, and which proposal fields have no upstream data at all.
---

## List endpoints cap themselves, silently

brain-core's ledger list endpoints return a fixed page regardless of the `limit`
sent — `/ledger/counterparties` returns 20 rows whether you ask for 100 or 500 —
and there is **no `next_cursor` or total on the response** to signal truncation.

**Why this matters:** any feature that prefetches a collection into an id → entity
map is silently correct on a small tenant and silently broken on a large one. The
cited record just isn't in the map, so it degrades to raw ids with no error
anywhere. It is not reproducible on a small demo tenant, so believe the report
over the local repro.

**How to apply:** treat a bulk list pass as a *prefetch*, never as the guarantee.
Whatever must resolve has to have a by-id fallback for the refs the page missed.

## By-id routes: available for some entities, not all

Routed: `/ledger/counterparties/{id}`, `/ledger/invoices/{id}`,
`/ledger/transactions/{id}`.
**Not routed: `/ledger/obligations/{id}` → 404.** Obligations resolve only via the
bulk pass, so they stay subject to the cap above.

Note the list path is `/ledger/obligations`; a bare `/obligations` is a 404.

## Choosing which collection to read

There is no published id-prefix → entity registry, so never infer the endpoint
from the ULID prefix. Two honest sources, in priority order: the wiki URI names
its own collection (`wiki:/invoices/inv_…`), then brain-core's declared `kind`.
Prefer the wiki spelling — the same id arrives both ways, and a mislabelled bare
ref otherwise sends the lookup to the wrong endpoint. A ref with neither is left
raw rather than brute-forced across every endpoint.

## Proposal fields that do not exist upstream

Probed directly and confirmed absent — do not build UI that implies them:

- **Counterparty email.** Counterparty records carry no email field.
- **Reminder / message history.** Nothing tracks it; `/collections/reminders`,
  `/reminders`, `/messages`, `/notifications`, `/agents/messages` are all 404.
- **Pre-approval message text.** `GET /proposals/{id}` returns an *identical key
  set* to the list row — no draft or message body, and `action_type` is null.
  brain-core does not generate the outbound text until approval.

**Why:** on an approval surface, a plausible-looking invented row is worse than a
sparse card — the approver acts on it. Skip the row instead.

## Enrichment must be time-bounded

Enrichment runs while the review-queue request is blocked on it. Catching upstream
errors is not enough: a hung socket has nothing to stop it. Give every upstream
call an `AbortSignal` timeout *and* the whole join an overall deadline, then serve
whatever resolved.
