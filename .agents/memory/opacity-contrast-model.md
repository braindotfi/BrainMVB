---
name: measuring contrast on opacity-dimmed controls
description: Why opacity-based disabled states have a hard contrast ceiling, and why disabled controls are exempt from WCAG anyway.
---

# `opacity` moves BOTH sides of the contrast ratio

The intuitive model — "opacity fades the label, so compare the faded label to the button fill" —
is wrong and produces numbers that are too optimistic.

`opacity` on an element fades **the whole element**, label *and* fill together, toward whatever is
painted behind it. So the correct measurement is:

```
label_effective = a*label + (1-a)*page_behind
fill_effective  = a*fill  + (1-a)*page_behind
ratio           = contrast(label_effective, fill_effective)
```

**Consequence — there is a hard ceiling.** Fading both sides can only ever *reduce* contrast from
the enabled ratio. If the enabled state is 3.4:1, no opacity value will reach 4.5:1. Before
proposing "raise the opacity to fix contrast", compute the enabled ratio first: that is the best
the control can ever do, and if it is already under the target the opacity knob cannot get there.
The fix is the token, not the opacity — and changing the token changes the enabled state too, so
it is a design decision, not an accessibility patch.

**Do not eyeball or approximate these numbers.** Both figures quoted from intuition in this repo
were wrong in the same optimistic direction. Compute them.

## Disabled controls are formally exempt
WCAG 2.2 **SC 1.4.3 (Contrast Minimum)** excludes "text ... that is part of an inactive user
interface component"; **SC 1.4.11 (Non-text Contrast)** carries the same exemption. A disabled
control has *no* contrast requirement.

**Why this matters:** it is a real, citable answer to "this is only 2:1", not a dodge — and the
dimness is the affordance. A disabled control rendered at full enabled contrast stops reading as
disabled. The exemption does **not** extend to muted-but-active text, which is a genuine failure
worth tracking separately.

**How to apply:** when challenged on a dim-state ratio, give the measured number, the enabled
ceiling, and the exemption. Reserve real remediation effort for *active* low-contrast copy.
