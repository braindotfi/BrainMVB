---
name: brain-core proposal presentation contract vs. live data
description: Where the proposals read-model doc disagrees with what the live tenant actually sends, and the rules that fall out of it for any proposal-rendering surface.
---

# The read model documents an intent; the live rows are the contract

Verified against the live pending proposals on the reference production tenant (2026-07-30).
Every point below is a place the doc reads one way and the wire says another.

## The doc's per-domain action table is aspirational — bind to `available_decisions`

The contract doc has a table mapping each `proposal_type` to action labels ("Mark reviewed /
Hold transaction" for fraud, "Proceed / Dismiss" for dispute, "Approve, Reject" for most).
Live rows do **not** honour it: compliance *and* `fraud_anomaly` both offer `[acknowledge]` and
nothing else, while treasury / `cash_forecast` / `subscription` offer `[approve, reject]`.

**Why:** a card or list built from the doc's table renders an Approve button on a row whose only
legal decision is `acknowledge`, and the write is rejected by the API.

**How to apply:** drive every decision control from the record's own `available_decisions`, and
keep the wire value inside the documented write set (`approve`/`reject`/`acknowledge`/`undo`) —
an id outside it should render disabled rather than fire. This applies to **list rows as much as
detail views**; the quick-action buttons on a list are the easiest place to reintroduce the bug.

## `policy.policy_id` is null in practice, so the fallback chain IS the path

`matched_rule_id` is populated only for compliance findings. For everything else both id fields
are null and the only real attribution left is the policy trace's matched rule plus
`required_approvers`. Treat "policy_id → matched_rule_id → other policy content → omit" as the
normal path, not an edge case, and omit the line rather than inventing an authority.

## Confidence band and percentage legitimately disagree

Core sends a band and a percentage that are computed differently — a live row bands one way at
47%. Never recompute the band from the pct; render what arrived.

## Core writes raw ids into PROSE, not just structured fields

Headlines and narratives arrive as `"tx_01KY… fraud anomaly risk is elevated"` and
`"Compliance review for inv_01KY… found policy_violation"`. Resolving only the structured
evidence/fact fields still leaves ULIDs in the first thing a human reads.

**How to apply:** resolve ids inside prose too, drop the ones that resolve to nothing (an
unresolved ULID must never reach a primary view), and keep them in the technical section. Any
*new* surface that prints core prose — list, card, notification — needs the same treatment.

Watch for a second-order effect: once ids become names, two facts that looked distinct can
become the same string (a fraud row's transaction and counterparty), so de-duplicate after
resolution, not before.

## Notify-only does not mean non-decidable

Routing an inbox by `mode !== "notify_only"` strands compliance and fraud rows that carry a real
`acknowledge` decision. Route by whether the record offers a decision at all.

## Validating against a live tenant from the dev box

A dev login can be attached to a real tenant by inserting a `brain_identities` row whose
`external_ref` is the *production app user id* (dev rows normally set `external_ref` = local user
id). The session exchange then mints a normal member session and every read works.

**Why:** it is the only way to see real multi-type data render; a fresh demo tenant has none.

**How to apply:** insert the row, verify **read-only**, and delete both the row and the throwaway
user afterwards. Never submit a decision — the proposals belong to a real workspace.
