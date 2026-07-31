---
name: CI is red repo-wide, and auto-merge is armed
description: Why every PR shows a failing check, why that is not your change, and why turning CI green silently merges the PR without review.
---

## Every PR is red before your code is even compiled

The `tests` workflow installs with `npm ci`, which aborts when `package-lock.json`
disagrees with `package.json`. The lock has drifted across a large number of
packages, so the install step fails and **no test ever runs** — on PR branches and
on main alike. Recent runs on main are failing for exactly this reason.

**How to read a red check here:** open the *Install dependencies* step before
assuming your commit broke anything. A genuine test failure and this install
failure look identical from the PR page. The tell is `npm error code EUSAGE`
followed by a wall of `Invalid: lock file's X does not satisfy Y`.

**Why:** `npm ci` is deliberately strict; it will not reconcile the lock the way
`npm install` does. Regenerating the lock fixes CI but is a dependency change in its
own right — treat it as its own PR, not as a drive-by inside a feature branch.

## Turning CI green auto-merges the PR

`auto-merge.yml` runs on every non-draft PR and does
`gh pr checks --watch --fail-fast` then `gh pr merge --squash --delete-branch`.
There is no label gate, no reviewer gate, and no branch protection on main — the
repo returns "Branch not protected".

So the red CI is currently the *only* thing holding PRs open. **Fixing the lock file
merges every open PR that is otherwise passing, immediately, with no human
approval.** If someone is waiting to decide merge order, mark the PR draft or say so
before making CI pass.

**How to apply:** before any change that could turn checks green, check what is open
and confirm the merge is actually wanted now.

## Checks that are referenced but do not exist

`check-no-em-dashes` and `check-invariants` get talked about as required checks.
Neither exists anywhere in `.github/`; the repo has only `test.yml` (one `vitest`
job) and `auto-merge.yml`. Nothing enforces them, so do not treat either as a gate
that will catch a mistake for you.

## Pushing needs an explicit token

The `origin` remote carries no credentials and plain `git push` fails with
"Password authentication is not supported". Push with an auth header built from the
push token rather than embedding it in the remote URL, and redact it from any
command output.
