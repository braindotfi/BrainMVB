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

The assistant's cash-flow suggestion should describe trailing actuals, not a
forward forecast, until a projection capability exists.

**Why:** `/ledger/cash_flows` is a trailing-actuals surface, so "Forecast cash
flow" promises a capability the current evidence cannot support.

**How to apply:** use copy such as "Show recent cash flow" and update it only
when the backend can produce a real forward projection.