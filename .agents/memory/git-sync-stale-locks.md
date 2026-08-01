---
name: Stale Git lock files can make Replit Sync report an unrecognized fatal error
description: Local repository symptoms and safe recovery for abandoned Git lock files.
---

If Sync reports a generic fatal Git error, inspect `.git` for `*.lock` files before
changing branches or resetting anything. A lock older than the current session with
no Git process holding it can block status, fetch, or the Git pane; stale locks may
also make `git fsck` report malformed refs.

**Why:** this workspace accumulated abandoned `HEAD` and ref lock files from an
earlier operation. The GitHub remote was reachable and the worktree was healthy;
the UI error came from local repository metadata, not from the application code or
GitHub.

**How to apply:** confirm no active Git process holds the lock, remove only the
stale `*.lock` files under `.git`, then verify `git status`, `git fsck`, and a
read-only `git ls-remote origin`. Never delete refs, reset commits, or force-push
as part of this recovery.