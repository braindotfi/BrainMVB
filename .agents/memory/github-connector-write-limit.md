---
name: GitHub connector write limitation
description: The attached GitHub connection can merge PRs and update repository settings, but may reject Git ref updates for newly created workflow commits.
---

The Replit-managed GitHub connection may successfully read repositories, merge pull requests, and enable repository auto-merge while refusing to move a branch ref for a newly created Git commit. The local `gh` CLI can remain backed by an older denied token even after the integration is reauthorized.

**Why:** During the July 30, 2026 merge operation, six PRs and the repository auto-merge setting succeeded, but the final workflow commit could not be published because the connector rejected the `main` ref update.

**How to apply:** Verify the remote branch SHA and workflow files after any connector write sequence. If the local checkout is ahead of `origin/main`, do not claim the workflow is live remotely; use a fresh write-capable GitHub authorization or push manually.