---
name: Assistant tier order and core-side traces
description: The chat endpoint answers from three tiers; the first one never touches core, which makes core-side audit traces misleading during investigations.
---

# The assistant answers from three tiers, and core is only the second

The chat endpoint tries, in order: a local deterministic ledger computation, then core's
Wiki Q&A, then a model with a ledger-grounded prompt. The first tier returns before the
second is ever called.

**Why this matters for debugging:** a core-side investigation into "which route served
this answer" will find **zero** events for the wiki route and correctly conclude the
request never reached it. That is a true finding that points at the wrong conclusion —
the natural next inference is "something is mis-routing" or "there is legacy code", when
in fact the request was answered before core's Q&A was consulted, exactly as designed.
Note the local tier still calls core for its *ledger reads*, so "core was involved" and
"core's Q&A answered" are different claims.

**How to apply:** when an assistant answer looks wrong, identify which tier produced it
before investigating either system — the response names it. Do not treat an absence of
core Q&A traces as evidence of a routing bug.

## The tier order is load-bearing

The deterministic tier exists to keep questions with exactly one numeric answer away from
any model, and it only works if it runs first. Reordering it would leave every
behavioural test green while silently disabling the protection, so the order itself needs
a guard rather than trust.
