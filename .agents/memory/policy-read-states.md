---
name: Approval-policy read states
description: The four distinct answers a policy read can give, which collapse is dangerous, and where the distinction is fragile.
---

## The rule

An unknown must never render as a permissive known.

**Why:** "No approval policy is active on this tenant yet" is a statement of
fact. If an auth failure renders that sentence, the app tells a finance lead
their tenant has no approval policy when it may have a strict one they merely
could not read. The reverse mistake (a real "no policy" showing as "Unknown") is
unhelpful but safe — it withholds a fact rather than inventing a permissive one.

**How to apply:** a policy read has FOUR answers, not two — it succeeded, there
is genuinely no policy, the read was refused, or the read broke. Decide the
copy for each separately before writing any policy-derived sentence. Never let
one branch serve both "no rule applies" and "we could not read the rules".

## Where this is fragile

The BFF preserves core's status and body verbatim, so the distinction leaves the
server intact. The **client** is where it degrades: the shared query fn flattens
status and body into a single `Error` string, so nothing downstream can branch
on a status code. The "no policy" case is recovered by substring-matching the
error message for core's error code.

Two consequences worth knowing before designing new copy:

1. That substring match is a coupling to a body shape, not a typed contract. If
   core renames the code or the proxy stops nesting the body, a genuine "no
   policy" silently starts rendering as "Unknown" — safe direction, but wrong.
2. **Refused and broken reads are indistinguishable in the client.** Any UI
   wanting to say something actionable ("re-authenticate" vs "retry") needs the
   status plumbed through properly first; it cannot be recovered from the
   flattened message.

Regression cover: `scripts/qa-policy-read-states.mjs` drives all of these
answers and asserts the "no policy" and "unknown" states stay visibly different.
