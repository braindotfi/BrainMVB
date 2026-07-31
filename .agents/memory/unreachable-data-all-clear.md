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

**Fan-out is the sneakiest instance.** A hook that lists ids then fetches each
one has *two* failure modes, and the second is easy to miss: the list succeeds,
one detail call fails, and that row is filtered out of the result with no error
flag. The row is known to exist — its id came back on the list — so this is a
confirmed record silently disappearing, and always downwards. Treat a failed
detail fetch as incomplete. Lookups that only decorate a row (a display name)
are the exception: losing one costs a label, not a record.

**A partial list needs saying too.** When one of several feeds fails but rows
still render, a row count implies completeness. Warn above the list; don't rely
on the empty state alone, which by definition never fires.

**A warning banner is the worst case, because it leaves nothing on screen.** The
usual instance renders a misleading sentence you can at least read and doubt. A
banner that only mounts when it has something to warn about renders *nothing* when
its source fails — there is no element to be suspicious of, and the screen is
pixel-identical to the healthy all-clear. Any conditional warning needs an explicit
"couldn't check" branch; returning `null` on failure is never right.

**A child running its own copy of the parent's query cannot participate in the
parent's reachability handling.** When a parent already derives null-vs-empty for a
feed, a child that re-queries the same key re-introduces the bug locally no matter
how careful the parent is — and it is easy to miss, because the parent looks
correct in isolation. Pass the parent's `data` plus its failure flag down as props
instead of re-reading the key.

**Beware asserting only the happy path in headless checks.** These states are
invisible to normal QA and to screenshots, because the broken state is the one that
looks fine. Force each feed to 503 (`ctx.route(...)` fulfilling 503) and assert on
the rendered sentence. `npm run qa:degraded` does this for the Ledger; extend it
rather than re-deriving the setup.

Confirmed instances found and fixed: the Ledger's liabilities summary; the
Decisions timeline (an unreachable approval queue rendered "Nothing needs your
attention right now"); the Ledger Accounts tab ("No connected accounts yet"); the
overdue-receivables banner (vanished entirely); the rule builder's vendor picker
("No trusted vendors yet" offered as fact). The user has asked for this pattern to
be actively looked for on other surfaces, not just fixed where it was first
spotted.

## Pending is not "answered with nothing"

Splitting a feed into up/down is not enough. Three conditions matter: **down**,
**still answering**, **answered** — and only the last one entitles a surface to
make a claim about what does or does not exist.

A search bar that says "No matches" while one feed is still in flight is making
the same false all-clear as one that says it during an outage. It is *harder* to
catch, because it is true again a second later: it never survives to a
screenshot, and any QA script that settles for a couple of seconds after
navigation will always find every feed already answered.

**Why:** shipped exactly this in a global search bar; review caught it, the
degraded-state QA did not, because the QA waited 2600ms before typing.

**How to apply:** when an empty state is a *claim* ("no matches", "no vendors",
"you're all caught up"), gate it on every source having resolved, and name only
the sources that actually replied. Pin it by delaying a route (`route.continue()`
behind a timer), not just failing it — and assert both that the pending copy
shows AND that the honest conclusion returns once the feed lands.

## Empty-state copy must scope itself to what was asked

"No matches in decisions and accounts" is a different sentence from "No matches".
When a surface aggregates several feeds, the empty message should enumerate the
ones it actually searched, so a partial outage cannot masquerade as a complete
answer.
