---
name: Migrating many call sites onto a design primitive
description: The "don't guess — leave it and report" instruction that turns a bulk migration's leftovers into the spec gap, plus what must be stated up front.
---

# Leftovers are the spec, not the residue

When fanning a migration out to parallel agents (N files → one shared primitive), the single
most valuable instruction is:

> If you meet a value that maps to NO variant, do **not** guess. Leave that call site
> unmigrated and report the raw value.

Round one then comes back with a list of "unmappable" colours. That list **is** the missing
part of the design spec. In the button migration it revealed that the palette has two
families — a *tonal* one (dark tinted fill + bright tinted text) and a *solid* one (bright
fill + white text) — and that the proposal had only described the tonal family. The solid
purple was the app's real primary CTA and would otherwise have been silently flattened into
the tonal variant across the auth and onboarding screens.

Resolve the reported values centrally against the token file, then send round two as a
follow-up to the *same* agents so they keep their file context.

**Why:** an agent told to "use your judgement" will map a near-miss colour and the drift
becomes invisible. An agent told to stop and report produces a diff-able gap list.

## State these up front or they will be got wrong

- **What is NOT in scope.** Clickable rows, tabs, chips, toggles, menu items and text links
  are not buttons. Without an explicit exclusion list, agents migrate rows and the rows get
  worse. Give the test, not just the list: *forcing a row onto a button primitive makes the
  row worse.*
- **Native form submit.** A bare `<button>` inside a `<form>` defaults to `type="submit"`;
  most primitives default to `type="button"`. Migrating silently kills form submission unless
  callers pass `type="submit"`. Say so explicitly and verify afterwards.
- **Icon normalisation is a visual change.** A base rule like `[&_svg]:size-4` rewrites every
  nested glyph. Call sites with 18px or 24px artwork will change appearance; decide whether
  that is intended before dispatching, and exempt icon-only controls whose square is not one
  of the standard sizes.
- **Near-duplicate tokens are drift.** Two greys five units apart are not two intents. Fold
  them, and say which one wins, or each agent will preserve whichever it found.
