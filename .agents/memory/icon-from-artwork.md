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

**Environment trap:** a headless-Chromium canvas cannot decode a `file://`
image — it fails with "The source image cannot be decoded." Read the file in
Node and pass it into `page.evaluate` as a base64 data URI instead.
