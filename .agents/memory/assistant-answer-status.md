---
name: Assistant answer status
description: The Brain Assistant's answer/evidence contract and the cash-flow prompt boundary.
---

# Evidence is not an answer

The Brain Assistant may receive supporting records from `wiki/question` even when
the upstream service could not produce an answer. An evidence count must never be
used as proof that the answer succeeded.

**Why:** a refusal with attached records looks authoritative in the chat unless
answer state is carried separately from evidence.

**How to apply:** prefer the upstream `answered` boolean when present. Until all
responses provide it, recognize only known refusal wording as no-answer and keep
legacy non-refusal responses compatible. Render answered, no-answer, and
operational-error states separately; error context must not be labelled
"Grounded in ...".

# A refusal is not content, and non-chat surfaces must re-check the wording

Wiki Q&A answers a refusal with **HTTP 200 and prose**, so any surface that forwards
the raw answer will render "I couldn't produce a grounded answer…" as if it were
content. This has already reached a dashboard card, presented as the tenant's own
insight with no question in sight.

**Why:** the `answered` flag only falls back to refusal-wording detection when the
field is ABSENT. An upstream that sets `answered:true` and returns a refusal anyway
passes the flag check. Chat can afford to trust the flag because it labels a
no-answer as such; a surface that renders bare prose cannot.

**How to apply:** anywhere Wiki output is rendered as ordinary copy rather than as a
chat turn, gate on the `answered` flag AND the known-refusal wording. Treat a refusal
as a failure — return the same empty shape the unconfigured and error paths use so
the caller reaches its own neutral fallback, and never cache it, or a TTL will pin
the refusal on screen long after upstream recovers. Canned-prompt routes are the
usual offenders: they look like plain reads, so the answer-validity check gets skipped.

The assistant's cash-flow suggestion should describe trailing actuals, not a
forward forecast, until a projection capability exists.

**Why:** `/ledger/cash_flows` is a trailing-actuals surface, so "Forecast cash
flow" promises a capability the current evidence cannot support.

**How to apply:** use copy such as "Show recent cash flow" and update it only
when the backend can produce a real forward projection.