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
