---
name: Bucket a work queue on outcome, not source
description: Why the Inbox's sections are derived from a record's available decisions rather than the per-source `kind` label, and the rule for any future grouping.
---

# Bucket a work queue on outcome, not source

A record's section, heading, and buttons must all be derived from **the same
field**: the decisions the backend will actually accept for that record.

Do not group on a type/kind/source label that is stamped where each feed is
pushed into the list. Those labels describe *provenance*, and provenance does
not predict what a record can do.

**Why:** the Inbox's three sections were split on `kind`, which is written
literally at every push site — every agent proposal is `"proposal"` whatever
brain-core will accept for it. A `notify_only` record whose only writable
decision is `acknowledge` therefore rendered under a heading demanding a
decision, directly above a lone Acknowledge button. The heading and the buttons
were reading two different fields, which is the only way they could ever have
disagreed. Nothing looked broken on screen; the row was tidy and the heading was
lying about it.

**How to apply:**

- Only a writable `approve`/`reject` is a *decision*. `acknowledge` and `undo`
  are writes, but they record that someone SAW something — they never settle it.
  Same rule as the one keeping acknowledge-only records out of the pending count,
  so the surfaces cannot disagree about what is outstanding.
- A published decision list outranks every other signal, **including an empty
  one** (empty = nothing may be written). Check it before any source shortcut,
  or a source whose records later gain a writable decision will draw buttons
  under a heading that says it has none.
- Only fall back to a source field when no decision list was published.
- Two screens that print the same count must count the same set. If one screen
  shows a queue and another shows a number for it, derive both from one rule and
  add a live check that they agree — each is plausible alone.

## Watch for double counting across feeds

A record can legitimately arrive from two feeds at once (e.g. an item created in
this browser session that is also now in the durable backend queue). The listing
surface usually drops one copy; a *counting* surface added later will not, unless
told to. Symptom: the count says two where the list shows one.
