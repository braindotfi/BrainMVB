---
name: Deriving a gradient stroke from a Figma export
description: How to recover a real gradient border when the Figma MCP flattens it, and how to prove the CSS matches.
---

# Deriving a gradient stroke from a Figma export

The Figma MCP flattens a gradient stroke into a single colour: it will hand back
something like `border-[1.4px] border-[rgba(255,149,0,0.7)]` for a border that is
actually a corner-to-corner gradient. That generated value is not evidence of
anything. Screenshot the node instead and measure it.

**The measurement**

1. `getScreenshot` the node at scale 1 and note the returned pixel size.
2. Find the artwork's real bounds inside that PNG by scanning for its fill — do
   not assume the frame starts where the padding suggests. An off-by-one crop
   samples the page background on one edge and produces a profile that
   contradicts itself, which reads convincingly like "the gradient runs the other
   way".
3. Walk the perimeter. At each sample, estimate the local backdrop by fitting a
   line through pixels 5–16 deep (the card's own glow is not flat) and extrapolating
   to the edge, then take `alpha = (edge - backdrop) / (255 - backdrop)`.
4. Project each sample onto the gradient axis to get its `t`, and read the stop
   profile off the resulting curve.

**CSS equivalence:** `linear-gradient(to bottom right, …)` is *not* `135deg` for a
non-square box. `to bottom right` reproduces Figma's normalized corner-to-corner
gradient exactly, because both place the other two corners at exactly 50%.

**Proving the implementation matches:** re-measure the rendered result with the
same probe and compare profiles sample by sample. Two traps:

- Screenshot the render as **PNG**, never JPEG. A 1px bright border line is
  exactly what 8×8 DCT smears, and the loss biases every alpha low — enough to
  look like a systematic implementation error. With PNG the same comparison went
  from RMS 0.16 to 0.069.
- Playwright is not installed here, but nix chromium takes `--headless=new
  --screenshot=out.png --window-size=W,H --virtual-time-budget=6000`, which is
  lossless and needs no dependency.

**Expect residual disagreement.** A real Figma corner gradient does not satisfy a
single CSS linear gradient on all four edges: in the mid band the reference's
left/right edges read several points brighter than its top/bottom edges at the
same `t`. Land the stops between the two rather than chasing one edge.
