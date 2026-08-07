---
name: main lags the real UI work — never cut a task branch from origin/main blindly
description: Why branching a new task off origin/main can silently roll the preview back weeks, and what to check first.
---

# `origin/main` is not the current state of the product

This repo routinely carries **large, long-lived, unmerged branches** that hold the actual current
UI. `origin/main` can be many commits and several days behind what the user has been looking at
in the preview all day.

So `git switch -c <task-branch> origin/main` — the instinctive "start clean from main" move — can
roll the running app back past a whole session's work. To the user this looks like data loss or a
botched merge ("was this not merged correctly? all of our edits are missing"). The work is fine;
the workspace is just sitting on a branch that predates it.

## Check before branching
```
git branch -vv                       # look for [ahead N] — unpushed local commits
git log --oneline origin/main..<other-branch>
```
Anything with a double-digit `ahead` count is a parallel line of work, not a stale experiment.
Ask which branch the new work should sit on, or branch off that tip rather than `main`.

**Why:** cutting task #128 from `origin/main` stranded ~20 commits of the day's UI work that lived
only on an open PR branch, three commits of which had never even been pushed.

## Recovering
1. **Push any `[ahead N]` commits first** — unpushed local work is the only genuinely
   unrecoverable thing in the picture.
2. Rebase the small task branch **onto** the big work branch, not the other way round.
3. When the mechanical part of the task was scripted, do **not** hand-resolve the conflicts.
   Take the big branch's side wholesale (`git checkout --ours -- <file>` — during a rebase `ours`
   is the branch you are rebasing *onto*) and re-run the script on top. Then re-apply the handful
   of genuinely manual edits, which the script will not restore.

## Two traps seen while doing this
- A conflict-marker grep run *between* `checkout --ours` and the next step reports clean while
  vite is still failing on markers it read a moment earlier. Trust `git diff --diff-filter=U`
  over a text grep, and remember the files stay "unmerged" in the index until you `git add` them.
- `--force-with-lease` fails with **"stale info"** whenever you push to an explicit URL instead of
  a named remote: there is no remote-tracking ref to form the lease from. Pass the expected SHA
  yourself — `--force-with-lease=<branch>:<sha>`.
