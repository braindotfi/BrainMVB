---
name: Default-on filters and the meaning of empty
description: Why the Audit Log's hidden-by-default pipeline events must be named in the empty state, and why no admin-gated default can be built yet
---

## A filter that is on by default changes what an empty list means

Once a surface hides a class of records by default, an empty list stops being a
fact about the tenant's data and becomes a fact about the filter. Any copy that
still speaks for the data ("No audit records yet") is then a false claim the UI
has no standing to make.

**Rule:** whenever a default-on filter can empty a list, the empty state must
state how many records are withheld and how to reveal them, and the search box
must report matches that live in the hidden set rather than saying "no matches".

**Why:** on a live Brain tenant the audit log is ~97% pipeline traffic
(wiki regenerations, router selections, policy evaluations). Filtering to
decision history empties the page entirely on some tenants, so the empty state
carries the entire truth of the screen. This is the same fail-open shape as
`unreachable-data-all-clear.md`, one level up: there a failed read looked like
"nothing to see", here a filter does.

**How to apply:** count the withheld set before the search runs, not after, so
the same predicate can be run over both. Put the count on the toggle as well —
a bare switch says a filter exists; a counted one says how much it is holding.

## There is no trustworthy current-user role in the client

`AuthUser` carries no role, and nothing links the session to a member row. The
only available route is matching the session email against `/api/brain/members`,
which is paged (so it can legitimately answer "unknown") and depends on a
network read succeeding.

**Rule:** do not gate defaults, visibility, or permissions on a client-derived
role until a real role signal exists on the session. Defaults that fall back to
a safe value on "unknown" are really being decided by network reliability.

**Why:** the brief for the audit filter asked for "off by default for non-admin
roles". Built on an email-match proxy, a false-positive admin would show
pipeline internals to someone who is not one, and the toggle's true driver
would be whether a fetch succeeded. Shipped off-for-everyone instead, with the
role-aware default recorded as deferred.
