---
name: Silent UI deletion by stale sync merges
description: Finished UI disappears from main without anyone deciding it should. How to detect it (three test-id spellings), tell an accident from a redesign, and re-apply it safely.
---

## The shape of it

A long-lived branch holds a stale copy of a file. It is squash-merged in a diff
large enough that nobody reads the deletions, and whatever landed meanwhile is
reverted. It has happened three times here, to a money-authorization control, to
eight test ids, and to memory entries. The additions in such a commit are the
intent; the deletions are the accident.

**Why:** a squash of a stale branch is a revert of everything merged after that
branch diverged, and the resulting files are new states, not file-level reverts —
so nothing looks like a revert in review.

**How to apply:** in any "sync" diff read `--diff-filter=M ... | grep '^-'` first.
Check `git branch -vv` for `[ahead N]` before cutting from main.

## A scan must match three spellings

A test-id sweep that matches only `data-testid="x"` is wrong in both directions:

- it **misses real losses** — callouts and shared primitives take `testId="x"` as
  a prop, so the escalation loss was invisible to the first sweep
- it **invents losses** — controls declared in a config array as
  `testId: "x"` (object property, no `=`) look deleted while rendering fine

Match `(data-testid|testId|testIdPrefix)\s*[=:]\s*"..."`, and compare
presence-anywhere rather than per-file so a moved control stays silent.

## A missing test id is not a missing control, and vice versa

Both halves have been observed:

- copy survives while only the id is deleted (a section subhead kept rendering)
- the control vanishes while its logic stays live **and still under test** — an
  Inbox text-search filter whose state, predicate and four assertions all remain,
  with nothing left that can set it

**Why:** the suite reports such a path healthy, so green tests are not evidence
the UI exists. Confirm the rendered surface, not the model.

## Accident or redesign

Tells for accident, in descending strength:

1. **The guard was left behind.** A QA script still asserting the deleted id —
   especially when the same commit edited a sibling script — is close to proof.
2. The commit message describes only additions.
3. The rest of the same feature survives, so the removal is not feature-shaped.

Tell for a real redesign: the successor exists and the capability is reachable
another way. Classify each id on its own; a surface that was later deleted on
purpose can still have dropped a capability the successor never picked up.

## Recovering it

**Never `git revert` the squash.** It mixed the deletion with genuine work, so a
revert destroys that work. Re-apply from the pre-deletion blob instead — it is an
ancestor of main, and if the head branch was deleted on origin, address it by
SHA.

Re-express rather than paste: restored code predates the current token and type
layers, so verbatim hex and off-ramp sizes will fail the token scan or silently
diverge from the neighbours it now sits beside.
