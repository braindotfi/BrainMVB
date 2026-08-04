---
name: Agent identity is not the actor
description: Why an audit record's agent name can only come from the actor_ref lookup path, never the resolved actor string.
---

An audit record's `actor` is **whoever performed the event**. Sometimes that is
an agent; on a human-approved decision it is the approver's name or email. The
two arrive in the same field, already resolved to a bare display string.

So any surface titled "<Agent Name> …" cannot read `actor`. Doing so produces
titles like "sarah@meridian Audit Record", naming the wrong party.

**The rule:** agent-ness is only recoverable from the *shape of the lookup* on
the event's `actor_ref` — an agent-registry path versus a member-directory
path. Classify at mapping time, while the lookup is still in hand, and carry
the result on the record as its own field. Once the name is resolved, the
distinction is gone for good.

**Why:** both lookups resolve through the same helper and return the same kind
of value (`display_name` / `name` / `email`), so nothing downstream can tell
them apart. The classifying regex must be kept in lockstep with the one that
builds the fetch path, or the two disagree about what an agent is.

**How to apply:** when a surface needs an agent name, use the record's own
agent field and **omit the prefix entirely** when it is absent. Most records
have no distinct agent: system events, and any decision where a human is the
actor. A bare fallback title is correct there — do not substitute the actor,
the counterparty, or an event-type label to fill the slot.
