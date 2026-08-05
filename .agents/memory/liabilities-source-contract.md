---
name: Liabilities source contract
description: Why "what we owe" reads the obligations feed and never the invoice feed, and the three traps that make this easy to regress.
---

# "What we owe" comes from obligations, never invoices

The invoice feed carries **no payroll and no tax records** — only `metadata.scenario`
AP/AR rows, with no `type` field at all. Any liabilities figure derived from it silently
omits accrued payroll and tax. On the reference tenant that was a ~26% understatement.

**Why:** the original invoice-based scoping was never an accounting decision to exclude
payroll — it was a side effect of the source chosen. The author's own reasoning
enumerated loan and line_of_credit *accounts* as the only other candidates and never
considered obligations. Accrued payroll and tax are genuine current liabilities, so
including them makes the figure more correct, not less.

**How to apply:** every surface quoting a "liabilities" / "what you owe" total must read
the obligations feed through the one shared module. If you find a new surface summing
invoices to get a total owed, that is the bug, not a variant.

## Trap 1 — the payable filter fails OPEN

`?direction=payable` works, but a bogus or renamed value returns an **empty list with
HTTP 200**, not an error. A server-side filter therefore turns a renamed param into a
confident "you owe nothing". Filter payable/receivable **client-side** instead. The
rows carry `direction: null` in practice; the payable/receivable hint rides on `type`.

## Trap 2 — the raw obligation type is fully permissive

`RawObligation` is `{ [K in keyof Obligation]?: unknown }`. Invoice rows satisfy it
structurally, so passing invoices to a function expecting obligations **type-checks
cleanly**. TypeScript cannot catch a surface being repointed at the wrong feed. Guard
cross-surface agreement with a source-level test that asserts which endpoint each
surface queries — a unit test comparing two calls to the same function is tautological
and catches nothing.

## Trap 3 — money fields and lossy coercion

Two ways a real debt silently becomes zero:
- A string-only coercion helper discards a **number** on the wire and falls back to "0".
- `Number("")` is `0`, not `NaN`, so a blank amount renders as a real "$0.00".

Both are the false-all-clear pattern. Reject blank/absent explicitly; accept both string
and numeric amounts. Amounts arrive as decimal strings with eight trailing places, so a
row must format through `Number` or it renders "$4,800.00000000".

## Obligation kinds are open-ended

Observed: `bill`, `payroll`, `tax` — and the set grew mid-session. Never allow-list kinds;
filter only on receivable and settled, and keep user-facing copy generic ("everything you
still owe") rather than enumerating kinds that will drift.
