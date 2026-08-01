---
name: Policy clause scope, read two ways
description: Why explicit "any" binds every category in the bulk-approve gate while absent/empty scope fails closed instead, and why the coverage-describing reader may disagree
---

# Wildcard, invalid, and the gap between them

`applies_to` has exactly one wildcard shape, and the gate must not confuse the
others with it.

**Explicit `"any"`** is the DSL's wildcard. brain-core's policy VM matches it
against every `action.kind`, so the gate mirrors the VM: the clause binds every
category, competes with named clauses under lowest-wins, and satisfies the
"this category needs a policy line" requirement even for a category the policy
never names. It may therefore *expand* eligibility — that is correct, and is
what stops a newly added `details.kind` from escaping a blanket rule. Do not
invent a stricter category-explicitness rule the VM itself does not apply.

**Absent, empty, or unreadable `applies_to`** is not a wildcard. brain-core's
schema treats it as invalid — a clause governing everything says so explicitly —
so reading it as blanket coverage grants eligibility nobody signed. It must not
simply be dropped either: an elevated clause sits in the signed document and the
gate cannot tell what it governs. So it fails closed, suppressing the whole gate
rather than contributing or lowering any limit.

The asymmetry is the rule worth remembering: **a wildcard may expand what is
eligible; a clause we cannot read may only remove.**

**Why:** the same field is read by two functions with different jobs — one
describes what a policy covers, one gates a money-moving checkbox. Iterating the
scope list literally drops a blanket clause entirely, so a two-approver line that
applies to everything silently vanishes while a laxer per-category clause still
sets a limit. Treating every category-less shape as a wildcard fixes that but
overshoots in the other direction, granting coverage for a shape the schema
rejects. Both failures were confirmed live by injecting clauses into the policy
response while leaving proposals and rules real: dropping them offered nine
single-approver rows under a policy that permits none; over-granting made a
policy whose only clause was unscoped behave exactly like a signed wildcard.

**How to apply:** any new reader of clause scope must decide *explicitly* what
each shape means for its own purpose, and must check the shape against
brain-core's schema rather than against what the DSL happens to tolerate. For a
gate, mirror the VM where the VM is clear and fail closed where the document is
invalid. The describer and the gate are not required to agree on every input —
forcing them to agree is itself a bug; each must be wrong in the safe direction
for its own job.
