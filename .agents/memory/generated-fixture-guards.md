---
name: Guarding generated binary fixtures (PDF/XLSX)
description: Why generated PDFs and spreadsheets can't be hash-pinned, the tautological-assertion trap, and how to read facts back out of a generated PDF.
---

## Generated PDFs and XLSX are not byte-reproducible, so don't build a hash manifest

Pinning creation timestamps is not enough. PDFKit writes a **random `/ID`** into every
document, and ExcelJS stamps **wall-clock timestamps onto the zip entries** (independent of
`workbook.created`). Regenerating an unchanged document therefore still yields a new
SHA-256. Verified empirically: two consecutive generator runs differ in exactly those bytes.

**Why:** a checksum manifest over generated artifacts goes red on every regeneration, gets
"fixed" by pasting in the new hashes, and stops meaning anything.

**How to apply:** exact-hash pinning is only meaningful for files that are **vendored** —
copied in and never regenerated. For generated artifacts, assert *content invariants*
instead (parse the XLSX with ExcelJS; assert the relationships that make the bundle
coherent). Whatever guard you write, prove it is not vacuous by mutating each artifact and
confirming the matching assertion fails.

## No PDF text extractor is available in-process

The project depends on `pdfkit`, which only *writes*. There is no pypdf/pdfjs/pdf-parse.
`pdftotext` (poppler) IS installed and is the reliable way to read a PDF from the shell, but
it is a system binary a test should not depend on.

**How to apply:** if a generated PDF ever needs a content guard, have the generator mirror
the key figures into the PDF's `/Keywords` info string. PDFKit serialises it as a plain
ASCII PDF string in an indirect object, so a test can pull it out of the committed bytes
with a regex and no dependency. This beats a sidecar JSON, which regenerates in lockstep
with the document it claims to describe and so cannot detect substitution.

## Don't assert a value against a definition it was derived from

If `x` is *defined* as `TARGET - a - b`, then asserting `x + a + b === TARGET` restates the
definition and can never fail, however wrong the model becomes.

**Why:** a reconciliation suite full of such checks looks thorough and detects nothing. Seen
with a payroll model: total federal withholding was solved backwards from a bank statement's
remittance debit, then "verified" by adding its own components back.

**How to apply:** assert against an **independently derived** quantity, or against a bound
that real drift would break (e.g. the per-employee banded rates must nearly explain the
remittance on their own, and no individual withholding may fall outside a believable
percentage of gross). When a figure genuinely is solved backwards, say so in a comment and
name the tautology you deliberately did not write.
