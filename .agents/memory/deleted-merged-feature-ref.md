---
name: Deleted merged feature refs
description: How to recover Git pane UNKNOWN_REF after a merged PR deletes its source branch.
---

When a PR's source branch is automatically deleted after merge, a local checkout can retain an
upstream pointing at a now-missing remote ref. The Git pane reports `UNKNOWN_REF` and cannot sync,
even though the local commits are safe.

**Why:** the branch deletion is normal GitHub cleanup, but the local branch's upstream metadata
still names the deleted ref. Treating it like a lost commit or force-resetting risks discarding
post-merge local work.

**How to apply:** fetch with prune, inspect `git status -sb` and `git log` before changing anything,
preserve untracked uploads, then recreate the same remote branch with a normal push if the user
wants to continue syncing that branch. Verify local and remote SHAs match and confirm untracked
files were not included.