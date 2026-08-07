---
name: Joining a payable to the invoice that billed it
description: Obligations carry no invoice reference, so the link is inferred — the rules that keep the inference from attaching the wrong bill, and why a failed invoice read must not read as "no invoice".
---

# Payable → invoice join

An obligation from `/ledger/obligations` has **no reference to the invoice that billed
it**. Its `source_ids` point at the raw ingested *document*, never at an invoice. So
any UI that wants to show "the bill behind this payable" has to infer the link.

The inference: **counterparty + absolute amount + due DAY**. Observed in the reference
tenant, a bill obligation and its AP invoice agree on counterparty and on the due-date
timestamp exactly, so this is a solid join rather than a fuzzy one. Day resolution (not
timestamp equality) is still the right granularity — nothing guarantees the two feeds
keep identical precision, and a millisecond apart is not two debts.

**Why:** the failure this guards against is not "no popup opens". It is a payable
opening a popup that shows a *different* record's invoice number, PO and source
document — a confident, wrong answer about money owed.

## Rules that make the inference safe

- **Counted, one-for-one — never a presence check.** Consume each candidate invoice as
  it is matched. A tenant can owe the same counterparty the same amount on the same day
  twice, one invoiced and one not; a set/presence test marks *both* invoiced and sends
  the uninvoiced one to another record's document.
- **Candidates are unpaid AP invoices only.** An AR invoice is money owed *to* the
  tenant; presenting one as the bill behind a payable inverts who owes whom.
- **A missed match is the safe direction.** Unmatched just means the reduced popup. A
  wrong match means wrong facts. Never loosen the key to raise the hit rate.
- Payroll and tax legitimately never match — they were never invoiced. That is the
  normal case, not a matching failure.

## "No invoice" and "couldn't check" are different states

If the invoice feed is unreadable (loading *or* failed), every row looks uninvoiced. A
popup that then says "this payable has no invoice on file" is stating a falsehood
produced by an outage. Pass the unknown through and say so. This is the general
`unreachable-data-all-clear` trap in its most quotable form: the fallback isn't empty
data, it's a confident sentence.

## Payment intents are invoice-keyed

An intent record is keyed by `invoiceId`, so a payable with no invoice **cannot be
proposed for payment at all**. Copy for those records must not promise a future
approval step ("when Brain proposes this, you'll approve…") — that workflow does not
exist for them. Describe the present state instead.

## One label, one source

The Payables list badge and the detail popup header chip describe the same record. When
the badge read brain-core's `status` and the popup derived its own chip from the due
date, a tax payable dated in the past but still marked `due` showed **"Due" in the list
and "Overdue" in the popup you got by clicking it**.

**How to apply:** when a record appears on two surfaces, the label must come from one
exported helper, not from two plausible computations. "Is it overdue by the calendar"
and "what does the upstream call it" are different questions; pick the upstream status
and show the date as its own field.

## Shared presentation does not mean shared IDs

The live CloudOps example confirms the obligation and invoice are distinct backend
records: `obl_*` and `inv_*` have different IDs, while counterparty, amount, and due
day match. Cash Flow safely renders the invoice twin because it has bill details, while
Payables renders the obligation source.

**Why:** users need to recognize one debt across surfaces without the UI claiming an
invoice foreign key that brain-core does not provide.

**How to apply:** share the row layout, status-pill vocabulary, signed amount styling,
and popup component for the record type actually opened. For a matched invoice
projection in Cash Flow, carry the obligation's status so the same debt does not show
different lifecycle pills merely because a different source record was rendered.
