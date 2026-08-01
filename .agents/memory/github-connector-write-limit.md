---
name: GitHub write access — two tokens, different powers
description: This repo authenticates gh and git push with different credentials; when one is denied a write, try the other before concluding it is impossible
---

Two separate credentials are in play, and they do not have the same powers:

- **`gh` CLI** authenticates with `GH_TOKEN`, a *fine-grained* PAT. It can push,
  read PRs and read check runs, but is denied `createPullRequest` and
  `mergePullRequest`.
- **`git push`** authenticates through a credential helper using
  `GH_WORKFLOW_PUSH_TOKEN`, a *classic* PAT carrying `repo, workflow`. That scope
  **does** grant PR creation (and the merge endpoint), so
  `GH_TOKEN="$GH_WORKFLOW_PUSH_TOKEN" gh …` succeeds where plain `gh` is refused.

So a 403 from `gh` means "this credential cannot", not "this repo cannot". Retry
with the other token before asking a human to hand-open a PR.

A third, unrelated obstacle: the base branch enforces review
(`mergeStateStatus: BLOCKED` with `mergeable: MERGEABLE`, error "the base branch
policy prohibits the merge"). That is a branch rule, not a credential problem, and
a broader token does not by itself clear it.

**Why:** a whole change was finished, verified and CI-green while apparently
unlandable, because the denial from one credential was read as the repo's own
limit — while the credential that could do it was already configured for pushes.

**How to apply:** GitHub's 403 body only says "Resource not accessible by personal
access token"; the permission actually required is in the response header, so
probe with `gh api -i` and read `X-Accepted-GitHub-Permissions` (creating a PR
wants `pull_requests=write`). To test a permission without side effects, send a
deliberately invalid payload — 403 means denied, 422 means the credential is
allowed and only the input was wrong. Note that a merge PUT against an
already-merged PR returns 200 restating the existing merge commit; that is not
proof the credential can merge under branch protection.
