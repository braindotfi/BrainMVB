---
name: Why Needs Review is empty on a freshly seeded durable tenant
description: The agent-proposal chain breaks upstream of the BFF — no tenant policy, and canonical obligations never reach the ledger read model.
---

## An empty Needs Review is usually upstream, not an Inbox mapping bug

On a freshly seeded durable tenant, brain-core genuinely holds **zero** proposals, so
`GET /v1/proposals` correctly returns `[]`. Before touching Inbox filters or the BFF fetch,
read the audit log: every agent run records its outcome, and `proposal_id: null` on all of
them means there is nothing to display.

**Why:** an investigation assumed a missing proposal was a BFF/Inbox routing gap. It was not
— the agents never produced output. Changing the filters would have manufactured a bug.

**How to apply:** pull `/api/brain/audit/events` and group by `action`. The informative ones
are `agent.router.selected` (carries `execution_mode` and `selected_agent_id`) and
`agent.upload_projection.run` / `.run_failed` (carries `status` and `proposal_id`).

## The two failure modes observed

- **`"no active policy for tenant"`** — agents routed to `execution_mode: propose` or
  `execute` fail immediately with this error. A durable tenant is created without any agent
  policy, so the only agents that could produce a reviewable proposal never run to
  completion. This is a tenant-provisioning gap, not an app bug.
- **`status: "missing_evidence"`** — the agent ran, was routed `notify_only`, and produced
  nothing. Correctly absent from Needs Review by design.

## Canonical obligations do not reach the ledger read model

Document uploads project fine into canonical (`ledger.upload.projected` reports e.g.
`receivables: 7, obligations: 7` for an AR aging, `obligations: 15` for a payroll register),
but the follow-up `ledger.apar_projection.rebuilt` consistently reports **`obligations: 0`**
while passing counterparties through normally. That is the mechanism behind
`ledger/invoices` and `ledger/obligations` returning `[]`.

**How to apply:** "the document projected into the ledger" is two separate steps. Check the
`apar_projection.rebuilt` output counts, not just `upload.projected`. Transactions and
counterparties use a different path and are unaffected.

## "Brain Did 0 / Brain Detected 0" have different causes — don't treat them as one symptom

**Brain Did** renders audit records filtered to `eventType` `approved` / `auto_approved`
only. Those records exist only once a proposal has been *decided*, so a tenant can have a
large, healthy audit log and still show 0. It is blocked entirely by the missing tenant
policy.

**Brain Detected** is a merge of four sources: session reviews, the PaymentIntent review
queue, live ledger insights (reconciliation matches, subscription obligations, disputed
obligations, cash flow), and needs-review proposals. Only the last is blocked by the policy
gap — the subscription/dispute insight rows are blocked independently by the obligations
drop above.

**How to apply:** fixing the tenant-policy gap alone will populate Brain Did but only
partially populate Brain Detected. Both upstream bugs must land before that widget reflects
a seeded tenant honestly. Check each source endpoint separately before blaming one cause.

## An agent that is "enabled" can still never be selected — check evidence gates

The router only selects an agent whose `required_evidence` is satisfiable from the read
model. Collections requires `invoice` + `counterparty`, so while the apar rebuild drops
obligations (above), `ledger/invoices` stays empty, no `invoice.overdue` or
`receivable.aging_threshold_crossed` ever fires, and Collections is never selected — the
router falls back to a lower-confidence agent on the shared `ledger.upload.projected`
trigger instead.

**Why:** a Collections proposal was assumed missing because of Inbox filtering. The agent had
in fact never run: the audit log contained no collections entry at all, only `vendor_risk`,
`treasury` and `cash_forecast` selections.

**How to apply:** before suspecting routing, group `agent.router.selected` by
`selected_agent_id`. If the agent you expect is absent, it was never selected — compare its
registry `required_evidence` against what the read model actually holds. Absence from the
audit log is the signal; a missing proposal is only the downstream symptom.

## `/v1/agents/proposals` does not exist

The real endpoint is `/v1/proposals` (a UNION of the proposals table and
`ledger_payment_intents`). `/v1/agents/proposals` returns 404 `agent_not_found`. Don't
"correct" the BFF onto it.
