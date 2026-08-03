---
name: Post-merge branch tip audit
description: Why a merged feature can still have later product commits missing from main and production.
---

A feature branch can continue accumulating product commits after its PR is merged. The merge commit
proves only what was included at merge time; it does not prove that the branch tip, or a later
publish, contains all subsequent work.

**Why:** the proposal-card branch continued with agent decision-card and pager changes after its
PR merged, so current main and production contained the earlier snapshot but not the later UI.

**How to apply:** compare the PR merge commit, branch tip, current main tree, and published bundle
before declaring a feature live. When a branch has post-merge commits, recover the intended files
onto a fresh branch from current main instead of merging the stale branch wholesale.