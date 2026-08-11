---
name: Proving a UI section a thin tenant cannot exercise
description: How to prove rendering rules for a surface whose triggering data a fresh tenant never has, without writing to the tenant or trusting a unit-test fixture.
---

# Proving a UI section a thin tenant cannot exercise

A freshly provisioned demo tenant is a **thin** tenant. Some surfaces key off
data it simply never has — e.g. a section that only appears when an agent run
has stalled. You cannot conjure one without actually breaking an agent, and a
unit-test fixture proves the parser, not the page.

**Supply the witness by intercepting the READ.** Route-intercept the feed the
page fetches, call through to the real endpoint, and append one synthetic record
to the response on its way to the browser.

This proves what a fixture cannot — live query wiring, parser, row model, and
the section's rules all holding together in the real page — while writing
nothing: the tenant is untouched and the harness's write guard still passes.

**Why:** the alternative is shipping a section that has never once rendered.

**How to apply:**
- Use the raw id spellings the upstream actually emits, so known gaps (e.g.
  unresolved ids) stay visible instead of being accidentally faked.
- Keep it clearly separated from the real-data pass, and keep reporting the
  real-data check as a **SKIP**. An injected witness proves the rendering rules;
  it does not prove the tenant has such data.
- A section that is genuinely absent must be reported as unproven, never graded
  green by a check that quietly degenerates to `0 === 0`.
