---
name: Git sync — task-branch merge trap
description: When task agents merge while a feature branch is checked out, commits land on that branch not on main, causing the next Replit sync to fail.
---

# Git sync — task-branch merge trap

## The rule
When the Replit workspace is checked out on a **feature branch** (not main), task-agent merges land on that feature branch, not on `main`. If the user then tries to "Sync" (push to GitHub), the Replit sync sees `main` as diverged from `origin/main` and throws "unexpected merge conflict."

**Why:** The platform merges task PRs into the currently checked-out branch. A feature branch that accumulated task merges will be ahead of both local `main` and `origin/main`.

## How to recover
1. `git log --oneline origin/main..HEAD` on `main` — if 0 lines, main is aligned.
2. `git log --oneline <feature-branch> -10` — find the tip with all task merges.
3. `git reset --hard <feature-branch-tip>` on `main` to fast-forward it.
4. `git push origin main` to align GitHub's `origin/main`.
5. Delete or close the now-redundant feature PR (it's already in main).

## Prevention
- After marking a main-agent task complete, stay on `main`; check out feature branches only briefly for confirmation checks, then check out back to `main` before task agents start merging.
- After any reset to origin/main, verify `git show origin/main:<key-new-file>.tsx` exists before declaring it safe to reset.
