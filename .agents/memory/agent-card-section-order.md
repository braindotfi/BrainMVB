---
name: Agent card canonical section order
description: The fixed section order every live agent proposal card renders in, which of the four card surfaces an "all cards" instruction has to reach, and the honesty rules for sections brain-core has no field for.
---

# "All cards" is four surfaces, not one

The live modal is one shared card across all eleven public proposal types — a
section change there hits every agent at once, and a per-agent special case must
be a conditional inside it (the collections message draft is the model to copy).

But the app has **four** card surfaces, and a user saying "remove X from all
cards" means all four:

1. the live proposal modal (shared, all 11 agent types, built from the shared
   card primitives),
2. the legacy seeded-record detail sheet — its own `Proposal` data model, its own
   `recommendedAction` / `whatHappensNext` fields, and it does **not** use the
   shared primitives, so fixes to those never reach it,
3. the static mock agent modal,
4. the live ledger-insight modal (read-only observations, no decision).

Check all four before reporting an "all cards" change done. Only the first is
covered by editing the shared primitives.

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
  inside What Happens Next so every branch can be compared side by side.
- **There is no Technical Detail section.** It was deleted, and with it the
  overflow cap that used to spill surplus fact rows into it — a cap with nowhere
  to spill silently discards facts, so every derived row now renders. The raw
  identifier facts it used to hold are simply not shown; the card reads as names.

# Verdicts and salience, as the frames actually draw them

The frames draw every reason bullet as a plain arrow, and every bullet they show
is a condition that held. The resolution that satisfies both the design and the
earlier failure-signal requirement: plain grey arrow for passed *and* unknown
checks (neither claims a verdict), red glyph **plus** a "Not met" text tag only
when the check explicitly failed. Never colour alone. A bullet whose source
stated no verdict gets the neutral arrow and no tag — do not label what you were
not told.

Reject's outcome row carries **no** tinted shell. The supplied reject artwork is
itself a dark-red disc, so the destructive branch keeps its weight without a
wrapper the frame does not have. (An earlier note here required the shell; that
predated the artwork.)

# The sections brain-core does not back

The frames show a **confidence caption sentence** and per-agent detail modules
(cash-flow chart, vendor account-on-file vs on-invoice comparison, treasury
movement). `presentation` carries no field for any of them. They are deliberately
NOT built. Do not invent copy, and do not reuse an unrelated field that happens
to be a sentence — `policy.explanation` already backs the "Flagged by" line and
is not a statement about confidence.

**Recommended Action** is likewise purely `presentation.recommendation`. The BFF
passes `presentation` through untouched, so a card missing this section means
core sent nothing, not that the client dropped it. There is no second source, and
inventing advice about money movement is the worst available invention.

**Why Brain Suggested This** is derived, and the derivation is the honest part:

- Source 1: `policy.trace[].checks[]`, but ONLY from entries with
  `matched === true`. The trace lists every rule the engine *considered*; a rule
  that did not fire had no bearing on the proposal, so its checks are not reasons.
  An entry that omits `matched` is excluded too — fail closed, same as policy scope.
- Source 2: `details.ranked_signals` (fraud_anomaly and vendor_risk carry these).
- Neither present → empty list → the section disappears. It never falls back to
  generic copy.

# The Edit button has no decision behind it

The frames draw Reject / Edit / Approve, but brain-core offers no `edit`
decision and there is no route that would accept one. Edit is therefore
synthesised as a permanently disabled button, flagged as *core's* gap rather than
the client's (the disabled-button copy for "core offers an id we cannot submit"
is a different sentence from "core has no such action"). It is added only when
the card already offers approve or reject: a notify-only `acknowledge` finding
has nothing to edit, and on a record core says accepts no decision at all a lone
disabled Edit would imply the card is actionable.

**How to apply:** if core ever ships a real `edit` decision, the synthetic one
must not duplicate it — the builder skips insertion when the id is already
present, and that behaviour is test-pinned.
