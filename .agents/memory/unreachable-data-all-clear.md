---
name: Unreachable data must never render as an all-clear
description: A recurring defect shape in this app — a failed or absent read falling through to a reassuring success/empty state.
---

**The defect shape:** a read fails or returns nothing, the value is falsy, and a
`!value` / `length === 0` branch renders a *reassuring* state — "You are all
caught up", "No outstanding liabilities", "No issues found", a zero total, a green
tick. The user cannot distinguish "we checked and you are fine" from "we could not
check."

**Why it matters here:** this app reports money owed, overdue receivables and
pending approvals. A false all-clear on a financial surface is worse than an error
— it actively tells the operator not to act. It also fails silently in exactly the
conditions where it matters most (core unreachable, tenant not provisioned yet).

**How to apply:** any surface reading remote data needs *three* states, not two —
unavailable, empty, and populated. Model absence as `null` and emptiness as `0` /
`[]` at the data layer, and make callers branch on reachability before they branch
on count. `lib/liabilities.ts` and its test file are the reference implementation
of the null-vs-zero contract.

**Where to look:** anywhere a query result is consumed as
`data?.things ?? []` and then tested only for `.length`. The `??  []` is what
erases the distinction — the nullish read and the genuinely empty read become the
same value one line before the branch that needed to tell them apart.

**The hook layer is where it originates.** The brain-core hooks are the common
root: they fetch with `retry: false` and return `data?.x ?? []` while exposing
only `isLoading`, never `isError`. A page literally cannot tell the two states
apart, so the fix belongs in the hook (surface `isError`) before the page. Check
the hook's return shape first — some already expose it and the page just ignores
it, which is a one-line fix.

**A partial list needs saying too.** When one of several feeds fails but rows
still render, a row count implies completeness. Warn above the list; don't rely
on the empty state alone, which by definition never fires.

Confirmed instances found and fixed: the Ledger's liabilities summary, and the
Decisions timeline (an unreachable approval queue rendered "Nothing needs your
attention right now"). The user has asked for this pattern to be actively looked
for on other surfaces, not just fixed where it was first spotted.
