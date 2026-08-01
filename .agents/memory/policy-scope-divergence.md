---
name: Policy clause scope, read two ways
description: Why a clause that names no category must bind every category in the bulk-approve gate, and why the coverage-describing reader may legitimately disagree
---

# A clause that names no category

In the bulk-approve gate, a policy clause whose scope names no category binds
**every** category. Four shapes count as naming no category:

- the scope key is absent
- the scope list is empty
- the scope is an explicit wildcard
- entries are present but none of them is readable

Such a line competes with named lines under the same lowest-wins rule. A
category-less clause with no evaluable amount suppresses selection everywhere.
It also satisfies the "this category must have a policy line" requirement for a
category the policy never names.

**Why:** the same field is read by two functions with different jobs — one
describes what a policy covers, one gates a money-moving checkbox. Iterating the
scope list literally means a blanket clause contributes no limit at all, so a
two-approver line that applies to everything silently vanishes while a laxer
per-category clause still sets one. The failure is in the over-permissive
direction, which is the direction that matters here. Confirmed against a live
tenant by injecting a blanket "always two approvers" clause into the policy
response while leaving proposals and rules real: the unfixed gate offered nine
single-approver rows for a policy that permits none.

**How to apply:** any new reader of clause scope must decide *explicitly* what an
unnamed or unreadable scope means for its own purpose. For a gate, unknown binds
everything — fail closed. For a describer, the safe direction can be the
opposite. These two readings are not required to agree on every input, and
forcing them to agree is itself a bug; what is required is that each one is
wrong in the safe direction for its own job.

**Not settled:** extending a wildcard line's coverage to a category the policy
never names is the one part of this that *adds* eligibility rather than removing
it. It is under external review. Do not build further behaviour on that specific
property until it is confirmed.
