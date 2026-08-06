---
name: Unmatched /api paths and the SPA catch-all
description: Why a "route is gone" test can pass in the test harness while the running server still answers 200, and what to assert instead.
---

# An /api 404 is not free — the SPA catch-all will answer first

Both the dev (Vite) and prod (static) servers mount a `/{*path}` catch-all **after**
the API routes. Anything that does not match a real API route therefore falls through
to it and is answered **200 with the index.html shell**, `content-type: text/html`.

That includes deleted routes, mistyped routes, and routes that never existed.

**Why this matters:** an HTTP test that boots `registerRoutes` into a bare Express app
mounts no catch-all, so an unrouted path 404s there. A test asserting "the removed route
returns 404" therefore passes in the harness while the deployed server returns 200 for
the same path. The test is measuring the absence of a catch-all, not the absence of a
route.

**How to apply:**

- Keep the `/api/{*path}` JSON-404 fallback at the END of `registerRoutes`, not in
  `index.ts`. Registering it inside `registerRoutes` is what puts it in the test
  harness's pipeline, so route-removal tests exercise the real handler. It must stay
  last — anything registered after it is unreachable.
- When you delete or rename an API route, curl the running server, not just the suite.
  Check `content_type` as well as status: `200 text/html` on an `/api/...` path means
  the catch-all answered and the route is simply gone-but-invisible.
- Same trap for any assertion about a path that should not exist. Assert the JSON body
  (`{"error":"Not found"}`) rather than the bare status, so an HTML shell response
  cannot satisfy it.

**Related:** the general form of this is in `storage-backend-test-coverage.md` — a test
that exercises a pipeline the real server does not use is zero coverage, not flake.
