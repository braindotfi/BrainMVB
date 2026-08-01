---
name: When an admin-override merge is allowed on main
description: The repo owner's standing rule for bypassing main's review requirement, and the change categories that always need a real reviewer
---

`main` enforces review, and the classic PAT can override it with
`gh pr merge --admin`. The owner's standing rule for when that is acceptable:

**Bypass-eligible** — may be admin-merged once CI is green:

- docs, memory notes, and other non-shipping text
- *presentation* of already-reviewed logic: styling, copy, layout

**Never bypassed by default** — needs a real reviewer, or an explicit, deliberate
bypass decision from the owner (asking and getting a yes; not silence, and not
"it's small"):

- proposal tiering / classification logic
- the bulk-approve gate, or any reading of a policy threshold
- anything that decides what is auto-approved versus what needs a second signer

**Why:** the line is not docs-versus-code — it is "could this change what the
product decides about money or about a second pair of eyes". A styling-only change
to an already-reviewed surface cannot; a two-line change to how a threshold is
read can, and that category is precisely where an unreviewed merge is worst. The
rule names the standard the preceding PRs were already held to.

**How to apply:** classify by what the change can affect, not by its size or file
type. If it is genuinely unclear which side a change falls on, ask — the owner has
said explicitly that asking is cheaper than guessing wrong here. CI green is a
precondition, never a substitute: `--admin` is not a way past a failing or
unreviewed check.
