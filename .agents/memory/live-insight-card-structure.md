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
- **But a section gated on a derivation must have an else branch.** The reasoning
  line was computed only when the window held enough points to compare, so on a
  thin tenant the card silently lost its Why section and read as broken. When the
  data cannot support the usual sentence, say what triggered the record and what
  the data cannot show — that is still derived, and still honest.
- **Recommended Action on a record with no decision is a property of the record,
  not of the agent**, so it is one shared sentence: nothing to approve, review
  and acknowledge. Never a per-agent recommendation — advice about money that
  nothing in the response supports is the worst available invention.
- Row presentation is shared between Overview and the Inbox through one presenter
  module covering ALL four live sources, not just insights. They list the same
  records from the same hooks, and each spelling its own pill and second line out
  is how the same record came to read two different ways. The insight row wears
  the same amber agent pill as every other pending row.
- The chart section is titled for **what it plots**, not for the shape of it:
  the cash-flow insight titles it "Cash Flow Details", not "Trend".
- **Acknowledge is the exception to "no decision footer".** It writes to the
  local acknowledgement store (audit trail + queue removal), not to brain-core,
  so it is legitimately offerable while Approve/Reject are not. Wire it to the
  same pending/acknowledged state the row's own button uses, and resolve the row
  by *insight id* — row ids and insight ids are different namespaces. It stays
  visible-and-disabled once acknowledged so the card does not change height.
- Never add Approve, Reject, fabricated warnings, or unsupported evidence links.
