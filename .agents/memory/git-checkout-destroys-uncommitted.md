---
name: Reverting a temporary mutation without losing the file
description: Why `git checkout -- <file>` is the wrong undo for a scratch edit, and what to do instead.
---

Never use `git checkout -- <file>` (or `git restore <file>`) to undo a temporary
edit — a mutation test, a forced branch, a debug log. Copy the file to `/tmp`
first and restore from the copy.

**Why:** the command restores the file to HEAD, so it discards *every*
uncommitted change in it, not just the scratch one. In a long session where
several rounds of work are still uncommitted, one `git checkout` on a single
busy file can wipe hours of work with no prompt and no reflog entry — worktree
state is not in the object database.

**How to apply:** before mutating a file to prove a test can fail, `cp <file>
/tmp/<name>.bak`, then `cp` back. Commit each finished round rather than
carrying several rounds of uncommitted work in one file. If a checkout has
already happened, before reaching for a project rollback check for an earlier
`/tmp` copy and for the running Vite dev server, which may still be serving the
previous transform of the module from its in-memory graph.
