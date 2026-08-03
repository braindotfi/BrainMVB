---
name: Live insight card structure
description: How read-only brain-core ledger insights should follow the shared agent-card design, which sections they can honestly fill, and where Acknowledge fits.
---

Read-only ledger insights use the shared proposal-card primitives and visual
rhythm: agent header (name without the word "Agent"), hero, labeled sections,
key facts, evidence, confidence, chart, and pager when applicable.

**Why:** the Figma agent card is the product-wide visual standard, but ledger
insights are derived client-side from `/ledger/*` reads. They have no proposal
lifecycle, no policy trace, no ranked signals, and no `available_decisions`.

**How to apply:**

- Reuse the shared card sections and spacing. Section *names* may match the
  decision cards where the section answers the same question — the reasoning
  section is "Why Brain Suggested This" on both, because renaming it does not
  change what it contains.
- Every section is data-gated on the insight's own fields. An insight builder
  that sets no `confidence`, `fields` or `evidenceIds` gets no Confidence, no
  Why This Needs Your Decision and no Linked Evidence — the fix for a section the
  design shows but the record cannot fill is upstream data, never invented copy.
- The chart section is titled for **what it plots**, not for the shape of it:
  the cash-flow insight titles it "Cash Flow Details", not "Trend".
- **Acknowledge is the exception to "no decision footer".** It writes to the
  local acknowledgement store (audit trail + queue removal), not to brain-core,
  so it is legitimately offerable while Approve/Reject are not. Wire it to the
  same pending/acknowledged state the row's own button uses, and resolve the row
  by *insight id* — row ids and insight ids are different namespaces. It stays
  visible-and-disabled once acknowledged so the card does not change height.
- Never add Approve, Reject, fabricated warnings, or unsupported evidence links.
