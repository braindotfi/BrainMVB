---
name: Theming by token remap
description: What a CSS-variable remap can and cannot express when adding a second theme to a shipped dark-only UI, and which guards actually catch the gaps.
---

Adding a light theme to a shipped dark UI works best as **a scope class that
redefines variables**, with the legacy palette re-pointed onto a semantic layer
so already-built components inherit the theme without being rewritten. Declare
the semantic tokens on `:root` holding the *current* values first — then
adopting a token anywhere is a visual no-op, and only entering the scope
changes anything.

That much is mechanical. The parts that are not:

## A remap is a substitution; some places need a decision

A token swap can express "this colour becomes that colour". It cannot express
"and also invert". Any control that uses a status pair **the other way round**
from its container — bright ground with tint ink, where the surrounding row is
tint ground with bright ink — silently becomes a loud saturated slab in the new
theme, because the remap faithfully substitutes both halves.

Symptoms: a small pill or count badge that looked like a control in the original
theme turns into the loudest element on the screen, and/or its punched-out ink
lands under the contrast floor.

**How to apply:** give inverted pairs their own named token pair that is a no-op
in the original theme and re-decided in the new one. Look for them by searching
for a status token used as a *background* and checking what its text token is —
if the text is the other half of the same pair, it is inverted.

## A modal inside a themed subtree must portal out or be themed

Half-pinning is the one option that cannot work: pinning the modal's surface
hex to keep it "unchanged" leaves its tokenised text and buttons inheriting the
new theme, so you get new-theme ink on old-theme card. Portalled dialogs
(Radix `Portal`, `createPortal`) escape a themed subtree for free and stay
correct with no work; hand-rolled inline modals must be made to portal.

**Why:** the containment requirement is usually stated as "don't touch the
modals", which sounds like a *do nothing* instruction and is actually a
structural one.

## Scan the transitive import closure, never a hand-written file list

A "every legacy token this screen uses is remapped or explicitly exempt" guard
is the highest-value check, because the remap is a *closed* mapping over an
*open* set of tokens — adding a new one later fails silently and renders
near-invisible rather than erroring.

But listing the screen's files by hand defeats it. A hand list passes green
while something several imports deep has no value at all. Walk the entry
points' `@/` imports transitively and scan everything reachable — then adding
an import automatically widens the check.

**Guard the walk itself** (assert a minimum closure size and that it reaches a
known deep module). Otherwise a broken path resolver shrinks the closure back
to the entry points and the check starts passing for the wrong reason.

## Palette-level assertions cannot see usage errors

Asserting the tint/ink pairs are correct is not the same as asserting they are
*used* the right way round. Pair the palette test with a source scan of the
closure that fails any status token painted as a background which resolves to a
dark ground. Exempt wholly-portalled modals — and verify each exemption really
portals, or it is just a comment.

## Report the contrast, don't silently fix the handoff

Compute the real ratios for every ink against every surface. When a supplied
token misses AA (a "faint"/tertiary ink usually will), leave it at the handoff
value and flag it with the measured number and the specific element that uses
it. Silently darkening a designer's token hides the decision; asserting a floor
you invented hides it twice.
