---
name: Replit auto-checkpoints can push a feature branch onto main
description: Why `git checkout -b <new> origin/main` can land commits directly on origin/main in a Replit workspace.
---

`git checkout -b <new-branch> origin/main` sets the new branch's upstream to **origin/main**.
Replit's auto-checkpointing commits and pushes to the branch's upstream, so work intended for
a PR gets published straight onto `main` — with no PR and no review.

The failure is quiet. `createPullRequest` is what surfaces it, with the confusing
"No commits between main and <branch>" — because by then `origin/main` already points at the
commit. `gitPush` also refuses with "current branch already tracks origin/main; cannot
publish <branch>", which looks like a permissions problem but is a tracking problem.

**Why:** the branch is created from a *remote-tracking ref*, so git helpfully configures it
to track that ref. That default is right for `git pull` and badly wrong when a background
process pushes for you.

**How to apply:** create feature branches so they have no upstream until deliberately
published — `git switch -c <new> --no-track origin/main`, or `git branch --unset-upstream`
immediately after `checkout -b`. Verify with `git status -sb`: the first line should show the
bare branch name with no `...origin/<x>` suffix before doing any further work.

Note the sandbox git callbacks (`gitPush`, `createPullRequest`) return
`{ success: false, message }` instead of throwing — check `.success`, since `await` alone
will not surface the failure.

## Replit's git integration pushes the *checked-out* branch — so `main` gets published

The Git pane pushes whichever branch is currently checked out, and there is no setting for a
default target branch; the only control is which branch you are sitting on. So leaving `main`
checked out with local commits means the next push publishes them to `origin/main`.

When `enforce_admins` is `false`, a required-review rule does **not** stop this: the push is a
direct write by an admin, not a merge, so it never consults the review requirement and leaves
no PR trail. Protection can be fully intact and still be bypassed this way.

### This bypass is now closed (observed 2026-08-03)

`refs/heads/main` is covered by a **repository ruleset**, which — unlike the classic
`enforce_admins: false` protection above — rejects the direct write outright:

```
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: - Changes must be made through a pull request.
```

**Why this matters:** rulesets and classic branch protection are different mechanisms with
different admin semantics, so "admins can push straight to main here" is a claim with a shelf
life. Local `main` can now sit many commits ahead of `origin/main` indefinitely, which is the
opposite of the old hazard — work is stranded rather than silently published.

**How to apply:** treat a GH013 rejection as the expected path, not a broken credential. Land
work by pushing a *branch* (branch pushes are still permitted with the same token) and opening
a PR. Re-verify which mechanism is in force before repeating either the old warning or this
one — check the rejection text, not memory.

Confirmed by the workspace's own `.git/logs/refs/remotes/origin/main`, which records an
`update by push` entry for a push nobody ran from the shell — the shell has no credential
helper, so a plain `git push` there cannot authenticate to `origin` at all.

**The tell is a PR that stays open while its content is already on `main`.** Both are true
at once, which reads as a contradiction until you check ancestry:

- The PR's head SHA is *not* an ancestor of `origin/main` (the branch's commits never landed),
  yet `git diff origin/main <branch>` is empty (the same content landed under the pre-cherry-pick
  SHAs from local `main`).
- A commit that only ever existed on local `main` — an empty `Published your App` checkpoint is
  the giveaway — is present on `origin/main` despite never being in the PR.

**Do not read `merge_commit_sha` as proof of a merge.** For an *open* PR the API populates it
with a speculative test-merge commit. Check `merged: true` / `merged_at`, never the SHA alone.

**How to apply:** before assuming a PR landed, verify
`git merge-base --is-ancestor <pr-head> origin/main`. If content is on main but the PR is open,
close the PR as superseded rather than re-merging. To keep work off `main`, commit it on a
branch with no upstream; anything sitting on local `main` should be treated as already published.

## Auto-checkpoints also author commits *on the branch you are standing on*

Separate hazard from the push behaviour above: a checkpoint is a real git commit, and it
sweeps in whatever is in the working tree — including files you deliberately left unstaged.
It lands on the currently checked-out branch, feature branches included.

Per Replit's own docs, checkpoints are Git commits by design and there is **no documented
setting to disable them or narrow what they capture**. So this cannot be prevented, only
detected. Do not promise a user that it has been turned off.

Two consequences that both cost real debugging time:

- A branch's contents are not only what you committed. "I left that file untracked" is not a
  statement you can make truthfully without checking.
- A local branch can end up *ahead of its remote* without you having pushed. If you then cut a
  new branch from it, the stray commit is inherited by the child and shows up in the child's PR.

**How to apply:** before every push, diff against the upstream and read it —
`git log --oneline @{u}..HEAD` and `git diff --stat @{u}..HEAD`. Every commit and every file
must be one you meant. Check `git branch -vv` for `[ahead N]` before cutting a branch from
another branch. Stage explicit paths; `git add -A` turns a checkpoint's leftovers into your
commit. `.gitignore` is the wrong tool here — the files that leak (screenshots, memory notes)
are legitimate content on the *wrong branch*, not junk.

### Mid-task, `HEAD` is not your baseline — and `git diff` goes quietly empty

The consequence above has a second edge that costs a whole debugging cycle. A checkpoint can land
*while you are still working*, so the changes you have not committed yourself are already committed
for you. `git diff` and `git diff HEAD` then report **nothing**, and `git show HEAD:<file>` returns
your own edited version rather than the state you started from.

This is silent and it looks like a bug in your own tooling. A script that reconstructs "what did I
change" by comparing the working tree against `HEAD` returns zero matches, which reads as "my edit
never applied" — the opposite of what happened.

**Why:** the checkpoint is an ordinary commit on the checked-out branch, so it moves `HEAD` forward
onto your in-progress work. Nothing announces it.

**How to apply:** for any multi-step pass where you need to reason about your own cumulative diff —
a mechanical refactor, a restyle, a codemod — resolve the baseline *once, explicitly*, and compare
against that SHA rather than `HEAD`:

```
BASE=$(git merge-base HEAD origin/main)
git diff "$BASE" -- <paths>
```

Re-derive it rather than pasting a SHA from earlier in the session; the branch point is stable even
though `HEAD` is not. If a diff you expect to be large comes back empty, check `git log --oneline -3`
for a checkpoint commit before doubting the edit.
