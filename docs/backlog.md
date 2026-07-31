# Backlog

Things worth doing that are not part of the current IA sequence. Not tasks, not
scheduled — a place to keep an argument so it does not have to be reconstructed
from memory later.

---

## Make "fail open vs fail closed" a first-pass check, not a review catch

**Why this is here:** three consecutive items shipped a first pass in which an
error or missing-data condition defaulted to *permissive*, and code review caught
each one independently:

1. **Ledger's false all-clear** — a failed fetch rendered as an empty queue, so
   an unreachable data source looked like "nothing needs your attention".
2. **The review queue's silent drop** — a list-then-detail fan-out dropped a row
   whose id it had already seen, quietly shrinking the queue.
3. **The bulk-approve policy gate** — an unreadable approval policy left a
   user-authored rule cap as the only gate, and an elevated policy clause with no
   parseable amount was skipped rather than honoured.

Three instances is a pattern. All three share one shape: **the failure path was
never written down, so it inherited the success path's default**, and the success
path's default is always "proceed". Nobody chose permissive; permissive is what
you get when you don't choose.

**Why review keeps being the one to find it:** the defect is invisible in the
happy path. Every one of these looked correct in the running app, in tests, and
in screenshots, because you only see it when the data source fails — which it
does not do on a healthy dev tenant. You have to deliberately break something to
observe it. That is exactly the kind of check that does not happen by accident.

**Candidate mitigations, roughly in order of cost:**

- **A written convention** is the cheapest and probably the highest-yield: a
  short rule in the repo that every read which can fail must state its failure
  posture explicitly, and that the posture for anything gating an action is
  "block". The value is less the rule than having a name for the shape, so it can
  be pointed at in review in one word instead of re-argued.
- **A checklist item on the PR template** — "what does this render/permit when
  its data source is unreachable, and did you verify it by actually breaking the
  source?" The verification clause matters more than the question; the question
  alone invites a confident wrong answer.
- **A lint rule** is attractive but the hardest to get right, and worth being
  honest about. The mechanical shape is detectable — `data?.x ?? []` on a query
  result, a `?? {}` fallback feeding a permission decision, a `catch` returning a
  falsy default — but so is the enormous number of benign uses of exactly those
  idioms. A rule that fires on all of them gets suppressed everywhere within a
  week, which is worse than no rule. It would need to be scoped narrowly: perhaps
  only on values that flow into a gate (a `disabled`, a conditional render of an
  action, an eligibility predicate), which likely means a targeted rule over a
  small set of hand-marked types rather than a general one.
- **A test convention** with more teeth than a lint rule: for any hook or module
  that gates an action, require a test that exercises the unreachable-source case
  and asserts the *blocking* outcome. The bulk-approve module now has these; the
  question is whether it can be made the default expectation rather than a thing
  remembered.

**Open question, and the reason this is a backlog item rather than a decision:**
whether the enforcement should sit at the hook layer (where these bugs actually
originate — a hook that swallows `isError` makes every consumer wrong) or at the
consumer layer (where the gate is visible). The hook layer is the root cause and
the smaller surface, and is probably the right answer, but that is a claim worth
testing against the existing hooks before committing to it.

---

## Component-level rendering is untestable in the current test environment

**Why this is here:** vitest runs with `environment: "node"` — no jsdom, no
testing-library — and client tests are `.test.ts` (pure logic), never `.test.tsx`.
So anything that only manifests in a rendered component cannot be unit-tested at
all.

The consequence shows up as a verification gap that has to be filled by hand every
time: the bulk-approve *logic* has thorough unit coverage, but "does a checkbox
actually appear on this row, is it disabled, does the bar appear at two" could only
be verified by driving a headless browser against a live tenant. That works, and
it has caught real things, but it is slow, it depends on a particular tenant's
data, and it silently skips any branch that tenant's data cannot produce — the
cross-type blocking path is currently unexercised for exactly that reason, because
every eligible row on the reference tenant is the same type.

**The tension worth resolving deliberately:** adding jsdom is not free, and the
current split (pure logic in `.test.ts`, real rendering in a browser) is a
defensible architecture rather than an accident — it pushes logic out of
components, which is why modules like the tier and bulk helpers exist as pure
functions in the first place. The question is not "should we add jsdom" but
"which of these two gaps is actually costing us": untested render branches, or the
slow hand-verification loop. Worth answering with a couple of concrete examples
before installing anything.

---

## Settings → Team: member row subtitle overlaps the chevron

**Why this is here:** noticed while shooting item 7A's before/after screenshots
(`docs/ia-restructure/item7a-settings-team-*.png`). It is visible in the *before*
shot too, so it predates the item-7 work and is not a regression from it.

The member row renders its permission summary — "AP + AR + Treasury + Payroll +
Reconciliation · no per-item limit" — as a single unconstrained line. In the
~594–754px centre column it runs under the row's chevron and the tail of the
text collides with it, so the row reads as garbled rather than truncated.

Deliberately not fixed mid-sequence: it is pre-existing, cosmetic, and touching
row layout during an IA restructure would blur what each PR is responsible for.

Worth noting when it is picked up: the right fix is probably a `min-w-0` +
`truncate` on the text column rather than shortening the string, because the
string is generated from the member's real domains and limit — shortening it
would drop authorization detail, which is the one thing this row exists to show.
The full value should stay available (title attribute or the member detail view).
