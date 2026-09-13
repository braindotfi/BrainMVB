---
name: Deployment source attestation
description: The publishing service requires the workspace source to be the clean, synced origin/main tree before it will build.
---

Publishing can fail before package installation or compilation with an attestation
error saying that the deployment source differs from `origin/main`. This is a
source-selection failure, not evidence that the application build is broken.

**Why:** publishing from a feature branch or a separate memory-documentation
branch caused the deployment service to reject an otherwise valid build. The
service verifies the source against the repository's synced main tree before
running the configured build.

**How to apply:** after merging, fetch `origin/main`, check out the exact
`origin/main` commit on the local `main` branch, confirm `git status` is clean,
and only then publish. Keep memory-only PR work separate and do not publish
from that branch.