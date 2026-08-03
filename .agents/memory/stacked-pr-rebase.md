---
name: Rebasing a branch in a squash-merged PR stack
description: Why plain `git rebase origin/main` destroys a stacked branch in this repo, and the --onto form that works.
---

Rebase every stacked branch with **`git rebase --onto origin/main <the parent
branch's PRE-rebase tip>`**. Never plain `git rebase origin/main`.

**Why:** PRs land here by **squash** merge, so a parent's individual commits
never appear in `main` — only their combined content does. A plain rebase finds
the merge base way back at the stack's root and tries to replay *every* ancestor
commit, each of which is already in `main` in squashed form. It conflicts
immediately and leaves a half-applied rebase: the working tree carries conflict
markers, the dev server dies on the broken files, and — the dangerous part — a
test run in that state still reports a plausible-looking pass count, because the
conflicted files may not be the ones under test. That result means nothing.

**How to apply:** before rebasing a parent, record its current tip; that SHA is
the `<old base>` for its child. After each rebase confirm two things: `git log
--oneline` shows only the child's own commits sitting directly on `origin/main`,
and `git status --porcelain` is empty. Then run the tests.

Two traps in the same area:

- `git log origin/main..<branch>` lists all those already-merged ancestor
  commits, so it is **not** a reliable "what is still unmerged" signal for a
  stack. Read it as "commits whose SHAs are absent", not "work not yet landed".
- `set -e` does not stop a failing `git rebase ... | tail`: a pipeline's status
  is the last command's. Use `set -eo pipefail`, or check the rebase result
  explicitly, or the script will merrily push a conflicted tree.

Related: GitHub retargets a child PR's base to `main` on its own once the parent
merges, but only for the immediate child — retarget the rest through the API
before merging, and re-check `base.ref` and `head.sha` in the same call that
merges.

When a child branch already accumulated a long pre-parent history and the
parent was squash-merged, the safest repair is to preserve the old head under a
local backup ref, reset the working branch to the current `origin/main`, and
cherry-pick only the child commits plus any independently verified child
changes. Update the remote with `--force-with-lease` only after the reduced
diff and full test suite are clean.

**Why:** a merge commit can be conflict-free while silently restoring the
pre-squash implementation of files whose old commit IDs are absent from
`main`. Comparing the final tree and the diff against `origin/main` catches
that history/content mismatch.

**How to apply:** treat `origin/main..branch` as a tree diff only after
rebuilding the branch; verify the diff contains no already-landed parent
feature, then run typecheck, tests, whitespace/conflict checks, and CI before
the force-with-lease update.
