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
