---
name: Guarding generated binary fixtures (PDF/XLSX)
description: Why generated PDFs and spreadsheets can't be hash-pinned, how to guard them on content instead, and the tautological-assertion trap.
---

## Generated PDFs and XLSX are not byte-reproducible, so don't build a hash manifest

Pinning creation timestamps is not enough. PDFKit writes a **random `/ID`** into every
document, and ExcelJS stamps **wall-clock timestamps onto the zip entries** (independent of
`workbook.created`). Regenerating an unchanged document therefore still yields a new
SHA-256.

**Why:** a checksum manifest over generated artifacts goes red on every regeneration, gets
"fixed" by pasting in the new hashes, and stops meaning anything. The check has to be
something a regeneration does not disturb.

**How to apply:** hash-pin only files that are **vendored** (copied in, never regenerated) —
for those an exact SHA-256 is correct and is usually the check that actually matters. Guard
generated artifacts on their *content invariants* instead: parse the XLSX with ExcelJS and
assert the relationships that make the bundle coherent. Verify the guard is not vacuous by
mutating each artifact and confirming the corresponding test fails.

## No PDF text extractor is available in-process

The project depends on `pdfkit`, which only *writes*. There is no pypdf/pdfjs/pdf-parse, and
`pdftotext` is a system binary that a test cannot rely on.

**How to apply:** when a generated PDF needs a content guard, have the generator mirror the
key figures into the PDF's `/Keywords` info string. PDFKit serialises it as a plain ASCII
PDF string in an indirect object, so a test can pull it straight out of the committed bytes
with a regex — no dependency. This reads the real file, so substituting a different PDF is
caught; a sidecar JSON would not catch it, because it regenerates in lockstep with the
document it claims to describe.

## Don't assert a value against a definition it was derived from

If `x` is *defined* as `TARGET - a - b`, then asserting `x + a + b === TARGET` restates the
definition and can never fail, however wrong the model becomes.

**Why:** a reconciliation suite full of such checks looks thorough and detects nothing. This
happened with a payroll remittance: total federal withholding was solved backwards from the
bank statement's remittance debit, then "verified" by adding its own components back.

**How to apply:** assert against an **independently derived** quantity. For the payroll case
the real invariants were that the per-employee banded rates nearly explain the remittance on
their own (bound the residual plug) and that no individual withholding lands outside a
believable percentage of gross. When a figure genuinely is solved backwards, say so in a
comment naming the tautology you deliberately did not write.
