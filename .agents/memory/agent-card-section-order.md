---
name: Agent card canonical section order
description: The fixed section order every live agent proposal card renders in, and the honesty rules governing the two sections brain-core has no field for.
---

# One card, eleven agents

Every public proposal type renders through the SAME shared card (the live modal),
not a per-agent component. The contract states this outright. So a section change
is a change to all eleven agents at once — there is no "just the cash forecast
card" edit, and a per-agent special case has to be a conditional inside the shared
card (the collections message draft is the model to copy).

# Canonical order

1. Why Brain Suggested This
2. Confidence
3. Why This Needs Your Decision
4. Linked Evidence
5. *(agent-specific block, e.g. the collections message draft)*
6. Recommended Action
7. What Happens Next

**Why:** the frames put the reasoning before the advice — an approver reads the
signals and the model's certainty, then the facts, then what Brain suggests, then
the consequences of each branch. Recommended Action used to sit first, which
showed the conclusion before any of its support.

Two structural consequences worth not re-litigating:

- The section is titled "Why This Needs Your **Decision**", not "…Your Call".
- There is no separate "If This Is Wrong" section. The reject branch is a row
  inside What Happens Next so every branch can be compared side by side. Reject
  keeps a red-tinted shell there: it lost a full warning box in that move, and the
  branch that discards the agent's work must not become the quietest line.

# The two sections brain-core does not back

The frames also show a **confidence caption sentence** and per-agent detail
modules (cash-flow chart, vendor account-on-file vs on-invoice comparison,
treasury movement + edit amount). `presentation` carries no field for any of
them. They are deliberately NOT built. Do not add them by inventing copy or by
reusing an unrelated field that happens to be a sentence — `policy.explanation`
already backs the "Flagged by" line and is not a statement about confidence.

**Why Brain Suggested This** is derived, and the derivation is the honest part:

- Source 1: `policy.trace[].checks[]`, but ONLY from entries with
  `matched === true`. The trace lists every rule the engine *considered*; a rule
  that did not fire had no bearing on the proposal, so its checks are not reasons.
  An entry that omits `matched` is excluded too — fail closed, same as policy scope.
- Source 2: `details.ranked_signals` (fraud_anomaly and vendor_risk carry these).
- Neither present → empty list → the section disappears. It never falls back to
  generic copy.

**How to apply:** a matched rule's trace can contain both satisfied and failed
checks, so the per-bullet verdict must stay visible (glyph **plus** a "Met" /
"Not met" text tag — colour alone fails colour-blind and screen-reader users).
Flattening the verdict lets an approver read a condition that PASSED as the thing
that escalated the record. A bullet whose source stated no verdict gets the
neutral arrow and no tag; do not label what you were not told.
