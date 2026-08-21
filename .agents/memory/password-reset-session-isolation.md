---
name: Password reset session isolation
description: Security invariants for reset links, session revocation, and recovery-route behavior.
---

Password-reset routes must never authenticate, switch, or restore a browser session. Entering a reset URL clears the server session before identity bootstrap or reset content; leaving an invalid link must continue through anonymous recovery, not navigate into an ambient app session.

**Why:** A reset link previously exited to `/`, where a pre-existing unrelated browser session could render. This was ambient-session exposure, not token collision or reset-handler account switching.

**How to apply:** Keep the user session generation durable and capture it in every authenticated session. Every protected request must compare the captured generation; atomically advance only the reset target's generation when consuming a valid reset token. Reject versionless/stale sessions, preserve generic recovery responses, and never log raw tokens, emails, or session IDs.