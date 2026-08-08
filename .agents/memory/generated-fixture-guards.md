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


## A check must prove it can fail

Before trusting a green run, ask what it would take for it to go red *on this
data*. Two shapes recur, and both printed ALL CHECKS PASSED while asserting
nothing:

- a per-record loop that `continue`s when it cannot locate the record. The skip
  path is silent, and it triggers exactly when the fix under test changes what
  is on screen -- so the assertion dies at the moment it becomes relevant.
- a population assertion on a dataset containing no instance of the thing being
  guarded (`0 bad rows out of 0 candidates`).

**Why:** a suite whose strongest assertion never executed is worse than no
suite, because it is quoted as evidence. This bit twice in one sitting: once
skipping past an unresolvable name, once nearly filing a bug from filter logic
after checking a default tab that hid the record.

**How to apply:** gate the run on a *witness* -- assert first that the data
contains a record the OLD (buggy) rule would have gotten wrong, and only then
assert the new behaviour. If no witness exists, say NOT PRODUCIBLE out loud
instead of banking the tick. Never let a lookup miss turn into a skip: an
unlocatable record is a failure or an explicit, reasoned exclusion, never a
`continue`. And prefer a population count over a text-window "per-row" check
that only looks rigorous -- a +/-200 character slice is not a row association.
