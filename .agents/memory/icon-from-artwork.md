---
name: Authoring an SVG icon from supplied artwork
description: Measure the reference PNG's pixel runs to derive stroke widths and glyph positions; eyeballing an upscaled bitmap misleads.
---

When re-authoring supplied bitmap artwork as an SVG, **measure it**, do not
compare by eye.

**Why:** an upscaled PNG shown next to a crisp SVG is dominated by the
bitmap's antialiasing halo. A side-by-side render suggested the glyph was badly
wrong when the stroke widths were already correct and only the vertical
positions were off by a fraction.

**How to apply:** decode the PNG to pixels and report, at the icon's native
size:

- the opaque bounding box (gives outer diameter);
- the runs of opaque pixels along the centre row and centre column (a ring
  yields two runs per axis, so run width = stroke weight, and the gap between
  them = inner diameter);
- for a knocked-out glyph, threshold on the knockout colour and split the rows
  into vertical segments — that separates a stem from its dot and gives each
  one's exact bbox.

Then convert: a run of N pixels at 32px artwork is N/2 units in a 16-viewBox.
Remember round line caps extend a path by half the stroke weight at each end,
so the path's `d` must be shorter than the span you measured.

## A supplied active/inactive pair may not share a canvas

An export that carries a drop shadow comes out on a larger canvas than its plain
counterpart even though the glyph itself occupies identical pixels. Sizing both
states to the same square icon box then squashes the shadowed one, and centring
them makes the glyph jump on selection.

**Why:** the shadow is canvas padding, not artwork, so only the glyph's origin
is comparable between the two files.

**How to apply:** measure both bounding boxes first. If the glyph bboxes match,
pin each state to its OWN natural size at a common scale (half of a 2x export)
and position both from the same top-left origin inside a relatively-positioned
box, letting the shadow spill. Verify by reading back each state's rendered
bounding box — the x/y must be identical and only the shadowed state's
width/height should differ.

**Environment trap:** a headless-Chromium canvas cannot decode a `file://`
image — it fails with "The source image cannot be decoded." Read the file in
Node and pass it into `page.evaluate` as a base64 data URI instead.
