---
name: Design-token scan (where it lives, what it can't see)
description: The token enforcement scan is a vitest source-scan in client/src, not CI tooling — plus why its raw-hex rule deliberately refuses to classify.
---

# Where the scan lives

Design-token enforcement is a **vitest source-scan at `client/src/design-tokens.test.ts`**, run by
`npm test`. It reads the app's own `.tsx` files as text and asserts on what it finds.

It is not in `scripts/`, not in `.github/`, and not referenced by name in CLAUDE.md's rules.

**Why this matters:** searching `scripts/`, `.github/` and CLAUDE.md for a lint/CI job finds nothing
and looks like proof that no enforcement exists. It is not. Grepping the *test* files for the
colour or token being enforced also finds nothing, because the scan asserts "is this a token at
all?" rather than naming any specific value.

**How to apply:** before telling anyone a design-rule guard doesn't exist, search the whole source
tree for the *rule's shape* (`hex`, `radius`, `token`, `tailwind.config` reads in a test), not for
CI config or for the literal value. A missing guard is a strong claim; a failed grep in three
directories is not evidence for it.

# What it cannot see

Two blind spots are structural, documented in the file's own header, and worth knowing before
assuming a class of bug is already covered:

- **Inline `style={{}}` objects are invisible to the #131 rules.** They read class strings only.
- **Role misuse passes by design.** `text-brain-v1baby-blue-30` is a *correct* reference to a real
  token, so "this token is a border colour and must never paint text" is a question the base rules
  cannot ask. That needed its own rule.

So "the token scan is green" never means "this colour is used correctly".

# A guard that classifies fails open

The raw-hex rule pins **every** occurrence of the hex per file — including the strokes, ring
colours and dot fills that are perfectly legitimate — rather than trying to count only the ones
painting text.

**Why:** the first version classified each occurrence by looking backwards for the nearest
`color:` / `stroke` / `background` / `border` marker. Review found two shapes it misreads, and both
misread in the same direction: a *text* site judged non-text drops out of the count, the count then
matches its frozen baseline, and the check passes while the bug ships. A guard whose errors are
invisible is worse than a blunt one, because it also stops anyone looking.

The general rule: **inside a guard, prefer over-counting to classifying.** Make the author declare
an exception by hand. The cost is a little friction on legitimate additions; the benefit is that
the failure mode is a loud false positive instead of a silent false negative.

**How to apply:** any time a check contains a heuristic deciding *whether a match counts*, ask what
happens when the heuristic is wrong. If wrong means "silently green", drop the heuristic and count
everything, or add a self-check that fails loudly when the classifier breaks.

# Ratchets

New rules land against existing violations as **per-file counts that may only shrink**, with the
already-fixed files additionally pinned at zero by name. Per-file rather than `file:line`, because
line numbers churn on unrelated edits — the accepted gap is that a remove-plus-add inside one file
nets out invisibly.

Never raise a baseline to make a failure go away. That is the one move that turns a ratchet back
into a comment.
