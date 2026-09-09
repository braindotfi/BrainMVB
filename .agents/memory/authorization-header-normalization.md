---
name: Authorization header normalization
description: Prevent case-variant Authorization headers from becoming a comma-joined invalid bearer credential.
---

When replacing an Authorization header in a request wrapper, first normalize the
incoming headers and remove the normalized authorization key before adding the
replacement. Never merge a normalized header object with the original plain object.

**Why:** The Headers API is case-insensitive, while plain JavaScript objects are not.
Merging both forms can produce `authorization` and `Authorization` properties. Fetch
combines them into one comma-separated header, and the upstream verifier reports an
apparently valid JWT as `Invalid Compact JWS`. Direct fetch probes then pass while the
shared client fails, which makes the issue look like credential issuance or propagation.

**How to apply:** Any retry, token-refresh, or proxy wrapper that rewrites Bearer auth
must guarantee exactly one Authorization value. Regression tests should begin with an
existing differently-cased Authorization key and assert the transmitted value contains
neither a comma nor the stale credential.