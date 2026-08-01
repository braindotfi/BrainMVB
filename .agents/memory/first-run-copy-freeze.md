---
name: Freezing first-run copy against a late read
description: Why the opening step of the first-run walkthrough must not be frozen at open time, and what the real invariant is
---

# Copy that quotes a live read

Freeze such copy only **after** the read resolves. Do not freeze the opening step
at the moment the surface opens.

**Why:** tried exactly that, and it freezes the *pending* wording. The tenant's
own rule then never replaces the illustrative example, so a tenant with real
rules is shown a generic sentence and a row marked "Example" forever. Three
existing checks caught it. The pending-to-known fill-in is the feature; the
freeze exists only to stop churn *after* there is something real to say.

**How to apply:** the invariant worth testing is "no rewrite after the read has
resolved", never "the text never changes". A check asserting the opening sentence
is byte-stable across a landing read encodes the wrong rule and will fail correct
code — I wrote one, and it went red against the good implementation.

Note the asymmetry that makes this easy to misread: steps reached by navigation
are frozen on arrival, because arriving is itself the state change that triggers
the freeze. So a freeze test written against a later step passes while the
opening step still fills in. That difference is intended, not an oversight.
