---
name: Reading a red check here, and why auto-merge stays gated
description: The lockfile install failure that used to redden every PR (now fixed), how to tell it from a real failure if it returns, and why turning CI green must never be what decides a merge.
---

## The repo-wide install failure is fixed — verify before assuming it is back

For a long stretch the `tests` workflow died at `npm ci`, which aborts when
`package-lock.json` disagrees with `package.json`. The install step failed and
**no test ever ran**, on PR branches and main alike, so every check was red for
reasons unrelated to the change under review.

That is no longer true. As of 2026-09-09 the workflow carries explicit
*Validate lockfile*, *Install dependencies*, and *Verify the install actually
completed* steps, and `vitest` runs and passes on PRs and on main. A red check
now means something.

**How to apply:** do not repeat the old advice that a red check is probably just
the lock file — that reassurance is exactly how a real regression gets waved
through. Open the run. If the install failure ever does return, its tell is
`npm error code EUSAGE` followed by a wall of
`Invalid: lock file's X does not satisfy Y`; `npm ci` is deliberately strict and
will not reconcile the lock the way `npm install` does. Regenerating the lock is
a dependency change in its own right — its own PR, never a drive-by inside a
feature branch.

## Auto-merge is gated now — keep it that way

`auto-merge.yml` used to run on every non-draft PR (`gh pr checks --watch
--fail-fast` then `gh pr merge --squash --delete-branch`) with no label gate, no
reviewer gate, and no branch protection. The red CI was the *only* thing holding
PRs open, so repairing the lock file would have merged everything open at once,
unreviewed.

Two independent gates now exist: the workflow requires an explicit `auto-merge`
label, and branch protection on main requires one approving review (stale reviews
dismissed, force-push and deletion blocked, `enforce_admins: false` so a human admin
keeps an escape hatch).

**Why:** a green build should never be the thing that decides a merge. Restoring
either gate's absence re-arms the trap for whoever next touches `package.json`.

**How to apply:** `ready_for_review` is a trigger — taking a *labelled* PR out of
draft starts auto-merge. Drafting a PR to control its timing only works if the label
is off too. Required status checks are deliberately NOT configured while CI is red;
adding them before the lock file is fixed would block the very PR that fixes it.

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

## A CI step that calls a repo script breaks every PR older than the script

For `pull_request` events GitHub resolves the workflow from the **merge tree**
(head merged into base), so the YAML *and* every script it invokes must exist in
that tree. Adding a step to the base branch while its script still sits on an
unmerged branch fails every other open PR with `MODULE_NOT_FOUND`.

**Why:** the failure impersonates the guard doing its job — a red check with the
guard's own step name — when it actually means the guard is absent. With several
PRs open at once that reads as "the new check found problems everywhere", and the
natural response is to weaken or remove the check.

**How to apply:** make the invocation self-skipping, so ordering stops mattering
and it begins enforcing the moment the script lands:

```yaml
run: |
  test -f scripts/<script>.mjs || { echo "not on this branch yet — skipping"; exit 0; }
  node scripts/<script>.mjs "origin/${{ github.base_ref }}"
```

Steps that need git history (anything computing a merge-base) also need
`fetch-depth: 0` on the checkout, and belong *before* the install steps when CI
is red at dependency install — a guard that only runs after a passing `npm ci`
reports nothing on exactly the branches that need it.
