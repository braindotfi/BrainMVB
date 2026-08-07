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

The user-facing name for this is **Payables** (paired with a planned Receivables tab); it
shipped briefly as "Obligations". The data layer deliberately keeps brain-core's
`obligation` vocabulary — endpoint, `RawObligation`, `payableObligations` — so the code
still says which feed it reads. Don't "finish" the rename into the data layer.

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

## The two feeds carry the SAME bills — dedupe on identity, and count them

Every AP invoice also exists as a `type: "bill"` obligation. A surface that lists both
feeds double-counts every bill; one that sums both doubles the debt.

**Why:** brain-core exposes **no invoice reference on an obligation** — `source_ids`
point at the raw *document*, not the invoice — so there is no join key. The only usable
match is the debt itself: counterparty + amount + due day (day resolution, because the
two feeds carry the same instant at different precision).

**How to apply:** match on debt identity, and hold a **count** per identity rather than a
presence flag, so one invoice cancels exactly one obligation. With a set, a tenant owing
the same counterparty the same amount on the same day twice — one invoiced, one not —
loses the second debt from the list. Never dedupe by excluding `type === "bill"` instead:
kinds are open-ended, and a bill obligation with no invoice behind it is a real debt.
Prefer keeping the *invoice* row where they collide — it carries the invoice number and
the detail popup; the obligation carries neither. A missed match over-reports (visible,
safe); a wrong match hides money (silent, not safe).

## Receivables have no endpoint, and "not AP" is not "AR"

There is **no `/ledger/receivables`** — the api-surface artifact contains zero mentions of
"receivable". AR invoices come back from `/ledger/invoices` mixed in with AP, and there is
**no positive AR marker**: AP rows carry `metadata.scenario === "ap"` and AR rows carry no
scenario at all, so AR is only reachable by negation.

**Why:** negation makes every future metadata shape an AR row by default. The feed is
already heterogeneous — seeded `AR-*` rows have empty metadata, extracted ones carry
`metadata.document_upload.object_type: "ar_aging"`, and at least one row's
`invoice_number` is a raw document id, a data-quality artifact.

**How to apply:** an overdue *count* can tolerate the negative filter (it already does),
but a **running total** labelled "receivables" cannot — it silently absorbs anything new
that is not AP. Also note the invoice list caps at 20 rows by default with no cursor; pass
an explicit high `limit` (the BFF forwards it) or a larger tenant's total will be short.

## Obligation kinds are open-ended

Observed: `bill`, `payroll`, `tax` — and the set grew mid-session. Never allow-list kinds;
filter only on receivable and settled, and keep user-facing copy generic ("everything you
still owe") rather than enumerating kinds that will drift.
