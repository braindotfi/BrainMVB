---
name: PostgreSQL pool error handling
description: Managed database restarts can emit idle-client errors that otherwise terminate the Node process.
---

Attach an `error` listener to every `pg.Pool` used by the server, including session-store pools. Managed PostgreSQL restarts may terminate an idle client with code `57P01`; `pg` can discard that client, but without a pool listener Node treats the emitted event as unhandled and exits.

**Why:** the application was serving normally on port 5000 until the managed database terminated an idle connection, after which the process crashed from an unhandled `BoundPool` error.

**How to apply:** whenever a new database or session pool is created, add a small logging error listener at construction time; do not rely on request-level query catches for idle-client pool events.