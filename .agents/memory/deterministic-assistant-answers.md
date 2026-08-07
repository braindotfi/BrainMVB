---
name: Deterministic assistant answers
description: Questions with one numeric answer bypass the model entirely; the hard part is proving the ledger read was whole before quoting a figure.
---

# Deterministic assistant answers

A class of assistant questions has exactly one correct answer that is a number — what we
owe a named counterparty, which customer invoices are overdue, total payroll owed. These
are computed from the ledger with no model in the loop, ahead of both `wiki/question` and
the Anthropic fallback.

**Why:** both model paths answer from a capped, prose-flattened snapshot. A model
narrating a silently-truncated snapshot produces a confident wrong number, and the user
has no way to tell. Prose can afford to be vague about money; a figure cannot.

**How to apply:** the routing returns a three-way result, and the distinction matters.
An *answer* and a *refusal* are both final. `null` means "not one of these questions" and
lets the normal paths run — it is the only non-answer that is not a refusal.

## An absent cursor field is not an explicit null

The single most dangerous edit in this area. Three different states hide behind "no next
page":

- `next_cursor: "abc"` — more pages, follow it.
- `next_cursor: null` *present in the payload* — a statement that the list ended.
- **no `next_cursor` field at all** — the endpoint has promised nothing.

brain-core's invoice endpoint is the third case, and it caps silently at 20 rows with
HTTP 200. Reading that silence as "complete" yields a plausible, precise, understated
total. Where no cursor is declared, the only usable evidence is the batch size: a page at
or above the smallest known cap might be a cap, so it is treated as incomplete; a page
below it cannot be, because a server capping at 20 does not return 7 when it has more.

Lowering that cap constant to make more answers succeed is the dangerous edit — it
reintroduces exactly the silent truncation the design removes.

## Tolerant parsers must be un-tolerated at the figure boundary

`listObligations` coerces an unrecognised payload to zero rows on purpose, so the prose
grounding path degrades instead of throwing. Reused unchanged under a total, that same
tolerance renders as a calm "you owe nothing" — a parse failure wearing the costume of an
answer. Any caller that states a figure has to re-impose strictness and treat an
unparseable shape as a failed read.

## One phrasing is not a capability test

Core's Wiki Q&A **can** read receivables from the invoice feed and answer "how much does
&lt;customer&gt; owe us" with an exact figure, citing the AR invoice. But asked the
direction-ambiguous "what do we owe &lt;customer&gt;", it answers "No open payable
obligations were found" — confidently, with no hint that a large balance runs the other
way. Same counterparty, same tenant, same minute.

A single ambiguous phrasing therefore produced the flatly wrong conclusion "core is
payables-only too, so routing there fixes nothing". The real shape is an intent-matching
gap: the data is reachable, the question routing is what fails.

Measured shape of core's receivables support, so nobody has to re-probe:

- **Per-counterparty AR works and is robust** — every direction-explicit phrasing tried,
  across several customers, returned the exact open balance citing the AR invoice.
- **Direction-ambiguous "what do we owe &lt;customer&gt;" is answered confidently and
  payables-only** — a true statement about payables presented as if it settled the
  relationship. This is the actual defect.
- **Aggregate AR is unsupported** — "total accounts receivable" style questions decline.

**Why:** capability probes double as the evidence base for retire-vs-keep decisions. A
false negative here argues for keeping a redundant local system, or for not fixing an
upstream bug that is cheap to fix — an expensive mistake in the direction that looks
conservative.

**How to apply:** probe any Q&A capability with at least three phrasings — one
direction-explicit, one ambiguous, one differently-worded synonym — before concluding it
cannot do something. Report per-phrasing results, never a single verdict. Note that
retrieval can also attach evidence from an entirely different counterparty while
declining to answer, so evidence presence is not evidence of relevance.

## Name resolution must not imply a direction

Counterparty payloads are not guaranteed to carry a `type`, so a resolver that matches on
name alone cannot tell a vendor from a customer — it will happily resolve a customer and
then report, truthfully, that no payables exist. A flat "nothing outstanding" then reads
as reassurance about a relationship that may carry a large balance the other way.

**Why:** every step is individually correct, so nothing looks broken; the error is that a
category mismatch is presented as a settled account.

**How to apply:** when a payables-only sweep returns zero, say which side of the ledger
the counterparty is on before saying the amount is zero, and treat an *absent* type as
unknown — keep the weaker claim rather than guessing a side.

## Naming a category is not naming a vendor

"Do we owe taxes?" and "how much do we owe in rent?" name a kind of liability. Refusing
them with "no counterparty called taxes" is wrong twice: the user never named a vendor,
and the normal assistant answers it fine. Resolution matches *known* counterparty names
against the question rather than parsing a name out of it, and only declares a vendor
missing when the term is capitalised and is not a known spend category.

**Why:** matching known names means the only names resolvable are names that exist. A
name that is a strict substring of another match (`Cloud` inside `CloudOps`) is dropped
so the specific vendor wins instead of registering as an ambiguity.
