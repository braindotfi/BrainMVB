---
name: Duplicate-looking rows can be two real records
description: brain-core re-proposes the same invoice on every agent sweep, so identical-looking queue rows are usually two separately-approvable records — and a fresh demo tenant cannot show this at all.
---

# A repeated row is a claim about the data, not about the renderer

When a reviewer reports "the same row twice", the first question is whether the
list drew one record twice or the feed holds two. On this product it is almost
always the second: brain-core's agents re-propose an open record on **every
sweep**, and those runs overlap the proposals a tenant is seeded with. One
invoice therefore carries several pending proposals with different ids, each
with its own writable approve/reject.

Two sweeps can produce **byte-identical** asks (same headline, same recommended
action, confidence differing in the 5th decimal), so "the content is identical"
is not evidence of a rendering bug.

The same agent also emits repeats that are auto-rejected on arrival — those
never reach a queue, which is why the effect looks intermittent.

**Why:** approving one of the pair leaves the other pending upstream. Suppressing
the visual duplicate hides a live record that will reappear on the next read, and
the approver has no way to learn it existed.

**How to apply:**
- Settle it by dumping ids and evidence refs from the live feed before touching
  presentation code. Two ids = two records; the fix is disambiguation, not dedupe.
- Group only on a **record id** the proposals cite. An invoice *number* is unique
  per issuer, not per book, and a counterparty+amount match is two real debts of
  equal size. Both would merge unrelated records.
- Say the count, never the order ("1 other open proposal on invoice X"): the
  sibling can sort anywhere in the list.
- Count over exactly the set that renders. A proposal the audit log shows as
  decided is dropped from the list, so it must drop out of the count too, or the
  surviving row claims a sibling that is not there.

# A fresh demo tenant cannot answer questions about agent output

`demo-fresh` returns in seconds with ~2 records. Agent sweeps land minutes later:
the first collections proposals appear at ~1 min, the sweep that duplicates an
already-proposed invoice at ~10-12 min, and a full queue (~18 records, collections
plus vendor risk) only after that. A reviewer looking at a long-lived tenant and
an agent looking at a fresh one are reading two different products.

**Why:** several "could not reproduce" verdicts have come from probing a tenant
that had not finished producing the state in question.

**How to apply:** poll the feed until the count stops moving before concluding
anything, and keep the warmed tenant's session cookie — re-provisioning costs
another 10 minutes and `demo-fresh` rate-limits. Background pollers are killed
when the shell call that spawned them ends, so poll in bounded foreground chunks
that resume from saved state.
